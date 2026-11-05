import { MenuImport } from "./MenuImport";
import { useState, type FormEvent } from "react";
import { mealName, mealTypes, weekdays } from "../lib/meal";
import type { FoodInput, WeeklyMenu } from "../lib/types";

const foodCategoryOrder = ["VEGAN", "VEG", "EGG", "NON_VEG"];
const foodCategoryName = (category: string) =>
  category === "NON_VEG" ? "Non-veg" : mealName(category);

type MenuEditorProps = {
  busy: boolean;
  menus: WeeklyMenu[];
  savedFoodItems: WeeklyMenu["items"];
  onClose: () => void;
  onImport: (json: string) => Promise<boolean>;
  onSave: (
    weekday: string,
    mealType: string,
    items: FoodInput[],
  ) => Promise<boolean>;
};

const draftFor = (
  menus: WeeklyMenu[],
  weekday: string,
  mealType: string,
): FoodInput[] =>
  menus
    .find(
      (menu) => menu.weekday === Number(weekday) && menu.mealType === mealType,
    )
    ?.items.map((item) => ({
      name: item.name,
      category: item.category,
      recipeUrl: item.recipeUrl ?? "",
      notes: item.notes ?? "",
    })) ?? [];

export function MenuEditor({
  busy,
  menus,
  savedFoodItems,
  onClose,
  onSave,
  onImport,
}: MenuEditorProps) {
  const [mode, setMode] = useState<"manual" | "import">("manual");
  const [weekday, setWeekday] = useState("1");
  const [mealType, setMealType] = useState("BREAKFAST");
  const [draftItems, setDraftItems] = useState<FoodInput[]>(() =>
    draftFor(menus, "1", "BREAKFAST"),
  );
  const [foodSearch, setFoodSearch] = useState("");
  const [editingFoodIndex, setEditingFoodIndex] = useState<number | null>(null);
  const [foodDialogOpen, setFoodDialogOpen] = useState(false);
  const editingFood =
    editingFoodIndex === null ? null : (draftItems[editingFoodIndex] ?? null);

  const selectMenu = (nextWeekday: string, nextMealType: string) => {
    setWeekday(nextWeekday);
    setMealType(nextMealType);
    setDraftItems(draftFor(menus, nextWeekday, nextMealType));
  };

  const save = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent)
      .submitter as HTMLButtonElement | null;
    const continueEditing = submitter?.value === "continue";
    void onSave(weekday, mealType, draftItems).then((saved) => {
      if (!saved) return;
      setDraftItems([]);
      setFoodSearch("");
      if (!continueEditing) onClose();
    });
  };

  return (
    <>
      <div className="dialog-backdrop" role="presentation">
        <section className="panel menu-dialog" role="dialog" aria-modal="true">
          <button
            className="dialog-close"
            aria-label="Close menu editor"
            onClick={onClose}
          >
            ×
          </button>
          <h2>Create or update menu</h2>
          <p className="field-help">
            A menu is a collection of food items for one day and meal course.
          </p>
          <div
            className="dialog-actions menu-mode-switch"
            role="group"
            aria-label="Menu editing mode"
          >
            <button
              type="button"
              className={mode === "manual" ? "primary" : "secondary"}
              aria-pressed={mode === "manual"}
              disabled={busy}
              onClick={() => setMode("manual")}
            >
              Edit manually
            </button>
            <button
              type="button"
              className={mode === "import" ? "primary" : "secondary"}
              aria-pressed={mode === "import"}
              disabled={busy}
              onClick={() => setMode("import")}
            >
              Import from AI
            </button>
          </div>
          {mode === "import" ? (
            <MenuImport busy={busy} onImport={onImport} />
          ) : (
            <form onSubmit={save}>
              <label>
                Weekday
                <select
                  name="weekday"
                  value={weekday}
                  onChange={(event) => selectMenu(event.target.value, mealType)}
                >
                  {weekdays.map((day, index) => (
                    <option key={day} value={index + 1}>
                      {day}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Meal
                <select
                  name="mealType"
                  value={mealType}
                  onChange={(event) => selectMenu(weekday, event.target.value)}
                >
                  {mealTypes.map((meal) => (
                    <option key={meal}>{meal}</option>
                  ))}
                </select>
              </label>
              <div className="food-cards">
                {draftItems.map((item, index) => (
                  <div className="food-card" key={`${item.name}-${index}`}>
                    <span>{item.name}</span>
                    <button
                      type="button"
                      aria-label={`Edit ${item.name}`}
                      onClick={() => {
                        setEditingFoodIndex(index);
                        setFoodDialogOpen(true);
                      }}
                    >
                      ✎
                    </button>
                    <button
                      type="button"
                      aria-label={`Delete ${item.name}`}
                      onClick={() =>
                        setDraftItems((current) =>
                          current.filter((_, itemIndex) => itemIndex !== index),
                        )
                      }
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
              <label>
                Saved food items
                <select
                  value={foodSearch}
                  onChange={(event) => setFoodSearch(event.target.value)}
                >
                  <option value="">Choose a food item</option>
                  {foodCategoryOrder.map((category) => (
                    <optgroup key={category} label={foodCategoryName(category)}>
                      {savedFoodItems
                        .filter((item) => item.category === category)
                        .map((item) => (
                          <option key={item.id} value={item.id}>
                            {item.name}
                          </option>
                        ))}
                    </optgroup>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  const item = savedFoodItems.find(
                    (candidate) => candidate.id === foodSearch,
                  );
                  if (!item) return;
                  setDraftItems((current) => [
                    ...current,
                    {
                      name: item.name,
                      category: item.category,
                      recipeUrl: item.recipeUrl ?? "",
                      notes: item.notes ?? "",
                    },
                  ]);
                  setFoodSearch("");
                }}
              >
                Add selected food item
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  setEditingFoodIndex(null);
                  setFoodDialogOpen(true);
                }}
              >
                Add new food item
              </button>
              <p className="field-help">
                Food items can be edited or removed before saving this menu.
              </p>
              <div className="dialog-actions">
                <button
                  className="primary"
                  disabled={busy}
                  type="submit"
                  value="save"
                >
                  Save menu
                </button>
                <button
                  className="secondary"
                  disabled={busy}
                  type="submit"
                  value="continue"
                >
                  Save and create another
                </button>
              </div>
            </form>
          )}
        </section>
      </div>
      {foodDialogOpen && (
        <div className="dialog-backdrop" role="presentation">
          <section
            className="panel food-dialog"
            role="dialog"
            aria-modal="true"
          >
            <h2>Add food item</h2>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const form = new FormData(event.currentTarget);
                const item: FoodInput = {
                  name: String(form.get("name")),
                  category: String(form.get("category")),
                  recipeUrl: String(form.get("recipeUrl") ?? ""),
                  notes: String(form.get("notes") ?? ""),
                };
                setDraftItems((current) =>
                  editingFoodIndex === null
                    ? [...current, item]
                    : current.map((existing, index) =>
                        index === editingFoodIndex ? item : existing,
                      ),
                );
                setEditingFoodIndex(null);
                setFoodDialogOpen(false);
              }}
            >
              <label>
                Dish name
                <input name="name" defaultValue={editingFood?.name} required />
              </label>
              <label>
                Category
                <select
                  name="category"
                  defaultValue={editingFood?.category ?? "VEG"}
                >
                  {foodCategoryOrder.map((category) => (
                    <option key={category} value={category}>
                      {foodCategoryName(category)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Recipe link
                <input
                  name="recipeUrl"
                  type="url"
                  defaultValue={editingFood?.recipeUrl}
                />
              </label>
              <label>
                Notes
                <textarea
                  name="notes"
                  defaultValue={editingFood?.notes}
                  placeholder="Serving, allergen, or preparation notes"
                />
              </label>
              <button className="primary">Add to menu</button>
              <button
                type="button"
                className="text-button"
                onClick={() => setFoodDialogOpen(false)}
              >
                Cancel
              </button>
            </form>
          </section>
        </div>
      )}
    </>
  );
}
