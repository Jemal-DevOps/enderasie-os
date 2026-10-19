import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { inArray } from "drizzle-orm";
import * as schema from "./index";
import { permissions, roles, rolePermissions } from "./index";

const sql = postgres(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

const ALL = [
  "subcontractor.create", "subcontractor.view",
  "subcontract.create", "subcontract.view",
  "measurement.create", "measurement.approve",
  "subcontract.payment.record",
];

const SUBK_PERMISSIONS = ALL.map((key) => ({ key, module: "subcontract", action: key.split(".")[1] }));

const GRANTS: Record<string, string[]> = {
  company_owner: ALL,
  company_admin: ALL,
  project_manager: ["subcontractor.view", "subcontract.view", "measurement.create", "measurement.approve"],
  finance_manager: ["subcontractor.view", "subcontract.view", "subcontract.payment.record"],
  site_engineer: ["measurement.create", "subcontractor.view"],
};

async function run() {
  console.log("📏 Wiring subcontract permissions into the matrix...");
  await db.insert(permissions).values(SUBK_PERMISSIONS).onConflictDoNothing();

  const perms = await db.select().from(permissions).where(inArray(permissions.key, ALL));
  const grantRoles = await db.select().from(roles).where(inArray(roles.key, Object.keys(GRANTS)));

  const mappings: { roleId: string; permissionId: string }[] = [];
  for (const role of grantRoles) {
    for (const perm of perms) {
      if (GRANTS[role.key]?.includes(perm.key)) mappings.push({ roleId: role.id, permissionId: perm.id });
    }
  }
  await db.insert(rolePermissions).values(mappings).onConflictDoNothing();

  console.log(`✅ Subcontract permissions granted: ${mappings.length} mappings across ${grantRoles.length} roles.`);
  process.exit(0);
}

run().catch((err) => { console.error("❌", err); process.exit(1); });