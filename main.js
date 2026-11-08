'use strict';
// Starr — a desktop pet that reacts to Claude Code sessions.
const { app, BrowserWindow, ipcMain, screen, Menu, shell } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { pathToFileURL } = require('url');
const { execFile } = require('child_process');

const ROOT = path.join(os.homedir(), '.claude-pet');
const SESS_DIR = path.join(ROOT, 'sessions');
const SKIN_DIR = path.join(ROOT, 'skin');
const CFG_FILE = path.join(ROOT, 'config.json');
const PID_FILE = path.join(ROOT, 'pet.pid');
const AGENT_LABEL = 'com.local.claude-pet';
const AGENT_PLIST = path.join(os.homedir(), 'Library', 'LaunchAgents', `${AGENT_LABEL}.plist`);

// The window = room for the speech bubble on top + the pet. Only the pet scales;
// bubble text stays readable at every size.
const WIN_W = 260;
const TOP_SPACE = 150;
const PET_H = 180;   // pet height in CSS px at scale 1
const SIZES = { mini: 0.3, small: 0.42, medium: 0.6, large: 0.85 };
const SIZE_NAMES = { mini: 'Mini', small: 'Small', medium: 'Medium', large: 'Large' };
const STATES = ['idle', 'thinking', 'working', 'waiting', 'done', 'error', 'oops', 'sleeping'];
const STATE_NAMES = {
  idle: 'Idle', thinking: 'Thinking', working: 'Working', waiting: 'Needs you',
  done: 'Celebrate', error: 'Error', oops: 'Oops', sleeping: 'Sleeping',
};
const PRIORITY = { waiting: 7, error: 6, done: 5, oops: 4, working: 3, thinking: 2, idle: 1, sleeping: 0 };

let win = null;
let cfg = loadCfg();
let preview = null;
let lastSent = '';
let prevStates = {};
let drag = null;
let skins = {};
let skinScanAt = 0;

// ---------- config ----------
function loadCfg() {
  const def = { size: 'medium', sound: false, x: null, y: null };
  try { return { ...def, ...JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')) }; } catch { return def; }
}
function saveCfg() {
  try { fs.writeFileSync(CFG_FILE, JSON.stringify(cfg, null, 2)); } catch {}
}

// ---------- session state ----------
function readSessions(now) {
  let files;
  try { files = fs.readdirSync(SESS_DIR).filter((f) => f.endsWith('.json')); } catch { return []; }
  const out = [];
  for (const f of files) {
    const full = path.join(SESS_DIR, f);
    let s;
    try { s = JSON.parse(fs.readFileSync(full, 'utf8')); } catch { continue; }
    s.sid = f.slice(0, -5);
    s.ts = Number(s.ts) || 0;
    const age = now - s.ts;
    if (age > 24 * 3600) { try { fs.unlinkSync(full); } catch {} continue; }
    if (age > 6 * 3600) continue;
    s.state = stateOf(s, age);
    s.project = s.cwd ? path.basename(String(s.cwd).replace(/\/+$/, '')) || s.cwd : '';
    out.push(s);
  }
  return out;
}

function stateOf(s, age) {
  switch (s.event) {
    case 'UserPromptSubmit':
    case 'PostToolUse':
      return age > 600 ? 'idle' : 'thinking';
    case 'PreToolUse':
    case 'SubagentStart':
    case 'PreCompact':
      return age > 1800 ? 'idle' : 'working';
    case 'PostToolUseFailure':
      return age < 3 ? 'oops' : age > 600 ? 'idle' : 'thinking';
    case 'PermissionRequest':
    case 'NeedsInput':
      return age > 3600 ? 'idle' : 'waiting';
    case 'Stop':
      return age < 6 ? 'done' : 'idle';
    case 'StopFailure':
      return age < 120 ? 'error' : 'idle';
    default:
      return 'idle';
  }
}

const TOOL_LABELS = [
  [/^Bash$/, 'Running command'],
  [/^(Edit|MultiEdit|Write|NotebookEdit)$/, 'Writing code'],
  [/^(Read|NotebookRead)$/, 'Reading files'],
  [/^(Grep|Glob|LS)$/, 'Searching files'],
  [/^(WebSearch|WebFetch)$/, 'Browsing the web'],
  [/^(Task|Agent)$/, 'Sending a helper'],
  [/^(TodoWrite|TaskCreate|TaskUpdate)$/, 'Planning'],
  [/^Skill$/, 'Using a skill'],
];
function toolLabel(tool) {
  if (!tool) return '';
  const mcp = /^mcp__([^_]+(?:_[^_]+)*?)__/.exec(tool);
  if (mcp) return `Using ${mcp[1].split('_').filter(Boolean).pop()}`;
  for (const [re, label] of TOOL_LABELS) if (re.test(tool)) return label;
  return `Using ${tool}`;
}

function labelFor(s) {
  switch (s.state) {
    case 'working':
      if (s.event === 'PreCompact') return 'Tidying memory…';
      if (s.event === 'SubagentStart') return 'Sending a helper…';
      {
        return `${toolLabel(s.tool) || 'Working'}…`;
      }
    case 'thinking': return 'Thinking…';
    case 'waiting':
      if (s.event === 'PermissionRequest') return `Approve? · ${toolLabel(s.tool) || s.tool || 'action'}`;
      if (s.ntype && s.ntype.startsWith('elicitation')) return 'Has a question for you';
      return 'Needs your attention';
    case 'done': return 'All done!';
    case 'error': return s.err ? `Error (${s.err})` : 'Something went wrong';
    case 'oops': return 'Oops, a tool failed';
    default: return '';
  }
}

function aggregate(sessions, now) {
  if (sessions.length === 0) {
    return { state: 'sleeping', label: '', project: '', active: 0, total: 0, list: [] };
  }
  const sorted = [...sessions].sort((a, b) => PRIORITY[b.state] - PRIORITY[a.state] || b.ts - a.ts);
  const best = sorted[0];
  let state = best.state;
  if (state === 'idle') {
    const last = Math.max(...sessions.map((s) => s.ts));
    if (now - last > 600) state = 'sleeping';
  }
  const active = sessions.filter((s) => s.state !== 'idle').length;
  const list = [...sessions]
    .sort((a, b) => b.ts - a.ts)
    .slice(0, 6)
    .map((s) => ({ project: s.project || 'Session', state: s.state, label: labelFor(s) }));
  return { state, label: state === 'sleeping' ? '' : labelFor(best), project: best.project, active, total: sessions.length, list };
}

function previewPayload(state) {
  const fake = {
    working: { state, event: 'PreToolUse', tool: 'Bash' },
    waiting: { state, event: 'PermissionRequest', tool: 'Bash' },
    error: { state, event: 'StopFailure', err: 'rate_limit' },
  }[state] || { state };
  return { state, label: labelFor(fake), project: 'Preview', active: 1, total: 1, list: [] };
}

function playSound(name) {
  if (!cfg.sound || process.platform !== 'darwin') return;
  execFile('afplay', [`/System/Library/Sounds/${name}.aiff`], () => {});
}

function detectTransitions(sessions) {
  const next = {};
  for (const s of sessions) {
    const prev = prevStates[s.sid];
    if (prev && prev !== s.state) {
      if (s.state === 'done') playSound('Glass');
      else if (s.state === 'waiting') playSound('Ping');
      else if (s.state === 'error') playSound('Basso');
    }
    next[s.sid] = s.state;
  }
  prevStates = next;
}

function scanSkins() {
  const found = {};
  try {
    for (const f of fs.readdirSync(SKIN_DIR)) {
      const m = /^([a-z]+)\.(png|gif|webp|apng|jpe?g)$/i.exec(f);
      if (!m || !STATES.includes(m[1].toLowerCase())) continue;
      const full = path.join(SKIN_DIR, f);
      const mtime = Math.round(fs.statSync(full).mtimeMs);
      found[m[1].toLowerCase()] = `${pathToFileURL(full).href}?v=${mtime}`;
    }
  } catch {}
  skins = found;
}

function tick() {
  if (!win || win.isDestroyed()) return;
  const now = Date.now() / 1000;
  if (Date.now() - skinScanAt > 3000) { skinScanAt = Date.now(); scanSkins(); }
  const sessions = readSessions(now);
  detectTransitions(sessions);
  let payload = aggregate(sessions, now);
  if (preview && Date.now() < preview.until) payload = { ...payload, ...previewPayload(preview.state) };
  else preview = null;
  payload.skins = skins;
  payload.scale = scaleOf();
  const json = JSON.stringify(payload);
  if (json !== lastSent) {
    lastSent = json;
    win.webContents.send('state', payload);
  }
}

// ---------- window ----------
function scaleOf() { return SIZES[cfg.size] || SIZES.medium; }
function winSize() { return { w: WIN_W, h: Math.round(TOP_SPACE + PET_H * scaleOf()) }; }

function onSomeScreen(x, y, w, h) {
  return screen.getAllDisplays().some(({ workArea: a }) =>
    x + w / 2 >= a.x && x + w / 2 <= a.x + a.width && y + h / 2 >= a.y && y + h / 2 <= a.y + a.height);
}

function createWindow() {
  const { w, h } = winSize();
  let { x, y } = cfg;
  if (x == null || y == null || !onSomeScreen(x, y, w, h)) {
    const a = screen.getPrimaryDisplay().workArea;
    x = a.x + a.width - w - 16;
    y = a.y + a.height - h;
  }
  win = new BrowserWindow({
    x, y, width: w, height: h,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    minimizable: false,
    maximizable: false,
    fullscreenable: false,
    hasShadow: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    acceptFirstMouse: true,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
  });
  win.setAlwaysOnTop(true, 'floating');
  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setIgnoreMouseEvents(true, { forward: true });
  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  win.webContents.on('did-finish-load', () => {
    lastSent = '';
    tick();
  });
  win.once('ready-to-show', () => win.showInactive());
  win.on('closed', () => { win = null; });
}

function setSize(key) {
  if (!win) return;
  const oldB = win.getBounds();
  cfg.size = key;
  const { w, h } = winSize();
  // keep the pet's feet where they were
  const x = Math.round(oldB.x + (oldB.width - w) / 2);
  const y = oldB.y + oldB.height - h;
  win.setBounds({ x, y, width: w, height: h });
  cfg.x = x; cfg.y = y;
  saveCfg();
  lastSent = '';
  tick();
}

// ---------- launch at login (LaunchAgent) ----------
function xmlEsc(s) {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function setLoginItem(on) {
  try {
    if (on) {
      fs.mkdirSync(path.dirname(AGENT_PLIST), { recursive: true });
      fs.writeFileSync(AGENT_PLIST, `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key><string>${AGENT_LABEL}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${xmlEsc(process.execPath)}</string>
    <string>${xmlEsc(app.getAppPath())}</string>
  </array>
  <key>RunAtLoad</key><true/>
  <key>ProcessType</key><string>Interactive</string>
</dict>
</plist>
`);
    } else if (fs.existsSync(AGENT_PLIST)) {
      fs.unlinkSync(AGENT_PLIST);
    }
  } catch (e) {
    console.error('login item:', e);
  }
}

function showMenu() {
  const tpl = [
    {
      label: 'Preview animation',
      submenu: STATES.map((st) => ({
        label: STATE_NAMES[st],
        click: () => { preview = { state: st, until: Date.now() + 6000 }; tick(); },
      })),
    },
    {
      label: 'Size',
      submenu: Object.keys(SIZES).map((k) => ({
        label: SIZE_NAMES[k], type: 'radio', checked: cfg.size === k, click: () => setSize(k),
      })),
    },
    {
      label: 'Sound alerts', type: 'checkbox', checked: !!cfg.sound,
      click: (mi) => { cfg.sound = mi.checked; saveCfg(); },
    },
    {
      label: 'Start at login', type: 'checkbox', checked: fs.existsSync(AGENT_PLIST),
      click: (mi) => setLoginItem(mi.checked),
    },
    { label: 'Open skin folder…', click: () => shell.openPath(SKIN_DIR) },
    { type: 'separator' },
    { label: 'Quit Starr', click: () => app.quit() },
  ];
  Menu.buildFromTemplate(tpl).popup({ window: win });
}

// ---------- IPC ----------
ipcMain.on('ignore', (_e, ignore) => {
  if (!win || drag) return;
  win.setIgnoreMouseEvents(!!ignore, { forward: true });
});

ipcMain.on('drag-start', () => {
  if (!win) return;
  const p = screen.getCursorScreenPoint();
  const [x, y] = win.getPosition();
  win.setIgnoreMouseEvents(false);
  drag = { px: p.x, py: p.y, x, y, moved: false };
  drag.timer = setInterval(() => {
    if (!drag || !win) return;
    const c = screen.getCursorScreenPoint();
    const dx = c.x - drag.px;
    const dy = c.y - drag.py;
    if (!drag.moved && Math.abs(dx) + Math.abs(dy) > 4) drag.moved = true;
    if (drag.moved) win.setPosition(drag.x + dx, drag.y + dy);
  }, 16);
});

ipcMain.on('drag-end', () => {
  if (!drag) return;
  clearInterval(drag.timer);
  const moved = drag.moved;
  drag = null;
  if (moved && win) {
    const [x, y] = win.getPosition();
    cfg.x = x; cfg.y = y;
    saveCfg();
  }
});

ipcMain.on('menu', () => showMenu());

// ---------- app lifecycle ----------
function isAlive(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

// Starting the pet again replaces an older running copy (e.g. after an update).
async function replaceOldInstance() {
  let pid = 0;
  try { pid = Number(fs.readFileSync(PID_FILE, 'utf8').trim()); } catch {}
  if (!pid || pid === process.pid || !isAlive(pid)) return;
  try { process.kill(pid, 'SIGTERM'); } catch {}
  for (let i = 0; i < 30 && isAlive(pid); i++) await new Promise((r) => setTimeout(r, 100));
  await new Promise((r) => setTimeout(r, 300));
}

async function start() {
  await replaceOldInstance();
  if (!app.requestSingleInstanceLock()) { app.quit(); return; }
  app.on('second-instance', () => { if (win) win.showInactive(); });
  await app.whenReady();
  fs.mkdirSync(SESS_DIR, { recursive: true });
  fs.mkdirSync(SKIN_DIR, { recursive: true });
  try { fs.writeFileSync(PID_FILE, String(process.pid)); } catch {}
  createWindow();
  if (process.platform === 'darwin' && app.dock) app.dock.hide();
  setInterval(tick, 400);
}

app.on('window-all-closed', () => app.quit());
app.on('will-quit', () => {
  try { if (fs.readFileSync(PID_FILE, 'utf8').trim() === String(process.pid)) fs.unlinkSync(PID_FILE); } catch {}
});
start();
