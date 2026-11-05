import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import "./App.css";
import "./styles/admin.css";
import { AdminWorkspace } from "./components/AdminWorkspace";
import { CookWorkspace } from "./components/CookWorkspace";
import { CreateGroupForm } from "./components/CreateGroupForm";
import { AttendanceIcon } from "./components/AttendanceIcon";
import { AuthForm } from "./components/AuthForm";
import { DinerActionItems } from "./components/DinerActionItems";
import { DinerOnboarding } from "./components/DinerOnboarding";
import { DinerWorkspace } from "./components/DinerWorkspace";
import { GroupJoinQr } from "./components/GroupJoinQr";
import { JoinOptions } from "./components/JoinOptions";
import { LeaveGroupButton } from "./components/LeaveGroupButton";
import { MenuEditor } from "./components/MenuEditor";
import { ReplacementDialog } from "./components/ReplacementDialog";
import { api } from "./lib/api";
import {
  dateValue,
  formatDate,
  mealIndex,
  mealName,
  mealTypes,
  roleName,
} from "./lib/meal";
import type {
  ActiveMeal,
  FoodInput,
  Group,
  MyJoinRequest,
  User,
  Vacation,
  WeeklyMenu,
} from "./lib/types";

type CookLeave = {
  membershipId: string;
  mealDate: string;
  mealType: string | null;
  reason: string | null;
};

type CookLeaveRange = {
  membershipId: string;
  start: string;
  startMeal: string;
  end: string;
  endMeal: string;
  reason: string | null;
};

type DailyMenuOverride = {
  mealType: string;
  items: WeeklyMenu["items"];
};

type DateView = {
  key: string;
  unavailable: string[];
  available: string[];
  menuItems: Record<string, WeeklyMenu["items"]>;
  itemAttendance: Record<string, "PRESENT" | "ABSENT">;
};

const emptyDateView: DateView = {
  key: "",
  unavailable: [],
  available: [],
  menuItems: {},
  itemAttendance: {},
};

const foodCategoryOrder = ["VEGAN", "VEG", "EGG", "NON_VEG"];
const foodCategoryName = (category: string) =>
  category === "NON_VEG" ? "Non-veg" : mealName(category);

export default function App() {
  const [path, setPath] = useState(() => window.location.pathname);
  const [user, setUser] = useState<User | null>(null);
  const [group, setGroupState] = useState<Group | null>(null);
  const workspaceRequestRef = useRef(0);
  const setGroup = useCallback((value: Group | null) => {
    workspaceRequestRef.current += 1;
    setGroupState(value);
  }, []);
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">(
    "success",
  );
  const [busy, setBusy] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [showAuthLoader, setShowAuthLoader] = useState(false);
  const [activeMeal, setActiveMeal] = useState<ActiveMeal | null | undefined>(
    undefined,
  );
  const [myJoinRequests, setMyJoinRequests] = useState<MyJoinRequest[]>([]);
  const [joinRequestStatus, setJoinRequestStatus] = useState("ALL");
  const [menus, setMenus] = useState<WeeklyMenu[]>([]);
  const [savedFoodItems, setSavedFoodItems] = useState<WeeklyMenu["items"]>([]);
  const [dateState, setDateState] = useState<DateView>(emptyDateView);
  const [recurringAbsences, setRecurringAbsences] = useState<
    {
      weekday: number;
      mealType: string;
    }[]
  >([]);
  const [onboardingOpen, setOnboardingOpen] = useState(false);
  const [onboardingRequired, setOnboardingRequired] = useState(false);
  const [recurringItemAbsences, setRecurringItemAbsences] = useState<string[]>(
    [],
  );
  const [dietaryCategories, setDietaryCategories] = useState<string[]>([]);
  const [cookLeaves, setCookLeaves] = useState<CookLeave[]>([]);
  const [cookCount, setCookCount] = useState(0);
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [menuEditorOpen, setMenuEditorOpen] = useState(false);
  const [replacement, setReplacement] = useState<{
    mealType: string;
    item: WeeklyMenu["items"][number];
  } | null>(null);
  const [menuDate, setMenuDate] = useState(() => new Date());
  const selectionKey = group?.id ? `${group.id}:${dateValue(menuDate)}` : "";
  const dateView = dateState.key === selectionKey ? dateState : emptyDateView;
  const dateUnavailable = dateView.unavailable;
  const dateAvailable = dateView.available;
  const dailyMenuItems = dateView.menuItems;
  const itemAttendance = dateView.itemAttendance;
  const [browserTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
  const selectionRef = useRef("");
  const loadMenuWorkspace = async (selectedGroup: Group) => {
    const requestId = ++workspaceRequestRef.current;
    const consumerRequest = selectedGroup.roles?.includes("CONSUMER")
      ? Promise.all([
          api<{ rules: { weekday: number; mealType: string }[] }>(
            `/groups/${selectedGroup.id}/my/recurring-absences`,
          ),
          api<{ vacations: Vacation[] }>(
            `/groups/${selectedGroup.id}/my/vacations`,
          ),
          api<{
            completed: boolean;
            absentMenuItemIds: string[];
            dietaryCategories: string[];
          }>(`/groups/${selectedGroup.id}/my/onboarding`),
        ]).then(
          (data) => ({ ok: true as const, data }),
          (error: unknown) => ({ ok: false as const, error }),
        )
      : null;
    const [menuData, cookLeaveData, foodData] = await Promise.all([
      api<{ data: WeeklyMenu[] }>(`/groups/${selectedGroup.id}/menus`),
      api<{ cookCount: number; leaves: CookLeave[] }>(
        `/groups/${selectedGroup.id}/cook-leaves`,
      ),
      api<{ data: WeeklyMenu["items"] }>(
        `/groups/${selectedGroup.id}/food-items`,
      ),
    ]);
    if (requestId !== workspaceRequestRef.current) return;
    setMenus(menuData.data);
    setSavedFoodItems(foodData.data);
    setCookLeaves(cookLeaveData.leaves);
    setCookCount(cookLeaveData.cookCount);
    if (consumerRequest) {
      const consumerResult = await consumerRequest;
      if (requestId !== workspaceRequestRef.current) return;
      if (!consumerResult.ok) throw consumerResult.error;
      const [availability, vacationData, onboarding] = consumerResult.data;
      setRecurringAbsences(availability.rules);
      setVacations(vacationData.vacations);
      setRecurringItemAbsences(onboarding.absentMenuItemIds);
      setDietaryCategories(onboarding.dietaryCategories);
      setOnboardingRequired(!onboarding.completed);
      setOnboardingOpen(!onboarding.completed);
    }
  };
  const loadDateAttendance = async (selectedGroup: Group, date: Date) => {
    const selection = `${selectedGroup.id}:${dateValue(date)}`;
    const result = await api<{
      overrides: { mealDate: string; mealType: string; attendance: string }[];
    }>(`/groups/${selectedGroup.id}/my/attendance?date=${dateValue(date)}`);
    if (selectionRef.current !== selection) return;
    setDateState((current) => ({
      ...(current.key === selection
        ? current
        : { ...emptyDateView, key: selection }),
      unavailable: result.overrides
        .filter((override) => override.attendance === "ABSENT")
        .map((override) => `${override.mealDate}:${override.mealType}`),
      available: result.overrides
        .filter((override) => override.attendance === "PRESENT")
        .map((override) => `${override.mealDate}:${override.mealType}`),
    }));
  };
  const loadMyGroups = async () => {
    const result = await api<{ data: Group[] }>("/groups/mine");
    setMyGroups(result.data);
    return result.data;
  };
  const loadMyJoinRequests = async () => {
    const result = await api<{ data: MyJoinRequest[] }>(
      "/groups/my/join-requests",
    );
    setMyJoinRequests(result.data);
  };
  const groupIdFromPath = path.match(/^\/groups\/([^/]+)$/)?.[1];
  const isGroupPage = Boolean(groupIdFromPath);
  const inviteSlug = isGroupPage
    ? null
    : new URLSearchParams(window.location.search).get("join");
  const invitedMembership = inviteSlug
    ? myGroups.find((item) => item.slug === inviteSlug)
    : undefined;
  useEffect(() => {
    selectionRef.current = selectionKey;
  }, [selectionKey]);
  useEffect(() => {
    void api<{ user: User }>("/auth/me")
      .then(async ({ user: authenticatedUser }) => {
        setUser(authenticatedUser);
        await loadMyGroups().catch(() => undefined);
        await loadMyJoinRequests().catch(() => undefined);
      })
      .catch(() => setUser(null))
      .finally(() => setAuthLoading(false));
  }, []);
  useEffect(() => {
    if (!authLoading) return;
    const timeout = window.setTimeout(() => setShowAuthLoader(true), 300);
    return () => window.clearTimeout(timeout);
  }, [authLoading]);
  useEffect(() => {
    const onPopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);
  useEffect(() => {
    if (!groupIdFromPath || !myGroups.length) return;
    const selectedGroup = myGroups.find((item) => item.id === groupIdFromPath);
    if (!selectedGroup || selectedGroup.id === group?.id) return;
    void Promise.resolve()
      .then(() => {
        setGroup(selectedGroup);
        return loadMenuWorkspace(selectedGroup);
      })
      .catch(() => undefined);
  }, [group?.id, groupIdFromPath, myGroups, setGroup]);
  useEffect(() => {
    if (!inviteSlug) return;
    let current = true;
    if (invitedMembership) {
      void Promise.resolve()
        .then(() => {
          if (!current) return;
          setGroup(invitedMembership);
          return loadMenuWorkspace(invitedMembership);
        })
        .catch(() => undefined);
      return () => {
        current = false;
      };
    }
    void api<{ group: Group }>(
      `/groups/public/${encodeURIComponent(inviteSlug)}`,
    )
      .then(async ({ group: invitedGroup }) => {
        if (!current) return;
        setGroup(invitedGroup);
        if (user && invitedGroup.roles) await loadMenuWorkspace(invitedGroup);
      })
      .catch(() => {
        if (current) setMessage("This invitation link is not available.");
      });
    return () => {
      current = false;
    };
  }, [inviteSlug, invitedMembership, user, setGroup]);
  useEffect(() => {
    let current = true;
    if (!group?.id || !group.roles?.includes("CONSUMER")) {
      return () => {
        current = false;
      };
    }
    void Promise.all([
      loadDateAttendance(group, menuDate),
      api<{ data: DailyMenuOverride[] }>(
        `/groups/${group.id}/menu-overrides?date=${dateValue(menuDate)}`,
      ).then(({ data }) => {
        if (!current) return;
        setDateState((previous) => ({
          ...(previous.key === selectionKey
            ? previous
            : { ...emptyDateView, key: selectionKey }),
          menuItems: Object.fromEntries(
            data.map((entry) => [entry.mealType, entry.items]),
          ),
        }));
      }),
      api<{
        recurringAbsentItemIds: string[];
        overrides: {
          itemId: string;
          mealType: string;
          attendance: "PRESENT" | "ABSENT";
        }[];
      }>(
        `/groups/${group.id}/my/item-attendance?date=${dateValue(menuDate)}`,
      ).then(({ recurringAbsentItemIds, overrides }) => {
        if (!current) return;
        setRecurringItemAbsences(recurringAbsentItemIds);
        setDateState((previous) => ({
          ...(previous.key === selectionKey
            ? previous
            : { ...emptyDateView, key: selectionKey }),
          itemAttendance: Object.fromEntries(
            overrides.map((override) => [
              `${override.mealType}:${override.itemId}`,
              override.attendance,
            ]),
          ),
        }));
      }),
    ]).catch(() => {
      if (!current) return;
      setDateState({ ...emptyDateView, key: selectionKey });
    });
    return () => {
      current = false;
    };
  }, [group, menuDate, selectionKey]);
  const run = useCallback(
    async (work: () => Promise<void>, trackBusy = true) => {
      if (trackBusy) setBusy(true);
      setMessage("");
      setMessageTone("success");
      try {
        await work();
      } catch (e) {
        setMessageTone("error");
        setMessage(e instanceof Error ? e.message : "Request failed.");
      } finally {
        if (trackBusy) setBusy(false);
      }
    },
    [],
  );
  const auth = (
    mode: "login" | "register",
    email: string,
    password: string,
    displayName: string,
  ) => {
    void run(async () => {
      const r = await api<{ user: User }>(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({
          email,
          password,
          ...(mode === "register" ? { displayName } : {}),
        }),
      });
      setUser(r.user);
      await loadMyGroups();
      setMessage(`Welcome, ${r.user.displayName}.`);
    });
  };
  const create = (groupName: string) => {
    void run(async () => {
      const r = await api<{ group: Group }>("/groups", {
        method: "POST",
        body: JSON.stringify({
          name: groupName,
          timezone: browserTimezone,
        }),
      });
      const createdGroup = { ...r.group, roles: ["ADMIN", "CONSUMER"] };
      await loadMyGroups();
      openGroup(createdGroup);
      setMessage(
        "Group created. Configure menus and preparation through the API workspace.",
      );
    });
  };
  const joinWithCode = (code: string) => {
    void run(async () => {
      const slug = code.trim().toLowerCase();
      if (!slug) throw new Error("Enter or scan an invitation code.");
      const r = await api<{ group: Group }>(
        `/groups/public/${encodeURIComponent(slug)}`,
      );
      setGroup(r.group);
      setActiveMeal(undefined);
      setMenus([]);
      if (user) await loadMenuWorkspace(r.group).catch(() => undefined);
    });
  };
  const request = (requestedRole: "CONSUMER" | "PRODUCER") =>
    void run(async () => {
      if (!user) throw new Error("Sign in before requesting to join a group.");
      if (!group) return;
      await api(`/groups/public/${group.slug}/join-requests`, {
        method: "POST",
        body: JSON.stringify({ requestedRole }),
      });
      await loadMyJoinRequests();
      setMessage(
        `Your ${requestedRole === "PRODUCER" ? "cook" : "member"} request was created and is pending approval.`,
      );
    });
  const openGroup = (selectedGroup: Group) =>
    void run(async () => {
      window.history.pushState({}, "", `/groups/${selectedGroup.id}`);
      setPath(window.location.pathname);
      setGroup(selectedGroup);
      setActiveMeal(undefined);
      await loadMenuWorkspace(selectedGroup);
    });
  const leaveGroup = () => {
    if (!group || !window.confirm(`Leave ${group.name}?`)) return;
    void run(async () => {
      await api(`/groups/${group.id}/my-membership`, { method: "DELETE" });
      await loadMyGroups();
      window.history.pushState({}, "", "/");
      setPath("/");
      setGroup(null);
      setMenus([]);
      setMessage(`You left ${group.name}.`);
    });
  };
  const isAdmin = group?.roles?.includes("ADMIN") ?? false;
  const isConsumer = group?.roles?.includes("CONSUMER") ?? false;
  const isProducer = group?.roles?.includes("PRODUCER") ?? false;
  const cookLeaveRanges = useMemo(() => {
    const slot = (mealDate: string, mealType: string) =>
      Math.floor(Date.parse(`${mealDate}T12:00:00Z`) / 86_400_000) *
        mealTypes.length +
      mealIndex(mealType);
    const leaves = [...cookLeaves].sort(
      (left, right) =>
        left.mealDate.localeCompare(right.mealDate) ||
        mealIndex(left.mealType ?? "BREAKFAST") -
          mealIndex(right.mealType ?? "BREAKFAST"),
    );

    return leaves.reduce<CookLeaveRange[]>((ranges, leave) => {
      const mealType = leave.mealType ?? "BREAKFAST";
      const previous = ranges.at(-1);
      if (
        previous &&
        previous.membershipId === leave.membershipId &&
        previous.reason === leave.reason &&
        slot(leave.mealDate, mealType) ===
          slot(previous.end, previous.endMeal) + 1
      ) {
        previous.end = leave.mealDate;
        previous.endMeal = mealType;
      } else {
        ranges.push({
          membershipId: leave.membershipId,
          start: leave.mealDate,
          startMeal: mealType,
          end: leave.mealDate,
          endMeal: mealType,
          reason: leave.reason,
        });
      }
      return ranges;
    }, []);
  }, [cookLeaves]);
  const sortedSavedFoodItems = useMemo(() => {
    const unique = new Map(
      savedFoodItems.map((item) => [
        `${item.category}:${item.name.trim().toLocaleLowerCase()}`,
        item,
      ]),
    );
    return [...unique.values()].sort(
      (left, right) =>
        foodCategoryOrder.indexOf(left.category) -
          foodCategoryOrder.indexOf(right.category) ||
        left.name.localeCompare(right.name, undefined, { sensitivity: "base" }),
    );
  }, [savedFoodItems]);
  const selectedWeekday = ((menuDate.getDay() + 6) % 7) + 1;
  const visibleMenus = useMemo(
    () =>
      menus
        .filter((menu) => menu.weekday === selectedWeekday && menu.items.length)
        .map((menu) => ({
          ...menu,
          items: dailyMenuItems[menu.mealType] ?? menu.items,
        }))
        .sort(
          (left, right) => mealIndex(left.mealType) - mealIndex(right.mealType),
        ),
    [menus, selectedWeekday, dailyMenuItems],
  );
  const cookUnavailableMeals = useMemo(
    () =>
      visibleMenus
        .filter((menu) => {
          const absentCooks = new Set(
            cookLeaves
              .filter(
                (leave) =>
                  leave.mealDate === dateValue(menuDate) &&
                  leave.mealType === menu.mealType,
              )
              .map((leave) => leave.membershipId),
          );
          return cookCount > 0 && absentCooks.size >= cookCount;
        })
        .map((menu) => menu.mealType),
    [visibleMenus, cookLeaves, cookCount, menuDate],
  );
  const isMealUnavailable = (mealType: string) =>
    !dateAvailable.includes(`${dateValue(menuDate)}:${mealType}`) &&
    (dateUnavailable.includes(`${dateValue(menuDate)}:${mealType}`) ||
      recurringAbsences.some(
        (rule) =>
          rule.weekday === selectedWeekday && rule.mealType === mealType,
      ));
  const isItemPresent = (mealType: string, itemId: string) => {
    if (isMealUnavailable(mealType)) return false;
    const override = itemAttendance[`${mealType}:${itemId}`];
    return (
      override === "PRESENT" ||
      (override !== "ABSENT" && !recurringItemAbsences.includes(itemId))
    );
  };
  const saveMenu = async (
    weekday: string,
    mealType: string,
    draftItems: FoodInput[],
  ) => {
    let saved = false;
    await run(async () => {
      if (!group) return;
      const items = draftItems.map((item) => ({
        ...item,
        category: ["VEG", "NON_VEG", "EGG", "VEGAN"].includes(item.category)
          ? item.category
          : "VEG",
        recipeUrl: item.recipeUrl || null,
        notes: item.notes || null,
      }));
      const result = await api<{ menu: WeeklyMenu }>(
        `/groups/${group.id}/menus/${weekday}/${mealType}`,
        { method: "PUT", body: JSON.stringify({ items }) },
      );
      setMenus((current) => [
        ...current.filter(
          (menu) =>
            menu.weekday !== result.menu.weekday ||
            menu.mealType !== result.menu.mealType,
        ),
        result.menu,
      ]);
      const foodData = await api<{ data: WeeklyMenu["items"] }>(
        `/groups/${group.id}/food-items`,
      );
      setSavedFoodItems(foodData.data);
      setActiveMeal(undefined);
      setMessage("Menu saved.");
      saved = true;
    });
    return saved;
  };
  const replaceMealItem = (
    name: string,
    category: string,
    recipeUrl: string,
  ) => {
    void run(async () => {
      if (!group || !replacement) return;
      const result = await api<{
        replacement: WeeklyMenu["items"][number];
        items: WeeklyMenu["items"];
      }>(
        `/groups/${group.id}/menu-overrides/${dateValue(menuDate)}/${replacement.mealType}/items/${replacement.item.id}`,
        {
          method: "PUT",
          body: JSON.stringify({
            name,
            category,
            recipeUrl: recipeUrl || null,
          }),
        },
      );
      if (selectionRef.current !== selectionKey) return;
      setDateState((current) => ({
        ...(current.key === selectionKey
          ? current
          : { ...emptyDateView, key: selectionKey }),
        menuItems: {
          ...(current.key === selectionKey
            ? current.menuItems
            : emptyDateView.menuItems),
          [replacement.mealType]: result.items,
        },
      }));
      setSavedFoodItems((current) => [...current, result.replacement]);
      setReplacement(null);
      setMessage("Dish changed for this date only.");
    });
  };
  const markMealUnavailable = (mealType: string) =>
    void run(async () => {
      if (!group) return;
      const date = dateValue(menuDate);
      await api(`/groups/${group.id}/my/attendance/${date}/${mealType}`, {
        method: "PUT",
        body: JSON.stringify({ attendance: "ABSENT" }),
      });
      if (selectionRef.current !== selectionKey) return;
      setDateState((current) => {
        const view =
          current.key === selectionKey
            ? current
            : { ...emptyDateView, key: selectionKey };
        return {
          ...view,
          unavailable: [
            ...new Set([...view.unavailable, `${date}:${mealType}`]),
          ],
          available: view.available.filter(
            (item) => item !== `${date}:${mealType}`,
          ),
        };
      });
    });
  const markMealAvailable = (mealType: string) =>
    void run(async () => {
      if (!group) return;
      const date = dateValue(menuDate);
      await api(`/groups/${group.id}/my/attendance/${date}/${mealType}`, {
        method: "PUT",
        body: JSON.stringify({ attendance: "PRESENT" }),
      });
      if (selectionRef.current !== selectionKey) return;
      setDateState((current) => {
        const view =
          current.key === selectionKey
            ? current
            : { ...emptyDateView, key: selectionKey };
        return {
          ...view,
          available: [...new Set([...view.available, `${date}:${mealType}`])],
          unavailable: view.unavailable.filter(
            (item) => item !== `${date}:${mealType}`,
          ),
        };
      });
    });
  const setItemPresent = (mealType: string, itemId: string, present: boolean) =>
    void run(async () => {
      if (!group) return;
      const attendance = present ? "PRESENT" : "ABSENT";
      await api(
        `/groups/${group.id}/my/item-attendance/${dateValue(menuDate)}/${mealType}/${itemId}`,
        {
          method: "PUT",
          body: JSON.stringify({ attendance }),
        },
      );
      if (selectionRef.current !== selectionKey) return;
      setDateState((current) => {
        const view =
          current.key === selectionKey
            ? current
            : { ...emptyDateView, key: selectionKey };
        return {
          ...view,
          itemAttendance: {
            ...view.itemAttendance,
            [`${mealType}:${itemId}`]: attendance,
          },
        };
      });
    });
  const markVacation = (
    event: FormEvent<HTMLFormElement>,
    editingVacation: Vacation | null,
    onSaved: () => void,
  ) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const start = String(form.get("start"));
    const startMeal = String(form.get("startMeal"));
    const end = String(form.get("end"));
    const endMeal = String(form.get("endMeal"));
    void run(async () => {
      if (
        !start ||
        !end ||
        start < dateValue(new Date()) ||
        start > end ||
        (start === end && mealIndex(startMeal) > mealIndex(endMeal))
      )
        throw new Error("Choose a valid vacation range.");
      if (!group) return;
      const result = await api<{ vacation: Vacation }>(
        editingVacation
          ? `/groups/${group.id}/my/vacations/${editingVacation.id}`
          : `/groups/${group.id}/my/vacation`,
        {
          method: editingVacation ? "PUT" : "POST",
          body: JSON.stringify({ start, startMeal, end, endMeal }),
        },
      );
      setVacations((current) =>
        editingVacation
          ? current.map((vacation) =>
              vacation.id === result.vacation.id ? result.vacation : vacation,
            )
          : [...current, result.vacation],
      );
      onSaved();
      await loadDateAttendance(group, menuDate);
      setMessage(editingVacation ? "Vacation updated." : "Vacation saved.");
    });
  };
  const deleteVacation = async (vacation: Vacation) => {
    let deleted = false;
    await run(async () => {
      if (!group) return;
      await api(`/groups/${group.id}/my/vacations/${vacation.id}`, {
        method: "DELETE",
      });
      setVacations((current) =>
        current.filter((item) => item.id !== vacation.id),
      );
      await loadDateAttendance(group, menuDate);
      setMessage("Vacation deleted.");
      deleted = true;
    });
    return deleted;
  };
  const saveRecurringAbsences = async (
    next: { weekday: number; mealType: string }[],
    showSavedMessage: boolean,
  ) => {
    let saved = false;
    const requestId = workspaceRequestRef.current;
    await run(async () => {
      if (!group) return;
      await api(`/groups/${group.id}/my/recurring-absences`, {
        method: "PUT",
        body: JSON.stringify({ rules: next }),
      });
      if (workspaceRequestRef.current !== requestId) return;
      setRecurringAbsences(next);
      if (showSavedMessage) setMessage("Recurring unavailability saved.");
      saved = true;
    });
    return saved;
  };
  const feedback = (
    event: FormEvent<HTMLFormElement>,
    mealDate: string,
    mealType: string,
  ) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(async () => {
      if (!group) return;
      await api(`/groups/${group.id}/meals/${mealDate}/${mealType}/feedback`, {
        method: "POST",
        body: JSON.stringify({
          itemId: form.get("itemId"),
          rating: Number(form.get("rating")),
          comment: form.get("comment"),
        }),
      });
      setMessage("Dish feedback submitted.");
    });
  };
  return (
    <main>
      <nav className="nav">
        <a className="brand" href="/">
          <img className="brand-icon" src="/favicon.svg" alt="" />
          Cook<span>DuKoo</span>
        </a>
        {user && (
          <div className="nav-actions">
            <span>{user.displayName}</span>
            <button
              onClick={() =>
                void run(async () => {
                  await api("/auth/logout", { method: "POST" });
                  setUser(null);
                  setGroup(null);
                  setMenus([]);
                  setActiveMeal(undefined);
                })
              }
            >
              Sign out
            </button>
          </div>
        )}
      </nav>
      {!isGroupPage && (
        <section className="hero">
          <p className="eyebrow">Shared kitchen, clearly coordinated</p>
          <h1>Every meal, on the same page.</h1>
          <p className="hero-copy">
            Menus, attendance, recipes, and preparation for every role in your
            group.
          </p>
        </section>
      )}
      {!isGroupPage && user && (
        <section className="my-groups">
          <div>
            <p className="eyebrow">Your groups</p>
            <h2>Choose a group</h2>
            <p className="empty">
              Open a group to see its menu, schedule, and meal details.
            </p>
          </div>
          <div className="group-grid">
            {myGroups.length ? (
              myGroups.map((item) => (
                <button
                  className="group-card"
                  key={item.id}
                  onClick={() => openGroup(item)}
                  disabled={busy}
                >
                  <strong>{item.name}</strong>
                  <span>{item.timezone}</span>
                  <small>{item.roles?.map(roleName).join(" · ")}</small>
                </button>
              ))
            ) : (
              <p className="empty">You are not a member of any groups yet.</p>
            )}
          </div>
          {myJoinRequests.length > 0 && (
            <div className="panel join-requests">
              <h2>Your join requests</h2>
              <label>
                Status
                <select
                  value={joinRequestStatus}
                  onChange={(event) => setJoinRequestStatus(event.target.value)}
                >
                  <option value="ALL">All</option>
                  <option value="PENDING">Pending</option>
                  <option value="APPROVED">Approved</option>
                  <option value="REJECTED">Rejected</option>
                </select>
              </label>
              {myJoinRequests
                .filter(
                  (request) =>
                    joinRequestStatus === "ALL" ||
                    request.status === joinRequestStatus,
                )
                .map((request) => (
                  <div className="list-row" key={request.id}>
                    <span>
                      <strong>{request.groupName}</strong>
                      <br />
                      {roleName(request.requestedRole)} ·{" "}
                      {request.status === "REJECTED"
                        ? "Request rejected"
                        : request.status === "PENDING"
                          ? "Request pending"
                          : "Request approved"}
                    </span>
                  </div>
                ))}
            </div>
          )}
        </section>
      )}
      {!isGroupPage && (
        <section className="workspace">
          {authLoading ? (
            showAuthLoader ? (
              <div className="panel">
                <p className="empty">Connecting…</p>
              </div>
            ) : null
          ) : !user ? (
            <AuthForm
              busy={busy}
              invited={Boolean(inviteSlug)}
              onSubmit={auth}
            />
          ) : (
            <CreateGroupForm
              busy={busy}
              timezone={browserTimezone}
              onSubmit={create}
            />
          )}
          {user && (
            <div className="panel">
              <h2>Join a group</h2>
              {!inviteSlug && <JoinOptions busy={busy} onJoin={joinWithCode} />}
              {group && (
                <div className="group-summary">
                  <h3>{group.name}</h3>
                  <p>{group.timezone}</p>
                  {!user && (
                    <p className="field-help">
                      Sign in first to request to join this group.
                    </p>
                  )}
                  {user && invitedMembership ? (
                    <button
                      className="primary"
                      onClick={() => openGroup(invitedMembership)}
                      disabled={busy}
                    >
                      Open your group
                    </button>
                  ) : user && !group.roles ? (
                    <div className="join-role-actions">
                      <p>Choose how you would like to join this group.</p>
                      <button
                        className="secondary join-role-option"
                        onClick={() => request("CONSUMER")}
                        disabled={busy}
                      >
                        <span aria-hidden="true">🍽️</span>
                        <span>
                          <strong>Diner</strong>
                          <small>View menus and manage your attendance.</small>
                        </span>
                      </button>
                      <button
                        className="secondary join-role-option"
                        onClick={() => request("PRODUCER")}
                        disabled={busy}
                      >
                        <span aria-hidden="true">👨‍🍳</span>
                        <span>
                          <strong>Cook</strong>
                          <small>
                            Manage preparation and cook availability.
                          </small>
                        </span>
                      </button>
                    </div>
                  ) : null}
                  {user && group.roles && (
                    <button
                      className="secondary"
                      onClick={() =>
                        void run(async () => {
                          const result = await api<{
                            activeMeal: ActiveMeal | null;
                          }>(`/groups/${group.id}/active-meal`);
                          setActiveMeal(result.activeMeal);
                        })
                      }
                      disabled={busy}
                    >
                      View active meal
                    </button>
                  )}
                  {activeMeal !== undefined && (
                    <div className="active-meal" aria-live="polite">
                      {activeMeal ? (
                        <>
                          <p className="eyebrow">Now serving</p>
                          <h4>{mealName(activeMeal.mealType)}</h4>
                          <p>
                            {activeMeal.startsAt.slice(11, 16)}–
                            {activeMeal.endsAt.slice(11, 16)} ·{" "}
                            {activeMeal.timezone}
                          </p>
                          {activeMeal.items.length ? (
                            <ul>
                              {activeMeal.items.map((item) => (
                                <li key={item.id}>
                                  {item.recipeUrl ? (
                                    <a
                                      href={item.recipeUrl}
                                      target="_blank"
                                      rel="noreferrer"
                                    >
                                      {item.name}
                                    </a>
                                  ) : (
                                    item.name
                                  )}
                                  <span>{mealName(item.category)}</span>
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="empty">
                              No menu items have been added for this meal yet.
                            </p>
                          )}
                        </>
                      ) : (
                        <p className="empty">
                          There is no active meal right now. Check back during a
                          scheduled meal window.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </section>
      )}
      {isGroupPage && user && group?.id && group.roles && !isProducer && (
        <section className="group-landing">
          <button
            className="text-button back-button"
            onClick={() => {
              window.history.pushState({}, "", "/");
              setPath("/");
              setGroup(null);
            }}
          >
            ← All groups
          </button>
          <p className="eyebrow">{group.timezone}</p>
          <div className="group-title-row">
            <h1>{group.name}</h1>
            <div className="group-title-actions">
              {isConsumer && (
                <button
                  className="secondary tour-button"
                  onClick={() => {
                    setOnboardingRequired(false);
                    setOnboardingOpen(true);
                  }}
                >
                  Start diner tour
                </button>
              )}
              <GroupJoinQr group={group} />
              <LeaveGroupButton busy={busy} onLeave={leaveGroup} />
            </div>
          </div>
          <div className="day-switcher" aria-label="Choose menu day">
            <button
              aria-label="Previous day"
              onClick={() =>
                setMenuDate(
                  (current) => new Date(current.getTime() - 86_400_000),
                )
              }
              disabled={menuDate <= new Date(new Date().setHours(0, 0, 0, 0))}
            >
              &lt;
            </button>
            <div>
              <strong>
                {menuDate.toDateString() === new Date().toDateString()
                  ? "Today · "
                  : ""}
                {formatDate(menuDate)}
              </strong>
            </div>
            <button
              aria-label="Next day"
              onClick={() =>
                setMenuDate(
                  (current) => new Date(current.getTime() + 86_400_000),
                )
              }
            >
              &gt;
            </button>
          </div>
          {visibleMenus.length > 0 && (
            <div className="daily-menu-grid">
              {visibleMenus.map((menu) => (
                <article className="daily-menu" key={menu.id}>
                  <h2>{mealName(menu.mealType)}</h2>
                  {cookUnavailableMeals.includes(menu.mealType) && (
                    <p className="unavailable-marker">👨‍🍳 Cook unavailable</p>
                  )}
                  {isConsumer && (
                    <button
                      className={`attendance-toggle meal-attendance-toggle${isMealUnavailable(menu.mealType) ? "" : " is-present"}`}
                      aria-pressed={!isMealUnavailable(menu.mealType)}
                      aria-label={`${mealName(menu.mealType)}: ${isMealUnavailable(menu.mealType) ? "absent" : "present"}`}
                      title={
                        isMealUnavailable(menu.mealType)
                          ? "Absent — select to mark present"
                          : "Present — select to mark absent"
                      }
                      onClick={() =>
                        isMealUnavailable(menu.mealType)
                          ? markMealAvailable(menu.mealType)
                          : markMealUnavailable(menu.mealType)
                      }
                      disabled={busy}
                    >
                      <AttendanceIcon
                        present={!isMealUnavailable(menu.mealType)}
                      />
                      {isMealUnavailable(menu.mealType) ? "Absent" : "Present"}
                    </button>
                  )}
                  <ul>
                    {menu.items.map((item) => (
                      <li key={item.id}>
                        {item.recipeUrl ? (
                          <a
                            href={item.recipeUrl}
                            target="_blank"
                            rel="noreferrer"
                          >
                            {item.name}
                          </a>
                        ) : (
                          item.name
                        )}
                        <div className="dish-actions">
                          <span>{foodCategoryName(item.category)}</span>
                          {isConsumer && (
                            <>
                              <button
                                type="button"
                                className={`attendance-toggle item-attendance-toggle${isItemPresent(menu.mealType, item.id) ? " is-present" : ""}`}
                                aria-pressed={isItemPresent(
                                  menu.mealType,
                                  item.id,
                                )}
                                aria-label={`${item.name}: ${isItemPresent(menu.mealType, item.id) ? "present" : "absent"}`}
                                title={
                                  isItemPresent(menu.mealType, item.id)
                                    ? "Included — select to skip this dish"
                                    : "Skipped — select to join this dish"
                                }
                                onClick={() =>
                                  setItemPresent(
                                    menu.mealType,
                                    item.id,
                                    !isItemPresent(menu.mealType, item.id),
                                  )
                                }
                                disabled={
                                  busy || isMealUnavailable(menu.mealType)
                                }
                              >
                                <AttendanceIcon
                                  present={isItemPresent(
                                    menu.mealType,
                                    item.id,
                                  )}
                                />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  setReplacement({
                                    mealType: menu.mealType,
                                    item,
                                  });
                                }}
                              >
                                Change
                              </button>
                            </>
                          )}
                        </div>
                      </li>
                    ))}
                  </ul>
                  {isConsumer && !isMealUnavailable(menu.mealType) && (
                    <details className="dish-feedback">
                      <summary>Give feedback</summary>
                      <form
                        onSubmit={(event) =>
                          feedback(event, dateValue(menuDate), menu.mealType)
                        }
                      >
                        <h3>Feedback for this meal</h3>
                        <label>
                          Dish
                          <select name="itemId" required>
                            {menu.items.map((item) => (
                              <option key={item.id} value={item.id}>
                                {item.name}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Rating
                          <select name="rating" defaultValue="5">
                            {[5, 4, 3, 2, 1].map((rating) => (
                              <option key={rating} value={rating}>
                                {rating}
                              </option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Comment
                          <textarea name="comment" required />
                        </label>
                        <button className="secondary" disabled={busy}>
                          Submit feedback
                        </button>
                      </form>
                    </details>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}
      {isGroupPage && user && group?.id && group.roles && isAdmin && (
        <button className="menu-add" onClick={() => setMenuEditorOpen(true)}>
          + Menu
        </button>
      )}
      {replacement && isConsumer && (
        <ReplacementDialog
          busy={busy}
          date={menuDate}
          mealType={replacement.mealType}
          item={replacement.item}
          savedFoodItems={sortedSavedFoodItems}
          onClose={() => setReplacement(null)}
          onSave={replaceMealItem}
        />
      )}
      {menuEditorOpen && isAdmin && (
        <MenuEditor
          busy={busy}
          menus={menus}
          savedFoodItems={sortedSavedFoodItems}
          onClose={() => setMenuEditorOpen(false)}
          onSave={saveMenu}
        />
      )}
      {isGroupPage &&
        user &&
        group?.id &&
        group.roles &&
        isConsumer &&
        onboardingOpen && (
          <DinerOnboarding
            key={`diner-onboarding:${group.id}`}
            busy={busy}
            initialAbsentItemIds={recurringItemAbsences}
            initialDietaryCategories={dietaryCategories}
            menus={menus}
            required={onboardingRequired}
            onClose={() => {
              setOnboardingOpen(false);
              setOnboardingRequired(false);
            }}
            onSave={async (absentMenuItemIds, selectedDietaryCategories) => {
              let saved = false;
              await run(async () => {
                await api(`/groups/${group.id}/my/onboarding`, {
                  method: "PUT",
                  body: JSON.stringify({
                    absentMenuItemIds,
                    dietaryCategories: selectedDietaryCategories,
                  }),
                });
                setRecurringItemAbsences(absentMenuItemIds);
                setDietaryCategories(selectedDietaryCategories);
                setOnboardingRequired(false);
                setMessage("Diner attendance preferences saved.");
                saved = true;
              });
              return saved;
            }}
          />
        )}
      {isGroupPage &&
        user &&
        group?.id &&
        group.roles &&
        isConsumer &&
        !isProducer && (
          <DinerActionItems
            key={`diner-actions:${group.id}`}
            busy={busy}
            group={group}
            currentUserName={user.displayName}
            run={run}
            onMessage={setMessage}
          />
        )}
      {isGroupPage &&
        user &&
        group?.id &&
        group.roles &&
        isConsumer &&
        !isProducer && (
          <section className="cook-leave-wrapper">
            <div className="panel cook-leave-schedule">
              <h2>Cook leave schedule</h2>
              {cookLeaveRanges.length ? (
                cookLeaveRanges.map((leave) => (
                  <p
                    className="list-row"
                    key={`${leave.membershipId}-${leave.start}-${leave.startMeal}-${leave.end}-${leave.endMeal}`}
                  >
                    <span>
                      👨‍🍳 {leave.start} · {mealName(leave.startMeal)} –{" "}
                      {leave.end} · {mealName(leave.endMeal)}
                      {leave.reason ? ` · ${leave.reason}` : ""}
                    </span>
                  </p>
                ))
              ) : (
                <p className="empty">No cook leave ranges are recorded.</p>
              )}
            </div>
          </section>
        )}
      {isGroupPage && user && group?.id && group.roles && isConsumer && (
        <DinerWorkspace
          key={`diner-workspace:${group.id}`}
          busy={busy}
          menus={menus}
          recurringAbsences={recurringAbsences}
          vacations={vacations}
          onSaveRecurringAbsences={(weekday, mealTypesToSkip) => {
            const next = [
              ...recurringAbsences.filter((rule) => rule.weekday !== weekday),
              ...mealTypesToSkip.map((mealType) => ({ weekday, mealType })),
            ];
            return saveRecurringAbsences(next, true);
          }}
          onDeleteRecurringAbsences={(weekday) => {
            const next = recurringAbsences.filter(
              (rule) => rule.weekday !== weekday,
            );
            void saveRecurringAbsences(next, false);
          }}
          onSubmitVacation={markVacation}
          onDeleteVacation={deleteVacation}
        />
      )}
      {isGroupPage && user && group?.id && group.roles && isAdmin && (
        <AdminWorkspace
          key={`admin-workspace:${group.id}`}
          busy={busy}
          group={group}
          run={run}
        />
      )}
      {isGroupPage && user && group?.id && group.roles && isProducer && (
        <CookWorkspace
          key={`cook-workspace:${group.id}`}
          busy={busy}
          group={group}
          menus={menus}
          currentUserName={user.displayName}
          run={run}
          onMessage={setMessage}
          onLeave={leaveGroup}
          onBack={() => {
            window.history.pushState({}, "", "/");
            setPath("/");
            setGroup(null);
          }}
        />
      )}
      {message && (
        <p className={`message message-${messageTone}`} role="status">
          {message}
        </p>
      )}
    </main>
  );
}
