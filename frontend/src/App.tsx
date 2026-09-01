import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import "./App.css";
import "./styles/admin.css";
import { CookWorkspace } from "./components/CookWorkspace";
import { DinerActionItems } from "./components/DinerActionItems";
import { DinerWorkspace } from "./components/DinerWorkspace";
import { GroupJoinQr } from "./components/GroupJoinQr";
import { api } from "./lib/api";
import {
  dateValue,
  formatDate,
  mealIndex,
  mealName,
  mealTypes,
  roleName,
  toGroupSlug,
  weekdays,
} from "./lib/meal";
import type {
  ActiveMeal,
  FoodInput,
  Group,
  JoinRequest,
  Member,
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

export default function App() {
  const [path, setPath] = useState(() => window.location.pathname);
  const [user, setUser] = useState<User | null>(null);
  const [group, setGroup] = useState<Group | null>(null);
  const [myGroups, setMyGroups] = useState<Group[]>([]);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [message, setMessage] = useState("");
  const [messageTone, setMessageTone] = useState<"success" | "error">(
    "success",
  );
  const [busy, setBusy] = useState(false);
  const [authLoading, setAuthLoading] = useState(true);
  const [activeMeal, setActiveMeal] = useState<ActiveMeal | null | undefined>(
    undefined,
  );
  const [requests, setRequests] = useState<JoinRequest[]>([]);
  const [myJoinRequests, setMyJoinRequests] = useState<MyJoinRequest[]>([]);
  const [joinRequestStatus, setJoinRequestStatus] = useState("ALL");
  const [members, setMembers] = useState<Member[]>([]);
  const [menus, setMenus] = useState<WeeklyMenu[]>([]);
  const [recurringAbsences, setRecurringAbsences] = useState<
    {
      weekday: number;
      mealType: string;
    }[]
  >([]);
  const [availabilityDialogOpen, setAvailabilityDialogOpen] = useState(false);
  const [availabilityWeekday, setAvailabilityWeekday] = useState("1");
  const [editingAvailabilityDay, setEditingAvailabilityDay] = useState<
    number | null
  >(null);
  const [dateUnavailable, setDateUnavailable] = useState<string[]>([]);
  const [dateAvailable, setDateAvailable] = useState<string[]>([]);
  const [cookLeaves, setCookLeaves] = useState<CookLeave[]>([]);
  const [cookCount, setCookCount] = useState(0);
  const [vacations, setVacations] = useState<Vacation[]>([]);
  const [editingVacation, setEditingVacation] = useState<Vacation | null>(null);
  const [menuEditorOpen, setMenuEditorOpen] = useState(false);
  const [foodDialogOpen, setFoodDialogOpen] = useState(false);
  const [draftItems, setDraftItems] = useState<FoodInput[]>([]);
  const [editorWeekday, setEditorWeekday] = useState("1");
  const [editorMealType, setEditorMealType] = useState("BREAKFAST");
  const [editingFoodIndex, setEditingFoodIndex] = useState<number | null>(null);
  const [foodSearch, setFoodSearch] = useState("");
  const [saveAndContinue, setSaveAndContinue] = useState(false);
  const [groupName, setGroupName] = useState("");
  const [joinGroupSlug, setJoinGroupSlug] = useState("");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authDisplayName, setAuthDisplayName] = useState("");
  const [menuDate, setMenuDate] = useState(() => new Date());
  const [browserTimezone] = useState(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
  );
  const loadMenuWorkspace = async (selectedGroup: Group) => {
    const [menuData, cookLeaveData] = await Promise.all([
      api<{ data: WeeklyMenu[] }>(`/groups/${selectedGroup.id}/menus`),
      api<{ cookCount: number; leaves: CookLeave[] }>(
        `/groups/${selectedGroup.id}/cook-leaves`,
      ),
    ]);
    setMenus(menuData.data);
    setCookLeaves(cookLeaveData.leaves);
    setCookCount(cookLeaveData.cookCount);
    if (selectedGroup.roles?.includes("CONSUMER")) {
      const [availability, vacationData] = await Promise.all([
        api<{ rules: { weekday: number; mealType: string }[] }>(
          `/groups/${selectedGroup.id}/my/recurring-absences`,
        ),
        api<{ vacations: Vacation[] }>(
          `/groups/${selectedGroup.id}/my/vacations`,
        ),
      ]);
      setRecurringAbsences(availability.rules);
      setVacations(vacationData.vacations);
    }
  };
  const loadDateAttendance = async (selectedGroup: Group, date: Date) => {
    const result = await api<{
      overrides: { mealDate: string; mealType: string; attendance: string }[];
    }>(`/groups/${selectedGroup.id}/my/attendance?date=${dateValue(date)}`);
    setDateUnavailable(
      result.overrides
        .filter((override) => override.attendance === "ABSENT")
        .map((override) => `${override.mealDate}:${override.mealType}`),
    );
    setDateAvailable(
      result.overrides
        .filter((override) => override.attendance === "PRESENT")
        .map((override) => `${override.mealDate}:${override.mealType}`),
    );
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
  }, [group?.id, groupIdFromPath, myGroups]);
  useEffect(() => {
    if (!inviteSlug) return;
    if (invitedMembership) {
      setGroup(invitedMembership);
      void loadMenuWorkspace(invitedMembership).catch(() => undefined);
      return;
    }
    void api<{ group: Group }>(
      `/groups/public/${encodeURIComponent(inviteSlug)}`,
    )
      .then(async ({ group: invitedGroup }) => {
        setGroup(invitedGroup);
        if (user && invitedGroup.roles) await loadMenuWorkspace(invitedGroup);
      })
      .catch(() => setMessage("This invitation link is not available."));
  }, [inviteSlug, invitedMembership, user]);
  useEffect(() => {
    if (!group?.id || !group.roles?.includes("CONSUMER")) {
      setDateUnavailable([]);
      setDateAvailable([]);
      return;
    }
    setDateUnavailable([]);
    setDateAvailable([]);
    void loadDateAttendance(group, menuDate).catch(() => {
      setDateUnavailable([]);
      setDateAvailable([]);
    });
  }, [group, menuDate]);
  useEffect(() => {
    if (!menuEditorOpen) return;
    const existingMenu = menus.find(
      (menu) =>
        menu.weekday === Number(editorWeekday) &&
        menu.mealType === editorMealType,
    );
    setDraftItems(
      existingMenu?.items.map((item) => ({
        name: item.name,
        category: item.category,
        recipeUrl: item.recipeUrl ?? "",
        notes: item.notes ?? "",
      })) ?? [],
    );
  }, [editorMealType, editorWeekday, menuEditorOpen, menus]);
  const run = useCallback(async (work: () => Promise<void>) => {
    setBusy(true);
    setMessage("");
    setMessageTone("success");
    try {
      await work();
    } catch (e) {
      setMessageTone("error");
      setMessage(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }, []);
  const auth = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void run(async () => {
      const r = await api<{ user: User }>(`/auth/${mode}`, {
        method: "POST",
        body: JSON.stringify({
          email: authEmail,
          password: authPassword,
          ...(mode === "register" ? { displayName: authDisplayName } : {}),
        }),
      });
      setUser(r.user);
      await loadMyGroups();
      setMessage(`Welcome, ${r.user.displayName}.`);
    });
  };
  const create = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
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
  const join = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    void run(async () => {
      const slug = joinGroupSlug.trim().toLowerCase();
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
  const editingFood =
    editingFoodIndex === null ? null : (draftItems[editingFoodIndex] ?? null);
  const selectedWeekday = ((menuDate.getDay() + 6) % 7) + 1;
  const visibleMenus = menus
    .filter((menu) => menu.weekday === selectedWeekday && menu.items.length)
    .sort(
      (left, right) => mealIndex(left.mealType) - mealIndex(right.mealType),
    );
  const cookUnavailableMeals = visibleMenus
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
    .map((menu) => menu.mealType);
  const isMealUnavailable = (mealType: string) =>
    !dateAvailable.includes(`${dateValue(menuDate)}:${mealType}`) &&
    (dateUnavailable.includes(`${dateValue(menuDate)}:${mealType}`) ||
      recurringAbsences.some(
        (rule) =>
          rule.weekday === selectedWeekday && rule.mealType === mealType,
      ));
  const loadCreatorTools = () =>
    void run(async () => {
      if (!group?.id) return;
      const [requestData, memberData] = await Promise.all([
        api<{ data: JoinRequest[] }>(`/groups/${group.id}/join-requests`),
        api<{ data: Member[] }>(`/groups/${group.id}/members`),
      ]);
      setRequests(requestData.data);
      setMembers(memberData.data);
    });
  const review = (requestId: string, action: "approve" | "reject") =>
    void run(async () => {
      if (!group) return;
      await api(`/groups/${group.id}/join-requests/${requestId}/${action}`, {
        method: "POST",
      });
      await loadCreatorTools();
    });
  const setAdmin = (member: Member, isAdmin: boolean) =>
    void run(async () => {
      if (!group) return;
      await api(`/groups/${group.id}/members/${member.membershipId}/admin`, {
        method: "PUT",
        body: JSON.stringify({ isAdmin }),
      });
      await loadCreatorTools();
    });
  const saveMenu = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(async () => {
      if (!group) return;
      const weekday = String(form.get("weekday"));
      const mealType = String(form.get("mealType"));
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
        {
          method: "PUT",
          body: JSON.stringify({ items }),
        },
      );
      setMenus((current) => [
        ...current.filter(
          (menu) =>
            menu.weekday !== result.menu.weekday ||
            menu.mealType !== result.menu.mealType,
        ),
        result.menu,
      ]);
      setActiveMeal(undefined);
      setDraftItems([]);
      setFoodSearch("");
      if (!saveAndContinue) setMenuEditorOpen(false);
      setSaveAndContinue(false);
      setMessage("Menu saved.");
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
      setDateUnavailable((current) => [
        ...new Set([...current, `${date}:${mealType}`]),
      ]);
      setDateAvailable((current) =>
        current.filter((item) => item !== `${date}:${mealType}`),
      );
    });
  const markMealAvailable = (mealType: string) =>
    void run(async () => {
      if (!group) return;
      const date = dateValue(menuDate);
      await api(`/groups/${group.id}/my/attendance/${date}/${mealType}`, {
        method: "PUT",
        body: JSON.stringify({ attendance: "PRESENT" }),
      });
      setDateAvailable((current) => [
        ...new Set([...current, `${date}:${mealType}`]),
      ]);
      setDateUnavailable((current) =>
        current.filter((item) => item !== `${date}:${mealType}`),
      );
    });
  const markVacation = (event: FormEvent<HTMLFormElement>) => {
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
      setEditingVacation(null);
      await loadDateAttendance(group, menuDate);
      setMessage(editingVacation ? "Vacation updated." : "Vacation saved.");
    });
  };
  const deleteVacation = (vacation: Vacation) =>
    void run(async () => {
      if (!group) return;
      await api(`/groups/${group.id}/my/vacations/${vacation.id}`, {
        method: "DELETE",
      });
      setVacations((current) =>
        current.filter((item) => item.id !== vacation.id),
      );
      if (editingVacation?.id === vacation.id) setEditingVacation(null);
      await loadDateAttendance(group, menuDate);
      setMessage("Vacation deleted.");
    });
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
          Meal<span>Flow</span>
        </a>
        <div className="nav-actions">
          {user ? (
            <>
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
            </>
          ) : (
            <button
              onClick={() => setMode(mode === "login" ? "register" : "login")}
            >
              {mode === "login" ? "Register" : "Sign in"}
            </button>
          )}
        </div>
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
            <div className="panel">
              <p className="empty">Restoring your session…</p>
            </div>
          ) : !user ? (
            <div className="panel">
              <h2>
                {inviteSlug
                  ? mode === "login"
                    ? "Sign in to join this group"
                    : "Create an account to join this group"
                  : mode === "login"
                    ? "Sign in"
                    : "Create an account"}
              </h2>
              {inviteSlug && (
                <p className="field-help">
                  To join a group, sign in or create an account first. You can
                  request your role after authentication.
                </p>
              )}
              <form onSubmit={auth} autoComplete="off">
                {mode === "register" && (
                  <label>
                    Name
                    <input
                      name="displayName"
                      value={authDisplayName}
                      onChange={(event) =>
                        setAuthDisplayName(event.target.value)
                      }
                      required
                    />
                  </label>
                )}
                <label>
                  Email
                  <input
                    name="email"
                    type="email"
                    value={authEmail}
                    onChange={(event) => setAuthEmail(event.target.value)}
                    autoComplete="email"
                    required
                  />
                </label>
                <label>
                  Password
                  <input
                    name="password"
                    type="password"
                    value={authPassword}
                    onChange={(event) => setAuthPassword(event.target.value)}
                    autoComplete={
                      mode === "login" ? "current-password" : "new-password"
                    }
                    minLength={8}
                    required
                  />
                </label>
                <button className="primary" disabled={busy}>
                  {mode === "login" ? "Sign in" : "Register"}
                </button>
              </form>
            </div>
          ) : (
            <div className="panel">
              <h2>Create your group</h2>
              <form onSubmit={create} autoComplete="off">
                <label>
                  Name
                  <input
                    name="groupName"
                    value={groupName}
                    onChange={(event) => setGroupName(event.target.value)}
                    required
                  />
                </label>
                <p className="field-help">
                  Your group invitation link is generated automatically and
                  cannot be changed.
                </p>
                <label>
                  Your timezone
                  <input name="timezone" value={browserTimezone} readOnly />
                </label>
                <button className="primary" disabled={busy}>
                  Create group
                </button>
              </form>
            </div>
          )}
          <div className="panel">
            <h2>Join a group</h2>
            {!inviteSlug && (
              <form onSubmit={join} autoComplete="off">
                <label>
                  Invitation code
                  <input
                    name="joinGroupSlug"
                    value={joinGroupSlug}
                    onChange={(event) =>
                      setJoinGroupSlug(toGroupSlug(event.target.value))
                    }
                    placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                    autoComplete="off"
                    required
                  />
                </label>
                <button className="primary" disabled={busy}>
                  Open group
                </button>
              </form>
            )}
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
                        <small>Manage preparation and cook availability.</small>
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
            <GroupJoinQr group={group} />
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
                  {isMealUnavailable(menu.mealType) ? (
                    <>
                      <p className="unavailable-marker">Not available</p>
                      <button
                        className="secondary"
                        onClick={() => markMealAvailable(menu.mealType)}
                        disabled={busy}
                      >
                        Available this day
                      </button>
                    </>
                  ) : isConsumer ? (
                    <button
                      className="secondary"
                      onClick={() => markMealUnavailable(menu.mealType)}
                      disabled={busy}
                    >
                      Not available
                    </button>
                  ) : null}
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
                        <span>{mealName(item.category)}</span>
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
          <section className="panel cook-leave-schedule">
            <h2>Cook leave schedule</h2>
            {cookLeaveRanges.length ? (
              cookLeaveRanges.map((leave) => (
                <p
                  className="list-row"
                  key={`${leave.membershipId}-${leave.start}-${leave.startMeal}-${leave.end}-${leave.endMeal}`}
                >
                  <span>
                    👨‍🍳 {leave.start} · {mealName(leave.startMeal)} – {leave.end}{" "}
                    · {mealName(leave.endMeal)}
                    {leave.reason ? ` · ${leave.reason}` : ""}
                  </span>
                </p>
              ))
            ) : (
              <p className="empty">No cook leave ranges are recorded.</p>
            )}
          </section>
        </section>
      )}
      {isGroupPage && user && group?.id && group.roles && isConsumer && (
        <DinerActionItems
          busy={busy}
          group={group}
          menuDate={menuDate}
          menus={menus}
          currentUserName={user.displayName}
          run={run}
          onMessage={setMessage}
        />
      )}
      {isGroupPage && user && group?.id && group.roles && isAdmin && (
        <button className="menu-add" onClick={() => setMenuEditorOpen(true)}>
          +
        </button>
      )}
      {menuEditorOpen && isAdmin && (
        <div className="dialog-backdrop" role="presentation">
          <section
            className="panel menu-dialog"
            role="dialog"
            aria-modal="true"
          >
            <button
              className="dialog-close"
              aria-label="Close menu editor"
              onClick={() => setMenuEditorOpen(false)}
            >
              ×
            </button>
            <h2>Create or update menu</h2>
            <p className="field-help">
              A menu is a collection of food items for one day and meal course.
            </p>
            <form onSubmit={saveMenu}>
              <label>
                Weekday
                <select
                  name="weekday"
                  value={editorWeekday}
                  onChange={(event) => setEditorWeekday(event.target.value)}
                >
                  {weekdays.map((day, index) => (
                    <option key={day} value={index + 1}>
                      {day}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Meal
                <select
                  name="mealType"
                  value={editorMealType}
                  onChange={(event) => setEditorMealType(event.target.value)}
                >
                  {mealTypes.map((mealType) => (
                    <option key={mealType}>{mealType}</option>
                  ))}
                </select>
              </label>
              <div className="food-cards">
                {draftItems.map((item, index) => (
                  <div className="food-card" key={`${item.name}-${index}`}>
                    <span>{item.name}</span>
                    <button
                      type="button"
                      aria-label={`Edit ${item.name}`}
                      onClick={() => {
                        setEditingFoodIndex(index);
                        setFoodDialogOpen(true);
                      }}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${item.name}`}
                      onClick={() =>
                        setDraftItems((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <label>
                Saved food items
                <input
                  list="saved-food-items"
                  placeholder="Type to search food items"
                  value={foodSearch}
                  onChange={(event) => setFoodSearch(event.target.value)}
                />
                <datalist id="saved-food-items">
                  {menus
                    .flatMap((menu) => menu.items)
                    .map((item) => (
                      <option
                        key={item.id}
                        value={`${item.name} — ${item.category}`}
                      />
                    ))}
                </datalist>
              </label>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  const item = menus
                    .flatMap((menu) => menu.items)
                    .find((candidate) => foodSearch.startsWith(candidate.name));
                  if (!item) return;
                  setDraftItems((current) => [
                    ...current,
                    {
                      name: item.name,
                      category: item.category,
                      recipeUrl: item.recipeUrl ?? "",
                      notes: item.notes ?? "",
                    },
                  ]);
                  setFoodSearch("");
                }}
              >
                Add selected food item
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setEditingFoodIndex(null);
                  setFoodDialogOpen(true);
                }}
              >
                Add new food item
              </button>
              <p className="field-help">
                Food items can be edited or removed before saving this menu.
              </p>
              <div className="dialog-actions">
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => setSaveAndContinue(false)}
                >
                  Save menu
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  onClick={() => setSaveAndContinue(true)}
                >
                  Save and create another
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
      {foodDialogOpen && (
        <div className="dialog-backdrop" role="presentation">
          <section
            className="panel food-dialog"
            role="dialog"
            aria-modal="true"
          >
            <h2>Add food item</h2>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const item: FoodInput = {
                  name: String(form.get("name")),
                  category: String(form.get("category")),
                  recipeUrl: String(form.get("recipeUrl") ?? ""),
                  notes: String(form.get("notes") ?? ""),
                };
                setDraftItems((current) =>
                  editingFoodIndex === null
                    ? [...current, item]
                    : current.map((existing, index) =>
                        index === editingFoodIndex ? item : existing,
                      ),
                );
                setEditingFoodIndex(null);
                setFoodDialogOpen(false);
              }}
            >
              <label>
                Dish name
                <input name="name" defaultValue={editingFood?.name} required />
              </label>
              <label>
                Category
                <select
                  name="category"
                  defaultValue={editingFood?.category ?? "VEG"}
                >
                  <option>VEG</option>
                  <option>NON_VEG</option>
                  <option>EGG</option>
                  <option>VEGAN</option>
                </select>
              </label>
              <label>
                Recipe link
                <input
                  name="recipeUrl"
                  type="url"
                  defaultValue={editingFood?.recipeUrl}
                />
              </label>
              <label>
                Notes
                <textarea
                  name="notes"
                  defaultValue={editingFood?.notes}
                  placeholder="Serving, allergen, or preparation notes"
                />
              </label>
              <button className="primary">Add to menu</button>
              <button
                type="button"
                className="text-button"
                onClick={() => setFoodDialogOpen(false)}
              >
                Cancel
              </button>
            </form>
          </section>
        </div>
      )}
      {isGroupPage && user && group?.id && group.roles && isConsumer && (
        <DinerWorkspace
          busy={busy}
          menus={menus}
          recurringAbsences={recurringAbsences}
          vacations={vacations}
          editingVacation={editingVacation}
          availabilityDialogOpen={availabilityDialogOpen}
          availabilityWeekday={availabilityWeekday}
          editingAvailabilityDay={editingAvailabilityDay}
          onAvailabilityWeekdayChange={setAvailabilityWeekday}
          onCloseAvailabilityDialog={() => setAvailabilityDialogOpen(false)}
          onSaveRecurringAbsences={(_event, weekday, mealTypesToSkip) => {
            const next = [
              ...recurringAbsences.filter((rule) => rule.weekday !== weekday),
              ...mealTypesToSkip.map((mealType) => ({ weekday, mealType })),
            ];
            setRecurringAbsences(next);
            void run(async () => {
              if (!group) return;
              await api(`/groups/${group.id}/my/recurring-absences`, {
                method: "PUT",
                body: JSON.stringify({ rules: next }),
              });
              setMessage("Recurring unavailability saved.");
            });
            setAvailabilityDialogOpen(false);
          }}
          onEditRecurringAbsences={(weekday) => {
            setAvailabilityWeekday(String(weekday));
            setEditingAvailabilityDay(weekday);
            setAvailabilityDialogOpen(true);
          }}
          onDeleteRecurringAbsences={(weekday) => {
            const next = recurringAbsences.filter(
              (rule) => rule.weekday !== weekday,
            );
            setRecurringAbsences(next);
            void api(`/groups/${group.id}/my/recurring-absences`, {
              method: "PUT",
              body: JSON.stringify({ rules: next }),
            });
          }}
          onAddRecurringAbsences={() => {
            setEditingAvailabilityDay(null);
            setAvailabilityDialogOpen(true);
          }}
          onSubmitVacation={markVacation}
          onEditVacation={setEditingVacation}
          onDeleteVacation={deleteVacation}
          onCancelVacationEdit={() => setEditingVacation(null)}
        />
      )}
      {isGroupPage && user && group?.id && group.roles && isAdmin && (
        <section className="member-management">
          <h2>Members management</h2>
          <div className="member-management-grid">
            <section className="panel">
              <h2>Invite management</h2>
              <button
                className="primary"
                onClick={loadCreatorTools}
                disabled={busy}
              >
                Refresh requests & members
              </button>
              {requests.length === 0 ? (
                <p className="empty">No pending join requests.</p>
              ) : (
                requests.map((item) => (
                  <div className="list-row" key={item.id}>
                    <span>
                      <strong>{item.applicantName}</strong>
                      <br />
                      {item.requestedRole} · {item.applicantEmail}
                    </span>
                    <button onClick={() => review(item.id, "approve")}>
                      Approve
                    </button>
                    <button onClick={() => review(item.id, "reject")}>
                      Reject
                    </button>
                  </div>
                ))
              )}
            </section>
            <section className="panel">
              <h2>Member roles</h2>
              {members.length === 0 ? (
                <p className="empty">Load members to manage roles.</p>
              ) : (
                members.map((member) => (
                  <div className="list-row" key={member.membershipId}>
                    <span>
                      <strong>{member.displayName}</strong>
                      <br />
                      {member.roles.map(roleName).join(", ")}
                    </span>
                    {member.roles.includes("ADMIN") ? (
                      <button onClick={() => setAdmin(member, false)}>
                        Remove admin
                      </button>
                    ) : (
                      <button onClick={() => setAdmin(member, true)}>
                        Make admin
                      </button>
                    )}
                  </div>
                ))
              )}
            </section>
          </div>
        </section>
      )}
      {isGroupPage && user && group?.id && group.roles && isProducer && (
        <CookWorkspace
          busy={busy}
          group={group}
          menus={menus}
          currentUserName={user.displayName}
          run={run}
          onMessage={setMessage}
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
