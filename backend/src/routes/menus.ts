import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "../db/client.js";
import { groups, mealSchedules, menuItems, weeklyMenus } from "../db/schema.js";
import { groupLocalTime, resolveActiveSchedule } from "../lib/active-meal.js";
import { requireGroupMembership, requireGroupRole } from "../lib/group-auth.js";
import { readJson } from "../lib/http.js";
import type { AppVariables } from "../lib/session.js";

const mealTypes = ["BREAKFAST", "BRUNCH", "LUNCH", "SNACKS", "DINNER"] as const;
const foodCategories = ["VEG", "NON_VEG", "EGG", "VEGAN"] as const;
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
const menuInput = z.object({
  items: z.array(
    z.object({
      name: z.string().trim().min(1).max(120),
      category: z.enum(foodCategories),
      recipeUrl: z
        .string()
        .url()
        .refine((url) => /^https?:\/\//.test(url), "Use an HTTP(S) recipe URL.")
        .nullable()
        .optional(),
      notes: z.string().trim().max(1000).nullable().optional(),
    }),
  ),
});

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
  const menus = await db
    .select()
    .from(weeklyMenus)
    .where(
      weekday
        ? and(
            eq(weeklyMenus.groupId, groupId),
            eq(weeklyMenus.weekday, Number(weekday)),
          )
        : eq(weeklyMenus.groupId, groupId),
    )
    .orderBy(asc(weeklyMenus.weekday), asc(weeklyMenus.mealType));
  const data = await Promise.all(
    menus.map(async (menu) => ({
      ...menu,
      items: await db
        .select()
        .from(menuItems)
        .where(eq(menuItems.menuId, menu.id))
        .orderBy(asc(menuItems.sortOrder)),
    })),
  );
  return context.json({ data });
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
    const [saved] = await tx
      .insert(weeklyMenus)
      .values({ groupId, weekday, mealType: mealType.data })
      .onConflictDoUpdate({
        target: [
          weeklyMenus.groupId,
          weeklyMenus.weekday,
          weeklyMenus.mealType,
        ],
        set: { updatedAt: new Date() },
      })
      .returning();
    await tx.delete(menuItems).where(eq(menuItems.menuId, saved.id));
    if (payload.items.length) {
      await tx.insert(menuItems).values(
        payload.items.map((item, sortOrder) => ({
          ...item,
          menuId: saved.id,
          recipeUrl: item.recipeUrl ?? null,
          notes: item.notes ?? null,
          sortOrder,
        })),
      );
    }
    return saved;
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
  const items = menu
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
