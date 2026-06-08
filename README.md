# monkeytype-overlay

Practice your typing while your agent works. **monkeytype-overlay** drops a
[Monkeytype](https://monkeytype.com)-style typing game into your Claude Code
sessions: the moment you submit a prompt, a small panel slides into the corner
of your screen so you can train your fingers instead of reaching for your phone.

It floats above your editor as a **non-activating panel** — you can start typing
in it immediately without it stealing keyboard focus from your IDE, and it never
takes over your screen. When Claude finishes, it tells you; you decide when to
close it.

> **macOS only** for now.

## How it works

Claude Code fires lifecycle **hooks** as it runs. Those hooks talk to a tiny
local server, which drives the game:

| You / Claude              | Hook                | The panel…                                |
|---------------------------|---------------------|-------------------------------------------|
| Submit a prompt           | `UserPromptSubmit`  | appears, ready to type                    |
| Claude needs permission   | `PermissionRequest` | dims so you can answer in the terminal    |
| Claude resumes working    | `PreToolUse`        | re-enables typing                         |
| Claude finishes the turn  | `Stop`              | shows a "claude is done" banner           |
| Session ends              | `SessionEnd`        | closes                                    |

Under the hood: a frameless macOS `NSPanel` hosts a WebView running the game
(`src/game.html`); a small Node server (`src/server.js`) relays events over a
WebSocket. No Electron — the native shell is a few hundred KB, compiled locally.

## Requirements

- **macOS** with **Xcode command-line tools** (`xcode-select --install`) — provides `swiftc`
- **Node.js** 18+

## Install

```sh
git clone <this-repo>
cd monkeytype-overlay
npm install          # installs deps and builds native/build/MonkeyType.app
npm link             # optional: puts `monkeytype` on your PATH
```

`npm install` builds the native panel automatically. Rebuild anytime with
`npm run build`.

## Use it in a project

From the project where you run Claude Code:

```sh
monkeytype install   # writes hooks into ./.claude/
monkeytype on        # enable the overlay
```

Start Claude Code and submit a prompt — the panel appears. Type away.

- `monkeytype off` — stop showing the overlay (hooks stay installed, but no-op)
- `monkeytype uninstall` — remove the hooks from the current project

## CLI

```
monkeytype on         enable the overlay
monkeytype off        disable it (no overlay on new sessions)
monkeytype status     show enabled / running state
monkeytype install    install hooks into ./.claude/ for the current project
monkeytype uninstall  remove hooks from the current project
monkeytype launch     start the server + panel manually
```

## Configuration

- `MONKEYTYPE_PORT` — port for the local control server (default `3000`).

## Notes & limitations

- **macOS only.** The non-activating floating panel relies on AppKit (`NSPanel`).
- After a permission prompt, typing is re-enabled but the panel does not grab
  keyboard focus back automatically — click it once to resume typing.
- Word fonts load from Google Fonts; offline, the game falls back to your system
  monospace font.

## License

[MIT](LICENSE)
