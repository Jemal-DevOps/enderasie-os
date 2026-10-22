import { Router, Response } from "express";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import { db, subcontractors, subcontracts, measurements, subcontractPayments, auditLog } from "@enderasie/database";
import { requireAuth, AuthRequest } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { requireProjectScope, requireSubcontractScope, requireMeasurementScope } from "../middleware/scope.js";
import { asyncHandler } from "../lib/asyncHandler.js";
import { jsPDF } from "jspdf";

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
    subcontractorName: subcontractors.name, trade: subcontractors.trade,
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
type ApproveOutcome =
  | { code: 200; measurement: typeof measurements.$inferSelect }
  | { code: 400 | 404 | 409; error: string };

router.post("/measurements/:id/approve", requireAuth, requireMeasurementScope, requirePermission("measurement.approve"), asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = approveMeasurementSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const outcome = await db.transaction(async (tx): Promise<ApproveOutcome> => {
    const [m] = await tx.select().from(measurements).where(eq(measurements.id, req.params.id));
    if (!m) return { code: 404, error: "Measurement not found" };
    if (m.status !== "draft" && m.status !== "submitted") return { code: 409, error: `Cannot approve measurement in status: ${m.status}` };

    const [sub] = await tx.select().from(subcontracts).where(eq(subcontracts.id, m.subcontractId));
    if (!sub) return { code: 404, error: "Subcontract not found" };

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
type PaymentOutcome =
  | { code: 200; payment: typeof subcontractPayments.$inferSelect; status: string }
  | { code: 400 | 404 | 409; error: string };

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
      return { code: 400, error: `Payment rejected: total paid (${totalPaidSoFar} + ${newPayment}) exceed net payable (${netPayable}). Retention held: ${approved * retentionPct}.` };
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

// 9. GENERATE MEASUREMENT CERTIFICATE PDF (top level — NOT nested!)
router.get("/measurements/:id/certificate", requireAuth, requireMeasurementScope, requirePermission("subcontract.view"),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const [m] = await db.select().from(measurements).where(eq(measurements.id, req.params.id));
    if (!m) return res.status(404).json({ error: "Measurement not found" });
    if (m.status === "draft" || m.status === "submitted") {
      return res.status(400).json({ error: "Cannot print certificate for an unapproved measurement" });
    }

    const [sub] = await db.select().from(subcontracts).where(eq(subcontracts.id, m.subcontractId));
    if (!sub) return res.status(404).json({ error: "Subcontract not found" });
    const [subk] = await db.select().from(subcontractors).where(eq(subcontractors.id, sub.subcontractorId));

    const doc = new jsPDF();
    const approved = parseFloat(m.approvedAmount);
    const retentionPct = parseFloat(sub.retentionPercent) / 100;
    const retentionAmount = approved * retentionPct;
    const netPayable = approved - retentionAmount;

    doc.setFontSize(20);
    doc.setTextColor(234, 88, 12);
    doc.text("ENDERASIE CONSTRUCTION PLC", 105, 20, { align: "center" });
    doc.setFontSize(14);
    doc.setTextColor(0, 0, 0);
    doc.text("SUBCONTRACTOR MEASUREMENT CERTIFICATE", 105, 30, { align: "center" });
    doc.setLineWidth(0.5);
    doc.line(20, 35, 190, 35);

    doc.setFontSize(10);
    doc.text(`Certificate No: ${m.measurementNumber}`, 20, 45);
    doc.text(`Subcontract No: ${sub.contractNumber}`, 20, 52);
    doc.text(`Subcontractor: ${subk?.name ?? "-"}`, 20, 59);
    doc.text(`Trade: ${subk?.trade ?? "-"}`, 20, 66);
    doc.text(`Date Issued: ${new Date().toLocaleDateString()}`, 130, 45);

    doc.setFontSize(12);
    doc.text("FINANCIAL SUMMARY", 20, 82);
    doc.setFontSize(10);
    doc.text(`Total Subcontract Value:`, 20, 92);
    doc.text(`${parseFloat(sub.totalValue).toLocaleString()} ETB`, 130, 92);
    doc.text(`Amount Claimed (This Measurement):`, 20, 99);
    doc.text(`${parseFloat(m.claimedAmount).toLocaleString()} ETB`, 130, 99);

    doc.setFontSize(12);
    doc.setTextColor(22, 163, 74);
    doc.text(`AMOUNT APPROVED:`, 20, 112);
    doc.text(`${approved.toLocaleString()} ETB`, 130, 112);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.text(`Less Retention (${sub.retentionPercent}%):`, 20, 122);
    doc.text(`(${retentionAmount.toLocaleString()} ETB)`, 130, 122);

    doc.setFontSize(12);
    doc.setTextColor(14, 165, 233);
    doc.text(`NET PAYABLE TO SUBCONTRACTOR:`, 20, 132);
    doc.text(`${netPayable.toLocaleString()} ETB`, 130, 132);

    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
    doc.line(20, 180, 80, 180);
    doc.text("Measured By (Site Eng.)", 20, 185);
    doc.line(130, 180, 190, 180);
    doc.text("Approved By (PM)", 130, 185);

    doc.setFontSize(8);
    doc.setTextColor(100, 100, 100);
    doc.text("This certificate is mathematically enforced by Enderasie OS. Audit ID: " + m.id, 105, 280, { align: "center" });

    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename=MC_${m.measurementNumber}.pdf`);
    res.send(pdfBuffer);
  })
);

export default router;