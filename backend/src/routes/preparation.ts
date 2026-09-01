import { and, asc, eq, inArray, sql } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "../db/client.js";
import { materializeMealOccurrence } from "../db/domain.js";
import { groupHeadcount } from "../db/headcount.js";
import {
  actionItems,
  mealOccurrenceItems,
  mealOccurrences,
  membershipRoles,
  memberships,
  occurrenceProducers,
  preparationRecords,
  producerLeaves,
  producerOffDays,
} from "../db/schema.js";
import { isCalendarDate, isoWeekday } from "../lib/attendance.js";
import { requireGroupRole } from "../lib/group-auth.js";
import { readJson } from "../lib/http.js";
import type { AppVariables } from "../lib/session.js";

const mealTypes = ["BREAKFAST", "BRUNCH", "LUNCH", "SNACKS", "DINNER"] as const;
const date = z.string().refine(isCalendarDate, "Use a valid YYYY-MM-DD date.");
const offDaysInput = z.object({
  weekdays: z.array(z.number().int().min(1).max(7)),
});
const leaveInput = z.object({
  start: date,
  startMeal: z.enum(mealTypes),
  end: date,
  endMeal: z.enum(mealTypes),
  reason: z.string().trim().min(1).max(500).nullable().optional(),
});
const statusInput = z.object({
  status: z.enum(["UNPREPARED", "PREPARED"]),
});
const actionItemInput = z.object({ text: z.string().trim().min(1).max(500) });
const actionItemUpdateInput = z
  .object({
    completed: z.boolean().optional(),
    text: z.string().trim().min(1).max(500).optional(),
  })
  .refine(
    (value) => value.completed !== undefined || value.text !== undefined,
    {
      message: "Provide an action-item update.",
    },
  );

const actionItemFields = {
  id: actionItems.id,
  text: actionItems.text,
  completed: actionItems.completed,
  createdAt: actionItems.createdAt,
  completedAt: sql<Date | null>`action_items.completed_at`,
  createdByName: sql<string>`(select creator_user.display_name from memberships as creator_membership join users as creator_user on creator_user.id = creator_membership.user_id where creator_membership.id = ${actionItems.createdByMembershipId})`,
  completedByName: sql<
    string | null
  >`(select completer_user.display_name from memberships as completer_membership join users as completer_user on completer_user.id = completer_membership.user_id where completer_membership.id = ${actionItems.completedByMembershipId})`,
};

function mealQuery(context: {
  req: { query(name: string): string | undefined };
}) {
  const mealDate = date.safeParse(context.req.query("date"));
  const mealType = z.enum(mealTypes).safeParse(context.req.query("mealType"));
  if (!mealDate.success || !mealType.success) {
    throw new HTTPException(400, { message: "Invalid date or meal type." });
  }
  return { mealDate: mealDate.data, mealType: mealType.data };
}

export const preparationRoutes = new Hono<{ Variables: AppVariables }>();

preparationRoutes.put("/:groupId/my/producer-off-days", async (context) => {
  const { membership } = await requireGroupRole(
    context,
    context.req.param("groupId"),
    ["PRODUCER"],
  );
  const payload = await readJson(context.req.raw, offDaysInput);
  if (new Set(payload.weekdays).size !== payload.weekdays.length) {
    throw new HTTPException(400, { message: "Off-days must be unique." });
  }
  const weekdays = await db.transaction(async (tx) => {
    await tx
      .delete(producerOffDays)
      .where(eq(producerOffDays.membershipId, membership.id));
    if (!payload.weekdays.length) return [];
    return tx
      .insert(producerOffDays)
      .values(
        payload.weekdays.map((weekday) => ({
          membershipId: membership.id,
          weekday,
        })),
      )
      .returning();
  });
  return context.json({ weekdays: weekdays.map(({ weekday }) => weekday) });
});

preparationRoutes.post("/:groupId/my/leaves", async (context) => {
  const groupId = context.req.param("groupId");
  const { membership } = await requireGroupRole(context, groupId, ["PRODUCER"]);
  const payload = await readJson(context.req.raw, leaveInput);
  const today = new Date().toISOString().slice(0, 10);
  const startIndex = mealTypes.indexOf(payload.startMeal);
  const endIndex = mealTypes.indexOf(payload.endMeal);
  if (
    payload.start < today ||
    payload.end < payload.start ||
    (payload.start === payload.end && endIndex < startIndex)
  )
    throw new HTTPException(400, {
      message: "Choose a valid future leave range.",
    });
  const leaves = [] as Array<{
    mealDate: string;
    mealType: (typeof mealTypes)[number];
  }>;
  for (
    let current = new Date(`${payload.start}T12:00:00Z`);
    current <= new Date(`${payload.end}T12:00:00Z`);
    current.setUTCDate(current.getUTCDate() + 1)
  ) {
    const mealDate = current.toISOString().slice(0, 10);
    for (const mealType of mealTypes) {
      const index = mealTypes.indexOf(mealType);
      if (
        (mealDate !== payload.start || index >= startIndex) &&
        (mealDate !== payload.end || index <= endIndex)
      )
        leaves.push({ mealDate, mealType });
    }
  }
  await db.insert(producerLeaves).values(
    leaves.map((leave) => ({
      ...leave,
      membershipId: membership.id,
      reason: payload.reason ?? null,
    })),
  );
  const occurrences = await db
    .select({ id: mealOccurrences.id })
    .from(mealOccurrences)
    .where(
      and(
        eq(mealOccurrences.groupId, groupId),
        eq(mealOccurrences.mealDate, payload.start),
      ),
    );
  if (occurrences.length)
    await db
      .delete(occurrenceProducers)
      .where(
        and(
          eq(occurrenceProducers.membershipId, membership.id),
          eq(occurrenceProducers.occurrenceId, occurrences[0]!.id),
        ),
      );
  return context.json({ leaves }, 201);
});

preparationRoutes.get("/:groupId/my/leaves", async (context) => {
  const { membership } = await requireGroupRole(
    context,
    context.req.param("groupId"),
    ["PRODUCER"],
  );
  const leaves = await db
    .select({
      id: producerLeaves.id,
      mealDate: producerLeaves.mealDate,
      mealType: producerLeaves.mealType,
      reason: producerLeaves.reason,
    })
    .from(producerLeaves)
    .where(eq(producerLeaves.membershipId, membership.id))
    .orderBy(asc(producerLeaves.mealDate), asc(producerLeaves.mealType));
  return context.json({ leaves });
});

preparationRoutes.get("/:groupId/cook-leaves", async (context) => {
  const groupId = context.req.param("groupId");
  await requireGroupRole(context, groupId, ["ADMIN", "CONSUMER", "PRODUCER"]);
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
        and(eq(memberships.groupId, groupId), eq(memberships.status, "ACTIVE")),
      ),
  ]);
  return context.json({ cookCount: cooks.length, leaves });
});

preparationRoutes.delete("/:groupId/my/leaves", async (context) => {
  const { membership } = await requireGroupRole(
    context,
    context.req.param("groupId"),
    ["PRODUCER"],
  );
  const payload = await readJson(context.req.raw, leaveInput);
  const startIndex = mealTypes.indexOf(payload.startMeal);
  const endIndex = mealTypes.indexOf(payload.endMeal);
  const leaves = await db
    .select({
      id: producerLeaves.id,
      mealDate: producerLeaves.mealDate,
      mealType: producerLeaves.mealType,
    })
    .from(producerLeaves)
    .where(eq(producerLeaves.membershipId, membership.id));
  const ids = leaves
    .filter((leave) => {
      if (leave.mealDate < payload.start || leave.mealDate > payload.end)
        return false;
      const index = mealTypes.indexOf(leave.mealType ?? "BREAKFAST");
      return (
        (leave.mealDate !== payload.start || index >= startIndex) &&
        (leave.mealDate !== payload.end || index <= endIndex)
      );
    })
    .map((leave) => leave.id);
  if (ids.length)
    await db.delete(producerLeaves).where(inArray(producerLeaves.id, ids));
  return context.json({ deleted: ids.length });
});

preparationRoutes.get("/:groupId/cook-availability", async (context) => {
  const groupId = context.req.param("groupId");
  await requireGroupRole(context, groupId, ["ADMIN", "CONSUMER", "PRODUCER"]);
  const { mealDate, mealType } = mealQuery(context);
  const { occurrence } = await db.transaction((tx) =>
    materializeMealOccurrence(tx, {
      groupId,
      mealDate,
      mealType,
      weekday: isoWeekday(mealDate),
    }),
  );
  const [assignment] = await db
    .select({ membershipId: occurrenceProducers.membershipId })
    .from(occurrenceProducers)
    .where(eq(occurrenceProducers.occurrenceId, occurrence.id))
    .limit(1);
  return context.json({ available: Boolean(assignment) });
});

preparationRoutes.get("/:groupId/preparation", async (context) => {
  const groupId = context.req.param("groupId");
  const actor = await requireGroupRole(context, groupId, ["ADMIN", "PRODUCER"]);
  const { mealDate, mealType } = mealQuery(context);
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
  const [headcount, items, actions] = await Promise.all([
    groupHeadcount(groupId, mealDate, mealType),
    db
      .select({
        id: preparationRecords.id,
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
    db
      .select(actionItemFields)
      .from(actionItems)
      .where(eq(actionItems.occurrenceId, occurrence.id))
      .orderBy(asc(actionItems.createdAt)),
  ]);
  return context.json({
    occurrence,
    headcount: headcount.expected,
    items,
    actions,
  });
});

preparationRoutes.patch("/:groupId/preparation/:recordId", async (context) => {
  const groupId = context.req.param("groupId");
  const actor = await requireGroupRole(context, groupId, ["ADMIN", "PRODUCER"]);
  const payload = await readJson(context.req.raw, statusInput);
  const [record] = await db
    .select({
      id: preparationRecords.id,
      status: preparationRecords.status,
      occurrenceId: mealOccurrenceItems.occurrenceId,
    })
    .from(preparationRecords)
    .innerJoin(
      mealOccurrenceItems,
      eq(preparationRecords.occurrenceItemId, mealOccurrenceItems.id),
    )
    .innerJoin(
      mealOccurrences,
      eq(mealOccurrenceItems.occurrenceId, mealOccurrences.id),
    )
    .where(
      and(
        eq(preparationRecords.id, context.req.param("recordId")),
        eq(mealOccurrences.groupId, groupId),
      ),
    )
    .limit(1);
  if (!record)
    throw new HTTPException(404, {
      message: "Preparation item was not found.",
    });
  if (!actor.roles.includes("ADMIN")) {
    const [assigned] = await db
      .select()
      .from(occurrenceProducers)
      .where(
        and(
          eq(occurrenceProducers.occurrenceId, record.occurrenceId),
          eq(occurrenceProducers.membershipId, actor.membership.id),
        ),
      )
      .limit(1);
    if (!assigned)
      throw new HTTPException(403, {
        message: "You are not assigned to this meal.",
      });
  }
  const [updated] = await db
    .update(preparationRecords)
    .set({
      status: payload.status,
      updatedByMembershipId: actor.membership.id,
      updatedAt: new Date(),
    })
    .where(eq(preparationRecords.id, record.id))
    .returning();
  return context.json({ preparation: updated });
});

preparationRoutes.get("/:groupId/action-items", async (context) => {
  const groupId = context.req.param("groupId");
  await requireGroupRole(context, groupId, ["ADMIN", "CONSUMER", "PRODUCER"]);
  const { mealDate, mealType } = mealQuery(context);
  const { occurrence } = await db.transaction((tx) =>
    materializeMealOccurrence(tx, {
      groupId,
      mealDate,
      mealType,
      weekday: isoWeekday(mealDate),
    }),
  );
  const items = await db
    .select({
      ...actionItemFields,
    })
    .from(actionItems)
    .where(eq(actionItems.occurrenceId, occurrence.id))
    .orderBy(asc(actionItems.createdAt));
  return context.json({ items });
});

preparationRoutes.post("/:groupId/action-items", async (context) => {
  const groupId = context.req.param("groupId");
  const actor = await requireGroupRole(context, groupId, [
    "ADMIN",
    "CONSUMER",
    "PRODUCER",
  ]);
  const { mealDate, mealType } = mealQuery(context);
  const payload = await readJson(context.req.raw, actionItemInput);
  const { occurrence } = await db.transaction((tx) =>
    materializeMealOccurrence(tx, {
      groupId,
      mealDate,
      mealType,
      weekday: isoWeekday(mealDate),
    }),
  );
  const [item] = await db
    .insert(actionItems)
    .values({
      occurrenceId: occurrence.id,
      text: payload.text,
      createdByMembershipId: actor.membership.id,
    })
    .returning();
  const [created] = await db
    .select(actionItemFields)
    .from(actionItems)
    .where(eq(actionItems.id, item.id));
  return context.json({ item: created }, 201);
});

preparationRoutes.patch("/:groupId/action-items/:itemId", async (context) => {
  const groupId = context.req.param("groupId");
  const actor = await requireGroupRole(context, groupId, [
    "ADMIN",
    "CONSUMER",
    "PRODUCER",
  ]);
  const payload = await readJson(context.req.raw, actionItemUpdateInput);
  const [item] = await db
    .select({ id: actionItems.id })
    .from(actionItems)
    .innerJoin(
      mealOccurrences,
      eq(actionItems.occurrenceId, mealOccurrences.id),
    )
    .where(
      and(
        eq(actionItems.id, context.req.param("itemId")),
        eq(mealOccurrences.groupId, groupId),
      ),
    )
    .limit(1);
  if (!item)
    throw new HTTPException(404, { message: "Action item was not found." });
  if (payload.text !== undefined)
    await db
      .update(actionItems)
      .set({ text: payload.text })
      .where(eq(actionItems.id, item.id));
  if (payload.completed !== undefined)
    await db.execute(sql`
      update action_items
      set completed = ${payload.completed},
          completed_by_membership_id = ${payload.completed ? actor.membership.id : null},
          completed_at = ${payload.completed ? new Date() : null}
      where id = ${item.id}
    `);
  const [result] = await db
    .select(actionItemFields)
    .from(actionItems)
    .where(eq(actionItems.id, item.id));
  return context.json({ item: result });
});

preparationRoutes.delete("/:groupId/action-items/:itemId", async (context) => {
  const groupId = context.req.param("groupId");
  await requireGroupRole(context, groupId, ["ADMIN", "CONSUMER", "PRODUCER"]);
  const [deleted] = await db
    .delete(actionItems)
    .where(
      and(
        eq(actionItems.id, context.req.param("itemId")),
        sql`${actionItems.occurrenceId} in (select ${mealOccurrences.id} from ${mealOccurrences} where ${mealOccurrences.groupId} = ${groupId})`,
      ),
    )
    .returning({ id: actionItems.id });
  if (!deleted)
    throw new HTTPException(404, { message: "Action item was not found." });
  return context.json({ item: deleted });
});
