import { cors } from "hono/cors";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { config } from "./config.js";
import { authRoutes } from "./routes/auth.js";
import { attendanceRoutes } from "./routes/attendance.js";
import { groupRoutes } from "./routes/groups.js";
import { menuRoutes } from "./routes/menus.js";
import { preparationRoutes } from "./routes/preparation.js";
import { authMiddleware, type AppVariables } from "./lib/session.js";

export const app = new Hono<{ Variables: AppVariables }>();

app.use(
  "/api/*",
  cors({
    origin: (origin) =>
      config.allowedCorsOrigins.includes(origin) ? origin : "",
    credentials: true,
  }),
);
app.use("/api/*", authMiddleware);
app.get("/health", (context) => context.json({ status: "ok" }));
app.route("/api/v1/auth", authRoutes);
app.route("/api/v1/groups", groupRoutes);
app.route("/api/v1/groups", menuRoutes);
app.route("/api/v1/groups", attendanceRoutes);
app.route("/api/v1/groups", preparationRoutes);

app.onError((error, context) => {
  const status = error instanceof HTTPException ? error.status : 500;
  const message =
    error instanceof HTTPException ? error.message : "Unexpected server error.";
  const log = status >= 500 ? console.error : console.warn;
  log("API request failed", {
    status,
    method: context.req.method,
    path: new URL(context.req.url).pathname,
    message,
    ...(status >= 500 ? { error } : {}),
  });
  return context.json(
    {
      error: {
        code: status === 500 ? "INTERNAL_ERROR" : "REQUEST_ERROR",
        message,
      },
    },
    status,
  );
});
