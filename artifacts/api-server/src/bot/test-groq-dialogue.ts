import assert from 'node:assert/strict';
import { isValidGroqApiKey, requestGroqDialogue } from './groqDialogue.js';

const validKey = 'gsk_' + 'A'.repeat(48);
assert.equal(isValidGroqApiKey(validKey), true);
assert.equal(isValidGroqApiKey('not-a-key'), false);
assert.equal(isValidGroqApiKey('gsk_short'), false);

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

  globalThis.fetch = (async () => new Response('rate limited', { status: 429 })) as typeof fetch;
  assert.equal(await requestGroqDialogue(validKey, []), null,
    'provider rate limits must return to the deterministic fallback');

  globalThis.fetch = (async () => { throw new Error('network unavailable'); }) as typeof fetch;
  assert.equal(await requestGroqDialogue(validKey, []), null,
    'network errors must return to the deterministic fallback');
  console.log('PASS: Groq key validation, server endpoint/auth, response sanitization and provider fallback');
} finally {
  globalThis.fetch = originalFetch;
}
