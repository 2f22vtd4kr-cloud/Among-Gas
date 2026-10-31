import assert from 'node:assert/strict';
import { buildInternalBotDialogue, isNextBotResponder } from './internalDialogue.js';

const roster = ['Nova', 'Mira', 'Bolt', 'Echo'];
const response = buildInternalBotDialogue({
  username: 'Nova',
  role: 'crewmate',
  meetingType: 'body report',
  livingRoster: roster,
  latestSpeaker: 'Mira',
  latestMessage: 'I think Bolt was near the reactor. Why was he there?',
});
assert.match(response, /Bolt/i, 'the fallback responds to the named player in the transcript');
assert.match(response, /observ|confirm|witness|sighting|specific/i,
  'the fallback asks for evidence rather than inventing an event');

const addressed = buildInternalBotDialogue({
  username: 'Nova',
  role: 'impostor',
  meetingType: 'emergency call',
  livingRoster: roster,
  latestSpeaker: 'Mira',
  latestMessage: 'Nova, where were you?',
});
assert.match(addressed, /Nova|exact|place|time/i, 'direct questions are acknowledged without fabricated location claims');

const playerNumberResponse = buildInternalBotDialogue({
  username: 'Nova',
  role: 'crewmate',
  meetingType: 'body report',
  livingRoster: ['Nova', 'Player3'],
  latestSpeaker: 'Player0',
  latestMessage: 'I saw Player 04 near the west wall.',
});
assert.match(playerNumberResponse, /Player3/,
  'one-based public player numbers map to the zero-based roster slot');

const players = [
  { slot: 0, username: 'Human', alive: true, isBot: false },
  { slot: 1, username: 'A', alive: true, isBot: true },
  { slot: 2, username: 'B', alive: true, isBot: true },
  { slot: 3, username: 'C', alive: true, isBot: true },
];
assert.equal(isNextBotResponder(players, 1, 2), true, 'the next living bot answers a bot turn');
assert.equal(isNextBotResponder(players, 1, 3), false, 'only one bot answers each bot turn');
assert.equal(isNextBotResponder(players, 3, 1), true, 'bot conversation order wraps around');
assert.equal(isNextBotResponder(players, 0, 1), true, 'a human speaker can hand off to the first bot');
console.log('PASS: contextual deterministic dialogue and bounded bot-to-bot turn-taking');
