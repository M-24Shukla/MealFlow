import { and, eq, inArray } from "drizzle-orm";
import { db } from "./client.js";
import {
  attendanceOverrides,
  dinerItemAttendanceOverrides,
  dinerMenuItemAbsences,
  membershipRoles,
  memberships,
  recurringAbsences,
} from "./schema.js";
import { isoWeekday } from "../lib/attendance.js";

async function groupAttendance(
  groupId: string,
  mealDate: string,
  mealType: "BREAKFAST" | "BRUNCH" | "LUNCH" | "SNACKS" | "DINNER",
) {
  const consumers = await db
    .select({ membershipId: memberships.id })
    .from(memberships)
    .innerJoin(
      membershipRoles,
      eq(membershipRoles.membershipId, memberships.id),
    )
    .where(
      and(
        eq(memberships.groupId, groupId),
        eq(memberships.status, "ACTIVE"),
        eq(membershipRoles.role, "CONSUMER"),
      ),
    );
  const membershipIds = consumers.map(({ membershipId }) => membershipId);
  if (!membershipIds.length) {
    return { membershipIds, presentMembershipIds: [], overrides: 0 };
  }
  const [recurring, overrides] = await Promise.all([
    db
      .select({ membershipId: recurringAbsences.membershipId })
      .from(recurringAbsences)
      .where(
        and(
          inArray(recurringAbsences.membershipId, membershipIds),
          eq(recurringAbsences.weekday, isoWeekday(mealDate)),
          eq(recurringAbsences.mealType, mealType),
        ),
      ),
    db
      .select({
        membershipId: attendanceOverrides.membershipId,
        attendance: attendanceOverrides.attendance,
      })
      .from(attendanceOverrides)
      .where(
        and(
          inArray(attendanceOverrides.membershipId, membershipIds),
          eq(attendanceOverrides.mealDate, mealDate),
          eq(attendanceOverrides.mealType, mealType),
        ),
      ),
  ]);
  const recurringAbsent = new Set(
    recurring.map(({ membershipId }) => membershipId),
  );
  const overridesByMembership = new Map(
    overrides.map(({ membershipId, attendance }) => [membershipId, attendance]),
  );
  const rules = membershipIds.map((membershipId) => ({
    membershipId,
    recurringAbsent: recurringAbsent.has(membershipId),
    override: overridesByMembership.get(membershipId),
  }));
  const presentMembershipIds = rules
    .filter(
      (rule) =>
        rule.override === "PRESENT" ||
        (rule.override !== "ABSENT" && !rule.recurringAbsent),
    )
    .map(({ membershipId }) => membershipId);
  return { membershipIds, presentMembershipIds, overrides: overrides.length };
}

export async function groupHeadcount(
  groupId: string,
  mealDate: string,
  mealType: "BREAKFAST" | "BRUNCH" | "LUNCH" | "SNACKS" | "DINNER",
) {
  const attendance = await groupAttendance(groupId, mealDate, mealType);
  const expected = attendance.presentMembershipIds.length;
  return {
    expected,
    absent: attendance.membershipIds.length - expected,
    overrides: attendance.overrides,
  };
}

export async function groupItemHeadcounts(
  groupId: string,
  mealDate: string,
  mealType: "BREAKFAST" | "BRUNCH" | "LUNCH" | "SNACKS" | "DINNER",
  items: { id: string; sourceMenuItemId: string | null }[],
) {
  const { presentMembershipIds } = await groupAttendance(
    groupId,
    mealDate,
    mealType,
  );
  if (!presentMembershipIds.length || !items.length)
    return new Map<string, number>();
  const itemIds = [
    ...new Set(
      items.flatMap((item) =>
        item.sourceMenuItemId ? [item.id, item.sourceMenuItemId] : [item.id],
      ),
    ),
  ];
  const sourceIds = items.flatMap((item) =>
    item.sourceMenuItemId ? [item.sourceMenuItemId] : [],
  );
  const [recurring, overrides] = await Promise.all([
    sourceIds.length
      ? db
          .select({
            membershipId: dinerMenuItemAbsences.membershipId,
            itemId: dinerMenuItemAbsences.menuItemId,
          })
          .from(dinerMenuItemAbsences)
          .where(
            and(
              inArray(dinerMenuItemAbsences.membershipId, presentMembershipIds),
              inArray(dinerMenuItemAbsences.menuItemId, sourceIds),
            ),
          )
      : Promise.resolve([]),
    db
      .select({
        membershipId: dinerItemAttendanceOverrides.membershipId,
        itemId: dinerItemAttendanceOverrides.itemId,
        attendance: dinerItemAttendanceOverrides.attendance,
      })
      .from(dinerItemAttendanceOverrides)
      .where(
        and(
          inArray(
            dinerItemAttendanceOverrides.membershipId,
            presentMembershipIds,
          ),
          eq(dinerItemAttendanceOverrides.mealDate, mealDate),
          eq(dinerItemAttendanceOverrides.mealType, mealType),
          inArray(dinerItemAttendanceOverrides.itemId, itemIds),
        ),
      ),
  ]);
  const recurringKeys = new Set(
    recurring.map(({ membershipId, itemId }) => `${membershipId}:${itemId}`),
  );
  const overridesByKey = new Map(
    overrides.map(({ membershipId, itemId, attendance }) => [
      `${membershipId}:${itemId}`,
      attendance,
    ]),
  );
  return new Map(
    items.map((item) => {
      const keys = item.sourceMenuItemId
        ? [item.id, item.sourceMenuItemId]
        : [item.id];
      const count = presentMembershipIds.filter((membershipId) => {
        const override = keys
          .map((id) => overridesByKey.get(`${membershipId}:${id}`))
          .find(Boolean);
        return (
          override === "PRESENT" ||
          (override !== "ABSENT" &&
            (!item.sourceMenuItemId ||
              !recurringKeys.has(`${membershipId}:${item.sourceMenuItemId}`)))
        );
      }).length;
      return [item.id, count];
    }),
  );
}
