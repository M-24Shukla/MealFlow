import { api } from "./api";
import type { ActionItem } from "../components/ActionItemList";
import type { Leave } from "../components/CookAvailability";
import type { Vacation, WeeklyMenu } from "./types";

type Rule = { weekday: number; mealType: string };
export type WorkspaceDay = {
  date: string;
  menus: WeeklyMenu[];
  cooks: { cookCount: number; leaves: (Leave & { membershipId: string })[] };
  actionItems: ActionItem[];
  consumer: {
    weeklyMenus: WeeklyMenu[];
    vacations: Vacation[];
    rules: Rule[];
    overrides: { mealDate: string; mealType: string; attendance: string }[];
    recurringAbsentItemIds: string[];
    itemOverrides: {
      itemId: string;
      mealType: string;
      attendance: "PRESENT" | "ABSENT";
    }[];
    onboardingCompleted: boolean;
  } | null;
  producer: {
    leaves: Leave[];
    onboardingCompleted: boolean;
    mealType: string | null;
    headcounts: Record<string, number>;
    preparation: Preparation | null;
    preparationError: string | null;
  } | null;
};
export type WorkspacePreferences = {
  menus: WeeklyMenu[];
  consumer: {
    rules: Rule[];
    vacations: Vacation[];
    onboarding: {
      completed: boolean;
      absentMenuItemIds: string[];
      dietaryCategories: string[];
    };
  } | null;
  producer: { leaves: Leave[] } | null;
};

// Coalesce simultaneous mount effects; completed results are never cached.
const pending = new Map<string, Promise<unknown>>();
function coalesce<T>(path: string): Promise<T> {
  let request = pending.get(path);
  if (!request) {
    request = api<T>(path).finally(() => pending.delete(path));
    pending.set(path, request);
  }
  return request as Promise<T>;
}
export function loadWorkspaceDay(
  groupId: string,
  date: string,
  mealType?: string,
) {
  return coalesce<WorkspaceDay>(
    `/groups/${groupId}/workspace?date=${date}${mealType ? `&mealType=${mealType}` : ""}`,
  );
}

type Preparation = {
  occurrence: { mealDate: string; mealType: string };
  items: {
    id: string;
    name: string;
    recipeUrl: string | null;
    status: string;
    expectedDiners: number;
  }[];
  headcount: number;
};
export function loadCookPreparation(
  groupId: string,
  date: string,
  mealType: string,
) {
  return coalesce<Preparation>(
    `/groups/${groupId}/preparation?date=${date}&mealType=${mealType}`,
  );
}
