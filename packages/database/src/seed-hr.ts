import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { inArray } from "drizzle-orm";
import * as schema from "./index";
import { permissions, roles, rolePermissions } from "./index";

const sql = postgres(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

const ALL = [
  "hr.staff.create", "hr.staff.view",
  "hr.timesheet.create", "hr.timesheet.approve",
  "hr.payroll.run", "hr.payroll.view",
];

const HR_PERMISSIONS = ALL.map((key) => ({ key, module: "hr", action: key.split(".")[1] }));

const GRANTS: Record<string, string[]> = {
  company_owner: ALL,
  company_admin: ALL,
  project_manager: ["hr.staff.view", "hr.timesheet.create", "hr.timesheet.approve", "hr.payroll.view"],
  site_engineer: ["hr.staff.view", "hr.timesheet.create"],
  finance_manager: ["hr.staff.view", "hr.payroll.run", "hr.payroll.view", "hr.timesheet.approve"],
};

async function run() {
  console.log("👷 Wiring HR permissions into the matrix...");
  await db.insert(permissions).values(HR_PERMISSIONS).onConflictDoNothing();

  const perms = await db.select().from(permissions).where(inArray(permissions.key, ALL));
  const grantRoles = await db.select().from(roles).where(inArray(roles.key, Object.keys(GRANTS)));

  const mappings: { roleId: string; permissionId: string }[] = [];
  for (const role of grantRoles) {
    for (const perm of perms) {
      if (GRANTS[role.key]?.includes(perm.key)) mappings.push({ roleId: role.id, permissionId: perm.id });
    }
  }
  await db.insert(rolePermissions).values(mappings).onConflictDoNothing();

  console.log(`✅ HR permissions granted: ${mappings.length} mappings across ${grantRoles.length} roles.`);
  process.exit(0);
}

run().catch((err) => { console.error("❌", err); process.exit(1); });