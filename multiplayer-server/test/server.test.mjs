import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import WebSocket from 'ws';
import { createMultiplayerServer } from '../server.mjs';

const ORIGIN = 'http://127.0.0.1:3000';

async function fixture(t, overrides = {}) {
  const app = createMultiplayerServer({
    allowedOrigins: [ORIGIN], inviteCooldownMs: 0, rateBurst: 200,
    heartbeatMs: 2_000, sweepMs: 10, ...overrides
  });
  const address = await app.listen(0, '127.0.0.1');
  const url = `ws://127.0.0.1:${address.port}/`;
  t.after(() => app.close());
  return { app, url };
}

async function client(url, join = undefined, origin = ORIGIN) {
  const socket = new WebSocket(url, { origin });
  const messages = [];
  const listeners = new Set();
  socket.on('message', data => {
    messages.push(JSON.parse(data.toString()));
    for (const listener of listeners) listener();
  });
  // Rejected origin and deliberate payload-limit failures should not crash tests.
  socket.on('error', () => {});
  await once(socket, 'open');
  const result = {
    socket, messages,
    send(message) { socket.send(JSON.stringify(message)); },
    take(type, predicate = () => true, timeout = 2_000) {
      return new Promise((resolve, reject) => {
        let timer;
        const check = () => {
          const index = messages.findIndex(message => message.type === type && predicate(message));
          if (index === -1) return;
          clearTimeout(timer);
          listeners.delete(check);
          resolve(messages.splice(index, 1)[0]);
        };
        timer = setTimeout(() => {
          listeners.delete(check);
          reject(new Error(`Timed out waiting for ${type}: ${JSON.stringify(messages)}`));
        }, timeout);
        listeners.add(check);
        check();
      });
    },
    async close() {
      if (socket.readyState === WebSocket.CLOSED) return;
      const closed = once(socket, 'close');
      socket.close();
      await closed;
    }
  };
  if (join) {
    result.send({ type: 'join', game: 'connect-four', name: 'Student', ...join });
    result.welcome = await result.take('welcome');
  }
  return result;
}

async function match(a, b) {
  a.send({ type: 'invite', to: b.welcome.id });
  const invitation = await b.take('invite');
  b.send({ type: 'respond', id: invitation.id, accept: true });
  const initial = await a.take('match');
  await b.take('match', state => state.id === initial.id);
  return initial;
}

async function eventually(predicate, timeout = 1_000) {
  const deadline = Date.now() + timeout;
  while (!predicate()) {
    if (Date.now() >= deadline) assert.fail('Condition did not become true');
    await delay(10);
  }
}

test('game rooms are isolated, names normalized and tokens never broadcast', async t => {
  const { url } = await fixture(t);
  const a = await client(url, { name: '  أحمد  ' });
  const b = await client(url, { name: 'أحمد' });
  const c = await client(url, { name: 'أحمد', game: 'tic-tac-toe' });
  assert.equal(a.welcome.name, 'أحمد');
  assert.equal(b.welcome.name, 'أحمد 2');
  assert.equal(c.welcome.name, 'أحمد');
  const boardLobby = await a.take('lobby', message => message.players.length === 2);
  const ticLobby = await c.take('lobby');
  assert.deepEqual(ticLobby.players.map(player => player.id), [c.welcome.id]);
  assert.deepEqual(boardLobby.players.map(player => player.id).sort(), [a.welcome.id, b.welcome.id].sort());
  assert.equal(JSON.stringify(boardLobby).includes(a.welcome.token), false);
  assert.deepEqual(Object.keys(boardLobby.players[0]).sort(), ['id', 'name', 'status']);
  a.send({ type: 'invite', to: c.welcome.id });
  assert.equal((await a.take('error')).code, 'invalid-player');
});

test('strict joins reject bad games, names, tokens and duplicate active sessions', async t => {
  const { url } = await fixture(t);
  const a = await client(url);
  for (const [join, expected] of [
    [{ game: 'unknown', name: 'Test' }, 'invalid-game'],
    [{ game: 'connect-four', name: '<script>Hi</script>' }, 'invalid-name'],
    [{ game: 'connect-four', name: 'أ' }, 'invalid-name'],
    [{ game: 'connect-four', name: 'Test', token: 'f'.repeat(64) }, 'invalid-session']
  ]) {
    a.send({ type: 'join', ...join });
    assert.equal((await a.take('error')).code, expected);
  }
  a.send({ type: 'join', game: 'connect-four', name: 'Valid Name' });
  a.welcome = await a.take('welcome');
  const duplicate = await client(url);
  duplicate.send({ type: 'join', game: 'connect-four', name: 'Other', token: a.welcome.token });
  assert.equal((await duplicate.take('error')).code, 'session-active');
  duplicate.send({ type: 'join', game: 'tic-tac-toe', name: 'Other', token: a.welcome.token });
  assert.equal((await duplicate.take('error')).code, 'invalid-session');
});

test('invitations enforce participants, PC status, expiry, cancel and cooldown', async t => {
  const { app, url } = await fixture(t, { inviteTtlMs: 100, inviteCooldownMs: 5_000 });
  const a = await client(url, { name: 'First' });
  const b = await client(url, { name: 'Second' });
  const stranger = await client(url, { name: 'Third' });
  b.send({ type: 'status', status: 'playing' });
  await a.take('lobby', message => message.players.some(player => player.id === b.welcome.id && player.status === 'playing'));
  a.send({ type: 'invite', to: b.welcome.id });
  assert.equal((await a.take('error')).code, 'player-busy');
  b.send({ type: 'status', status: 'available' });
  await b.take('lobby', message => message.players.length === 3 && message.players.every(player => player.status === 'available'));
  a.send({ type: 'invite', to: b.welcome.id });
  const invitation = await b.take('invite');
  stranger.send({ type: 'respond', id: invitation.id, accept: true });
  assert.equal((await stranger.take('error')).code, 'invalid-invite');
  b.send({ type: 'cancel', id: invitation.id });
  assert.equal((await b.take('error')).code, 'invalid-invite');
  assert.equal((await a.take('invite-ended')).reason, 'expired');
  assert.equal(app.stats().invitations, 0);
  a.send({ type: 'invite', to: b.welcome.id });
  assert.equal((await a.take('error')).code, 'invite-cooldown');
  b.send({ type: 'invite', to: a.welcome.id });
  const second = await b.take('invite');
  b.send({ type: 'cancel', id: second.id });
  assert.equal((await b.take('invite-ended', message => message.id === second.id)).reason, 'cancelled');
  assert.equal(app.stats().invitations, 0);
});

test('server owns turns, versions, legal cells and match membership', async t => {
  const { url } = await fixture(t);
  const a = await client(url, { name: 'First', game: 'tic-tac-toe' });
  const b = await client(url, { name: 'Second', game: 'tic-tac-toe' });
  const outsider = await client(url, { name: 'Third', game: 'tic-tac-toe' });
  const initial = await match(a, b);
  outsider.send({ type: 'move', matchId: initial.id, move: 0, version: 0, id: a.welcome.id });
  assert.equal((await outsider.take('error')).code, 'invalid-match');
  b.send({ type: 'move', matchId: initial.id, move: 0, version: 0 });
  assert.equal((await b.take('error')).code, 'not-your-turn');
  a.send({ type: 'move', matchId: initial.id, move: 9, version: 0 });
  assert.equal((await a.take('error')).code, 'invalid-move');
  a.send({ type: 'move', matchId: initial.id, move: 0, version: 0, state: { winner: 1 }, seat: 2, token: outsider.welcome.token });
  assert.equal((await a.take('match', state => state.version === 1)).state.board[0], 1);
  b.send({ type: 'move', matchId: initial.id, move: 1, version: 0 });
  assert.equal((await b.take('error')).code, 'stale-state');
  b.send({ type: 'move', matchId: initial.id, move: 0, version: 1 });
  assert.equal((await b.take('error')).code, 'invalid-move');
  b.send({ type: 'move', matchId: initial.id, move: 1, version: 1 });
  const state = await b.take('match', message => message.version === 2);
  assert.deepEqual(state.state.board.slice(0, 3), [1, 2, 0]);
  a.send({ type: 'status', status: 'available' });
  assert.equal((await a.take('error')).code, 'busy');
});

test('Connect Four winning match requires two rematch votes and alternates seats', async t => {
  const { url } = await fixture(t);
  const a = await client(url, { name: 'First' });
  const b = await client(url, { name: 'Second' });
  const initial = await match(a, b);
  const moves = [0, 1, 0, 1, 0, 1, 0];
  let finished;
  for (let version = 0; version < moves.length; version += 1) {
    const player = version % 2 ? b : a;
    player.send({ type: 'move', matchId: initial.id, move: moves[version], version });
    finished = await player.take('match', state => state.version === version + 1);
  }
  assert.equal(finished.state.winner, 1);
  assert.equal(finished.state.winning.length, 4);
  b.send({ type: 'move', matchId: initial.id, move: 1, version: 7 });
  assert.equal((await b.take('error')).code, 'match-ended');
  a.send({ type: 'rematch', matchId: initial.id });
  const vote = await a.take('match', state => state.rematch.length === 1);
  assert.equal(vote.state.winner, 1);
  b.send({ type: 'rematch', matchId: initial.id });
  const restarted = await a.take('match', state => state.version === 8);
  assert.equal(restarted.state.moves, 0);
  assert.equal(restarted.state.winner, 0);
  assert.equal(restarted.players.find(player => player.id === a.welcome.id).seat, 2);
  assert.deepEqual(restarted.rematch, []);
});

test('disconnect removes presence immediately and token resumes the same match', async t => {
  const { url } = await fixture(t, { reconnectGraceMs: 500 });
  const a = await client(url, { name: 'First' });
  const b = await client(url, { name: 'Second' });
  const initial = await match(a, b);
  a.send({ type: 'move', matchId: initial.id, move: 3, version: 0 });
  await b.take('match', state => state.version === 1);
  await a.close();
  await b.take('lobby', message => message.players.length === 1);
  const disconnected = await b.take('match', state => state.connected.length === 1);
  assert.equal(disconnected.state.winner, 0);
  b.send({ type: 'move', matchId: initial.id, move: 4, version: 1 });
  assert.equal((await b.take('error')).code, 'opponent-offline');
  const resumed = await client(url, { name: 'Cannot Rename', token: a.welcome.token });
  assert.equal(resumed.welcome.id, a.welcome.id);
  assert.equal(resumed.welcome.name, 'First');
  const recovered = await resumed.take('match');
  assert.equal(recovered.id, initial.id);
  assert.equal(recovered.version, 1);
  assert.equal(recovered.connected.length, 2);
  assert.equal(recovered.state.moves, 1);
});

test('disconnected player forfeits after grace and abandoned sessions are cleaned', async t => {
  const { app, url } = await fixture(t, { reconnectGraceMs: 50, sessionTtlMs: 120 });
  const a = await client(url, { name: 'First' });
  const b = await client(url, { name: 'Second' });
  const initial = await match(a, b);
  await a.close();
  const finished = await b.take('match', state => state.endedReason === 'disconnected');
  assert.equal(finished.state.winner, 2);
  await eventually(() => app.stats().sessions === 1);
  b.send({ type: 'leave-match', matchId: initial.id });
  await b.take('lobby', message => message.players[0]?.status === 'available');
  await eventually(() => app.stats().matches === 0);
  b.send({ type: 'leave' });
  await eventually(() => app.stats().sessions === 0);
});

test('explicit leave forfeits immediately, clears invites and cannot reclaim token', async t => {
  const { app, url } = await fixture(t);
  const a = await client(url, { name: 'First' });
  const b = await client(url, { name: 'Second' });
  const initial = await match(a, b);
  a.send({ type: 'leave' });
  const finished = await b.take('match', state => state.endedReason === 'left');
  assert.equal(finished.state.winner, 2);
  assert.deepEqual(finished.connected, [b.welcome.id]);
  b.send({ type: 'leave-match', matchId: initial.id });
  await eventually(() => app.stats().matches === 0);
  const reconnect = await client(url);
  reconnect.send({ type: 'join', game: 'connect-four', name: 'First', token: a.welcome.token });
  assert.equal((await reconnect.take('error')).code, 'invalid-session');
  reconnect.send({ type: 'join', game: 'connect-four', name: 'First' });
  reconnect.welcome = await reconnect.take('welcome');
  reconnect.send({ type: 'invite', to: b.welcome.id });
  const invite = await b.take('invite', message => message.from.id === reconnect.welcome.id);
  reconnect.send({ type: 'leave' });
  assert.equal((await b.take('invite-ended', message => message.id === invite.id)).reason, 'left');
  assert.equal(app.stats().invitations, 0);
});

test('room/session capacity and origin allowlist reject excess access', async t => {
  const { app, url } = await fixture(t, { maxRoomPlayers: 2, maxSessions: 2 });
  await client(url, { name: 'First' });
  await client(url, { name: 'Second' });
  const excess = await client(url);
  excess.send({ type: 'join', game: 'connect-four', name: 'Third' });
  assert.equal((await excess.take('error')).code, 'room-full');
  excess.send({ type: 'join', game: 'tic-tac-toe', name: 'Third' });
  assert.equal((await excess.take('error')).code, 'server-full');
  const blocked = new WebSocket(url, { origin: 'https://farmercarry.github.io.evil.example' });
  blocked.on('error', () => {});
  const response = await new Promise(resolve => blocked.once('unexpected-response', (_request, res) => {
    res.resume(); resolve(res.statusCode); blocked.terminate();
  }));
  assert.equal(response, 403);
  assert.equal(app.stats().sessions, 2);
});

test('malformed, binary, excessive payloads and spam cannot change game state', async t => {
  const { url } = await fixture(t, { rateBurst: 5, ratePerSecond: 0.01 });
  const a = await client(url, { name: 'First' });
  a.socket.send('{');
  assert.equal((await a.take('error')).code, 'invalid-json');
  a.send([]);
  assert.equal((await a.take('error')).code, 'invalid-message');
  const closed = once(a.socket, 'close');
  for (let count = 0; count < 10; count += 1) a.send({ type: 'unknown' });
  assert.equal((await a.take('error', message => message.code === 'rate-limit')).code, 'rate-limit');
  assert.equal((await closed)[0], 1008);
  const binary = await client(url);
  const binaryClosed = once(binary.socket, 'close');
  binary.socket.send(Buffer.from([1, 2, 3]));
  assert.equal((await binaryClosed)[0], 1003);
  const large = await client(url);
  const largeClosed = once(large.socket, 'close');
  large.socket.send('x'.repeat(2_048));
  assert.equal((await largeClosed)[0], 1009);
});

test('HTTP health exposes no student details and unused sockets time out', async t => {
  const { app, url } = await fixture(t, { joinTimeoutMs: 60 });
  await client(url, { name: 'Private Name' });
  const response = await fetch(url.replace('ws:', 'http:') + 'health');
  assert.equal(response.status, 200);
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.deepEqual(await response.json(), { ok: true });
  const unused = await client(url);
  assert.equal((await once(unused.socket, 'close'))[0], 1008);
  assert.equal(app.stats().sessions, 1);
});

test('connected but inactive match ends without awarding a winner', async t => {
  const { url } = await fixture(t, { matchIdleMs: 50 });
  const a = await client(url, { name: 'First' });
  const b = await client(url, { name: 'Second' });
  await match(a, b);
  const finished = await a.take('match', state => state.endedReason === 'inactive');
  assert.equal(finished.state.winner, 0);
  assert.equal(finished.state.draw, true);
  assert.equal(finished.version, 1);
});
