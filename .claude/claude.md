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
                     `window.webkit.messageHandlers.panel`
                     (show / show-nokey / hide / quit).
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

| hook event         | script             | endpoint     | effect                                          |
|--------------------|--------------------|--------------|-------------------------------------------------|
| UserPromptSubmit   | open_game.sh       | /start       | bank prior turn, show panel (takes keyboard)    |
| PreToolUse         | resume_game.sh     | /resume      | re-enable typing; restore panel if auto-hidden  |
| PermissionRequest  | permission_game.sh | /permission  | hide panel — keyboard returns to the terminal   |
| Stop               | close_game.sh      | /stop        | bank stats, summary banner (silent if hidden)   |
| SessionEnd         | kill_server.sh     | /shutdown    | quit panel + server                             |

## server → game messages (over WS)
- `{ type: "status", value: "working", show: bool }` — show=true brings panel forward
- `{ type: "status", value: "done" }`                — done banner; never auto-closes
- `{ type: "status", value: "permission" }`          — dim, disable input
- `{ type: "control", value: "quit" }`               — panel quits

## game rules
- no timer; stats (wpm/raw/acc) start on first keypress
- 2-second idle silently resets the burst stats and word line; Tab does too
- session totals survive those resets and are banked once per Claude turn into
  localStorage (best wpm, lifetime words → shown in the drag bar)
- Enter/Escape hide the panel anytime (`hiddenBy='user'` — stays hidden until
  the next prompt); a permission prompt auto-hides it (`hiddenBy='auto'` —
  restored by the next resume, without taking the keyboard)
- a turn finishing while *manually* hidden (Enter/Esc) stays silent — the summary
  waits on the panel, replaced at the next prompt; but if it was *auto*-hidden for
  a permission prompt and no resume followed, `done` brings it back (no keyboard)
- caret is positioned relative to #words minus the target translateY, so it lands
  on its final spot during the 280ms scroll instead of lagging a line behind

## build / run
- `npm install` builds the panel (runs `native/build.sh`; skips on non-macOS)
- per project: `monkeytype install`, then `monkeytype on`
- requires macOS + Xcode command-line tools (swiftc); Node for the server

## code style
- vanilla JS, no TypeScript, no frameworks, no bundler
- Swift only for the thin window shell; bash for hooks; server endpoints return JSON
- comments only where logic is non-obvious
