export type ScheduleWindow = {
  weekday: number;
  mealType: "BREAKFAST" | "BRUNCH" | "LUNCH" | "SNACKS" | "DINNER";
  startTime: string;
  endTime: string;
  enabled: boolean;
};

const weekdays: Record<string, number> = {
  Mon: 1,
  Tue: 2,
  Wed: 3,
  Thu: 4,
  Fri: 5,
  Sat: 6,
  Sun: 7,
};

export function groupLocalTime(at: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    weekday: "short",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(at);
  const value = (type: Intl.DateTimeFormatPartTypes) => {
    const part = parts.find((candidate) => candidate.type === type);
    if (!part) throw new RangeError(`Missing ${type} in localized date.`);
    return part.value;
  };
  return {
    weekday: weekdays[value("weekday")]!,
    date: `${value("year")}-${value("month")}-${value("day")}`,
    time: `${value("hour")}:${value("minute")}`,
  };
}

export function resolveActiveSchedule(
  schedules: ScheduleWindow[],
  local: { weekday: number; time: string },
) {
  return schedules.find(
    (schedule) =>
      schedule.enabled &&
      schedule.weekday === local.weekday &&
      schedule.startTime.slice(0, 5) <= local.time &&
      local.time < schedule.endTime.slice(0, 5),
  );
}
