import assert from 'node:assert/strict';
import { buildInternalBotDialogue } from './internalDialogue.js';

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

const botQuestionResponse = buildInternalBotDialogue({
  username: 'Nova',
  role: 'crewmate',
  meetingType: 'body report',
  livingRoster: ['Nova', 'Player0', 'Player1', 'Player3'],
  latestSpeaker: 'Player1',
  latestSpeakerIsBot: true,
  latestMessage: 'Where were you? I saw Player 01 near the west wall.',
});
assert.match(botQuestionResponse, /confirmed sighting|corroborate|direct observation/i,
  'a bot question is answered as a request for confirmation, not treated as an accusation');

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

console.log('PASS: contextual deterministic dialogue and bounded bot-to-bot turn-taking');
