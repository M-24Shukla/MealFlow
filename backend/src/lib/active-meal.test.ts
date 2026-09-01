import { describe, expect, it } from "vitest";
import { groupLocalTime, resolveActiveSchedule } from "./active-meal.js";

describe("active meal resolution", () => {
  const lunch = {
    weekday: 1,
    mealType: "LUNCH" as const,
    startTime: "12:00",
    endTime: "14:00",
    enabled: true,
  };

  it("uses the group's timezone and excludes the end boundary", () => {
    const duringLunch = groupLocalTime(
      new Date("2026-08-24T06:30:00Z"),
      "Asia/Kolkata",
    );
    expect(duringLunch).toMatchObject({
      weekday: 1,
      date: "2026-08-24",
      time: "12:00",
    });
    expect(resolveActiveSchedule([lunch], duringLunch)).toEqual(lunch);

    const atLunchEnd = groupLocalTime(
      new Date("2026-08-24T08:30:00Z"),
      "Asia/Kolkata",
    );
    expect(resolveActiveSchedule([lunch], atLunchEnd)).toBeUndefined();
  });
});
