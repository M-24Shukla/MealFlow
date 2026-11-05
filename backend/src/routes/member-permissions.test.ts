import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

const database = vi.hoisted(() => ({
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn(),
}));
const authorize = vi.hoisted(() => vi.fn());
vi.mock("../db/client.js", () => ({ db: database }));
vi.mock("../lib/group-auth.js", () => ({
  requireGroupRole: authorize,
  requireGroupMembership: vi.fn(),
}));
vi.mock("../lib/session.js", () => ({
  requireUser: () => ({ id: "actor-user" }),
}));
import { groupRoutes } from "./groups.js";

const app = new Hono().route("/groups", groupRoutes);
app.onError((error, context) =>
  error instanceof HTTPException
    ? error.getResponse()
    : context.json({ error: "unexpected" }, 500),
);
const actorId = "actor-membership";
beforeEach(() => {
  vi.resetAllMocks();
  authorize.mockResolvedValue({
    membership: { id: actorId },
    roles: ["ADMIN"],
  });
});
function reads(results: unknown[][]) {
  database.select.mockImplementation(() => {
    const rows = results.shift() ?? [];
    return {
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockReturnValue(
        Object.assign(Promise.resolve(rows), {
          limit: vi.fn().mockResolvedValue(rows),
        }),
      ),
    };
  });
}
function noWrites() {
  expect(database.insert).not.toHaveBeenCalled();
  expect(database.update).not.toHaveBeenCalled();
  expect(database.delete).not.toHaveBeenCalled();
}

describe("member administration restrictions", () => {
  it.each([true, false])(
    "rejects modifying your own admin role (isAdmin=%s)",
    async (isAdmin) => {
      reads([[{ id: actorId, userId: "actor-user" }]]);
      const response = await app.request(
        `/groups/group-1/members/${actorId}/admin`,
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ isAdmin }),
        },
      );
      expect(response.status).toBe(403);
      expect(database.select).toHaveBeenCalledOnce();
      noWrites();
    },
  );

  it("rejects removing yourself through the administrative endpoint", async () => {
    reads([[{ id: actorId, userId: "actor-user" }]]);
    const response = await app.request(`/groups/group-1/members/${actorId}`, {
      method: "DELETE",
    });
    expect(response.status).toBe(403);
    noWrites();
  });

  it.each([{ roles: ["PRODUCER"] }, { roles: ["PRODUCER", "ADMIN"] }])(
    "rejects a cook's admin promotion with roles $roles",
    async ({ roles }) => {
      reads([
        [{ id: "cook-membership", userId: "cook-user" }],
        [{ creatorId: "owner-user" }],
        roles.map((role) => ({ role })),
      ]);
      const response = await app.request(
        "/groups/group-1/members/cook-membership/admin",
        {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ isAdmin: true }),
        },
      );
      expect(response.status).toBe(409);
      noWrites();
    },
  );

  it("allows promoting another eligible diner", async () => {
    reads([
      [{ id: "diner-membership", userId: "diner-user" }],
      [{ creatorId: "owner-user" }],
      [{ role: "CONSUMER" }],
    ]);
    database.insert.mockReturnValue({
      values: vi.fn().mockReturnValue({
        onConflictDoNothing: vi.fn().mockResolvedValue(undefined),
      }),
    });
    const response = await app.request(
      "/groups/group-1/members/diner-membership/admin",
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ isAdmin: true }),
      },
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      roles: ["CONSUMER", "ADMIN"],
    });
    expect(database.insert).toHaveBeenCalledOnce();
  });
});
