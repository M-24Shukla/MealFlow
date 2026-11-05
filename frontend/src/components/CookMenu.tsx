import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
import { loadWorkspaceDay, type WorkspaceDay } from "../lib/workspace";
import {
  currentMealType,
  dateValue,
  formatDate,
  mealIndex,
  mealName,
} from "../lib/meal";
import type { Group, WeeklyMenu } from "../lib/types";
import type { Leave } from "./CookAvailability";

type CookMenuProps = {
  busy: boolean;
  group: Group;
  menus: WeeklyMenu[];
  leaves: Leave[];
  today: string;
  headcounts?: Record<string, number>;
  run: (work: () => Promise<void>, trackBusy?: boolean) => Promise<void>;
  onMessage: (message: string) => void;
  onLeavesChange: (leaves: Leave[]) => void;
};

export function CookMenu({
  busy,
  group,
  menus,
  leaves,
  today,
  headcounts = {},
  run,
  onMessage,
  onLeavesChange,
}: CookMenuProps) {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [loadedDay, setLoadedDay] = useState<WorkspaceDay | null>(null);
  const [menuError, setMenuError] = useState<{
    date: string;
    message: string;
  } | null>(null);
  const menuDate = useMemo(
    () =>
      dateValue(selectedDate) < today
        ? new Date(`${today}T12:00:00`)
        : selectedDate,
    [selectedDate, today],
  );
  const selectedDay = dateValue(menuDate);
  const isToday = selectedDay === today;
  const dateData = loadedDay?.date === selectedDay ? loadedDay : null;
  const loading = !isToday && !dateData && menuError?.date !== selectedDay;
  const dateMenus = isToday ? menus : (dateData?.menus ?? []);
  const selectedWeekday = ((menuDate.getDay() + 6) % 7) + 1;
  const visibleMenus = dateMenus
    .filter((menu) => menu.weekday === selectedWeekday && menu.items.length)
    .sort(
      (left, right) => mealIndex(left.mealType) - mealIndex(right.mealType),
    );
  const dateLeaves = isToday ? leaves : (dateData?.producer?.leaves ?? []);
  const currentMenuMeal = isToday ? currentMealType() : null;
  const menuHeadcounts = isToday
    ? headcounts
    : (dateData?.producer?.headcounts ?? {});
  useEffect(() => {
    if (isToday) return;
    let current = true;
    void loadWorkspaceDay(group.id, selectedDay)
      .then((data) => {
        if (current) {
          setLoadedDay(data);
          setMenuError(null);
        }
      })
      .catch((error: unknown) => {
        if (current)
          setMenuError({
            date: selectedDay,
            message:
              error instanceof Error
                ? error.message
                : "Unable to load this menu.",
          });
      });
    return () => {
      current = false;
    };
  }, [group.id, selectedDay, isToday]);
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
      onLeavesChange(result.leaves);
      setLoadedDay((current) =>
        current?.date === mealDate && current.producer
          ? {
              ...current,
              producer: {
                ...current.producer,
                leaves: result.leaves.filter(
                  (leave) => leave.mealDate === mealDate,
                ),
              },
            }
          : current,
      );
      onMessage(
        available
          ? `${mealName(mealType)} marked available.`
          : `${mealName(mealType)} marked not available.`,
      );
    });

  return (
    <div className="panel cook-menu">
      <h2>Menu</h2>
      <div className="day-switcher" aria-label="Choose menu day">
        <button
          aria-label="Previous day"
          disabled={dateValue(menuDate) <= dateValue(new Date())}
          onClick={() =>
            setSelectedDate(new Date(menuDate.getTime() - 86_400_000))
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
            setSelectedDate(new Date(menuDate.getTime() + 86_400_000))
          }
        >
          &gt;
        </button>
      </div>
      {loading && (
        <p className="empty" role="status">
          Loading menu…
        </p>
      )}
      {!isToday && !dateData && menuError?.date === selectedDay && (
        <p role="alert">{menuError.message}</p>
      )}
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
                aria-label={
                  menuHeadcounts[menu.mealType] === undefined
                    ? "Diner count not loaded"
                    : `${menuHeadcounts[menu.mealType]} diners`
                }
              >
                <span aria-hidden="true">🙋🏻</span> ×{" "}
                {menuHeadcounts[menu.mealType] ?? "—"}
              </span>
            </div>
            {(() => {
              const unavailable = dateLeaves.some(
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
      {!loading && (isToday || dateData) && !visibleMenus.length && (
        <p className="empty">No meals are configured for this date.</p>
      )}
    </div>
  );
}
