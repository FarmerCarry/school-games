/* Set this to your deployed WebSocket service, e.g. wss://games.example.org/ws.
 * Empty means computer play only. No service is contacted on other game pages.
 * ws:// is accepted only for localhost development. A value supplied before this
 * script (for example by a deployment or test) takes precedence. */
if (typeof window.SG_MULTIPLAYER_URL !== 'string') window.SG_MULTIPLAYER_URL = 'wss://school-games-multiplayer.onrender.com/ws';
