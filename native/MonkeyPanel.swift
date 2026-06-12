// MonkeyPanel — a frameless, non-activating floating panel that hosts the
// monkeytype game in a WKWebView.
//
// The key trick: an NSPanel with `.nonactivatingPanel` can become the *key*
// window (and so receive keystrokes) WITHOUT activating this app — your IDE
// stays the foreground app and you never have to click a tab to start typing.
//
// Build:  native/build.sh   (produces native/build/MonkeyType.app)
// Run:    the `monkeytype` CLI spawns the binary inside the .app bundle and
//         passes MONKEYTYPE_PORT in the environment.

import Cocoa
import WebKit

let port = ProcessInfo.processInfo.environment["MONKEYTYPE_PORT"] ?? "3000"
let gameURL = URL(string: "http://127.0.0.1:\(port)/")!

// Borderless windows return `canBecomeKey == false` by default, which would
// stop the WebView from ever receiving keystrokes. Override it so the panel can
// take keyboard focus.
final class KeyablePanel: NSPanel {
    override var canBecomeKey: Bool { true }
    override var canBecomeMain: Bool { true }
}

final class AppDelegate: NSObject, NSApplicationDelegate, WKScriptMessageHandler, WKNavigationDelegate {
    var panel: KeyablePanel!
    var webView: WKWebView!

    func applicationDidFinishLaunching(_ note: Notification) {
        // Accessory: no Dock icon, no menu bar, and showing windows never steals
        // app activation from the IDE.
        NSApp.setActivationPolicy(.accessory)

        let w: CGFloat = 920, h: CGFloat = 480, margin: CGFloat = 16
        let area  = NSScreen.main?.visibleFrame ?? NSRect(x: 0, y: 0, width: 1440, height: 900)
        let frame = NSRect(x: area.maxX - w - margin,
                           y: area.maxY - h - margin,
                           width: w, height: h)

        panel = KeyablePanel(contentRect: frame,
                             styleMask: [.nonactivatingPanel, .borderless],
                             backing: .buffered,
                             defer: false)
        panel.level                  = .floating
        panel.isFloatingPanel        = true
        panel.hidesOnDeactivate      = false
        panel.becomesKeyOnlyIfNeeded = false
        panel.isReleasedWhenClosed   = false
        panel.isMovableByWindowBackground = true   // drag the panel by its body
        panel.hasShadow              = true
        panel.backgroundColor        = NSColor(red: 0x32 / 255.0, green: 0x34 / 255.0,
                                               blue: 0x37 / 255.0, alpha: 1)
        // Float above other apps and sit over full-screen apps. .canJoinAllSpaces
        // keeps the panel on whatever Space you're viewing — including when it
        // reappears after a permission prompt. (.moveToActiveSpace only relocates
        // a window when its app *activates*, which a non-activating accessory never
        // does — so the panel would otherwise pop back on its home Space, not the
        // one you're working in.) Dismiss it with Enter/Esc rather than by leaving.
        panel.collectionBehavior = [.canJoinAllSpaces, .fullScreenAuxiliary, .stationary]

        let config = WKWebViewConfiguration()
        let ucc = WKUserContentController()
        ucc.add(self, name: "panel")          // window.webkit.messageHandlers.panel
        config.userContentController = ucc

        webView = WKWebView(frame: panel.contentLayoutRect, configuration: config)
        webView.autoresizingMask = [.width, .height]
        webView.navigationDelegate = self
        panel.contentView = webView
        panel.initialFirstResponder = webView

        webView.load(URLRequest(url: gameURL))
        // Start hidden — the game asks us to `show` when Claude starts working.
    }

    // If the control server isn't up yet, retry the load shortly.
    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        retryLoad()
    }
    func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) {
        retryLoad()
    }
    private func retryLoad() {
        DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) { [weak self] in
            self?.webView.load(URLRequest(url: gameURL))
        }
    }

    // Bridge: game.html → window.webkit.messageHandlers.panel.postMessage("…")
    func userContentController(_ ucc: WKUserContentController, didReceive msg: WKScriptMessage) {
        guard let cmd = msg.body as? String else { return }
        DispatchQueue.main.async { [weak self] in
            guard let self = self else { return }
            switch cmd {
            case "show":
                self.panel.makeKeyAndOrderFront(nil)   // key, but does not activate the app
                self.panel.makeFirstResponder(self.webView)
            case "show-nokey":
                // Reappear without taking the keyboard — used when returning after
                // a permission prompt; the user clicks the panel when they want to
                // type. orderFrontRegardless so it surfaces above the frontmost app
                // even though our app stays in the background.
                self.panel.orderFrontRegardless()
            case "hide":
                self.panel.orderOut(nil)
            case "quit":
                NSApp.terminate(nil)
            default:
                break
            }
        }
    }
}

let app = NSApplication.shared
let delegate = AppDelegate()
app.delegate = delegate
app.run()
