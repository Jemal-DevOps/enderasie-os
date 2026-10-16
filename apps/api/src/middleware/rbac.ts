import { Response, NextFunction } from "express";
import { AuthRequest } from "./auth.js";
import { getRolePermissions } from "../lib/permissionCache.js";

export function requirePermission(permissionKey: string) {
  return async (req: AuthRequest, res: Response, next: NextFunction) => {
    try {
      const keys = await getRolePermissions(req.user!.roleId);
      if (!keys.has(permissionKey)) {
        return res.status(403).json({
          error: `Forbidden: Your role does not have the '${permissionKey}' permission.`,
        });
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}