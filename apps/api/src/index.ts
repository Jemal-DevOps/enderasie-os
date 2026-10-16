import "dotenv/config";
import express from "express";
import cors from "cors";
import { db, tenants } from "@enderasie/database";
import authRoutes from "./routes/auth.js";
import financeRoutes from "./routes/finance.js";
import requestRoutes from "./routes/requests.js";
import approvalRoutes from "./routes/approvals.js";
import projectRoutes from "./routes/projects.js";
import { asyncHandler } from "./lib/asyncHandler.js";

const app = express();

app.use(cors());
app.use(express.json());

// ROUTES
app.use("/auth", authRoutes);
app.use("/api/finance", financeRoutes);
app.use("/api/requests", requestRoutes);
app.use("/api/approvals", approvalRoutes);
app.use("/api/projects", projectRoutes);

// Health Check Route
app.get("/health", asyncHandler(async (req, res) => {
  const tenantList = await db.select().from(tenants);
  res.json({
    status: "ok",
    message: "Enderasie OS API is alive",
    database: "connected",
    tenants: tenantList.length,
    firstTenant: tenantList[0]?.name,
  });
}));

// CENTRAL ERROR HANDLER (must be AFTER all routes)
app.use((err: any, req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("💥 Unhandled API error:", err);
  res.status(500).json({ error: "Internal server error" });
});

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`⚡ Enderasie API running on http://localhost:${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`🔐 Login endpoint: http://localhost:${PORT}/auth/login`);
});