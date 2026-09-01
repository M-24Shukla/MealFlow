export type AttendanceRule = {
  membershipId: string;
  recurringAbsent: boolean;
  override?: "PRESENT" | "ABSENT";
};

export function expectedHeadcount(rules: AttendanceRule[]) {
  return rules.filter(
    (rule) =>
      rule.override === "PRESENT" ||
      (rule.override !== "ABSENT" && !rule.recurringAbsent),
  ).length;
}

export function isoWeekday(date: string) {
  const parsed = new Date(`${date}T12:00:00Z`);
  return parsed.getUTCDay() || 7;
}

export function isCalendarDate(date: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const parsed = new Date(`${date}T12:00:00Z`);
  return (
    !Number.isNaN(parsed.getTime()) &&
    parsed.toISOString().slice(0, 10) === date
  );
}
