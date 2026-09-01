import { describe, expect, it } from "vitest";
import { expectedHeadcount } from "./attendance.js";

describe("expected headcount", () => {
  it("gives dated attendance overrides precedence over recurring absences", () => {
    expect(
      expectedHeadcount([
        { membershipId: "present", recurringAbsent: false },
        { membershipId: "recurring-absent", recurringAbsent: true },
        {
          membershipId: "override-present",
          recurringAbsent: true,
          override: "PRESENT",
        },
        {
          membershipId: "override-absent",
          recurringAbsent: false,
          override: "ABSENT",
        },
      ]),
    ).toBe(2);
  });
});
