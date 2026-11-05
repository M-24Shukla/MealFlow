import { beforeEach, describe, expect, it, vi } from "vitest";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";

const loaders = vi.hoisted(() => ({
  loadActionItems: vi.fn(),
  loadAttendance: vi.fn(),
  loadCookLeaves: vi.fn(),
  loadDinerOnboarding: vi.fn(),
  loadItemAttendance: vi.fn(),
  loadMenus: vi.fn(),
  loadMenuOverrides: vi.fn(),
  loadMyLeaves: vi.fn(),
  loadRecurringAbsences: vi.fn(),
  loadVacations: vi.fn(),
  loadPreparation: vi.fn(),
  loadJoinRequests: vi.fn(),
  loadGroupMembers: vi.fn(),
}));
const authorize = vi.hoisted(() => vi.fn());
const attendance = vi.hoisted(() => vi.fn());
vi.mock("../db/group-reads.js", () => loaders);
vi.mock("../db/headcount.js", () => ({ loadGroupAttendance: attendance }));
vi.mock("../lib/group-auth.js", () => ({ requireGroupRole: authorize }));
import { workspaceRoutes } from "./workspace.js";

const groupId = "00000000-0000-4000-8000-000000000001";
const date = "2026-11-05";
const app = new Hono().route("/groups", workspaceRoutes);
app.onError((error, context) =>
  error instanceof HTTPException
    ? error.getResponse()
    : context.json({ error: "unexpected" }, 500),
);
const membership = {
  id: "member-1",
  dinerOnboardingCompletedAt: new Date(),
  cookOnboardingCompletedAt: null,
};
const menu = {
  id: "menu-1",
  weekday: 4,
  mealType: "LUNCH",
  items: [
    {
      id: "item-1",
      name: "Rice",
      category: "VEG",
      recipeUrl: null,
      notes: null,
    },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  attendance.mockResolvedValue(
    new Map([
      [
        "LUNCH",
        {
          membershipIds: ["diner-1"],
          presentMembershipIds: ["diner-1"],
          overrides: 0,
        },
      ],
    ]),
  );
  authorize.mockResolvedValue({ membership, roles: ["CONSUMER"] });
  loaders.loadMenus.mockResolvedValue([menu]);
  loaders.loadMenuOverrides.mockResolvedValue([]);
  loaders.loadCookLeaves.mockResolvedValue({ cookCount: 1, leaves: [] });
  loaders.loadActionItems.mockResolvedValue([]);
  loaders.loadRecurringAbsences.mockResolvedValue([]);
  loaders.loadAttendance.mockResolvedValue([]);
  loaders.loadItemAttendance.mockResolvedValue({
    recurringAbsentItemIds: [],
    overrides: [],
  });
  loaders.loadMyLeaves.mockResolvedValue([]);
  loaders.loadPreparation.mockResolvedValue({
    occurrence: { mealDate: date, mealType: "LUNCH" },
    items: [],
    headcount: 0,
  });
  loaders.loadJoinRequests.mockResolvedValue([]);
  loaders.loadGroupMembers.mockResolvedValue([]);
  loaders.loadVacations.mockResolvedValue([]);
  loaders.loadDinerOnboarding.mockResolvedValue({
    completed: true,
    absentMenuItemIds: [],
    dietaryCategories: [],
  });
});

describe("group workspace", () => {
  it("sends compact JSON with separate server timing metrics", async () => {
    const response = await app.request(
      `/groups/${groupId}/workspace?date=${date}`,
    );
    const raw = await response.text();
    expect(raw).toBe(JSON.stringify(JSON.parse(raw)));
    expect(raw).not.toContain("\n");
    expect(response.headers.get("server-timing")).toMatch(
      /groupAuth;dur=\d+\.\d, workspaceData;dur=\d+\.\d/,
    );
  });
  it("authorizes once and loads the day alongside the visible attendance settings", async () => {
    const response = await app.request(
      `/groups/${groupId}/workspace?date=${date}`,
    );
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data).toMatchObject({
      date,
      menus: [menu],
      consumer: { onboardingCompleted: true },
      producer: null,
    });
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(authorize).toHaveBeenCalledOnce();
    expect(loaders.loadMenus).toHaveBeenCalledExactlyOnceWith(
      groupId,
      undefined,
    );
    expect(loaders.loadCookLeaves).toHaveBeenCalledExactlyOnceWith(
      groupId,
      date,
    );
    expect(loaders.loadActionItems).not.toHaveBeenCalled();
    expect(loaders.loadRecurringAbsences).toHaveBeenCalledExactlyOnceWith(
      membership.id,
    );
    expect(loaders.loadAttendance).toHaveBeenCalledExactlyOnceWith(
      membership.id,
      date,
    );
    expect(loaders.loadItemAttendance).toHaveBeenCalledExactlyOnceWith(
      membership.id,
      date,
      ["item-1"],
    );
    expect(loaders.loadVacations).toHaveBeenCalledExactlyOnceWith(
      membership.id,
    );
    expect(loaders.loadDinerOnboarding).not.toHaveBeenCalled();
    expect(loaders.loadMyLeaves).not.toHaveBeenCalled();
    expect(data).not.toHaveProperty("members");
    expect(data).not.toHaveProperty("joinRequests");
    expect(data.consumer.vacations).toEqual([]);
    expect(data.consumer.weeklyMenus).toEqual([menu]);
    expect(loaders.loadPreparation).not.toHaveBeenCalled();
    expect(loaders.loadGroupMembers).not.toHaveBeenCalled();
    expect(loaders.loadJoinRequests).not.toHaveBeenCalled();
  });

  it("uses dated replacements, including an explicitly empty meal", async () => {
    loaders.loadMenuOverrides.mockResolvedValue([
      { mealType: "LUNCH", items: [] },
    ]);
    const response = await app.request(
      `/groups/${groupId}/workspace?date=${date}`,
    );
    expect((await response.json()).menus[0].items).toEqual([]);
    expect(loaders.loadItemAttendance).toHaveBeenCalledWith(
      membership.id,
      date,
      [],
    );
  });

  it("does not load consumer data for a producer", async () => {
    authorize.mockResolvedValue({ membership, roles: ["PRODUCER"] });
    const response = await app.request(
      `/groups/${groupId}/workspace?date=${date}`,
    );
    expect(await response.json()).toMatchObject({
      consumer: null,
      producer: { leaves: [], onboardingCompleted: false },
    });
    expect(loaders.loadMyLeaves).toHaveBeenCalledExactlyOnceWith(
      membership.id,
      date,
    );
    expect(loaders.loadAttendance).not.toHaveBeenCalled();
    expect(loaders.loadRecurringAbsences).not.toHaveBeenCalled();
    expect(loaders.loadItemAttendance).not.toHaveBeenCalled();
    expect(loaders.loadPreparation).toHaveBeenCalledExactlyOnceWith(
      groupId,
      { membership, roles: ["PRODUCER"] },
      date,
      "LUNCH",
      expect.any(Map),
    );
    expect(attendance).toHaveBeenCalledExactlyOnceWith(groupId, date);
  });

  it("includes every displayed meal's count using the same attendance snapshot as preparation", async () => {
    authorize.mockResolvedValue({ membership, roles: ["PRODUCER"] });
    loaders.loadMenus.mockResolvedValue([
      menu,
      { ...menu, id: "dinner-menu", mealType: "DINNER" },
    ]);
    const snapshot = new Map([
      [
        "LUNCH",
        {
          membershipIds: ["a", "b"],
          presentMembershipIds: ["a"],
          overrides: 0,
        },
      ],
      [
        "DINNER",
        {
          membershipIds: ["a", "b"],
          presentMembershipIds: ["a", "b"],
          overrides: 0,
        },
      ],
    ]);
    attendance.mockResolvedValue(snapshot);
    const response = await app.request(
      `/groups/${groupId}/workspace?date=${date}`,
    );
    expect(await response.json()).toMatchObject({
      producer: { headcounts: { LUNCH: 1, DINNER: 2 } },
    });
    expect(attendance).toHaveBeenCalledOnce();
    expect(loaders.loadPreparation).toHaveBeenCalledExactlyOnceWith(
      groupId,
      { membership, roles: ["PRODUCER"] },
      date,
      "LUNCH",
      snapshot,
    );
    expect(loaders.loadActionItems).not.toHaveBeenCalled();
  });

  it("keeps cook settings usable when the cook is not assigned to the selected meal", async () => {
    authorize.mockResolvedValue({ membership, roles: ["PRODUCER"] });
    loaders.loadPreparation.mockRejectedValue(
      new HTTPException(403, { message: "You are not assigned to this meal." }),
    );
    const response = await app.request(
      `/groups/${groupId}/workspace?date=${date}`,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      producer: {
        preparation: null,
        preparationError: "You are not assigned to this meal.",
      },
    });
  });

  it("does not disguise database failures as unassigned meals", async () => {
    authorize.mockResolvedValue({ membership, roles: ["PRODUCER"] });
    loaders.loadPreparation.mockRejectedValue(new Error("database failure"));
    expect(
      (await app.request(`/groups/${groupId}/workspace?date=${date}`)).status,
    ).toBe(500);
  });

  it.each(["", "2026-02-30", "invalid"])(
    "rejects invalid date %s without querying data",
    async (date) => {
      expect(
        (await app.request(`/groups/${groupId}/workspace?date=${date}`)).status,
      ).toBe(400);
      expect(authorize).not.toHaveBeenCalled();
      expect(loaders.loadMenus).not.toHaveBeenCalled();
    },
  );

  it.each([401, 403] as const)(
    "loads nothing when authorization fails with %s",
    async (status) => {
      authorize.mockRejectedValue(new HTTPException(status));
      expect(
        (await app.request(`/groups/${groupId}/workspace?date=${date}`)).status,
      ).toBe(status);
      expect(loaders.loadMenus).not.toHaveBeenCalled();
      expect(loaders.loadActionItems).not.toHaveBeenCalled();
    },
  );

  it("loads weekly settings only through the on-demand preferences endpoint", async () => {
    const response = await app.request(
      `/groups/${groupId}/workspace/preferences`,
    );
    expect(response.status).toBe(200);
    expect(loaders.loadMenus).toHaveBeenCalledExactlyOnceWith(groupId);
    expect(loaders.loadVacations).toHaveBeenCalledExactlyOnceWith(
      membership.id,
    );
    expect(loaders.loadDinerOnboarding).toHaveBeenCalledExactlyOnceWith(
      membership.id,
    );
    expect(loaders.loadAttendance).not.toHaveBeenCalled();
  });

  it("loads admin lists together, guarded by the admin role", async () => {
    authorize.mockResolvedValue({ membership, roles: ["ADMIN"] });
    const response = await app.request(`/groups/${groupId}/workspace/admin`);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ requests: [], members: [] });
    expect(authorize).toHaveBeenCalledExactlyOnceWith(
      expect.anything(),
      groupId,
      ["ADMIN"],
    );
    expect(loaders.loadGroupMembers).toHaveBeenCalledExactlyOnceWith(groupId);
    expect(loaders.loadJoinRequests).toHaveBeenCalledExactlyOnceWith(groupId);
  });
});
