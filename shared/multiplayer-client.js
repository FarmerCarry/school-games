/* A small, event-driven transport. No polling, SDK, dependency, or disk writes
 * for moves/presence. Only this tab's name and reconnect token are stored. */
(function () {
  'use strict';
  function endpoint() {
    try {
      if (!window.SG_MULTIPLAYER_URL) return '';
      var url = new URL(window.SG_MULTIPLAYER_URL);
      var local = ['localhost', '127.0.0.1', '[::1]'].indexOf(url.hostname) !== -1;
      if (url.username || url.password || url.hash || (url.protocol !== 'wss:' && !(local && url.protocol === 'ws:'))) return '';
      return url.href;
    } catch (_) { return ''; }
  }
  function create(options) {
    var key = 'sg:multiplayer:' + options.game;
    var saved = {}, socket = null, retry = null, joinTimer = null, attempt = 0, active = false, joined = false;
    var currentStatus = 'idle', ownId = null;
    try { saved = JSON.parse(sessionStorage.getItem(key) || '{}') || {}; } catch (_) { /* Storage can be disabled on school PCs. */ }
    if (typeof saved.name !== 'string' || typeof saved.token !== 'string') saved = {};
    function status(value) {
      currentStatus = value;
      if (options.onStatus) options.onStatus(value);
    }
    function remember(message) {
      saved = { name: message.name, token: message.token };
      try { sessionStorage.setItem(key, JSON.stringify(saved)); } catch (_) { /* In-memory play still works. */ }
    }
    function send(message) {
      if (!joined || !socket || socket.readyState !== WebSocket.OPEN) return false;
      try { socket.send(JSON.stringify(message)); return true; } catch (_) { return false; }
    }
    function dial() {
      var url = endpoint();
      if (!url || !window.WebSocket) { active = false; status('unavailable'); return; }
      status(attempt ? 'reconnecting' : 'connecting');
      var ws;
      try { ws = new WebSocket(url); } catch (_) { active = false; status('unavailable'); return; }
      socket = ws;
      joinTimer = setTimeout(function () { if (!joined && socket === ws) ws.close(); }, 12000);
      ws.onopen = function () {
        if (!active || socket !== ws) { ws.close(); return; }
        ws.send(JSON.stringify({ type: 'join', game: options.game, name: saved.name, token: saved.token || undefined }));
      };
      ws.onmessage = function (event) {
        if (socket !== ws) return;
        var message;
        try { message = JSON.parse(event.data); } catch (_) { return; }
        if (!message || typeof message.type !== 'string') return;
        if (message.type === 'welcome') {
          clearTimeout(joinTimer); joinTimer = null;
          joined = true; attempt = 0; ownId = message.id;
          remember(message); status('online');
        }
        // Expired sessions can join afresh; a fast reload may briefly race the
        // old connection closing. Bound that retry without evicting another tab.
        if (message.type === 'error' && !joined) {
          var expired = message.code === 'invalid-session' && !!saved.token;
          var closingOldTab = message.code === 'session-active' && attempt < 2;
          if (expired) {
            delete saved.token;
            try { sessionStorage.removeItem(key); } catch (_) { /* Optional. */ }
          }
          if (!expired && !closingOldTab) { active = false; clearTimeout(retry); status('unavailable'); }
          ws.close();
          if (expired || closingOldTab) return;
        }
        if (options.onMessage) options.onMessage(message);
      };
      ws.onerror = function () { /* close is the single retry path. */ };
      ws.onclose = function () {
        if (socket === ws) { clearTimeout(joinTimer); joinTimer = null; }
        ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
        if (socket !== ws) return;
        socket = null; joined = false;
        if (!active) return;
        attempt += 1;
        if (attempt > 8) { active = false; status('unavailable'); return; }
        status('reconnecting');
        retry = setTimeout(dial, Math.min(1000 * Math.pow(2, attempt - 1), 12000));
      };
    }
    function disconnect(leave) {
      active = false; clearTimeout(retry); retry = null; clearTimeout(joinTimer); joinTimer = null;
      if (leave) {
        send({ type: 'leave' }); saved = {}; ownId = null;
        try { sessionStorage.removeItem(key); } catch (_) { /* Optional. */ }
      }
      joined = false;
      if (socket) {
        socket.onopen = socket.onmessage = socket.onclose = socket.onerror = null;
        socket.close(); socket = null;
      }
      status('idle');
    }
    return {
      connect: function (name) {
        disconnect(false);
        if (saved.name !== name) saved = { name: name };
        else saved.name = name;
        attempt = 0; active = true; dial();
      },
      disconnect: disconnect,
      send: send,
      savedName: function () { return saved.name || ''; },
      canResume: function () { return !!(saved.name && saved.token); },
      isOnline: function () { return currentStatus === 'online' && joined; },
      id: function () { return ownId; },
      configured: function () { return !!endpoint(); }
    };
  }
  window.SGMultiplayer = { create: create };
}());
