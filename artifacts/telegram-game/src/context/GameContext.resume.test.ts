import assert from 'node:assert/strict';
import { buildGroqApiKeyPacket, parseResumeSnapshotV1 } from './GameContext';

const trimmedKeyPacket = buildGroqApiKeyPacket('  test-key  ');
assert.ok(trimmedKeyPacket, 'a session Groq key should encode within the wire limit');
assert.equal(trimmedKeyPacket[0], 0x18, 'Groq key uses the authenticated session-key opcode');
assert.equal(trimmedKeyPacket[1], 8, 'Groq key packet declares its UTF-8 byte length');
assert.equal(new TextDecoder().decode(trimmedKeyPacket.slice(2)), 'test-key',
  'Groq key packet trims surrounding whitespace without logging or persisting the key');
assert.deepEqual(Array.from(buildGroqApiKeyPacket('') ?? []), [0x18, 0],
  'an empty key sends the explicit clear-key packet');
assert.equal(buildGroqApiKeyPacket('k'.repeat(241)), null,
  'keys larger than the protocol byte cap must be rejected before sending');

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
  myTasks: [{ taskId: 1, completedSteps: 1 }],
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

const deadReporter = structuredClone(base);
deadReporter.deadSlots = [0];
assert.equal(parseResumeSnapshotV1(encode(deadReporter)), null,
  'a restored meeting reporter must be alive');

const bodyWithoutDeadPlayer = structuredClone(base);
bodyWithoutDeadPlayer.meeting.bodySlot = 2;
assert.equal(parseResumeSnapshotV1(encode(bodyWithoutDeadPlayer)), null,
  'a reported body slot must identify a dead roster player');

const bodyWithoutCorpse = structuredClone(base);
bodyWithoutCorpse.deadSlots = [2];
bodyWithoutCorpse.meeting.bodySlot = 2;
assert.equal(parseResumeSnapshotV1(encode(bodyWithoutCorpse)), null,
  'a reported body must have authoritative corpse coordinates');

const validReportedBody = structuredClone(bodyWithoutCorpse);
validReportedBody.corpsePositions = [{ slot: 2, wireX: 1500, wireY: 1600 }];
assert.ok(parseResumeSnapshotV1(encode(validReportedBody)),
  'a dead reported player with authoritative corpse coordinates must restore');

const deadVoter = structuredClone(base);
deadVoter.deadSlots = [2];
deadVoter.meeting.votes = [{ slot: 2, targetSlot: 255 }];
assert.equal(parseResumeSnapshotV1(encode(deadVoter)), null,
  'dead players cannot appear as voters in a restored meeting');

const deadVoteTarget = structuredClone(base);
deadVoteTarget.deadSlots = [2];
deadVoteTarget.meeting.votes = [{ slot: 0, targetSlot: 2 }];
assert.equal(parseResumeSnapshotV1(encode(deadVoteTarget)), null,
  'dead players cannot appear as vote targets in a restored meeting');

const votesBeforeVotingOpens = structuredClone(base);
votesBeforeVotingOpens.meeting.votingOpen = false;
votesBeforeVotingOpens.meeting.votes = [{ slot: 0, targetSlot: 255 }];
assert.equal(parseResumeSnapshotV1(encode(votesBeforeVotingOpens)), null,
  'the server cannot restore votes before the authoritative voting window opens');

const sabotageDuringMeeting = structuredClone(base);
sabotageDuringMeeting.sabotage = {
  systemId: 1,
  elapsedMs: 100,
  fixedPads: [],
  lockedTaskIds: [],
};
assert.equal(parseResumeSnapshotV1(encode(sabotageDuringMeeting)), null,
  'the server cannot restore an active sabotage alongside a meeting');

const playerStillVentedDuringMeeting = structuredClone(base);
playerStillVentedDuringMeeting.playerPositions[0].inVent = true;
playerStillVentedDuringMeeting.playerPositions[0].ventId = 4;
assert.equal(parseResumeSnapshotV1(encode(playerStillVentedDuringMeeting)), null,
  'calling a meeting forcibly releases every vented player before the meeting snapshot is built');

const unknownMessageAuthor = structuredClone(base);
unknownMessageAuthor.meeting.messages[0].slot = 14;
assert.equal(parseResumeSnapshotV1(encode(unknownMessageAuthor)), null,
  'meeting transcript authors must belong to the restored roster');

const duplicatePlayer = structuredClone(base);
duplicatePlayer.players.push({ slot: 1, username: 'Duplicate slot' });
assert.equal(parseResumeSnapshotV1(encode(duplicatePlayer)), null,
  'duplicate player slots must be rejected before client roster state is applied');

const missingPlayerPosition = structuredClone(base);
missingPlayerPosition.playerPositions.pop();
assert.equal(parseResumeSnapshotV1(encode(missingPlayerPosition)), null,
  'every restored player must have exactly one authoritative position');

const duplicatePosition = structuredClone(base);
duplicatePosition.playerPositions[2].slot = 1;
assert.equal(parseResumeSnapshotV1(encode(duplicatePosition)), null,
  'duplicate player positions must be rejected');

const leakedImpostorRoster = structuredClone(base);
leakedImpostorRoster.impostorSlots = [0];
assert.equal(parseResumeSnapshotV1(encode(leakedImpostorRoster)), null,
  'crew resume snapshot must not expose impostor identities');

const duplicateDeadSlot = structuredClone(base);
duplicateDeadSlot.deadSlots = [2, 2];
assert.equal(parseResumeSnapshotV1(encode(duplicateDeadSlot)), null,
  'dead-player slots must be unique');

const unknownDeadSlot = structuredClone(base);
unknownDeadSlot.deadSlots = [14];
assert.equal(parseResumeSnapshotV1(encode(unknownDeadSlot)), null,
  'dead-player slots must belong to the restored roster');

const orphanCorpse = structuredClone(base);
orphanCorpse.corpsePositions = [{ slot: 2, wireX: 1500, wireY: 1600 }];
assert.equal(parseResumeSnapshotV1(encode(orphanCorpse)), null,
  'corpse positions must belong to a roster player already marked dead');

const duplicateCorpse = structuredClone(base);
duplicateCorpse.deadSlots = [2];
duplicateCorpse.corpsePositions = [
  { slot: 2, wireX: 1500, wireY: 1600 },
  { slot: 2, wireX: 1501, wireY: 1601 },
];
assert.equal(parseResumeSnapshotV1(encode(duplicateCorpse)), null,
  'a restored player cannot have multiple corpse positions');

const unknownTask = structuredClone(base);
unknownTask.myTasks = [{ taskId: 99, completedSteps: 0 }];
assert.equal(parseResumeSnapshotV1(encode(unknownTask)), null,
  'only canonical task IDs may be restored');

const overCompletedTask = structuredClone(base);
overCompletedTask.myTasks = [{ taskId: 1, completedSteps: 2 }];
assert.equal(parseResumeSnapshotV1(encode(overCompletedTask)), null,
  'task progress cannot exceed the canonical task step count');

const duplicateTask = structuredClone(base);
duplicateTask.myTasks.push({ taskId: 1, completedSteps: 1 });
assert.equal(parseResumeSnapshotV1(encode(duplicateTask)), null,
  'a task assignment cannot appear more than once in a resume snapshot');

const impostorWithTasks = structuredClone(base);
impostorWithTasks.myRole = 'impostor';
impostorWithTasks.impostorSlots = [1];
assert.equal(parseResumeSnapshotV1(encode(impostorWithTasks)), null,
  'an impostor resume snapshot must not restore crewmate task assignments');

const impostorWithoutSelf = structuredClone(base);
impostorWithoutSelf.phase = 'ROAMING';
impostorWithoutSelf.meeting = null;
impostorWithoutSelf.myRole = 'impostor';
impostorWithoutSelf.impostorSlots = [0];
impostorWithoutSelf.myTasks = [];
assert.equal(parseResumeSnapshotV1(encode(impostorWithoutSelf)), null,
  'an impostor roster must include the reconnecting impostor');

const validImpostor = structuredClone(impostorWithoutSelf);
validImpostor.impostorSlots = [0, 1];
assert.ok(parseResumeSnapshotV1(encode(validImpostor)),
  'a valid impostor snapshot must preserve the private impostor roster');

const missingGameOverResult = structuredClone(base);
missingGameOverResult.phase = 'GAMEOVER';
missingGameOverResult.meeting = null;
assert.equal(parseResumeSnapshotV1(encode(missingGameOverResult)), null,
  'GAMEOVER phase must include the authoritative game result');

const gameOverResultInRoaming = structuredClone(base);
gameOverResultInRoaming.phase = 'ROAMING';
gameOverResultInRoaming.meeting = null;
gameOverResultInRoaming.gameOverResult = { ejectedSlot: 255, winFlag: 1 };
assert.equal(parseResumeSnapshotV1(encode(gameOverResultInRoaming)), null,
  'a game-over result cannot be attached to a roaming snapshot');

const validGameOver = structuredClone(missingGameOverResult);
validGameOver.gameOverResult = { ejectedSlot: 255, winFlag: 1 };
assert.ok(parseResumeSnapshotV1(encode(validGameOver)),
  'a valid GAMEOVER snapshot must restore its result');

const invalidEjectedSlot = structuredClone(validGameOver);
invalidEjectedSlot.deadSlots = [];
invalidEjectedSlot.gameOverResult = { ejectedSlot: 2, winFlag: 1 };
assert.equal(parseResumeSnapshotV1(encode(invalidEjectedSlot)), null,
  'an ejected player must belong to the roster and be marked dead');

// Vent state can only be restored during roaming: the authoritative meeting
// transition ejects every player from vents before the meeting snapshot exists.
const inconsistentVent = structuredClone(base);
inconsistentVent.phase = 'ROAMING';
inconsistentVent.meeting = null;
inconsistentVent.playerPositions[1].inVent = true;
inconsistentVent.playerPositions[1].ventId = 4;
assert.equal(parseResumeSnapshotV1(encode(inconsistentVent)), null,
  'the local vent ID must agree with the restored local position');

const validVent = structuredClone(inconsistentVent);
validVent.myVentId = 4;
assert.ok(parseResumeSnapshotV1(encode(validVent)),
  'a consistent local vent state must be restored during roaming');

assert.equal(parseResumeSnapshotV1(new ArrayBuffer(2)), null,
  'truncated resume packets must be rejected');

console.log('GAME CONTEXT RESUME SNAPSHOT TESTS PASSED: meeting phase, transcript, voting state, roster references and role privacy');
