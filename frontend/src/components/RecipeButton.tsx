type RecipeButtonProps = { recipeUrl: string | null };

export function RecipeButton({ recipeUrl }: RecipeButtonProps) {
  if (!recipeUrl) {
    return (
      <span className="recipe-button is-unavailable" title="No recipe link">
        🔗<span className="sr-only">No recipe link</span>
      </span>
    );
  }
  return (
    <a
      className="recipe-button"
      href={recipeUrl}
      target="_blank"
      rel="noreferrer"
    >
      <span aria-hidden="true">🔗</span>
      <span className="sr-only">View recipe</span>
    </a>
  );
}
