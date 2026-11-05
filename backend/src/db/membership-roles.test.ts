import { describe, expect, it } from "vitest";
import { activateMembershipWithRole } from "./domain.js";
import { memberships, membershipRoles } from "./schema.js";

describe("roles on membership reapproval", () => {
  it.each([
    { previous: ["ADMIN", "CONSUMER"], approved: "PRODUCER" as const },
    { previous: ["PRODUCER"], approved: "CONSUMER" as const },
  ])(
    "replaces $previous with the approved $approved role",
    async ({ previous, approved }) => {
      const roles = new Set(previous);
      const tx = {
        insert(table: unknown) {
          if (table === memberships)
            return {
              values: () => ({
                onConflictDoUpdate: () => ({
                  returning: async () => [{ id: "member-1" }],
                }),
              }),
            };
          expect(table).toBe(membershipRoles);
          return {
            values: (value: { role: string }) => ({
              onConflictDoNothing: async () => {
                roles.add(value.role);
              },
            }),
          };
        },
        delete(table: unknown) {
          expect(table).toBe(membershipRoles);
          return {
            where: async () => {
              roles.clear();
            },
          };
        },
      };
      await activateMembershipWithRole(
        tx as unknown as Parameters<typeof activateMembershipWithRole>[0],
        {
          groupId: "group-1",
          userId: "user-1",
          role: approved,
        },
      );
      expect([...roles]).toEqual([approved]);
    },
  );
});
