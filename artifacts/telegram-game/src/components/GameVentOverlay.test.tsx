import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import GameVentOverlay from './GameVentOverlay';
import { findVent } from '@workspace/shared/vents';

const atrium = findVent(1);
assert.ok(atrium, 'the Atrium vent must exist');
const english = renderToStaticMarkup(
  <GameVentOverlay vent={atrium} english onTravel={() => undefined} onExit={() => undefined} />,
);
assert.match(english, /data-testid="game-vent-overlay"/);
assert.match(english, /role="dialog"/);
assert.match(english, /VENT SYSTEM/);
assert.match(english, /Atrium/);
assert.match(english, /Boiler Room/);
assert.match(english, /Tech Room/);
assert.match(english, /data-testid="game-vent-destination-0"/);
assert.match(english, /data-testid="game-vent-destination-2"/);
assert.match(english, /data-testid="game-vent-exit"/);

const russian = renderToStaticMarkup(
  <GameVentOverlay vent={atrium} english={false} onTravel={() => undefined} onExit={() => undefined} />,
);
assert.match(russian, /СИСТЕМА ЛЮКОВ/);
assert.match(russian, /Атриум/);
assert.match(russian, /Котельная/);
assert.match(russian, /Техкомната/);
assert.match(russian, /ВЫЛЕЗТИ ИЗ ЛЮКА/);
assert.equal(renderToStaticMarkup(
  <GameVentOverlay vent={undefined} english onTravel={() => undefined} onExit={() => undefined} />,
), '', 'the overlay is absent when the player is not inside a valid vent');
assert.deepEqual(atrium.connections, [0, 2], 'the overlay must expose only the authored adjacent vents');
console.log('PASS: bilingual vent overlay, valid destinations and exit presentation');
