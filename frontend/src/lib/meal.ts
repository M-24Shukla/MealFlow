export const weekdays = [
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
  "Sunday",
];

export const mealTypes = ["BREAKFAST", "BRUNCH", "LUNCH", "SNACKS", "DINNER"];

export const mealName = (mealType: string) =>
  mealType.charAt(0) + mealType.slice(1).toLowerCase();

export const mealIndex = (mealType: string) => mealTypes.indexOf(mealType);

export const currentMealType = (date = new Date()) => {
  const minutes = date.getHours() * 60 + date.getMinutes();
  if (minutes < 11 * 60 + 30) return "BREAKFAST";
  if (minutes < 12 * 60 + 30) return "BRUNCH";
  if (minutes < 15 * 60 + 30) return "LUNCH";
  if (minutes < 19 * 60 + 30) return "SNACKS";
  return "DINNER";
};

export const roleName = (role: string) =>
  role === "CONSUMER" ? "Diner" : role === "PRODUCER" ? "Cook" : mealName(role);

export const formatDate = (date: Date) =>
  new Intl.DateTimeFormat("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);

export const dateValue = (date: Date) => {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
};

export const toGroupSlug = (value: string) =>
  value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "")
    .slice(0, 60);
