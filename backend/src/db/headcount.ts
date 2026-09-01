import { and, eq, inArray } from "drizzle-orm";
import { db } from "./client.js";
import {
  attendanceOverrides,
  membershipRoles,
  memberships,
  recurringAbsences,
} from "./schema.js";
import { expectedHeadcount, isoWeekday } from "../lib/attendance.js";

export async function groupHeadcount(
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
  if (!membershipIds.length) return { expected: 0, absent: 0, overrides: 0 };
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
  const expected = expectedHeadcount(
    membershipIds.map((membershipId) => ({
      membershipId,
      recurringAbsent: recurringAbsent.has(membershipId),
      override: overridesByMembership.get(membershipId),
    })),
  );
  return {
    expected,
    absent: membershipIds.length - expected,
    overrides: overrides.length,
  };
}
