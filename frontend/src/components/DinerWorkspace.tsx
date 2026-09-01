import { useRef, type FormEvent } from "react";
import "../styles/diner.css";
import { mealIndex, mealName, mealTypes, weekdays } from "../lib/meal";
import type { Vacation, WeeklyMenu } from "../lib/types";
import {
  RecurringUnavailabilityCard,
  type RecurringAbsence,
} from "./RecurringUnavailabilityCard";

type DinerWorkspaceProps = {
  busy: boolean;
  menus: WeeklyMenu[];
  recurringAbsences: RecurringAbsence[];
  vacations: Vacation[];
  editingVacation: Vacation | null;
  availabilityDialogOpen: boolean;
  availabilityWeekday: string;
  editingAvailabilityDay: number | null;
  onAvailabilityWeekdayChange: (weekday: string) => void;
  onCloseAvailabilityDialog: () => void;
  onSaveRecurringAbsences: (
    event: FormEvent<HTMLFormElement>,
    weekday: number,
    mealTypes: string[],
  ) => void;
  onEditRecurringAbsences: (weekday: number) => void;
  onDeleteRecurringAbsences: (weekday: number) => void;
  onAddRecurringAbsences: () => void;
  onSubmitVacation: (event: FormEvent<HTMLFormElement>) => void;
  onEditVacation: (vacation: Vacation) => void;
  onDeleteVacation: (vacation: Vacation) => void;
  onCancelVacationEdit: () => void;
};

export function DinerWorkspace({
  busy,
  menus,
  recurringAbsences,
  vacations,
  editingVacation,
  availabilityDialogOpen,
  availabilityWeekday,
  editingAvailabilityDay,
  onAvailabilityWeekdayChange,
  onCloseAvailabilityDialog,
  onSaveRecurringAbsences,
  onEditRecurringAbsences,
  onDeleteRecurringAbsences,
  onAddRecurringAbsences,
  onSubmitVacation,
  onEditVacation,
  onDeleteVacation,
  onCancelVacationEdit,
}: DinerWorkspaceProps) {
  const vacationEndRef = useRef<HTMLInputElement>(null);

  return (
    <>
      {availabilityDialogOpen && (
        <div className="dialog-backdrop" role="presentation">
          <section
            className="panel food-dialog"
            role="dialog"
            aria-modal="true"
          >
            <h2>Add recurring unavailability</h2>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                onSaveRecurringAbsences(
                  event,
                  Number(availabilityWeekday),
                  new FormData(event.currentTarget)
                    .getAll("mealType")
                    .map(String),
                );
              }}
            >
              <label>
                Day
                <select
                  value={availabilityWeekday}
                  onChange={(event) =>
                    onAvailabilityWeekdayChange(event.target.value)
                  }
                >
                  {weekdays.map((day, index) => (
                    <option key={day} value={index + 1}>
                      {day}
                    </option>
                  ))}
                </select>
              </label>
              <fieldset>
                <legend>Meals to skip</legend>
                {menus
                  .filter(
                    (menu) =>
                      menu.weekday === Number(availabilityWeekday) &&
                      menu.items.length > 0,
                  )
                  .sort((a, b) => mealIndex(a.mealType) - mealIndex(b.mealType))
                  .map((menu) => (
                    <label key={menu.id}>
                      <input
                        type="checkbox"
                        name="mealType"
                        value={menu.mealType}
                        defaultChecked={
                          editingAvailabilityDay ===
                            Number(availabilityWeekday) &&
                          recurringAbsences.some(
                            (rule) =>
                              rule.weekday === Number(availabilityWeekday) &&
                              rule.mealType === menu.mealType,
                          )
                        }
                      />
                      {mealName(menu.mealType)}
                    </label>
                  ))}
              </fieldset>
              <button className="primary">Add</button>
              <button
                type="button"
                className="text-button"
                onClick={onCloseAvailabilityDialog}
              >
                Cancel
              </button>
            </form>
          </section>
        </div>
      )}
      <section className="workspace attendance-workspace">
        <h2>My attendance</h2>
        <div className="attendance-columns">
          <RecurringUnavailabilityCard
            rules={recurringAbsences}
            onEdit={onEditRecurringAbsences}
            onDelete={onDeleteRecurringAbsences}
            onAdd={onAddRecurringAbsences}
          />
          <section className="attendance-card">
            <h3>Planned vacation</h3>
            {vacations.length ? (
              <ul className="vacation-list">
                {vacations.map((vacation) => (
                  <li key={vacation.id}>
                    <span>
                      {vacation.startDate} · {mealName(vacation.startMeal)}{" "}
                      {" – "}
                      {vacation.endDate} · {mealName(vacation.endMeal)}
                    </span>
                    <button
                      type="button"
                      aria-label="Edit vacation"
                      title="Edit vacation"
                      onClick={() => onEditVacation(vacation)}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      aria-label="Delete vacation"
                      title="Delete vacation"
                      onClick={() => onDeleteVacation(vacation)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="empty">No planned vacations.</p>
            )}
            <form
              key={editingVacation?.id ?? "new"}
              onSubmit={onSubmitVacation}
            >
              <label>
                Start date
                <input
                  name="start"
                  type="date"
                  required
                  defaultValue={editingVacation?.startDate}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(event) => {
                    const end = vacationEndRef.current;
                    if (end) {
                      end.min = event.target.value;
                      if (end.value && end.value < event.target.value)
                        end.value = event.target.value;
                    }
                    vacationEndRef.current?.focus();
                  }}
                />
              </label>
              <label>
                First missed meal
                <select
                  name="startMeal"
                  defaultValue={editingVacation?.startMeal ?? "BREAKFAST"}
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
                  ref={vacationEndRef}
                  name="end"
                  type="date"
                  required
                  defaultValue={editingVacation?.endDate}
                  min={
                    editingVacation?.startDate ??
                    new Date().toISOString().slice(0, 10)
                  }
                />
              </label>
              <label>
                Last missed meal
                <select
                  name="endMeal"
                  defaultValue={editingVacation?.endMeal ?? "DINNER"}
                >
                  {mealTypes.map((mealType) => (
                    <option key={mealType} value={mealType}>
                      {mealName(mealType)}
                    </option>
                  ))}
                </select>
              </label>
              <button className="secondary" disabled={busy}>
                {editingVacation ? "Update vacation" : "Save vacation"}
              </button>
              {editingVacation && (
                <button
                  className="text-button"
                  type="button"
                  onClick={onCancelVacationEdit}
                >
                  Cancel
                </button>
              )}
            </form>
          </section>
        </div>
      </section>
    </>
  );
}
