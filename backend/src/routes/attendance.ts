import { and, asc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "../db/client.js";
import { materializeMealOccurrence } from "../db/domain.js";
import {
  attendanceOverrides,
  feedback,
  mealOccurrences,
  membershipRoles,
  memberships,
  recurringAbsences,
  vacations,
  weeklyMenus,
} from "../db/schema.js";
import {
  expectedHeadcount,
  isCalendarDate,
  isoWeekday,
} from "../lib/attendance.js";
import { requireGroupRole } from "../lib/group-auth.js";
import { readJson } from "../lib/http.js";
import type { AppVariables } from "../lib/session.js";

const mealTypes = ["BREAKFAST", "BRUNCH", "LUNCH", "SNACKS", "DINNER"] as const;
const date = z.string().refine(isCalendarDate, "Use a valid YYYY-MM-DD date.");
const recurringAbsenceInput = z.object({
  rules: z.array(
    z.object({
      weekday: z.number().int().min(1).max(7),
      mealType: z.enum(mealTypes),
    }),
  ),
});
const attendanceInput = z.object({ attendance: z.enum(["PRESENT", "ABSENT"]) });
const vacationInput = z.object({
  start: date,
  startMeal: z.enum(mealTypes),
  end: date,
  endMeal: z.enum(mealTypes),
});
const feedbackInput = z.object({
  itemId: z.string().uuid(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().trim().min(1).max(1000),
});

function mealParams(context: { req: { param(name: string): string } }) {
  const mealDate = date.safeParse(context.req.param("date"));
  const mealType = z.enum(mealTypes).safeParse(context.req.param("mealType"));
  if (!mealDate.success || !mealType.success) {
    throw new HTTPException(400, { message: "Invalid date or meal type." });
  }
  return { mealDate: mealDate.data, mealType: mealType.data };
}

function assertValidVacation(input: z.infer<typeof vacationInput>) {
  const today = new Date().toISOString().slice(0, 10);
  if (
    input.start < today ||
    input.end < input.start ||
    (input.start === input.end &&
      mealTypes.indexOf(input.endMeal) < mealTypes.indexOf(input.startMeal))
  ) {
    throw new HTTPException(400, {
      message: "Vacation end must be after its start.",
    });
  }
}

function vacationAbsences(
  input: z.infer<typeof vacationInput>,
  menus: { weekday: number; mealType: (typeof mealTypes)[number] }[],
) {
  const absences: Array<{
    mealDate: string;
    mealType: (typeof mealTypes)[number];
  }> = [];
  for (
    let current = new Date(`${input.start}T12:00:00Z`);
    current <= new Date(`${input.end}T12:00:00Z`);
    current.setUTCDate(current.getUTCDate() + 1)
  ) {
    const mealDate = current.toISOString().slice(0, 10);
    for (const menu of menus) {
      const mealPosition = mealTypes.indexOf(menu.mealType);
      if (
        menu.weekday === isoWeekday(mealDate) &&
        (mealDate !== input.start ||
          mealPosition >= mealTypes.indexOf(input.startMeal)) &&
        (mealDate !== input.end ||
          mealPosition <= mealTypes.indexOf(input.endMeal))
      ) {
        absences.push({ mealDate, mealType: menu.mealType });
      }
    }
  }
  return absences;
}

export const attendanceRoutes = new Hono<{ Variables: AppVariables }>();

attendanceRoutes.get("/:groupId/my/recurring-absences", async (context) => {
  const groupId = context.req.param("groupId");
  const { membership } = await requireGroupRole(context, groupId, ["CONSUMER"]);
  const rules = await db
    .select({
      weekday: recurringAbsences.weekday,
      mealType: recurringAbsences.mealType,
    })
    .from(recurringAbsences)
    .where(eq(recurringAbsences.membershipId, membership.id));
  return context.json({ rules });
});

attendanceRoutes.put("/:groupId/my/recurring-absences", async (context) => {
  const groupId = context.req.param("groupId");
  const { membership } = await requireGroupRole(context, groupId, ["CONSUMER"]);
  const payload = await readJson(context.req.raw, recurringAbsenceInput);
  const uniqueRules = new Set(
    payload.rules.map((rule) => `${rule.weekday}:${rule.mealType}`),
  );
  if (uniqueRules.size !== payload.rules.length) {
    throw new HTTPException(400, {
      message: "Recurring absence rules must be unique.",
    });
  }
  const rules = await db.transaction(async (tx) => {
    await tx
      .delete(recurringAbsences)
      .where(eq(recurringAbsences.membershipId, membership.id));
    if (!payload.rules.length) return [];
    return tx
      .insert(recurringAbsences)
      .values(
        payload.rules.map((rule) => ({ ...rule, membershipId: membership.id })),
      )
      .returning();
  });
  return context.json({ rules });
});

attendanceRoutes.put(
  "/:groupId/my/attendance/:date/:mealType",
  async (context) => {
    const groupId = context.req.param("groupId");
    const { membership } = await requireGroupRole(context, groupId, [
      "CONSUMER",
    ]);
    const { mealDate, mealType } = mealParams(context);
    const payload = await readJson(context.req.raw, attendanceInput);
    const [override] = await db
      .insert(attendanceOverrides)
      .values({
        membershipId: membership.id,
        mealDate,
        mealType,
        attendance: payload.attendance,
      })
      .onConflictDoUpdate({
        target: [
          attendanceOverrides.membershipId,
          attendanceOverrides.mealDate,
          attendanceOverrides.mealType,
        ],
        set: { attendance: payload.attendance, updatedAt: new Date() },
      })
      .returning();
    return context.json(override);
  },
);

attendanceRoutes.get("/:groupId/my/attendance", async (context) => {
  const groupId = context.req.param("groupId");
  const { membership } = await requireGroupRole(context, groupId, ["CONSUMER"]);
  const mealDate = date.safeParse(context.req.query("date"));
  if (!mealDate.success) {
    throw new HTTPException(400, { message: "Use a valid YYYY-MM-DD date." });
  }
  const overrides = await db
    .select({
      mealDate: attendanceOverrides.mealDate,
      mealType: attendanceOverrides.mealType,
      attendance: attendanceOverrides.attendance,
    })
    .from(attendanceOverrides)
    .where(
      and(
        eq(attendanceOverrides.membershipId, membership.id),
        eq(attendanceOverrides.mealDate, mealDate.data),
      ),
    );
  return context.json({ overrides });
});

attendanceRoutes.get("/:groupId/my/vacations", async (context) => {
  const groupId = context.req.param("groupId");
  const { membership } = await requireGroupRole(context, groupId, ["CONSUMER"]);
  const vacationsForMember = await db
    .select({
      id: vacations.id,
      startDate: vacations.startDate,
      startMeal: vacations.startMeal,
      endDate: vacations.endDate,
      endMeal: vacations.endMeal,
    })
    .from(vacations)
    .where(eq(vacations.membershipId, membership.id))
    .orderBy(asc(vacations.startDate));
  return context.json({ vacations: vacationsForMember });
});

attendanceRoutes.post("/:groupId/my/vacation", async (context) => {
  const groupId = context.req.param("groupId");
  const { membership } = await requireGroupRole(context, groupId, ["CONSUMER"]);
  const payload = await readJson(context.req.raw, vacationInput);
  assertValidVacation(payload);
  const menus = await db
    .select({ weekday: weeklyMenus.weekday, mealType: weeklyMenus.mealType })
    .from(weeklyMenus)
    .where(eq(weeklyMenus.groupId, groupId));
  const absences = vacationAbsences(payload, menus);
  const vacation = await db.transaction(async (tx) => {
    const [savedVacation] = await tx
      .insert(vacations)
      .values({
        membershipId: membership.id,
        startDate: payload.start,
        startMeal: payload.startMeal,
        endDate: payload.end,
        endMeal: payload.endMeal,
      })
      .returning({
        id: vacations.id,
        startDate: vacations.startDate,
        startMeal: vacations.startMeal,
        endDate: vacations.endDate,
        endMeal: vacations.endMeal,
      });
    for (const absence of absences) {
      await tx
        .insert(attendanceOverrides)
        .values({
          membershipId: membership.id,
          ...absence,
          attendance: "ABSENT",
        })
        .onConflictDoUpdate({
          target: [
            attendanceOverrides.membershipId,
            attendanceOverrides.mealDate,
            attendanceOverrides.mealType,
          ],
          set: { attendance: "ABSENT", updatedAt: new Date() },
        });
    }
    return savedVacation!;
  });
  return context.json({ vacation, absences: absences.length });
});

attendanceRoutes.put("/:groupId/my/vacations/:vacationId", async (context) => {
  const groupId = context.req.param("groupId");
  const { membership } = await requireGroupRole(context, groupId, ["CONSUMER"]);
  const payload = await readJson(context.req.raw, vacationInput);
  assertValidVacation(payload);
  const [existing] = await db
    .select()
    .from(vacations)
    .where(
      and(
        eq(vacations.id, context.req.param("vacationId")),
        eq(vacations.membershipId, membership.id),
      ),
    );
  if (!existing)
    throw new HTTPException(404, { message: "Vacation not found." });
  const menus = await db
    .select({ weekday: weeklyMenus.weekday, mealType: weeklyMenus.mealType })
    .from(weeklyMenus)
    .where(eq(weeklyMenus.groupId, groupId));
  const previousAbsences = vacationAbsences(
    {
      start: existing.startDate,
      startMeal: existing.startMeal,
      end: existing.endDate,
      endMeal: existing.endMeal,
    },
    menus,
  );
  const absences = vacationAbsences(payload, menus);
  const [vacation] = await db.transaction(async (tx) => {
    for (const absence of previousAbsences) {
      await tx
        .delete(attendanceOverrides)
        .where(
          and(
            eq(attendanceOverrides.membershipId, membership.id),
            eq(attendanceOverrides.mealDate, absence.mealDate),
            eq(attendanceOverrides.mealType, absence.mealType),
          ),
        );
    }
    const updated = await tx
      .update(vacations)
      .set({
        startDate: payload.start,
        startMeal: payload.startMeal,
        endDate: payload.end,
        endMeal: payload.endMeal,
      })
      .where(eq(vacations.id, existing.id))
      .returning();
    for (const absence of absences) {
      await tx
        .insert(attendanceOverrides)
        .values({
          membershipId: membership.id,
          ...absence,
          attendance: "ABSENT",
        })
        .onConflictDoUpdate({
          target: [
            attendanceOverrides.membershipId,
            attendanceOverrides.mealDate,
            attendanceOverrides.mealType,
          ],
          set: { attendance: "ABSENT", updatedAt: new Date() },
        });
    }
    return updated;
  });
  return context.json({ vacation });
});

attendanceRoutes.delete(
  "/:groupId/my/vacations/:vacationId",
  async (context) => {
    const groupId = context.req.param("groupId");
    const { membership } = await requireGroupRole(context, groupId, [
      "CONSUMER",
    ]);
    const [vacation] = await db
      .select()
      .from(vacations)
      .where(
        and(
          eq(vacations.id, context.req.param("vacationId")),
          eq(vacations.membershipId, membership.id),
        ),
      );
    if (!vacation)
      throw new HTTPException(404, { message: "Vacation not found." });
    const menus = await db
      .select({ weekday: weeklyMenus.weekday, mealType: weeklyMenus.mealType })
      .from(weeklyMenus)
      .where(eq(weeklyMenus.groupId, groupId));
    const absences = vacationAbsences(
      {
        start: vacation.startDate,
        startMeal: vacation.startMeal,
        end: vacation.endDate,
        endMeal: vacation.endMeal,
      },
      menus,
    );
    await db.transaction(async (tx) => {
      for (const absence of absences) {
        await tx
          .delete(attendanceOverrides)
          .where(
            and(
              eq(attendanceOverrides.membershipId, membership.id),
              eq(attendanceOverrides.mealDate, absence.mealDate),
              eq(attendanceOverrides.mealType, absence.mealType),
            ),
          );
      }
      await tx.delete(vacations).where(eq(vacations.id, vacation.id));
    });
    return context.body(null, 204);
  },
);

attendanceRoutes.delete(
  "/:groupId/my/attendance/:date/:mealType",
  async (context) => {
    const groupId = context.req.param("groupId");
    const { membership } = await requireGroupRole(context, groupId, [
      "CONSUMER",
    ]);
    const { mealDate, mealType } = mealParams(context);
    await db
      .delete(attendanceOverrides)
      .where(
        and(
          eq(attendanceOverrides.membershipId, membership.id),
          eq(attendanceOverrides.mealDate, mealDate),
          eq(attendanceOverrides.mealType, mealType),
        ),
      );
    return context.body(null, 204);
  },
);

attendanceRoutes.get("/:groupId/headcount", async (context) => {
  const groupId = context.req.param("groupId");
  await requireGroupRole(context, groupId, ["ADMIN", "PRODUCER"]);
  const mealDate = date.safeParse(context.req.query("date"));
  const mealType = z.enum(mealTypes).safeParse(context.req.query("mealType"));
  if (!mealDate.success || !mealType.success) {
    throw new HTTPException(400, { message: "Invalid date or meal type." });
  }
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
  if (!membershipIds.length)
    return context.json({ expected: 0, absent: 0, overrides: 0 });
  const [recurring, overrides] = await Promise.all([
    db
      .select({ membershipId: recurringAbsences.membershipId })
      .from(recurringAbsences)
      .where(
        and(
          inArray(recurringAbsences.membershipId, membershipIds),
          eq(recurringAbsences.weekday, isoWeekday(mealDate.data)),
          eq(recurringAbsences.mealType, mealType.data),
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
          eq(attendanceOverrides.mealDate, mealDate.data),
          eq(attendanceOverrides.mealType, mealType.data),
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
  return context.json({
    expected,
    absent: membershipIds.length - expected,
    overrides: overrides.length,
  });
});

attendanceRoutes.post(
  "/:groupId/meals/:date/:mealType/feedback",
  async (context) => {
    const groupId = context.req.param("groupId");
    const { membership } = await requireGroupRole(context, groupId, [
      "CONSUMER",
    ]);
    const { mealDate, mealType } = mealParams(context);
    const payload = await readJson(context.req.raw, feedbackInput);
    const created = await db.transaction(async (tx) => {
      const { occurrence, items } = await materializeMealOccurrence(tx, {
        groupId,
        mealDate,
        mealType,
        weekday: isoWeekday(mealDate),
      });
      const item = items.find(
        (entry) => entry.sourceMenuItemId === payload.itemId,
      );
      if (!item) {
        throw new HTTPException(400, {
          message: "The selected dish is not part of this meal.",
        });
      }
      const [saved] = await tx
        .insert(feedback)
        .values({
          occurrenceId: occurrence.id,
          membershipId: membership.id,
          occurrenceItemId: item.id,
          rating: payload.rating,
          comment: payload.comment,
        })
        .onConflictDoNothing()
        .returning();
      return saved;
    });
    if (!created) {
      throw new HTTPException(409, {
        message: "Feedback already exists for this dish.",
      });
    }
    return context.json({ feedback: created }, 201);
  },
);

attendanceRoutes.get(
  "/:groupId/meals/:date/:mealType/feedback",
  async (context) => {
    const groupId = context.req.param("groupId");
    await requireGroupRole(context, groupId, ["CONSUMER"]);
    const { mealDate, mealType } = mealParams(context);
    const data = await db
      .select({
        id: feedback.id,
        rating: feedback.rating,
        comment: feedback.comment,
        createdAt: feedback.createdAt,
      })
      .from(feedback)
      .innerJoin(mealOccurrences, eq(feedback.occurrenceId, mealOccurrences.id))
      .where(
        and(
          eq(mealOccurrences.groupId, groupId),
          eq(mealOccurrences.mealDate, mealDate),
          eq(mealOccurrences.mealType, mealType),
        ),
      )
      .orderBy(asc(feedback.createdAt));
    return context.json({ data });
  },
);
