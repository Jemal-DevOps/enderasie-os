import "dotenv/config";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { roles, permissions, rolePermissions } from "./schema/identity.js";

const sql = postgres(process.env.DATABASE_URL!);
const db = drizzle(sql);

const NEW_PERMISSIONS = [
  { key: "request.create", module: "operations", action: "create" },
  { key: "request.submit", module: "operations", action: "submit" },
  { key: "request.pm_approve", module: "operations", action: "approve" },
  { key: "request.finance_approve", module: "operations", action: "approve" },
  { key: "request.fulfill", module: "operations", action: "fulfill" },
];

// Who can do what in the workflow
const ROLE_PERMISSION_MAP: Record<string, string[]> = {
  company_owner:   ["request.create", "request.submit", "request.pm_approve", "request.finance_approve", "request.fulfill"],
  company_admin:   ["request.create", "request.submit"],
  project_manager: ["request.create", "request.submit", "request.pm_approve"],
  site_engineer:   ["request.create", "request.submit"],
  storekeeper:     ["request.create", "request.submit", "request.fulfill"],
  finance_manager: ["request.finance_approve"],
};

async function main() {
  for (const p of NEW_PERMISSIONS) {
    await db.insert(permissions).values(p).onConflictDoNothing();
  }
  const allRoles = await db.select().from(roles);
  const allPerms = await db.select().from(permissions);
  for (const [roleKey, permKeys] of Object.entries(ROLE_PERMISSION_MAP)) {
    const role = allRoles.find((r) => r.key === roleKey);
    if (!role) continue;
    for (const pk of permKeys) {
      const perm = allPerms.find((p) => p.key === pk);
      if (!perm) continue;
      await db.insert(rolePermissions)
        .values({ roleId: role.id, permissionId: perm.id })
        .onConflictDoNothing();
    }
  }
  console.log("✅ Ops workflow permissions seeded");
  process.exit(0);
}
main();