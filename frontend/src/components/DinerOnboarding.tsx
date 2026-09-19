import { useMemo, useState } from "react";
import { mealIndex, mealName, weekdays } from "../lib/meal";
import type { WeeklyMenu } from "../lib/types";

const tourSteps = [
  {
    title: "Check the menu",
    body: "Move between days to see every configured meal, dish, recipe, and any cook-unavailable notice.",
  },
  {
    title: "Attendance and dish choices",
    body: "The blue raised hand means you are present. Select it for a meal or dish to switch between present and absent for that date.",
  },
  {
    title: "Feedback and menu updates",
    body: "Give dish feedback after a meal. Use Change when you need a date-specific dish update; the weekly menu stays unchanged.",
  },
  {
    title: "Cook leave schedule and action items",
    body: "Review cook leave information and the shared action-item list so you know what needs attention for each meal.",
  },
  {
    title: "Plan ahead",
    body: "Use recurring unavailability for a regular weekly pattern, or planned vacation for a date range.",
  },
  {
    title: "Members",
    body: "Group administrators can review join requests and manage cooks and diners from the Members section.",
  },
];

const dietaryOptions = [
  { value: "VEGAN", label: "Vegan" },
  { value: "VEG", label: "Vegetarian" },
  { value: "EGG", label: "Eggitarian" },
  { value: "NON_VEG", label: "Non-vegetarian" },
] as const;

type DinerOnboardingProps = {
  busy: boolean;
  initialAbsentItemIds: string[];
  initialDietaryCategories: string[];
  menus: WeeklyMenu[];
  required: boolean;
  onClose: () => void;
  onSave: (
    absentMenuItemIds: string[],
    dietaryCategories: string[],
  ) => Promise<boolean>;
};

export function DinerOnboarding({
  busy,
  initialAbsentItemIds,
  initialDietaryCategories,
  menus,
  required,
  onClose,
  onSave,
}: DinerOnboardingProps) {
  const [step, setStep] = useState(0);
  const [attendanceDayIndex, setAttendanceDayIndex] = useState(-1);
  const [selectedDietaryCategories, setSelectedDietaryCategories] = useState(
    () =>
      new Set(
        required && !initialDietaryCategories.length
          ? dietaryOptions.map(({ value }) => value)
          : initialDietaryCategories,
      ),
  );
  const [presentItemIds, setPresentItemIds] = useState(
    () =>
      new Set(
        menus
          .flatMap((menu) => menu.items)
          .map((item) => item.id)
          .filter((id) => !initialAbsentItemIds.includes(id)),
      ),
  );
  const orderedMenus = useMemo(
    () =>
      [...menus]
        .filter((menu) => menu.items.length)
        .sort(
          (left, right) =>
            left.weekday - right.weekday ||
            mealIndex(left.mealType) - mealIndex(right.mealType),
        ),
    [menus],
  );
  const allItemIds = orderedMenus.flatMap((menu) =>
    menu.items.map((item) => item.id),
  );
  const menuDays = weekdays.map((day, index) => ({
    day,
    weekday: index + 1,
    menus: orderedMenus.filter((menu) => menu.weekday === index + 1),
  }));
  const activeMenuDay = menuDays[attendanceDayIndex];
  const allSelected =
    allItemIds.length > 0 && allItemIds.every((id) => presentItemIds.has(id));

  const setItemsPresent = (itemIds: string[], present: boolean) => {
    setPresentItemIds((current) => {
      const next = new Set(current);
      for (const itemId of itemIds) {
        if (present) next.add(itemId);
        else next.delete(itemId);
      }
      return next;
    });
  };

  const setDietaryCategory = (category: string, selected: boolean) => {
    const next = new Set(selectedDietaryCategories);
    if (selected) next.add(category);
    else next.delete(category);
    setSelectedDietaryCategories(next);
    setPresentItemIds(
      new Set(
        menus
          .flatMap((menu) => menu.items)
          .filter((item) => next.has(item.category))
          .map((item) => item.id),
      ),
    );
  };

  const saveAttendance = async () => {
    const saved = await onSave(
      allItemIds.filter((id) => !presentItemIds.has(id)),
      [...selectedDietaryCategories],
    );
    if (saved) setStep(1);
  };

  return (
    <div className="dialog-backdrop diner-tour-backdrop" role="presentation">
      <section
        className="panel diner-tour"
        role="dialog"
        aria-modal="true"
        aria-labelledby="diner-tour-title"
      >
        {!required && (
          <button
            className="dialog-close diner-tour-close"
            aria-label="Close diner tour"
            onClick={onClose}
          >
            ×
          </button>
        )}
        {step === 0 ? (
          <>
            <p className="eyebrow">Diner setup</p>
            <h2 id="diner-tour-title">
              {attendanceDayIndex < 0
                ? "What are your dietary preferences?"
                : "Which dishes will you join?"}
            </h2>
            <p className="field-help">
              {attendanceDayIndex < 0
                ? "We’ll use these choices to preselect matching dishes. You can edit every dish individually on the following pages."
                : "You are present by default for matching dishes. Adjust any checkbox for your personal choices."}
            </p>
            {attendanceDayIndex < 0 ? (
              <div className="dietary-preference-list">
                {dietaryOptions.map((option) => (
                  <label key={option.value}>
                    <input
                      type="checkbox"
                      checked={selectedDietaryCategories.has(option.value)}
                      onChange={(event) =>
                        setDietaryCategory(option.value, event.target.checked)
                      }
                    />
                    {option.label}
                  </label>
                ))}
              </div>
            ) : (
              <>
                <label className="onboarding-select-all">
                  <input
                    type="checkbox"
                    checked={allSelected}
                    onChange={(event) =>
                      setItemsPresent(allItemIds, event.target.checked)
                    }
                  />
                  Count me in for every configured dish
                </label>
                <div className="onboarding-menu-list">
                  {activeMenuDay && (
                    <section
                      className="onboarding-day"
                      key={activeMenuDay.weekday}
                    >
                      <p className="onboarding-day-progress">
                        Day {attendanceDayIndex + 1} of {menuDays.length}
                      </p>
                      <div className="onboarding-day-heading">
                        <h3>{activeMenuDay.day}</h3>
                        <label className="onboarding-scope-select">
                          <input
                            type="checkbox"
                            checked={
                              activeMenuDay.menus.some(
                                (menu) => menu.items.length > 0,
                              ) &&
                              activeMenuDay.menus
                                .flatMap((menu) => menu.items)
                                .every((item) => presentItemIds.has(item.id))
                            }
                            disabled={!activeMenuDay.menus.length}
                            onChange={(event) =>
                              setItemsPresent(
                                activeMenuDay.menus.flatMap((menu) =>
                                  menu.items.map((item) => item.id),
                                ),
                                event.target.checked,
                              )
                            }
                          />
                          Count me in for everything on {activeMenuDay.day}
                        </label>
                      </div>
                      <div className="onboarding-day-meals">
                        {activeMenuDay.menus.map((menu) => (
                          <section className="onboarding-meal" key={menu.id}>
                            <div className="onboarding-meal-heading">
                              <h4>{mealName(menu.mealType)}</h4>
                              <label className="onboarding-scope-select meal-scope-select">
                                <input
                                  type="checkbox"
                                  checked={menu.items.every((item) =>
                                    presentItemIds.has(item.id),
                                  )}
                                  onChange={(event) =>
                                    setItemsPresent(
                                      menu.items.map((item) => item.id),
                                      event.target.checked,
                                    )
                                  }
                                />
                                I’ll have all {mealName(menu.mealType)} dishes
                              </label>
                            </div>
                            <div className="onboarding-dishes">
                              {menu.items.map((item) => (
                                <label key={item.id}>
                                  <input
                                    type="checkbox"
                                    checked={presentItemIds.has(item.id)}
                                    onChange={(event) =>
                                      setPresentItemIds((current) => {
                                        const next = new Set(current);
                                        if (event.target.checked)
                                          next.add(item.id);
                                        else next.delete(item.id);
                                        return next;
                                      })
                                    }
                                  />
                                  {item.name}
                                </label>
                              ))}
                            </div>
                          </section>
                        ))}
                        {!activeMenuDay.menus.length && (
                          <p className="empty onboarding-day-empty">
                            No menu is configured for {activeMenuDay.day}.
                          </p>
                        )}
                      </div>
                    </section>
                  )}
                  {!orderedMenus.length && (
                    <p className="empty">
                      No meals are configured yet. You will be present by
                      default when dishes are added.
                    </p>
                  )}
                </div>
              </>
            )}
            <div className="dialog-actions onboarding-day-actions">
              {attendanceDayIndex >= 0 && (
                <button
                  className="secondary"
                  onClick={() =>
                    setAttendanceDayIndex((current) => current - 1)
                  }
                >
                  Previous
                </button>
              )}
              {attendanceDayIndex < 0 ? (
                <button
                  className="primary"
                  onClick={() => setAttendanceDayIndex(0)}
                >
                  Next
                </button>
              ) : activeMenuDay && attendanceDayIndex < menuDays.length - 1 ? (
                <button
                  className="primary"
                  onClick={() =>
                    setAttendanceDayIndex((current) => current + 1)
                  }
                >
                  Next
                </button>
              ) : (
                <button
                  className="primary"
                  disabled={busy}
                  onClick={saveAttendance}
                >
                  Save and start tour
                </button>
              )}
            </div>
          </>
        ) : (
          <>
            <p className="eyebrow">
              Diner tour · {step} of {tourSteps.length}
            </p>
            <h2 id="diner-tour-title">{tourSteps[step - 1]!.title}</h2>
            <p className="tour-copy">{tourSteps[step - 1]!.body}</p>
            <div className="tour-progress" aria-hidden="true">
              {tourSteps.map((tourStep, index) => (
                <span
                  className={index < step ? "is-active" : ""}
                  key={tourStep.title}
                />
              ))}
            </div>
            <div className="dialog-actions tour-actions">
              <button
                className="secondary"
                onClick={() => setStep((current) => current - 1)}
              >
                Back
              </button>
              <button
                className="primary"
                onClick={() => {
                  if (step === tourSteps.length) onClose();
                  else setStep((current) => current + 1);
                }}
              >
                {step === tourSteps.length ? "Finish" : "Next"}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}
