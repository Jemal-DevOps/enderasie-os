import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { eq } from "drizzle-orm";
import { roles, permissions, rolePermissions } from "./schema/identity.js";

const sql = postgres(process.env.DATABASE_URL!);
const db = drizzle(sql);

// 1. THE 20 OFFICIAL ROLES
const ENTERPRISE_ROLES = [
  { key: "site_engineer", name: "Site Engineer", scope: "project" },
  { key: "project_engineer", name: "Project Engineer", scope: "project" },
  { key: "project_manager", name: "Project Manager", scope: "project" },
  { key: "site_storekeeper", name: "Site Storekeeper", scope: "project" },
  { key: "storekeeper", name: "Central Storekeeper", scope: "company" },
  { key: "store_supervisor", name: "Store Supervisor", scope: "company" },
  { key: "procurement_officer", name: "Procurement Officer", scope: "company" },
  { key: "contracts_officer", name: "Contracts Officer", scope: "company" },
  { key: "quantity_surveyor", name: "Quantity Surveyor (QS)", scope: "project" },
  { key: "finance_officer", name: "Finance Officer", scope: "company" },
  { key: "accountant", name: "Accountant", scope: "company" },
  { key: "finance_manager", name: "Finance Manager", scope: "company" },
  { key: "cashier_treasury", name: "Cashier / Treasury", scope: "company" },
  { key: "deputy_general_manager", name: "Deputy General Manager (DGM)", scope: "company" },
  { key: "general_manager", name: "General Manager (GM)", scope: "company" },
  { key: "management", name: "Management / Board", scope: "company" },
  { key: "administrator", name: "System Administrator", scope: "company" },
  { key: "hr_officer", name: "HR Officer", scope: "company" },
  { key: "payroll_accountant", name: "Payroll Accountant", scope: "company" },
  { key: "auditor", name: "Auditor (Read-Only)", scope: "company" },
];

// 2. THE 45 GRANULAR PERMISSIONS
const ENTERPRISE_PERMISSIONS = [
  // Material Flow (7 steps)
  { key: "material.create", module: "operations", action: "create" },
  { key: "material.submit", module: "operations", action: "submit" },
  { key: "material.verify_eng", module: "operations", action: "verify" },
  { key: "material.approve_pm", module: "operations", action: "approve" },
  { key: "material.issue_stock", module: "operations", action: "fulfill" },
  { key: "material.review_issuance", module: "operations", action: "review" },
  { key: "material.procure", module: "procurement", action: "create" },
  
  // Client Flow (Contract -> IPC -> Cash -> Closeout)
  { key: "contract.create", module: "contracts", action: "create" },
  { key: "contract.approve_pm", module: "contracts", action: "approve" },
  { key: "contract.verify_eng", module: "contracts", action: "verify" },
  { key: "contract.certify_qs", module: "contracts", action: "certify" },
  { key: "finance.record_ipc", module: "finance", action: "create" },
  { key: "finance.process_receipt", module: "finance", action: "process" },
  { key: "finance.approve_receipt", module: "finance", action: "approve" },
  { key: "finance.closeout_dgm", module: "finance", action: "close" },
  { key: "finance.finalize_gm", module: "finance", action: "finalize" },
  
  // Subcontract Flow (Measurement -> Certificate -> Payment)
  { key: "subcontract.create", module: "contracts", action: "create" },
  { key: "subcontract.measure_eng", module: "contracts", action: "measure" },
  { key: "subcontract.certify_qs", module: "contracts", action: "certify" },
  { key: "subcontract.approve_pm", module: "contracts", action: "approve" },
  { key: "payment.record_sub", module: "finance", action: "create" },
  { key: "payment.approve_sub", module: "finance", action: "approve" },
  { key: "payment.disburse", module: "finance", action: "disburse" },
  
  // Payroll & HR Flow
  { key: "employee.manage", module: "hr", action: "manage" },
  { key: "attendance.approve", module: "hr", action: "approve" },
  { key: "payroll.compute", module: "finance", action: "compute" },
  { key: "payroll.approve", module: "finance", action: "approve" },
  { key: "payroll.disburse", module: "finance", action: "disburse" },
  { key: "payment.authorize_dgm", module: "finance", action: "authorize" },
  
  // Daily Labourer Flow
  { key: "labourer.register", module: "hr", action: "register" },
  { key: "labourer.approve_attendance", module: "hr", action: "approve" },
  { key: "labourer.approve_payment", module: "finance", action: "approve" },
  
  // Project Status Change (Non-destructive lifecycle)
  { key: "project.propose_status", module: "project", action: "propose" },
  { key: "project.review_status", module: "project", action: "review" },
  { key: "project.approve_status", module: "project", action: "approve" },
  
  // Global
  { key: "approvals.view_inbox", module: "core", action: "view" },
  { key: "dashboard.view_kpi", module: "core", action: "view" },
  { key: "audit.view_log", module: "core", action: "view" },
];
const ALL_KEYS = ENTERPRISE_PERMISSIONS.map((p) => p.key);
// 3. THE COMPLIANCE MATRIX (Who can do what)
const MATRIX: Record<string, string[]> = {
  // Operations & Material
  site_engineer:      ["material.create", "material.submit", "project.propose_status", "approvals.view_inbox", "dashboard.view_kpi"],
  project_engineer:   ["material.verify_eng", "subcontract.measure_eng", "contract.verify_eng", "project.review_status", "approvals.view_inbox", "dashboard.view_kpi"],
  project_manager:    ["material.approve_pm", "subcontract.approve_pm", "contract.approve_pm", "attendance.approve", "labourer.approve_attendance", "project.propose_status", "approvals.view_inbox", "dashboard.view_kpi"],
  site_storekeeper:   ["material.issue_stock", "dashboard.view_kpi"],
  storekeeper:        ["material.issue_stock", "material.procure", "dashboard.view_kpi"],
  store_supervisor:   ["material.review_issuance", "dashboard.view_kpi"],
  procurement_officer:["material.procure", "dashboard.view_kpi"],
  
  // Contracts & Finance
  contracts_officer:  ["contract.create", "subcontract.create", "project.propose_status", "dashboard.view_kpi"],
  quantity_surveyor:  ["contract.certify_qs", "subcontract.certify_qs", "project.review_status", "dashboard.view_kpi"],
  finance_officer:    ["finance.record_ipc", "dashboard.view_kpi"],
  accountant:         ["finance.process_receipt", "payment.record_sub", "labourer.approve_payment", "dashboard.view_kpi"],
  finance_manager:    ["finance.approve_receipt", "payment.approve_sub", "payroll.approve", "dashboard.view_kpi"],
  payroll_accountant: ["payroll.compute", "dashboard.view_kpi",],
  cashier_treasury:   ["payment.disburse", "payroll.disburse", "dashboard.view_kpi"],
  
  // Executive
  deputy_general_manager: ["finance.closeout_dgm", "payment.authorize_dgm", "project.approve_status", "dashboard.view_kpi"],
  general_manager:        ["finance.finalize_gm", "project.approve_status", "dashboard.view_kpi"],
  management:             ["project.approve_status", "dashboard.view_kpi"],
  
  // HR
  hr_officer: ["employee.manage", "labourer.register", "dashboard.view_kpi"],
  
  // System
  administrator: ["audit.view_log", "project.approve_status", "dashboard.view_kpi"], // Full access assumed via UI logic or specific admin perms
  auditor: ["audit.view_log", "dashboard.view_kpi"],
   company_owner: ALL_KEYS,
  company_admin: ["audit.view_log", "dashboard.view_kpi", "approvals.view_inbox", "employee.manage"],
  subcontractor: ["dashboard.view_kpi"],
};

async function main() {
  console.log("🏗️ Seeding Enterprise Role Matrix...");

  // 1. Insert Roles (skip if exists)
  for (const role of ENTERPRISE_ROLES) {
    await db.insert(roles).values(role).onConflictDoNothing();
  }

  // 2. Insert Permissions (skip if exists)
  for (const perm of ENTERPRISE_PERMISSIONS) {
    await db.insert(permissions).values(perm).onConflictDoNothing();
  }

  // 3. Sync the Matrix
  // First, clear all existing role_permissions to ensure a clean slate
  await db.delete(rolePermissions);

  const allRoles = await db.select().from(roles);
  const allPerms = await db.select().from(permissions);

  let count = 0;
  for (const [roleKey, permKeys] of Object.entries(MATRIX)) {
    const role = allRoles.find((r) => r.key === roleKey);
    if (!role) {
      console.warn(`⚠️ Role ${roleKey} not found in DB`);
      continue;
    }
    for (const pk of permKeys) {
      const perm = allPerms.find((p) => p.key === pk);
      if (!perm) {
        console.warn(`⚠️ Permission ${pk} not found in DB`);
        continue;
      }
      await db.insert(rolePermissions).values({ roleId: role.id, permissionId: perm.id });
      count++;
    }
  }

  console.log(`✅ Enterprise Matrix synced: ${count} permission mappings applied.`);
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Seed failed:", err);
  process.exit(1);
});