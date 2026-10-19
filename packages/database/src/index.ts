import "dotenv/config"; 
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as identitySchema from "./schema/identity.js";
import * as projectSchema from "./schema/projects.js";
import * as operationsSchema from "./schema/operations.js"; // <--- NEW

export * from "./schema/identity.js";
export * from "./schema/projects.js";
export * from "./schema/operations.js"; // <--- NEW
export * from "./schema/finance.js";

const connectionString = process.env.DATABASE_URL!;
const client = postgres(connectionString);

export const db = drizzle(client, { 
  schema: { 
    ...identitySchema, 
    ...projectSchema, 
    ...operationsSchema // <--- NEW
  } 
});