import { useEffect, useMemo, useState, type FormEvent } from "react";
import "../styles/cook.css";
import { api } from "../lib/api";
import {
  currentMealType,
  dateValue,
  formatDate,
  mealIndex,
  mealName,
  mealTypes,
} from "../lib/meal";
import type { Group, WeeklyMenu } from "../lib/types";
import { CookOnboarding } from "./CookOnboarding";
import { DinerActionItems } from "./DinerActionItems";
import { GroupJoinQr } from "./GroupJoinQr";
import { LeaveGroupButton } from "./LeaveGroupButton";
import { RecipeButton } from "./RecipeButton";

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
type Leave = {
  id: string;
  mealDate: string;
  mealType: string | null;
  reason: string | null;
};
type LeaveRange = {
  start: string;
  startMeal: string;
  end: string;
  endMeal: string;
  reason: string | null;
};

type CookWorkspaceProps = {
  busy: boolean;
  group: Group;
  menus: WeeklyMenu[];
  currentUserName: string;
  run: (work: () => Promise<void>) => Promise<void>;
  onMessage: (message: string) => void;
  onBack: () => void;
  onLeave: () => void;
};

export function CookWorkspace({
  busy,
  group,
  menus,
  currentUserName,
  run,
  onMessage,
  onBack,
  onLeave,
}: CookWorkspaceProps) {
  const [selectedMeal, setSelectedMeal] = useState(() => currentMealType());
  const [menuDate, setMenuDate] = useState(() => new Date());
  const [preparations, setPreparations] = useState<Preparation[]>([]);
  const [leaves, setLeaves] = useState<Leave[]>([]);
  const [leaveFilter, setLeaveFilter] = useState<
    "UPCOMING" | "PRESENT" | "PAST"
  >("UPCOMING");
  const [editingLeave, setEditingLeave] = useState<LeaveRange | null>(null);
  const [menuHeadcounts, setMenuHeadcounts] = useState<Record<string, number>>(
    {},
  );
  const [tourOpen, setTourOpen] = useState(false);
  const [tourRequired, setTourRequired] = useState(false);

  const dailyMenus = useMemo(() => {
    const date = new Date();
    const weekday = ((date.getDay() + 6) % 7) + 1;
    return menus
      .filter((menu) => menu.weekday === weekday && menu.items.length)
      .sort(
        (left, right) => mealIndex(left.mealType) - mealIndex(right.mealType),
      );
  }, [menus]);

  useEffect(() => {
    void run(async () => {
      const data = await Promise.all(
        dailyMenus.map((menu) =>
          api<Preparation>(
            `/groups/${group.id}/preparation?date=${dateValue(new Date())}&mealType=${menu.mealType}`,
          ),
        ),
      );
      setPreparations(data);
    });
  }, [dailyMenus, group.id, run]);
  useEffect(() => {
    void api<{ leaves: Leave[] }>(`/groups/${group.id}/my/leaves`)
      .then((result) => setLeaves(result.leaves))
      .catch(() => setLeaves([]));
  }, [group.id]);
  useEffect(() => {
    void api<{ completed: boolean }>(`/groups/${group.id}/my/cook-onboarding`)
      .then(({ completed }) => {
        setTourRequired(!completed);
        setTourOpen(!completed);
      })
      .catch(() => undefined);
  }, [group.id]);

  const activeMeal = dailyMenus.some((menu) => menu.mealType === selectedMeal)
    ? selectedMeal
    : (dailyMenus[0]?.mealType ?? "LUNCH");
  const selectedPreparation = preparations.find(
    (preparation) => preparation.occurrence.mealType === activeMeal,
  );
  const selectedWeekday = ((menuDate.getDay() + 6) % 7) + 1;
  const visibleMenus = useMemo(
    () =>
      menus
        .filter((menu) => menu.weekday === selectedWeekday && menu.items.length)
        .sort(
          (left, right) => mealIndex(left.mealType) - mealIndex(right.mealType),
        ),
    [menus, selectedWeekday],
  );
  const isToday = menuDate.toDateString() === new Date().toDateString();
  const currentMenuMeal = isToday ? currentMealType() : null;
  useEffect(() => {
    void Promise.all(
      visibleMenus.map(async (menu) => ({
        mealType: menu.mealType,
        result: await api<{ expected: number }>(
          `/groups/${group.id}/headcount?date=${dateValue(menuDate)}&mealType=${menu.mealType}`,
        ),
      })),
    )
      .then((results) =>
        setMenuHeadcounts(
          Object.fromEntries(
            results.map(({ mealType, result }) => [mealType, result.expected]),
          ),
        ),
      )
      .catch(() => setMenuHeadcounts({}));
  }, [group.id, menuDate, visibleMenus]);
  const leaveRanges = useMemo(() => {
    const sortedLeaves = [...leaves].sort(
      (left, right) =>
        left.mealDate.localeCompare(right.mealDate) ||
        mealIndex(left.mealType ?? "BREAKFAST") -
          mealIndex(right.mealType ?? "BREAKFAST"),
    );
    const slot = (mealDate: string, mealType: string) =>
      Math.floor(Date.parse(`${mealDate}T12:00:00Z`) / 86_400_000) *
        mealTypes.length +
      mealIndex(mealType);

    return sortedLeaves.reduce<LeaveRange[]>((ranges, leave) => {
      const mealType = leave.mealType ?? "BREAKFAST";
      const previous = ranges.at(-1);
      if (
        previous &&
        previous.reason === leave.reason &&
        slot(leave.mealDate, mealType) ===
          slot(previous.end, previous.endMeal) + 1
      ) {
        previous.end = leave.mealDate;
        previous.endMeal = mealType;
      } else {
        ranges.push({
          start: leave.mealDate,
          startMeal: mealType,
          end: leave.mealDate,
          endMeal: mealType,
          reason: leave.reason,
        });
      }
      return ranges;
    }, []);
  }, [leaves]);

  const updatePreparation = (id: string, status: "PREPARED" | "UNPREPARED") =>
    void run(async () => {
      await api(`/groups/${group.id}/preparation/${id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      setPreparations((current) =>
        current.map((preparation) => ({
          ...preparation,
          items: preparation.items.map((item) =>
            item.id === id ? { ...item, status } : item,
          ),
        })),
      );
    });

  const recordLeave = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(async () => {
      const payload = {
        start: String(form.get("start")),
        startMeal: String(form.get("startMeal")),
        end: String(form.get("end")),
        endMeal: String(form.get("endMeal")),
        reason: String(form.get("reason") ?? "").trim() || null,
      };
      if (editingLeave)
        await api(`/groups/${group.id}/my/leaves`, {
          method: "DELETE",
          body: JSON.stringify(editingLeave),
        });
      await api(`/groups/${group.id}/my/leaves`, {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const result = await api<{ leaves: Leave[] }>(
        `/groups/${group.id}/my/leaves`,
      );
      setLeaves(result.leaves);
      setEditingLeave(null);
      onMessage(editingLeave ? "Leave updated." : "Leave recorded.");
    });
  };

  const deleteLeave = (leave: LeaveRange) => {
    if (!window.confirm("Delete this leave range?")) return;
    void run(async () => {
      await api(`/groups/${group.id}/my/leaves`, {
        method: "DELETE",
        body: JSON.stringify(leave),
      });
      const result = await api<{ leaves: Leave[] }>(
        `/groups/${group.id}/my/leaves`,
      );
      setLeaves(result.leaves);
      if (editingLeave === leave) setEditingLeave(null);
      onMessage("Leave deleted.");
    });
  };

  const setMealAvailability = (mealType: string, available: boolean) =>
    void run(async () => {
      const mealDate = dateValue(menuDate);
      const payload = {
        start: mealDate,
        startMeal: mealType,
        end: mealDate,
        endMeal: mealType,
        reason: null,
      };
      await api(`/groups/${group.id}/my/leaves`, {
        method: available ? "DELETE" : "POST",
        body: JSON.stringify(payload),
      });
      const result = await api<{ leaves: Leave[] }>(
        `/groups/${group.id}/my/leaves`,
      );
      setLeaves(result.leaves);
      onMessage(
        available
          ? `${mealName(mealType)} marked available.`
          : `${mealName(mealType)} marked not available.`,
      );
    });

  return (
    <section className="workspace cook-workspace">
      <header className="cook-header">
        <button className="text-button back-button" onClick={onBack}>
          ← All groups
        </button>
        <p className="eyebrow">{group.timezone}</p>
        <div className="group-title-row">
          <h1>{group.name}</h1>
          <div className="group-title-actions">
            <button
              className="secondary tour-button"
              onClick={() => {
                setTourRequired(false);
                setTourOpen(true);
              }}
            >
              Start cook tour
            </button>
            <GroupJoinQr group={group} />
            <LeaveGroupButton busy={busy} onLeave={onLeave} />
          </div>
        </div>
      </header>
      <div className="cook-top-grid">
        <div className="panel">
          <h2>Today’s preparation</h2>
          <div className="cook-controls">
            <label>
              Meal
              <select
                value={activeMeal}
                onChange={(event) => setSelectedMeal(event.target.value)}
              >
                {dailyMenus.map((menu) => (
                  <option key={menu.id} value={menu.mealType}>
                    {mealName(menu.mealType)}
                  </option>
                ))}
              </select>
            </label>
          </div>
          {selectedPreparation && (
            <article className="cook-daily-menu">
              <h3>{mealName(selectedPreparation.occurrence.mealType)}</h3>
              <p className="meal-headcount">
                <span aria-hidden="true">🙋🏻</span> ×{" "}
                {selectedPreparation.headcount}
              </p>
              {selectedPreparation.items.map((item) => (
                <div
                  className={`preparation-item${item.status === "PREPARED" ? " is-prepared" : ""}`}
                  key={item.id}
                >
                  <div className="preparation-item-details">
                    <input
                      className="preparation-checkbox"
                      type="checkbox"
                      aria-label={`Mark ${item.name} as ${item.status === "PREPARED" ? "not prepared" : "prepared"}`}
                      checked={item.status === "PREPARED"}
                      onChange={() =>
                        updatePreparation(
                          item.id,
                          item.status === "PREPARED"
                            ? "UNPREPARED"
                            : "PREPARED",
                        )
                      }
                      disabled={busy}
                    />
                    <strong>{item.name}</strong>
                    <RecipeButton recipeUrl={item.recipeUrl} />
                    <span className="dish-headcount">
                      <span aria-hidden="true">🙋🏻</span> × {item.expectedDiners}
                    </span>
                  </div>
                </div>
              ))}
            </article>
          )}
          {!dailyMenus.length && (
            <p className="empty">No meals are configured for this date.</p>
          )}
        </div>
      </div>
      <div className="panel cook-menu">
        <h2>Menu</h2>
        <div className="day-switcher" aria-label="Choose menu day">
          <button
            aria-label="Previous day"
            disabled={dateValue(menuDate) <= dateValue(new Date())}
            onClick={() =>
              setMenuDate((current) => new Date(current.getTime() - 86_400_000))
            }
          >
            &lt;
          </button>
          <strong>
            {isToday ? "Today · " : ""}
            {formatDate(menuDate)}
          </strong>
          <button
            aria-label="Next day"
            onClick={() =>
              setMenuDate((current) => new Date(current.getTime() + 86_400_000))
            }
          >
            &gt;
          </button>
        </div>
        <div className="daily-menu-grid">
          {visibleMenus.map((menu) => (
            <article
              className={`daily-menu${menu.mealType === currentMenuMeal ? " is-current-meal" : ""}`}
              key={menu.id}
            >
              <div className="cook-meal-heading">
                <h3>{mealName(menu.mealType)}</h3>
                <span
                  className="meal-headcount"
                  aria-label={`${menuHeadcounts[menu.mealType] ?? 0} diners`}
                >
                  <span aria-hidden="true">🙋🏻</span> ×{" "}
                  {menuHeadcounts[menu.mealType] ?? 0}
                </span>
              </div>
              {(() => {
                const unavailable = leaves.some(
                  (leave) =>
                    leave.mealDate === dateValue(menuDate) &&
                    leave.mealType === menu.mealType,
                );
                return (
                  <button
                    className="secondary cook-meal-availability"
                    onClick={() =>
                      setMealAvailability(menu.mealType, unavailable)
                    }
                    disabled={busy}
                  >
                    {unavailable ? "Available this day" : "Not available"}
                  </button>
                );
              })()}
              {menu.mealType === currentMenuMeal && (
                <p className="current-meal-marker">Current meal</p>
              )}
              <ul>
                {menu.items.map((item) => (
                  <li key={item.id}>
                    {item.name}
                    <span>{mealName(item.category)}</span>
                  </li>
                ))}
              </ul>
            </article>
          ))}
        </div>
        {!visibleMenus.length && (
          <p className="empty">No meals are configured for this date.</p>
        )}
      </div>
      <DinerActionItems
        busy={busy}
        group={group}
        currentUserName={currentUserName}
        embedded
        run={run}
        onMessage={onMessage}
      />
      <div className="panel cook-availability">
        <h2>Cook availability</h2>
        <form
          key={
            editingLeave
              ? `${editingLeave.start}-${editingLeave.startMeal}`
              : "new"
          }
          onSubmit={recordLeave}
        >
          <label>
            Start date
            <input
              name="start"
              type="date"
              min={dateValue(new Date())}
              defaultValue={editingLeave?.start ?? dateValue(new Date())}
              required
            />
          </label>
          <label>
            First missed meal
            <select
              name="startMeal"
              defaultValue={editingLeave?.startMeal ?? "BREAKFAST"}
            >
              {mealTypes.map((mealType) => (
                <option key={mealType} value={mealType}>
                  {mealName(mealType)}
                </option>
              ))}
            </select>
          </label>
          <label>
            End date
            <input
              name="end"
              type="date"
              min={dateValue(new Date())}
              defaultValue={editingLeave?.end ?? dateValue(new Date())}
              required
            />
          </label>
          <label>
            Last missed meal
            <select
              name="endMeal"
              defaultValue={editingLeave?.endMeal ?? "DINNER"}
            >
              {mealTypes.map((mealType) => (
                <option key={mealType} value={mealType}>
                  {mealName(mealType)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Reason
            <textarea name="reason" defaultValue={editingLeave?.reason ?? ""} />
          </label>
          <button className="primary" disabled={busy}>
            {editingLeave ? "Update leave" : "Record leave"}
          </button>
          {editingLeave && (
            <button
              className="text-button"
              type="button"
              onClick={() => setEditingLeave(null)}
            >
              Cancel
            </button>
          )}
        </form>
      </div>
      <div className="panel cook-leave-list">
        <h2>Recorded leaves</h2>
        <label>
          Show
          <select
            value={leaveFilter}
            onChange={(event) =>
              setLeaveFilter(
                event.target.value as "UPCOMING" | "PRESENT" | "PAST",
              )
            }
          >
            <option value="UPCOMING">Upcoming</option>
            <option value="PRESENT">Present</option>
            <option value="PAST">Past</option>
          </select>
        </label>
        {leaveRanges
          .filter((leave) => {
            const today = dateValue(new Date());
            return leaveFilter === "PRESENT"
              ? leave.start <= today && leave.end >= today
              : leaveFilter === "UPCOMING"
                ? leave.start > today
                : leave.end < today;
          })
          .map((leave) => (
            <div
              className="list-row"
              key={`${leave.start}-${leave.startMeal}-${leave.end}-${leave.endMeal}`}
            >
              <span>
                {leave.start} · {mealName(leave.startMeal)} – {leave.end} ·{" "}
                {mealName(leave.endMeal)}
                {leave.reason ? ` · ${leave.reason}` : ""}
              </span>
              <button
                type="button"
                aria-label="Edit leave"
                title="Edit leave"
                onClick={() => setEditingLeave(leave)}
              >
                ✎
              </button>
              <button
                type="button"
                aria-label="Delete leave"
                title="Delete leave"
                onClick={() => deleteLeave(leave)}
              >
                ×
              </button>
            </div>
          ))}
      </div>
      {tourOpen && (
        <CookOnboarding
          busy={busy}
          required={tourRequired}
          onClose={() => {
            setTourOpen(false);
            setTourRequired(false);
          }}
          onFinish={async () => {
            let saved = false;
            await run(async () => {
              await api(`/groups/${group.id}/my/cook-onboarding`, {
                method: "PUT",
              });
              saved = true;
            });
            return saved;
          }}
        />
      )}
    </section>
  );
}
