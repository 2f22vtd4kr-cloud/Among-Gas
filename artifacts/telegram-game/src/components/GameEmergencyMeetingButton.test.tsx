import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import GameEmergencyMeetingButton from './GameEmergencyMeetingButton';

const positionStyle = { bottom: '20px', left: '24px' };
const english = renderToStaticMarkup(
  <GameEmergencyMeetingButton visible used={false} english positionStyle={positionStyle} onCall={() => undefined} />,
);
assert.match(english, /data-testid="game-action-emergency"/);
assert.match(english, /aria-label="Call emergency meeting"/);
assert.match(english, /<svg/);
assert.match(english, /bottom:20px/);

const used = renderToStaticMarkup(
  <GameEmergencyMeetingButton visible used english={false} positionStyle={{}} onCall={() => undefined} />,
);
assert.match(used, /Экстренное собрание уже использовано/);
assert.match(used, /disabled=""/);
assert.match(used, />✓</);

assert.equal(renderToStaticMarkup(
  <GameEmergencyMeetingButton visible={false} used={false} english positionStyle={{}} onCall={() => undefined} />,
), '', 'the emergency button must be hidden when the player is ineligible');
console.log('PASS: emergency button visibility, localization, used state and custom placement');
