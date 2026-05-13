/**
 * Preload — context bridge between main process and renderer.
 * Only exposes a minimal, safe API surface to the renderer.
 */
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('electronAPI', {
  // Receive the bridge port once Python server is ready
  onBridgePort: (cb) => ipcRenderer.on('bridge-port', (_e, port) => cb(port)),

  // Native window controls (custom titlebar)
  minimize: () => ipcRenderer.send('win-minimize'),
  maximize: () => ipcRenderer.send('win-maximize'),
  close:    () => ipcRenderer.send('win-close'),

  // File system — upload / context injection
  selectFiles:    (opts)           => ipcRenderer.invoke('select-files',      opts || {}),
  readFile:       (filePath)       => ipcRenderer.invoke('read-file',         filePath),
  readDir:        (dirPath)        => ipcRenderer.invoke('read-dir',          dirPath),

  // File writing — apply AI-generated code back to disk
  writeFile:      (filePath, txt)  => ipcRenderer.invoke('write-file',        filePath, txt),
  saveFileDialog: (opts)           => ipcRenderer.invoke('save-file-dialog',  opts || {}),

  // Shell command execution — powers the terminal pane
  runCommand:    (opts)            => ipcRenderer.invoke('run-command',       opts),
  killCommand:   (id)              => ipcRenderer.invoke('kill-command',      id),
  sendCmdInput:  (opts)            => ipcRenderer.invoke('send-cmd-input',    opts),
  onCmdOut:      (cb)              => ipcRenderer.on('cmd-out', (_e, d) => cb(d)),

  // Path utilities
  homeDir:       ()                => ipcRenderer.invoke('home-dir'),
  resolvePath:   (base, rel)       => ipcRenderer.invoke('resolve-path',     base, rel),
  getPaths:      ()                => ipcRenderer.invoke('get-paths'),

  // Workspace / folder picker
  selectFolder:  ()                => ipcRenderer.invoke('select-folder'),

  // OS notification
  notify:        (title, body)     => ipcRenderer.invoke('notify',           title, body),

  // Open URL in system browser (used by preview pane external button)
  openExternal:  (url)             => ipcRenderer.invoke('open-external',    url),

  // App version (reads from package.json via Electron)
  getVersion:    ()                => ipcRenderer.invoke('get-app-version'),
});
