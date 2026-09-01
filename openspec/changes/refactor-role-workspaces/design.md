## Architecture

`App` retains routing, authentication, group selection, and shared loading boundaries. `DinerWorkspace` and `CookWorkspace` own only role-specific UI and callbacks. Shared modules contain API access, date/meal constants, and reusable menu/action controls.

## Cook workspace order

1. Today’s preparation board with a meal selector.
2. All configured meals for the selected date, each showing diner count, preparation toggles, and recipe action.
3. Grocery sourcing and action items for the selected meal.
4. Cook leave/unavailability range controls.

Preparation states exposed to cooks are `UNPREPARED` and `PREPARED`; the legacy intermediate status is not rendered.
