#!/usr/bin/env node
'use strict';

const path    = require('path');
const fs      = require('fs');
const os      = require('os');
const { execSync, spawn } = require('child_process');

const FLAG_FILE   = path.join(os.homedir(), '.config', 'monkeytype', 'enabled');
const SERVER_PORT = 3000;
const MAIN_JS     = path.join(__dirname, '..', 'src', 'main.js');
const HOOKS_SRC   = path.join(__dirname, '..', 'hooks');

// ── Helpers ───────────────────────────────────────────────────────────────────

function isEnabled() {
  return fs.existsSync(FLAG_FILE);
}

function isRunning() {
  try {
    execSync(`curl -sf --max-time 1 http://localhost:${SERVER_PORT}/health`, { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function curlPost(endpoint, body = {}) {
  try {
    execSync(
      `curl -sf -X POST http://localhost:${SERVER_PORT}${endpoint} \
       -H 'Content-Type: application/json' \
       -d '${JSON.stringify(body)}'`,
      { stdio: 'ignore' }
    );
  } catch { /* server may not be running — silent fail */ }
}

// ── Commands ──────────────────────────────────────────────────────────────────

function cmdOn() {
  fs.mkdirSync(path.dirname(FLAG_FILE), { recursive: true });
  fs.writeFileSync(FLAG_FILE, '');
  console.log('monkeytype: enabled');
}

function cmdOff() {
  if (fs.existsSync(FLAG_FILE)) fs.unlinkSync(FLAG_FILE);
  console.log('monkeytype: disabled');
}

function cmdStatus() {
  const enabled = isEnabled();
  const running = isRunning();
  console.log(`enabled:  ${enabled}`);
  console.log(`running:  ${running}`);
}

function cmdLaunch() {
  if (isRunning()) return; // already up
  const electronPath = require('electron');
  // On macOS, Electron needs a display env and must run in its own session
  const child = spawn(electronPath, [MAIN_JS], {
    detached:  true,
    stdio:     'ignore',
    cwd:       path.join(__dirname, '..'),
    env: {
      ...process.env,
      ELECTRON_NO_ATTACH_CONSOLE: '1',
      ELECTRON_ENABLE_LOGGING:    '0',
    },
  });
  child.unref();
  // Give Electron a moment before the hook proceeds
  execSync('sleep 0.1');
}

function cmdInstall() {
  const projectRoot = process.cwd();
  const claudeDir   = path.join(projectRoot, '.claude');
  const hooksDir    = path.join(claudeDir, 'hooks');
  const settingsFile = path.join(claudeDir, 'settings.json');

  fs.mkdirSync(hooksDir, { recursive: true });

  // Copy hook templates
  const hookFiles = fs.readdirSync(HOOKS_SRC).filter(f => f.endsWith('.sh'));
  for (const file of hookFiles) {
    const dest = path.join(hooksDir, file);
    fs.copyFileSync(path.join(HOOKS_SRC, file), dest);
    fs.chmodSync(dest, 0o755);
  }

  // Merge hook config into settings.json
  let settings = {};
  if (fs.existsSync(settingsFile)) {
    try { settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8')); } catch {}
  }

  settings.hooks = {
    ...(settings.hooks || {}),
    UserPromptSubmit: [{ hooks: [{ type: 'command', command: path.join(hooksDir, 'open_game.sh') }] }],
    Stop:             [{ hooks: [{ type: 'command', command: path.join(hooksDir, 'close_game.sh') }] }],
    PermissionRequest:[{ hooks: [{ type: 'command', command: path.join(hooksDir, 'permission_game.sh') }] }],
    SessionEnd:       [{ hooks: [{ type: 'command', command: path.join(hooksDir, 'kill_server.sh') }] }],
  };

  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
  console.log(`monkeytype: installed hooks into ${claudeDir}`);
  console.log(`Run 'monkeytype on' to enable, then start a Claude Code session.`);
}

function cmdUninstall() {
  const projectRoot  = process.cwd();
  const hooksDir     = path.join(projectRoot, '.claude', 'hooks');
  const settingsFile = path.join(projectRoot, '.claude', 'settings.json');

  const hookFiles = ['open_game.sh', 'close_game.sh', 'permission_game.sh', 'kill_server.sh'];
  for (const file of hookFiles) {
    const p = path.join(hooksDir, file);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  if (fs.existsSync(settingsFile)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      const hookKeys = ['UserPromptSubmit', 'Stop', 'PermissionRequest', 'SessionEnd'];
      for (const k of hookKeys) delete (settings.hooks || {})[k];
      fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
    } catch {}
  }

  console.log('monkeytype: uninstalled from this project');
}

// event subcommand — called by hook scripts
function cmdEvent(args) {
  const type      = args[0];
  const sessionId = (args.find(a => a.startsWith('--session=')) || '').replace('--session=', '') || null;

  switch (type) {
    case 'start':
      curlPost('/start', { session_id: sessionId });
      break;
    case 'stop':
      curlPost('/stop', { session_id: sessionId });
      break;
    case 'permission':
      curlPost('/permission');
      break;
    case 'shutdown':
      curlPost('/shutdown');
      break;
    default:
      process.stderr.write(`unknown event: ${type}\n`);
  }
}

// ── Dispatch ──────────────────────────────────────────────────────────────────

const [,, cmd, ...rest] = process.argv;

switch (cmd) {
  case 'on':        cmdOn();           break;
  case 'off':       cmdOff();          break;
  case 'status':    cmdStatus();       break;
  case 'launch':    cmdLaunch();       break;
  case 'install':   cmdInstall();      break;
  case 'uninstall': cmdUninstall();    break;
  case 'event':     cmdEvent(rest);    break;
  default:
    console.log(`Usage: monkeytype <on|off|status|install|uninstall|launch>`);
    console.log(`       monkeytype event <start|stop|permission|shutdown> [--session=ID]`);
}
