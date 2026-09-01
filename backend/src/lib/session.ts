import { createHmac, randomBytes } from "node:crypto";
import { and, eq, gt } from "drizzle-orm";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Context, Next } from "hono";
import { HTTPException } from "hono/http-exception";
import { config } from "../config.js";
import { db } from "../db/client.js";
import { sessions, users } from "../db/schema.js";

const cookieName = "mealflow_session";
const hashToken = (token: string) =>
  createHmac("sha256", config.SESSION_SECRET).update(token).digest("hex");

export type AuthUser = { id: string; email: string; displayName: string };
export type AppVariables = { user: AuthUser | null };

export async function createSession(userId: string, context: Context) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + config.SESSION_TTL_DAYS * 86_400_000);
  await db
    .insert(sessions)
    .values({ userId, tokenHash: hashToken(token), expiresAt });
  setCookie(context, cookieName, token, {
    httpOnly: true,
    secure: config.NODE_ENV === "production",
    sameSite: "Lax",
    expires: expiresAt,
    path: "/",
    domain: config.sessionCookieDomain,
  });
}

export async function authMiddleware(
  context: Context<{ Variables: AppVariables }>,
  next: Next,
) {
  const token = getCookie(context, cookieName);
  if (!token) {
    context.set("user", null);
    return next();
  }

  const tokenHash = hashToken(token);
  const result = await db
    .select({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
    })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, tokenHash),
        gt(sessions.expiresAt, new Date()),
      ),
    )
    .limit(1);

  const user = result[0] ?? null;
  if (user) {
    const expiresAt = new Date(
      Date.now() + config.SESSION_TTL_DAYS * 86_400_000,
    );
    await db
      .update(sessions)
      .set({ expiresAt })
      .where(eq(sessions.tokenHash, tokenHash));
    setCookie(context, cookieName, token, {
      httpOnly: true,
      secure: config.NODE_ENV === "production",
      sameSite: "Lax",
      expires: expiresAt,
      path: "/",
      domain: config.sessionCookieDomain,
    });
  }
  context.set("user", user);
  return next();
}

export function requireUser(context: Context<{ Variables: AppVariables }>) {
  const user = context.get("user");
  if (!user) throw new HTTPException(401, { message: "Sign in is required." });
  return user;
}

export async function clearSession(context: Context) {
  const token = getCookie(context, cookieName);
  if (token)
    await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  deleteCookie(context, cookieName, { path: "/" });
}
