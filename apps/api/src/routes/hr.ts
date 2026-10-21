import { Router, Response } from "express";
import { eq, and, sql } from "drizzle-orm";
import { z } from "zod";
import { db, staff, timesheets, payrollRuns, payrollEntries, auditLog } from "@enderasie/database";
import { requireAuth, AuthRequest } from "../middleware/auth.js";
import { requirePermission } from "../middleware/rbac.js";
import { asyncHandler } from "../lib/asyncHandler.js";

const router = Router();

// --- ZOD SCHEMAS ---
const createStaffSchema = z.object({
  name: z.string().min(1),
  role: z.string().optional(),
  type: z.enum(["salaried", "daily"]),
  rate: z.string().regex(/^\d+(\.\d+)?$/),
  bankAccount: z.string().optional(),
});

const logTimesheetSchema = z.object({
  date: z.string(), // YYYY-MM-DD
  hours: z.string().regex(/^\d+(\.\d+)?$/),
  overtimeHours: z.string().regex(/^\d+(\.\d+)?$/).optional().default("0"),
  projectId: z.string().uuid().optional(),
});

const runPayrollSchema = z.object({
  periodStart: z.string(),
  periodEnd: z.string(),
});

// --- ROUTES ---

// 1. LIST STAFF
router.get("/staff", requireAuth, requirePermission("hr.staff.view"), asyncHandler(async (req: AuthRequest, res: Response) => {
  const rows = await db.select().from(staff).where(and(eq(staff.tenantId, req.user!.tenantId), eq(staff.status, "active")));
  res.json({ staff: rows });
}));

// 2. CREATE STAFF
router.post("/staff", requireAuth, requirePermission("hr.staff.create"), asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = createStaffSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });
  const [row] = await db.insert(staff).values({ ...parsed.data, tenantId: req.user!.tenantId }).returning();
  res.status(201).json({ staff: row });
}));

// 3. LOG TIMESHEET
router.post("/staff/:id/timesheets", requireAuth, requirePermission("hr.timesheet.create"), asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = logTimesheetSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  // Verify staff belongs to tenant
  const [s] = await db.select().from(staff).where(and(eq(staff.id, req.params.id), eq(staff.tenantId, req.user!.tenantId)));
  if (!s) return res.status(404).json({ error: "Staff not found" });

  const [row] = await db.insert(timesheets).values({
    staffId: req.params.id,
    tenantId: req.user!.tenantId,
    date: parsed.data.date,
    hours: parsed.data.hours,
    overtimeHours: parsed.data.overtimeHours,
    projectId: parsed.data.projectId,
    status: "approved", // Auto-approve for flow simplicity
  }).returning();
  
  res.status(201).json({ timesheet: row });
}));

// 4. GET TIMESHEETS FOR STAFF
router.get("/staff/:id/timesheets", requireAuth, requirePermission("hr.staff.view"), asyncHandler(async (req: AuthRequest, res: Response) => {
  const rows = await db.select().from(timesheets).where(eq(timesheets.staffId, req.params.id));
  res.json({ timesheets: rows });
}));

// 5. RUN PAYROLL (The Big Calculator with Overlap Guard)
type PayrollOutcome = 
  | { code: 200; run: typeof payrollRuns.$inferSelect; entries: number }
  | { code: 400 | 409; error: string };

router.post("/payroll/run", requireAuth, requirePermission("hr.payroll.run"), asyncHandler(async (req: AuthRequest, res: Response) => {
  const parsed = runPayrollSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json({ error: parsed.error.issues });

  const outcome = await db.transaction(async (tx): Promise<PayrollOutcome> => {
    const { periodStart, periodEnd } = parsed.data;

    // OVERLAP GUARD: Prevent double-paying the same dates
    const [overlap] = await tx.select().from(payrollRuns)
      .where(and(
        eq(payrollRuns.tenantId, req.user!.tenantId),
        sql`${payrollRuns.periodStart} <= ${periodEnd} AND ${payrollRuns.periodEnd} >= ${periodStart}`
      ));
    
    if (overlap) {
      return { code: 409, error: `Payroll run already exists for an overlapping period (${overlap.periodStart} to ${overlap.periodEnd}).` };
    }

    // Fetch active staff and approved timesheets in the period
    const activeStaff = await tx.select().from(staff).where(and(eq(staff.tenantId, req.user!.tenantId), eq(staff.status, "active")));
    
    const periodTimesheets = await tx.select().from(timesheets)
      .where(and(
        eq(timesheets.tenantId, req.user!.tenantId),
        eq(timesheets.status, "approved"),
        sql`${timesheets.date} >= ${periodStart} AND ${timesheets.date} <= ${periodEnd}`
      ));

    // Group timesheets by staffId for O(1) lookup
    const tsByStaff = new Map<string, typeof periodTimesheets>();
    for (const ts of periodTimesheets) {
      if (!tsByStaff.has(ts.staffId)) tsByStaff.set(ts.staffId, []);
      tsByStaff.get(ts.staffId)!.push(ts);
    }

    // Create the Payroll Run header
    const [run] = await tx.insert(payrollRuns).values({
      tenantId: req.user!.tenantId,
      periodStart,
      periodEnd,
      status: "draft",
      totalNet: "0",
    }).returning();

    let totalRunNet = 0;
    const entriesToInsert: (typeof payrollEntries.$inferInsert)[] = [];

    // CALCULATE PAY
    for (const s of activeStaff) {
      const staffTs = tsByStaff.get(s.id) || [];
      let basePay = 0;
      let overtimePay = 0;

      if (s.type === "daily") {
        // Daily: rate is hourly wage
        const totalHours = staffTs.reduce((sum, t) => sum + parseFloat(t.hours), 0);
        const totalOvertime = staffTs.reduce((sum, t) => sum + parseFloat(t.overtimeHours), 0);
        basePay = totalHours * parseFloat(s.rate);
        overtimePay = totalOvertime * parseFloat(s.rate) * 1.5; // 1.5x multiplier
      } else {
        // Salaried: rate is fixed monthly salary
        if (staffTs.length > 0) { // Only pay if they have timesheets (attendance proof)
          basePay = parseFloat(s.rate);
          const totalOvertime = staffTs.reduce((sum, t) => sum + parseFloat(t.overtimeHours), 0);
          // Overtime for salaried = (Monthly / 160 hrs) * 1.5
          overtimePay = totalOvertime * (parseFloat(s.rate) / 160) * 1.5; 
        }
      }

      const netPay = basePay + overtimePay;
      if (netPay > 0) {
        totalRunNet += netPay;
        entriesToInsert.push({
          payrollRunId: run.id,
          staffId: s.id,
          basePay: basePay.toFixed(2),
          overtimePay: overtimePay.toFixed(2),
          netPay: netPay.toFixed(2),
        });
      }
    }

    // FREEZE THE ENTRIES
    if (entriesToInsert.length > 0) {
      await tx.insert(payrollEntries).values(entriesToInsert);
    }

    // Update run total
    await tx.update(payrollRuns).set({ totalNet: totalRunNet.toFixed(2) }).where(eq(payrollRuns.id, run.id));

    await tx.insert(auditLog).values({
      tenantId: req.user!.tenantId,
      actorId: req.user!.userId,
      entityTable: "payroll_runs",
      entityId: run.id,
      action: "run_payroll",
      after: { periodStart, periodEnd, totalNet: totalRunNet, entries: entriesToInsert.length },
      ip: req.ip,
    });

    return { code: 200, run: { ...run, totalNet: totalRunNet.toFixed(2) }, entries: entriesToInsert.length };
  });

  if (outcome.code !== 200) return res.status(outcome.code).json({ error: outcome.error });
  res.json({ message: "Payroll run calculated and frozen", ...outcome });
}));

// 6. LIST PAYROLL RUNS
router.get("/payroll/runs", requireAuth, requirePermission("hr.payroll.view"), asyncHandler(async (req: AuthRequest, res: Response) => {
  const runs = await db.select().from(payrollRuns).where(eq(payrollRuns.tenantId, req.user!.tenantId));
  res.json({ runs });
}));

// 7. GET ENTRIES FOR A RUN
router.get("/payroll/runs/:id/entries", requireAuth, requirePermission("hr.payroll.view"), asyncHandler(async (req: AuthRequest, res: Response) => {
  const entries = await db.select({
    id: payrollEntries.id,
    staffName: staff.name,
    staffRole: staff.role,
    type: staff.type,
    basePay: payrollEntries.basePay,
    overtimePay: payrollEntries.overtimePay,
    netPay: payrollEntries.netPay,
  }).from(payrollEntries)
    .innerJoin(staff, eq(payrollEntries.staffId, staff.id))
    .where(eq(payrollEntries.payrollRunId, req.params.id));
  res.json({ entries });
}));

export default router;