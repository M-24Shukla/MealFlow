import { readFileSync } from "node:fs";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { config } from "../config.js";
import * as schema from "./schema.js";

const pool = new Pool({
  connectionString: config.DATABASE_URL,
  ssl: {
    ca: readFileSync(new URL("../../prod-supabase.cer", import.meta.url), "utf8"),
    rejectUnauthorized: true,
  },
});

export const db = drizzle({ client: pool, schema });
