import { useEffect, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { dateValue } from "../lib/meal";
import type { Group } from "../lib/types";
import { ActionItemList, type ActionItem } from "./ActionItemList";

type DinerActionItemsProps = {
  busy: boolean;
  group: Group;
  currentUserName: string;
  embedded?: boolean;
  run: (work: () => Promise<void>) => Promise<void>;
  onMessage: (message: string) => void;
};

export function DinerActionItems({
  busy,
  group,
  currentUserName,
  embedded = false,
  run,
  onMessage,
}: DinerActionItemsProps) {
  const [items, setItems] = useState<ActionItem[]>([]);

  useEffect(() => {
    void run(async () => {
      const result = await api<{ items: ActionItem[] }>(
        `/groups/${group.id}/action-items`,
      );
      setItems(result.items);
    });
  }, [group.id, run]);

  const addItem = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(async () => {
      const result = await api<{ item: ActionItem }>(
        `/groups/${group.id}/action-items`,
        {
          method: "POST",
          body: JSON.stringify({
            text: form.get("text"),
            dueDate: form.get("dueDate"),
          }),
        },
      );
      setItems((current) => [...current, result.item]);
      event.currentTarget.reset();
      onMessage("Action item added.");
    });
  };

  const updateItem = (id: string, completed: boolean) =>
    void run(async () => {
      const result = await api<{ item: ActionItem }>(
        `/groups/${group.id}/action-items/${id}`,
        { method: "PATCH", body: JSON.stringify({ completed }) },
      );
      setItems((current) =>
        current.map((item) => (item.id === id ? result.item : item)),
      );
      onMessage(
        completed
          ? "Action item completed."
          : "Action item returned to pending.",
      );
    });

  const editItem = (item: ActionItem) => {
    const text = window.prompt("Update action item", item.text)?.trim();
    if (!text) return;
    const dueDate = window.prompt("Update due date (YYYY-MM-DD)", item.dueDate);
    if (!dueDate) return;
    if (text === item.text && dueDate === item.dueDate) return;
    void run(async () => {
      const result = await api<{ item: ActionItem }>(
        `/groups/${group.id}/action-items/${item.id}`,
        { method: "PATCH", body: JSON.stringify({ text, dueDate }) },
      );
      setItems((current) =>
        current.map((action) => (action.id === item.id ? result.item : action)),
      );
      onMessage("Action item updated.");
    });
  };

  const deleteItem = (id: string) => {
    if (!window.confirm("Delete this action item?")) return;
    void run(async () => {
      await api(`/groups/${group.id}/action-items/${id}`, { method: "DELETE" });
      setItems((current) => current.filter((item) => item.id !== id));
      onMessage("Action item deleted.");
    });
  };

  return (
    <section
      className={
        embedded
          ? "action-items-workspace cook-action-items"
          : "workspace action-items-workspace"
      }
    >
      <h2>Action items</h2>
      <div className="action-items-columns">
        <section className="panel">
          <h3>Add action item</h3>
          <form onSubmit={addItem}>
            <label>
              Item to source or action to complete
              <textarea name="text" required />
            </label>
            <label>
              Due date
              <input
                name="dueDate"
                type="date"
                min={dateValue(new Date())}
                defaultValue={dateValue(new Date())}
                required
              />
            </label>
            <button className="secondary" disabled={busy}>
              Add action item
            </button>
          </form>
        </section>
        <section className="panel">
          <h3>Action items</h3>
          <ActionItemList
            items={items}
            currentUserName={currentUserName}
            onCompletionChange={updateItem}
            onEdit={editItem}
            onDelete={deleteItem}
          />
        </section>
      </div>
    </section>
  );
}
