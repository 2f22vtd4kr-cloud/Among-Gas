import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import GameAdminTable from '../artifacts/telegram-game/src/components/GameAdminTable';
import { buildAdminTableAgents } from '../artifacts/telegram-game/src/game/adminTableAgents';

const players = [
  { slot: 0, username: 'Local' },
  { slot: 1, username: 'Visible remote' },
  { slot: 2, username: 'Vent remote' },
  { slot: 3, username: 'Missing remote' },
];
const agents = buildAdminTableAgents({
  players,
  mySlot: 0,
  remotePlayers: new Map([
    [1, { x: 1612, y: 929, inVent: false }],
    [2, { x: 1200, y: 800, inVent: true }],
  ]),
  localPosition: { x: 500, y: 600 },
  myVentId: null,
  deadSlots: [1],
});
assert.deepEqual(agents, [
  { slot: 0, username: 'Local', x: 500, y: 600, alive: true },
  { slot: 1, username: 'Visible remote', x: 1612, y: 929, alive: false },
], 'the map shows the local player and visible remotes, marks dead players, and omits vent/missing remotes');
const hiddenLocal = buildAdminTableAgents({
  players,
  mySlot: 0,
  remotePlayers: new Map([[1, { x: 1612, y: 929 }]]),
  localPosition: { x: 500, y: 600 },
  myVentId: 7,
  deadSlots: [],
});
assert.deepEqual(hiddenLocal.map(agent => agent.slot), [1], 'the local player is hidden while inside a vent');

const html = renderToStaticMarkup(
  <GameAdminTable agents={agents} english onClose={() => undefined} />,
);
assert.match(html, /data-testid="game-admin-table"/);
assert.match(html, /data-testid="game-admin-table-map"/);
assert.equal((html.match(/data-testid="game-admin-table-player"/g) ?? []).length, 2);
assert.match(html, /left:50%;top:50%/, 'the world centre maps to the visual map centre');
assert.match(html, /Visible remote, dead/);
assert.match(html, /Close Admin Table/);
const russian = renderToStaticMarkup(
  <GameAdminTable agents={agents} english={false} onClose={() => undefined} />,
);
assert.match(russian, /ПЛАНШЕТ АДМИНИСТРАТОРА/);
assert.match(russian, /Visible remote, мёртв/);
console.log('PASS: Admin Table visibility, coordinates, dead-state and bilingual presentation');
