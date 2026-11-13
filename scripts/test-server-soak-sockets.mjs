import assert from 'node:assert/strict';
import { authenticateSocketBatch } from './server-soak-sockets.mjs';

const authFailure = new Error('simulated authentication failure');
const closed = [];
await assert.rejects(
  authenticateSocketBatch(
    async (_id, username) => {
      if (username === 'bad-peer') throw authFailure;
      return { username };
    },
    async sockets => closed.push(...sockets.map(socket => socket.username)),
    [
      { id: 1, username: 'good-peer-1' },
      { id: 2, username: 'bad-peer' },
      { id: 3, username: 'good-peer-2' },
    ],
  ),
  error => error === authFailure,
);
assert.deepEqual(closed, ['good-peer-1', 'good-peer-2'],
  'every authenticated peer must be closed before the batch rejects');

const successful = await authenticateSocketBatch(
  async (_id, username) => ({ username }),
  async () => assert.fail('successful authentication must not close sockets'),
  [
    { id: 4, username: 'peer-4' },
    { id: 5, username: 'peer-5' },
  ],
);
assert.deepEqual(successful.map(socket => socket.username), ['peer-4', 'peer-5']);
console.log('PASS: soak socket batch closes fulfilled peers after partial auth failure');
