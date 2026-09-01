import { mealName, weekdays } from "../lib/meal";

export type RecurringAbsence = { weekday: number; mealType: string };

type RecurringUnavailabilityCardProps = {
  rules: RecurringAbsence[];
  onEdit: (weekday: number) => void;
  onDelete: (weekday: number) => void;
  onAdd: () => void;
};

export function RecurringUnavailabilityCard({
  rules,
  onEdit,
  onDelete,
  onAdd,
}: RecurringUnavailabilityCardProps) {
  return (
    <section className="attendance-card">
      <h3>Recurring unavailability</h3>
      {weekdays.map((day, index) => {
        const meals = rules.filter((rule) => rule.weekday === index + 1);
        return meals.length ? (
          <p key={day}>
            <strong>{day}</strong> ·{" "}
            {meals.map((rule) => mealName(rule.mealType)).join(", ")}{" "}
            <button
              aria-label={`Edit ${day}`}
              onClick={() => onEdit(index + 1)}
            >
              ✎
            </button>
            <button
              aria-label={`Delete ${day}`}
              onClick={() => onDelete(index + 1)}
            >
              ×
            </button>
          </p>
        ) : null;
      })}
      {!rules.length && <p className="empty">No recurring absences.</p>}
      <button className="secondary" onClick={onAdd}>
        Add recurring unavailability
      </button>
    </section>
  );
}
