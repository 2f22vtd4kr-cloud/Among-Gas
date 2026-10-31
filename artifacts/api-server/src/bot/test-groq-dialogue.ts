import assert from 'node:assert/strict';
import { buildPublicBotDialogueMessages, isValidGroqApiKey, requestGroqDialogue } from './groqDialogue.js';

const validKey = 'gsk_' + 'A'.repeat(48);
assert.equal(isValidGroqApiKey(validKey), true);
assert.equal(isValidGroqApiKey('not-a-key'), false);
assert.equal(isValidGroqApiKey('gsk_short'), false);

const publicPrompt = buildPublicBotDialogueMessages({
  username: 'Nova',
  livingRoster: 'Nova, Player2',
  meetingType: 'body report',
  publicTranscript: 'Player2: I saw someone leave the west hall.',
});
const promptText = publicPrompt.map(message => message.content).join(' ');
assert.match(promptText, /Nova/);
assert.match(promptText, /public meeting transcript/);
assert.doesNotMatch(promptText, /secret role is|impostor role|crewmate role/i,
  'the provider prompt must not include any hidden role, including the bot own role');


const originalFetch = globalThis.fetch;
const captured: Array<{ url: string; init?: RequestInit }> = [];
try {
  globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
    captured.push({ url: String(input), init });
    return new Response(JSON.stringify({
      choices: [{ message: { content: 'Nova, I was near the west hall. Who saw the report?' } }],
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as typeof fetch;

  const reply = await requestGroqDialogue(validKey, [
    { role: 'system', content: 'Speak as a player. Never reveal secret roles.' },
    { role: 'user', content: 'Nova: I saw someone leave the west hall.' },
  ]);
  assert.equal(reply, 'Nova, I was near the west hall. Who saw the report?');
  assert.equal(captured.length, 1);
  const request = captured[0];
  assert.equal(request.url, 'https://api.groq.com/openai/v1/chat/completions');
  assert.equal((request.init?.headers as Record<string, string>).Authorization, `Bearer ${validKey}`);
  assert.equal(JSON.parse(String(request.init?.body)).model, 'llama-3.3-70b-versatile');
  // A lobby key may be shared by several bots; serialize requests and apply a per-key cooldown.
  const throttledKey = 'gsk_' + 'B'.repeat(48);
  let releaseConcurrent: ((response: Response) => void) | undefined;
  globalThis.fetch = (async () => new Promise<Response>(resolve => { releaseConcurrent = resolve; })) as typeof fetch;
  const firstRequest = requestGroqDialogue(throttledKey, []);
  assert.equal(await requestGroqDialogue(throttledKey, []), null, 'concurrent bot requests sharing a key are rejected');
  assert.equal(releaseConcurrent !== undefined, true);
  releaseConcurrent!(new Response(JSON.stringify({ choices: [{ message: { content: 'I can corroborate that route.' } }] }), { status: 200, headers: { 'content-type': 'application/json' } }));
  assert.equal(await firstRequest, 'I can corroborate that route.');
  assert.equal(await requestGroqDialogue(throttledKey, []), null, 'per-key cooldown prevents burst requests');


  const rateLimitedKey = 'gsk_' + 'C'.repeat(48);
  globalThis.fetch = (async () => new Response('rate limited', { status: 429 })) as typeof fetch;
  assert.equal(await requestGroqDialogue(rateLimitedKey, []), null,
    'provider rate limits must return to the deterministic fallback');

  const networkErrorKey = 'gsk_' + 'D'.repeat(48);
  globalThis.fetch = (async () => { throw new Error('network unavailable'); }) as typeof fetch;
  assert.equal(await requestGroqDialogue(networkErrorKey, []), null,
    'network errors must return to the deterministic fallback');
  console.log('PASS: Groq key validation, server endpoint/auth, response sanitization and provider fallback');
} finally {
  globalThis.fetch = originalFetch;
}
