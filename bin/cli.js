#!/usr/bin/env node
'use strict';

const path    = require('path');
const fs      = require('fs');
const os      = require('os');
const { execSync, spawn } = require('child_process');

const CONFIG_DIR  = path.join(os.homedir(), '.config', 'monkeytype');
const FLAG_FILE   = path.join(CONFIG_DIR, 'enabled');
const SERVER_PORT = Number(process.env.MONKEYTYPE_PORT) || 3000;
const SERVER_JS   = path.join(__dirname, '..', 'src', 'server.js');
const PANEL_BIN   = path.join(__dirname, '..', 'native', 'build', 'MonkeyType.app', 'Contents', 'MacOS', 'MonkeyType');
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

  fs.mkdirSync(CONFIG_DIR, { recursive: true });
  const env = { ...process.env, MONKEYTYPE_PORT: String(SERVER_PORT) };

  // 1. Control server (Node) — serves the game and relays events over WebSocket.
  const server = spawn(process.execPath, [SERVER_JS], { detached: true, stdio: 'ignore', env });
  server.unref();
  fs.writeFileSync(path.join(CONFIG_DIR, 'server.pid'), String(server.pid));

  // Wait for it to accept connections before the panel loads the page.
  for (let i = 0; i < 20 && !isRunning(); i++) {
    try { execSync('sleep 0.1'); } catch { /* ignore */ }
  }

  // 2. Native panel (macOS). Built lazily via native/build.sh.
  if (!fs.existsSync(PANEL_BIN)) {
    process.stderr.write(
      `monkeytype: native panel not built. Run:\n  bash ${path.join(__dirname, '..', 'native', 'build.sh')}\n`
    );
    return;
  }
  const panel = spawn(PANEL_BIN, [], { detached: true, stdio: 'ignore', env });
  panel.unref();
  fs.writeFileSync(path.join(CONFIG_DIR, 'panel.pid'), String(panel.pid));
}

// Stop tracked processes directly (belt-and-suspenders alongside /shutdown).
function killTracked() {
  for (const name of ['panel.pid', 'server.pid']) {
    const f = path.join(CONFIG_DIR, name);
    try {
      const pid = Number(fs.readFileSync(f, 'utf8').trim());
      if (pid) process.kill(pid, 'SIGTERM');
    } catch { /* not running */ }
    try { fs.unlinkSync(f); } catch { /* ignore */ }
  }
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

  // Portable, project-relative paths — no personal/absolute paths committed.
  const hookCmd = name => `"$CLAUDE_PROJECT_DIR/.claude/hooks/${name}"`;
  settings.hooks = {
    ...(settings.hooks || {}),
    UserPromptSubmit:  [{ hooks: [{ type: 'command', command: hookCmd('open_game.sh') }] }],
    PreToolUse:        [{ hooks: [{ type: 'command', command: hookCmd('resume_game.sh') }] }],
    Stop:              [{ hooks: [{ type: 'command', command: hookCmd('close_game.sh') }] }],
    PermissionRequest: [{ hooks: [{ type: 'command', command: hookCmd('permission_game.sh') }] }],
    SessionEnd:        [{ hooks: [{ type: 'command', command: hookCmd('kill_server.sh') }] }],
  };

  fs.writeFileSync(settingsFile, JSON.stringify(settings, null, 2));
  console.log(`monkeytype: installed hooks into ${claudeDir}`);
  console.log(`Run 'monkeytype on' to enable, then start a Claude Code session.`);
}

function cmdUninstall() {
  const projectRoot  = process.cwd();
  const hooksDir     = path.join(projectRoot, '.claude', 'hooks');
  const settingsFile = path.join(projectRoot, '.claude', 'settings.json');

  const hookFiles = ['open_game.sh', 'resume_game.sh', 'close_game.sh', 'permission_game.sh', 'kill_server.sh'];
  for (const file of hookFiles) {
    const p = path.join(hooksDir, file);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  }

  if (fs.existsSync(settingsFile)) {
    try {
      const settings = JSON.parse(fs.readFileSync(settingsFile, 'utf8'));
      const hookKeys = ['UserPromptSubmit', 'PreToolUse', 'Stop', 'PermissionRequest', 'SessionEnd'];
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
    case 'resume':
      curlPost('/resume');
      break;
    case 'shutdown':
      curlPost('/shutdown');
      killTracked();
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
    console.log(`       monkeytype event <start|stop|permission|resume|shutdown> [--session=ID]`);
}
