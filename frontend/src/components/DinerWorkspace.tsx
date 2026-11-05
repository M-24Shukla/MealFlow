import { useRef, useState, type FormEvent } from "react";
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
  onSaveRecurringAbsences: (
    weekday: number,
    mealTypes: string[],
  ) => Promise<boolean>;
  onDeleteRecurringAbsences: (weekday: number) => void;
  onSubmitVacation: (
    event: FormEvent<HTMLFormElement>,
    editingVacation: Vacation | null,
    onSaved: () => void,
  ) => void;
  onDeleteVacation: (vacation: Vacation) => Promise<boolean>;
};

export function DinerWorkspace({
  busy,
  menus,
  recurringAbsences,
  vacations,
  onSaveRecurringAbsences,
  onDeleteRecurringAbsences,
  onSubmitVacation,
  onDeleteVacation,
}: DinerWorkspaceProps) {
  const vacationEndRef = useRef<HTMLInputElement>(null);
  const [editingVacation, setEditingVacation] = useState<Vacation | null>(null);
  const [availabilityDialogOpen, setAvailabilityDialogOpen] = useState(false);
  const [availabilityWeekday, setAvailabilityWeekday] = useState("1");
  const [editingAvailabilityDay, setEditingAvailabilityDay] = useState<
    number | null
  >(null);

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
                const meals = new FormData(event.currentTarget)
                  .getAll("mealType")
                  .map(String);
                void onSaveRecurringAbsences(
                  Number(availabilityWeekday),
                  meals,
                ).then((saved) => {
                  if (saved) setAvailabilityDialogOpen(false);
                });
              }}
            >
              <label>
                Day
                <select
                  value={availabilityWeekday}
                  onChange={(event) =>
                    setAvailabilityWeekday(event.target.value)
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
              <button className="primary" disabled={busy}>
                Add
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => setAvailabilityDialogOpen(false)}
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
            onEdit={(weekday) => {
              setAvailabilityWeekday(String(weekday));
              setEditingAvailabilityDay(weekday);
              setAvailabilityDialogOpen(true);
            }}
            onDelete={onDeleteRecurringAbsences}
            onAdd={() => {
              setEditingAvailabilityDay(null);
              setAvailabilityDialogOpen(true);
            }}
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
                      onClick={() => setEditingVacation(vacation)}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      aria-label="Delete vacation"
                      title="Delete vacation"
                      onClick={() => {
                        void onDeleteVacation(vacation).then((deleted) => {
                          if (deleted && editingVacation?.id === vacation.id)
                            setEditingVacation(null);
                        });
                      }}
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
              onSubmit={(event) =>
                onSubmitVacation(event, editingVacation, () =>
                  setEditingVacation(null),
                )
              }
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
                  onClick={() => setEditingVacation(null)}
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
