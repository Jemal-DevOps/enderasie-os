import { Router, Response } from "express";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import { db, subcontractors, subcontracts, measurements, subcontractPayments, auditLog } from "@enderasie/database";
import { requireAuth, AuthRequest } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { requireProjectScope, requireSubcontractScope, requireMeasurementScope } from "../middleware/scope.js";
import { asyncHandler } from "../lib/asyncHandler.js";

const router = Router();

// --- ZOD SCHEMAS ---
const createSubcontractorSchema = z.object({ name: z.string().min(1), trade: z.string().optional(), phone: z.string().optional(), email: z.string().email().optional() });
const createSubcontractSchema = z.object({ projectId: z.string().uuid(), subcontractorId: z.string().uuid(), contractNumber: z.string().min(1), scope: z.string().optional(), totalValue: z.string().regex(/^\d+(\.\d+)?$/), retentionPercent: z.string().regex(/^\d+(\.\d+)?$/).optional().default("10.00") });
const createMeasurementSchema = z.object({ measurementNumber: z.string().min(1), claimedAmount: z.string().regex(/^\d+(\.\d+)?$/), periodStart: z.string().optional(), periodEnd: z.string().optional() });
const approveMeasurementSchema = z.object({ approvedAmount: z.string().regex(/^\d+(\.\d+)?$/).optional() });
const recordPaymentSchema = z.object({ amount: z.string().regex(/^\d+(\.\d+)?$/), paidDate: z.string().optional(), reference: z.string().optional() });

// --- ROUTES ---

// 1. LIST SUBCONTRACTORS
router.get("/subcontractors", requireAuth, requirePermission("subcontractor.view"), asyncHandler(async (req: AuthRequest, res: Response) => {
  const rows = await db.select().from(subcontractors).where(eq(subcontractors.tenantId, req.user!.tenantId));
  res.json({ subcontractors: rows });
}));

// 2. CREATE SUBCONTRACTOR
router.post("/subcontractors", requireAuth, requirePermission("subcontractor.create"), asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = createSubcontractorSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const [row] = await db.insert(subcontractors).values({ ...parsed.data, tenantId: req.user!.tenantId }).returning();
  res.status(201).json({ subcontractor: row });
}));

// 3. LIST SUBCONTRACTS
router.get("/", requireAuth, requirePermission("subcontract.view"), asyncHandler(async (req: AuthRequest, res: Response) => {
  const rows = await db.select({
    id: subcontracts.id, contractNumber: subcontracts.contractNumber, totalValue: subcontracts.totalValue, retentionPercent: subcontracts.retentionPercent,
    subcontractorName: subcontractors.name, trade: subcontractors.trade, projectName: sql<string>`'Project'`, // Simplified for list
  }).from(subcontracts).innerJoin(subcontractors, eq(subcontracts.subcontractorId, subcontractors.id)).where(eq(subcontracts.tenantId, req.user!.tenantId));
  res.json({ subcontracts: rows });
}));

// 4. CREATE SUBCONTRACT
router.post("/", requireAuth, requireProjectScope, requirePermission("subcontract.create"), asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = createSubcontractSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const [row] = await db.insert(subcontracts).values({ ...parsed.data, tenantId: req.user!.tenantId }).returning();
  res.status(201).json({ subcontract: row });
}));

// 5. LIST MEASUREMENTS FOR A SUBCONTRACT
router.get("/:id/measurements", requireAuth, requireSubcontractScope, requirePermission("subcontract.view"), asyncHandler(async (req: AuthRequest, res: Response) => {
  const rows = await db.select().from(measurements).where(eq(measurements.subcontractId, req.params.id));
  res.json({ measurements: rows });
}));

// 6. CREATE MEASUREMENT (Draft)
router.post("/:id/measurements", requireAuth, requireSubcontractScope, requirePermission("measurement.create"), asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = createMeasurementSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const [row] = await db.insert(measurements).values({ ...parsed.data, subcontractId: req.params.id, tenantId: req.user!.tenantId, status: "draft", approvedAmount: "0" }).returning();
  res.status(201).json({ measurement: row });
}));

// 7. APPROVE MEASUREMENT (The Over-Measurement Guard)
type ApproveOutcome = | { code: 200; measurement: typeof measurements.$inferSelect } | { code: 400 | 404 | 409; error: string };

router.post("/measurements/:id/approve", requireAuth, requireMeasurementScope, requirePermission("measurement.approve"), asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = approveMeasurementSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const outcome = await db.transaction(async (tx): Promise<ApproveOutcome> => {
    const [m] = await tx.select().from(measurements).where(eq(measurements.id, req.params.id));
    if (!m) return { code: 404, error: "Measurement not found" };
    if (m.status !== "draft" && m.status !== "submitted") return { code: 409, error: `Cannot approve measurement in status: ${m.status}` };

    const [sub] = await tx.select().from(subcontracts).where(eq(subcontracts.id, m.subcontractId));
    if (!sub) return { code: 404, error: "Subcontract not found" };

    // CALCULATE: Total Approved So Far (excluding this measurement)
    const [sumRow] = await tx.select({ value: sql<string>`coalesce(sum(${measurements.approvedAmount}), 0)` })
      .from(measurements)
      .where(and(eq(measurements.subcontractId, sub.id), sql`${measurements.id} <> ${m.id}`, sql`${measurements.status} in ('approved', 'partially_paid', 'fully_paid')`));

    const totalApprovedSoFar = parseFloat(sumRow?.value ?? "0");
    const newApprovedAmount = parseFloat(parsed.data.approvedAmount || m.claimedAmount);
    const subcontractTotal = parseFloat(sub.totalValue);

    if (totalApprovedSoFar + newApprovedAmount > subcontractTotal) {
      return { code: 400, error: `Approval rejected: total approved work (${totalApprovedSoFar} + ${newApprovedAmount}) exceeds subcontract value (${subcontractTotal}).` };
    }

    const [row] = await tx.update(measurements).set({ status: "approved", approvedAmount: String(newApprovedAmount), updatedAt: new Date() }).where(eq(measurements.id, m.id)).returning();
    await tx.insert(auditLog).values({ tenantId: req.user!.tenantId, actorId: req.user!.userId, entityTable: "measurements", entityId: m.id, action: "approve", after: { status: "approved", approvedAmount: newApprovedAmount }, ip: req.ip });
    return { code: 200, measurement: row };
  });

  if (outcome.code !== 200) return res.status(outcome.code).json({ error: outcome.error });
  res.json({ message: "Measurement Approved", measurement: outcome.measurement });
}));

// 8. RECORD PAYMENT (The Retention-Aware Guard)
type PaymentOutcome = | { code: 200; payment: typeof subcontractPayments.$inferSelect; status: string } | { code: 400 | 404 | 409; error: string };

router.post("/measurements/:id/payments", requireAuth, requireMeasurementScope, requirePermission("subcontract.payment.record"), asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = recordPaymentSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const outcome = await db.transaction(async (tx): Promise<PaymentOutcome> => {
    const [m] = await tx.select().from(measurements).where(eq(measurements.id, req.params.id));
    if (!m) return { code: 404, error: "Measurement not found" };
    if (m.status !== "approved" && m.status !== "partially_paid") return { code: 409, error: `Measurement not payable (current: ${m.status})` };

    const [sub] = await tx.select().from(subcontracts).where(eq(subcontracts.id, m.subcontractId));
    if (!sub) return { code: 404, error: "Subcontract not found" };

    const approved = parseFloat(m.approvedAmount);
    const retentionPct = parseFloat(sub.retentionPercent) / 100;
    const netPayable = approved * (1 - retentionPct);

    const [sumRow] = await tx.select({ value: sql<string>`coalesce(sum(${subcontractPayments.amount}), 0)` }).from(subcontractPayments).where(eq(subcontractPayments.measurementId, m.id));
    const totalPaidSoFar = parseFloat(sumRow?.value ?? "0");
    const newPayment = parseFloat(parsed.data.amount);

    if (totalPaidSoFar + newPayment > netPayable) {
      return { code: 400, error: `Payment rejected: total paid (${totalPaidSoFar} + ${newPayment}) exceeds net payable (${netPayable}). Retention held: ${approved * retentionPct}.` };
    }

    const [payment] = await tx.insert(subcontractPayments).values({ measurementId: m.id, tenantId: req.user!.tenantId, amount: parsed.data.amount, paidDate: parsed.data.paidDate || new Date().toISOString().split("T")[0], reference: parsed.data.reference }).returning();
    const nextStatus = (totalPaidSoFar + newPayment) >= netPayable ? "fully_paid" : "partially_paid";
    await tx.update(measurements).set({ status: nextStatus, updatedAt: new Date() }).where(eq(measurements.id, m.id));
    await tx.insert(auditLog).values({ tenantId: req.user!.tenantId, actorId: req.user!.userId, entityTable: "subcontract_payments", entityId: payment.id, action: "record_payment", after: { amount: newPayment, status: nextStatus }, ip: req.ip });
    return { code: 200, payment, status: nextStatus };
  });

  if (outcome.code !== 200) return res.status(outcome.code).json({ error: outcome.error });
  res.json({ message: "Payment Recorded", payment: outcome.payment, status: outcome.status });
}));

export default router;