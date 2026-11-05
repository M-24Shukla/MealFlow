import { describe, expect, it, vi } from "vitest";

process.env.DATABASE_URL = "postgresql://test:test@localhost:5432/test";
process.env.SESSION_SECRET =
  "test-session-secret-at-least-thirty-two-characters";

const { default: handler } = await import("../functions/api.mjs");

describe("Netlify function", () => {
  it("serves health without a database connection", async () => {
    const response = await handler(new Request("https://example.test/health"));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });

  it("preserves API paths and signed-out JSON responses", async () => {
    const response = await handler(
      new Request("https://example.test/api/v1/auth/me"),
    );
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "REQUEST_ERROR", message: "Sign in is required." },
    });
  });

  it("forwards POST bodies through request validation", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    try {
      const response = await handler(
        new Request("https://example.test/api/v1/auth/login", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email: "invalid", password: "short" }),
        }),
      );
      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toMatchObject({
        error: { code: "REQUEST_ERROR" },
      });
    } finally {
      warn.mockRestore();
    }
  });

  it("preserves session-clearing cookies", async () => {
    const response = await handler(
      new Request("https://example.test/api/v1/auth/logout", {
        method: "POST",
      }),
    );
    expect(response.status).toBe(204);
    expect(response.headers.get("set-cookie")).toContain("mealflow_session=");
    expect(await response.text()).toBe("");
  });
});
