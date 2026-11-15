import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NO_TARGET } from '@workspace/shared/coords';
import GameMeetingOverlay from './GameMeetingOverlay';
import type { MeetingChatMessage, MeetingInfo } from '../context/GameContext';

const meeting: MeetingInfo = {
  reporterSlot: 0,
  bodySlot: NO_TARGET,
  startedAtMs: 0,
};
const players = [
  { slot: 0, username: 'Local' },
  { slot: 1, username: 'Remote' },
  { slot: 2, username: 'Dead player' },
];
const messages: MeetingChatMessage[] = [
  { slot: 1, text: 'I saw movement near the boiler room.', receivedAt: 100 },
];
const common = {
  meeting,
  remainingMs: 15_500,
  isDead: false,
  english: true,
  messages,
  players,
  deadSlots: [2],
  hasVoted: false,
  mySlot: 0,
  draft: 'Checking the east corridor',
  onDraftChange: () => undefined,
  playerName: (slot: number) => players.find(player => player.slot === slot)?.username ?? 'Unknown',
  onSendChat: () => undefined,
  onVote: () => undefined,
};

const discussion = renderToStaticMarkup(
  <GameMeetingOverlay {...common} inDiscussion remainingMs={15_500} />,
);
assert.match(discussion, /Emergency meeting/);
assert.match(discussion, /Local called an emergency meeting/);
assert.match(discussion, /16s/, 'the countdown is rounded up, not prematurely rounded down');
assert.match(discussion, /Discussion/);
assert.match(discussion, /I saw movement near the boiler room\./);
assert.match(discussion, /Checking the east corridor/);
assert.doesNotMatch(discussion, /data-testid="vote-player-number"/,
  'voting controls must not appear during discussion');

const voting = renderToStaticMarkup(
  <GameMeetingOverlay {...common} inDiscussion={false} remainingMs={4_250} />,
);
assert.match(voting, /Voting/);
assert.match(voting, /5s/);
assert.equal((voting.match(/data-testid="vote-player-number"/g) ?? []).length, 2,
  'only living players are offered as vote targets');
assert.match(voting, /Skip/);
assert.doesNotMatch(voting, /Dead player/,
  'dead players must not be offered as voting targets');

const deadSpectator = renderToStaticMarkup(
  <GameMeetingOverlay {...common} inDiscussion={false} isDead remainingMs={2_000} />,
);
assert.match(deadSpectator, /You are dead — spectating/);
assert.doesNotMatch(deadSpectator, /data-testid="vote-player-number"/,
  'dead players cannot vote');
assert.doesNotMatch(deadSpectator, /aria-label="Meeting message"/,
  'dead spectators cannot send meeting chat');

const bodyMeeting = renderToStaticMarkup(
  <GameMeetingOverlay
    {...common}
    meeting={{ ...meeting, bodySlot: 1 }}
    inDiscussion
  />,
);
assert.match(bodyMeeting, /Body reported/);
assert.match(bodyMeeting, /Local reported Remote/);

const russian = renderToStaticMarkup(
  <GameMeetingOverlay {...common} inDiscussion={false} english={false} />,
);
assert.match(russian, /Экстренное собрание/);
assert.match(russian, /Голосование/);
assert.match(russian, /Пропустить/);

console.log('PASS: meeting overlay discussion/voting states, dead-player permissions, body report and bilingual presentation');
