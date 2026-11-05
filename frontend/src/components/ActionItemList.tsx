import { useEffect, useRef } from "react";

export type ActionItemStatus = "" | "PENDING" | "COMPLETED";

export type ActionItem = {
  id: string;
  text: string;
  completed: boolean;
  createdByName: string;
  completedByName: string | null;
  createdAt: string;
  completedAt: string | null;
  dueDate: string;
};

type ActionItemListProps = {
  items: ActionItem[];
  status: ActionItemStatus;
  loading: boolean;
  error: string | null;
  busy: boolean;
  onStatusChange: (status: ActionItemStatus) => void;
  onRefresh: () => void;
  currentUserName: string;
  onCompletionChange: (id: string, completed: boolean) => void;
  onEdit: (item: ActionItem) => void;
  onDelete: (id: string) => void;
};

export function ActionItemList({
  items,
  status,
  loading,
  error,
  busy,
  onStatusChange,
  onRefresh,
  currentUserName,
  onCompletionChange,
  onEdit,
  onDelete,
}: ActionItemListProps) {
  const listRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const closeOutside = (event: PointerEvent) => {
      for (const details of listRef.current?.querySelectorAll<HTMLDetailsElement>(
        ".action-item-info[open]",
      ) ?? []) {
        if (!details.contains(event.target as Node)) details.open = false;
      }
    };
    document.addEventListener("pointerdown", closeOutside);
    return () => document.removeEventListener("pointerdown", closeOutside);
  }, []);
  const visibleItems = items
    .filter(
      (item) =>
        status !== "" &&
        (status === "COMPLETED" ? item.completed : !item.completed),
    )
    .sort(
      (left, right) =>
        right.dueDate.localeCompare(left.dueDate) ||
        right.createdAt.localeCompare(left.createdAt),
    );

  return (
    <div ref={listRef}>
      <div className="action-filter">
        <label>
          Show
          <select
            value={status}
            disabled={busy}
            onChange={(event) =>
              onStatusChange(event.target.value as ActionItemStatus)
            }
          >
            <option value="" disabled>
              Select status
            </option>
            <option value="PENDING">Pending</option>
            <option value="COMPLETED">Completed</option>
          </select>
        </label>
        <button
          type="button"
          aria-label="Refresh action items"
          title="Refresh"
          disabled={busy || loading || !status}
          onClick={onRefresh}
        >
          ↻
        </button>
      </div>
      {loading && <p role="status">Loading…</p>}
      {!loading && error && <p role="alert">{error}</p>}
      {!status && (
        <p className="empty">Select a status to load action items.</p>
      )}
      {!loading &&
        !error &&
        visibleItems.map((item) => (
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
              <small className="action-item-due">Due {item.dueDate}</small>
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
      {status && !loading && !error && !visibleItems.length && (
        <p className="empty">
          No {status === "COMPLETED" ? "completed" : "pending"} action items.
        </p>
      )}
    </div>
  );
}
