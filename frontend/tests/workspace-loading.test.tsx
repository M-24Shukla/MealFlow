import assert from "node:assert/strict";
import test from "node:test";
import { loadWorkspaceDay } from "../src/lib/workspace";

test("simultaneous group/day loads share one request without retaining stale results", async (context) => {
  let resolve!: (response: Response) => void;
  const requests: string[] = [];
  context.mock.method(
    globalThis,
    "fetch",
    async (url: string, options: RequestInit) => {
      requests.push(url);
      assert.equal(options.credentials, "include");
      assert.equal(new Headers(options.headers).has("Content-Type"), false);
      return new Promise<Response>((done) => {
        resolve = done;
      });
    },
  );
  const first = loadWorkspaceDay("group-a", "2026-11-05");
  const duplicate = loadWorkspaceDay("group-a", "2026-11-05");
  assert.equal(first, duplicate);
  assert.equal(requests.length, 1);
  resolve(Response.json({ date: "2026-11-05" }));
  await first;
  const refreshed = loadWorkspaceDay("group-a", "2026-11-05");
  assert.equal(requests.length, 2);
  resolve(Response.json({ date: "2026-11-05" }));
  await refreshed;
});

test("failed loads can be retried, and different dates/groups stay separate", async (context) => {
  let count = 0;
  context.mock.method(globalThis, "fetch", async () => {
    count += 1;
    return count === 1
      ? Response.json({ error: { message: "Unavailable" } }, { status: 503 })
      : Response.json({});
  });
  await assert.rejects(loadWorkspaceDay("retry", "2026-11-05"), /Unavailable/);
  await Promise.all([
    loadWorkspaceDay("retry", "2026-11-05"),
    loadWorkspaceDay("retry", "2026-11-06"),
    loadWorkspaceDay("another-group", "2026-11-05"),
  ]);
  assert.equal(count, 4);
});
