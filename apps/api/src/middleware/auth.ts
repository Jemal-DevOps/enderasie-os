import { Request, Response, NextFunction } from "express";
import { verifyToken } from "../lib/jwt.js"; // Notice the .js!

export interface AuthRequest extends Request {
  user?: { userId: string; tenantId: string; roleId: string };
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Unauthorized: Missing Bearer token" });
  }

  const token = authHeader.split(" ")[1];
  try {
    req.user = verifyToken(token);
    next(); // Passes control to the next route
  } catch (err) {
    return res.status(401).json({ error: "Unauthorized: Invalid token" });
  }
}