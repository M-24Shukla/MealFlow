import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { config } from "../config.js";
import * as schema from "./schema.js";
import { supabaseCa } from "./supabase-ca.js";

const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 10_000,
  allowExitOnIdle: true,
  ssl: {
    ca: supabaseCa,
    rejectUnauthorized: true,
  },
});

pool.on("error", () => {
  console.error("Database idle connection failed; the pool will reconnect.");
});

export const db = drizzle({ client: pool, schema });
