import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import WebSocket, { WebSocketServer } from 'ws';

const require = createRequire(import.meta.url);
const rules = require('../shared/board-rules.js');
const GAMES = new Set(['connect-four', 'tic-tac-toe']);
const DEFAULT_ORIGIN = 'https://farmercarry.github.io';
const TOKEN = /^[a-f0-9]{64}$/;
const NAME = /^[\p{L}\p{N}\p{M} ._'-]+$/u;

/** One process owns these in-memory rooms. No database or student activity logs. */
export function createMultiplayerServer(options = {}) {
  const config = {
    allowedOrigins: [DEFAULT_ORIGIN],
    maxRoomPlayers: 100,
    maxConnections: 240,
    maxSessions: 400,
    reconnectGraceMs: 20_000,
    sessionTtlMs: 120_000,
    inviteTtlMs: 25_000,
    inviteCooldownMs: 3_000,
    matchIdleMs: 15 * 60_000,
    joinTimeoutMs: 5_000,
    heartbeatMs: 15_000,
    sweepMs: 1_000,
    rateBurst: 24,
    ratePerSecond: 4,
    ...options
  };
  const allowedOrigins = new Set(config.allowedOrigins);
  if (!allowedOrigins.size || [...allowedOrigins].some(origin => {
    try { return new URL(origin).origin !== origin || !/^https?:/.test(origin); }
    catch { return true; }
  })) throw new Error('allowedOrigins must contain exact http(s) origins, without paths or wildcards');

  const sessions = new Map();
  const tokens = new Map();
  const rooms = new Map([...GAMES].map(game => [game, new Set()]));
  const invitations = new Map();
  const matches = new Map();
  let closing = false;

  const server = createServer((request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    if ((request.method === 'GET' || request.method === 'HEAD') && request.url === '/health') {
      response.writeHead(200, { 'Content-Type': 'application/json' });
      response.end(request.method === 'HEAD' ? undefined : '{"ok":true}');
    } else {
      response.writeHead(404, { 'Content-Type': 'text/plain' });
      response.end('Not found');
    }
  });
  server.headersTimeout = 10_000;
  server.requestTimeout = 15_000;
  const wss = new WebSocketServer({
    noServer: true,
    maxPayload: 1_024,
    perMessageDeflate: false,
    clientTracking: true
  });

  function connected(session) {
    return Boolean(session?.socket && session.socket.readyState === WebSocket.OPEN);
  }

  function sendSocket(socket, payload) {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    if (socket.bufferedAmount > 64 * 1_024) { socket.terminate(); return; }
    socket.send(JSON.stringify(payload), error => { if (error) socket.terminate(); });
  }

  function send(session, payload) { sendSocket(session?.socket, payload); }
  function error(socket, code) { sendSocket(socket, { type: 'error', code, message: code }); }
  function identity(session) { return { id: session.id, name: session.name }; }
  function status(session) {
    if (session.matchId || session.mode === 'playing') return 'playing';
    return session.inviteId ? 'invited' : 'available';
  }

  function lobby(game) {
    const players = [...rooms.get(game)].map(id => sessions.get(id)).filter(connected)
      .map(session => ({ ...identity(session), status: status(session) }));
    const payload = { type: 'lobby', players };
    for (const id of rooms.get(game)) send(sessions.get(id), payload);
  }

  function snapshot(match) {
    return {
      type: 'match', id: match.id, game: match.game, players: match.players,
      state: match.state, version: match.version,
      connected: match.players.filter(player => {
        const session = sessions.get(player.id);
        return connected(session) && session.matchId === match.id;
      }).map(player => player.id),
      rematch: [...match.rematch],
      ...(match.endedReason ? { endedReason: match.endedReason } : {})
    };
  }

  function broadcastMatch(match) {
    const payload = snapshot(match);
    for (const player of match.players) {
      const session = sessions.get(player.id);
      if (session?.matchId === match.id) send(session, payload);
    }
  }

  function ended(match) { return Boolean(match.state.winner || match.state.draw || match.endedReason); }

  function endInvite(invitation, reason, announceLobby = true) {
    if (!invitations.delete(invitation.id)) return;
    for (const id of [invitation.from, invitation.to]) {
      const session = sessions.get(id);
      if (session?.inviteId === invitation.id) session.inviteId = null;
      send(session, { type: 'invite-ended', id: invitation.id, reason });
    }
    if (announceLobby) lobby(invitation.game);
  }

  function forfeit(match, departingId, reason) {
    if (ended(match)) return;
    const opponent = match.players.find(player => player.id !== departingId);
    match.state = { ...match.state, winner: opponent.seat, draw: false, winning: [] };
    match.endedReason = reason;
    match.rematch.clear();
    match.version += 1;
  }

  function detachMatch(session, reason) {
    const match = matches.get(session.matchId);
    session.matchId = null;
    if (!match) return;
    forfeit(match, session.id, reason);
    // Any departed player makes this rematch impossible.
    match.rematch.clear();
    broadcastMatch(match);
    if (!match.players.some(player => sessions.get(player.id)?.matchId === match.id)) matches.delete(match.id);
  }

  function removeSession(session, reason = 'left') {
    const invitation = invitations.get(session.inviteId);
    if (invitation) endInvite(invitation, reason, false);
    detachMatch(session, reason);
    sessions.delete(session.id);
    tokens.delete(session.token);
    rooms.get(session.game).delete(session.id);
    if (session.socket) session.socket.session = null;
    session.socket = null;
    lobby(session.game);
  }

  function uniqueName(game, requested) {
    const taken = new Set([...rooms.get(game)].map(id => sessions.get(id).name.toLocaleLowerCase()));
    if (!taken.has(requested.toLocaleLowerCase())) return requested;
    for (let number = 2; ; number += 1) {
      const suffix = ` ${number}`;
      const candidate = [...requested].slice(0, 20 - suffix.length).join('').trimEnd() + suffix;
      if (!taken.has(candidate.toLocaleLowerCase())) return candidate;
    }
  }

  function join(socket, message) {
    if (socket.session) return error(socket, 'already-joined');
    if (!GAMES.has(message.game)) return error(socket, 'invalid-game');
    if (typeof message.name !== 'string' || message.name.length > 80) return error(socket, 'invalid-name');
    const name = message.name.normalize('NFC').trim().replace(/\s+/g, ' ');
    if ([...name].length < 2 || [...name].length > 20 || !NAME.test(name)) return error(socket, 'invalid-name');
    let session;
    if (message.token !== undefined) {
      if (typeof message.token !== 'string' || !TOKEN.test(message.token)) return error(socket, 'invalid-session');
      session = sessions.get(tokens.get(message.token));
      if (!session || session.game !== message.game) return error(socket, 'invalid-session');
      if (connected(session)) return error(socket, 'session-active');
      if (session.disconnectedAt && Date.now() - session.disconnectedAt >= config.sessionTtlMs) {
        removeSession(session, 'disconnected');
        return error(socket, 'invalid-session');
      }
    }
    const connectedCount = [...rooms.get(message.game)].filter(id => connected(sessions.get(id))).length;
    if (connectedCount >= config.maxRoomPlayers) return error(socket, 'room-full');
    if (!session) {
      if (sessions.size >= config.maxSessions) return error(socket, 'server-full');
      session = {
        id: randomUUID(), token: randomBytes(32).toString('hex'), game: message.game,
        name: uniqueName(message.game, name), mode: 'available', socket: null,
        inviteId: null, matchId: null, lastInviteAt: 0, disconnectedAt: null
      };
      sessions.set(session.id, session);
      tokens.set(session.token, session.id);
      rooms.get(session.game).add(session.id);
    } else {
      const match = matches.get(session.matchId);
      if (match && session.disconnectedAt && Date.now() - session.disconnectedAt >= config.reconnectGraceMs) {
        forfeit(match, session.id, 'disconnected');
      }
    }
    // A closed socket may emit its close event after this replacement is joined.
    session.socket = socket;
    session.disconnectedAt = null;
    session.mode = 'available';
    socket.session = session;
    clearTimeout(socket.joinTimer);
    send(session, { type: 'welcome', ...identity(session), token: session.token, game: session.game });
    lobby(session.game);
    const match = matches.get(session.matchId);
    if (match) broadcastMatch(match);
  }

  function invite(session, message) {
    if (typeof message.to !== 'string' || message.to.length > 64) return error(session.socket, 'invalid-player');
    if (status(session) !== 'available') return error(session.socket, 'busy');
    const target = sessions.get(message.to);
    if (!target || target.id === session.id || target.game !== session.game || !connected(target)) {
      return error(session.socket, 'invalid-player');
    }
    if (status(target) !== 'available') return error(session.socket, 'player-busy');
    if (Date.now() - session.lastInviteAt < config.inviteCooldownMs) return error(session.socket, 'invite-cooldown');
    session.lastInviteAt = Date.now();
    const invitation = {
      id: randomUUID(), game: session.game, from: session.id, to: target.id,
      expiresAt: Date.now() + config.inviteTtlMs
    };
    invitations.set(invitation.id, invitation);
    session.inviteId = invitation.id;
    target.inviteId = invitation.id;
    const payload = {
      type: 'invite', id: invitation.id, from: identity(session), to: identity(target), expiresAt: invitation.expiresAt
    };
    send(session, payload);
    send(target, payload);
    lobby(session.game);
  }

  function respond(session, message) {
    const invitation = typeof message.id === 'string' ? invitations.get(message.id) : null;
    if (!invitation || invitation.to !== session.id || session.inviteId !== invitation.id) return error(session.socket, 'invalid-invite');
    if (typeof message.accept !== 'boolean') return error(session.socket, 'invalid-message');
    if (invitation.expiresAt <= Date.now()) return endInvite(invitation, 'expired');
    if (!message.accept) return endInvite(invitation, 'declined');
    const opponent = sessions.get(invitation.from);
    if (!connected(opponent) || opponent.matchId || session.matchId) return endInvite(invitation, 'unavailable');
    endInvite(invitation, 'accepted', false);
    const match = {
      id: randomUUID(), game: session.game,
      players: [{ ...identity(opponent), seat: 1 }, { ...identity(session), seat: 2 }],
      state: rules.create(session.game), version: 0, rematch: new Set(), updatedAt: Date.now()
    };
    matches.set(match.id, match);
    opponent.matchId = match.id;
    session.matchId = match.id;
    broadcastMatch(match);
    lobby(session.game);
  }

  function memberMatch(session, message) {
    const match = typeof message.matchId === 'string' ? matches.get(message.matchId) : null;
    if (!match || session.matchId !== match.id || !match.players.some(player => player.id === session.id)) {
      error(session.socket, 'invalid-match');
      return null;
    }
    return match;
  }

  function handle(socket, message) {
    if (!message || typeof message !== 'object' || Array.isArray(message) || typeof message.type !== 'string') {
      return error(socket, 'invalid-message');
    }
    if (message.type === 'join') return join(socket, message);
    const session = socket.session;
    if (!session || session.socket !== socket) return error(socket, 'join-required');
    switch (message.type) {
      case 'invite': return invite(session, message);
      case 'respond': return respond(session, message);
      case 'cancel': {
        const invitation = typeof message.id === 'string' ? invitations.get(message.id) : null;
        if (!invitation || invitation.from !== session.id) return error(socket, 'invalid-invite');
        return endInvite(invitation, 'cancelled');
      }
      case 'move': {
        const match = memberMatch(session, message);
        if (!match) return;
        if (ended(match)) return error(socket, 'match-ended');
        if (!Number.isSafeInteger(message.version) || message.version !== match.version) {
          error(socket, 'stale-state');
          return send(session, snapshot(match));
        }
        if (snapshot(match).connected.length !== 2) return error(socket, 'opponent-offline');
        if (match.players.find(player => player.id === session.id).seat !== match.state.turn) return error(socket, 'not-your-turn');
        if (!Number.isInteger(message.move)) return error(socket, 'invalid-move');
        const state = rules.play(match.state, message.move);
        if (!state) return error(socket, 'invalid-move');
        match.state = state;
        match.updatedAt = Date.now();
        match.version += 1;
        return broadcastMatch(match);
      }
      case 'resign': {
        const match = memberMatch(session, message);
        if (!match) return;
        if (ended(match)) return error(socket, 'match-ended');
        forfeit(match, session.id, 'resigned');
        return broadcastMatch(match);
      }
      case 'rematch': {
        const match = memberMatch(session, message);
        if (!match) return;
        if (!ended(match)) return error(socket, 'match-active');
        if (snapshot(match).connected.length !== 2) return error(socket, 'opponent-offline');
        match.rematch.add(session.id);
        if (match.rematch.size === 2) {
          match.state = rules.create(match.game);
          match.updatedAt = Date.now();
          match.players = match.players.map(player => ({ ...player, seat: 3 - player.seat }));
          match.rematch.clear();
          delete match.endedReason;
          match.version += 1;
        }
        return broadcastMatch(match);
      }
      case 'leave-match': {
        const match = memberMatch(session, message);
        if (!match) return;
        detachMatch(session, 'left');
        session.mode = 'available';
        return lobby(session.game);
      }
      case 'status': {
        if (message.status !== 'available' && message.status !== 'playing') return error(socket, 'invalid-status');
        if (session.matchId) return error(socket, 'busy');
        if (session.mode === message.status) return;
        const invitation = invitations.get(session.inviteId);
        if (invitation) endInvite(invitation, 'unavailable', false);
        session.mode = message.status;
        return lobby(session.game);
      }
      case 'leave':
        removeSession(session, 'left');
        socket.close(1000, 'left');
        return;
      default: return error(socket, 'invalid-message');
    }
  }

  server.on('upgrade', (request, socket, head) => {
    socket.on('error', () => {});
    let rejectStatus;
    if (!allowedOrigins.has(request.headers.origin)) rejectStatus = '403 Forbidden';
    else if (request.url !== '/' && request.url !== '/ws') rejectStatus = '404 Not Found';
    else if (closing || wss.clients.size >= config.maxConnections) rejectStatus = '503 Service Unavailable';
    if (rejectStatus) {
      socket.end(`HTTP/1.1 ${rejectStatus}\r\nConnection: close\r\nContent-Length: 0\r\n\r\n`);
      return;
    }
    wss.handleUpgrade(request, socket, head, ws => wss.emit('connection', ws, request));
  });

  wss.on('connection', socket => {
    socket.alive = true;
    socket.session = null;
    socket.budget = config.rateBurst;
    socket.budgetAt = Date.now();
    socket.joinTimer = setTimeout(() => socket.close(1008, 'join-timeout'), config.joinTimeoutMs);
    socket.joinTimer.unref();
    socket.on('error', () => {});
    socket.on('pong', () => { socket.alive = true; });
    socket.on('message', (data, isBinary) => {
      if (closing) return;
      const now = Date.now();
      socket.budget = Math.min(config.rateBurst, socket.budget + (now - socket.budgetAt) * config.ratePerSecond / 1_000);
      socket.budgetAt = now;
      if (socket.budget < 1) {
        error(socket, 'rate-limit');
        socket.close(1008, 'rate-limit');
        return;
      }
      socket.budget -= 1;
      if (isBinary) { socket.close(1003, 'text-only'); return; }
      let message;
      try { message = JSON.parse(data.toString()); }
      catch { error(socket, 'invalid-json'); return; }
      handle(socket, message);
    });
    socket.on('close', () => {
      clearTimeout(socket.joinTimer);
      const session = socket.session;
      if (!session || session.socket !== socket) return;
      session.socket = null;
      session.disconnectedAt = Date.now();
      const invitation = invitations.get(session.inviteId);
      if (invitation) endInvite(invitation, 'disconnected', false);
      const match = matches.get(session.matchId);
      if (match) {
        match.rematch.clear();
        broadcastMatch(match);
      }
      lobby(session.game);
    });
  });

  const heartbeat = setInterval(() => {
    for (const socket of wss.clients) {
      if (!socket.alive) { socket.terminate(); continue; }
      socket.alive = false;
      socket.ping();
    }
  }, config.heartbeatMs);
  heartbeat.unref();
  const sweep = setInterval(() => {
    const now = Date.now();
    for (const invitation of invitations.values()) {
      if (invitation.expiresAt <= now) endInvite(invitation, 'expired');
    }
    for (const session of sessions.values()) {
      if (session.disconnectedAt === null) continue;
      const absentMs = now - session.disconnectedAt;
      const match = matches.get(session.matchId);
      if (match && !ended(match) && absentMs >= config.reconnectGraceMs) {
        forfeit(match, session.id, 'disconnected');
        broadcastMatch(match);
      }
      if (absentMs >= config.sessionTtlMs) removeSession(session, 'disconnected');
    }
    for (const match of matches.values()) {
      if (!ended(match) && now - match.updatedAt >= config.matchIdleMs) {
        match.state = { ...match.state, winner: 0, draw: true, winning: [] };
        match.endedReason = 'inactive';
        match.rematch.clear();
        match.version += 1;
        broadcastMatch(match);
      }
    }
  }, config.sweepMs);
  sweep.unref();

  return {
    server,
    listen(port = 8080, host = '0.0.0.0') {
      return new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          resolve(server.address());
        });
      });
    },
    stats() {
      return { connections: wss.clients.size, sessions: sessions.size, invitations: invitations.size, matches: matches.size };
    },
    async close() {
      closing = true;
      clearInterval(heartbeat);
      clearInterval(sweep);
      for (const socket of wss.clients) { clearTimeout(socket.joinTimer); socket.terminate(); }
      await Promise.all([
        new Promise(resolve => wss.close(resolve)),
        new Promise(resolve => server.close(resolve))
      ]);
      sessions.clear(); tokens.clear(); invitations.clear(); matches.clear();
      for (const room of rooms.values()) room.clear();
    }
  };
}

function integerEnv(name, fallback, minimum, maximum) {
  if (!process.env[name]) return fallback;
  const value = Number(process.env[name]);
  if (!Number.isInteger(value) || value < minimum || value > maximum) throw new Error(`Invalid ${name}`);
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const app = createMultiplayerServer({
    allowedOrigins: (process.env.ALLOWED_ORIGINS || DEFAULT_ORIGIN).split(',').map(value => value.trim()).filter(Boolean),
    maxRoomPlayers: integerEnv('MAX_ROOM_PLAYERS', 100, 2, 500),
    maxConnections: integerEnv('MAX_CONNECTIONS', 240, 2, 2_000),
    maxSessions: integerEnv('MAX_SESSIONS', 400, 2, 4_000)
  });
  const address = await app.listen(integerEnv('PORT', 8080, 1, 65_535), process.env.HOST || '0.0.0.0');
  console.log(`school-games multiplayer listening on port ${address.port}`);
  for (const signal of ['SIGINT', 'SIGTERM']) process.once(signal, async () => {
    await app.close();
    process.exit(0);
  });
}
