import { serve } from "@hono/node-server";
import { config } from "./config.js";
import { app } from "./app.js";

serve({ fetch: app.fetch, port: config.PORT });
console.log(`MealFlow API is listening on port ${config.PORT}`);
