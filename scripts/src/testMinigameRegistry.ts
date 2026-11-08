import assert from "node:assert/strict";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { TASK_DEFS } from "../../lib/shared/src/tasks";
import TaskMinigame, { MINIGAME_COMPONENTS } from "../../artifacts/telegram-game/src/components/TaskMinigame";

assert.equal(TASK_DEFS.length, 11, "the canonical shared task registry must contain eleven tasks");
assert.equal(MINIGAME_COMPONENTS.length, TASK_DEFS.length,
  "every canonical task must have exactly one independently imported minigame component");
assert.equal(new Set(MINIGAME_COMPONENTS).size, TASK_DEFS.length,
  "task IDs must not accidentally reuse the same component");

for (let taskId = 0; taskId < TASK_DEFS.length; taskId++) {
  const html = renderToStaticMarkup(createElement(TaskMinigame, {
    taskId,
    stepIndex: 0,
    onComplete: () => {},
    onClose: () => {},
  }));
  assert.ok(html.length > 250, TASK_DEFS[taskId].name + " must render a non-empty minigame panel");
  assert.match(html, /aria-label="(?:Close|Закрыть)"/,
    TASK_DEFS[taskId].name + " must include the shared accessible close control");
  assert.match(html, /width:48px|width:48px/,
    TASK_DEFS[taskId].name + " must render the shared 48px close touch target");
}

assert.equal(renderToStaticMarkup(createElement(TaskMinigame, {
  taskId: -1, stepIndex: 0, onComplete: () => {}, onClose: () => {},
})), "", "unknown negative task IDs must render nothing");
assert.equal(renderToStaticMarkup(createElement(TaskMinigame, {
  taskId: 11, stepIndex: 0, onComplete: () => {}, onClose: () => {},
})), "", "unknown task IDs must render nothing");

console.log("TASK MINIGAME REGISTRY TESTS PASSED: 11/11 unique modules render through the shared shell");
