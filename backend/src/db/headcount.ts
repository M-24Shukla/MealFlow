import { and, eq, inArray } from "drizzle-orm";
import { db } from "./client.js";
import {
  attendanceOverrides,
  dinerItemAttendanceOverrides,
  dinerMenuItemAbsences,
  membershipRoles,
  memberships,
  recurringAbsences,
  mealType as mealTypeEnum,
} from "./schema.js";
import { isoWeekday } from "../lib/attendance.js";

type MealType = (typeof mealTypeEnum.enumValues)[number];
type Attendance = {
  membershipIds: string[];
  presentMembershipIds: string[];
  overrides: number;
};
export type DayAttendance = Map<MealType, Attendance>;

// Three reads cover every meal on the date; callers reuse the resulting snapshot.
export async function loadGroupAttendance(
  groupId: string,
  mealDate: string,
): Promise<DayAttendance> {
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
  const membershipIds = consumers.map((item) => item.membershipId);
  const [recurring, overrides] = membershipIds.length
    ? await Promise.all([
        db
          .select({
            membershipId: recurringAbsences.membershipId,
            mealType: recurringAbsences.mealType,
          })
          .from(recurringAbsences)
          .where(
            and(
              inArray(recurringAbsences.membershipId, membershipIds),
              eq(recurringAbsences.weekday, isoWeekday(mealDate)),
            ),
          ),
        db
          .select({
            membershipId: attendanceOverrides.membershipId,
            mealType: attendanceOverrides.mealType,
            attendance: attendanceOverrides.attendance,
          })
          .from(attendanceOverrides)
          .where(
            and(
              inArray(attendanceOverrides.membershipId, membershipIds),
              eq(attendanceOverrides.mealDate, mealDate),
            ),
          ),
      ])
    : [[], []];
  return new Map(
    mealTypeEnum.enumValues.map((mealType) => {
      const recurringAbsent = new Set(
        recurring
          .filter((item) => item.mealType === mealType)
          .map((item) => item.membershipId),
      );
      const mealOverrides = overrides.filter(
        (item) => item.mealType === mealType,
      );
      const byMembership = new Map(
        mealOverrides.map((item) => [item.membershipId, item.attendance]),
      );
      const presentMembershipIds = membershipIds.filter(
        (id) =>
          byMembership.get(id) === "PRESENT" ||
          (byMembership.get(id) !== "ABSENT" && !recurringAbsent.has(id)),
      );
      return [
        mealType,
        {
          membershipIds,
          presentMembershipIds,
          overrides: mealOverrides.length,
        },
      ];
    }),
  );
}

async function groupAttendance(
  groupId: string,
  mealDate: string,
  mealType: MealType,
  snapshot?: DayAttendance,
) {
  return (snapshot ?? (await loadGroupAttendance(groupId, mealDate))).get(
    mealType,
  )!;
}

export async function groupHeadcount(
  groupId: string,
  mealDate: string,
  mealType: MealType,
  snapshot?: DayAttendance,
) {
  const attendance = await groupAttendance(
    groupId,
    mealDate,
    mealType,
    snapshot,
  );
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
  snapshot?: DayAttendance,
) {
  const { presentMembershipIds } = await groupAttendance(
    groupId,
    mealDate,
    mealType,
    snapshot,
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
