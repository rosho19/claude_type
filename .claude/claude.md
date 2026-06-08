# monkeytype-overlay

## what this is
A Monkeytype-style typing game that pops up while Claude Code works, so you
practice typing instead of doomscrolling. **macOS only.**

It runs as a frameless, always-on-top **non-activating** panel — you can type in
it without it stealing keyboard focus from your IDE. Claude Code hooks drive it
through a small local server.

## architecture
- `src/game.html`  — the typing game. Vanilla JS, no build step. Connects to the
                     server over WebSocket; talks to the native shell via
                     `window.webkit.messageHandlers.panel` (show / hide / quit).
- `src/server.js`  — standalone Node (Express + ws) control server on
                     127.0.0.1:3000. Serves game.html and relays lifecycle events
                     to the game. Port via `MONKEYTYPE_PORT`.
- `native/MonkeyPanel.swift` — the macOS shell: a borderless `.nonactivatingPanel`
                     NSPanel hosting a WKWebView. Built by `native/build.sh` into
                     `native/build/MonkeyType.app` (swiftc, no download).
- `bin/cli.js`     — the `monkeytype` CLI (on/off/status/launch/install/uninstall/event).
- `hooks/*.sh`     — templates copied into a project's `.claude/hooks/` by
                     `monkeytype install`; each just calls `monkeytype event …`.
- `.claude/settings.json` — wires the hooks (below).

## event flow
hook → `monkeytype event <e>` → curl POST to server → WS broadcast → game reacts.
`monkeytype launch` spawns the server, waits for /health, then the panel
(PIDs tracked in `~/.config/monkeytype/`).

| hook event         | script             | endpoint     | effect                       |
|--------------------|--------------------|--------------|------------------------------|
| UserPromptSubmit   | open_game.sh       | /start       | working — show panel         |
| PreToolUse         | resume_game.sh     | /resume      | working — re-enable typing   |
| PermissionRequest  | permission_game.sh | /permission  | dim + disable typing         |
| Stop               | close_game.sh      | /stop        | "done" banner                |
| SessionEnd         | kill_server.sh     | /shutdown    | quit panel + server          |

## server → game messages (over WS)
- `{ type: "status", value: "working", show: bool }` — show=true brings panel forward
- `{ type: "status", value: "done" }`                — done banner; never auto-closes
- `{ type: "status", value: "permission" }`          — dim, disable input
- `{ type: "control", value: "quit" }`               — panel quits

## game rules
- no timer; stats (wpm/raw/acc) start on first keypress
- 2-second idle silently resets stats and the word line
- never auto-closes — the user closes it (or SessionEnd quits everything)

## build / run
- `npm install` builds the panel (runs `native/build.sh`; skips on non-macOS)
- per project: `monkeytype install`, then `monkeytype on`
- requires macOS + Xcode command-line tools (swiftc); Node for the server

## code style
- vanilla JS, no TypeScript, no frameworks, no bundler
- Swift only for the thin window shell; bash for hooks; server endpoints return JSON
- comments only where logic is non-obvious
