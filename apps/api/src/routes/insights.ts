import { Router, Response } from "express";
import { eq, sql } from "drizzle-orm";
import { db, contracts, ipcs, cashReceipts, subcontracts, subcontractPayments, payrollRuns } from "@enderasie/database";
import { requireAuth, AuthRequest } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { asyncHandler } from "../lib/asyncHandler.js";

const router = Router();
const num = (v: string | null | undefined) => parseFloat(v || "0");

router.get("/overview", requireAuth, requirePermission("insights.view"),
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const tid = req.user!.tenantId;

    // --- KPIs: Money In ---
    const [c] = await db.select({ v: sql<string>`coalesce(sum(${contracts.totalValue}),0)` }).from(contracts).where(eq(contracts.tenantId, tid));
    const [b] = await db.select({ v: sql<string>`coalesce(sum(${ipcs.approvedAmount}),0)` }).from(ipcs).innerJoin(contracts, eq(ipcs.contractId, contracts.id)).where(eq(contracts.tenantId, tid));
    const [col] = await db.select({ v: sql<string>`coalesce(sum(${cashReceipts.amount}),0)` }).from(cashReceipts).where(eq(cashReceipts.tenantId, tid));

    // --- KPIs: Money Out ---
    const [sc] = await db.select({ v: sql<string>`coalesce(sum(${subcontracts.totalValue}),0)` }).from(subcontracts).where(eq(subcontracts.tenantId, tid));
    const [po] = await db.select({ v: sql<string>`coalesce(sum(${subcontractPayments.amount}),0)` }).from(subcontractPayments).where(eq(subcontractPayments.tenantId, tid));
    const [pr] = await db.select({ v: sql<string>`coalesce(sum(${payrollRuns.totalNet}),0)` }).from(payrollRuns).where(eq(payrollRuns.tenantId, tid));

    // --- Monthly Cash-Flow Series ---
    const inflowRows = await db.select({
      month: sql<string>`to_char(${cashReceipts.receivedDate}, 'YYYY-MM')`.as("month"),
      total: sql<string>`coalesce(sum(${cashReceipts.amount}),0)`,
    }).from(cashReceipts).where(eq(cashReceipts.tenantId, tid))
      .groupBy(sql`to_char(${cashReceipts.receivedDate}, 'YYYY-MM')`);

    const outSubRows = await db.select({
      month: sql<string>`to_char(${subcontractPayments.paidDate}, 'YYYY-MM')`.as("month"),
      total: sql<string>`coalesce(sum(${subcontractPayments.amount}),0)`,
    }).from(subcontractPayments).where(eq(subcontractPayments.tenantId, tid))
      .groupBy(sql`to_char(${subcontractPayments.paidDate}, 'YYYY-MM')`);

    const outPayrollRows = await db.select({
      month: sql<string>`to_char(${payrollRuns.periodEnd}::date, 'YYYY-MM')`.as("month"),
      total: sql<string>`coalesce(sum(${payrollRuns.totalNet}),0)`,
    }).from(payrollRuns).where(eq(payrollRuns.tenantId, tid))
      .groupBy(sql`to_char(${payrollRuns.periodEnd}::date, 'YYYY-MM')`);

    // Merge into a single sorted series
    const months = new Map<string, { month: string; inflow: number; outflow: number }>();
    const bump = (m: string, key: "inflow" | "outflow", val: number) => {
      if (!months.has(m)) months.set(m, { month: m, inflow: 0, outflow: 0 });
      months.get(m)![key] += val;
    };
    inflowRows.forEach((r) => bump(r.month, "inflow", num(r.total)));
    outSubRows.forEach((r) => bump(r.month, "outflow", num(r.total)));
    outPayrollRows.forEach((r) => bump(r.month, "outflow", num(r.total)));
    const cashflow = [...months.values()].sort((a, b) => a.month.localeCompare(b.month));

    const collected = num(col.v), paidOut = num(po.v), payroll = num(pr.v);

    res.json({
      kpi: {
        contracted: num(c.v),
        billed: num(b.v),
        collected,
        subcontracted: num(sc.v),
        paidOut,
        payroll,
        netPosition: collected - paidOut - payroll,
      },
      cashflow,
    });
  })
);

export default router;