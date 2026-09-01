import { compare, hash } from "bcryptjs";
import { eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";
import { readJson } from "../lib/http.js";
import { clientAddress, enforceRateLimit } from "../lib/rate-limit.js";
import {
  clearSession,
  createSession,
  requireUser,
  type AppVariables,
} from "../lib/session.js";

const credentials = z.object({
  email: z
    .string()
    .email()
    .transform((value) => value.trim().toLowerCase()),
  password: z.string().min(8).max(128),
  displayName: z.string().trim().min(2).max(80).optional(),
});

export const authRoutes = new Hono<{ Variables: AppVariables }>();

authRoutes.post("/register", async (context) => {
  enforceRateLimit(`register:${clientAddress(context.req.raw)}`);
  const payload = await readJson(
    context.req.raw,
    credentials.refine(
      (value) => value.displayName,
      "Display name is required.",
    ),
  );
  const existing = await db
    .select({ id: users.id })
    .from(users)
    .where(eq(users.email, payload.email))
    .limit(1);
  if (existing[0])
    throw new HTTPException(409, {
      message: "An account with that email already exists.",
    });

  const [user] = await db
    .insert(users)
    .values({
      email: payload.email,
      displayName: payload.displayName!,
      passwordHash: await hash(payload.password, 12),
    })
    .returning({
      id: users.id,
      email: users.email,
      displayName: users.displayName,
    });
  await createSession(user.id, context);
  return context.json({ user }, 201);
});

authRoutes.post("/login", async (context) => {
  enforceRateLimit(`login:${clientAddress(context.req.raw)}`);
  const payload = await readJson(
    context.req.raw,
    credentials.pick({ email: true, password: true }),
  );
  const [user] = await db
    .select()
    .from(users)
    .where(eq(users.email, payload.email))
    .limit(1);
  if (!user || !(await compare(payload.password, user.passwordHash))) {
    throw new HTTPException(401, {
      message: "Email or password is incorrect.",
    });
  }
  await createSession(user.id, context);
  return context.json({
    user: { id: user.id, email: user.email, displayName: user.displayName },
  });
});

authRoutes.post("/logout", async (context) => {
  await clearSession(context);
  return context.body(null, 204);
});

authRoutes.get("/me", (context) =>
  context.json({ user: requireUser(context) }),
);
