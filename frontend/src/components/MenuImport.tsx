import { useState } from "react";

export const menuPrompt = `Help me create a recurring weekly food menu through a short interview.
First ask exactly six multiple-choice questions, ONE AT A TIME. Wait for my answer before asking the next question. Do not generate the menu or JSON until I have answered all six.
Use these questions and offer clearly labelled choices:
1. Which weekdays? A) All seven days B) Monday–Friday C) Saturday–Sunday D) Let me name specific weekdays.
2. Which meals? A) Breakfast, lunch and dinner B) Lunch and dinner C) Breakfast only D) Let me select any combination of breakfast, brunch, lunch, snacks and dinner.
3. Which diet? A) Vegan B) Vegetarian without eggs C) Vegetarian with eggs D) Include meat/fish. In the same question invite me to add allergies, ingredients to avoid, or other dietary restrictions in free text.
4. Which cuisine? A) North Indian B) South Indian C) Mixed Indian D) International/mixed.
5. What cooking effort? A) Quick and simple B) Moderate everyday cooking C) Elaborate meals D) A mix.
6. What budget? A) Budget-friendly B) Moderate C) Flexible.
Allow multiple selections where appropriate and a custom free-text answer for every question. Follow my actual answers and any additional preferences rather than assuming the first option. Do not include allergens or excluded ingredients I specify.
After all six answers, create the menu and return ONLY valid JSON, without markdown fences or explanatory text, in this exact structure:
{"menus":[{"weekday":1,"mealType":"BREAKFAST","items":[{"name":"Vegetable sandwich","category":"VEG","recipeUrl":null,"notes":null}]}]}
JSON rules (apply only to the final menu, not the interview):
- weekday is an integer: Monday=1, Tuesday=2, Wednesday=3, Thursday=4, Friday=5, Saturday=6, Sunday=7.
- mealType must be BREAKFAST, BRUNCH, LUNCH, SNACKS, or DINNER.
- category must be VEG, NON_VEG, EGG, or VEGAN. Label each dish accurately.
- Include each weekday/meal combination only once, with 1–50 dishes. Maximum 35 combinations.
- Dish names must have 1–120 characters; notes are null or up to 1000 characters.
- recipeUrl must be null unless you have a known HTTP(S) recipe URL. Do not invent links.
- Include only the requested days and meals. Do not add extra JSON fields.`;

type Props = {
  busy: boolean;
  onImport: (json: string) => Promise<boolean>;
};

export function MenuImport({ busy, onImport }: Props) {
  const [json, setJson] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [error, setError] = useState("");
  const copyPrompt = async () => {
    try {
      await navigator.clipboard.writeText(menuPrompt);
      setCopyMessage("Prompt copied.");
    } catch {
      setCopyMessage(
        "Could not copy the prompt. Please allow clipboard access and try again.",
      );
    }
  };
  return (
    <section className="menu-import">
      <h3>Import from AI</h3>
      <ol className="menu-import-instructions">
        <li>
          Copy the prompt and paste it into a new chat with your preferred AI.
        </li>
        <li>
          Answer six multiple-choice questions about days, meals, diet, cuisine,
          cooking effort, and budget. You can also give custom preferences.
        </li>
        <li>
          Copy the generated JSON, paste it below, and review it before
          importing.
        </li>
      </ol>
      <button
        type="button"
        className="secondary"
        onClick={() => void copyPrompt()}
      >
        Copy prompt
      </button>
      <p role="status">{copyMessage}</p>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          setError("");
          try {
            JSON.parse(json);
          } catch {
            setError(
              "Paste valid JSON only, without markdown fences or extra text.",
            );
            return;
          }
          void onImport(json)
            .then((saved) => {
              if (saved) setJson("");
            })
            .catch((reason: unknown) => {
              setError(
                reason instanceof Error
                  ? reason.message
                  : "Import failed. Please try again.",
              );
            });
        }}
      >
        <label>
          Menu JSON
          <textarea
            required
            rows={10}
            value={json}
            onChange={(event) => setJson(event.target.value)}
            placeholder={'{"menus": [...]}'}
          />
        </label>
        <p className="field-help">
          This replaces the entire menu for each included weekday and meal.
          Other weekly menus and dated dish overrides are kept. Review the JSON
          before importing.
        </p>
        {error && <p role="alert">{error}</p>}
        <button
          type="submit"
          className="primary"
          disabled={busy || !json.trim()}
        >
          {busy ? "Importing…" : "Import menus"}
        </button>
      </form>
    </section>
  );
}
