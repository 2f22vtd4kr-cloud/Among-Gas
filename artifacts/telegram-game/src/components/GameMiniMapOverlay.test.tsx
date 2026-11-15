import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MAP_W, MAP_H } from '../game/collisionMap';
import { TASK_DEFS } from '@workspace/shared/tasks';
import GameMiniMapOverlay from './GameMiniMapOverlay';

const firstTask = TASK_DEFS[0];
const secondTask = TASK_DEFS[1];
assert.ok(firstTask && secondTask, 'the map must expose authored task definitions');
const dialogRef = React.createRef<HTMLDivElement>();
const closeButtonRef = React.createRef<HTMLButtonElement>();
const common = {
  open: true,
  english: true,
  isCrewmate: true,
  tasks: [
    { taskId: firstTask.id, completedSteps: 0 },
    { taskId: secondTask.id, completedSteps: secondTask.steps },
  ],
  taskLabel: (name: string) => `Task: ${name}`,
  playerPosition: { x: MAP_W / 4, y: MAP_H / 3 },
  inVent: false,
  overviewSrc: '/map-overview.webp',
  tick: 7,
  dialogRef,
  closeButtonRef,
  onClose: () => undefined,
};

const crew = renderToStaticMarkup(<GameMiniMapOverlay {...common} />);
assert.match(crew, /role="dialog"/);
assert.match(crew, /aria-label="Among Gas map"/);
assert.match(crew, /FACILITY MAP/);
assert.match(crew, /Your unfinished tasks are marked in yellow/);
assert.match(crew, /Task: /);
assert.match(crew, /1 tasks remaining/);
assert.match(crew, /aria-label="Your location"/);
assert.match(crew, /data-minimap-tick="7"/);
assert.match(crew, /map-overview\.webp/);
assert.equal((crew.match(/>!</g) ?? []).length, 1,
  'only unfinished crewmate tasks receive a yellow map marker');

const impostor = renderToStaticMarkup(
  <GameMiniMapOverlay {...common} isCrewmate={false} />,
);
assert.match(impostor, /Map overview/);
assert.match(impostor, /0 tasks remaining/);
assert.doesNotMatch(impostor, /Task: /,
  'impostors do not receive crew task markers');

const venting = renderToStaticMarkup(
  <GameMiniMapOverlay {...common} inVent />,
);
assert.doesNotMatch(venting, /aria-label="Your location"/,
  'the map does not expose a stale player marker while the player is vented');

const russian = renderToStaticMarkup(
  <GameMiniMapOverlay {...common} english={false} />,
);
assert.match(russian, /КАРТА ОБЪЕКТА/);
assert.match(russian, /Ваше местоположение/);
assert.match(russian, /Закрыть карту/);

assert.equal(renderToStaticMarkup(<GameMiniMapOverlay {...common} open={false} />), '',
  'the overview dialog is absent when closed');

console.log('PASS: overview map open/close, localized content, player visibility and role-aware task markers');
