#!/bin/bash
# Compile the native panel into native/build/MonkeyType.app.
# Requires macOS + Xcode command-line tools (swiftc). No network, no download.
set -e
cd "$(dirname "$0")"

if [[ "$(uname)" != "Darwin" ]]; then
  echo "monkeytype: native panel only builds on macOS — skipping." >&2
  exit 0
fi
if ! command -v swiftc >/dev/null 2>&1; then
  echo "monkeytype: 'swiftc' not found. Install Xcode command-line tools:" >&2
  echo "            xcode-select --install" >&2
  exit 1
fi

APP="build/MonkeyType.app"
MACOS="$APP/Contents/MacOS"
mkdir -p "$MACOS"

swiftc -O MonkeyPanel.swift -o "$MACOS/MonkeyType" \
  -framework Cocoa -framework WebKit

cat > "$APP/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>CFBundleName</key><string>MonkeyType</string>
  <key>CFBundleDisplayName</key><string>monkeytype</string>
  <key>CFBundleIdentifier</key><string>com.monkeytype.overlay</string>
  <key>CFBundleExecutable</key><string>MonkeyType</string>
  <key>CFBundlePackageType</key><string>APPL</string>
  <key>CFBundleVersion</key><string>2.0.0</string>
  <key>LSMinimumSystemVersion</key><string>11.0</string>
  <!-- Accessory app: no Dock icon. -->
  <key>LSUIElement</key><true/>
  <!-- Allow the WebView to reach the localhost control server over http/ws. -->
  <key>NSAppTransportSecurity</key>
  <dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict>
</plist>
PLIST

echo "monkeytype: built $APP"
