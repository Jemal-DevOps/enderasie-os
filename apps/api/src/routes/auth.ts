import { Router } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, users, tenantMemberships } from "@enderasie/database";
import { signToken } from "../lib/jwt.js"; // Notice the .js!

const router = Router();

// 1. REGISTER
router.post("/register", async (req, res) => {
  try {
    const { email, password, fullName, phone, tenantId, roleId } = req.body;

    const passwordHash = await bcrypt.hash(password, 10);

    const [newUser] = await db.insert(users).values({
      email,
      passwordHash,
      fullName,
      phone,
    }).returning();

    await db.insert(tenantMemberships).values({
      userId: newUser.id,
      tenantId,
      roleId,
      status: "active",
    });

    res.json({ message: "User registered successfully", userId: newUser.id });
  } catch (err) {
    res.status(400).json({ error: (err as Error).message });
  }
});

// 2. LOGIN
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    const [user] = await db.select().from(users).where(eq(users.email, email));
    if (!user) return res.status(401).json({ error: "Invalid email or password" });

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) return res.status(401).json({ error: "Invalid email or password" });

    const [membership] = await db.select().from(tenantMemberships)
      .where(eq(tenantMemberships.userId, user.id));
      
    if (!membership) return res.status(403).json({ error: "No tenant access granted" });

    const token = signToken({
      userId: user.id,
      tenantId: membership.tenantId,
      roleId: membership.roleId,
    });

    res.json({
      token,
      user: { id: user.id, email: user.email, fullName: user.fullName },
    });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});

export default router;