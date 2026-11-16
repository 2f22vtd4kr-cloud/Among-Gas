import assert from 'node:assert/strict';
import { buildGroqApiKeyPacket, parseResumeSnapshotV1 } from './GameContext';

const base: Record<string, any> = {
  version: 1,
  roomCode: 'ABC234',
  phase: 'MEETING',
  hostSlot: 0,
  mySlot: 1,
  players: [
    { slot: 0, username: 'Host' },
    { slot: 1, username: 'Returning player' },
    { slot: 2, username: 'Witness' },
  ],
  playerPositions: [
    { slot: 0, wireX: 1000, wireY: 1200, inVent: false },
    { slot: 1, wireX: 1300, wireY: 1400, inVent: false },
    { slot: 2, wireX: 1500, wireY: 1600, inVent: false },
  ],
  myRole: 'crewmate',
  impostorSlots: [],
  deadSlots: [],
  corpsePositions: [],
  myTasks: [{ taskId: 1, completedSteps: 2 }],
  globalTaskProgress: 10,
  killCooldownMs: 0,
  sabotageCooldownMs: 0,
  myVentId: null,
  emergencyMeetingUsed: true,
  sabotage: null,
  meeting: {
    reporterSlot: 0,
    bodySlot: 255,
    elapsedMs: 16_200,
    votingOpen: true,
    hasVoted: false,
    votes: [{ slot: 0, targetSlot: 255 }],
    messages: [{ slot: 2, text: 'I saw the suspect near the east generator.', sentAtMs: 1234 }],
  },
  gameOverResult: null,
};

function encode(value: unknown): ArrayBuffer {
  const json = new TextEncoder().encode(JSON.stringify(value));
  const bytes = new Uint8Array(json.length + 2);
  bytes[0] = 0x25;
  bytes[1] = 0x01;
  bytes.set(json, 2);
  return bytes.buffer;
}

assert.deepEqual([...buildGroqApiKeyPacket('  session-key  ')!],
  [0x18, 11, ...new TextEncoder().encode('session-key')],
  'Groq credentials are trimmed and encoded as a length-prefixed session packet');
assert.equal(buildGroqApiKeyPacket('x'.repeat(241)), null,
  'credentials larger than the server protocol limit must not be sent');
assert.deepEqual([...buildGroqApiKeyPacket('')!], [0x18, 0],
  'an empty credential packet can explicitly clear the server session key');

const valid = parseResumeSnapshotV1(encode(base));
assert.ok(valid, 'valid active meeting snapshot must parse');
assert.equal(valid.phase, 'MEETING');
assert.equal(valid.meeting?.votingOpen, true);
assert.equal(valid.meeting?.hasVoted, false);
assert.equal(valid.meeting?.messages[0]?.text, base.meeting.messages[0].text);
assert.deepEqual(valid.meeting?.votes, [{ slot: 0, targetSlot: 255 }]);

const voted = structuredClone(base);
voted.meeting.hasVoted = true;
voted.meeting.votes.push({ slot: 1, targetSlot: 2 });
const validVoted = parseResumeSnapshotV1(encode(voted));
assert.ok(validVoted, "a snapshot with the returning player's vote must parse");
assert.equal(validVoted.meeting?.hasVoted, true);

const missingMeeting = structuredClone(base);
missingMeeting.meeting = null;
assert.equal(parseResumeSnapshotV1(encode(missingMeeting)), null,
  'MEETING phase cannot omit its authoritative meeting state');

const wrongPhase = structuredClone(base);
wrongPhase.phase = 'ROAMING';
assert.equal(parseResumeSnapshotV1(encode(wrongPhase)), null,
  'a meeting payload cannot be attached to a roaming phase');

const inconsistentVoteFlag = structuredClone(base);
inconsistentVoteFlag.meeting.hasVoted = true;
assert.equal(parseResumeSnapshotV1(encode(inconsistentVoteFlag)), null,
  'hasVoted must match the authoritative vote list');

const duplicateVote = structuredClone(base);
duplicateVote.meeting.votes.push({ slot: 0, targetSlot: 2 });
assert.equal(parseResumeSnapshotV1(encode(duplicateVote)), null,
  'a resume snapshot cannot contain duplicate votes from one player');

const unknownMessageAuthor = structuredClone(base);
unknownMessageAuthor.meeting.messages[0].slot = 14;
assert.equal(parseResumeSnapshotV1(encode(unknownMessageAuthor)), null,
  'meeting transcript authors must belong to the restored roster');

const leakedImpostorRoster = structuredClone(base);
leakedImpostorRoster.impostorSlots = [0];
assert.equal(parseResumeSnapshotV1(encode(leakedImpostorRoster)), null,
  'crew resume snapshot must not expose impostor identities');

assert.equal(parseResumeSnapshotV1(new ArrayBuffer(2)), null,
  'truncated resume packets must be rejected');

console.log('GAME CONTEXT RESUME SNAPSHOT TESTS PASSED: meeting phase, transcript, voting state, roster references and role privacy');
