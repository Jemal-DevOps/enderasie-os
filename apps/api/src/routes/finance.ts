import { Router } from "express";
import { requireAuth } from "../middleware/auth.js"; // Notice the .js!
import { requirePermission } from "../middleware/rbac.js"; // Notice the .js!

const router = Router();

// This route requires BOTH a valid token AND the specific permission
router.get(
  "/budget",
  requireAuth,
  requirePermission("finance.budget.edit"),
  async (req, res) => {
    // If the code reaches here, the user passed both checks!
    res.json({
      message: "Welcome to the highly classified Finance Dashboard!",
      user: req.user,
      data: {
        totalBudget: "5,000,000 ETB",
        spent: "1,250,000 ETB",
        remaining: "3,750,000 ETB"
      }
    });
  }
);

export default router;