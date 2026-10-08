import projectRoutes from "./routes/projects.js";
import "dotenv/config";
import express from "express";
import cors from "cors";
import { db, tenants } from "@enderasie/database";
import authRoutes from "./routes/auth.js"; // <--- NEW IMPORT
import financeRoutes from "./routes/finance.js"; // <--- NEW IMPORT
import requestRoutes from "./routes/requests.js";
import approvalRoutes from "./routes/approvals.js"; // <--- NEW

// ... existing code ...



const app = express();

app.use(cors());
app.use(express.json());
app.use("/api/approvals", approvalRoutes); 
// ...
app.use("/api/projects", projectRoutes);// <--- NEW
// ...
// Health Check Route
app.get("/health", async (req, res) => {
  try {
    const tenantList = await db.select().from(tenants);
    res.json({
      status: "ok",
      message: "Enderasie OS API is alive",
      database: "connected",
      tenants: tenantList.length,
      firstTenant: tenantList[0]?.name
    });
  } catch (err) {
    res.status(500).json({ error: "Database connection failed" });
  }
});

// AUTH ROUTES (Login / Register)
app.use("/auth", authRoutes); // <--- NEW MOUNT POINT
app.use("/api/finance", financeRoutes); // <--- NEW MOUNT POINT
app.use("/api/requests", requestRoutes);

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => {
  console.log(`⚡ Enderasie API running on http://localhost:${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log(`🔐 Login endpoint: http://localhost:${PORT}/auth/login`);
});