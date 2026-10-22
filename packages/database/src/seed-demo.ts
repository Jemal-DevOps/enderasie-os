import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import * as schema from "./index";
import {
  tenants, users, roles, tenantMemberships, projects,
  subcontractors, subcontracts, measurements, subcontractPayments,
  contracts, ipcs, cashReceipts, staff, timesheets, payrollRuns, payrollEntries,
} from "./index";

const sql = postgres(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

async function run() {
  console.log("🎬 Seeding realistic demo data...");
  const [tenant] = await db.select().from(tenants).limit(1);
  const [project] = await db.select().from(projects).limit(1);
  const [owner] = await db.select().from(users).limit(1);
  if (!tenant || !project || !owner) throw new Error("Run seed + seed:ops:data first");

  // --- Subcontractor registry (all trades) ---
  const subsDef = [
    { name: "TechVolt Electrical PLC", trade: "Full Electrical & Sanitary Installation" },
    { name: "AquaFlow Sanitary Works", trade: "Sanitary Installation" },
    { name: "Gilgil Masonry Union", trade: "Masonry & Plaster" },
    { name: "Selam Finishing Works", trade: "Finishing & Paint" },
    { name: "Abebe Steel Works", trade: "Rebar" },
  ];
  const subIds: Record<string, string> = {};
  for (const s of subsDef) {
    let [row] = await db.select().from(subcontractors).where(eq(subcontractors.name, s.name));
    if (!row) [row] = await db.insert(subcontractors).values({ tenantId: tenant.id, name: s.name, trade: s.trade, phone: "+251911223344", status: "active" }).returning();
    subIds[s.name] = row.id;
  }

  // --- Subcontracts ---
  const scDef = [
    { number: "SC-ELEC-001", sub: "TechVolt Electrical PLC", scope: "Full Electrical and Sanitary Installation", value: "2400000" },
    { number: "SC-MAS-002", sub: "Gilgil Masonry Union", scope: "Blockwork, Plaster & Masonry", value: "1200000" },
    { number: "SC-FIN-003", sub: "Selam Finishing Works", scope: "Painting & Finishing Works", value: "800000" },
  ];
  const scIds: Record<string, string> = {};
  for (const d of scDef) {
    let [row] = await db.select().from(subcontracts).where(eq(subcontracts.contractNumber, d.number));
    if (!row) [row] = await db.insert(subcontracts).values({ tenantId: tenant.id, projectId: project.id, subcontractorId: subIds[d.sub], contractNumber: d.number, scope: d.scope, totalValue: d.value, retentionPercent: "10.00", status: "active" }).returning();
    scIds[d.number] = row.id;
  }

  // --- Measurements in mixed states (draft / approved / partially paid) ---
  const mDef = [
    { sc: "SC-ELEC-001", number: "M-ELEC-01", claimed: "600000", approved: "550000", status: "partially_paid", paid: "300000" },
    { sc: "SC-ELEC-001", number: "M-ELEC-02", claimed: "400000", approved: "380000", status: "approved", paid: "0" },
    { sc: "SC-MAS-002", number: "M-MAS-01", claimed: "350000", approved: "320000", status: "partially_paid", paid: "200000" },
    { sc: "SC-FIN-003", number: "M-FIN-01", claimed: "200000", approved: "0", status: "draft", paid: "0" },
  ];
  for (const d of mDef) {
    let [m] = await db.select().from(measurements).where(eq(measurements.measurementNumber, d.number));
    if (!m) [m] = await db.insert(measurements).values({ tenantId: tenant.id, subcontractId: scIds[d.sc], measurementNumber: d.number, claimedAmount: d.claimed, approvedAmount: d.approved, status: d.status as "draft" | "approved" | "partially_paid", periodStart: "2026-09-01", periodEnd: "2026-09-30" }).returning();
    if (d.paid !== "0") {
      const [exists] = await db.select().from(subcontractPayments).where(eq(subcontractPayments.measurementId, m.id));
      if (!exists) await db.insert(subcontractPayments).values({ tenantId: tenant.id, measurementId: m.id, amount: d.paid, paidDate: "2026-10-05", reference: "CBE-88921" });
    }
  }

  // --- Second client contract + IPCs + receipts ---
  let [c2] = await db.select().from(contracts).where(eq(contracts.contractNumber, "CNT-002"));
  if (!c2) [c2] = await db.insert(contracts).values({ tenantId: tenant.id, projectId: project.id, contractNumber: "CNT-002", clientName: "AAHDC - Bole Medical Tower", totalValue: "2500000", retentionPercent: "5.00", status: "active" }).returning();
  const ipcDef = [
    { number: "CNT002-IPC-01", claimed: "800000", approved: "750000", status: "partially_paid" as const, receipt: "500000" },
    { number: "CNT002-IPC-02", claimed: "600000", approved: "0", status: "draft" as const, receipt: "0" },
  ];
  for (const d of ipcDef) {
    let [ipc] = await db.select().from(ipcs).where(eq(ipcs.ipcNumber, d.number));
    if (!ipc) [ipc] = await db.insert(ipcs).values({ tenantId: tenant.id, contractId: c2.id, ipcNumber: d.number, claimedAmount: d.claimed, approvedAmount: d.approved, status: d.status, periodStart: "2026-09-01", periodEnd: "2026-09-30" }).returning();
    if (d.receipt !== "0") {
      const [r] = await db.select().from(cashReceipts).where(eq(cashReceipts.ipcId, ipc.id));
      if (!r) await db.insert(cashReceipts).values({ tenantId: tenant.id, ipcId: ipc.id, amount: d.receipt, receivedDate: "2026-10-08", reference: "CBE-77120" });
    }
  }

  // --- Staff + September timesheets + a paid September payroll run ---
  const staffDef = [
    { name: "Lina Site Engineer", role: "Site Engineer", type: "salaried" as const, rate: "18000" },
    { name: "Kebede Mason", role: "Mason", type: "daily" as const, rate: "500" },
    { name: "Tigist Accountant", role: "Accountant", type: "salaried" as const, rate: "15000" },
    { name: "Musa Electrician", role: "Electrician", type: "daily" as const, rate: "650" },
  ];
  const staffIds: Record<string, string> = {};
  for (const s of staffDef) {
    let [row] = await db.select().from(staff).where(eq(staff.name, s.name));
    if (!row) [row] = await db.insert(staff).values({ tenantId: tenant.id, name: s.name, role: s.role, type: s.type, rate: s.rate, status: "active" }).returning();
    staffIds[s.name] = row.id;
  }
  for (const [name, days, hours, ot] of [["Kebede Mason", 10, 8, 1], ["Musa Electrician", 12, 8, 2]] as [string, number, number, number][]) {
    const existing = await db.select().from(timesheets).where(eq(timesheets.staffId, staffIds[name]));
    if (existing.length === 0) {
      const rows = [];
      for (let d = 1; d <= days; d++) {
        rows.push({ tenantId: tenant.id, staffId: staffIds[name], projectId: project.id, date: `2026-09-${String(d).padStart(2, "0")}`, hours: String(hours), overtimeHours: String(d % 3 === 0 ? ot : 0), status: "approved" as const });
      }
      await db.insert(timesheets).values(rows);
    }
  }
  let [septRun] = await db.select().from(payrollRuns).where(eq(payrollRuns.periodStart, "2026-09-01"));
  if (!septRun) {
    [septRun] = await db.insert(payrollRuns).values({ tenantId: tenant.id, periodStart: "2026-09-01", periodEnd: "2026-09-30", status: "paid", totalNet: "0" }).returning();
    const kebedeBase = 10 * 8 * 500, kebedeOt = 3 * 1 * 500 * 1.5;
    const musaBase = 12 * 8 * 650, musaOt = 4 * 2 * 650 * 1.5;
    const entries = [
      { payrollRunId: septRun.id, staffId: staffIds["Kebede Mason"], basePay: String(kebedeBase), overtimePay: String(kebedeOt), netPay: String(kebedeBase + kebedeOt) },
      { payrollRunId: septRun.id, staffId: staffIds["Musa Electrician"], basePay: String(musaBase), overtimePay: String(musaOt), netPay: String(musaBase + musaOt) },
      { payrollRunId: septRun.id, staffId: staffIds["Lina Site Engineer"], basePay: "18000", overtimePay: "0", netPay: "18000" },
      { payrollRunId: septRun.id, staffId: staffIds["Tigist Accountant"], basePay: "15000", overtimePay: "0", netPay: "15000" },
    ];
    await db.insert(payrollEntries).values(entries);
    const total = entries.reduce((s, e) => s + parseFloat(e.netPay), 0);
    await db.update(payrollRuns).set({ totalNet: String(total) }).where(eq(payrollRuns.id, septRun.id));
  }

  // --- Demo users for every role (password = same as your owner user) ---
  const demoUsers = [
    { email: "pm@enderasie.com", fullName: "Paulos Project Manager", roleKey: "project_manager" },
    { email: "finance@enderasie.com", fullName: "Fiwi Finance Manager", roleKey: "finance_manager" },
    { email: "site@enderasie.com", fullName: "Sami Site Engineer", roleKey: "site_engineer" },
    { email: "store@enderasie.com", fullName: "Stora Storekeeper", roleKey: "storekeeper" },
  ];
  for (const u of demoUsers) {
    let [existingUser] = await db.select().from(users).where(eq(users.email, u.email));
    if (!existingUser) {
      [existingUser] = await db.insert(users).values({ email: u.email, passwordHash: owner.passwordHash, fullName: u.fullName, phone: "+251900000000" }).returning();
      const [role] = await db.select().from(roles).where(eq(roles.key, u.roleKey));
      if (role) await db.insert(tenantMemberships).values({ tenantId: tenant.id, userId: existingUser.id, roleId: role.id });
      console.log(`👤 Demo user ready: ${u.email} / Password123! (${u.roleKey})`);
    }
  }

  console.log("✅ Demo data seeded: 5 subcontractors, 3 subcontracts, mixed-state measurements, CNT-002 with IPCs, September payroll, 4 role demo users.");
  process.exit(0);
}
run().catch((e) => { console.error("❌", e); process.exit(1); });