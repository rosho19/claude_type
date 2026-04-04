const express  = require('express');
const http     = require('http');
const WebSocket = require('ws');
const path     = require('path');
const { pathToFileURL } = require('url');
const open     = require('open');

const PORT           = 3000;
const GAME_URL       = pathToFileURL(path.join(__dirname, 'game.html')).href;
const MIN_DISPLAY_MS = 3000;
const ACTIVITY_MS    = 500;

const app    = express();
const server = http.createServer(app);
const wss    = new WebSocket.Server({ server });

app.use(express.json());

// ── State ─────────────────────────────────────────────────────────────────
let wsClient        = null;
let currentSession  = null;
let startTime       = null;
let activityTimer   = null;

// ── WebSocket ─────────────────────────────────────────────────────────────
wss.on('connection', ws => {
  wsClient = ws;
  ws.on('close', () => { if (wsClient === ws) wsClient = null; });
});

function broadcast(msg) {
  if (wsClient && wsClient.readyState === WebSocket.OPEN) {
    wsClient.send(JSON.stringify(msg));
  }
}

// ── Routes ────────────────────────────────────────────────────────────────
app.post('/start', (req, res) => {
  currentSession = req.body.session_id ?? null;
  startTime      = Date.now();

  if (!wsClient) open(GAME_URL);

  broadcast({ type: 'status', value: 'working' });
  res.json({ ok: true });
});

app.post('/stop', (req, res) => {
  if (req.body.session_id !== currentSession) {
    return res.json({ ok: false, reason: 'session mismatch' });
  }

  const elapsed = startTime ? Date.now() - startTime : MIN_DISPLAY_MS;
  const delay   = Math.max(0, MIN_DISPLAY_MS - elapsed);

  setTimeout(() => broadcast({ type: 'status', value: 'done' }), delay);
  res.json({ ok: true });
});

app.post('/activity', (req, res) => {
  clearTimeout(activityTimer);
  const tool = req.body.tool;
  activityTimer = setTimeout(
    () => broadcast({ type: 'activity', tool }),
    ACTIVITY_MS
  );
  res.json({ ok: true });
});

app.post('/permission', (req, res) => {
  broadcast({ type: 'status', value: 'permission' });
  res.json({ ok: true });
});

app.post('/resume', (req, res) => {
  broadcast({ type: 'status', value: 'working' });
  res.json({ ok: true });
});

app.post('/shutdown', (req, res) => {
  res.json({ ok: true });
  setImmediate(() => process.exit(0));
});

app.get('/health', (_req, res) => {
  res.json({ ok: true });
});

// ── Start ─────────────────────────────────────────────────────────────────
server.listen(PORT, () => {
  console.log(`monkeytype server on port ${PORT}`);
});
