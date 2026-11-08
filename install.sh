#!/bin/bash
# Starr installer: hook into Claude Code, download Electron, start the pet.
set -e
cd "$(dirname "$0")"

echo "🐣 Installing Starr…"

if ! command -v node >/dev/null 2>&1 || ! command -v npm >/dev/null 2>&1; then
  echo "❌ Node.js / npm not found. Install it first: brew install node  or  https://nodejs.org"
  exit 1
fi

# 1) hook script
mkdir -p "$HOME/.claude-pet/sessions" "$HOME/.claude-pet/skin"
cp hook/pet-hook.sh "$HOME/.claude-pet/pet-hook.sh"
chmod +x "$HOME/.claude-pet/pet-hook.sh"
echo "✅ Hook script → ~/.claude-pet/pet-hook.sh"

# 2) register hooks in ~/.claude/settings.json (backs it up first)
node scripts/hooks.js install

# 3) Electron
if [ ! -x node_modules/.bin/electron ]; then
  echo "📦 Downloading Electron (~100 MB, the first time takes a few minutes)…"
  if ! npm install --no-audit --no-fund; then
    echo "⚠️  Official source failed, retrying with the npmmirror mirror…"
    ELECTRON_MIRROR="https://npmmirror.com/mirrors/electron/" \
      npm install --no-audit --no-fund --registry=https://registry.npmmirror.com
  fi
fi

xattr -dr com.apple.quarantine . 2>/dev/null || true
chmod +x start.command uninstall.sh 2>/dev/null || true

# 4) start
./start.command >/dev/null
echo ""
echo "🎉 All set! Starr is in the bottom-right corner of your screen."
echo "   • New Claude Code sessions are picked up automatically (restart any sessions already open)"
echo "   • Drag to move; right-click for the menu (preview animations / size / sound / start at login)"
echo "   • To start again: double-click start.command. To uninstall: ./uninstall.sh"
