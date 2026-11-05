import { useEffect, useMemo, useState } from "react";
import { api } from "../lib/api";
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
  run,
  onMessage,
  onLeavesChange,
}: CookMenuProps) {
  const [selectedDate, setSelectedDate] = useState(() => new Date());
  const [menuHeadcounts, setMenuHeadcounts] = useState<Record<string, number>>(
    {},
  );
  const menuDate = useMemo(
    () =>
      dateValue(selectedDate) < today
        ? new Date(`${today}T12:00:00`)
        : selectedDate,
    [selectedDate, today],
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
  const isToday = dateValue(menuDate) === today;
  const currentMenuMeal = isToday ? currentMealType() : null;
  useEffect(() => {
    let current = true;
    void Promise.all(
      visibleMenus.map(async (menu) => ({
        mealType: menu.mealType,
        result: await api<{ expected: number }>(
          `/groups/${group.id}/headcount?date=${dateValue(menuDate)}&mealType=${menu.mealType}`,
        ),
      })),
    )
      .then((results) => {
        if (!current) return;
        setMenuHeadcounts(
          Object.fromEntries(
            results.map(({ mealType, result }) => [mealType, result.expected]),
          ),
        );
      })
      .catch(() => {
        if (current) setMenuHeadcounts({});
      });
    return () => {
      current = false;
    };
  }, [group.id, menuDate, visibleMenus]);
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
  );
}
