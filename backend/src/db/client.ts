import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { config } from "../config.js";
import * as schema from "./schema.js";

// Netlify bundles the source modules but includes the CA at its repository path.
const sourceCertificate = new URL("../../prod-supabase.cer", import.meta.url);
const certificate = existsSync(sourceCertificate)
  ? sourceCertificate
  : resolve("backend/prod-supabase.cer");

const pool = new Pool({
  connectionString: config.DATABASE_URL,
  max: 1,
  connectionTimeoutMillis: 10_000,
  idleTimeoutMillis: 10_000,
  allowExitOnIdle: true,
  ssl: {
    ca: readFileSync(certificate, "utf8"),
    rejectUnauthorized: true,
  },
});

pool.on("error", () => {
  console.error("Database idle connection failed; the pool will reconnect.");
});

export const db = drizzle({ client: pool, schema });
