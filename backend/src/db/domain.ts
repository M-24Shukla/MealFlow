import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import type { NodePgDatabase } from "drizzle-orm/node-postgres";
import type * as schema from "./schema.js";
import {
  mealOccurrences,
  mealOccurrenceItems,
  menuItems,
  membershipRoles,
  memberships,
  occurrenceProducers,
  preparationRecords,
  producerLeaves,
  producerOffDays,
  type mealType,
  type membershipRole,
  weeklyMenus,
} from "./schema.js";

type Database = NodePgDatabase<typeof schema>;

export async function activateMembershipWithRole(
  tx: Database,
  input: {
    groupId: string;
    userId: string;
    role: (typeof membershipRole.enumValues)[number];
  },
) {
  const [membership] = await tx
    .insert(memberships)
    .values({ groupId: input.groupId, userId: input.userId })
    .onConflictDoUpdate({
      target: [memberships.groupId, memberships.userId],
      set: { status: "ACTIVE" },
    })
    .returning();
  await tx
    .insert(membershipRoles)
    .values({ membershipId: membership.id, role: input.role })
    .onConflictDoNothing();
  return membership;
}

export async function upsertMealOccurrence(
  tx: Database,
  input: {
    groupId: string;
    mealDate: string;
    mealType: (typeof mealType.enumValues)[number];
    weeklyMenuId?: string | null;
  },
) {
  const [occurrence] = await tx
    .insert(mealOccurrences)
    .values(input)
    .onConflictDoUpdate({
      target: [
        mealOccurrences.groupId,
        mealOccurrences.mealDate,
        mealOccurrences.mealType,
      ],
      set: { id: sql`${mealOccurrences.id}` },
    })
    .returning();
  return occurrence;
}

export async function materializeMealOccurrence(
  tx: Database,
  input: {
    groupId: string;
    mealDate: string;
    mealType: (typeof mealType.enumValues)[number];
    weekday: number;
  },
) {
  const [menu] = await tx
    .select({ id: weeklyMenus.id })
    .from(weeklyMenus)
    .where(
      and(
        eq(weeklyMenus.groupId, input.groupId),
        eq(weeklyMenus.weekday, input.weekday),
        eq(weeklyMenus.mealType, input.mealType),
      ),
    )
    .limit(1);
  const occurrence = await upsertMealOccurrence(tx, {
    groupId: input.groupId,
    mealDate: input.mealDate,
    mealType: input.mealType,
    weeklyMenuId: menu?.id ?? null,
  });
  if (!occurrence.materializedAt) {
    const templateItems = menu
      ? await tx
          .select()
          .from(menuItems)
          .where(eq(menuItems.menuId, menu.id))
          .orderBy(asc(menuItems.sortOrder))
      : [];
    if (templateItems.length) {
      await tx.insert(mealOccurrenceItems).values(
        templateItems.map((item) => ({
          occurrenceId: occurrence.id,
          sourceMenuItemId: item.id,
          name: item.name,
          category: item.category,
          recipeUrl: item.recipeUrl,
          sortOrder: item.sortOrder,
        })),
      );
    }
    await tx
      .update(mealOccurrences)
      .set({ materializedAt: new Date() })
      .where(eq(mealOccurrences.id, occurrence.id));
  }
  const items = await tx
    .select()
    .from(mealOccurrenceItems)
    .where(eq(mealOccurrenceItems.occurrenceId, occurrence.id))
    .orderBy(asc(mealOccurrenceItems.sortOrder));
  if (items.length) {
    await tx
      .insert(preparationRecords)
      .values(items.map((item) => ({ occurrenceItemId: item.id })))
      .onConflictDoNothing();
  }

  const producerMemberships = await tx
    .select({ id: memberships.id })
    .from(memberships)
    .innerJoin(
      membershipRoles,
      eq(membershipRoles.membershipId, memberships.id),
    )
    .where(
      and(
        eq(memberships.groupId, input.groupId),
        eq(memberships.status, "ACTIVE"),
        eq(membershipRoles.role, "PRODUCER"),
      ),
    );
  const producerIds = producerMemberships.map(({ id }) => id);
  if (producerIds.length) {
    const [offDays, leaves] = await Promise.all([
      tx
        .select({ membershipId: producerOffDays.membershipId })
        .from(producerOffDays)
        .where(
          and(
            inArray(producerOffDays.membershipId, producerIds),
            eq(producerOffDays.weekday, input.weekday),
          ),
        ),
      tx
        .select({ membershipId: producerLeaves.membershipId })
        .from(producerLeaves)
        .where(
          and(
            inArray(producerLeaves.membershipId, producerIds),
            eq(producerLeaves.mealDate, input.mealDate),
            or(
              isNull(producerLeaves.mealType),
              eq(producerLeaves.mealType, input.mealType),
            ),
          ),
        ),
    ]);
    const unavailable = new Set([
      ...offDays.map(({ membershipId }) => membershipId),
      ...leaves.map(({ membershipId }) => membershipId),
    ]);
    const available = producerIds.filter((id) => !unavailable.has(id));
    if (available.length) {
      await tx
        .insert(occurrenceProducers)
        .values(
          available.map((membershipId) => ({
            occurrenceId: occurrence.id,
            membershipId,
          })),
        )
        .onConflictDoNothing();
    }
  }
  return { occurrence, items };
}

export async function rolesForMembership(tx: Database, membershipId: string) {
  return tx
    .select({ role: membershipRoles.role })
    .from(membershipRoles)
    .where(eq(membershipRoles.membershipId, membershipId));
}
