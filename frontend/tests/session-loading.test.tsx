import assert from "node:assert/strict";
import test from "node:test";
import { loadInitialSession } from "../src/lib/session";

test("startup subscribers share auth and group reads without loading join requests", async (context) => {
  const requests: string[] = [];
  context.mock.method(globalThis, "fetch", async (url: string) => {
    requests.push(url);
    if (url.endsWith("/auth/me"))
      return Response.json({
        user: { id: "user-1", displayName: "Test", email: "test@example.test" },
      });
    if (url.endsWith("/groups/mine")) return Response.json({ data: [] });
    throw new Error(`Unexpected startup request: ${url}`);
  });
  const first = loadInitialSession();
  const second = loadInitialSession();
  assert.equal(first, second);
  assert.equal((await first).user.id, "user-1");
  assert.equal(requests.length, 2);
  assert.equal(requests.filter((url) => url.endsWith("/auth/me")).length, 1);
  assert.equal(
    requests.filter((url) => url.endsWith("/groups/mine")).length,
    1,
  );
  await loadInitialSession();
  assert.equal(requests.length, 4);
});

test("failed startup can be retried without retaining an expired session", async (context) => {
  let count = 0;
  context.mock.method(globalThis, "fetch", async (url: string) => {
    count += 1;
    if (count === 1)
      return Response.json(
        { error: { message: "Sign in is required." } },
        { status: 401 },
      );
    return url.endsWith("/auth/me")
      ? Response.json({ user: { id: "user-2" } })
      : Response.json({ data: [] });
  });
  await assert.rejects(loadInitialSession(), /Sign in is required/);
  assert.equal((await loadInitialSession()).user.id, "user-2");
  assert.equal(count, 3);
});
