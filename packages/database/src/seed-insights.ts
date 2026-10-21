import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { inArray } from "drizzle-orm";
import * as schema from "./index";
import { permissions, roles, rolePermissions } from "./index";

const sql = postgres(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

const ALL = ["insights.view"];
const GRANTS: Record<string, string[]> = {
  company_owner: ALL,
  company_admin: ALL,
  finance_manager: ALL,
  project_manager: ALL,
};

async function run() {
  console.log("📊 Wiring Insights permissions into the matrix...");
  await db.insert(permissions).values(ALL.map((key) => ({ key, module: "insights", action: "view" }))).onConflictDoNothing();
  const perms = await db.select().from(permissions).where(inArray(permissions.key, ALL));
  const grantRoles = await db.select().from(roles).where(inArray(roles.key, Object.keys(GRANTS)));
  const mappings: { roleId: string; permissionId: string }[] = [];
  for (const role of grantRoles) for (const perm of perms) if (GRANTS[role.key]?.includes(perm.key)) mappings.push({ roleId: role.id, permissionId: perm.id });
  await db.insert(rolePermissions).values(mappings).onConflictDoNothing();
  console.log(`✅ Insights permissions granted: ${mappings.length} mappings across ${grantRoles.length} roles.`);
  process.exit(0);
}
run().catch((err) => { console.error("❌", err); process.exit(1); });