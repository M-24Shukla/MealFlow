import { app } from "../src/app.js";

export default (request: Request) => app.fetch(request);

export const config = {
  path: ["/api/*", "/health"],
};
