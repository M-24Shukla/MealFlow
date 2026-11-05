import { cors } from "hono/cors";
import { Hono } from "hono";
import { config } from "./config.js";
import { authRoutes } from "./routes/auth.js";
import { attendanceRoutes } from "./routes/attendance.js";
import { groupRoutes } from "./routes/groups.js";
import { menuRoutes } from "./routes/menus.js";
import { preparationRoutes } from "./routes/preparation.js";
import { authMiddleware, type AppVariables } from "./lib/session.js";
import { handleError } from "./lib/error-handler.js";

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

app.onError(handleError);
