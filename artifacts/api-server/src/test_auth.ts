/**
 * Production Telegram WebApp authentication tests using a throwaway test token.
 * No real bot token or user data is used or logged.
 *
 * Run with: pnpm --filter @workspace/api-server exec tsx src/test_auth.ts
 */
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { createHmac } from 'node:crypto';

const TEST_BOT_TOKEN = 'among-gas-auth-unit-test-token-only';
process.env.NODE_ENV = 'production';
process.env.TELEGRAM_BOT_TOKEN = TEST_BOT_TOKEN;

const { validateAuthConfig, verifyTelegramAuth } = await import('./ws/auth.js');
validateAuthConfig();

function makeInitDataFor(user: unknown, authDate: number | string): string {
  const params = new URLSearchParams();
  params.set('auth_date', String(authDate));
  params.set('query_id', 'AAEAAE-test-query');
  params.set('user', JSON.stringify(user));

  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => key + '=' + value)
    .join('\n');

  const secretKey = createHmac('sha256', 'WebAppData').update(TEST_BOT_TOKEN).digest();
  const hash = createHmac('sha256', secretKey).update(dataCheckString).digest('hex');
  params.set('hash', hash);
  return params.toString();
}

function makeInitData(userId: number, authDate: number): string {
  return makeInitDataFor({
    id: userId,
    first_name: 'AuthTest',
    username: 'auth_test',
  }, authDate);
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

const standardUser = { id: 741852963, first_name: 'AuthTest', username: 'auth_test' };
const invalidSignedUsers: Array<[string, unknown]> = [
  ['string Telegram user ID', { ...standardUser, id: '741852963' }],
  ['zero Telegram user ID', { ...standardUser, id: 0 }],
  ['negative Telegram user ID', { ...standardUser, id: -1 }],
  ['fractional Telegram user ID', { ...standardUser, id: 1.5 }],
  ['unsafe Telegram user ID', { ...standardUser, id: Number.MAX_SAFE_INTEGER + 1 }],
  ['non-string username', { ...standardUser, username: 42 }],
  ['non-string first name', { ...standardUser, first_name: false }],
  ['array instead of Telegram user object', []],
  ['null instead of Telegram user object', null],
  ['missing Telegram user ID', { username: 'auth_test' }],
];
for (const [description, user] of invalidSignedUsers) {
  assert.equal(
    verifyTelegramAuth(makeInitDataFor(user, now)),
    null,
    description + ' must be rejected even when signed with the correct bot token',
  );
}

assert.equal(
  verifyTelegramAuth(makeInitDataFor(standardUser, '1.5')),
  null,
  'non-integer auth_date must be rejected',
);
assert.equal(
  verifyTelegramAuth(makeInitDataFor(standardUser, 'not-a-timestamp')),
  null,
  'non-numeric auth_date must be rejected',
);

const malformedHash = new URLSearchParams(valid);
malformedHash.set('hash', 'not-a-valid-hash');
assert.equal(verifyTelegramAuth(malformedHash.toString()), null, 'malformed hash must be rejected');

const missingHash = new URLSearchParams(valid);
missingHash.delete('hash');
assert.equal(verifyTelegramAuth(missingHash.toString()), null, 'missing hash must be rejected');

// The deployment entry point must enforce production mode itself, not depend on
// the host injecting NODE_ENV correctly. Deliberately pass development mode and
// no token: `pnpm run start` must override it to production and fail closed.
const startup = spawnSync('pnpm', ['run', 'start'], {
  cwd: process.cwd(),
  encoding: 'utf8',
  timeout: 5_000,
  env: {
    ...process.env,
    NODE_ENV: 'development',
    TELEGRAM_BOT_TOKEN: '',
    PORT: '39017',
  },
});
assert.equal(
  startup.error,
  undefined,
  `production startup should fail promptly, not keep a dev-auth server alive: ${startup.error?.message ?? ''}`,
);
assert.notEqual(startup.status, 0, 'production server must not start without a Telegram bot token');
assert.match(
  `${startup.stdout}\n${startup.stderr}`,
  /TELEGRAM_BOT_TOKEN must be set/,
  'deployment startup must hit the fail-closed production auth guard',
);

console.log('PASS: Telegram HMAC auth accepts valid fresh initData and rejects tampered, stale, future-dated, malformed, and missing-hash payloads.');
