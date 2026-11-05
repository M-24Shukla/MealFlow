import { useState, type FormEvent } from "react";
import { formatDate, mealName } from "../lib/meal";
import type { WeeklyMenu } from "../lib/types";

const foodCategoryOrder = ["VEGAN", "VEG", "EGG", "NON_VEG"];
const foodCategoryName = (category: string) =>
  category === "NON_VEG" ? "Non-veg" : mealName(category);

type ReplacementDialogProps = {
  busy: boolean;
  date: Date;
  mealType: string;
  item: WeeklyMenu["items"][number];
  savedFoodItems: WeeklyMenu["items"];
  onClose: () => void;
  onSave: (name: string, category: string, recipeUrl: string) => void;
};

export function ReplacementDialog({
  busy,
  date,
  mealType,
  item,
  savedFoodItems,
  onClose,
  onSave,
}: ReplacementDialogProps) {
  const [savedFoodId, setSavedFoodId] = useState("");
  const [name, setName] = useState("");
  const [category, setCategory] = useState("VEGAN");
  const [recipeUrl, setRecipeUrl] = useState("");

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave(name, category, recipeUrl);
  };

  return (
    <div className="dialog-backdrop" role="presentation">
      <section
        className="panel food-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="replacement-dialog-title"
      >
        <button
          className="dialog-close"
          aria-label="Close dish replacement"
          onClick={onClose}
        >
          ×
        </button>
        <h2 id="replacement-dialog-title">Change {item.name}</h2>
        <p className="field-help">
          This changes {mealName(mealType)} on {formatDate(date)} only.
        </p>
        <form onSubmit={submit}>
          <label>
            Saved food item
            <select
              value={savedFoodId}
              onChange={(event) => {
                const selected = savedFoodItems.find(
                  (food) => food.id === event.target.value,
                );
                setSavedFoodId(event.target.value);
                if (!selected) return;
                setName(selected.name);
                setCategory(selected.category);
                setRecipeUrl(selected.recipeUrl ?? "");
              }}
            >
              <option value="">Enter a new dish</option>
              {foodCategoryOrder.map((foodCategory) => (
                <optgroup
                  key={foodCategory}
                  label={foodCategoryName(foodCategory)}
                >
                  {savedFoodItems
                    .filter((food) => food.category === foodCategory)
                    .map((food) => (
                      <option key={food.id} value={food.id}>
                        {food.name}
                      </option>
                    ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label>
            Dish name
            <input
              value={name}
              onChange={(event) => {
                setName(event.target.value);
                setSavedFoodId("");
              }}
              required
            />
          </label>
          <label>
            Category
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
            >
              {foodCategoryOrder.map((foodCategory) => (
                <option key={foodCategory} value={foodCategory}>
                  {foodCategoryName(foodCategory)}
                </option>
              ))}
            </select>
          </label>
          <label>
            Recipe link
            <input
              type="url"
              value={recipeUrl}
              onChange={(event) => setRecipeUrl(event.target.value)}
            />
          </label>
          <div className="dialog-actions">
            <button className="primary" disabled={busy}>
              Change dish
            </button>
            <button type="button" className="secondary" onClick={onClose}>
              Cancel
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
