import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { menuImportInput } from "../lib/menu-import.js";

const database = vi.hoisted(() => ({ transaction: vi.fn() }));
const authorize = vi.hoisted(() => vi.fn());
vi.mock("../db/client.js", () => ({ db: database }));
vi.mock("../lib/group-auth.js", () => ({
  requireGroupRole: authorize,
  requireGroupMembership: vi.fn(),
}));
import { menuRoutes } from "./menus.js";
const app = new Hono().route("/groups", menuRoutes);
app.onError((error, context) =>
  error instanceof HTTPException
    ? error.getResponse()
    : context.json({ error: "unexpected" }, 500),
);
const menu = {
  weekday: 1,
  mealType: "BREAKFAST",
  items: [{ name: "Poha", category: "VEG" }],
};
const request = (body: unknown) =>
  app.request("/groups/group-1/menus/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
beforeEach(() => {
  vi.resetAllMocks();
  authorize.mockResolvedValue({ roles: ["ADMIN"] });
});

describe("menu import validation", () => {
  it.each([
    { menus: [] },
    { menus: [menu, menu] },
    { menus: [{ ...menu, weekday: 8 }] },
    { menus: [{ ...menu, mealType: "TEA" }] },
    { menus: [{ ...menu, items: [] }] },
    { menus: [{ ...menu, items: Array(51).fill(menu.items[0]) }] },
    { menus: [{ ...menu, items: [{ name: " ", category: "VEG" }] }] },
    { menus: [{ ...menu, items: [{ name: "Poha", category: "OTHER" }] }] },
    {
      menus: [
        {
          ...menu,
          items: [{ ...menu.items[0], recipeUrl: "javascript:alert(1)" }],
        },
      ],
    },
    { menus: [{ ...menu, date: "2026-11-05" }] },
    { menus: [{ ...menu, items: [{ ...menu.items[0], extra: true }] }] },
  ])(
    "rejects invalid input before starting a transaction: %j",
    async (payload) => {
      expect((await request(payload)).status).toBe(400);
      expect(database.transaction).not.toHaveBeenCalled();
    },
  );
  it("accepts all 35 distinct meal slots and normalizes names", () => {
    const menus = Array.from({ length: 7 }, (_, index) =>
      ["BREAKFAST", "BRUNCH", "LUNCH", "SNACKS", "DINNER"].map((mealType) => ({
        ...menu,
        weekday: index + 1,
        mealType,
        items: [
          { name: " Poha ", category: "VEG", recipeUrl: null, notes: null },
        ],
      })),
    ).flat();
    expect(menuImportInput.parse({ menus }).menus[0]!.items[0]!.name).toBe(
      "Poha",
    );
  });
  it("rejects malformed JSON", async () => {
    expect((await request("```json\n{}\n``` ")).status).toBe(400);
    expect(database.transaction).not.toHaveBeenCalled();
  });
  it("enforces admin access", async () => {
    authorize.mockRejectedValue(new HTTPException(403));
    expect((await request({ menus: [menu] })).status).toBe(403);
    expect(authorize).toHaveBeenCalledWith(expect.anything(), "group-1", [
      "ADMIN",
    ]);
    expect(database.transaction).not.toHaveBeenCalled();
  });
  it("saves multiple slots and item order in one transaction", async () => {
    const itemValues: unknown[] = [];
    const menuValues: unknown[] = [];
    const tx = {
      insert: vi.fn().mockImplementation(() => ({
        values: (value: unknown) => {
          if (Array.isArray(value)) {
            itemValues.push(value);
            return Promise.resolve();
          }
          menuValues.push(value);
          return {
            onConflictDoUpdate: () => ({
              returning: async () => [{ id: `menu-${menuValues.length}` }],
            }),
          };
        },
      })),
      delete: vi
        .fn()
        .mockReturnValue({ where: vi.fn().mockResolvedValue(undefined) }),
    };
    database.transaction.mockImplementation((work) => work(tx));
    const response = await request({
      menus: [
        menu,
        {
          ...menu,
          weekday: 2,
          items: [...menu.items, { name: "Tea", category: "VEGAN" }],
        },
      ],
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ imported: 2 });
    expect(database.transaction).toHaveBeenCalledTimes(1);
    expect(menuValues).toEqual([
      { groupId: "group-1", weekday: 1, mealType: "BREAKFAST" },
      { groupId: "group-1", weekday: 2, mealType: "BREAKFAST" },
    ]);
    expect(itemValues[1]).toEqual([
      {
        name: "Poha",
        category: "VEG",
        menuId: "menu-2",
        recipeUrl: null,
        notes: null,
        sortOrder: 0,
      },
      {
        name: "Tea",
        category: "VEGAN",
        menuId: "menu-2",
        recipeUrl: null,
        notes: null,
        sortOrder: 1,
      },
    ]);
  });
  it("propagates a write failure out of the transaction without reporting success", async () => {
    const failure = new Error("write failed");
    let slotsWritten = 0;
    const tx = {
      insert: () => ({
        values: (value: unknown) => {
          if (Array.isArray(value)) return Promise.resolve();
          slotsWritten += 1;
          return {
            onConflictDoUpdate: () => ({
              returning: () =>
                slotsWritten === 1
                  ? Promise.resolve([{ id: "menu-1" }])
                  : Promise.reject(failure),
            }),
          };
        },
      }),
      delete: () => ({ where: () => Promise.resolve() }),
    };
    let transactionFailure: unknown;
    database.transaction.mockImplementation(async (work) => {
      try {
        return await work(tx);
      } catch (error) {
        transactionFailure = error;
        throw error;
      }
    });
    expect(
      (await request({ menus: [menu, { ...menu, weekday: 2 }] })).status,
    ).toBe(500);
    expect(slotsWritten).toBe(2);
    expect(transactionFailure).toBe(failure);
  });
});
