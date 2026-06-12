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

| You / Claude              | Hook                | The panel…                                         |
|---------------------------|---------------------|----------------------------------------------------|
| Submit a prompt           | `UserPromptSubmit`  | appears, ready to type                             |
| Claude needs permission   | `PermissionRequest` | stays up — keep typing; **Esc** when you're ready  |
| Claude resumes working    | `PreToolUse`        | rises back to front once Claude is really running  |
| Claude finishes the turn  | `Stop`              | shows "claude is done" + your words · wpm · acc    |
| Session ends              | `SessionEnd`        | closes                                             |

**Permission prompts never rugpull you.** The panel stays put until *you* press
**Esc** — then it slips behind your IDE (keyboard back in the terminal, answer
with zero clicks) and rises again, keyboard and all, once Claude has truly been
working for a beat. Back-to-back permission requests keep it tucked away until
the last one is answered.

**Esc** outside a permission closes the panel until your next prompt — if Claude
finishes meanwhile, nothing pops up; the summary waits on the panel. **Tab**
restarts the words. (Enter deliberately does nothing — it's too easy to hit
when you mean space.)

Under the hood: a frameless macOS `NSPanel` hosts a WebView running the game
(`src/game.html`); a small Node server (`src/server.js`) relays events over a
WebSocket. No Electron — the native shell is a few hundred KB, compiled locally.

## Your progress

While Claude works, the panel tallies your words, wpm, and accuracy for the
turn — surviving the brief idle resets between bursts. When Claude finishes, the
banner reports what you racked up, and throws up a **new best!** flourish when
you beat your record. Your best wpm and lifetime word count persist between
sessions and show, quietly, in the corner of the panel.

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
- The post-permission raise takes the keyboard so you can resume typing
  instantly. If you happen to be typing a queued message to Claude at that exact
  moment, those keystrokes land in the game — press Esc and finish your thought.
- Word fonts load from Google Fonts; offline, the game falls back to your system
  monospace font.

## License

[MIT](LICENSE)
