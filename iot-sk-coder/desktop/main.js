/**
 * IOT-ST-KITTS-CODE — Electron main process
 *
 * Responsibilities:
 *   1. Spawn the Python bridge server (bridge/server.py)
 *   2. Wait for "BRIDGE_READY:<port>" on its stdout
 *   3. Create the main BrowserWindow
 *   4. Forward the bridge port to the renderer via IPC
 *   5. Handle native window controls (min / max / close)
 */

const { app, BrowserWindow, ipcMain, shell, dialog, Menu, MenuItem } = require('electron');
const path   = require('path');
const fs     = require('fs');
const http   = require('http');
const { spawn } = require('child_process');

// ── Config ────────────────────────────────────────────────────────────────────
const BRIDGE_PORT    = 7823;
const BRIDGE_TIMEOUT = 15_000;          // ms to wait for Python server

let mainWindow = null;
let bridge     = null;

// ── Python bridge ─────────────────────────────────────────────────────────────

/** Returns the /health JSON of a NOVA bridge listening on the port, or null. */
function checkExistingBridge(port) {
  return new Promise((resolve) => {
    const req = http.get(
      { hostname: '127.0.0.1', port, path: '/health', timeout: 2000 },
      (res) => {
        let data = '';
        res.on('data', (d) => { data += d; });
        res.on('end', () => {
          try {
            const health = JSON.parse(data);
            resolve(health.ok === true ? health : null);
          } catch { resolve(null); }
        });
      }
    );
    req.on('error',   () => resolve(null));
    req.on('timeout', () => { req.destroy(); resolve(null); });
  });
}

/**
 * True when the running bridge was spawned by THIS app version.
 * The bridge outlives the app on purpose (fast relaunch), so after an upgrade
 * a stale bridge from the previous version can still hold the port — reusing
 * it silently serves old server code. Bridges report the app version that
 * spawned them; older bridges don't report one at all → always replaced.
 */
function bridgeVersionMatches(health, appVersion) {
  return !!health && health.app_version === appVersion;
}

/** Handshake id this app expects from its bridge: version + install flavour. */
function expectedBridgeVersion() {
  return app.getVersion() + (app.isPackaged ? '' : '-dev');
}

/** Kill any process currently listening on the bridge port so a fresh spawn can bind. */
function killStalePort(port) {
  return new Promise((resolve) => {
    const { exec } = require('child_process');
    if (process.platform === 'win32') {
      // Windows: find PID listening on the port, kill it
      exec(`netstat -ano 2>nul | findstr ":${port} " | findstr LISTENING`, (err, stdout) => {
        if (err || !stdout.trim()) return resolve();
        const lines = stdout.trim().split('\n');
        const pids  = new Set();
        for (const line of lines) {
          const parts = line.trim().split(/\s+/);
          const pid   = parts[parts.length - 1];
          if (pid && pid !== '0') pids.add(pid);
        }
        if (pids.size === 0) return resolve();
        // Kill all matching PIDs, then wait briefly for the port to release
        exec(`taskkill /F ${[...pids].map(p => `/PID ${p}`).join(' ')}`, () => {
          setTimeout(resolve, 500);   // give OS time to release the port
        });
      });
    } else {
      // macOS / Linux — LISTEN filter is critical: without it lsof also lists
      // processes with client connections to the port (an old NOVA app mid-
      // stream), and kill -9 would take down the running app, not just the
      // stale bridge.
      exec(`lsof -ti tcp:${port} -sTCP:LISTEN`, (err, stdout) => {
        const pids = (stdout || '').trim().split('\n').filter(Boolean);
        if (err || !pids.length) return resolve();
        exec(`kill -9 ${pids.join(' ')}`, () => setTimeout(resolve, 500));
      });
    }
  });
}

function startBridge() {
  return new Promise((resolve, reject) => {
    // When packaged, bridge/ is an extraResource — use resourcesPath.
    // In dev, it sits next to main.js (__dirname = desktop/).
    const bridgeDir  = app.isPackaged
      ? path.join(process.resourcesPath, 'bridge')
      : path.join(__dirname, 'bridge');
    const serverScript = path.join(bridgeDir, 'server.py');

    // macOS: python3 is default; Windows: python or py; Linux: python3
    const pythonCmds = process.platform === 'darwin'
      ? ['python3', 'python']
      : ['python', 'py', 'python3'];
    let   tried      = 0;

    let sawEarlyExit = false;   // a candidate started then exited (port conflict / stale bridge)

    function tryNext() {
      if (tried >= pythonCmds.length) {
        reject(new Error(sawEarlyExit
          ? `Bridge exited on startup — port ${BRIDGE_PORT} may be held by a stale NOVA helper. Close all NOVA windows (or reboot) and relaunch.`
          : 'Python not found. Install Python 3.8+.'));
        return;
      }
      const cmd  = pythonCmds[tried++];
      const env  = Object.assign({}, process.env, {
        ISTKC_TEAM_TOKEN:  process.env.ISTKC_TEAM_TOKEN || 'ISTKC-2025-ELCZ7OSB',
        // Upgrade handshake id: version + install flavour, so a dev checkout
        // (npm start) and the installed app never adopt each other's bridges.
        ISTKC_APP_VERSION: expectedBridgeVersion(),
        PYTHONIOENCODING:  'utf-8',
      });
      const proc = spawn(cmd, [serverScript, String(BRIDGE_PORT)], {
        stdio: ['ignore', 'pipe', 'pipe'],
        detached:    true,   // own process group so it outlives Electron
        windowsHide: true,   // no console window on Windows
        env,
      });

      let settled = false;   // BRIDGE_READY seen, or already moved to next candidate

      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        proc.kill();
        tryNext();
      }, BRIDGE_TIMEOUT);

      proc.stdout.on('data', (data) => {
        const text = data.toString();
        if (text.includes('BRIDGE_READY:') && !settled) {
          settled = true;
          clearTimeout(timer);
          bridge = proc;
          proc.unref();      // let Electron exit without waiting for the bridge
          resolve(BRIDGE_PORT);
        }
      });

      proc.stderr.on('data', () => {});   // absorb stderr

      // Bridge refused to start (e.g. exit(1) because a different-version
      // bridge still holds the port) — fail over immediately instead of
      // burning the full timeout per Python candidate.
      proc.on('exit', (code) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        if (code !== 0) sawEarlyExit = true;
        tryNext();
      });

      proc.on('error', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        tryNext();
      });
    }

    tryNext();
  });
}

// ── Window ────────────────────────────────────────────────────────────────────
function createWindow(bridgePort) {
  mainWindow = new BrowserWindow({
    width:           1280,
    height:          820,
    minWidth:        900,
    minHeight:       600,
    frame:           false,          // custom titlebar
    titleBarStyle:   'hidden',
    backgroundColor: '#080c14',
    icon:            path.join(__dirname, 'src', 'assets', 'icon.png'),
    webPreferences: {
      preload:            path.join(__dirname, 'preload.js'),
      contextIsolation:   true,
      nodeIntegration:    false,
      sandbox:            false,
      spellcheck:         true,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'index.html'));

  // Send bridge port once the renderer is ready
  mainWindow.webContents.on('did-finish-load', () => {
    mainWindow.webContents.send('bridge-port', bridgePort);
  });

  // Right-click context menu — copy, paste, spell-check suggestions
  mainWindow.webContents.on('context-menu', (_e, params) => {
    const menu = new Menu();

    // Spell-check suggestions (shown first, most relevant)
    for (const word of params.dictionarySuggestions.slice(0, 5)) {
      menu.append(new MenuItem({
        label: word,
        click: () => mainWindow.webContents.replaceMisspelling(word),
      }));
    }
    if (params.misspelledWord) {
      menu.append(new MenuItem({
        label: 'Add to Dictionary',
        click: () => mainWindow.webContents.session
          .addWordToSpellCheckerDictionary(params.misspelledWord),
      }));
      menu.append(new MenuItem({ type: 'separator' }));
    } else if (params.dictionarySuggestions.length) {
      menu.append(new MenuItem({ type: 'separator' }));
    }

    // Copy / Paste / Select All
    if (params.selectionText) {
      menu.append(new MenuItem({ role: 'copy',  label: 'Copy' }));
    }
    if (params.isEditable) {
      if (params.selectionText) {
        menu.append(new MenuItem({ role: 'cut',   label: 'Cut'  }));
      }
      menu.append(new MenuItem({ role: 'paste',     label: 'Paste' }));
      menu.append(new MenuItem({ role: 'selectAll', label: 'Select All' }));
    }

    if (menu.items.length > 0) menu.popup({ window: mainWindow });
  });

  // Open external links in system browser
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  mainWindow.on('closed', () => { mainWindow = null; });
}

// ── IPC — native window controls ─────────────────────────────────────────────
ipcMain.on('win-minimize', () => mainWindow?.minimize());
ipcMain.on('win-maximize', () => {
  if (mainWindow?.isMaximized()) mainWindow.unmaximize();
  else mainWindow?.maximize();
});
ipcMain.on('win-close', () => mainWindow?.close());

// ── IPC — file system access ──────────────────────────────────────────────────
ipcMain.handle('select-files', async (_e, opts = {}) => {
  if (!mainWindow) return [];
  const props = opts.folder
    ? ['openDirectory']
    : ['openFile', 'multiSelections'];
  const filters = opts.folder ? [] : [
    { name: 'All Files',  extensions: ['*'] },
    { name: 'Code',       extensions: ['py','js','ts','jsx','tsx','rs','go','java','c','cpp','h','json','yaml','yml','toml','md','txt','sh','bat','sql','html','css','env','conf','ini'] },
    { name: 'Images',     extensions: ['png','jpg','jpeg','gif','webp','svg'] },
    { name: 'Documents',  extensions: ['pdf','docx','csv'] },
  ];
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, { properties: props, filters });
  return canceled ? [] : filePaths;
});

const LARGE_IMG_BYTES = 2 * 1024 * 1024;   // 2 MB threshold

ipcMain.handle('read-file', async (_e, filePath) => {
  const ext  = path.extname(filePath).toLowerCase().slice(1);
  const IMG  = new Set(['png','jpg','jpeg','gif','webp','svg','bmp','ico','tiff','tif','heic','heif','avif']);
  const mime = ext === 'svg'  ? 'image/svg+xml'
             : ext === 'jpg'  ? 'image/jpeg'
             : ext === 'tiff' || ext === 'tif' ? 'image/tiff'
             : `image/${ext}`;

  if (IMG.has(ext)) {
    const stat = fs.statSync(filePath);
    if (stat.size > LARGE_IMG_BYTES) {
      // Large image — renderer generates thumbnail via Canvas; we return metadata + file:// URL
      return {
        type:     'large-image',
        path:     filePath,
        fileUrl:  'file:///' + filePath.replace(/\\/g, '/').replace(/^\//, ''),
        mime,
        size:     stat.size,
      };
    }
    const buf = fs.readFileSync(filePath);
    return { type: 'image', content: buf.toString('base64'), mime, size: buf.length };
  }
  // Text files: cap what we load so a huge log/binary can't freeze the app
  const MAX_TEXT_BYTES = 4 * 1024 * 1024;   // 4 MB
  const tstat = fs.statSync(filePath);
  if (tstat.size > MAX_TEXT_BYTES) {
    const fd  = fs.openSync(filePath, 'r');
    const buf = Buffer.alloc(MAX_TEXT_BYTES);
    const n   = fs.readSync(fd, buf, 0, MAX_TEXT_BYTES, 0);
    fs.closeSync(fd);
    const content = buf.toString('utf-8', 0, n)
      + `\n\n[... file truncated — ${(tstat.size / (1024 * 1024)).toFixed(1)} MB total, first 4 MB shown]`;
    return { type: 'text', content, size: tstat.size, truncated: true };
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  return { type: 'text', content, size: Buffer.byteLength(content, 'utf-8') };
});

ipcMain.handle('read-dir', async (_e, dirPath) => {
  const MAX_PER_FILE = 120 * 1024;   // 120 KB
  const MAX_TOTAL    = 600 * 1024;   // 600 KB aggregate
  const SKIP_DIRS    = new Set(['node_modules','.git','__pycache__','.venv','venv','dist','build','.next','target','.cache','coverage']);
  const TEXT_EXTS    = new Set(['py','js','ts','jsx','tsx','rs','go','java','c','cpp','h','hpp','json','yaml','yml','toml','md','txt','sh','bat','env','gitignore','dockerfile','sql','html','css','scss','conf','ini','cfg','lock']);

  const files = [];
  let   total = 0;

  function walk(dir, rel) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.name.startsWith('.') && !['env','.env'].includes(e.name)) continue;
      const full    = path.join(dir, e.name);
      const relPath = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) walk(full, relPath);
      } else {
        const ext = path.extname(e.name).toLowerCase().slice(1);
        if (!TEXT_EXTS.has(ext)) continue;
        try {
          const sz = fs.statSync(full).size;
          if (sz > MAX_PER_FILE) { files.push({ path: relPath, content: `[skipped: ${(sz/1024).toFixed(1)} KB]`, size: 0 }); continue; }
          if (total + sz > MAX_TOTAL)  { files.push({ path: relPath, content: '[total limit reached]', size: 0 });  continue; }
          files.push({ path: relPath, content: fs.readFileSync(full, 'utf-8'), size: sz });
          total += sz;
        } catch { /* unreadable */ }
      }
    }
  }

  walk(dirPath, '');
  return { name: path.basename(dirPath), files, totalSize: total };
});

// ── IPC — file writing ────────────────────────────────────────────────────────
ipcMain.handle('write-file', async (_e, filePath, content) => {
  try {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

ipcMain.handle('save-file-dialog', async (_e, opts = {}) => {
  if (!mainWindow) return null;
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: opts.defaultPath || opts.defaultName || 'untitled.txt',
    filters: opts.filters || [
      { name: 'All Files', extensions: ['*'] },
      { name: 'Code',      extensions: ['py','js','ts','jsx','tsx','rs','go','java','c','cpp','h','json','yaml','yml','toml','md','txt','sh','bat','sql','html','css'] },
    ],
  });
  return canceled ? null : filePath;
});

// ── IPC — folder picker (workspace) ──────────────────────────────────────────
ipcMain.handle('select-folder', async () => {
  if (!mainWindow) return null;
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    properties: ['openDirectory'],
    title: 'Select Project Workspace Folder',
  });
  return canceled || !filePaths.length ? null : filePaths[0];
});

// ── IPC — OS notifications ────────────────────────────────────────────────────
ipcMain.handle('notify', (_e, title, body) => {
  const { Notification } = require('electron');
  if (Notification.isSupported()) {
    new Notification({ title: title || 'NOVA', body: body || '' }).show();
  }
});

// ── IPC — open URL in system default browser ──────────────────────────────────
ipcMain.handle('open-external', (_e, url) => {
  if (url && (url.startsWith('http://') || url.startsWith('https://'))) {
    shell.openExternal(url);
  }
});

// ── IPC — shell command execution (powers terminal pane) ──────────────────────
const _runningCmds = new Map();

ipcMain.handle('run-command', (event, { cmd, cwd, id }) => {
  const isWin = process.platform === 'win32';
  const shell = isWin ? 'cmd.exe' : 'sh';
  const args  = isWin ? ['/c', cmd] : ['-c', cmd];

  let proc;
  try {
    proc = spawn(shell, args, {
      cwd:   cwd || app.getPath('home'),
      stdio: ['pipe', 'pipe', 'pipe'],
      env:   process.env,
    });
  } catch (err) {
    return { ok: false, error: err.message };
  }

  _runningCmds.set(id, proc);
  const send = (data) => mainWindow?.webContents.send('cmd-out', data);
  proc.stdout.on('data', d => send({ id, type: 'out',   data: d.toString() }));
  proc.stderr.on('data', d => send({ id, type: 'err',   data: d.toString() }));
  proc.on('close', code    => { send({ id, type: 'exit', code }); _runningCmds.delete(id); });
  proc.on('error', err     => { send({ id, type: 'error', data: err.message }); _runningCmds.delete(id); });

  return { ok: true, pid: proc.pid };
});

ipcMain.handle('kill-command', (_e, id) => {
  const proc = _runningCmds.get(id);
  if (proc) {
    if (process.platform === 'win32') {
      // cmd.exe spawns children — kill the whole tree or the real process survives
      const { exec } = require('child_process');
      exec(`taskkill /PID ${proc.pid} /T /F`);
    } else {
      proc.kill('SIGTERM');
    }
    _runningCmds.delete(id);
    return { ok: true };
  }
  return { ok: false };
});

ipcMain.handle('send-cmd-input', (_e, { id, text }) => {
  const proc = _runningCmds.get(id);
  if (proc?.stdin?.writable) { proc.stdin.write(text + '\n'); return { ok: true }; }
  return { ok: false };
});

// ── IPC — app version ────────────────────────────────────────────────────────
ipcMain.handle('get-app-version', () => app.getVersion());
// Handshake id the renderer should expect from /health (see expectedBridgeVersion)
ipcMain.handle('get-expected-bridge-version', () => expectedBridgeVersion());

// ── IPC — path utilities ──────────────────────────────────────────────────────
ipcMain.handle('home-dir',     ()           => app.getPath('home'));
ipcMain.handle('resolve-path', (_e, b, r)   => path.resolve(b, r));

// Returns root paths so the renderer can build dynamic system-prompt references
// instead of hardcoding C:\Users\IOT\... paths.
ipcMain.handle('get-paths', () => {
  const root = app.isPackaged
    ? process.resourcesPath                        // installed .exe: extraResources land here
    : path.join(__dirname, '..', '..');            // dev: IOT-SK-CLI/ folder
  return {
    novaRoot:   root,
    openDesign: path.join(root, 'open-design'),
    desktopDir: __dirname,                         // always the Electron app folder
    homeDir:    app.getPath('home'),
  };
});

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(async () => {
  let port = BRIDGE_PORT;

  // Fast path: reuse a running bridge ONLY if it was spawned by this exact app
  // version. A bridge left over from a previous install must be replaced, or
  // the upgraded app keeps talking to old server code.
  const health = await checkExistingBridge(BRIDGE_PORT);
  if (!bridgeVersionMatches(health, expectedBridgeVersion())) {
    if (health) {
      console.log(`Stale bridge (${health.app_version || 'pre-1.3.2'}) on port ${BRIDGE_PORT} — replacing with ${expectedBridgeVersion()}`);
    }
    // Kill + respawn, with one full retry — the first kill can lose a race
    // against a dying process still holding the socket.
    let lastErr = null;
    for (let attempt = 0; attempt < 2; attempt++) {
      await killStalePort(BRIDGE_PORT);
      try {
        port = await startBridge();
        lastErr = null;
        break;
      } catch (err) {
        lastErr = err;
      }
    }
    if (lastErr) console.error('Bridge failed to start:', lastErr.message);
    // On failure, continue anyway — the renderer shows its reconnect/stale banner
  }

  createWindow(port);
});

app.on('window-all-closed', () => {
  // Keep the bridge process alive so the next launch can reuse it instantly
  // (checkExistingBridge skips the ~3s Python startup). The bridge is cleaned
  // up by launch-nova.bat on the next full launch, or on system reboot.
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow(BRIDGE_PORT);
});
