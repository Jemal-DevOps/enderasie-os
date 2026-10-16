import { Router, Response } from "express";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db, materialRequests, projects, auditLog } from "@enderasie/database";
import { requireAuth, AuthRequest } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { requireProjectScope, requireRequestScope } from "../middleware/scope.js";
import { asyncHandler } from "../lib/asyncHandler.js";

const router = Router();

// Type inferred from the schema — kills every `as any` (fixes ሐ)
type RequestStatus = typeof materialRequests.$inferSelect["status"];

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

// LIST (tenant-scoped, async-safe)
router.get("/", requireAuth, asyncHandler(async (req: AuthRequest, res) => {
  const rows = await db
    .select({
      id: materialRequests.id,
      title: materialRequests.title,
      status: materialRequests.status,
      estimatedCost: materialRequests.estimatedCost,
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
}));

// CREATE — insert + audit in ONE atomic transaction (fixes ሀ)
router.post("/", requireAuth, requireProjectScope, requirePermission("material.create"),
  asyncHandler(async (req: AuthRequest, res) => {
    const parsed = createRequestSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

    const created = await db.transaction(async (tx) => {
      const [row] = await tx.insert(materialRequests).values({
        projectId: parsed.data.projectId,
        requestedBy: req.user!.userId,
        title: parsed.data.title,
        description: parsed.data.description,
        estimatedCost: parsed.data.estimatedCost,
        status: "draft",
      }).returning();

      await tx.insert(auditLog).values({
        tenantId: req.user!.tenantId,
        actorId: req.user!.userId,
        entityTable: "material_requests",
        entityId: row.id,
        action: "create",
        before: null,
        after: { status: "draft", title: row.title },
        ip: req.ip,
      });
      return row;
    });

    res.status(201).json({ message: "Draft created", request: created });
  })
);

// STATE MACHINE v3 — atomic CAS + audit in one transaction (fixes ሀ + ለ + ሐ + መ)
type TransitionOpts = {
  from: RequestStatus;
  to: RequestStatus;
  permission: string;
  action: string;
  requireReason?: boolean;
};

function makeTransitionRoute(opts: TransitionOpts) {
  return [
    requireAuth,
    requireRequestScope,
    requirePermission(opts.permission),
    asyncHandler(async (req: AuthRequest, res: Response) => {
      const reason = req.body?.reason as string | undefined;
      if (opts.requireReason && (!reason || reason.trim().length < 3)) {
        return res.status(400).json({ error: "A reason (min 3 chars) is required for corrections" });
      }

      const request = await loadRequest(req.params.id, req.user!.tenantId);
      if (!request) return res.status(404).json({ error: "Request not found" });
      if (request.status !== opts.from) {
        return res.status(409).json({ error: `Invalid transition: request is '${request.status}', expected '${opts.from}'` });
      }

      const updated = await db.transaction(async (tx) => {
        // COMPARE-AND-SWAP: if a concurrent request already moved this row,
        // the WHERE matches zero rows and the loser gets null -> 409.
        const [row] = await tx
          .update(materialRequests)
          .set({ status: opts.to, reason: reason ?? request.reason, updatedAt: new Date() })
          .where(and(eq(materialRequests.id, request.id), eq(materialRequests.status, opts.from)))
          .returning();

        if (!row) return null;

        await tx.insert(auditLog).values({
          tenantId: req.user!.tenantId,
          actorId: req.user!.userId,
          entityTable: "material_requests",
          entityId: request.id,
          action: opts.action,
          before: { status: request.status },
          after: { status: row.status, reason: reason ?? null },
          ip: req.ip,
        });
        return row;
      });

      if (!updated) {
        return res.status(409).json({ error: "Conflict: this request was already moved by another user. Refresh and retry." });
      }
      res.json({ message: `Status moved to ${updated.status}`, request: updated });
    }),
  ];
}

router.post("/:id/submit",  ...makeTransitionRoute({ from: "draft",        to: "submitted",         permission: "material.submit",          action: "submit" }));
router.post("/:id/verify",  ...makeTransitionRoute({ from: "submitted",    to: "eng_verified",      permission: "material.verify_eng",      action: "verify_eng" }));
router.post("/:id/approve/pm", ...makeTransitionRoute({ from: "eng_verified", to: "pm_approved",    permission: "material.approve_pm",      action: "approve_pm" }));
router.post("/:id/procure", ...makeTransitionRoute({ from: "procurement_pending", to: "store_issued", permission: "material.procure",       action: "procure_shortage" }));
router.post("/:id/close",   ...makeTransitionRoute({ from: "store_issued", to: "delivered",         permission: "material.review_issuance", action: "supervisor_close" }));
router.post("/:id/void",    ...makeTransitionRoute({ from: "draft",        to: "voided",   permission: "material.submit",      action: "void",   requireReason: true }));
router.post("/:id/return",  ...makeTransitionRoute({ from: "store_issued", to: "returned", permission: "material.issue_stock", action: "return", requireReason: true }));

// SPLIT FULFILLMENT — atomic CAS issue + audit (fixes the double-issuance race)
router.post("/:id/issue", requireAuth, requireRequestScope, requirePermission("material.issue_stock"),
  asyncHandler(async (req: AuthRequest, res) => {
    const parsed = issueSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

    const request = await loadRequest(req.params.id, req.user!.tenantId);
    if (!request) return res.status(404).json({ error: "Request not found" });
    if (request.status !== "pm_approved") {
      return res.status(409).json({ error: `Invalid transition: request is '${request.status}', expected 'pm_approved'` });
    }

    const { issuedQty, shortQty } = parsed.data;
    const nextStatus: RequestStatus = shortQty > 0 ? "procurement_pending" : "store_issued";

    const updated = await db.transaction(async (tx) => {
      const [row] = await tx
        .update(materialRequests)
        .set({ issuedQty: String(issuedQty), shortQty: String(shortQty), status: nextStatus, updatedAt: new Date() })
        .where(and(eq(materialRequests.id, request.id), eq(materialRequests.status, "pm_approved")))
        .returning();

      if (!row) return null;

      await tx.insert(auditLog).values({
        tenantId: req.user!.tenantId,
        actorId: req.user!.userId,
        entityTable: "material_requests",
        entityId: request.id,
        action: "issue_stock",
        before: { status: request.status },
        after: { status: row.status, issuedQty, shortQty, shortage_to_procurement: shortQty > 0 },
        ip: req.ip,
      });
      return row;
    });

    if (!updated) {
      return res.status(409).json({ error: "Conflict: issue already recorded by another user. Refresh and retry." });
    }

    res.json({
      message: shortQty > 0
        ? `Partial issue recorded. Shortage of ${shortQty} sent to Procurement.`
        : "Full issue recorded.",
      request: updated,
    });
  })
);

export default router;