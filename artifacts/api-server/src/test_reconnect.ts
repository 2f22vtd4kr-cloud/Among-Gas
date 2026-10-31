/**
 * Regression coverage for authenticated WebSocket reconnection.
 *
 * Run with:
 *   pnpm --filter @workspace/api-server exec tsx src/test_reconnect.ts
 */
import assert from 'node:assert/strict';
import type { WebSocket } from 'ws';
import { LobbyManager, type Lobby, type LobbyPlayer } from './ws/lobby.js';
import { NO_TARGET } from '@workspace/shared/coords';
import { TASK_DEFS } from '@workspace/shared/tasks';

function fakeSocket() {
  const packets: Buffer[] = [];
  let closeCalls = 0;
  const socket = {
    readyState: 1,
    send(data: Uint8Array) {
      packets.push(Buffer.from(data));
    },
    close() {
      closeCalls++;
      this.readyState = 3;
    },
  };
  return {
    ws: socket as unknown as WebSocket,
    packets,
    get closeCalls() { return closeCalls; },
  };
}

function createMatch(userIdBase: number, playerCount = 4) {
  const manager = new LobbyManager();
  const sockets = Array.from({ length: playerCount }, () => fakeSocket());
  const users = Array.from({ length: playerCount }, (_, index) => userIdBase + index);
  const lobby = manager.createLobby(users[0], 'Player 0', sockets[0].ws);

  for (let index = 1; index < playerCount; index++) {
    assert.equal(
      manager.joinLobby(lobby.code, users[index], 'Player ' + index, sockets[index].ws),
      lobby,
      'each additional authenticated player should join the waiting lobby',
    );
  }

  manager.startGame(lobby, 1);
  assert.equal(lobby.phase, 'ROAMING');
  for (const player of lobby.players.values()) manager.markGameplayReady(lobby, player.slot);
  assert.equal(manager.isGameplayReady(lobby), true, 'all connected humans should release initial gameplay readiness');

  return { manager, lobby, sockets, users };
}

function wait(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Same authenticated Telegram identity reclaims the exact player object/slot
// during ROAMING; stale sockets and expiry callbacks cannot affect the new one.
{
  const { manager, lobby, sockets, users } = createMatch(741_852_000);
  const original = lobby.players.get(0)!;
  original.killCooldownMs = 4_321;
  original.x = 721;
  original.y = 433;

  const impostor = Array.from(lobby.players.values()).find(player => player.role === 'impostor')!;
  const crewmate = Array.from(lobby.players.values()).find(player => player.role === 'crewmate')!;
  const taskId = crewmate.assignedTasks[0];
  assert.ok(taskId !== undefined, 'crew member has assigned tasks');
  lobby.completedTaskSteps.add(crewmate.slot + ':' + taskId + ':0');

  const corpseCandidate = Array.from(lobby.players.values())
    .find(player => player.slot !== 0 && player.role === 'crewmate')!;
  corpseCandidate.alive = false;
  corpseCandidate.corpseX = 1_234;
  corpseCandidate.corpseY = 567;

  impostor.inVent = true;
  impostor.ventId = 2;

  const originalSlot = original.slot;
  assert.equal(manager.markPlayerDisconnected(users[0], sockets[0].ws, 40), lobby);
  assert.ok(original.disconnectedAtMs !== undefined, 'disconnect records an offline timestamp');
  assert.equal(manager.isCurrentSocket(users[0], sockets[0].ws), false, 'offline socket is no longer authoritative');

  const replacement = fakeSocket();
  assert.equal(
    manager.joinLobby(lobby.code, users[0], 'Player 0 restored', replacement.ws),
    lobby,
    'active-match same-identity rejoin must be accepted before the new-player phase rejection',
  );
  const rebound = lobby.players.get(originalSlot)!;
  assert.strictEqual(rebound, original, 'rejoin must retain the authoritative player object');
  assert.equal(rebound.ws, replacement.ws);
  assert.equal(rebound.username, 'Player 0 restored');
  assert.equal(rebound.disconnectedAtMs, undefined);
  assert.equal(rebound.killCooldownMs, 4_321);
  assert.equal(rebound.x, 721);
  assert.equal(rebound.y, 433);
  assert.equal(sockets[0].closeCalls, 1, 'replaced socket should be retired');
  assert.equal(manager.isCurrentSocket(users[0], sockets[0].ws), false, 'replaced socket cannot act');
  assert.equal(manager.isCurrentSocket(users[0], replacement.ws), true, 'new socket owns the same slot');
  assert.equal(manager.markPlayerDisconnected(users[0], sockets[0].ws), null, 'late close from the old socket is ignored');

  assert.equal(manager.isGameplayReady(lobby), true, 'one reconnecting client must not pause the match');
  assert.equal(manager.isPlayerReady(lobby, originalSlot), false, 'rejoined client must reload and acknowledge readiness');
  assert.equal(manager.markGameplayReady(lobby, originalSlot), true, 'per-player readiness acknowledgement succeeds after reload');
  assert.equal(manager.isPlayerReady(lobby, originalSlot), true);

  // Role and personal-task visibility are deliberately asymmetric.
  const crewSnapshot = manager.buildResumeSnapshot(lobby, crewmate.slot)!;
  const impostorSnapshot = manager.buildResumeSnapshot(lobby, impostor.slot)!;
  assert.deepEqual(crewSnapshot.impostorSlots, [], 'crew resume snapshot must not reveal impostor identities');
  assert.deepEqual(impostorSnapshot.impostorSlots, [impostor.slot], 'impostor snapshot contains only the impostor roster');
  assert.equal(
    crewSnapshot.myTasks.find(task => task.taskId === taskId)?.completedSteps,
    1,
    'resume snapshot restores per-task completed progress',
  );
  assert.ok(crewSnapshot.deadSlots.includes(corpseCandidate.slot));
  assert.ok(crewSnapshot.corpsePositions.some(corpse => corpse.slot === corpseCandidate.slot));
  assert.equal(impostorSnapshot.myVentId, 2, 'resume snapshot restores the current vent');
  assert.equal(crewSnapshot.roomCode, lobby.code);
  for (const snapshot of [crewSnapshot, impostorSnapshot]) {
    const serialized = JSON.stringify(snapshot);
    assert.doesNotMatch(serialized, /"tgUserId"/, 'resume payload must not contain Telegram user identifiers');
    assert.ok(snapshot.players.every(player => !('tgUserId' in player)), 'public roster exposes only slot and display name');
  }

  await wait(90); // longer than the stale socket's original 40ms grace period
  assert.strictEqual(lobby.players.get(originalSlot), original, 'stale disconnect timeout must not remove the reattached player');
  assert.equal(manager.isCurrentSocket(users[0], replacement.ws), true);
  manager.disposeLobby(lobby);
}

// A player reattaching during MEETING gets the same meeting transcript and can
// vote from the retained slot after loading; the match-wide ready barrier stays open.
{
  const { manager, lobby, sockets, users } = createMatch(852_963_000);
  assert.equal(manager.callMeeting(lobby, 0, NO_TARGET), true, 'host can call one emergency meeting');
  assert.ok(lobby.meeting);
  lobby.meeting.votingOpen = true;
  assert.equal(manager.sendMeetingChat(lobby, 0, 'I saw someone near the west passage.'), true);

  const returningSlot = 1;
  const returningPlayer = lobby.players.get(returningSlot)!;
  const oldSocket = sockets[returningSlot];
  assert.equal(manager.markPlayerDisconnected(users[returningSlot], oldSocket.ws, 1_000), lobby);

  const replacement = fakeSocket();
  assert.equal(manager.joinLobby(lobby.code, users[returningSlot], 'Player 1', replacement.ws), lobby);
  const snapshot = manager.buildResumeSnapshot(lobby, returningSlot)!;
  assert.equal(snapshot.phase, 'MEETING');
  assert.ok(snapshot.meeting);
  assert.equal(snapshot.meeting.votingOpen, true);
  assert.equal(snapshot.meeting.hasVoted, false);
  assert.ok(snapshot.meeting.elapsedMs >= 0);
  assert.ok(snapshot.meeting.messages.some(message => message.text === 'I saw someone near the west passage.'));
  assert.equal(manager.isGameplayReady(lobby), true);
  assert.equal(manager.isPlayerReady(lobby, returningSlot), false);
  assert.equal(manager.markGameplayReady(lobby, returningSlot), true);
  assert.equal(manager.isPlayerReady(lobby, returningSlot), true);

  for (const voterSlot of [0, 2, 3]) {
    assert.equal(manager.castVote(lobby, voterSlot, NO_TARGET), true);
    assert.equal(lobby.phase, 'MEETING', 'vote tally waits for the reattached connected player');
  }
  assert.equal(manager.castVote(lobby, returningSlot, NO_TARGET), true);
  assert.equal(lobby.phase, 'ROAMING', 'all live votes tally after the restored player votes');
  assert.equal(lobby.meeting, null);
  assert.equal(returningPlayer.ws, replacement.ws);
  manager.disposeLobby(lobby);
}

// A disconnected living voter is treated as an implicit skip at tally, while
// permanent grace expiry removes the player and their unfinished task denominator.
{
  const { manager, lobby, sockets, users } = createMatch(963_074_000);
  assert.equal(manager.callMeeting(lobby, 0, NO_TARGET), true);
  assert.ok(lobby.meeting);
  lobby.meeting.votingOpen = true;

  const absent = lobby.players.get(1)!;
  assert.equal(manager.markPlayerDisconnected(users[1], sockets[1].ws, 1_000), lobby);
  for (const voterSlot of [0, 2, 3]) {
    assert.equal(manager.castVote(lobby, voterSlot, NO_TARGET), true);
  }
  assert.equal(lobby.phase, 'ROAMING', 'disconnected uncast voter implicitly skips rather than blocking the meeting');
  assert.equal(lobby.meeting, null);
  assert.equal(absent.disconnectedAtMs !== undefined, true);
  manager.disposeLobby(lobby);
}

{
  const { manager, lobby, sockets } = createMatch(174_185_200);
  const departingCrew = Array.from(lobby.players.values()).find(player => player.role === 'crewmate')!;
  const departingUserId = departingCrew.tgUserId;
  const departingSocket = sockets[departingCrew.slot];
  const removedSteps = departingCrew.assignedTasks.reduce((sum, taskId) => {
    const definition = TASK_DEFS.find(task => task.id === taskId);
    return sum + (definition?.steps ?? 0);
  }, 0);
  const totalBeforeDeparture = lobby.totalTaskSteps;

  assert.equal(manager.markPlayerDisconnected(departingUserId, departingSocket.ws, 35), lobby);
  await wait(90);
  assert.equal(lobby.players.has(departingCrew.slot), false, 'expired reconnect grace permanently removes the disconnected slot');
  assert.equal(manager.getLobbyForUser(departingUserId), null);
  assert.equal(manager.userToLobbyMap.has(departingUserId), false);
  assert.equal(lobby.totalTaskSteps, totalBeforeDeparture - removedSteps,
    'permanently departed crewmate contributes no unfinished task steps');
  assert.equal(
    manager.joinLobby(lobby.code, departingUserId, 'Late player', fakeSocket().ws),
    'in_progress',
    'a new socket cannot reclaim a slot after the reconnect grace has expired in an active match',
  );
  manager.disposeLobby(lobby);
}


// If the last unready client disconnects during the initial load barrier, the
// remaining connected players' completed acknowledgements must release them.
{
  const manager = new LobbyManager();
  const sockets = [fakeSocket(), fakeSocket(), fakeSocket()];
  const users = [285_296_300, 285_296_301, 285_296_302];
  const lobby = manager.createLobby(users[0], 'Player 0', sockets[0].ws);
  assert.equal(manager.joinLobby(lobby.code, users[1], 'Player 1', sockets[1].ws), lobby);
  assert.equal(manager.joinLobby(lobby.code, users[2], 'Player 2', sockets[2].ws), lobby);
  manager.startGame(lobby, 1);

  assert.equal(manager.markGameplayReady(lobby, 0), true === lobby.gameplayReady,
    'first ready acknowledgement returns current readiness state');
  assert.equal(manager.markGameplayReady(lobby, 1), false,
    'the third still-connected human is required before initial readiness');

  sockets[2].ws.close();
  assert.equal(manager.markPlayerDisconnected(users[2], sockets[2].ws), lobby);
  assert.equal(lobby.gameplayReady, true,
    'disconnect recomputes the initial readiness quorum without waiting for another client message');
  for (const readySocket of sockets.slice(0, 2)) {
    assert.ok(
      readySocket.packets.some(packet => packet[0] === 0x24 && packet[1] === 0x01),
      'remaining ready clients receive the gameplay-ready release packet',
    );
  }
  manager.disposeLobby(lobby);
}

console.log('PASS: authenticated reconnect grace, same-slot reattachment, stale socket isolation, per-player readiness, resume snapshot privacy/state, meeting restore/votes, implicit skips and expiry');
