import "dotenv/config";
import { z } from "zod";

const environment = z.object({
  DATABASE_URL: z.string().min(1),
  ALLOWED_CORS_ORIGINS: z.string().default("http://localhost:5173"),
  PORT: z.coerce.number().int().positive().default(3000),
  SESSION_TTL_DAYS: z.coerce.number().int().positive().max(365).default(365),
  SESSION_SECRET: z.string().min(32),
  SESSION_COOKIE_DOMAIN: z.string().optional(),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

const parsed = environment.parse(process.env);

export const config = {
  ...parsed,
  allowedCorsOrigins: parsed.ALLOWED_CORS_ORIGINS.split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
  sessionCookieDomain: parsed.SESSION_COOKIE_DOMAIN || undefined,
};
