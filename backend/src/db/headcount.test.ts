import { beforeEach, describe, expect, it, vi } from "vitest";

const select = vi.hoisted(() => vi.fn());
vi.mock("./client.js", () => ({ db: { select } }));
import {
  groupHeadcount,
  groupItemHeadcounts,
  loadGroupAttendance,
} from "./headcount.js";

function mockRows(rows: unknown[][]) {
  const chain = {
    from: vi.fn().mockReturnThis(),
    innerJoin: vi.fn().mockReturnThis(),
    where: vi.fn(() => Promise.resolve(rows.shift() ?? [])),
  };
  select.mockReturnValue(chain);
}

beforeEach(() => vi.resetAllMocks());

describe("date-wide diner counts", () => {
  it("loads all meals in three reads and preserves dated override precedence", async () => {
    mockRows([
      [{ membershipId: "a" }, { membershipId: "b" }, { membershipId: "c" }],
      [
        { membershipId: "a", mealType: "LUNCH" },
        { membershipId: "b", mealType: "DINNER" },
      ],
      [
        { membershipId: "a", mealType: "LUNCH", attendance: "PRESENT" },
        { membershipId: "c", mealType: "LUNCH", attendance: "ABSENT" },
      ],
    ]);
    const snapshot = await loadGroupAttendance("group-1", "2026-11-05");
    expect(select).toHaveBeenCalledTimes(3);
    expect(snapshot.get("LUNCH")?.presentMembershipIds).toEqual(["a", "b"]);
    expect(snapshot.get("DINNER")?.presentMembershipIds).toEqual(["a", "c"]);
    expect(snapshot.get("BREAKFAST")?.presentMembershipIds).toEqual([
      "a",
      "b",
      "c",
    ]);
    expect(
      await groupHeadcount("group-1", "2026-11-05", "LUNCH", snapshot),
    ).toEqual({ expected: 2, absent: 1, overrides: 2 });
    expect(
      await groupItemHeadcounts("group-1", "2026-11-05", "LUNCH", [], snapshot),
    ).toEqual(new Map());
    expect(select).toHaveBeenCalledTimes(3);
  });

  it("returns zero for every meal without querying attendance for an empty group", async () => {
    mockRows([[]]);
    const snapshot = await loadGroupAttendance("empty-group", "2026-11-05");
    expect(select).toHaveBeenCalledOnce();
    expect(snapshot.size).toBe(5);
    for (const attendance of snapshot.values())
      expect(attendance.presentMembershipIds).toEqual([]);
  });
});
