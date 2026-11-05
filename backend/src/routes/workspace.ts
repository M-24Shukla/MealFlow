import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import {
  loadAttendance,
  loadCookLeaves,
  loadDinerOnboarding,
  loadItemAttendance,
  loadMenus,
  loadMenuOverrides,
  loadMyLeaves,
  loadRecurringAbsences,
  loadVacations,
  loadPreparation,
  loadJoinRequests,
  loadGroupMembers,
} from "../db/group-reads.js";
import { isCalendarDate, isoWeekday } from "../lib/attendance.js";
import { requireGroupRole } from "../lib/group-auth.js";
import type { AppVariables } from "../lib/session.js";
import { loadGroupAttendance } from "../db/headcount.js";

export const workspaceRoutes = new Hono<{ Variables: AppVariables }>();
const mealTypes = ["BREAKFAST", "BRUNCH", "LUNCH", "SNACKS", "DINNER"] as const;

workspaceRoutes.get("/:groupId/workspace", async (context) => {
  const mealDate = context.req.query("date");
  if (!mealDate || !isCalendarDate(mealDate)) {
    throw new HTTPException(400, { message: "Use a valid YYYY-MM-DD date." });
  }
  const groupId = context.req.param("groupId");
  const requestedMeal = context.req.query("mealType");
  if (requestedMeal && !mealTypes.some((meal) => meal === requestedMeal)) {
    throw new HTTPException(400, { message: "Invalid meal type." });
  }
  const authStartedAt = performance.now();
  const actor = await requireGroupRole(context, groupId, [
    "ADMIN",
    "CONSUMER",
    "PRODUCER",
  ]);
  const dataStartedAt = performance.now();
  const weekday = isoWeekday(mealDate);
  const templateMenusRequest = loadMenus(
    groupId,
    actor.roles.includes("CONSUMER") ? undefined : String(weekday),
  );
  const menusRequest = Promise.all([
    templateMenusRequest,
    loadMenuOverrides(groupId, mealDate),
  ]).then(([menus, overrides]) =>
    menus
      .filter((menu) => menu.weekday === weekday)
      .map((menu) => {
        const replacement = overrides.find(
          (item) => item.mealType === menu.mealType,
        );
        return {
          id: menu.id,
          weekday: menu.weekday,
          mealType: menu.mealType,
          items: replacement
            ? replacement.items.map((item) => ({ ...item, notes: null }))
            : menu.items.map(({ id, name, category, recipeUrl, notes }) => ({
                id,
                name,
                category,
                recipeUrl,
                notes,
              })),
        };
      }),
  );
  const consumerRequest = actor.roles.includes("CONSUMER")
    ? (async () => {
        const menus = await menusRequest;
        const [rules, overrides, items, vacations, weeklyMenus] =
          await Promise.all([
            loadRecurringAbsences(actor.membership.id),
            loadAttendance(actor.membership.id, mealDate),
            loadItemAttendance(
              actor.membership.id,
              mealDate,
              menus.flatMap((menu) => menu.items.map((item) => item.id)),
            ),
            loadVacations(actor.membership.id),
            templateMenusRequest,
          ]);
        return {
          rules,
          vacations,
          weeklyMenus: weeklyMenus.map(({ id, weekday, mealType, items }) => ({
            id,
            weekday,
            mealType,
            items: items.map(({ id, name, category, recipeUrl, notes }) => ({
              id,
              name,
              category,
              recipeUrl,
              notes,
            })),
          })),
          overrides,
          recurringAbsentItemIds: items.recurringAbsentItemIds,
          itemOverrides: items.overrides,
          onboardingCompleted: Boolean(
            actor.membership.dinerOnboardingCompletedAt,
          ),
        };
      })()
    : null;
  const producerRequest = actor.roles.includes("PRODUCER")
    ? (async () => {
        const [dayMenus, attendance] = await Promise.all([
          menusRequest,
          loadGroupAttendance(groupId, mealDate),
        ]);
        const menus = dayMenus.filter((menu) => menu.items.length);
        const selectedMeal =
          menus.find((menu) => menu.mealType === requestedMeal)?.mealType ??
          menus[0]?.mealType;
        let preparation = null;
        let preparationError: string | null = null;
        if (selectedMeal) {
          try {
            preparation = await loadPreparation(
              groupId,
              actor,
              mealDate,
              selectedMeal,
              attendance,
            );
          } catch (error) {
            if (!(error instanceof HTTPException) || error.status !== 403)
              throw error;
            preparationError = error.message;
          }
        }
        return {
          leaves: await loadMyLeaves(actor.membership.id, mealDate),
          onboardingCompleted: Boolean(
            actor.membership.cookOnboardingCompletedAt,
          ),
          mealType: selectedMeal ?? null,
          headcounts: Object.fromEntries(
            menus.map((menu) => [
              menu.mealType,
              attendance.get(menu.mealType)!.presentMembershipIds.length,
            ]),
          ),
          preparation,
          preparationError,
        };
      })()
    : null;
  const [menus, cooks, consumer, producer] = await Promise.all([
    menusRequest,
    loadCookLeaves(groupId, mealDate),
    consumerRequest,
    producerRequest,
  ]);
  context.header("Cache-Control", "private, no-store");
  context.header(
    "Server-Timing",
    `groupAuth;dur=${(dataStartedAt - authStartedAt).toFixed(1)}, workspaceData;dur=${(performance.now() - dataStartedAt).toFixed(1)}`,
    { append: true },
  );
  return context.json({
    date: mealDate,
    menus,
    cooks,
    actionItems: [],
    consumer,
    producer,
  });
});

// Full preferences remain available for tours and menu editing on demand.
workspaceRoutes.get("/:groupId/workspace/preferences", async (context) => {
  const groupId = context.req.param("groupId");
  const actor = await requireGroupRole(context, groupId, [
    "ADMIN",
    "CONSUMER",
    "PRODUCER",
  ]);
  const [menus, consumer, producer] = await Promise.all([
    loadMenus(groupId),
    actor.roles.includes("CONSUMER")
      ? Promise.all([
          loadRecurringAbsences(actor.membership.id),
          loadVacations(actor.membership.id),
          loadDinerOnboarding(actor.membership.id),
        ]).then(([rules, vacations, onboarding]) => ({
          rules,
          vacations,
          onboarding,
        }))
      : null,
    actor.roles.includes("PRODUCER")
      ? loadMyLeaves(actor.membership.id).then((leaves) => ({ leaves }))
      : null,
  ]);
  context.header("Cache-Control", "private, no-store");
  return context.json({ menus, consumer, producer });
});

workspaceRoutes.get("/:groupId/workspace/admin", async (context) => {
  const groupId = context.req.param("groupId");
  await requireGroupRole(context, groupId, ["ADMIN"]);
  const [requests, members] = await Promise.all([
    loadJoinRequests(groupId),
    loadGroupMembers(groupId),
  ]);
  context.header("Cache-Control", "private, no-store");
  return context.json({ requests, members });
});
