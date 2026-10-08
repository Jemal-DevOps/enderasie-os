// import { defineConfig } from "drizzle-kit";

// export default defineConfig({
//   schema: "./src/schema/*.ts",
//   out: "./drizzle",
//   dialect: "postgresql",
//   dbCredentials: { url: process.env.DATABASE_URL! },
// }); 


import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

// Tell dotenv exactly where the root .env file is
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
dotenv.config({ path: resolve(__dirname, "../../.env") });

export default defineConfig({
  schema: "./src/schema/*.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL!,
  },
});