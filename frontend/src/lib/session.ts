import { api } from "./api";
import type { Group, User } from "./types";

let pending: Promise<{ user: User; groups: Group[] }> | undefined;

// Strict Mode may subscribe twice during startup. Share the in-flight read only.
export function loadInitialSession() {
  if (!pending) {
    pending = api<{ user: User }>("/auth/me")
      .then(async ({ user }) => {
        const result = await api<{ data: Group[] }>("/groups/mine").catch(
          () => ({ data: [] }),
        );
        return { user, groups: result.data };
      })
      .finally(() => {
        pending = undefined;
      });
  }
  return pending;
}
