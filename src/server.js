'use strict';

// ── monkeytype control server ───────────────────────────────────────────────
// Standalone Node process (no Electron). Serves game.html to the native panel's
// WebView and relays Claude Code lifecycle events to it over WebSocket.
//
//   hooks → `monkeytype event …` → HTTP POST here → WS broadcast → game.html
//
// The native macOS panel (native/MonkeyType.app) is a thin shell: it loads
// http://127.0.0.1:PORT/ in a WKWebView and shows/hides itself when the game
// asks it to via the `panel` script-message bridge.

const path      = require('path');
const http      = require('http');
const express   = require('express');
const WebSocket = require('ws');

const PORT           = Number(process.env.MONKEYTYPE_PORT) || 3000;
const HOST           = '127.0.0.1';          // localhost only — never expose on the network
const MIN_DISPLAY_MS = 3000;
const GAME_HTML      = path.join(__dirname, 'game.html');

// ── State ───────────────────────────────────────────────────────────────────
let wsClient       = null;
let currentSession = null;
let startTime      = null;
let lastStatus     = null;   // last status broadcast — replayed to a late-connecting panel

// ── Express + WebSocket ───────────────────────────────────────────────────────
const expressApp = express();
const httpServer = http.createServer(expressApp);
const wss        = new WebSocket.Server({ server: httpServer });

expressApp.use(express.json());

wss.on('connection', ws => {
  wsClient = ws;
  // The panel's WebView may finish loading and open this socket *after* a /start
  // already fired (first prompt of a session). Replay the latest status so a
  // late-connecting panel still shows itself instead of sitting there hidden.
  if (lastStatus) ws.send(JSON.stringify(lastStatus));
  ws.on('close', () => { if (wsClient === ws) wsClient = null; });
});

function broadcast(msg) {
  if (msg.type === 'status') lastStatus = msg;   // remember even if no client is connected yet
  if (wsClient && wsClient.readyState === WebSocket.OPEN) {
    wsClient.send(JSON.stringify(msg));
  }
}

// Serve the game to the panel's WebView.
expressApp.get('/', (_req, res) => res.sendFile(GAME_HTML));

// A new prompt was submitted → Claude is working. Show the panel and let the
// user type. `show: true` tells the game to bring the panel to the foreground.
expressApp.post('/start', (req, res) => {
  currentSession = req.body.session_id ?? null;
  startTime      = Date.now();
  broadcast({ type: 'status', value: 'working', show: true });
  res.json({ ok: true });
});

// Claude finished its turn → show the "done" banner (never auto-closes).
expressApp.post('/stop', (req, res) => {
  if (req.body.session_id !== currentSession) {
    return res.json({ ok: false, reason: 'session mismatch' });
  }
  const elapsed = startTime ? Date.now() - startTime : MIN_DISPLAY_MS;
  const delay   = Math.max(0, MIN_DISPLAY_MS - elapsed);
  setTimeout(() => broadcast({ type: 'status', value: 'done' }), delay);
  res.json({ ok: true });
});

// Claude needs your input → dim the game and disable typing so you can answer
// in the terminal.
expressApp.post('/permission', (_req, res) => {
  broadcast({ type: 'status', value: 'permission' });
  res.json({ ok: true });
});

// Claude resumed working after a permission gate (PreToolUse). Re-enable typing
// and un-dim, but do NOT force the panel back to the foreground (`show: false`)
// — the user may be mid-action in their terminal.
expressApp.post('/resume', (_req, res) => {
  broadcast({ type: 'status', value: 'working', show: false });
  res.json({ ok: true });
});

// Session ended → tell the panel to quit, then exit.
expressApp.post('/shutdown', (_req, res) => {
  res.json({ ok: true });
  broadcast({ type: 'control', value: 'quit' });
  setTimeout(() => process.exit(0), 100);
});

expressApp.get('/health', (_req, res) => res.json({ ok: true }));

// ── Listen ──────────────────────────────────────────────────────────────────
// Guard against a crash if the port is taken. Double-launch is already prevented
// by the health check in `monkeytype launch`, so a conflict here means a foreign
// process owns the port — exit quietly rather than throw. The ws library forwards
// the HTTP server's 'error' to the WebSocketServer, so handle it on both.
function onListenError(err) {
  if (err.code === 'EADDRINUSE') process.exit(0);
  process.stderr.write(`monkeytype server error: ${err.message}\n`);
  process.exit(1);
}
wss.on('error', onListenError);
httpServer.on('error', onListenError);

httpServer.listen(PORT, HOST);
