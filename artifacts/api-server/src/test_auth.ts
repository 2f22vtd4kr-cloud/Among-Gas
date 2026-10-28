/**
 * Production Telegram WebApp authentication tests using a throwaway test token.
 * No real bot token or user data is used or logged.
 *
 * Run with: pnpm --filter @workspace/api-server exec tsx src/test_auth.ts
 */
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';

const TEST_BOT_TOKEN = 'among-gas-auth-unit-test-token-only';
process.env.NODE_ENV = 'production';
process.env.TELEGRAM_BOT_TOKEN = TEST_BOT_TOKEN;

const { validateAuthConfig, verifyTelegramAuth } = await import('./ws/auth.js');
validateAuthConfig();

function makeInitData(userId: number, authDate: number): string {
  const params = new URLSearchParams();
  params.set('auth_date', String(authDate));
  params.set('query_id', 'AAEAAE-test-query');
  params.set('user', JSON.stringify({ id: userId, first_name: 'AuthTest', username: 'auth_test' }));

  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(TEST_BOT_TOKEN).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

const now = Math.floor(Date.now() / 1000);
const valid = makeInitData(741852963, now);
assert.deepEqual(verifyTelegramAuth(valid), {
  id: 741852963,
  first_name: 'AuthTest',
  username: 'auth_test',
}, 'valid, fresh Telegram initData must authenticate');

const tampered = new URLSearchParams(valid);
tampered.set('user', JSON.stringify({ id: 741852964, first_name: 'AuthTest', username: 'auth_test' }));
assert.equal(verifyTelegramAuth(tampered.toString()), null, 'tampered user data must be rejected');

assert.equal(verifyTelegramAuth(makeInitData(741852963, now - 86_401)), null,
  'initData older than 24 hours must be rejected');
assert.equal(verifyTelegramAuth(makeInitData(741852963, now + 30)), null,
  'future-dated initData must be rejected');

const malformedHash = new URLSearchParams(valid);
malformedHash.set('hash', 'not-a-valid-hash');
assert.equal(verifyTelegramAuth(malformedHash.toString()), null, 'malformed hash must be rejected');

const missingHash = new URLSearchParams(valid);
missingHash.delete('hash');
assert.equal(verifyTelegramAuth(missingHash.toString()), null, 'missing hash must be rejected');

console.log('PASS: Telegram HMAC auth accepts valid fresh initData and rejects tampered, stale, future-dated, malformed, and missing-hash payloads.');
