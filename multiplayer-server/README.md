# School games multiplayer service

Small, in-memory WebSocket rooms for **Connect Four** and **tic-tac-toe**. Each game has its own list of students, invitations, and matches. There is no site-wide lobby, account system, chat, database, or student activity log. A name is a display name, not a verified identity.

**This code needs a running backend before online play works.** GitHub Pages serves the game pages but cannot run this Node service. Playing against the computer does not need the service.

## Run locally

Use Node.js 22 or newer. From the repository root:

```powershell
npm ci --prefix multiplayer-server
$env:ALLOWED_ORIGINS='http://127.0.0.1:4173,http://localhost:4173'
npm --prefix multiplayer-server start
```

Set the game's multiplayer URL to `ws://127.0.0.1:8080/` while serving the website at one of those exact origins. For browser tests, `window.SG_MULTIPLAYER_URL` can provide a temporary endpoint. Production configuration is in `shared/multiplayer-config.js`. Both `/` and `/ws` accept WebSocket connections. `GET /health` returns only `{"ok":true}`.

Local origins are **not enabled by default**. `ALLOWED_ORIGINS` contains the website's scheme, host, and port with no trailing slash or path. For example, a site at `https://farmercarry.github.io/school-games/` has origin `https://farmercarry.github.io`.

## Deploy one instance

The repository includes an optional [`render.yaml`](../render.yaml) Blueprint for
one free Render web service. In Render, create a Blueprint from this repository and
select the branch containing this change. It supplies the build/start commands,
health endpoint and browser origin below. Review the selected plan before creating
the service. Render's free service can sleep while unused, so allow for a delayed
first connection; see [Render's free-service limits](https://render.com/docs/free).
An always-on host is preferable if the lobby must be ready immediately at recess.
No service has been provisioned by adding this file.

Run this directory on a Node host that supports long-lived WebSocket connections, with the **repository root** as its source/build directory so `shared/board-rules.js` is available.

| Setting | Value |
| --- | --- |
| Runtime | Node.js 22 or newer |
| Build command | `npm ci --prefix multiplayer-server --omit=dev --ignore-scripts` |
| Start command | `npm --prefix multiplayer-server start` |
| Health path | `/health` |
| Instance count | **1** |
| Production endpoint | `wss://YOUR-BACKEND-HOST/` |
| Browser origin | `https://farmercarry.github.io` (or your actual site origin) |

The host should terminate TLS so the HTTPS game pages can connect over `wss://`. Its proxy must forward WebSocket upgrades and permit connections to remain open; the service sends a heartbeat every 15 seconds. If a host sleeps between visits, the first online connection can be delayed. Choose hosting that stays awake during class if that matters for your pilot.

Alternative Docker build, also from the repository root:

```sh
docker build -f multiplayer-server/Dockerfile -t school-games-multiplayer .
docker run --rm -p 8080:8080 -e ALLOWED_ORIGINS=https://farmercarry.github.io school-games-multiplayer
```

No persistent volume is needed. **Restarting or redeploying the service ends current matches and clears the lobby.** Do not enable multiple instances: each instance has separate rooms, and students on different instances would not see each other. A future multi-instance version needs shared state and routing, which this small version intentionally avoids.

After the host provides a live URL, set `shared/multiplayer-config.js` to that `wss://` endpoint and rebuild/publish the static website. The hostname must also be permitted by the school's network filter. The backend has no deployment credentials or hosting account bundled with it.

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` | `8080` | Listening port; most hosts supply this |
| `HOST` | `0.0.0.0` | Listening address |
| `ALLOWED_ORIGINS` | `https://farmercarry.github.io` | Comma-separated exact browser origins |
| `MAX_ROOM_PLAYERS` | `100` | Connected students allowed in each game |
| `MAX_CONNECTIONS` | `240` | Total WebSocket connections, including unjoined sockets |
| `MAX_SESSIONS` | `400` | Connected plus temporarily retained disconnected sessions |

These are protective caps, not a guarantee of tested school-network capacity. Start with a class and check on the actual PCs and network. In this version, everyone who opens the same game on this backend shares its lobby; there is no classroom code or teacher dashboard.

## Behavior and limits

- A student chooses a 2–20 character name using letters, numbers, spaces, `.`, `_`, `'`, or `-`. Arabic letters and combining marks work. Duplicate names in a game receive a numeric suffix; the server returns the final display name.
- One active invitation or match per session. Students playing the computer are marked `playing` and cannot receive invitations. An unanswered invitation expires after 25 seconds; sending invitations has a 3-second cooldown.
- The server checks membership, turn, move, and board version. Client-supplied winners, names, seats, or board state cannot change a match.
- On disconnect, a student disappears from the lobby immediately after the socket closes. Broken connections are detected through heartbeats. An unfinished match pauses for up to 20 seconds to allow reconnection with the session token; after that, the disconnected player forfeits.
- Refresh can recover the same session/match using its per-game token. Another active socket cannot take over that token. Explicitly leaving immediately ends an unfinished match and invalidates that token.
- Disconnected sessions expire after 2 minutes. A match with no move for 15 minutes ends without a winner. Finished matches allow a mutual rematch, alternating the starting player. Leaving releases the match once neither player remains in it.
- Tokens are random 256-bit secrets, sent only to the owning socket and never included in lobby or match snapshots. They should stay in per-tab session storage and must not go into URLs.
- Each browser opens one socket for the game it is viewing. The server sends lobby snapshots only when presence/status changes and board snapshots when a move or match event occurs. There is no polling or disk write for moves/presence, and WebSocket compression is disabled.
- Incoming messages are limited to 1 KiB with a per-socket token bucket (burst 24, sustained 4/second). Unjoined sockets expire after 5 seconds, excessive outgoing buffering disconnects slow clients, and totals are bounded by the caps above.

The origin allowlist helps restrict browser connections; it is not student authentication. Use nicknames rather than sensitive information. The service itself does not save names or matches to disk; a hosting provider may separately retain normal network/access logs.

## Protocol

JSON text messages only. Server IDs are opaque strings. The first client message is:

```json
{"type":"join","game":"connect-four","name":"أحمد","token":"optional saved token"}
```

Omit `token` for a new session. Games are `connect-four` and `tic-tac-toe`. Successful join sends `welcome`, then `lobby`, plus a recovered `match` when applicable. An expired token returns `invalid-session`; the client may discard it and join afresh.

| Client message | Fields |
| --- | --- |
| `join` | `game`, `name`, optional `token` |
| `status` | `status`: `available` or `playing` (computer mode) |
| `invite` | `to`: player ID |
| `respond` | `id`: invite ID, `accept`: boolean |
| `cancel` | `id`: own outgoing invite ID |
| `move` | `matchId`, `move`: zero-based column (Connect Four) or cell (tic-tac-toe), `version` |
| `resign` / `rematch` / `leave-match` | `matchId` |
| `leave` | no fields; removes session and closes socket |

| Server message | Fields |
| --- | --- |
| `welcome` | `id`, `token`, `name`, `game` |
| `lobby` | `players`: `{id,name,status}` entries; includes self, connected players only |
| `invite` | `id`, `from:{id,name}`, `to:{id,name}`, `expiresAt` (Unix milliseconds) |
| `invite-ended` | `id`, `reason`: `accepted`, `declined`, `cancelled`, `expired`, `unavailable`, `disconnected`, or `left` |
| `match` | `id`, `game`, `players:[{id,name,seat}]`, `state`, `version`, `connected:[playerId]`, `rematch:[playerId]`, optional `endedReason` |
| `error` | `code`, `message` (same machine-readable code; UI localizes it) |

`state` is the shared rules module's `{game,board,turn,winner,draw,moves,last,winning}`. Seats and board pieces use `1`/`2`; empty cells and no winner use `0`. A legal move increments `version`; a stale move returns `stale-state` plus the authoritative snapshot. Accepted invitations send `invite-ended` before the initial match. Rematching retains the match ID, resets the board, swaps seats, and increments the version. Presence/rematch-vote snapshots do not change the version. Forfeit reasons are `resigned`, `left`, or `disconnected`; an idle timeout sets `endedReason: "inactive"` with `winner:0` and `draw:true`.

## Verify

```sh
npm --prefix multiplayer-server test
```

The tests use real WebSocket connections and cover room isolation, name/token handling, forged membership, authoritative turns and versions, legal moves and winners, invitation states and cooldowns, computer-mode availability, rematch votes, disconnect/reconnect/forfeit, expiry cleanup, origin/capacity limits, malformed/oversized/binary messages, rate limiting, idle cutoff, and privacy of health responses. Browser integration tests live in the parent project's tooling.

For programmatic tests, import `createMultiplayerServer` from `server.mjs`, provide explicit `allowedOrigins`, call `await app.listen(0, '127.0.0.1')` for an ephemeral port, and finish with `await app.close()`. `app.stats()` returns counts only; it is not exposed over HTTP.
