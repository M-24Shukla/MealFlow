import { describe, expect, it } from "vitest";
import { groupJoinedRows } from "./group-joined-rows.js";

describe("joined menu rows", () => {
  it("keeps empty menus and ordered items without repeating parents", () => {
    const breakfast = { id: "breakfast", mealType: "BREAKFAST" };
    const lunch = { id: "lunch", mealType: "LUNCH" };
    const data = groupJoinedRows([
      { parent: breakfast, item: { id: "first", sortOrder: 0 } },
      { parent: breakfast, item: { id: "second", sortOrder: 1 } },
      { parent: lunch, item: null },
    ]);

    expect(data).toEqual([
      {
        ...breakfast,
        items: [
          { id: "first", sortOrder: 0 },
          { id: "second", sortOrder: 1 },
        ],
      },
      { ...lunch, items: [] },
    ]);
  });
});
