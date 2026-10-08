import { Response, NextFunction } from "express";
import { eq, and } from "drizzle-orm";
import { db, rolePermissions, permissions } from "@enderasie/database";
import { AuthRequest } from "./auth.js"; // Notice the .js!

export function requirePermission(requiredPermissionKey: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ error: "Unauthorized" });
    }

    try {
      // Check if the user's role has the required permission
      const [hasPermission] = await db
        .select()
        .from(rolePermissions)
        .innerJoin(permissions, eq(rolePermissions.permissionId, permissions.id))
        .where(
          and(
            eq(rolePermissions.roleId, req.user.roleId),
            eq(permissions.key, requiredPermissionKey)
          )
        );

      if (!hasPermission) {
        return res.status(403).json({ 
          error: `Forbidden: Your role does not have the '${requiredPermissionKey}' permission.` 
        });
      }

      next(); // User is authorized, proceed to the route!
    } catch (err) {
      res.status(500).json({ error: "Authorization check failed" });
    }
  };
}