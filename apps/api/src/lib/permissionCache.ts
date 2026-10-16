import { eq } from "drizzle-orm";
import { db, rolePermissions, permissions } from "@enderasie/database";

const CACHE_TTL_MS = 60_000; // 60 seconds

interface CacheEntry {
  keys: Set<string>;
  expiresAt: number;
}

const cache = new Map<string, CacheEntry>();

export async function getRolePermissions(roleId: string): Promise<Set<string>> {
  const hit = cache.get(roleId);
  if (hit && hit.expiresAt > Date.now()) return hit.keys;

  const rows = await db
    .select({ key: permissions.key })
    .from(rolePermissions)
    .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
    .where(eq(rolePermissions.roleId, roleId));

  const keys = new Set(rows.map((r) => r.key));
  cache.set(roleId, { keys, expiresAt: Date.now() + CACHE_TTL_MS });
  return keys;
}

export function invalidateRoleCache(roleId: string) { cache.delete(roleId); }
export function invalidateAllRoleCache() { cache.clear(); }