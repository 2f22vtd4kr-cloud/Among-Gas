import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import GameActionBar from './GameActionBar';

const common = {
  isImpostor: false,
  isGhost: false,
  killCooldownMs: 0,
  killCooldownMaxMs: 30_000,
  killAvailable: false,
  reportAvailable: false,
  useAvailable: false,
  useActionKind: null as string | null,
  english: true,
  positionStyle: {},
  onKill: () => undefined,
  onReport: () => undefined,
  onUse: () => undefined,
};

function render(overrides: Partial<typeof common> = {}) {
  return renderToStaticMarkup(<GameActionBar {...common} {...overrides} />);
}

// State 1: crewmate with no contextual action — persistent controls stay visible but disabled.
const crewIdle = render();
assert.match(crewIdle, /data-testid="game-action-report"/);
assert.match(crewIdle, /aria-label="Report unavailable"/);
assert.match(crewIdle, /data-testid="game-action-use"/);
assert.match(crewIdle, /aria-label="Use unavailable"/);
assert.doesNotMatch(crewIdle, /data-testid="game-action-kill"/);

// State 2: impostor Kill is ready and actionable.
const impostorReady = render({ isImpostor: true, killAvailable: true });
assert.match(impostorReady, /data-testid="game-action-kill"/);
assert.match(impostorReady, /data-kill-state="ready"/);
assert.match(impostorReady, /aria-label="Kill"/);
assert.doesNotMatch(impostorReady, /data-testid="kill-cooldown-sweep"/);

// State 3: impostor Kill cooldown is disabled, visibly desaturated and exactly 45% opacity.
const impostorCooldown = render({
  isImpostor: true,
  killAvailable: true,
  killCooldownMs: 15_000,
});
assert.match(impostorCooldown, /data-kill-state="disabled"/);
assert.match(impostorCooldown, /aria-label="Kill cooldown 15 seconds"/);
assert.match(impostorCooldown, /opacity:0\.45/);
assert.match(impostorCooldown, /data-cooldown-progress="0\.5000"/);
assert.match(impostorCooldown, /data-testid="kill-cooldown-sweep"/);

// State 4: a nearby body enables Report without changing the persistent layout.
const reportReady = render({ reportAvailable: true });
assert.match(reportReady, /aria-label="Report body"/);
assert.doesNotMatch(reportReady, /data-report-available="false"/);

// State 5: a nearby task enables the contextual Use action and exposes its semantic kind.
const taskUse = render({ useAvailable: true, useActionKind: 'task' });
assert.match(taskUse, /data-use-action="task"/);
assert.match(taskUse, /aria-label="Use"/);

// State 6: ghost spectator has no Report action and cannot activate contextual Use.
const ghost = render({ isGhost: true, useActionKind: 'repair' });
assert.doesNotMatch(ghost, /data-testid="game-action-report"/);
assert.match(ghost, /data-use-action="repair"/);
assert.match(ghost, /disabled=""/);
assert.match(ghost, /aria-label="Use unavailable"/);

// Context-specific actions retain distinct semantic kinds for accessible client assertions.
for (const kind of ['repair', 'vent', 'admin']) {
  const html = render({ useAvailable: true, useActionKind: kind });
  assert.match(html, new RegExp(`data-use-action="${kind}"`));
  assert.match(html, /aria-label="Use"/);
}

console.log('GAME ACTION BAR DOM MATRIX PASSED: crew, impostor-ready, cooldown, report, task-use, ghost and repair/vent/admin semantics');
