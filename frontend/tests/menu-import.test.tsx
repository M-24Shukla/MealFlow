import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MenuImport, menuPrompt } from "../src/components/MenuImport";

test("AI prompt includes a valid example and weekly schema constraints", () => {
  const example = JSON.parse(
    menuPrompt.split("\n").find((line) => line.startsWith('{"menus"'))!,
  );
  assert.equal(example.menus[0].weekday, 1);
  assert.equal(example.menus[0].items[0].category, "VEG");
  assert.match(menuPrompt, /Monday=1/);
  assert.match(menuPrompt, /Do not invent links/);
});
test("menu import shows instructions instead of the prompt, JSON input, and replacement warning", () => {
  const html = renderToStaticMarkup(
    createElement(MenuImport, { busy: false, onImport: async () => true }),
  );
  assert.match(html, /Copy prompt/);
  assert.match(html, /Answer six multiple-choice questions/);
  assert.doesNotMatch(html, /readonly/);
  assert.doesNotMatch(html, /Help me create a recurring weekly/);
  assert.match(html, /Menu JSON/);
  assert.match(html, /replaces the entire menu/);
  assert.match(html, /disabled=""/);
});

test("AI prompt interviews the user before producing JSON without placeholders", () => {
  assert.match(
    menuPrompt,
    /exactly six multiple-choice questions, ONE AT A TIME/,
  );
  assert.match(menuPrompt, /Wait for my answer/);
  assert.equal(
    menuPrompt.split("\n").filter((line) => /^[1-6]\. /.test(line)).length,
    6,
  );
  assert.match(menuPrompt, /custom free-text answer for every question/);
  assert.doesNotMatch(menuPrompt, /replace this|\[replace/);
});
