import { useEffect, useMemo, useState } from "react";
import "../styles/cook.css";
import { api } from "../lib/api";
import { loadCookPreparation, type WorkspaceDay } from "../lib/workspace";
import { currentMealType, dateValue, mealIndex, mealName } from "../lib/meal";
import type { Group, WeeklyMenu } from "../lib/types";
import { CookAvailability, type Leave } from "./CookAvailability";
import { CookMenu } from "./CookMenu";
import { CookOnboarding } from "./CookOnboarding";
import { DinerActionItems } from "./DinerActionItems";
import { GroupJoinQr } from "./GroupJoinQr";
import { LeaveGroupButton } from "./LeaveGroupButton";
import { RecipeButton } from "./RecipeButton";

type CookWorkspaceProps = {
  busy: boolean;
  initialDay: WorkspaceDay;
  onDateChange: (date: string) => void;
  group: Group;
  menus: WeeklyMenu[];
  currentUserName: string;
  run: (work: () => Promise<void>, trackBusy?: boolean) => Promise<void>;
  onMessage: (message: string) => void;
  onBack: () => void;
  onLeave: () => void;
};

export function CookWorkspace({
  busy,
  initialDay,
  onDateChange,
  group,
  menus,
  currentUserName,
  run,
  onMessage,
  onBack,
  onLeave,
}: CookWorkspaceProps) {
  const [selectedMeal, setSelectedMeal] = useState(
    () => initialDay.producer?.mealType ?? currentMealType(),
  );
  const [today, setToday] = useState(initialDay.date);
  const [preparations, setPreparations] = useState<
    Awaited<ReturnType<typeof loadCookPreparation>>[]
  >(initialDay.producer?.preparation ? [initialDay.producer.preparation] : []);
  const [leaves, setLeaves] = useState<Leave[]>(
    initialDay.producer?.leaves ?? [],
  );
  const [tourOpen, setTourOpen] = useState(
    !initialDay.producer?.onboardingCompleted,
  );
  const [tourRequired, setTourRequired] = useState(
    !initialDay.producer?.onboardingCompleted,
  );

  useEffect(() => {
    const now = new Date();
    const nextDay = new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + 1,
    );
    const timer = window.setTimeout(
      () => {
        const date = dateValue(new Date());
        setToday(date);
        onDateChange(date);
      },
      nextDay.getTime() - now.getTime() + 50,
    );
    return () => window.clearTimeout(timer);
  }, [today, onDateChange]);

  const dailyMenus = useMemo(() => {
    const date = new Date(`${today}T12:00:00`);
    const weekday = ((date.getDay() + 6) % 7) + 1;
    return menus
      .filter((menu) => menu.weekday === weekday && menu.items.length)
      .sort(
        (left, right) => mealIndex(left.mealType) - mealIndex(right.mealType),
      );
  }, [menus, today]);

  const activeMeal = dailyMenus.some((menu) => menu.mealType === selectedMeal)
    ? selectedMeal
    : (dailyMenus[0]?.mealType ?? "LUNCH");
  useEffect(() => {
    if (!dailyMenus.length) return;
    if (initialDay.producer?.mealType === activeMeal) return;
    let current = true;
    void run(async () => {
      const data = await loadCookPreparation(group.id, today, activeMeal);
      if (current)
        setPreparations((previous) => [
          ...previous.filter((item) => item.occurrence.mealType !== activeMeal),
          data,
        ]);
    }, false);
    return () => {
      current = false;
    };
  }, [
    activeMeal,
    dailyMenus.length,
    group.id,
    run,
    today,
    initialDay.producer,
  ]);
  const selectedPreparation = preparations.find(
    (preparation) =>
      preparation.occurrence.mealDate === today &&
      preparation.occurrence.mealType === activeMeal,
  );
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
          {initialDay.producer?.preparationError &&
            initialDay.producer.mealType === activeMeal && (
              <p className="empty">{initialDay.producer.preparationError}</p>
            )}
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
      <CookMenu
        busy={busy}
        group={group}
        menus={menus}
        leaves={leaves}
        today={today}
        headcounts={initialDay.producer?.headcounts ?? {}}
        run={run}
        onMessage={onMessage}
        onLeavesChange={setLeaves}
      />
      <CookAvailability
        busy={busy}
        group={group}
        leaves={leaves}
        run={run}
        onMessage={onMessage}
        onLeavesChange={setLeaves}
      />
      <DinerActionItems
        busy={busy}
        group={group}
        currentUserName={currentUserName}
        embedded
        run={run}
        onMessage={onMessage}
      />
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
