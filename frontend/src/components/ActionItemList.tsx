import { useState } from "react";

export type ActionItem = {
  id: string;
  text: string;
  completed: boolean;
  createdByName: string;
  completedByName: string | null;
  createdAt: string;
  completedAt: string | null;
};

type ActionItemListProps = {
  items: ActionItem[];
  currentUserName: string;
  onCompletionChange: (id: string, completed: boolean) => void;
  onEdit: (item: ActionItem) => void;
  onDelete: (id: string) => void;
};

export function ActionItemList({
  items,
  currentUserName,
  onCompletionChange,
  onEdit,
  onDelete,
}: ActionItemListProps) {
  const [status, setStatus] = useState<"PENDING" | "COMPLETED">("PENDING");
  const visibleItems = items.filter((item) =>
    status === "COMPLETED" ? item.completed : !item.completed,
  );

  return (
    <>
      <label className="action-filter">
        Show
        <select
          value={status}
          onChange={(event) =>
            setStatus(event.target.value as "PENDING" | "COMPLETED")
          }
        >
          <option value="PENDING">Pending</option>
          <option value="COMPLETED">Completed</option>
        </select>
      </label>
      {visibleItems.map((item) => (
        <div className="list-row action-item-row" key={item.id}>
          <input
            type="checkbox"
            aria-label={`Mark ${item.text} as ${item.completed ? "pending" : "completed"}`}
            checked={item.completed}
            onChange={(event) =>
              onCompletionChange(item.id, event.target.checked)
            }
          />
          <span>
            <strong>{item.text}</strong>
          </span>
          <details className="action-item-info">
            <summary aria-label={`Details for ${item.text}`}>i</summary>
            <p>
              Requested by {item.createdByName} on{" "}
              {new Date(item.createdAt).toLocaleString()}.
            </p>
            {item.completedByName && (
              <p>
                Completed by{" "}
                {item.completedByName === currentUserName
                  ? "You"
                  : item.completedByName}
                {item.completedAt
                  ? ` on ${new Date(item.completedAt).toLocaleString()}.`
                  : "."}
              </p>
            )}
          </details>
          <button
            type="button"
            aria-label={`Edit ${item.text}`}
            onClick={() => onEdit(item)}
          >
            ✎
          </button>
          <button
            type="button"
            aria-label={`Delete ${item.text}`}
            onClick={() => onDelete(item.id)}
          >
            ×
          </button>
        </div>
      ))}
    </>
  );
}
