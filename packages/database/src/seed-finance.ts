import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { inArray } from "drizzle-orm";
import * as schema from "./index";
import { permissions, roles, rolePermissions } from "./index";

const sql = postgres(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

const FINANCE_PERMISSIONS = [
  { key: "finance.contract.create", module: "finance", action: "create" },
  { key: "finance.contract.view", module: "finance", action: "view" },
  { key: "finance.ipc.create", module: "finance", action: "create" },
  { key: "finance.ipc.approve", module: "finance", action: "approve" },
  { key: "finance.receipt.record", module: "finance", action: "create" },
];

const GRANT_ROLES = ["company_owner", "company_admin", "finance_manager"];

async function run() {
  console.log("💰 Wiring finance permissions into the matrix...");

  // Ensure the permission rows exist
  await db.insert(permissions).values(FINANCE_PERMISSIONS).onConflictDoNothing();

  const perms = await db.select().from(permissions)
    .where(inArray(permissions.key, FINANCE_PERMISSIONS.map((p) => p.key)));
  const grantRoles = await db.select().from(roles)
    .where(inArray(roles.key, GRANT_ROLES));

  const mappings: { roleId: string; permissionId: string }[] = [];
  for (const role of grantRoles) {
    for (const perm of perms) mappings.push({ roleId: role.id, permissionId: perm.id });
  }

  await db.insert(rolePermissions).values(mappings).onConflictDoNothing();

  console.log(`✅ Finance permissions granted: ${mappings.length} mappings across ${grantRoles.length} roles.`);
  process.exit(0);
}

run().catch((err) => { console.error("❌", err); process.exit(1); });