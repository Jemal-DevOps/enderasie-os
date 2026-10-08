import { Router, Response } from "express";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { db, materialRequests, projects, auditLog } from "@enderasie/database";
import { requireAuth, AuthRequest } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";

const router = Router();

const createRequestSchema = z.object({
  projectId: z.string().uuid(),
  title: z.string().min(3),
  description: z.string().optional(),
  estimatedCost: z.string().optional(),
});

const issueSchema = z.object({
  issuedQty: z.coerce.number().min(0),
  shortQty: z.coerce.number().min(0),
  reason: z.string().optional(),
});

async function loadRequest(id: string, tenantId: string) {
  const [request] = await db.select().from(materialRequests).where(eq(materialRequests.id, id));
  if (!request) return null;
  const [project] = await db.select().from(projects).where(eq(projects.id, request.projectId));
  if (!project || project.tenantId !== tenantId) return null;
  return request;
}

async function writeAudit(req: AuthRequest, entityId: string, action: string, before: any, after: any) {
  await db.insert(auditLog).values({
    tenantId: req.user!.tenantId,
    actorId: req.user!.userId,
    entityTable: "material_requests",
    entityId,
    action,
    before,
    after,
    ip: req.ip,
  });
}

// LIST
router.get("/", requireAuth, async (req: AuthRequest, res) => {
  const rows = await db
    .select({
         id: materialRequests.id,
      title: materialRequests.title,
      status: materialRequests.status,
      estimatedCost: materialRequests.estimatedCost, // <--- ADD THIS LINE
      issuedQty: materialRequests.issuedQty,
      shortQty: materialRequests.shortQty,
      reason: materialRequests.reason,
      projectName: projects.name,
      createdAt: materialRequests.createdAt,
    })
    .from(materialRequests)
    .innerJoin(projects, eq(materialRequests.projectId, projects.id))
    .where(eq(projects.tenantId, req.user!.tenantId));
  res.json({ requests: rows });
});

// CREATE draft
router.post("/", requireAuth, requirePermission("material.create"), async (req: AuthRequest, res) => {
  const parsed = createRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const [project] = await db.select().from(projects).where(eq(projects.id, parsed.data.projectId));
  if (!project || project.tenantId !== req.user!.tenantId) {
    return res.status(404).json({ error: "Project not found in your company" });
  }
  const [created] = await db.insert(materialRequests).values({
    projectId: parsed.data.projectId,
    requestedBy: req.user!.userId,
    title: parsed.data.title,
    description: parsed.data.description,
    estimatedCost: parsed.data.estimatedCost,
    status: "draft",
  }).returning();
  await writeAudit(req, created.id, "create", null, { status: "draft", title: created.title });
  res.status(201).json({ message: "Draft created", request: created });
});

// THE STATE MACHINE v2 — every move is audited
type TransitionOpts = { from: string; to: string; permission: string; action: string; requireReason?: boolean };

function makeTransitionRoute(opts: TransitionOpts): any[] {
  return [
    requireAuth,
    requirePermission(opts.permission),
    async (req: AuthRequest, res: Response) => {
      const reason = req.body?.reason as string | undefined;
      if (opts.requireReason && (!reason || reason.trim().length < 3)) {
        return res.status(400).json({ error: "A reason (min 3 chars) is required for corrections" });
      }
      const request = await loadRequest(req.params.id, req.user!.tenantId);
      if (!request) return res.status(404).json({ error: "Request not found" });
      if (request.status !== opts.from) {
        return res.status(409).json({ error: `Invalid transition: request is '${request.status}', expected '${opts.from}'` });
      }
      const [updated] = await db.update(materialRequests)
        .set({ status: opts.to as any, reason: reason ?? request.reason, updatedAt: new Date() })
        .where(eq(materialRequests.id, request.id))
        .returning();
      await writeAudit(req, request.id, opts.action, { status: request.status }, { status: updated.status, reason: reason ?? null });
      res.json({ message: `Status moved to ${opts.to}`, request: updated });
    },
  ];
}

// The controlled 7-step route
router.post("/:id/submit",  ...makeTransitionRoute({ from: "draft",        to: "submitted",         permission: "material.submit",          action: "submit" }));
router.post("/:id/verify",  ...makeTransitionRoute({ from: "submitted",    to: "eng_verified",      permission: "material.verify_eng",      action: "verify_eng" }));
router.post("/:id/approve/pm", ...makeTransitionRoute({ from: "eng_verified", to: "pm_approved",    permission: "material.approve_pm",      action: "approve_pm" }));
router.post("/:id/procure", ...makeTransitionRoute({ from: "procurement_pending", to: "store_issued", permission: "material.procure",       action: "procure_shortage" }));
router.post("/:id/close",   ...makeTransitionRoute({ from: "store_issued", to: "delivered",         permission: "material.review_issuance", action: "supervisor_close" }));

// Corrections & endings — reason mandatory, history immortal
router.post("/:id/void",    ...makeTransitionRoute({ from: "draft",        to: "voided",   permission: "material.submit",      action: "void",   requireReason: true }));
router.post("/:id/return",  ...makeTransitionRoute({ from: "store_issued", to: "returned", permission: "material.issue_stock", action: "return", requireReason: true }));

// SPLIT FULFILLMENT — store issues what it has; only the shortage goes to Procurement
router.post("/:id/issue", requireAuth, requirePermission("material.issue_stock"), async (req: AuthRequest, res) => {
  const parsed = issueSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const request = await loadRequest(req.params.id, req.user!.tenantId);
  if (!request) return res.status(404).json({ error: "Request not found" });
  if (request.status !== "pm_approved") {
    return res.status(409).json({ error: `Invalid transition: request is '${request.status}', expected 'pm_approved'` });
  }
  const { issuedQty, shortQty } = parsed.data;
  const nextStatus = shortQty > 0 ? "procurement_pending" : "store_issued";
  const [updated] = await db.update(materialRequests)
    .set({ issuedQty: String(issuedQty), shortQty: String(shortQty), status: nextStatus as any, updatedAt: new Date() })
    .where(eq(materialRequests.id, request.id))
    .returning();
  await writeAudit(req, request.id, "issue_stock",
    { status: request.status },
    { status: nextStatus, issuedQty, shortQty, shortage_to_procurement: shortQty > 0 });
  res.json({
    message: shortQty > 0
      ? `Partial issue recorded. Shortage of ${shortQty} sent to Procurement.`
      : "Full issue recorded.",
    request: updated,
  });
});

export default router;