#!/usr/bin/env node
// Adds / removes Starr's hooks in ~/.claude/settings.json without touching anything else.
// Usage: node scripts/hooks.js install | uninstall | status
'use strict';
const fs = require('fs');
const path = require('path');
const os = require('os');

const SETTINGS = process.env.CLAUDE_SETTINGS || path.join(os.homedir(), '.claude', 'settings.json');
const MARK = '.claude-pet/pet-hook.sh';
const EVENTS = [
  'SessionStart', 'SessionEnd', 'UserPromptSubmit',
  'PreToolUse', 'PostToolUse', 'PostToolUseFailure', 'PermissionRequest',
  'Notification', 'Stop', 'StopFailure', 'SubagentStart', 'PreCompact',
];

function load() {
  if (!fs.existsSync(SETTINGS)) return {};
  const txt = fs.readFileSync(SETTINGS, 'utf8');
  if (!txt.trim()) return {};
  try {
    return JSON.parse(txt);
  } catch (e) {
    console.error(`❌ ${SETTINGS} is not valid JSON; left it untouched to be safe: ${e.message}`);
    process.exit(1);
  }
}

function isOurs(h) {
  return h && typeof h.command === 'string' && h.command.includes(MARK);
}

// Remove our hook entries; returns how many were removed.
function strip(settings) {
  const hooks = settings.hooks;
  if (!hooks || typeof hooks !== 'object') return 0;
  let removed = 0;
  for (const ev of Object.keys(hooks)) {
    if (!Array.isArray(hooks[ev])) continue;
    hooks[ev] = hooks[ev]
      .map((g) => {
        if (!g || !Array.isArray(g.hooks)) return g;
        const kept = g.hooks.filter((h) => !isOurs(h));
        removed += g.hooks.length - kept.length;
        return { ...g, hooks: kept };
      })
      .filter((g) => !g || !Array.isArray(g.hooks) || g.hooks.length > 0);
    if (hooks[ev].length === 0) delete hooks[ev];
  }
  if (Object.keys(hooks).length === 0) delete settings.hooks;
  return removed;
}

function save(settings) {
  fs.mkdirSync(path.dirname(SETTINGS), { recursive: true });
  if (fs.existsSync(SETTINGS)) {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').replace('T', '-').slice(0, 15);
    const bak = `${SETTINGS}.bak-claude-pet-${stamp}`;
    fs.copyFileSync(SETTINGS, bak);
    console.log(`   Backed up original settings → ${bak}`);
  }
  const tmp = `${SETTINGS}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(settings, null, 2) + '\n');
  fs.renameSync(tmp, SETTINGS);
}

const cmd = process.argv[2] || 'status';
const settings = load();

if (cmd === 'install') {
  strip(settings);
  settings.hooks = settings.hooks || {};
  for (const ev of EVENTS) {
    if (!Array.isArray(settings.hooks[ev])) settings.hooks[ev] = [];
    settings.hooks[ev].push({
      hooks: [{ type: 'command', command: `"$HOME/${MARK}" ${ev}`, timeout: 5 }],
    });
  }
  save(settings);
  console.log(`✅ Registered ${EVENTS.length} hooks in ${SETTINGS}`);
} else if (cmd === 'uninstall') {
  const n = strip(settings);
  if (n > 0) {
    save(settings);
    console.log(`✅ Removed ${n} Starr hooks from ${SETTINGS}`);
  } else {
    console.log('ℹ️  No Starr hooks in settings.json; nothing to change');
  }
} else {
  const found = Object.entries(settings.hooks || {})
    .filter(([, groups]) => Array.isArray(groups) && groups.some((g) => g && Array.isArray(g.hooks) && g.hooks.some(isOurs)))
    .map(([ev]) => ev);
  console.log(found.length ? `Installed events: ${found.join(', ')}` : 'Not installed');
}
