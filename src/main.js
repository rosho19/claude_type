'use strict';

const { app, BrowserWindow, ipcMain, screen } = require('electron');
const path     = require('path');
const http     = require('http');
const express  = require('express');
const WebSocket = require('ws');
const { execSync, exec } = require('child_process');

const PORT           = 3000;
const MIN_DISPLAY_MS = 3000;

// ── Server state ──────────────────────────────────────────────────────────────
let wsClient       = null;
let currentSession = null;
let startTime      = null;
let mainWindow     = null;
let previousApp    = null;

// ── Express + WebSocket ───────────────────────────────────────────────────────
const expressApp = express();
const httpServer = http.createServer(expressApp);
const wss        = new WebSocket.Server({ server: httpServer });

expressApp.use(express.json());

wss.on('connection', ws => {
  wsClient = ws;
  ws.on('close', () => { if (wsClient === ws) wsClient = null; });
});

function broadcast(msg) {
  if (wsClient && wsClient.readyState === WebSocket.OPEN) {
    wsClient.send(JSON.stringify(msg));
  }
}

expressApp.post('/start', (req, res) => {
  currentSession = req.body.session_id ?? null;
  startTime      = Date.now();

  if (mainWindow) {
    mainWindow.showInactive(); // show without stealing focus from IDE
    // slight delay so window is visible before we snap focus back to IDE
    setTimeout(() => {
      if (previousApp) exec(`osascript -e 'tell application "${previousApp}" to activate'`);
    }, 150);
  }

  broadcast({ type: 'status', value: 'working' });
  res.json({ ok: true });
});

expressApp.post('/stop', (req, res) => {
  if (req.body.session_id !== currentSession) {
    return res.json({ ok: false, reason: 'session mismatch' });
  }
  const elapsed = startTime ? Date.now() - startTime : MIN_DISPLAY_MS;
  const delay   = Math.max(0, MIN_DISPLAY_MS - elapsed);
  setTimeout(() => broadcast({ type: 'status', value: 'done' }), delay);
  res.json({ ok: true });
});

expressApp.post('/permission', (req, res) => {
  broadcast({ type: 'status', value: 'permission' });
  res.json({ ok: true });
});

expressApp.post('/shutdown', (req, res) => {
  res.json({ ok: true });
  setImmediate(() => app.quit());
});

expressApp.get('/health', (_, res) => res.json({ ok: true }));

httpServer.listen(PORT);

// ── Focus management ──────────────────────────────────────────────────────────
function recordFrontmost() {
  try {
    previousApp = execSync(
      `osascript -e 'tell application "System Events" to get name of first process whose frontmost is true'`,
      { timeout: 1500 }
    ).toString().trim();
  } catch { previousApp = null; }
}

function restorePreviousApp() {
  if (previousApp && previousApp !== 'Electron') {
    exec(`osascript -e 'tell application "${previousApp}" to activate'`);
  }
}

// ── IPC ───────────────────────────────────────────────────────────────────────
ipcMain.on('close-window', () => {
  restorePreviousApp();
  if (mainWindow) mainWindow.hide();
});

// ── Electron app ──────────────────────────────────────────────────────────────
app.on('before-quit', restorePreviousApp);

app.whenReady().then(() => {
  recordFrontmost();

  const { workAreaSize } = screen.getPrimaryDisplay();
  const W = 920;
  const H = 480;
  const x = workAreaSize.width  - W - 16;
  const y = 16;

  mainWindow = new BrowserWindow({
    width:  W,
    height: H,
    x,
    y,
    alwaysOnTop:    true,
    frame:          false,
    resizable:      false,
    skipTaskbar:    true,
    backgroundColor: '#323437',
    webPreferences: {
      nodeIntegration:  false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'game.html'));

  // Keep window on top across all spaces/fullscreen apps on macOS
  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });

  // Don't close, just hide — stays resident so the next session is instant
  mainWindow.on('close', e => {
    e.preventDefault();
    restorePreviousApp();
    mainWindow.hide();
  });
});

// Prevent quitting when window is hidden
app.on('window-all-closed', () => { /* keep alive */ });
