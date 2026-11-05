import { DrizzleQueryError } from "drizzle-orm";
import type { ErrorHandler } from "hono";
import { HTTPException } from "hono/http-exception";

const connectionCodes = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ENOTFOUND",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "28P01",
  "28000",
  "53300",
  "57P01",
  "57P02",
  "57P03",
]);

export const handleError: ErrorHandler = (error, context) => {
  const databaseError = error instanceof DrizzleQueryError;
  const cause = databaseError ? error.cause : undefined;
  const databaseCode =
    cause && "code" in cause && typeof cause.code === "string"
      ? cause.code
      : undefined;
  const unavailable =
    databaseError &&
    ((databaseCode !== undefined &&
      (connectionCodes.has(databaseCode) ||
        /^08[0-9A-Z]{3}$/.test(databaseCode))) ||
      (databaseCode === "XX000" &&
        /tenant(?:\/user| or user).*not found/i.test(cause?.message ?? "")));
  const status =
    error instanceof HTTPException ? error.status : unavailable ? 503 : 500;
  const message =
    error instanceof HTTPException
      ? error.message
      : unavailable
        ? "Service temporarily unavailable. Please try again later."
        : "Unexpected server error.";
  const code = unavailable
    ? "SERVICE_UNAVAILABLE"
    : status >= 500
      ? "INTERNAL_ERROR"
      : "REQUEST_ERROR";
  const path = new URL(context.req.url).pathname;
  const signedOutCheck =
    status === 401 &&
    context.req.method === "GET" &&
    path === "/api/v1/auth/me";
  if (!signedOutCheck) {
    const log = status >= 500 ? console.error : console.warn;
    // Never log raw database errors: they include SQL and user-supplied values.
    log(
      "API request failed",
      JSON.stringify({
        status,
        method: context.req.method,
        path,
        code,
        message,
        ...(databaseError ? { category: "DATABASE_ERROR" } : {}),
        ...(databaseCode && /^[A-Z0-9_]{5,20}$/.test(databaseCode)
          ? { databaseCode }
          : {}),
      }),
    );
  }
  return context.json({ error: { code, message } }, status);
};
