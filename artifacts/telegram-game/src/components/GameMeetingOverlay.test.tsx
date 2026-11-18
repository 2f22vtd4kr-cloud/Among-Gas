import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { NO_TARGET } from '@workspace/shared/coords';
import GameMeetingOverlay from './GameMeetingOverlay';
import type { MeetingChatMessage, MeetingInfo } from '../context/GameContext';
import { parseResumeSnapshotV1 } from '../context/GameContext';

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

const resumeFixture = {
  version: 1,
  roomCode: 'ABC234',
  phase: 'MEETING',
  hostSlot: 0,
  mySlot: 0,
  players: [
    { slot: 0, username: 'Local' },
    { slot: 1, username: 'Remote' },
    { slot: 2, username: 'Dead player' },
  ],
  playerPositions: [
    { slot: 0, wireX: 1000, wireY: 1200, inVent: false },
    { slot: 1, wireX: 1300, wireY: 1400, inVent: false },
    { slot: 2, wireX: 1500, wireY: 1600, inVent: false },
  ],
  myRole: 'crewmate',
  impostorSlots: [],
  deadSlots: [2],
  corpsePositions: [],
  myTasks: [],
  globalTaskProgress: 0,
  killCooldownMs: 0,
  sabotageCooldownMs: 0,
  myVentId: null,
  emergencyMeetingUsed: true,
  sabotage: null,
  meeting: {
    reporterSlot: 0,
    bodySlot: NO_TARGET,
    elapsedMs: 16_200,
    votingOpen: true,
    hasVoted: false,
    votes: [{ slot: 1, targetSlot: NO_TARGET }],
    messages: [{ slot: 1, text: 'I saw the suspect near the east generator.', sentAtMs: 1234 }],
  },
  gameOverResult: null,
};
const resumeJson = new TextEncoder().encode(JSON.stringify(resumeFixture));
const resumePacket = new Uint8Array(resumeJson.length + 2);
resumePacket[0] = 0x25;
resumePacket[1] = 0x01;
resumePacket.set(resumeJson, 2);
const restored = parseResumeSnapshotV1(resumePacket.buffer);
assert.ok(restored?.meeting, 'client parser restores the active meeting from the resume packet');
const restoredOverlay = renderToStaticMarkup(
  <GameMeetingOverlay
    meeting={{
      reporterSlot: restored.meeting.reporterSlot,
      bodySlot: restored.meeting.bodySlot,
      startedAtMs: Date.now() - restored.meeting.elapsedMs,
    }}
    remainingMs={13_800}
    inDiscussion={!restored.meeting.votingOpen}
    isDead={false}
    english
    messages={restored.meeting.messages.map(message => ({
      slot: message.slot,
      text: message.text,
      receivedAt: message.sentAtMs,
    }))}
    players={restored.players}
    deadSlots={restored.deadSlots}
    hasVoted={restored.meeting.hasVoted}
    mySlot={restored.mySlot}
    draft=""
    onDraftChange={() => undefined}
    playerName={slot => restored.players.find(player => player.slot === slot)?.username ?? 'Unknown'}
    onSendChat={() => undefined}
    onVote={() => undefined}
  />,
);
assert.match(restoredOverlay, /Voting/,
  'a reconnect snapshot with votingOpen must render the voting phase');
assert.match(restoredOverlay, /I saw the suspect near the east generator\./,
  'the restored transcript must be visible in the meeting overlay');
assert.equal((restoredOverlay.match(/data-testid="vote-player-number"/g) ?? []).length, 2,
  'restored voting UI preserves living-player eligibility and excludes dead players');

console.log('PASS: meeting overlay discussion/voting states, dead-player permissions, body report and bilingual presentation');
