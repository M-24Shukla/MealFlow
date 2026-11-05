import { HTTPException } from "hono/http-exception";
import { materializeMealOccurrence } from "./domain.js";
import {
  groupHeadcount,
  groupItemHeadcounts,
  loadGroupAttendance,
  type DayAttendance,
} from "./headcount.js";
import { isoWeekday } from "../lib/attendance.js";
import type { GroupRole } from "../lib/group-auth.js";
import { and, asc, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "./client.js";
import { groupJoinedRows } from "./group-joined-rows.js";
import {
  occurrenceProducers,
  preparationRecords,
  type mealType as MealTypeEnum,
  joinRequests,
  users,
  actionItems,
  attendanceOverrides,
  dinerDietaryPreferences,
  dinerItemAttendanceOverrides,
  dinerMenuItemAbsences,
  mealOccurrenceItems,
  mealOccurrences,
  membershipRoles,
  memberships,
  menuItems,
  producerLeaves,
  recurringAbsences,
  vacations,
  weeklyMenus,
  groups,
} from "./schema.js";

export const actionItemFields = {
  id: actionItems.id,
  text: actionItems.text,
  dueDate: actionItems.dueDate,
  completed: actionItems.completed,
  createdAt: actionItems.createdAt,
  completedAt: sql<Date | null>`action_items.completed_at`,
  createdByName: sql<string>`(select creator_user.display_name from memberships as creator_membership join users as creator_user on creator_user.id = creator_membership.user_id where creator_membership.id = ${actionItems.createdByMembershipId})`,
  completedByName: sql<
    string | null
  >`(select completer_user.display_name from memberships as completer_membership join users as completer_user on completer_user.id = completer_membership.user_id where completer_membership.id = ${actionItems.completedByMembershipId})`,
};

export async function loadMenus(groupId: string, weekday?: string) {
  const rows = await db
    .select({ parent: weeklyMenus, item: menuItems })
    .from(weeklyMenus)
    .leftJoin(menuItems, eq(menuItems.menuId, weeklyMenus.id))
    .where(
      weekday
        ? and(
            eq(weeklyMenus.groupId, groupId),
            eq(weeklyMenus.weekday, Number(weekday)),
          )
        : eq(weeklyMenus.groupId, groupId),
    )
    .orderBy(
      asc(weeklyMenus.weekday),
      asc(weeklyMenus.mealType),
      asc(menuItems.sortOrder),
    );
  const data = groupJoinedRows(rows);
  return data;
}

export async function loadFoodItems(groupId: string) {
  const [templateItems, datedItems] = await Promise.all([
    db
      .select({
        id: menuItems.id,
        name: menuItems.name,
        category: menuItems.category,
        recipeUrl: menuItems.recipeUrl,
        notes: menuItems.notes,
      })
      .from(menuItems)
      .innerJoin(weeklyMenus, eq(menuItems.menuId, weeklyMenus.id))
      .where(eq(weeklyMenus.groupId, groupId)),
    db
      .select({
        id: mealOccurrenceItems.id,
        name: mealOccurrenceItems.name,
        category: mealOccurrenceItems.category,
        recipeUrl: mealOccurrenceItems.recipeUrl,
      })
      .from(mealOccurrenceItems)
      .innerJoin(
        mealOccurrences,
        eq(mealOccurrenceItems.occurrenceId, mealOccurrences.id),
      )
      .where(
        and(
          eq(mealOccurrences.groupId, groupId),
          eq(mealOccurrences.isMenuOverridden, true),
        ),
      ),
  ]);
  const items = new Map(
    [
      ...templateItems,
      ...datedItems.map((item) => ({ ...item, notes: null })),
    ].map((item) => [
      `${item.category}:${item.name.trim().toLocaleLowerCase()}`,
      item,
    ]),
  );
  return [...items.values()];
}

export async function loadMenuOverrides(groupId: string, mealDate: string) {
  const rows = await db
    .select({
      parent: { id: mealOccurrences.id, mealType: mealOccurrences.mealType },
      item: {
        id: mealOccurrenceItems.id,
        name: mealOccurrenceItems.name,
        category: mealOccurrenceItems.category,
        recipeUrl: mealOccurrenceItems.recipeUrl,
      },
    })
    .from(mealOccurrences)
    .leftJoin(
      mealOccurrenceItems,
      eq(mealOccurrenceItems.occurrenceId, mealOccurrences.id),
    )
    .where(
      and(
        eq(mealOccurrences.groupId, groupId),
        eq(mealOccurrences.mealDate, mealDate),
        eq(mealOccurrences.isMenuOverridden, true),
      ),
    )
    .orderBy(asc(mealOccurrences.mealType), asc(mealOccurrenceItems.sortOrder));
  const data = groupJoinedRows(rows).map(({ mealType, items }) => ({
    mealType,
    items,
  }));
  return data;
}

export async function loadDinerOnboarding(membershipId: string) {
  const [[onboarding], absences, dietaryPreferences] = await Promise.all([
    db
      .select({ completedAt: memberships.dinerOnboardingCompletedAt })
      .from(memberships)
      .where(eq(memberships.id, membershipId))
      .limit(1),
    db
      .select({ menuItemId: dinerMenuItemAbsences.menuItemId })
      .from(dinerMenuItemAbsences)
      .where(eq(dinerMenuItemAbsences.membershipId, membershipId)),
    db
      .select({ category: dinerDietaryPreferences.category })
      .from(dinerDietaryPreferences)
      .where(eq(dinerDietaryPreferences.membershipId, membershipId)),
  ]);
  return {
    completed: Boolean(onboarding?.completedAt),
    absentMenuItemIds: absences.map(({ menuItemId }) => menuItemId),
    dietaryCategories: dietaryPreferences.map(({ category }) => category),
  };
}

export async function loadItemAttendance(
  membershipId: string,
  mealDate: string,
  itemIds?: string[],
) {
  const [recurringAbsences, overrides] = await Promise.all([
    db
      .select({ itemId: dinerMenuItemAbsences.menuItemId })
      .from(dinerMenuItemAbsences)
      .where(
        and(
          eq(dinerMenuItemAbsences.membershipId, membershipId),
          itemIds
            ? inArray(dinerMenuItemAbsences.menuItemId, itemIds)
            : undefined,
        ),
      ),
    db
      .select({
        itemId: dinerItemAttendanceOverrides.itemId,
        mealType: dinerItemAttendanceOverrides.mealType,
        attendance: dinerItemAttendanceOverrides.attendance,
      })
      .from(dinerItemAttendanceOverrides)
      .where(
        and(
          eq(dinerItemAttendanceOverrides.membershipId, membershipId),
          eq(dinerItemAttendanceOverrides.mealDate, mealDate),
        ),
      ),
  ]);
  return {
    recurringAbsentItemIds: recurringAbsences.map(({ itemId }) => itemId),
    overrides,
  };
}

export async function loadRecurringAbsences(
  membershipId: string,
  weekday?: number,
) {
  const rules = await db
    .select({
      weekday: recurringAbsences.weekday,
      mealType: recurringAbsences.mealType,
    })
    .from(recurringAbsences)
    .where(
      and(
        eq(recurringAbsences.membershipId, membershipId),
        weekday === undefined
          ? undefined
          : eq(recurringAbsences.weekday, weekday),
      ),
    );
  return rules;
}

export async function loadAttendance(membershipId: string, mealDate: string) {
  const overrides = await db
    .select({
      mealDate: attendanceOverrides.mealDate,
      mealType: attendanceOverrides.mealType,
      attendance: attendanceOverrides.attendance,
    })
    .from(attendanceOverrides)
    .where(
      and(
        eq(attendanceOverrides.membershipId, membershipId),
        eq(attendanceOverrides.mealDate, mealDate),
      ),
    );
  return overrides;
}

export async function loadVacations(membershipId: string) {
  const vacationsForMember = await db
    .select({
      id: vacations.id,
      startDate: vacations.startDate,
      startMeal: vacations.startMeal,
      endDate: vacations.endDate,
      endMeal: vacations.endMeal,
    })
    .from(vacations)
    .where(eq(vacations.membershipId, membershipId))
    .orderBy(asc(vacations.startDate));
  return vacationsForMember;
}

export async function loadCookOnboarding(membershipId: string) {
  const [onboarding] = await db
    .select({ completedAt: memberships.cookOnboardingCompletedAt })
    .from(memberships)
    .where(eq(memberships.id, membershipId))
    .limit(1);
  return Boolean(onboarding?.completedAt);
}

export async function loadMyLeaves(membershipId: string, mealDate?: string) {
  const leaves = await db
    .select({
      id: producerLeaves.id,
      mealDate: producerLeaves.mealDate,
      mealType: producerLeaves.mealType,
      reason: producerLeaves.reason,
    })
    .from(producerLeaves)
    .where(
      and(
        eq(producerLeaves.membershipId, membershipId),
        mealDate ? eq(producerLeaves.mealDate, mealDate) : undefined,
      ),
    )
    .orderBy(asc(producerLeaves.mealDate), asc(producerLeaves.mealType));
  return leaves;
}

export async function loadCookLeaves(groupId: string, mealDate?: string) {
  const [cooks, leaves] = await Promise.all([
    db
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
          eq(membershipRoles.role, "PRODUCER"),
        ),
      ),
    db
      .select({
        membershipId: producerLeaves.membershipId,
        mealDate: producerLeaves.mealDate,
        mealType: producerLeaves.mealType,
        reason: producerLeaves.reason,
      })
      .from(producerLeaves)
      .innerJoin(memberships, eq(producerLeaves.membershipId, memberships.id))
      .where(
        and(
          eq(memberships.groupId, groupId),
          eq(memberships.status, "ACTIVE"),
          mealDate ? eq(producerLeaves.mealDate, mealDate) : undefined,
        ),
      ),
  ]);
  return { cookCount: cooks.length, leaves };
}

export async function loadActionItems(
  groupId: string,
  mealDate?: string,
  status?: "PENDING" | "COMPLETED",
) {
  const items = await db
    .select({
      ...actionItemFields,
    })
    .from(actionItems)
    .where(
      and(
        eq(actionItems.groupId, groupId),
        mealDate ? eq(actionItems.dueDate, mealDate) : undefined,
        status ? eq(actionItems.completed, status === "COMPLETED") : undefined,
      ),
    )
    .orderBy(desc(actionItems.dueDate), desc(actionItems.createdAt));
  return items;
}

export async function loadPreparation(
  groupId: string,
  actor: { membership: { id: string }; roles: GroupRole[] },
  mealDate: string,
  mealType: (typeof MealTypeEnum.enumValues)[number],
  attendance?: DayAttendance,
) {
  const { occurrence } = await db.transaction((tx) =>
    materializeMealOccurrence(tx, {
      groupId,
      mealDate,
      mealType,
      weekday: isoWeekday(mealDate),
    }),
  );
  if (!actor.roles.includes("ADMIN")) {
    const [assigned] = await db
      .select()
      .from(occurrenceProducers)
      .where(
        and(
          eq(occurrenceProducers.occurrenceId, occurrence.id),
          eq(occurrenceProducers.membershipId, actor.membership.id),
        ),
      )
      .limit(1);
    if (!assigned)
      throw new HTTPException(403, {
        message: "You are not assigned to this meal.",
      });
  }
  const snapshot = attendance ?? (await loadGroupAttendance(groupId, mealDate));
  const [headcount, items] = await Promise.all([
    groupHeadcount(groupId, mealDate, mealType, snapshot),
    db
      .select({
        id: preparationRecords.id,
        occurrenceItemId: mealOccurrenceItems.id,
        sourceMenuItemId: mealOccurrenceItems.sourceMenuItemId,
        name: mealOccurrenceItems.name,
        category: mealOccurrenceItems.category,
        recipeUrl: mealOccurrenceItems.recipeUrl,
        sortOrder: mealOccurrenceItems.sortOrder,
        status: preparationRecords.status,
        updatedByMembershipId: preparationRecords.updatedByMembershipId,
        updatedAt: preparationRecords.updatedAt,
      })
      .from(preparationRecords)
      .innerJoin(
        mealOccurrenceItems,
        eq(preparationRecords.occurrenceItemId, mealOccurrenceItems.id),
      )
      .where(eq(mealOccurrenceItems.occurrenceId, occurrence.id))
      .orderBy(asc(mealOccurrenceItems.sortOrder)),
  ]);
  const itemHeadcounts = await groupItemHeadcounts(
    groupId,
    mealDate,
    mealType,
    items.map(({ occurrenceItemId, sourceMenuItemId }) => ({
      id: occurrenceItemId,
      sourceMenuItemId,
    })),
    snapshot,
  );
  return {
    occurrence,
    headcount: headcount.expected,
    items: items.map(({ occurrenceItemId, ...item }) => ({
      ...item,
      expectedDiners: itemHeadcounts.get(occurrenceItemId) ?? 0,
    })),
  };
}

export async function loadJoinRequests(groupId: string) {
  const requests = await db
    .select({
      id: joinRequests.id,
      requestedRole: joinRequests.requestedRole,
      createdAt: joinRequests.createdAt,
      applicantName: users.displayName,
      applicantEmail: users.email,
    })
    .from(joinRequests)
    .innerJoin(users, eq(users.id, joinRequests.applicantId))
    .where(
      and(
        eq(joinRequests.groupId, groupId),
        eq(joinRequests.status, "PENDING"),
      ),
    );
  return requests;
}

export async function loadGroupMembers(groupId: string) {
  const rows = await db
    .select({
      membershipId: memberships.id,
      userId: users.id,
      isCreator: sql<boolean>`${memberships.userId} = ${groups.creatorId}`,
      displayName: users.displayName,
      email: users.email,
      role: membershipRoles.role,
    })
    .from(memberships)
    .innerJoin(groups, eq(groups.id, memberships.groupId))
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(
      membershipRoles,
      eq(membershipRoles.membershipId, memberships.id),
    )
    .where(
      and(eq(memberships.groupId, groupId), eq(memberships.status, "ACTIVE")),
    );
  const members = new Map<
    string,
    {
      membershipId: string;
      userId: string;
      isCreator: boolean;
      displayName: string;
      email: string;
      roles: string[];
    }
  >();
  for (const row of rows) {
    const member = members.get(row.membershipId);
    if (member) member.roles.push(row.role);
    else {
      members.set(row.membershipId, {
        membershipId: row.membershipId,
        userId: row.userId,
        isCreator: row.isCreator,
        displayName: row.displayName,
        email: row.email,
        roles: [row.role],
      });
    }
  }
  return [...members.values()];
}
