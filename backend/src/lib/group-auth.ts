import { and, eq } from "drizzle-orm";
import type { Context } from "hono";
import { HTTPException } from "hono/http-exception";
import { z } from "zod";
import { db } from "../db/client.js";
import { groups, membershipRoles, memberships } from "../db/schema.js";
import { requireUser, type AppVariables } from "./session.js";

export type GroupRole = "ADMIN" | "CONSUMER" | "PRODUCER";
const groupIdSchema = z.string().uuid();

export async function requireGroupMembership(
  context: Context<{ Variables: AppVariables }>,
  groupId: string,
) {
  const parsedGroupId = groupIdSchema.safeParse(groupId);
  if (!parsedGroupId.success) {
    throw new HTTPException(400, { message: "Invalid group ID." });
  }
  const user = requireUser(context);
  const [membership] = await db
    .select({ id: memberships.id, groupId: memberships.groupId })
    .from(memberships)
    .where(
      and(
        eq(memberships.groupId, parsedGroupId.data),
        eq(memberships.userId, user.id),
        eq(memberships.status, "ACTIVE"),
      ),
    )
    .limit(1);
  if (!membership) {
    throw new HTTPException(403, {
      message: "An active group membership is required.",
    });
  }
  return membership;
}

export async function requireGroupRole(
  context: Context<{ Variables: AppVariables }>,
  groupId: string,
  roles: readonly GroupRole[],
) {
  const membership = await requireGroupMembership(context, groupId);
  const assignedRoles = await db
    .select({ role: membershipRoles.role })
    .from(membershipRoles)
    .where(eq(membershipRoles.membershipId, membership.id));
  if (!assignedRoles.some(({ role }) => roles.includes(role))) {
    throw new HTTPException(403, {
      message: `One of these group roles is required: ${roles.join(", ")}.`,
    });
  }
  return { membership, roles: assignedRoles.map(({ role }) => role) };
}

export async function requireGroupCreator(
  context: Context<{ Variables: AppVariables }>,
  groupId: string,
) {
  const user = requireUser(context);
  const [group] = await db
    .select()
    .from(groups)
    .where(and(eq(groups.id, groupId), eq(groups.creatorId, user.id)))
    .limit(1);
  if (!group) {
    throw new HTTPException(403, {
      message: "Only the group creator can perform this action.",
    });
  }
  return group;
}
