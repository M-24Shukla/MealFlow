import { and, asc, eq } from "drizzle-orm";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "../db/client.js";
import { activateMembershipWithRole } from "../db/domain.js";
import {
  groups,
  joinRequests,
  membershipRoles,
  memberships,
  users,
} from "../db/schema.js";
import { readJson } from "../lib/http.js";
import { requireGroupCreator } from "../lib/group-auth.js";
import { requireUser, type AppVariables } from "../lib/session.js";

const groupInput = z.object({
  name: z.string().trim().min(2).max(100),
  timezone: z.string().trim().min(1).max(100),
});
const joinRequestInput = z.object({
  requestedRole: z.enum(["CONSUMER", "PRODUCER"]),
});
const administratorRoleInput = z.object({ isAdmin: z.boolean() });

export const groupRoutes = new Hono<{ Variables: AppVariables }>();

groupRoutes.get("/mine", async (context) => {
  const user = requireUser(context);
  const rows = await db
    .select({
      id: groups.id,
      slug: groups.slug,
      name: groups.name,
      timezone: groups.timezone,
      role: membershipRoles.role,
    })
    .from(memberships)
    .innerJoin(groups, eq(groups.id, memberships.groupId))
    .innerJoin(
      membershipRoles,
      eq(membershipRoles.membershipId, memberships.id),
    )
    .where(
      and(eq(memberships.userId, user.id), eq(memberships.status, "ACTIVE")),
    )
    .orderBy(asc(groups.name));
  const grouped = new Map<
    string,
    {
      id: string;
      slug: string;
      name: string;
      timezone: string;
      roles: string[];
    }
  >();
  for (const row of rows) {
    const group = grouped.get(row.id);
    if (group) group.roles.push(row.role);
    else {
      grouped.set(row.id, {
        id: row.id,
        slug: row.slug,
        name: row.name,
        timezone: row.timezone,
        roles: [row.role],
      });
    }
  }
  return context.json({ data: [...grouped.values()] });
});

groupRoutes.get("/my/join-requests", async (context) => {
  const user = requireUser(context);
  const requests = await db
    .select({
      id: joinRequests.id,
      status: joinRequests.status,
      requestedRole: joinRequests.requestedRole,
      groupName: groups.name,
    })
    .from(joinRequests)
    .innerJoin(groups, eq(groups.id, joinRequests.groupId))
    .where(eq(joinRequests.applicantId, user.id))
    .orderBy(asc(joinRequests.createdAt));
  return context.json({ data: requests });
});

groupRoutes.post("/", async (context) => {
  const user = requireUser(context);
  const payload = await readJson(context.req.raw, groupInput);
  const groupId = crypto.randomUUID();

  const group = await db.transaction(async (tx) => {
    const [created] = await tx
      .insert(groups)
      .values({
        ...payload,
        id: groupId,
        slug: groupId,
        creatorId: user.id,
      })
      .returning();
    const [membership] = await tx
      .insert(memberships)
      .values({ groupId: created.id, userId: user.id })
      .returning();
    await tx.insert(membershipRoles).values([
      { membershipId: membership.id, role: "ADMIN" },
      { membershipId: membership.id, role: "CONSUMER" },
    ]);
    return created;
  });
  console.info("Group created", {
    groupId: group.id,
    slug: group.slug,
    creatorId: user.id,
    timezone: group.timezone,
  });
  return context.json({ group }, 201);
});

groupRoutes.get("/public/:slug", async (context) => {
  const slug = context.req.param("slug");
  const [group] = await db
    .select({
      id: groups.id,
      slug: groups.slug,
      name: groups.name,
      timezone: groups.timezone,
      isJoinable: groups.isJoinable,
    })
    .from(groups)
    .where(eq(groups.slug, slug))
    .limit(1);
  if (!group || !group.isJoinable)
    throw new HTTPException(404, {
      message: "Group landing page was not found.",
    });
  console.info("Group landing page opened", { slug });
  return context.json({ group });
});

groupRoutes.post("/public/:slug/join-requests", async (context) => {
  const user = requireUser(context);
  const payload = await readJson(context.req.raw, joinRequestInput);
  const [group] = await db
    .select()
    .from(groups)
    .where(
      and(
        eq(groups.slug, context.req.param("slug")),
        eq(groups.isJoinable, true),
      ),
    )
    .limit(1);
  if (!group)
    throw new HTTPException(404, {
      message: "Group landing page was not found.",
    });
  if (group.creatorId === user.id)
    throw new HTTPException(409, {
      message: "The group creator is already a member.",
    });
  const [member] = await db
    .select({ id: memberships.id })
    .from(memberships)
    .where(
      and(
        eq(memberships.groupId, group.id),
        eq(memberships.userId, user.id),
        eq(memberships.status, "ACTIVE"),
      ),
    )
    .limit(1);
  if (member)
    throw new HTTPException(409, {
      message: "You are already a member of this group.",
    });
  const [pending] = await db
    .select({ id: joinRequests.id })
    .from(joinRequests)
    .where(
      and(
        eq(joinRequests.groupId, group.id),
        eq(joinRequests.applicantId, user.id),
        eq(joinRequests.status, "PENDING"),
      ),
    )
    .limit(1);
  if (pending)
    throw new HTTPException(409, {
      message: "Your request is already awaiting review.",
    });

  const [request] = await db
    .insert(joinRequests)
    .values({
      groupId: group.id,
      applicantId: user.id,
      requestedRole: payload.requestedRole,
    })
    .returning();
  console.info("Group join request created", {
    groupId: group.id,
    requestId: request.id,
    requestedRole: request.requestedRole,
    applicantId: user.id,
  });
  return context.json({ request }, 201);
});

groupRoutes.get("/:groupId/join-requests", async (context) => {
  const group = await requireGroupCreator(
    context,
    context.req.param("groupId"),
  );
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
        eq(joinRequests.groupId, group.id),
        eq(joinRequests.status, "PENDING"),
      ),
    );
  return context.json({ data: requests });
});

groupRoutes.get("/:groupId/members", async (context) => {
  const group = await requireGroupCreator(
    context,
    context.req.param("groupId"),
  );
  const rows = await db
    .select({
      membershipId: memberships.id,
      userId: users.id,
      displayName: users.displayName,
      email: users.email,
      role: membershipRoles.role,
    })
    .from(memberships)
    .innerJoin(users, eq(users.id, memberships.userId))
    .innerJoin(
      membershipRoles,
      eq(membershipRoles.membershipId, memberships.id),
    )
    .where(
      and(eq(memberships.groupId, group.id), eq(memberships.status, "ACTIVE")),
    );
  const members = new Map<
    string,
    {
      membershipId: string;
      userId: string;
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
        displayName: row.displayName,
        email: row.email,
        roles: [row.role],
      });
    }
  }
  return context.json({ data: [...members.values()] });
});

groupRoutes.put("/:groupId/members/:membershipId/admin", async (context) => {
  const group = await requireGroupCreator(
    context,
    context.req.param("groupId"),
  );
  const payload = await readJson(context.req.raw, administratorRoleInput);
  const [membership] = await db
    .select()
    .from(memberships)
    .where(
      and(
        eq(memberships.id, context.req.param("membershipId")),
        eq(memberships.groupId, group.id),
        eq(memberships.status, "ACTIVE"),
      ),
    )
    .limit(1);
  if (!membership) {
    throw new HTTPException(404, {
      message: "Active membership was not found.",
    });
  }
  if (membership.userId === group.creatorId) {
    throw new HTTPException(403, {
      message: "The group creator's roles cannot be changed.",
    });
  }

  const currentRoles = await db
    .select({ role: membershipRoles.role })
    .from(membershipRoles)
    .where(eq(membershipRoles.membershipId, membership.id));
  const roles = currentRoles.map(({ role }) => role);
  if (payload.isAdmin && !roles.includes("ADMIN")) {
    if (!roles.includes("CONSUMER") || roles.includes("PRODUCER")) {
      throw new HTTPException(409, {
        message:
          "Only a consumer without a producer role can become an administrator.",
      });
    }
    await db
      .insert(membershipRoles)
      .values({ membershipId: membership.id, role: "ADMIN" })
      .onConflictDoNothing();
    roles.push("ADMIN");
  }
  if (!payload.isAdmin && roles.includes("ADMIN")) {
    await db
      .delete(membershipRoles)
      .where(
        and(
          eq(membershipRoles.membershipId, membership.id),
          eq(membershipRoles.role, "ADMIN"),
        ),
      );
    roles.splice(roles.indexOf("ADMIN"), 1);
  }
  return context.json({ membershipId: membership.id, roles });
});

groupRoutes.post(
  "/:groupId/join-requests/:requestId/approve",
  async (context) => {
    const user = requireUser(context);
    const group = await requireGroupCreator(
      context,
      context.req.param("groupId"),
    );
    const [request] = await db
      .select()
      .from(joinRequests)
      .where(
        and(
          eq(joinRequests.id, context.req.param("requestId")),
          eq(joinRequests.groupId, group.id),
          eq(joinRequests.status, "PENDING"),
        ),
      )
      .limit(1);
    if (!request)
      throw new HTTPException(404, {
        message: "Pending join request was not found.",
      });

    await db.transaction(async (tx) => {
      await activateMembershipWithRole(tx, {
        groupId: group.id,
        userId: request.applicantId,
        role: request.requestedRole,
      });
      await tx
        .update(joinRequests)
        .set({
          status: "APPROVED",
          reviewedAt: new Date(),
          reviewedBy: user.id,
        })
        .where(eq(joinRequests.id, request.id));
    });
    return context.json({ id: request.id, status: "APPROVED" });
  },
);

groupRoutes.post(
  "/:groupId/join-requests/:requestId/reject",
  async (context) => {
    const user = requireUser(context);
    const group = await requireGroupCreator(
      context,
      context.req.param("groupId"),
    );
    const [request] = await db
      .update(joinRequests)
      .set({ status: "REJECTED", reviewedAt: new Date(), reviewedBy: user.id })
      .where(
        and(
          eq(joinRequests.id, context.req.param("requestId")),
          eq(joinRequests.groupId, group.id),
          eq(joinRequests.status, "PENDING"),
        ),
      )
      .returning();
    if (!request)
      throw new HTTPException(404, {
        message: "Pending join request was not found.",
      });
    return context.json({ id: request.id, status: request.status });
  },
);
