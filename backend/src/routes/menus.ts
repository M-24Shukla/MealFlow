import {
  loadMenus,
  loadFoodItems,
  loadMenuOverrides,
} from "../db/group-reads.js";
import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "../db/client.js";
import { materializeMealOccurrence } from "../db/domain.js";
import {
  groups,
  mealOccurrenceItems,
  mealOccurrences,
  mealSchedules,
  menuItems,
  weeklyMenus,
} from "../db/schema.js";
import { isCalendarDate, isoWeekday } from "../lib/attendance.js";
import { groupLocalTime, resolveActiveSchedule } from "../lib/active-meal.js";
import { requireGroupMembership, requireGroupRole } from "../lib/group-auth.js";
import { menuInput, menuImportInput } from "../lib/menu-import.js";
import { readJson } from "../lib/http.js";
import type { AppVariables } from "../lib/session.js";

const mealTypes = ["BREAKFAST", "BRUNCH", "LUNCH", "SNACKS", "DINNER"] as const;

const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Use HH:MM time.");
const scheduleInput = z.object({
  entries: z.array(
    z.object({
      weekday: z.number().int().min(1).max(7),
      mealType: z.enum(mealTypes),
      startTime: time,
      endTime: time,
      enabled: z.boolean(),
    }),
  ),
});
const date = z.string().refine(isCalendarDate, "Use a valid YYYY-MM-DD date.");
const replacementInput = menuInput.shape.items.element;

function assertValidSchedule(
  entries: z.infer<typeof scheduleInput>["entries"],
) {
  const seen = new Set<string>();
  for (const entry of entries) {
    if (entry.startTime >= entry.endTime) {
      throw new HTTPException(400, {
        message: "A meal start time must be before its end time.",
      });
    }
    const key = `${entry.weekday}:${entry.mealType}`;
    if (seen.has(key)) {
      throw new HTTPException(400, {
        message: "A meal can appear only once per weekday.",
      });
    }
    seen.add(key);
  }
  const enabled = entries.filter((entry) => entry.enabled);
  for (let weekday = 1; weekday <= 7; weekday += 1) {
    const windows = enabled
      .filter((entry) => entry.weekday === weekday)
      .sort((left, right) => left.startTime.localeCompare(right.startTime));
    for (let index = 1; index < windows.length; index += 1) {
      if (windows[index - 1]!.endTime > windows[index]!.startTime) {
        throw new HTTPException(400, {
          message: "Enabled meal windows cannot overlap on the same weekday.",
        });
      }
    }
  }
}

type MenuTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
async function saveWeeklyMenu(
  tx: MenuTransaction,
  groupId: string,
  weekday: number,
  mealType: (typeof mealTypes)[number],
  items: z.infer<typeof menuInput>["items"],
) {
  const [saved] = await tx
    .insert(weeklyMenus)
    .values({ groupId, weekday, mealType })
    .onConflictDoUpdate({
      target: [weeklyMenus.groupId, weeklyMenus.weekday, weeklyMenus.mealType],
      set: { updatedAt: new Date() },
    })
    .returning();
  await tx.delete(menuItems).where(eq(menuItems.menuId, saved.id));
  if (items.length) {
    await tx.insert(menuItems).values(
      items.map((item, sortOrder) => ({
        ...item,
        menuId: saved.id,
        recipeUrl: item.recipeUrl ?? null,
        notes: item.notes ?? null,
        sortOrder,
      })),
    );
  }
  return saved;
}

export const menuRoutes = new Hono<{ Variables: AppVariables }>();

menuRoutes.get("/:groupId/schedule", async (context) => {
  const groupId = context.req.param("groupId");
  await requireGroupMembership(context, groupId);
  const entries = await db
    .select()
    .from(mealSchedules)
    .where(eq(mealSchedules.groupId, groupId))
    .orderBy(asc(mealSchedules.weekday), asc(mealSchedules.startTime));
  return context.json({ entries });
});

menuRoutes.put("/:groupId/schedule", async (context) => {
  const groupId = context.req.param("groupId");
  await requireGroupRole(context, groupId, ["ADMIN"]);
  const payload = await readJson(context.req.raw, scheduleInput);
  assertValidSchedule(payload.entries);
  const entries = await db.transaction(async (tx) => {
    await tx.delete(mealSchedules).where(eq(mealSchedules.groupId, groupId));
    if (payload.entries.length) {
      return tx
        .insert(mealSchedules)
        .values(payload.entries.map((entry) => ({ ...entry, groupId })))
        .returning();
    }
    return [];
  });
  return context.json({ entries });
});

menuRoutes.get("/:groupId/menus", async (context) => {
  const groupId = context.req.param("groupId");
  await requireGroupMembership(context, groupId);
  const weekday = context.req.query("weekday");
  if (weekday && !/^[1-7]$/.test(weekday)) {
    throw new HTTPException(400, {
      message: "weekday must be between 1 and 7.",
    });
  }
  const result = await loadMenus(groupId, weekday);
  return context.json({ data: result });
});

menuRoutes.get("/:groupId/food-items", async (context) => {
  const groupId = context.req.param("groupId");
  await requireGroupMembership(context, groupId);
  const result = await loadFoodItems(groupId);
  return context.json({ data: result });
});

menuRoutes.get("/:groupId/menu-overrides", async (context) => {
  const groupId = context.req.param("groupId");
  await requireGroupMembership(context, groupId);
  const mealDate = date.safeParse(context.req.query("date"));
  if (!mealDate.success) {
    throw new HTTPException(400, { message: "Invalid date." });
  }
  const result = await loadMenuOverrides(groupId, mealDate.data);
  return context.json({ data: result });
});

menuRoutes.put(
  "/:groupId/menu-overrides/:date/:mealType/items/:itemId",
  async (context) => {
    const groupId = context.req.param("groupId");
    await requireGroupRole(context, groupId, ["CONSUMER"]);
    const mealDate = date.safeParse(context.req.param("date"));
    const mealType = z.enum(mealTypes).safeParse(context.req.param("mealType"));
    const itemId = z.string().uuid().safeParse(context.req.param("itemId"));
    if (!mealDate.success || !mealType.success || !itemId.success) {
      throw new HTTPException(400, {
        message: "Invalid date, meal type, or dish.",
      });
    }
    const payload = await readJson(context.req.raw, replacementInput);
    const result = await db.transaction(async (tx) => {
      const { occurrence, items } = await materializeMealOccurrence(tx, {
        groupId,
        mealDate: mealDate.data,
        mealType: mealType.data,
        weekday: isoWeekday(mealDate.data),
      });
      const item = items.find(
        (candidate) =>
          candidate.id === itemId.data ||
          candidate.sourceMenuItemId === itemId.data,
      );
      if (!item) {
        throw new HTTPException(404, {
          message: "The selected dish is not part of this meal.",
        });
      }
      const [replacement] = await tx
        .update(mealOccurrenceItems)
        .set({
          sourceMenuItemId: null,
          name: payload.name,
          category: payload.category,
          recipeUrl: payload.recipeUrl ?? null,
        })
        .where(
          and(
            eq(mealOccurrenceItems.id, item.id),
            eq(mealOccurrenceItems.occurrenceId, occurrence.id),
          ),
        )
        .returning();
      await tx
        .update(mealOccurrences)
        .set({ isMenuOverridden: true })
        .where(eq(mealOccurrences.id, occurrence.id));
      const updatedItems = await tx
        .select({
          id: mealOccurrenceItems.id,
          name: mealOccurrenceItems.name,
          category: mealOccurrenceItems.category,
          recipeUrl: mealOccurrenceItems.recipeUrl,
        })
        .from(mealOccurrenceItems)
        .where(eq(mealOccurrenceItems.occurrenceId, occurrence.id))
        .orderBy(asc(mealOccurrenceItems.sortOrder));
      return { replacement, items: updatedItems };
    });
    return context.json(result);
  },
);

menuRoutes.post("/:groupId/menus/import", async (context) => {
  const groupId = context.req.param("groupId");
  await requireGroupRole(context, groupId, ["ADMIN"]);
  const body = await context.req.json().catch(() => {
    throw new HTTPException(400, {
      message: "Paste valid JSON without markdown fences or extra text.",
    });
  });
  const parsed = menuImportInput.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]!;
    throw new HTTPException(400, {
      message: `${issue.path.join(".") || "menu"}: ${issue.message}`,
    });
  }
  const payload = parsed.data;
  await db.transaction(async (tx) => {
    for (const menu of payload.menus) {
      await saveWeeklyMenu(
        tx,
        groupId,
        menu.weekday,
        menu.mealType,
        menu.items,
      );
    }
  });
  return context.json({ imported: payload.menus.length });
});

menuRoutes.put("/:groupId/menus/:weekday/:mealType", async (context) => {
  const groupId = context.req.param("groupId");
  await requireGroupRole(context, groupId, ["ADMIN"]);
  const weekday = Number(context.req.param("weekday"));
  const mealType = z.enum(mealTypes).safeParse(context.req.param("mealType"));
  if (
    !Number.isInteger(weekday) ||
    weekday < 1 ||
    weekday > 7 ||
    !mealType.success
  ) {
    throw new HTTPException(400, { message: "Invalid weekday or meal type." });
  }
  const payload = await readJson(context.req.raw, menuInput);
  const menu = await db.transaction(async (tx) => {
    return saveWeeklyMenu(tx, groupId, weekday, mealType.data, payload.items);
  });
  const items = await db
    .select()
    .from(menuItems)
    .where(eq(menuItems.menuId, menu.id))
    .orderBy(asc(menuItems.sortOrder));
  return context.json({ menu: { ...menu, items } });
});

menuRoutes.get("/:groupId/active-meal", async (context) => {
  const groupId = context.req.param("groupId");
  await requireGroupMembership(context, groupId);
  const requestedAt = context.req.query("at");
  const at = requestedAt ? new Date(requestedAt) : new Date();
  if (Number.isNaN(at.getTime())) {
    throw new HTTPException(400, { message: "at must be an ISO timestamp." });
  }
  const [group] = await db
    .select()
    .from(groups)
    .where(eq(groups.id, groupId))
    .limit(1);
  if (!group) throw new HTTPException(404, { message: "Group was not found." });
  const local = groupLocalTime(at, group.timezone);
  const schedules = await db
    .select()
    .from(mealSchedules)
    .where(
      and(eq(mealSchedules.groupId, groupId), eq(mealSchedules.enabled, true)),
    );
  const schedule = resolveActiveSchedule(schedules, local);
  if (!schedule) return context.json({ activeMeal: null });

  const [menu] = await db
    .select()
    .from(weeklyMenus)
    .where(
      and(
        eq(weeklyMenus.groupId, groupId),
        eq(weeklyMenus.weekday, local.weekday),
        eq(weeklyMenus.mealType, schedule.mealType),
      ),
    )
    .limit(1);
  const [occurrence] = await db
    .select({ id: mealOccurrences.id })
    .from(mealOccurrences)
    .where(
      and(
        eq(mealOccurrences.groupId, groupId),
        eq(mealOccurrences.mealDate, local.date),
        eq(mealOccurrences.mealType, schedule.mealType),
        eq(mealOccurrences.isMenuOverridden, true),
      ),
    )
    .limit(1);
  const items = occurrence
    ? await db
        .select()
        .from(mealOccurrenceItems)
        .where(eq(mealOccurrenceItems.occurrenceId, occurrence.id))
        .orderBy(asc(mealOccurrenceItems.sortOrder))
    : menu
      ? await db
          .select()
          .from(menuItems)
          .where(eq(menuItems.menuId, menu.id))
          .orderBy(asc(menuItems.sortOrder))
      : [];
  return context.json({
    activeMeal: {
      date: local.date,
      mealType: schedule.mealType,
      startsAt: `${local.date}T${schedule.startTime.slice(0, 5)}:00`,
      endsAt: `${local.date}T${schedule.endTime.slice(0, 5)}:00`,
      timezone: group.timezone,
      items,
    },
  });
});
