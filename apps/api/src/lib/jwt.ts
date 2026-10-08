// import jwt from "jsonwebtoken";

// // Use a real secret in production, this is fine for local dev
// const SECRET = process.env.JWT_SECRET || "enderasie-os-dev-secret";

// export interface TokenPayload {
//   userId: string;
//   tenantId: string;
//   roleId: string;
// }

// export function signToken(payload: TokenPayload) {
//   return jwt.sign(payload, SECRET, { expiresIn: "7d" });
// }

// export function verifyToken(token: string): TokenPayload {
//   return jwt.verify(token, SECRET) as TokenPayload;
// }
import jwt from "jsonwebtoken";

const SECRET = process.env.JWT_SECRET || "enderasie-os-dev-secret-key-123";

export interface TokenPayload {
  userId: string;
  tenantId: string;
  roleId: string;
}

export function signToken(payload: TokenPayload) {
  return jwt.sign(payload, SECRET, { expiresIn: "7d" });
}

export function verifyToken(token: string): TokenPayload {
  return jwt.verify(token, SECRET) as TokenPayload;
}