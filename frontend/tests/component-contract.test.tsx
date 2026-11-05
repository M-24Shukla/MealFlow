import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AuthForm } from "../src/components/AuthForm";
import { AdminWorkspace } from "../src/components/AdminWorkspace";
import { CookAvailability } from "../src/components/CookAvailability";
import { CookMenu } from "../src/components/CookMenu";
import { DinerActionItems } from "../src/components/DinerActionItems";
import { ActionItemList } from "../src/components/ActionItemList";
import { CreateGroupForm } from "../src/components/CreateGroupForm";
import { JoinOptions } from "../src/components/JoinOptions";
import { MenuEditor } from "../src/components/MenuEditor";
import { ReplacementDialog } from "../src/components/ReplacementDialog";
import type { Group, WeeklyMenu } from "../src/lib/types";

const group: Group = {
  id: "group-1",
  slug: "demo",
  name: "Demo",
  timezone: "Asia/Kolkata",
  roles: ["ADMIN", "PRODUCER"],
};
const run = async (work: () => Promise<void>) => work();

const menu: WeeklyMenu = {
  id: "menu-1",
  weekday: 1,
  mealType: "BREAKFAST",
  items: [
    {
      id: "item-1",
      name: "Poha",
      category: "VEG",
      recipeUrl: null,
      notes: null,
    },
  ],
};

test("authentication retains login fields and invitation wording", () => {
  const html = renderToStaticMarkup(
    createElement(AuthForm, {
      busy: false,
      invited: true,
      onSubmit: () => undefined,
    }),
  );
  assert.match(html, /Sign in to join this group/);
  assert.match(html, /name="email"/);
  assert.match(html, /name="password"/);
  assert.match(html, /minLength="8"/);
});

test("group creation retains name and read-only timezone fields", () => {
  const html = renderToStaticMarkup(
    createElement(CreateGroupForm, {
      busy: false,
      timezone: "Asia/Kolkata",
      onSubmit: () => undefined,
    }),
  );
  assert.match(html, /name="groupName"/);
  assert.match(html, /value="Asia\/Kolkata"/);
  assert.match(html, /readOnly=""/);
});

test("joining retains both QR and invitation modes", () => {
  const html = renderToStaticMarkup(
    createElement(JoinOptions, {
      busy: false,
      onJoin: () => undefined,
    }),
  );
  assert.match(html, /Join via QR code/);
  assert.match(html, /Invitation code/);
  assert.match(html, /Scan QR code/);
});

test("menu editor opens with the selected menu draft and both save actions", () => {
  const html = renderToStaticMarkup(
    createElement(MenuEditor, {
      busy: false,
      menus: [menu],
      savedFoodItems: menu.items,
      onClose: () => undefined,
      onSave: async () => true,
      onImport: async () => true,
    }),
  );
  assert.match(html, /Poha/);
  assert.match(html, /Save menu/);
  assert.match(html, /Save and create another/);
  assert.match(html, /value="continue"/);
  assert.match(html, /class="primary" aria-pressed="true"[^>]*>Edit manually/);
  assert.match(
    html,
    /class="secondary" aria-pressed="false"[^>]*>Import from AI/,
  );
});

test("replacement dialog retains selected dish, date, and required replacement name", () => {
  const html = renderToStaticMarkup(
    createElement(ReplacementDialog, {
      busy: false,
      date: new Date(2026, 9, 5),
      mealType: "BREAKFAST",
      item: menu.items[0],
      savedFoodItems: menu.items,
      onClose: () => undefined,
      onSave: () => undefined,
    }),
  );
  assert.match(html, /Change Poha/);
  assert.match(html, /only\./);
  assert.match(html, /required=""/);
});

test("admin workspace waits for explicit loading before showing member data", () => {
  const html = renderToStaticMarkup(
    createElement(AdminWorkspace, {
      busy: false,
      group,
      run,
      currentUserId: "test-user",
    }),
  );
  assert.match(html, /Load members/);
  assert.doesNotMatch(html, /No pending join requests/);
  assert.doesNotMatch(html, /No active members/);
});

test("cook availability retains leave form and filters", () => {
  const html = renderToStaticMarkup(
    createElement(CookAvailability, {
      busy: false,
      group,
      leaves: [],
      run,
      onMessage: () => undefined,
      onLeavesChange: () => undefined,
    }),
  );
  assert.match(html, /<h2>Leave<\/h2>/);
  assert.match(html, /name="start"/);
  assert.match(html, /name="end"/);
  assert.match(html, /Record leave/);
  assert.match(html, /Upcoming/);
  assert.match(html, /Present/);
  assert.match(html, /Past/);
  assert.match(html, /Select period/);
  assert.match(html, /Select a period to load leave plans/);
});

test("action items start unselected with a compact disabled refresh control", () => {
  const html = renderToStaticMarkup(
    createElement(DinerActionItems, {
      busy: false,
      group,
      currentUserName: "Test",
      run,
      onMessage: () => undefined,
    }),
  );
  assert.match(html, /Select status/);
  assert.match(html, /Select a status to load action items/);
  assert.match(html, /aria-label="Refresh action items"/);
  assert.doesNotMatch(html, /Load action items for all dates/);
  assert.doesNotMatch(html, /No pending action items/);
});

test("action-item filtering shows loading instead of stale results or an empty-state message", () => {
  const html = renderToStaticMarkup(
    createElement(ActionItemList, {
      items: [],
      status: "PENDING",
      loading: true,
      error: null,
      busy: false,
      currentUserName: "Test",
      onStatusChange: () => undefined,
      onRefresh: () => undefined,
      onCompletionChange: () => undefined,
      onEdit: () => undefined,
      onDelete: () => undefined,
    }),
  );
  assert.match(html, /role="status">Loading/);
  assert.doesNotMatch(html, /No pending action items/);
});

test("cook menu retains date navigation and meal availability", () => {
  const today = new Date();
  const html = renderToStaticMarkup(
    createElement(CookMenu, {
      busy: false,
      group,
      menus: [{ ...menu, weekday: ((today.getDay() + 6) % 7) + 1 }],
      leaves: [],
      headcounts: { BREAKFAST: 4 },
      today: `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`,
      run,
      onMessage: () => undefined,
      onLeavesChange: () => undefined,
    }),
  );
  assert.match(html, /Previous day/);
  assert.match(html, /Next day/);
  assert.match(html, /Not available/);
  assert.match(html, /Poha/);
  assert.match(html, /4 diners/);
});

test("cook menu moves off a stale selected day when today advances", () => {
  const nextDay = new Date();
  nextDay.setDate(nextDay.getDate() + 1);
  const html = renderToStaticMarkup(
    createElement(CookMenu, {
      busy: false,
      group,
      menus: [{ ...menu, weekday: ((nextDay.getDay() + 6) % 7) + 1 }],
      leaves: [],
      today: `${nextDay.getFullYear()}-${String(nextDay.getMonth() + 1).padStart(2, "0")}-${String(nextDay.getDate()).padStart(2, "0")}`,
      run,
      onMessage: () => undefined,
      onLeavesChange: () => undefined,
    }),
  );
  assert.match(html, /Today ·/);
  assert.match(html, /Poha/);
});
