import { afterEach, describe, expect, it } from "vitest";

const runIntegration = process.env.RUN_SUPABASE_INTEGRATION_TESTS === "1";
if (!runIntegration) {
  process.env.DATABASE_URL =
    "postgresql://mealflow:mealflow@localhost:5432/mealflow";
  process.env.ALLOWED_CORS_ORIGINS = "http://localhost:5173";
  process.env.SESSION_SECRET =
    "test-session-secret-that-is-at-least-thirty-two-characters";
}

const { app } = await import("./app.js");
const { db } = await import("./db/client.js");
const { groups, memberships, users } = await import("./db/schema.js");
const { and, eq, inArray } = await import("drizzle-orm");

describe("health endpoint", () => {
  it("returns an OK response without requiring a database query", async () => {
    const response = await app.request("http://localhost/health");

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
  });
});

describe.runIf(runIntegration)("group role management", () => {
  const createdUserIds: string[] = [];
  const createdGroupIds: string[] = [];

  afterEach(async () => {
    if (createdGroupIds.length) {
      await db
        .delete(groups)
        .where(inArray(groups.id, createdGroupIds.splice(0)));
    }
    if (createdUserIds.length) {
      await db.delete(users).where(inArray(users.id, createdUserIds.splice(0)));
    }
  });

  async function register(displayName: string) {
    const email = `${crypto.randomUUID()}@example.test`;
    const password = "a-secure-test-password";
    const response = await app.request(
      "http://localhost/api/v1/auth/register",
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-forwarded-for": `${crypto.randomUUID()}.test`,
        },
        body: JSON.stringify({
          displayName,
          email,
          password,
        }),
      },
    );
    expect(response.status).toBe(201);
    const { user } = await response.json();
    createdUserIds.push(user.id);
    return {
      user,
      email,
      password,
      cookie: response.headers.get("set-cookie")!.split(";", 1)[0]!,
    };
  }

  async function createGroup(cookie: string) {
    const response = await app.request("http://localhost/api/v1/groups", {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        name: "Role Test Group",
        timezone: "Asia/Kolkata",
      }),
    });
    expect(response.status).toBe(201);
    const { group } = await response.json();
    expect(group.slug).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
    createdGroupIds.push(group.id);
    return group;
  }

  async function requestAndApprove(
    group: { id: string; slug: string },
    creatorCookie: string,
    applicantCookie: string,
    requestedRole: "CONSUMER" | "PRODUCER",
  ) {
    const requested = await app.request(
      `http://localhost/api/v1/groups/public/${group.slug}/join-requests`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: applicantCookie,
        },
        body: JSON.stringify({ requestedRole }),
      },
    );
    expect(requested.status).toBe(201);
    const { request } = await requested.json();
    const approved = await app.request(
      `http://localhost/api/v1/groups/${group.id}/join-requests/${request.id}/approve`,
      { method: "POST", headers: { cookie: creatorCookie } },
    );
    expect(approved.status).toBe(200);
  }

  it("denies a non-creator access to pending requests", async () => {
    const creator = await register("Creator One");
    const applicant = await register("Applicant One");
    const group = await createGroup(creator.cookie);
    const request = await app.request(
      `http://localhost/api/v1/groups/public/${group.slug}/join-requests`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: applicant.cookie,
        },
        body: JSON.stringify({ requestedRole: "CONSUMER" }),
      },
    );
    expect(request.status).toBe(201);

    const denied = await app.request(
      `http://localhost/api/v1/groups/${group.id}/join-requests`,
      { headers: { cookie: applicant.cookie } },
    );
    expect(denied.status).toBe(403);

    const pending = await app.request(
      `http://localhost/api/v1/groups/${group.id}/join-requests`,
      { headers: { cookie: creator.cookie } },
    );
    expect(pending.status).toBe(200);
    await expect(pending.json()).resolves.toMatchObject({
      data: [{ requestedRole: "CONSUMER" }],
    });
  });

  it("allows only the creator to promote and demote a consumer", async () => {
    const creator = await register("Creator Two");
    const consumer = await register("Consumer Two");
    const group = await createGroup(creator.cookie);
    await requestAndApprove(group, creator.cookie, consumer.cookie, "CONSUMER");
    const [consumerMembership] = await db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.groupId, group.id),
          eq(memberships.userId, consumer.user.id),
        ),
      );

    const promoted = await app.request(
      `http://localhost/api/v1/groups/${group.id}/members/${consumerMembership.id}/admin`,
      {
        method: "PUT",
        headers: { "content-type": "application/json", cookie: creator.cookie },
        body: JSON.stringify({ isAdmin: true }),
      },
    );
    expect(promoted.status).toBe(200);
    await expect(promoted.json()).resolves.toMatchObject({
      roles: expect.arrayContaining(["ADMIN", "CONSUMER"]),
    });

    const demoted = await app.request(
      `http://localhost/api/v1/groups/${group.id}/members/${consumerMembership.id}/admin`,
      {
        method: "PUT",
        headers: { "content-type": "application/json", cookie: creator.cookie },
        body: JSON.stringify({ isAdmin: false }),
      },
    );
    expect(demoted.status).toBe(200);
    await expect(demoted.json()).resolves.toMatchObject({
      roles: ["CONSUMER"],
    });

    const [creatorMembership] = await db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.groupId, group.id),
          eq(memberships.userId, creator.user.id),
        ),
      );
    const protectedCreator = await app.request(
      `http://localhost/api/v1/groups/${group.id}/members/${creatorMembership.id}/admin`,
      {
        method: "PUT",
        headers: { "content-type": "application/json", cookie: creator.cookie },
        body: JSON.stringify({ isAdmin: false }),
      },
    );
    expect(protectedCreator.status).toBe(403);
  }, 20_000);

  it("rejects producer promotion", async () => {
    const creator = await register("Creator Three");
    const producer = await register("Producer Three");
    const group = await createGroup(creator.cookie);
    await requestAndApprove(group, creator.cookie, producer.cookie, "PRODUCER");
    const [producerMembership] = await db
      .select()
      .from(memberships)
      .where(
        and(
          eq(memberships.groupId, group.id),
          eq(memberships.userId, producer.user.id),
        ),
      );

    const rejected = await app.request(
      `http://localhost/api/v1/groups/${group.id}/members/${producerMembership.id}/admin`,
      {
        method: "PUT",
        headers: { "content-type": "application/json", cookie: creator.cookie },
        body: JSON.stringify({ isAdmin: true }),
      },
    );
    expect(rejected.status).toBe(409);
  });

  it("manages ordered menus and resolves an active meal", async () => {
    const creator = await register("Menu Creator");
    const group = await createGroup(creator.cookie);
    const schedule = await app.request(
      `http://localhost/api/v1/groups/${group.id}/schedule`,
      {
        method: "PUT",
        headers: { "content-type": "application/json", cookie: creator.cookie },
        body: JSON.stringify({
          entries: [
            {
              weekday: 1,
              mealType: "LUNCH",
              startTime: "12:00",
              endTime: "14:00",
              enabled: true,
            },
          ],
        }),
      },
    );
    expect(schedule.status).toBe(200);

    const overlapping = await app.request(
      `http://localhost/api/v1/groups/${group.id}/schedule`,
      {
        method: "PUT",
        headers: { "content-type": "application/json", cookie: creator.cookie },
        body: JSON.stringify({
          entries: [
            {
              weekday: 1,
              mealType: "LUNCH",
              startTime: "12:00",
              endTime: "14:00",
              enabled: true,
            },
            {
              weekday: 1,
              mealType: "DINNER",
              startTime: "13:00",
              endTime: "15:00",
              enabled: true,
            },
          ],
        }),
      },
    );
    expect(overlapping.status).toBe(400);

    const menu = await app.request(
      `http://localhost/api/v1/groups/${group.id}/menus/1/LUNCH`,
      {
        method: "PUT",
        headers: { "content-type": "application/json", cookie: creator.cookie },
        body: JSON.stringify({
          items: [
            {
              name: "Dal",
              category: "VEG",
              recipeUrl: "https://example.test/dal",
            },
            { name: "Rice", category: "VEGAN", recipeUrl: null },
          ],
        }),
      },
    );
    expect(menu.status).toBe(200);

    const active = await app.request(
      `http://localhost/api/v1/groups/${group.id}/active-meal?at=2026-08-24T06:30:00Z`,
      { headers: { cookie: creator.cookie } },
    );
    expect(active.status).toBe(200);
    await expect(active.json()).resolves.toMatchObject({
      activeMeal: {
        date: "2026-08-24",
        mealType: "LUNCH",
        items: [{ name: "Dal" }, { name: "Rice" }],
      },
    });

    const noActiveMeal = await app.request(
      `http://localhost/api/v1/groups/${group.id}/active-meal?at=2026-08-24T10:30:00Z`,
      { headers: { cookie: creator.cookie } },
    );
    await expect(noActiveMeal.json()).resolves.toEqual({ activeMeal: null });
  }, 20_000);

  it("applies attendance precedence and restricts feedback to consumers", async () => {
    const creator = await register("Attendance Creator");
    const consumer = await register("Attendance Consumer");
    const producer = await register("Attendance Producer");
    const group = await createGroup(creator.cookie);
    await requestAndApprove(group, creator.cookie, consumer.cookie, "CONSUMER");
    await requestAndApprove(group, creator.cookie, producer.cookie, "PRODUCER");

    const recurring = await app.request(
      `http://localhost/api/v1/groups/${group.id}/my/recurring-absences`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie: consumer.cookie,
        },
        body: JSON.stringify({
          rules: [{ weekday: 1, mealType: "LUNCH" }],
        }),
      },
    );
    expect(recurring.status).toBe(200);

    const consumerHeadcount = await app.request(
      `http://localhost/api/v1/groups/${group.id}/headcount?date=2026-08-24&mealType=LUNCH`,
      { headers: { cookie: consumer.cookie } },
    );
    expect(consumerHeadcount.status).toBe(403);

    const absentHeadcount = await app.request(
      `http://localhost/api/v1/groups/${group.id}/headcount?date=2026-08-24&mealType=LUNCH`,
      { headers: { cookie: creator.cookie } },
    );
    await expect(absentHeadcount.json()).resolves.toMatchObject({
      expected: 1,
      absent: 1,
      overrides: 0,
    });

    const presentOverride = await app.request(
      `http://localhost/api/v1/groups/${group.id}/my/attendance/2026-08-24/LUNCH`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie: consumer.cookie,
        },
        body: JSON.stringify({ attendance: "PRESENT" }),
      },
    );
    expect(presentOverride.status).toBe(200);

    const invalidVacation = await app.request(
      `http://localhost/api/v1/groups/${group.id}/my/vacation`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: consumer.cookie,
        },
        body: JSON.stringify({
          start: "2026-08-25",
          startMeal: "BREAKFAST",
          end: "2026-08-24",
          endMeal: "DINNER",
        }),
      },
    );
    expect(invalidVacation.status).toBe(400);

    const vacation = await app.request(
      `http://localhost/api/v1/groups/${group.id}/my/vacation`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: consumer.cookie,
        },
        body: JSON.stringify({
          start: "2026-08-25",
          startMeal: "LUNCH",
          end: "2026-08-26",
          endMeal: "DINNER",
        }),
      },
    );
    expect(vacation.status).toBe(200);

    const plannedVacations = await app.request(
      `http://localhost/api/v1/groups/${group.id}/my/vacations`,
      { headers: { cookie: consumer.cookie } },
    );
    const plannedVacationData = await plannedVacations.json();
    expect(plannedVacationData).toMatchObject({
      vacations: [
        {
          startDate: "2026-08-25",
          startMeal: "LUNCH",
          endDate: "2026-08-26",
          endMeal: "DINNER",
        },
      ],
    });
    const savedVacation = plannedVacationData.vacations[0];

    const updatedVacation = await app.request(
      `http://localhost/api/v1/groups/${group.id}/my/vacations/${savedVacation.id}`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie: consumer.cookie,
        },
        body: JSON.stringify({
          start: "2026-08-25",
          startMeal: "DINNER",
          end: "2026-08-26",
          endMeal: "DINNER",
        }),
      },
    );
    expect(updatedVacation.status).toBe(200);

    const deletedVacation = await app.request(
      `http://localhost/api/v1/groups/${group.id}/my/vacations/${savedVacation.id}`,
      { method: "DELETE", headers: { cookie: consumer.cookie } },
    );
    expect(deletedVacation.status).toBe(204);

    const presentHeadcount = await app.request(
      `http://localhost/api/v1/groups/${group.id}/headcount?date=2026-08-24&mealType=LUNCH`,
      { headers: { cookie: creator.cookie } },
    );
    await expect(presentHeadcount.json()).resolves.toMatchObject({
      expected: 2,
      absent: 0,
      overrides: 1,
    });

    const feedback = await app.request(
      `http://localhost/api/v1/groups/${group.id}/meals/2026-08-24/LUNCH/feedback`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: consumer.cookie,
        },
        body: JSON.stringify({ rating: 5, comment: "Excellent lunch." }),
      },
    );
    expect(feedback.status).toBe(201);

    const duplicateFeedback = await app.request(
      `http://localhost/api/v1/groups/${group.id}/meals/2026-08-24/LUNCH/feedback`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: consumer.cookie,
        },
        body: JSON.stringify({ rating: 4, comment: "Still excellent." }),
      },
    );
    expect(duplicateFeedback.status).toBe(409);

    const producerFeedback = await app.request(
      `http://localhost/api/v1/groups/${group.id}/meals/2026-08-24/LUNCH/feedback`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: producer.cookie,
        },
        body: JSON.stringify({ rating: 5, comment: "Not allowed." }),
      },
    );
    expect(producerFeedback.status).toBe(403);

    const feedbackList = await app.request(
      `http://localhost/api/v1/groups/${group.id}/meals/2026-08-24/LUNCH/feedback`,
      { headers: { cookie: consumer.cookie } },
    );
    await expect(feedbackList.json()).resolves.toMatchObject({
      data: [{ rating: 5, comment: "Excellent lunch." }],
    });
  }, 30_000);

  it("honors producer leave and audits preparation updates", async () => {
    const creator = await register("Preparation Creator");
    const producer = await register("Preparation Producer");
    const consumer = await register("Preparation Consumer");
    const group = await createGroup(creator.cookie);
    await requestAndApprove(group, creator.cookie, producer.cookie, "PRODUCER");
    await requestAndApprove(group, creator.cookie, consumer.cookie, "CONSUMER");
    const offDays = await app.request(
      `http://localhost/api/v1/groups/${group.id}/my/producer-off-days`,
      {
        method: "PUT",
        headers: {
          "content-type": "application/json",
          cookie: producer.cookie,
        },
        body: JSON.stringify({ weekdays: [7] }),
      },
    );
    expect(offDays.status).toBe(200);
    const menu = await app.request(
      `http://localhost/api/v1/groups/${group.id}/menus/1/LUNCH`,
      {
        method: "PUT",
        headers: { "content-type": "application/json", cookie: creator.cookie },
        body: JSON.stringify({
          items: [{ name: "Dal", category: "VEG", recipeUrl: null }],
        }),
      },
    );
    expect(menu.status).toBe(200);
    const leave = await app.request(
      `http://localhost/api/v1/groups/${group.id}/my/leaves`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: producer.cookie,
        },
        body: JSON.stringify({
          start: "2026-09-01",
          startMeal: "LUNCH",
          end: "2026-09-01",
          endMeal: "LUNCH",
          reason: "Travel",
        }),
      },
    );
    expect(leave.status).toBe(201);

    const unavailableBoard = await app.request(
      `http://localhost/api/v1/groups/${group.id}/preparation?date=2026-09-01&mealType=LUNCH`,
      { headers: { cookie: producer.cookie } },
    );
    expect(unavailableBoard.status).toBe(403);

    const board = await app.request(
      `http://localhost/api/v1/groups/${group.id}/preparation?date=2026-08-31&mealType=LUNCH`,
      { headers: { cookie: creator.cookie } },
    );
    expect(board.status).toBe(200);
    const { items } = await board.json();
    expect(items).toMatchObject([
      { name: "Dal", recipeUrl: null, status: "UNPREPARED" },
    ]);

    const producerBoard = await app.request(
      `http://localhost/api/v1/groups/${group.id}/preparation?date=2026-08-31&mealType=LUNCH`,
      { headers: { cookie: producer.cookie } },
    );
    expect(producerBoard.status).toBe(200);
    const prepared = await app.request(
      `http://localhost/api/v1/groups/${group.id}/preparation/${items[0].id}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: producer.cookie,
        },
        body: JSON.stringify({ status: "PREPARED" }),
      },
    );
    expect(prepared.status).toBe(200);
    const { preparation } = await prepared.json();
    expect(preparation.status).toBe("PREPARED");
    expect(preparation.updatedByMembershipId).toBeTruthy();

    const action = await app.request(
      `http://localhost/api/v1/groups/${group.id}/action-items?date=2026-08-31&mealType=LUNCH`,
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          cookie: producer.cookie,
        },
        body: JSON.stringify({ text: "Buy cumin" }),
      },
    );
    expect(action.status).toBe(201);
    const { item: actionItem } = await action.json();
    const completedAction = await app.request(
      `http://localhost/api/v1/groups/${group.id}/action-items/${actionItem.id}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: producer.cookie,
        },
        body: JSON.stringify({ completed: true }),
      },
    );
    expect(completedAction.status).toBe(200);

    const consumerUpdate = await app.request(
      `http://localhost/api/v1/groups/${group.id}/preparation/${items[0].id}`,
      {
        method: "PATCH",
        headers: {
          "content-type": "application/json",
          cookie: consumer.cookie,
        },
        body: JSON.stringify({ status: "PREPARED" }),
      },
    );
    expect(consumerUpdate.status).toBe(403);
  }, 30_000);

  it("honors the documented authentication and public-group contract", async () => {
    const creator = await register("Contract Creator");
    const group = await createGroup(creator.cookie);
    const publicGroup = await app.request(
      `http://localhost/api/v1/groups/public/${group.slug}`,
    );
    expect(publicGroup.status).toBe(200);
    await expect(publicGroup.json()).resolves.toMatchObject({
      group: { slug: group.slug, name: group.name },
    });
    const me = await app.request("http://localhost/api/v1/auth/me", {
      headers: { cookie: creator.cookie },
    });
    await expect(me.json()).resolves.toMatchObject({
      user: { id: creator.user.id, email: creator.email },
    });
    const logout = await app.request("http://localhost/api/v1/auth/logout", {
      method: "POST",
      headers: { cookie: creator.cookie },
    });
    expect(logout.status).toBe(204);
    const login = await app.request("http://localhost/api/v1/auth/login", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": `${crypto.randomUUID()}.test`,
      },
      body: JSON.stringify({
        email: creator.email,
        password: creator.password,
      }),
    });
    expect(login.status).toBe(200);
    const schedule = await app.request(
      `http://localhost/api/v1/groups/${group.id}/schedule`,
      {
        headers: { cookie: login.headers.get("set-cookie")!.split(";", 1)[0]! },
      },
    );
    await expect(schedule.json()).resolves.toEqual({ entries: [] });
  }, 30_000);
});
