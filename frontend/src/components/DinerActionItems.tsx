import { useEffect, useState, type FormEvent } from "react";
import { api } from "../lib/api";
import { dateValue, mealName } from "../lib/meal";
import type { Group, WeeklyMenu } from "../lib/types";
import { ActionItemList, type ActionItem } from "./ActionItemList";

type DinerActionItemsProps = {
  busy: boolean;
  group: Group;
  menuDate: Date;
  menus: WeeklyMenu[];
  currentUserName: string;
  run: (work: () => Promise<void>) => Promise<void>;
  onMessage: (message: string) => void;
};

export function DinerActionItems({
  busy,
  group,
  menuDate,
  menus,
  currentUserName,
  run,
  onMessage,
}: DinerActionItemsProps) {
  const weekday = ((menuDate.getDay() + 6) % 7) + 1;
  const mealMenus = menus.filter(
    (menu) => menu.weekday === weekday && menu.items.length,
  );
  const [mealType, setMealType] = useState("");
  const [items, setItems] = useState<ActionItem[]>([]);
  const activeMeal = mealMenus.some((menu) => menu.mealType === mealType)
    ? mealType
    : (mealMenus[0]?.mealType ?? "");

  useEffect(() => {
    if (!activeMeal) {
      setItems([]);
      return;
    }
    void run(async () => {
      const results = await Promise.all(
        mealMenus.map((menu) =>
          api<{ items: ActionItem[] }>(
            `/groups/${group.id}/action-items?date=${dateValue(menuDate)}&mealType=${menu.mealType}`,
          ),
        ),
      );
      setItems(results.flatMap((result) => result.items));
    });
  }, [activeMeal, group.id, menuDate, run]);

  const addItem = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    void run(async () => {
      if (!activeMeal) return;
      const result = await api<{ item: ActionItem }>(
        `/groups/${group.id}/action-items?date=${dateValue(menuDate)}&mealType=${activeMeal}`,
        { method: "POST", body: JSON.stringify({ text: form.get("text") }) },
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
      onMessage(
        completed
          ? "Action item completed."
          : "Action item returned to pending.",
      );
    });

  const editItem = (item: ActionItem) => {
    const text = window.prompt("Update action item", item.text)?.trim();
    if (!text || text === item.text) return;
    void run(async () => {
      const result = await api<{ item: ActionItem }>(
        `/groups/${group.id}/action-items/${item.id}`,
        { method: "PATCH", body: JSON.stringify({ text }) },
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
    <section className="workspace diner-action-workspace">
      <div className="panel">
        <h2>Action items</h2>
        <label>
          Meal
          <select
            value={activeMeal}
            onChange={(event) => setMealType(event.target.value)}
          >
            {mealMenus.map((menu) => (
              <option key={menu.id} value={menu.mealType}>
                {mealName(menu.mealType)}
              </option>
            ))}
          </select>
        </label>
        <form onSubmit={addItem}>
          <label>
            Item to source or action to complete
            <textarea name="text" required />
          </label>
          <button className="secondary" disabled={busy || !activeMeal}>
            Add action item
          </button>
        </form>
        <ActionItemList
          items={items}
          currentUserName={currentUserName}
          onCompletionChange={updateItem}
          onEdit={editItem}
          onDelete={deleteItem}
        />
      </div>
    </section>
  );
}
