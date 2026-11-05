import { DrizzleQueryError } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { afterEach, describe, expect, it, vi } from "vitest";
import { handleError } from "./error-handler.js";

afterEach(() => vi.restoreAllMocks());

function failingApp(error: Error) {
  const app = new Hono();
  app.onError(handleError);
  app.all("*", () => {
    throw error;
  });
  return app;
}

describe("API exception handling", () => {
  it.each([
    "timeout expired",
    "timeout exceeded when trying to connect",
    "Connection terminated due to connection timeout",
  ])("recognizes a code-less connection timeout: %s", async (message) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const error = new DrizzleQueryError(
      "private SQL",
      ["private@example.test"],
      new Error(message),
    );
    const response = await failingApp(error).request("/api/v1/auth/login", {
      method: "POST",
    });
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toMatchObject({
      error: { code: "SERVICE_UNAVAILABLE" },
    });
    expect(log).toHaveBeenCalledOnce();
    expect(JSON.parse(log.mock.calls[0][1])).toMatchObject({
      category: "DATABASE_ERROR",
      databaseReason: "CONNECTION_TIMEOUT",
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("private");
  });

  it.each([
    ["XX000", "(ENOTFOUND) tenant/user postgres.private-project not found"],
    ["ECONNREFUSED", "Connection refused"],
    ["08006", "Connection failure"],
    ["28P01", "Password authentication failed"],
  ])(
    "returns a sanitized 503 for database connection error %s",
    async (code, message) => {
      const log = vi.spyOn(console, "error").mockImplementation(() => {});
      const error = new DrizzleQueryError(
        "select * from users where email = $1",
        ["private@example.test"],
        Object.assign(new Error(message), { code }),
      );
      const response = await failingApp(error).request("/api/v1/auth/login", {
        method: "POST",
      });

      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({
        error: {
          code: "SERVICE_UNAVAILABLE",
          message: "Service temporarily unavailable. Please try again later.",
        },
      });
      expect(log).toHaveBeenCalledExactlyOnceWith(
        "API request failed",
        JSON.stringify({
          status: 503,
          method: "POST",
          path: "/api/v1/auth/login",
          code: "SERVICE_UNAVAILABLE",
          message: "Service temporarily unavailable. Please try again later.",
          category: "DATABASE_ERROR",
          databaseCode: code,
        }),
      );
    },
  );

  it.each([
    new Error("private internal details"),
    new DrizzleQueryError(
      "private SQL",
      ["private parameter"],
      Object.assign(new Error("relation does not exist"), { code: "42P01" }),
    ),
    new DrizzleQueryError(
      "private SQL",
      [],
      Object.assign(new Error("unrelated internal database error"), {
        code: "XX000",
      }),
    ),
  ])("keeps unexpected failures as sanitized 500 responses", async (error) => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await failingApp(error).request("/api/v1/groups");

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: { code: "INTERNAL_ERROR", message: "Unexpected server error." },
    });
    expect(JSON.stringify(log.mock.calls)).not.toContain("private");
    expect(log).toHaveBeenCalledOnce();
  });

  it("returns the signed-out response without logging a warning", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    const response = await failingApp(
      new HTTPException(401, {
        message: "Sign in is required.",
      }),
    ).request("/api/v1/auth/me");

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: { code: "REQUEST_ERROR", message: "Sign in is required." },
    });
    expect(warn).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });

  it("preserves and logs other expected request failures", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const response = await failingApp(
      new HTTPException(401, {
        message: "Email or password is incorrect.",
      }),
    ).request("/api/v1/auth/login", { method: "POST" });

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: {
        code: "REQUEST_ERROR",
        message: "Email or password is incorrect.",
      },
    });
    expect(warn).toHaveBeenCalledOnce();
  });
});
