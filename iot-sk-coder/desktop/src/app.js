'use strict';
/**
 * IOT-ST-KITTS-CODE Desktop — renderer process
 *
 * Manages:
 *   · Bridge communication (fetch → Python HTTP server)
 *   · NOVA face animation state machine
 *   · Chat session (messages, streaming, commands)
 *   · Setup / onboarding wizard
 *   · Model picker, Brain viewer, /run task brief panels
 */

// ── Constants ─────────────────────────────────────────────────────────────────
let BRIDGE = 'http://127.0.0.1:7823';

const NOVA_FACES = {
  idle:  "  ╭─────────────╮\n  │  ◉       ◉  │\n  │    ╰───╯    │\n  │  ─────────  │\n  ╰──────┬──────╯",
  blink: "  ╭─────────────╮\n  │  ─       ─  │\n  │    ╰───╯    │\n  │  ─────────  │\n  ╰──────┬──────╯",
  wink:  "  ╭─────────────╮\n  │  ◉       ─  │\n  │    ╰───╯    │\n  │  ─────────  │\n  ╰──────┬──────╯",
  think: "  ╭─────────────╮\n  │  ◈       ◈  │\n  │    ─────    │\n  │  ░░░░░░░░░  │\n  ╰──────┬──────╯",
  w0:    "  ╭─────────────╮\n  │  ◈       ◈  │\n  │    ─────    │\n  │  ▓▓░░░░░░░  │\n  ╰──────┬──────╯",
  w1:    "  ╭─────────────╮\n  │  ◈       ◈  │\n  │    ─────    │\n  │  ▓▓▓▓░░░░░  │\n  ╰──────┬──────╯",
  w2:    "  ╭─────────────╮\n  │  ◈       ◈  │\n  │    ─────    │\n  │  ▓▓▓▓▓▓░░░  │\n  ╰──────┬──────╯",
  w3:    "  ╭─────────────╮\n  │  ◈       ◈  │\n  │    ─────    │\n  │  ▓▓▓▓▓▓▓▓▓  │\n  ╰──────┬──────╯",
  done:  "  ╭─────────────╮\n  │  ◉       ◉  │\n  │   ╰─────╯   │\n  │  ─────────  │\n  ╰──────┬──────╯",
  boot0: "  ╭─────────────╮\n  │             │\n  │             │\n  │             │\n  ╰──────┬──────╯",
  boot1: "  ╭─────────────╮\n  │  ·       ·  │\n  │             │\n  │             │\n  ╰──────┬──────╯",
  boot2: "  ╭─────────────╮\n  │  ◉       ◉  │\n  │             │\n  │             │\n  ╰──────┬──────╯",
  boot3: "  ╭─────────────╮\n  │  ◉       ◉  │\n  │    ╰───╯    │\n  │             │\n  ╰──────┬──────╯",
};

const MODELS = {
  chatgpt: [
    { id: 'gpt-4-1',      name: 'gpt-4.1  — flagship, best at code',   api_id: 'gpt-4.1' },
    { id: 'gpt-4-1-mini', name: 'gpt-4.1-mini  — fast & efficient',    api_id: 'gpt-4.1-mini' },
    { id: 'gpt-4o-plus',  name: 'gpt-4o  — multimodal, reliable',      api_id: 'gpt-4o' },
    { id: 'o4-mini',      name: 'o4-mini  — fast reasoning',            api_id: 'o4-mini' },
    { id: 'o3-mini-plus', name: 'o3-mini  — deep reasoning',            api_id: 'o3-mini' },
  ],
  openai: [
    { id: 'gpt-4o',       name: 'GPT-4o  — flagship, fast',            api_id: 'gpt-4o' },
    { id: 'gpt-4o-mini',  name: 'GPT-4o mini  — cheap & quick',         api_id: 'gpt-4o-mini' },
    { id: 'o1',           name: 'o1  — deep reasoning',                  api_id: 'o1' },
    { id: 'o3-mini',      name: 'o3-mini  — fast reasoning',             api_id: 'o3-mini' },
    { id: 'gpt-4-turbo',  name: 'GPT-4 Turbo  — stable',                api_id: 'gpt-4-turbo' },
  ],
  openrouter: [
    { id: 'claude-sonnet-4-5', name: 'Claude Sonnet 4.5  — best at code',   api_id: 'anthropic/claude-sonnet-4-5' },
    { id: 'claude-haiku',      name: 'Claude Haiku 3.5  — fast & cheap',    api_id: 'anthropic/claude-3-5-haiku' },
    { id: 'claude-opus',       name: 'Claude Opus 4  — most capable',       api_id: 'anthropic/claude-opus-4-5' },
    { id: 'gemini-flash',      name: 'Gemini 2.0 Flash  — 1M context',      api_id: 'google/gemini-2.0-flash-001' },
    { id: 'llama-70b',         name: 'Llama 3.3 70B  — open source',        api_id: 'meta-llama/llama-3.3-70b-instruct' },
    { id: 'deepseek-v3',       name: 'DeepSeek V3  — strong coder',         api_id: 'deepseek/deepseek-chat' },
    { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash  — fast & smart',    api_id: 'deepseek/deepseek-v4-flash' },
    { id: 'deepseek-v4-pro',   name: 'DeepSeek V4 Pro  — heavy duty ⚡pair', api_id: 'deepseek/deepseek-v4-pro' },
    { id: 'deepseek-v4-flash', name: 'DeepSeek V4 Flash  — lightwork',       api_id: 'deepseek/deepseek-v4-flash' },
    { id: 'mistral-large',     name: 'Mistral Large  — fast & reliable',    api_id: 'mistralai/mistral-large-latest' },
    { id: 'qwen-coder',        name: 'Qwen 2.5 Coder 32B  — specialised',   api_id: 'qwen/qwen-2.5-coder-32b-instruct' },
    { id: 'grok-4-1-fast',     name: 'Grok 4.1 Fast  — xAI, speedy',        api_id: 'x-ai/grok-4.1-fast' },
    { id: 'cobuddy-free',      name: 'CoBuddy Free  — Baidu',                api_id: 'baidu/cobuddy:free' },
    { id: 'qwen3-coder-flash',    name: 'Qwen3 Coder Flash  — Alibaba, fast',      api_id: 'qwen/qwen3-coder-flash' },
    { id: 'gemini-3-1-flash-lite', name: 'Gemini 3.1 Flash Lite  — Google, fast',  api_id: 'google/gemini-3.1-flash-lite' },
    { id: 'gpt-oss-120b',          name: 'GPT OSS 120B  — OpenAI open-source',     api_id: 'openai/gpt-oss-120b' },
  ],
  ollama: [
    { id: 'llama3.3',      name: 'Llama 3.3 70B  — general purpose',     api_id: 'llama3.3' },
    { id: 'codestral',     name: 'Codestral  — code specialist',          api_id: 'codestral' },
    { id: 'deepseek-coder',name: 'DeepSeek Coder V2  — strong coder',    api_id: 'deepseek-coder-v2' },
    { id: 'qwen2.5-coder', name: 'Qwen 2.5 Coder 32B  — code specialist',api_id: 'qwen2.5-coder:32b' },
    { id: 'phi4',          name: 'Phi-4  — Microsoft, fast',              api_id: 'phi4' },
    { id: 'mistral',       name: 'Mistral 7B  — fast & light',            api_id: 'mistral' },
  ],
};

const COMMANDS = [
  { cmd: '/run',       icon: '⚡', desc: 'Package conversation → execute with agent' },
  { cmd: '/memory',    icon: '🧠', desc: 'Show what NOVA remembers across sessions' },
  { cmd: '/model',     icon: '⚙',  desc: 'Switch AI model or provider' },
  { cmd: '/workspace', icon: '📁', desc: 'Set project root folder for file context + git' },
  { cmd: '/git',       icon: '⎇',  desc: 'Show current git status and recent commits' },
  { cmd: '/preview',   icon: '🌐', desc: 'Toggle the in-app preview pane' },
  { cmd: '/term',      icon: '⌨',  desc: 'Toggle the terminal pane' },
  { cmd: '/clear',     icon: '✕',  desc: 'Start a fresh conversation (brain kept)' },
  { cmd: '/save',      icon: '💾', desc: 'Save this session to brain memory' },
  { cmd: '/export',    icon: '📤', desc: 'Export conversation as Markdown file' },
  { cmd: '/help',      icon: '?',  desc: 'Show all available commands' },
  { cmd: '/status',    icon: '📊', desc: 'Show auth, model, and brain stats' },
];

// Context-window sizes (K tokens) by api_id  — used by token meter
const CTX_WINDOWS = {
  'gpt-4.1':                                 1_000,
  'gpt-4.1-mini':                            1_000,
  'o4-mini':                                   200,
  'gpt-4o':                                    128,
  'gpt-4o-mini':                               128,
  'o1':                                        200,
  'o3-mini':                                   200,
  'gpt-4-turbo':                               128,
  'anthropic/claude-sonnet-4-5':               200,
  'anthropic/claude-3-5-haiku':                200,
  'anthropic/claude-opus-4-5':                 200,
  'google/gemini-2.0-flash-001':             1_000,
  'google/gemini-pro-1.5':                   2_000,
  'meta-llama/llama-3.3-70b-instruct':         128,
  'deepseek/deepseek-chat':                     64,
  'deepseek/deepseek-v4-flash':                128,
  'deepseek/deepseek-v4-pro':                 128,
  'mistralai/mistral-large-latest':            128,
  'qwen/qwen-2.5-coder-32b-instruct':           32,
  'x-ai/grok-4.1-fast':                         131,
  'baidu/cobuddy:free':                           32,
  'qwen/qwen3-coder-flash':                      128,
  'google/gemini-3.1-flash-lite':              1_000,
  'openai/gpt-oss-120b':                         128,
  'deepseek/deepseek-v4-pro':                    128,
  'deepseek/deepseek-v4-flash':                  128,
};

// ── Smart model routing ───────────────────────────────────────────────────────
// Maps flagship → fast/cheap alternative for simple messages & background tasks
const FAST_MODEL_MAP = {
  // OpenAI
  'gpt-4o':       'gpt-4o-mini',
  'o1':           'gpt-4o-mini',
  'o3-mini':      'gpt-4o-mini',
  'gpt-4-turbo':  'gpt-4o-mini',
  // OpenRouter — Anthropic
  'anthropic/claude-sonnet-4-5': 'anthropic/claude-3-5-haiku',
  'anthropic/claude-opus-4-5':   'anthropic/claude-3-5-haiku',
  // OpenRouter — DeepSeek duo
  'deepseek/deepseek-v4-pro':    'deepseek/deepseek-v4-flash',
  // OpenRouter — others already fast, keep as-is
};

/**
 * Given user message text, return the modelCfg to use.
 * @param {string} text  The user's message (for complexity heuristics)
 * @param {'auto'|'fast'|'flagship'} mode
 */
function routeModel(text = '', mode = 'auto') {
  if (!state.modelCfg) return null;
  const cfg     = state.modelCfg;
  const fastId  = FAST_MODEL_MAP[cfg.api_id];

  if (mode === 'flagship' || !fastId) return cfg;
  if (mode === 'fast') return { ...cfg, api_id: fastId, display: cfg.display + ' ⚡' };

  // Auto: flash for short conversational turns, pro for anything involving code/files/generation
  const isHeavy = (
    text.length > 150 ||
    /```/.test(text) ||
    /(rewrite|implement|refactor|generate|create|build|fix|debug|write|design|test|deploy|install|configure|make|add|update|change|remove|migrate|convert|parse|render|style|animate|optimise|optimize|analyse|analyze|review|explain how|landing|page|component|function|class|api|script|skill|@\w)/i.test(text)
  );

  return isHeavy
    ? cfg
    : { ...cfg, api_id: fastId, display: fastId.split('/').pop() };
}

// Active abort controller for the current streaming response
let _abortCtrl = null;

// Track the last completed NOVA card so we can regenerate it
let _lastNovaCard = null;

// Active background task ID (null = no bg task running)
let _bgTaskId = null;
let _bgTaskAbort = null;

// ── Pinned sessions ───────────────────────────────────────────────────────────
let _pinnedSessions = new Set(JSON.parse(localStorage.getItem('nova_pinned') || '[]'));
function _savePinned() {
  localStorage.setItem('nova_pinned', JSON.stringify([..._pinnedSessions]));
}

// ── State ─────────────────────────────────────────────────────────────────────
const state = {
  bridgeReady:  false,
  modelCfg:     null,        // {provider, api_id, api_key, display}
  messages:     [],          // [{role, content}] current session
  sessionNum:   1,
  brainData:    {},
  novaState:    'idle',      // idle | think | work | done
  streaming:    false,
  attachments:  [],          // [{id, name, type, ext, content, mime, size, preview, files}]
  workspace:    '',          // absolute path to project root folder
  ctxSummary:   '',          // auto-generated summary of compressed old turns
  gitCtx:       null,        // {branch, status, diff_stat, log} or null
  paths:        { novaRoot: '', openDesign: '', desktopDir: '', homeDir: '' },
};

// ── DOM refs ──────────────────────────────────────────────────────────────────
const $ = (id) => document.getElementById(id);
const el = {
  setupScreen:   $('setup-screen'),
  loadingScreen: $('loading-screen'),
  appScreen:     $('app-screen'),
  loadingFill:   $('loading-fill'),
  // Setup
  tokenInput: $('token-input'), tokenBtn: $('token-btn'), tokenError: $('token-error'),
  stepToken: $('step-token'),   stepModel: $('step-model'), stepReady: $('step-ready'),
  providerGrid: $('provider-grid'),  modelSelect: $('model-select'),
  keyInput: $('key-input'), keyBtn: $('key-btn'), keyError: $('key-error'),
  enterBtn: $('enter-btn'),
  novaArtSetup: $('nova-art-setup'),
  // App
  novaArt:         $('nova-art'),
  novaStatusBadge: $('nova-status-badge'),
  sbSession: $('sb-session'), sbFacts: $('sb-facts'), sbProj: $('sb-proj'), sbDec: $('sb-dec'),
  sessionsList: $('sessions-list'),
  newSessionBtn: $('new-session-btn'),
  modelPill: $('model-pill'), modelPillName: $('model-pill-name'),
  brainBtn: $('brain-btn'),
  chatSessionLabel: $('chat-session-label'),
  chatModelBadge:   $('chat-model-badge'),
  hdrRunBtn: $('hdr-run-btn'), hdrClearBtn: $('hdr-clear-btn'),
  messages: $('messages'),
  msgInput: $('msg-input'), sendBtn: $('send-btn'),
  charCount: $('char-count'),
  // Model panel
  mpProviderGrid: $('mp-provider-grid'),  mpModelSelect: $('mp-model-select'),
  mpCustomId: $('mp-custom-id'),
  mpKeyInput: $('mp-key-input'), mpError: $('mp-error'), mpSaveBtn: $('mp-save-btn'),
  // Brain panel
  brainBody: $('brain-body'),
  // Brief panel
  briefBody: $('brief-body'), briefExecuteBtn: $('brief-execute-btn'),
  // Misc
  backdrop: $('panel-backdrop'),
  // Upload
  attachmentRow:    $('attachment-row'),
  attachFileBtn:    $('attach-file-btn'),
  attachFolderBtn:  $('attach-folder-btn'),
  dragOverlay:      $('drag-overlay'),
  // Workspace
  workspacePickBtn: $('workspace-pick-btn'),
  workspaceLabel:   $('workspace-label'),
  workspaceGitBtn:  $('workspace-git-btn'),
  gitStatusBar:     $('git-status-bar'),
  gitBranchBadge:   $('git-branch-badge'),
  gitChangesBadge:  $('git-changes-badge'),
  // Sessions search
  sessionsSearch:   $('sessions-search'),
};

// ══════════════════════════════════════════════════════════════════════════════
// NOVA FACE ANIMATION
// ══════════════════════════════════════════════════════════════════════════════

let _novaTimer   = null;
let _blinkTimer  = null;

function setFace(key, el_ref) {
  const art = el_ref || el.novaArt;
  if (art) art.textContent = NOVA_FACES[key] || NOVA_FACES.idle;
}

function startIdleAnimation() {
  stopAnimation();
  setFace('idle');
  el.novaStatusBadge.textContent = 'Ready';
  el.novaStatusBadge.style.color = '';

  function scheduleBlink() {
    const delay = 3500 + Math.random() * 4000;
    _blinkTimer = setTimeout(() => {
      const doWink = Math.random() < 0.2;
      setFace(doWink ? 'wink' : 'blink');
      setTimeout(() => { setFace('idle'); scheduleBlink(); }, 120);
    }, delay);
  }
  scheduleBlink();
}

function startThinkAnimation() {
  stopAnimation();
  el.novaStatusBadge.textContent = 'Thinking…';
  el.novaStatusBadge.style.color = 'var(--yellow)';
  const cycle = ['think', 'w0', 'w1', 'w2', 'w3', 'w2', 'w1', 'w0'];
  let i = 0;
  _novaTimer = setInterval(() => { setFace(cycle[i++ % cycle.length]); }, 130);
}

function showDoneFlash() {
  stopAnimation();
  setFace('done');
  el.novaStatusBadge.textContent = 'Done!';
  el.novaStatusBadge.style.color = 'var(--green)';
  setTimeout(() => startIdleAnimation(), 1200);
}

function stopAnimation() {
  if (_novaTimer)  { clearInterval(_novaTimer);  _novaTimer  = null; }
  if (_blinkTimer) { clearTimeout(_blinkTimer);  _blinkTimer = null; }
}

async function playBootAnimation(artEl) {
  const seq = [
    ['boot0', 100], ['boot1', 150], ['boot2', 200],
    ['boot3', 150], ['idle',  300], ['blink', 90],
    ['idle',  350], ['wink',  100], ['idle',  200],
  ];
  for (const [frame, ms] of seq) {
    setFace(frame, artEl);
    await sleep(ms);
  }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

// ── Canvas thumbnail generator (no npm needed) ────────────────────────────────
// Accepts any img src: data URL, blob URL, or file:// URL (Electron allows these)
// Returns { dataUrl, width, height, thumbW, thumbH }
function generateThumbnail(src, maxDim = 1024) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const w = img.naturalWidth  || img.width;
      const h = img.naturalHeight || img.height;
      const scale  = Math.min(maxDim / w, maxDim / h, 1);
      const tw = Math.max(1, Math.round(w * scale));
      const th = Math.max(1, Math.round(h * scale));
      const canvas  = document.createElement('canvas');
      canvas.width  = tw;
      canvas.height = th;
      canvas.getContext('2d').drawImage(img, 0, 0, tw, th);
      resolve({
        dataUrl: canvas.toDataURL('image/jpeg', 0.82),
        width: w, height: h, thumbW: tw, thumbH: th,
      });
    };
    img.onerror = (e) => reject(e);
    img.src = src;
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// ATTACHMENT SYSTEM
// ══════════════════════════════════════════════════════════════════════════════

const IMG_EXTS  = new Set(['png','jpg','jpeg','gif','webp','svg','bmp','ico']);
const CODE_EXTS = new Set(['py','js','ts','jsx','tsx','rs','go','java','c','cpp','h','hpp','json','yaml','yml','toml','md','txt','sh','bat','sql','html','css','scss','env','conf','ini','cfg']);

function _attType(filename) {
  const ext = (filename.split('.').pop() || '').toLowerCase();
  if (IMG_EXTS.has(ext))  return 'image';
  if (CODE_EXTS.has(ext)) return 'code';
  return 'file';
}

function _fmtSize(bytes) {
  if (!bytes || bytes < 1024)   return `${bytes || 0} B`;
  if (bytes < 1024 * 1024)      return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Open Electron file picker ─────────────────────────────────────────────────
async function pickFiles() {
  if (!window.electronAPI?.selectFiles) return;
  const paths = await window.electronAPI.selectFiles({ folder: false });
  await _addFilePaths(paths);
}

async function pickFolder() {
  if (!window.electronAPI?.selectFiles) return;
  const paths = await window.electronAPI.selectFiles({ folder: true });
  if (paths.length) await _addFolderPath(paths[0]);
}

// ── Process paths from Electron IPC ──────────────────────────────────────────
async function _addFilePaths(filePaths) {
  for (const fp of filePaths) {
    const name = fp.replace(/\\/g, '/').split('/').pop();
    try {
      const data = await window.electronAPI.readFile(fp);
      const ext  = (name.split('.').pop() || '').toLowerCase();

      if (data.type === 'large-image') {
        // ≥2 MB image — generate Canvas thumbnail, keep original path as ref
        let thumb = null;
        let dims  = { width: 0, height: 0 };
        try {
          const result = await generateThumbnail(data.fileUrl, 1024);
          thumb = result.dataUrl;
          dims  = result;
        } catch (e) {
          console.warn('Thumbnail failed for', name, e);
        }
        state.attachments.push({
          id:       crypto.randomUUID(),
          name,
          type:     'image',
          ext,
          content:  thumb ? thumb.split(',')[1] : null,  // JPEG thumbnail base64
          mime:     data.mime,
          size:     data.size,
          preview:  thumb,                                // data URL for chip/chat
          origPath: data.path,                            // real path for code refs
          isLarge:  true,
          width:    dims.width,
          height:   dims.height,
        });
      } else {
        state.attachments.push({
          id:       crypto.randomUUID(),
          name,
          type:     data.type === 'image' ? 'image' : _attType(name),
          ext,
          content:  data.content,
          mime:     data.mime || 'text/plain',
          size:     data.size,
          preview:  data.type === 'image' ? `data:${data.mime};base64,${data.content}` : null,
          origPath: fp,                                      // preserve path for all files
        });
      }
    } catch (err) {
      console.warn('Could not read file:', fp, err);
    }
  }
  renderAttachmentChips();
}

async function _addFolderPath(dirPath) {
  try {
    const data = await window.electronAPI.readDir(dirPath);
    state.attachments.push({
      id:    crypto.randomUUID(),
      name:  data.name + '/',
      type:  'folder',
      files: data.files,
      size:  data.totalSize,
    });
    renderAttachmentChips();
  } catch (err) {
    console.warn('Could not read folder:', dirPath, err);
  }
}

// ── Handle browser drag-and-drop (File objects from dataTransfer) ─────────────
async function _addDroppedItems(items) {
  for (const item of items) {
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry?.();
    if (!entry) continue;

    if (entry.isDirectory) {
      // Dropped a folder — use Electron IPC to read it properly
      const file = item.getAsFile();
      if (file?.path) await _addFolderPath(file.path);
    } else {
      const file = item.getAsFile();
      if (!file) continue;
      if (file.path && window.electronAPI?.readFile) {
        // Electron exposes the real path on File objects
        await _addFilePaths([file.path]);
      } else {
        // Fallback: read via FileReader (no Electron IPC)
        await _readFileObject(file);
      }
    }
  }
  renderAttachmentChips();
}

async function _readFileObject(file) {
  const ext  = (file.name.split('.').pop() || '').toLowerCase();
  const type = IMG_EXTS.has(ext) ? 'image' : _attType(file.name);

  // Large image dropped without Electron IPC — thumbnail via object URL + Canvas
  if (type === 'image' && file.size > 2 * 1024 * 1024) {
    const objUrl = URL.createObjectURL(file);
    try {
      const { dataUrl, width, height } = await generateThumbnail(objUrl, 1024);
      URL.revokeObjectURL(objUrl);
      state.attachments.push({
        id: crypto.randomUUID(), name: file.name, type: 'image', ext,
        content:  dataUrl.split(',')[1],
        mime:     file.type || `image/${ext}`,
        size:     file.size,
        preview:  dataUrl,
        isLarge:  true,
        width,
        height,
        origPath: file.path || file.name,
      });
    } catch {
      URL.revokeObjectURL(objUrl);
    }
    return;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      if (type === 'image') {
        const b64 = e.target.result.split(',')[1];
        state.attachments.push({ id: crypto.randomUUID(), name: file.name, type: 'image', ext, content: b64, mime: file.type || `image/${ext}`, size: file.size, preview: e.target.result });
      } else {
        state.attachments.push({ id: crypto.randomUUID(), name: file.name, type, ext, content: e.target.result, mime: 'text/plain', size: file.size });
      }
      resolve();
    };
    reader.onerror = resolve;
    if (type === 'image') reader.readAsDataURL(file);
    else                  reader.readAsText(file);
  });
}

// ── Render chips row ──────────────────────────────────────────────────────────
function renderAttachmentChips() {
  const row = el.attachmentRow;
  row.innerHTML = '';
  if (!state.attachments.length) { row.style.display = 'none'; return; }
  row.style.display = 'flex';

  for (const att of state.attachments) {
    const chip = document.createElement('div');
    chip.className = `att-chip att-${att.type}`;

    if (att.type === 'image') {
      const sizeLabel = att.isLarge
        ? `${_fmtSize(att.size)} · ${att.width}×${att.height} <span class="att-large-tag">thumb</span>`
        : _fmtSize(att.size);
      chip.innerHTML = `<img src="${att.preview}" class="att-thumb" alt="${att.name}"/><span class="att-name" title="${att.name}">${att.name}</span><span class="att-size">${sizeLabel}</span><button class="att-remove" title="Remove">✕</button>`;
    } else if (att.type === 'folder') {
      chip.innerHTML = `<span class="att-icon">📁</span><span class="att-name" title="${att.name}">${att.name}</span><span class="att-size">${att.files?.length || 0} files</span><button class="att-remove" title="Remove">✕</button>`;
    } else {
      const icon = att.type === 'code' ? '📄' : '📎';
      chip.innerHTML = `<span class="att-icon">${icon}</span><span class="att-name" title="${att.name}">${att.name}</span><span class="att-size">${_fmtSize(att.size)}</span><button class="att-remove" title="Remove">✕</button>`;
    }

    chip.querySelector('.att-remove').addEventListener('click', () => {
      state.attachments = state.attachments.filter(a => a.id !== att.id);
      renderAttachmentChips();
    });
    row.appendChild(chip);
  }
}

// ── Build attachment context for LLM ─────────────────────────────────────────
function buildAttachmentContext(attachments) {
  const nonImages = attachments.filter(a => a.type !== 'image');
  const images    = attachments.filter(a => a.type === 'image');

  if (!nonImages.length && !images.length) return null;

  let ctx = '## Attached Files\n\n';

  // ALL image metadata — the LLM sees each image visually above; path lets it
  // reference the file in generated code (e.g. <img src> in email signatures).
  for (const img of images) {
    ctx += `### 🖼️ Image: \`${img.name}\`\n`;
    if (img.origPath) ctx += `- **Original path**: \`${img.origPath}\`\n`;
    if (img.width)    ctx += `- **Dimensions**: ${img.width}×${img.height} px\n`;
    ctx += `- **File size**: ${_fmtSize(img.size)}\n`;
    if (img.isLarge)  ctx += `- A compressed thumbnail is provided for visual context above.\n`;
    ctx += `- To embed this image in HTML use: \`<img src="${img.origPath || img.name}">\`\n`;
    ctx += `- To embed inline (portable): base64-encode the file and use a data URI.\n\n`;
  }

  for (const att of nonImages) {
    if (att.type === 'folder') {
      ctx += `### 📁 Folder: \`${att.name}\`\n`;
      ctx += `File tree (${att.files?.length || 0} files):\n\`\`\`\n`;
      ctx += (att.files || []).map(f => f.path).join('\n');
      ctx += '\n```\n\n';
      for (const f of (att.files || [])) {
        const lang = f.path.split('.').pop() || '';
        ctx += `**\`${f.path}\`**\n\`\`\`${lang}\n${f.content}\n\`\`\`\n\n`;
      }
    } else {
      ctx += `### 📄 \`${att.name}\`\n\`\`\`${att.ext || ''}\n${att.content}\n\`\`\`\n\n`;
    }
  }
  return ctx.trim();
}

// ── Build multimodal content array (images + text) ────────────────────────────
function buildMultimodalContent(text, attachments) {
  // Only include images that have content (thumbnails or small base64)
  const images = attachments.filter(a => a.type === 'image' && a.content);
  if (!images.length) return text;   // plain string is fine for text-only

  const parts = [{ type: 'text', text }];
  for (const img of images) {
    // Large images were thumbnailed as JPEG — use image/jpeg for those
    const mime = img.isLarge ? 'image/jpeg' : img.mime;
    parts.push({
      type:      'image_url',
      image_url: { url: `data:${mime};base64,${img.content}` },
    });
  }
  return parts;  // array content = vision message
}

// ── Drag-and-drop events ──────────────────────────────────────────────────────
function initDragDrop() {
  const wrap = document.getElementById('messages-wrap');

  wrap.addEventListener('dragenter', (e) => {
    if (e.dataTransfer.types.includes('Files')) {
      e.preventDefault();
      el.dragOverlay.classList.remove('hidden');
    }
  });
  wrap.addEventListener('dragover', (e) => {
    if (e.dataTransfer.types.includes('Files')) e.preventDefault();
  });
  wrap.addEventListener('dragleave', (e) => {
    if (!wrap.contains(e.relatedTarget)) el.dragOverlay.classList.add('hidden');
  });
  wrap.addEventListener('drop', async (e) => {
    e.preventDefault();
    el.dragOverlay.classList.add('hidden');
    const items = [...(e.dataTransfer.items || [])];
    if (items.length) await _addDroppedItems(items);
  });

  // Also allow dropping anywhere in the app window
  document.addEventListener('dragover',  (e) => e.preventDefault());
  document.addEventListener('drop',      (e) => e.preventDefault());
}

// ── Wire up upload buttons ────────────────────────────────────────────────────
function initUploadButtons() {
  el.attachFileBtn?.addEventListener('click',   () => pickFiles());
  el.attachFolderBtn?.addEventListener('click', () => pickFolder());
}

// ══════════════════════════════════════════════════════════════════════════════
// BRIDGE API
// ══════════════════════════════════════════════════════════════════════════════

async function api(path, body = null) {
  const opts = body
    ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : { method: 'GET' };
  const r = await fetch(BRIDGE + path, opts);
  return r.json();
}

async function streamChat(messages, modelCfg, onChunk, onDone, onError, signal, onToolEvent) {
  let fullText = '';
  try {
    const resp = await fetch(BRIDGE + '/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages,
        model_cfg: modelCfg,
        workspace: state.workspace || undefined,
        use_tools: true,
      }),
      signal,  // AbortController signal — undefined = no cancellation
    });
    const reader  = resp.body.getReader();
    const decoder = new TextDecoder();
    let   buf     = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop();
      for (const part of parts) {
        if (!part.startsWith('data: ')) continue;
        const json = JSON.parse(part.slice(6));
        if (json.error)            { onError(json.error); return; }
        if (json.done)             { onDone(fullText);     return; }
        if (json.text)             { fullText += json.text; onChunk(json.text, fullText); }
        if (json.tool_call)        { onToolEvent?.({ type: 'call',     ...json.tool_call });     }
        if (json.tool_result)      { onToolEvent?.({ type: 'result',   ...json.tool_result });   }
        if (json.tool_progress)    { onToolEvent?.({ type: 'progress', ...json.tool_progress }); }
        if (json.browser_screenshot) { onToolEvent?.({ type: 'screenshot', src: json.browser_screenshot }); }
        if (json.preview_navigate)   { navigatePreview(json.preview_navigate); }
      }
    }
    onDone(fullText);
  } catch (err) {
    if (err.name === 'AbortError') {
      // User clicked Stop — emit whatever we have so far (partial is fine)
      onDone(fullText);
    } else {
      onError(err.message);
    }
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// CONFIG / PERSISTENCE
// ══════════════════════════════════════════════════════════════════════════════

function loadLocalCfg() {
  try {
    const raw = localStorage.getItem('istkc_cfg');
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

function saveLocalCfg(cfg) {
  localStorage.setItem('istkc_cfg', JSON.stringify(cfg));
}

// ══════════════════════════════════════════════════════════════════════════════
// SETUP WIZARD
// ══════════════════════════════════════════════════════════════════════════════

let setupProvider = 'openai';

function populateModelSelect(selectEl, provider) {
  selectEl.innerHTML = '';
  for (const m of MODELS[provider] || []) {
    const opt = document.createElement('option');
    opt.value       = JSON.stringify(m);
    opt.textContent = m.name;
    selectEl.appendChild(opt);
  }
  const custom = document.createElement('option');
  custom.value = '__custom__';
  custom.textContent = 'Custom model ID…';
  selectEl.appendChild(custom);
}

// Show/hide the API key field depending on provider
function updateKeyVisibility(provider, keyGroupId, keyInputId, keyBtnId) {
  const needsKey = provider !== 'ollama' && provider !== 'chatgpt';
  const grp = document.getElementById(keyGroupId);
  const inp = document.getElementById(keyInputId);
  if (grp) grp.style.display = needsKey ? '' : 'none';
  if (inp) inp.required = needsKey;
  // Show/hide the ChatGPT status badge
  const badge = document.getElementById('mp-chatgpt-status');
  if (badge) badge.style.display = provider === 'chatgpt' ? '' : 'none';
}

function bindProviderGrid(gridEl, selectEl, onSelect) {
  gridEl.querySelectorAll('.provider-card').forEach(card => {
    card.addEventListener('click', () => {
      gridEl.querySelectorAll('.provider-card').forEach(c => c.classList.remove('active'));
      card.classList.add('active');
      const prov = card.dataset.provider;
      onSelect(prov);
      populateModelSelect(selectEl, prov);
    });
  });
}

function buildModelCfg(provider, apiId, apiKey, display) {
  const base = { provider, api_id: apiId, api_key: apiKey, display };
  if (provider === 'ollama') {
    // Ollama: OpenAI-compatible at localhost, no real key needed
    return { ...base, api_key: 'ollama', base_url: 'http://localhost:11434/v1' };
  }
  if (provider === 'chatgpt') {
    // ChatGPT Plus: token fetched live from Codex OAuth — no stored key
    return { ...base, api_key: '__codex__', auth_mode: 'chatgpt' };
  }
  const envVar = provider === 'openai' ? 'OPENAI_API_KEY' : 'OPENROUTER_API_KEY';
  return { ...base, env_var: envVar };
}

// Step 1 verify listeners — attached at top level so the button responds even
// if initSetup() hasn't run yet (e.g. during boot animation or on error).
el.tokenBtn.addEventListener('click', async () => {
  const token = el.tokenInput.value.trim();
  if (!token) { el.tokenError.textContent = 'Enter the team token.'; return; }
  el.tokenBtn.disabled = true;
  el.tokenBtn.textContent = 'Verifying…';
  const res = await api('/auth', { token }).catch(() => ({ ok: false, error: 'Bridge not ready.' }));
  el.tokenBtn.disabled = false;
  el.tokenBtn.textContent = 'Verify →';
  if (res.ok) {
    el.tokenError.textContent = '';
    el.stepToken.classList.add('hidden');
    el.stepModel.classList.remove('hidden');
    if (el.novaArtSetup) setFace('idle', el.novaArtSetup);
  } else {
    el.tokenError.textContent = res.error === 'Bridge not ready.'
      ? '✕  Could not reach server. Is NOVA starting?'
      : '✕  Invalid token. Ask your IT admin.';
    if (el.novaArtSetup) {
      el.novaArtSetup.textContent = NOVA_FACES.blink;
      setTimeout(() => setFace('idle', el.novaArtSetup), 800);
    }
  }
});
el.tokenInput.addEventListener('keydown', e => { if (e.key === 'Enter') el.tokenBtn.click(); });

function initSetup() {
  populateModelSelect(el.modelSelect, 'openai');

  // Update key field visibility when provider changes
  bindProviderGrid(el.providerGrid, el.modelSelect, (p) => {
    setupProvider = p;
    updateKeyVisibility(p, 'key-group', 'key-input', 'key-btn');
  });

  // Step 2: connect API key (or Ollama — no key needed)
  el.keyBtn.addEventListener('click', async () => {
    const selected = el.modelSelect.value;
    let modelMeta, apiId;
    if (selected === '__custom__') {
      apiId     = prompt('Enter model ID (e.g. anthropic/claude-sonnet-4-5):');
      if (!apiId) return;
      modelMeta = { id: apiId, name: apiId, api_id: apiId };
    } else {
      modelMeta = JSON.parse(selected);
      apiId     = modelMeta.api_id;
    }

    const apiKey = setupProvider === 'ollama' ? 'ollama' : el.keyInput.value.trim();
    if (!apiKey && setupProvider !== 'ollama') { el.keyError.textContent = 'Enter your API key.'; return; }

    const cfg = buildModelCfg(setupProvider, apiId, apiKey, modelMeta.name);

    el.keyBtn.disabled = true; el.keyBtn.textContent = 'Connecting…';
    const res = await api('/model/validate', cfg).catch(() => ({ ok: false, error: 'Bridge unreachable.' }));
    el.keyBtn.disabled = false; el.keyBtn.textContent = 'Connect →';

    if (res.ok) {
      state.modelCfg = cfg;
      saveLocalCfg({ model_cfg: cfg });
      await api('/config', { model_cfg: cfg });
      el.keyError.textContent = '';
      el.stepModel.classList.add('hidden');
      el.stepReady.classList.remove('hidden');
      setFace('done', el.novaArtSetup);
    } else {
      el.keyError.textContent = `✕  ${res.error || 'API key rejected.'}`;
      setFace('blink', el.novaArtSetup);
      setTimeout(() => setFace('idle', el.novaArtSetup), 800);
    }
  });
  el.keyInput.addEventListener('keydown', e => { if (e.key === 'Enter') el.keyBtn.click(); });

  el.enterBtn.addEventListener('click', () => launchApp());
}

// ══════════════════════════════════════════════════════════════════════════════
// CHAT
// ══════════════════════════════════════════════════════════════════════════════

function timestamp() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ══════════════════════════════════════════════════════════════════════════════
// CODE RENDERING  (syntax highlighting, copy & apply buttons)
// ══════════════════════════════════════════════════════════════════════════════

function escapeHtml(s) {
  return String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// Try to detect a file path from the first comment line of a code block
// e.g. "# src/main.py"  or  "// app/server.js"
function extractFilePath(code) {
  const first = (code.split('\n')[0] || '').trim();
  const m = first.match(/^(?:\/\/|#|\/\*)\s*([\w./@\\-]+\.\w{1,10})\s*(?:\*\/)?$/);
  return m ? m[1] : null;
}

let _cbIdx = 0;

function renderCodeBlock(code, lang) {
  const id       = `cb${_cbIdx++}`;
  const filePath = extractFilePath(code);
  const langLbl  = escapeHtml(lang || 'text');

  let highlighted = escapeHtml(code);
  if (window.hljs) {
    try {
      highlighted = lang && window.hljs.getLanguage(lang)
        ? window.hljs.highlight(code, { language: lang }).value
        : window.hljs.highlightAuto(code).value;
    } catch { highlighted = escapeHtml(code); }
  }

  const applyHtml = filePath
    ? `<button class="code-btn apply-btn" data-code-id="${id}" data-filepath="${escapeHtml(filePath)}">Apply → ${escapeHtml(filePath)}</button>`
    : `<button class="code-btn save-btn"  data-code-id="${id}">Save to file…</button>`;

  return `<div class="code-block" id="${id}-wrap">
  <div class="code-block-hdr">
    <span class="code-lang-tag">${langLbl}</span>
    <div class="code-actions">${applyHtml}<button class="code-btn copy-btn" data-code-id="${id}">Copy</button></div>
  </div>
  <pre class="code-pre"><code id="${id}" class="hljs">${highlighted}</code></pre>
</div>`;
}

function renderMarkdown(text) {
  if (!text) return '';

  const blocks = [];  // stores extracted code blocks + table HTML so they aren't escaped

  // 1. Extract fenced code blocks
  let out = text.replace(/```([^\n`]*)\n?([\s\S]*?)```/g, (_, rawLang, code) => {
    const lang = rawLang.trim().split(/\s/)[0];
    blocks.push({ type: 'code', lang, code: code.replace(/\n$/, '') });
    return `\x01BK${blocks.length - 1}\x01`;
  });

  // 2. Extract Markdown tables (before HTML-escaping so | survives)
  //    Pattern: header row | separator row (|---|) | one or more data rows
  out = out.replace(
    /^(\|.+\|\r?\n\|[\s|:-]+\|\r?\n(?:\|.+\|\r?\n?)+)/gm,
    (match) => {
      const lines = match.trim().split(/\r?\n/);
      const parseRow = (row) =>
        row.split('|').slice(1, -1).map(c => c.trim());   // drop first/last empty parts
      const headers = parseRow(lines[0])
        .map(h => `<th>${escapeHtml(h)}</th>`).join('');
      const dataRows = lines.slice(2).map(row =>
        `<tr>${parseRow(row).map(d => `<td>${escapeHtml(d)}</td>`).join('')}</tr>`
      ).join('');
      const html = `<div class="md-table-wrap"><table class="md-table"><thead><tr>${headers}</tr></thead><tbody>${dataRows}</tbody></table></div>`;
      blocks.push({ type: 'html', html });
      return `\x01BK${blocks.length - 1}\x01`;
    }
  );

  // 3. HTML-escape remaining text
  out = out.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');

  // 4. Inline markdown
  out = out
    .replace(/\*\*\*(.+?)\*\*\*/gs, '<strong><em>$1</em></strong>')
    .replace(/\*\*(.+?)\*\*/gs,     '<strong>$1</strong>')
    .replace(/\*(.+?)\*/gs,         '<em>$1</em>')
    .replace(/`([^`]+)`/g,          '<code class="inline-code">$1</code>')
    .replace(/^###### (.+)$/gm,     '<h6 class="md-h">$1</h6>')
    .replace(/^##### (.+)$/gm,      '<h5 class="md-h">$1</h5>')
    .replace(/^#### (.+)$/gm,       '<h4 class="md-h">$1</h4>')
    .replace(/^### (.+)$/gm,        '<h3 class="md-h">$1</h3>')
    .replace(/^## (.+)$/gm,         '<h2 class="md-h">$1</h2>')
    .replace(/^# (.+)$/gm,          '<h1 class="md-h">$1</h1>')
    .replace(/^&gt; (.+)$/gm,       '<blockquote class="md-blockquote">$1</blockquote>')
    .replace(/^(?:---+|\*\*\*+)$/gm,'<hr class="md-hr">');

  // 5. Group list items into <ul>/<ol> elements (process line by line)
  out = _groupLists(out);

  // 6. Convert double newlines to paragraph breaks; single newline to <br>
  out = out
    .replace(/\n\n+/g, '</p><p class="md-p">')
    .replace(/\n/g,    '<br>');

  // 7. Restore extracted blocks
  out = out.replace(/\x01BK(\d+)\x01/g, (_, i) => {
    const b = blocks[+i];
    if (b.type === 'code') return renderCodeBlock(b.code, b.lang);
    if (b.type === 'html') return b.html;
    return '';
  });

  return out;
}

// Collapse consecutive list lines into proper <ul>/<ol> elements
function _groupLists(text) {
  const lines  = text.split('\n');
  const result = [];
  let mode     = null;   // null | 'ul' | 'ol'

  for (const line of lines) {
    const ul = line.match(/^[-*•] (.+)$/);
    const ol = line.match(/^\d+\. (.+)$/);

    if (ul) {
      if (mode !== 'ul') {
        if (mode === 'ol') result.push('</ol>');
        result.push('<ul class="md-ul">');
        mode = 'ul';
      }
      result.push(`<li>${ul[1]}</li>`);
    } else if (ol) {
      if (mode !== 'ol') {
        if (mode === 'ul') result.push('</ul>');
        result.push('<ol class="md-ol">');
        mode = 'ol';
      }
      result.push(`<li>${ol[1]}</li>`);
    } else {
      if (mode === 'ul') { result.push('</ul>'); mode = null; }
      if (mode === 'ol') { result.push('</ol>'); mode = null; }
      result.push(line);
    }
  }
  if (mode === 'ul') result.push('</ul>');
  if (mode === 'ol') result.push('</ol>');

  return result.join('\n');
}

// Event delegation for copy / apply / save buttons inside .messages
function initCodeBlockEvents() {
  el.messages.addEventListener('click', async (e) => {

    // ── Copy button ──────────────────────────────────────────────────────────
    const copyBtn = e.target.closest('.copy-btn');
    if (copyBtn) {
      const id   = copyBtn.dataset.codeId;
      const code = document.getElementById(id)?.textContent || '';
      try {
        await navigator.clipboard.writeText(code);
        copyBtn.textContent = '✓ Copied';
        copyBtn.classList.add('copied');
        setTimeout(() => { copyBtn.textContent = 'Copy'; copyBtn.classList.remove('copied'); }, 1800);
      } catch { copyBtn.textContent = '✕ Failed'; }
      return;
    }

    // ── Apply-to-file button ─────────────────────────────────────────────────
    const applyBtn = e.target.closest('.apply-btn');
    if (applyBtn) {
      const id       = applyBtn.dataset.codeId;
      const filePath = applyBtn.dataset.filepath;
      const code     = document.getElementById(id)?.textContent || '';
      await initiateFileApply(filePath, code);
      return;
    }

    // ── Save-to-file button (no known path) ──────────────────────────────────
    const saveBtn = e.target.closest('.save-btn');
    if (saveBtn) {
      const id   = saveBtn.dataset.codeId;
      const code = document.getElementById(id)?.textContent || '';
      const fp   = await window.electronAPI?.saveFileDialog({});
      if (fp) await initiateFileApply(fp, code);
    }
  });
}

async function initiateFileApply(filePath, newContent) {
  let oldContent = '';
  try {
    const data = await window.electronAPI?.readFile(filePath);
    if (data?.type === 'text') oldContent = data.content;
  } catch {}
  showDiffOverlay(filePath, oldContent, newContent, async () => {
    const r = await window.electronAPI?.writeFile(filePath, newContent);
    addMessage('system-note', r?.ok
      ? `✓ Written: ${filePath}`
      : `✕ Write failed: ${r?.error || 'unknown error'}`);
  });
}

// ══════════════════════════════════════════════════════════════════════════════
// DIFF ENGINE
// ══════════════════════════════════════════════════════════════════════════════

// Myers-style line diff — returns array of {type:'equal'|'insert'|'delete', line}
function diffLines(oldText, newText) {
  const a = (oldText || '').split('\n');
  const b = (newText || '').split('\n');
  const m = a.length, n = b.length;

  // LCS table (clamp size for very large files)
  if (m * n > 800_000) {
    // Fallback: just show everything as new
    return [
      ...a.map(l => ({ type: 'delete', line: l })),
      ...b.map(l => ({ type: 'insert', line: l })),
    ];
  }

  const dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = a[i] === b[j] ? dp[i+1][j+1] + 1 : Math.max(dp[i+1][j], dp[i][j+1]);

  const result = [];
  let i = 0, j = 0;
  while (i < m || j < n) {
    if (i < m && j < n && a[i] === b[j]) {
      result.push({ type: 'equal',  line: a[i++] }); j++;
    } else if (j < n && (i >= m || dp[i][j+1] >= dp[i+1][j])) {
      result.push({ type: 'insert', line: b[j++] });
    } else {
      result.push({ type: 'delete', line: a[i++] });
    }
  }
  return result;
}

let _diffConfirmCb = null;

function showDiffOverlay(filePath, oldContent, newContent, onConfirm) {
  _diffConfirmCb = onConfirm;

  const hunks   = diffLines(oldContent, newContent);
  const overlay = document.getElementById('diff-overlay');
  const body    = document.getElementById('diff-body');
  const fp      = document.getElementById('diff-filepath');

  fp.textContent = filePath || '(unsaved file)';

  // Render diff lines
  let html = '';
  for (const h of hunks) {
    const cls = h.type === 'insert' ? 'diff-add' : h.type === 'delete' ? 'diff-del' : 'diff-eq';
    const pfx = h.type === 'insert' ? '+' : h.type === 'delete' ? '-' : ' ';
    html += `<div class="diff-line ${cls}"><span class="diff-prefix">${pfx}</span>${escapeHtml(h.line)}</div>`;
  }
  if (!html) html = '<div class="diff-line diff-eq"><span class="diff-prefix"> </span>(no changes)</div>';
  body.innerHTML = html;
  overlay.classList.remove('hidden');

  // Count changes
  const adds = hunks.filter(h => h.type === 'insert').length;
  const dels = hunks.filter(h => h.type === 'delete').length;
  document.getElementById('diff-title').textContent =
    `📝 Review Changes  (+${adds} / -${dels} lines)`;
}

function hideDiffOverlay() {
  document.getElementById('diff-overlay').classList.add('hidden');
  _diffConfirmCb = null;
}

// Wire up diff overlay buttons (called once at boot)
function initDiffOverlay() {
  document.getElementById('diff-confirm-btn').addEventListener('click', async () => {
    const cb = _diffConfirmCb;
    hideDiffOverlay();
    if (cb) await cb();
  });
  document.getElementById('diff-cancel-btn').addEventListener('click', hideDiffOverlay);
  document.getElementById('diff-close-x').addEventListener('click',    hideDiffOverlay);
}

// ══════════════════════════════════════════════════════════════════════════════
// SESSION RESTORE
// ══════════════════════════════════════════════════════════════════════════════

async function loadSessionsList() {
  const res = await api('/sessions').catch(() => ({ sessions: [] }));
  renderSessionsList(res.sessions || []);
}

function renderSessionsList(sessions, isSearch = false) {
  const list = el.sessionsList;
  list.innerHTML = '';
  if (!sessions.length) {
    list.innerHTML = '<div style="font-size:11px;color:var(--text-3);padding:4px 8px">No past sessions</div>';
    return;
  }

  // Pinned sessions float to top (skip re-sort for search results)
  const sorted = isSearch ? sessions : [
    ...sessions.filter(s => _pinnedSessions.has(s.file)),
    ...sessions.filter(s => !_pinnedSessions.has(s.file)),
  ];

  for (const s of sorted) {
    const div = document.createElement('div');
    const isPinned = _pinnedSessions.has(s.file);
    div.className = `session-item${isPinned ? ' pinned' : ''}`;
    div.dataset.file = s.file;

    const ts = s.stem?.slice(0, 15)?.replace('_', ' ') || '';
    div.innerHTML = `
      <div class="sess-top-row">
        <div class="sess-preview">${escapeHtml(s.preview || '(empty session)')}</div>
        <button class="sess-pin-btn${isPinned ? ' pinned' : ''}" title="${isPinned ? 'Unpin' : 'Pin session'}">★</button>
      </div>
      <div class="sess-meta">${ts} · ${s.count} msg${s.count !== 1 ? 's' : ''}</div>`;

    div.querySelector('.sess-pin-btn').addEventListener('click', (e) => {
      e.stopPropagation();
      if (_pinnedSessions.has(s.file)) _pinnedSessions.delete(s.file);
      else                              _pinnedSessions.add(s.file);
      _savePinned();
      loadSessionsList();
    });
    div.addEventListener('click', () => restoreSession(s.file, div));
    list.appendChild(div);
  }
}

async function restoreSession(file, itemEl) {
  if (!confirm(`Restore this session? Current chat will be cleared.`)) return;
  const res = await api(`/session?file=${encodeURIComponent(file)}`).catch(() => null);
  if (!res?.messages) { addMessage('system-note', 'Could not load session.'); return; }

  // Clear current chat
  state.messages = [];
  el.messages.innerHTML = '';

  // Replay messages
  for (const m of res.messages) {
    state.messages.push(m);
    const role    = m.role === 'user' ? 'user' : 'nova';
    const content = typeof m.content === 'string' ? m.content
                  : (m.content.find?.(p => p.type === 'text')?.text || '[multimodal message]');
    addMessage(role, content);
  }

  addMessage('system-note', `Session restored from ${file}`);

  // Mark active
  document.querySelectorAll('.session-item').forEach(el => el.classList.remove('active'));
  itemEl?.classList.add('active');
  el.messages.parentElement.scrollTop = el.messages.parentElement.scrollHeight;
}

// ══════════════════════════════════════════════════════════════════════════════
// TERMINAL PANE
// ══════════════════════════════════════════════════════════════════════════════

let termCwd   = '';
let termCmdId = null;
const termHistory = [];
let termHistIdx   = -1;

async function initTerminal() {
  termCwd = (await window.electronAPI?.homeDir?.()) || '.';
  updateTermCwd();

  // Command output routing
  window.electronAPI?.onCmdOut?.((data) => {
    if (data.id !== termCmdId) return;
    if (data.type === 'out')  appendTermLine(data.data, 'out');
    if (data.type === 'err')  appendTermLine(data.data, 'err');
    if (data.type === 'exit') {
      const ok = data.code === 0;
      appendTermLine(`\n[exit ${data.code}]\n`, ok ? 'exit-ok' : 'exit-err');
      termCmdId = null;
      document.getElementById('term-kill-btn').style.display = 'none';
    }
    if (data.type === 'error') {
      appendTermLine(`Error: ${data.data}\n`, 'err');
      termCmdId = null;
    }
  });

  // Input handling
  const input  = document.getElementById('term-input');
  const sendFn = () => {
    const cmd = input.value.trim();
    if (!cmd) return;
    input.value = '';
    termHistory.unshift(cmd);
    termHistIdx = -1;
    runInTerminal(cmd);
  };

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter')     { sendFn(); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); input.value = termHistory[++termHistIdx] || ''; }
    if (e.key === 'ArrowDown') { e.preventDefault(); termHistIdx = Math.max(-1, termHistIdx - 1); input.value = termHistory[termHistIdx] || ''; }
  });
  document.getElementById('term-send-btn').addEventListener('click', sendFn);
  document.getElementById('term-clear-btn').addEventListener('click', () => { document.getElementById('term-output').innerHTML = ''; });
  document.getElementById('term-kill-btn').addEventListener('click', () => {
    if (termCmdId) window.electronAPI?.killCommand?.(termCmdId);
  });
  document.getElementById('term-close-btn').addEventListener('click', toggleTerminal);
}

function toggleTerminal() {
  const pane = document.getElementById('terminal-pane');
  pane.classList.toggle('hidden');
  if (!pane.classList.contains('hidden')) {
    document.getElementById('term-input').focus();
  }
}

function updateTermCwd() {
  const cwd = document.getElementById('term-cwd');
  if (cwd) cwd.textContent = termCwd;
}

function appendTermLine(text, type) {
  const out = document.getElementById('term-output');
  if (!out) return;
  const cls = `term-line-${type}`;
  // Split on newlines but keep content
  const lines = text.split(/(\n)/);
  for (const seg of lines) {
    if (seg === '\n') {
      out.appendChild(document.createElement('br'));
    } else if (seg) {
      const span = document.createElement('span');
      span.className = cls;
      span.textContent = seg;
      out.appendChild(span);
    }
  }
  out.scrollTop = out.scrollHeight;
}

async function runInTerminal(cmd) {
  // Special: cd command — update tracked cwd
  if (cmd.match(/^cd\s/i) || cmd === 'cd') {
    const target = cmd.slice(3).trim() || (await window.electronAPI?.homeDir?.()) || '.';
    try {
      termCwd = await window.electronAPI?.resolvePath?.(termCwd, target) || target;
    } catch { termCwd = target; }
    updateTermCwd();
    appendTermLine(`\n`, 'out');
    return;
  }

  appendTermLine(`\n$ ${cmd}\n`, 'sys');
  const id = crypto.randomUUID();
  termCmdId = id;
  document.getElementById('term-kill-btn').style.display = '';

  const result = await window.electronAPI?.runCommand?.({ cmd, cwd: termCwd, id });
  if (!result?.ok) {
    appendTermLine(`Failed to start: ${result?.error || 'unknown'}\n`, 'err');
    termCmdId = null;
    document.getElementById('term-kill-btn').style.display = 'none';
  }
}

// ══════════════════════════════════════════════════════════════════════════════
// AUTOCOMPLETE  (slash commands + @ file mentions)
// ══════════════════════════════════════════════════════════════════════════════

let _acSelected = 0;
let _acItems    = [];
let _acMode     = null;   // 'slash' | 'mention'

function initAutocomplete() {
  const input = el.msgInput;
  const drop  = document.getElementById('autocomplete-drop');

  input.addEventListener('input', () => {
    const val = input.value;
    const pos = input.selectionStart;
    const before = val.slice(0, pos);

    // Slash command autocomplete (only at very start of line)
    if (/^\/(\w*)$/.test(before)) {
      const prefix = before.slice(1).toLowerCase();
      _acMode  = 'slash';
      // Store the display-ready objects directly so the keyboard handler can read .value/.label
      _acItems = COMMANDS
        .filter(c => c.cmd.slice(1).startsWith(prefix))
        .map(c => ({ label: c.cmd, secondary: c.desc, icon: c.icon, value: c.cmd }));
      renderAutocomplete(drop, _acItems);
      return;
    }

    // @ file mention
    const mentionMatch = before.match(/@([\w./\\-]*)$/);
    if (mentionMatch) {
      const prefix = mentionMatch[1].toLowerCase();
      _acMode  = 'mention';
      // Suggest from recently attached files + typed prefix
      const recentFiles = state.attachments.map(a => a.name).filter(n => n.toLowerCase().includes(prefix));
      _acItems = recentFiles.slice(0, 8).map(n => ({ label: n, secondary: 'recently attached', icon: '📄', value: n }));
      if (_acItems.length) {
        renderAutocomplete(drop, _acItems);
        return;
      }
    }

    hideAutocomplete();
  });

  input.addEventListener('keydown', (e) => {
    if (drop.classList.contains('hidden')) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); moveAcSelection(1); }
    if (e.key === 'ArrowUp')   { e.preventDefault(); moveAcSelection(-1); }
    if (e.key === 'Enter' || e.key === 'Tab') {
      const item = _acItems[_acSelected];
      if (item) {
        e.preventDefault();
        const val = item.value || item.label;
        if (_acMode === 'slash') {
          // Slash command: send immediately, don't just fill the input
          hideAutocomplete();
          el.msgInput.value = '';
          el.charCount.textContent = '';
          autoResize();
          sendMessage(val);
        } else {
          // Mention / other: fill only, let user keep composing
          applyAutocomplete(val);
        }
      }
    }
    if (e.key === 'Escape') hideAutocomplete();
  });

  // Click outside to close
  document.addEventListener('click', (e) => {
    if (!drop.contains(e.target) && e.target !== input) hideAutocomplete();
  });
}

function renderAutocomplete(drop, items) {
  if (!items.length) { hideAutocomplete(); return; }
  _acSelected = 0;
  drop.innerHTML = '';
  items.forEach((item, i) => {
    const div = document.createElement('div');
    div.className = `ac-item${i === 0 ? ' selected' : ''}`;
    div.innerHTML = `<span class="ac-icon">${item.icon || '◈'}</span><span class="ac-cmd">${escapeHtml(item.label)}</span><span class="ac-desc">${escapeHtml(item.secondary || '')}</span>`;
    div.addEventListener('mousedown', (e) => { e.preventDefault(); applyAutocomplete(item.value || item.label); });
    drop.appendChild(div);
  });
  drop.classList.remove('hidden');
}

function moveAcSelection(dir) {
  const items = document.querySelectorAll('#autocomplete-drop .ac-item');
  items[_acSelected]?.classList.remove('selected');
  _acSelected = Math.max(0, Math.min(items.length - 1, _acSelected + dir));
  items[_acSelected]?.classList.add('selected');
}

function hideAutocomplete() {
  document.getElementById('autocomplete-drop').classList.add('hidden');
  _acMode = null; _acItems = []; _acSelected = 0;
}

function applyAutocomplete(value) {
  if (_acMode === 'slash') {
    el.msgInput.value = value + ' ';
  } else if (_acMode === 'mention') {
    // Replace the @prefix with the selected filename
    const cur = el.msgInput.value;
    el.msgInput.value = cur.replace(/@[\w./\\-]*$/, `@${value} `);
  }
  hideAutocomplete();
  el.msgInput.focus();
}

// ══════════════════════════════════════════════════════════════════════════════
// AGENT EXECUTION LOOP  (real file-editing agent)
// ══════════════════════════════════════════════════════════════════════════════

async function executeAgentBrief(brief) {
  closePanel('brief-panel');
  const filesToEdit = brief.files || [];

  if (!filesToEdit.length) {
    addMessage('nova',
      `I've built the task brief but found no specific files to edit yet.\n\n` +
      `**Task:** ${brief.task}\n\n` +
      `Tell me which files to create or modify and I'll apply the changes directly.`);
    return;
  }

  addMessage('system-note', `⚡ Agent starting — ${filesToEdit.length} file(s) to process`);
  startThinkAnimation();

  for (let fi = 0; fi < filesToEdit.length; fi++) {
    const filePath = filesToEdit[fi];
    addMessage('system-note', `📄 [${fi+1}/${filesToEdit.length}] Reading: ${filePath}`);

    // Read current content
    let currentContent = '';
    try {
      const data = await window.electronAPI?.readFile(filePath);
      if (data?.type === 'text') currentContent = data.content;
    } catch {}

    // Ask the model to write the new version
    const ctxLines = (brief.context || []).map(c => `- ${c}`).join('\n');
    const prompt = `You are implementing this coding task:\n\n**Task:** ${brief.task}\n\n**Context:**\n${ctxLines}\n\n` +
      `**Current content of \`${filePath}\`:**\n\`\`\`\n${currentContent.slice(0, 8000)}\n\`\`\`\n\n` +
      `Write the COMPLETE new version of \`${filePath}\`. ` +
      `Return ONLY the file content — no markdown fences, no explanation, no comments about what you changed.`;

    const agentCard = addMessage('nova', `Writing \`${filePath}\`…`, { cursor: true });
    let newContent  = '';

    await new Promise((resolve) => {
      streamChat(
        [{ role: 'system', content: buildSystemPrompt() }, { role: 'user', content: prompt }],
        state.modelCfg,
        (_chunk, acc) => {
          newContent = acc;
          updateLastMessage(agentCard,
            `**Writing \`${filePath}\`…**\n\`\`\`${filePath.split('.').pop()}\n${acc.slice(0, 300)}${acc.length > 300 ? '\n…' : ''}\n\`\`\``,
            false);
        },
        (final) => { newContent = final; resolve(); },
        (err)   => { addMessage('system-note', `Agent error: ${err}`); resolve(); }
      );
    });

    updateLastMessage(agentCard, `New version of \`${filePath}\` ready — review diff below.`, true);

    // Show diff and wait for user to confirm before continuing
    await new Promise((resolve) => {
      showDiffOverlay(filePath, currentContent, newContent, async () => {
        const r = await window.electronAPI?.writeFile(filePath, newContent);
        addMessage('system-note', r?.ok ? `✓ Written: ${filePath}` : `✕ Failed: ${r?.error}`);
        resolve();
      });
      // Also resolve if user cancels
      const origHide = hideDiffOverlay;
      document.getElementById('diff-cancel-btn')._agentResolve = resolve;
      document.getElementById('diff-close-x')._agentResolve    = resolve;
    });
  }

  showDoneFlash();
  state.streaming = false;
  el.sendBtn.disabled = false;

  addMessage('nova',
    `Agent complete! Processed **${filesToEdit.length}** file(s) for:\n\n> ${brief.task}\n\n` +
    `Would you like me to run tests, review the changes, or continue with anything else?`);
}

function addMessage(role, content, opts = {}) {
  const card = document.createElement('div');
  card.className = `msg-card ${role}`;
  if (opts.id) card.id = opts.id;

  if (role !== 'system-note') {
    const sender = role === 'nova' ? 'NOVA' : 'You';

    // Build attachment preview HTML (images + file chips)
    let attHtml = '';
    if (opts.attachments?.length) {
      const imgs  = opts.attachments.filter(a => a.type === 'image');
      const files = opts.attachments.filter(a => a.type !== 'image');
      if (imgs.length || files.length) {
        attHtml = '<div class="msg-attachments">';
        for (const img of imgs) {
          const dimLabel = img.isLarge && img.width
            ? ` · ${img.width}×${img.height} (thumbnail)` : '';
          attHtml += `<img src="${img.preview}" class="msg-att-img" alt="${img.name}" title="${img.name}${dimLabel}" onclick="this.requestFullscreen?.()"/>`;
          if (img.isLarge) {
            attHtml += `<div class="msg-att-large-tag">⬆ ${_fmtSize(img.size)} original · thumbnail shown to AI</div>`;
          }
        }
        for (const f of files) {
          const icon = f.type === 'folder' ? '📁' : '📄';
          const label = f.type === 'folder' ? `${f.name} (${f.files?.length || 0} files)` : `${f.name} · ${_fmtSize(f.size)}`;
          attHtml += `<div class="msg-att-file">${icon} ${label}</div>`;
        }
        attHtml += '</div>';
      }
    }

    card.innerHTML = `
      <div class="msg-meta">
        <span class="msg-sender">${sender}</span>
        <span class="msg-time">${timestamp()}</span>
        <button class="msg-copy-btn" title="Copy message">⊡</button>
      </div>
      ${attHtml}
      <div class="msg-body"><div class="msg-text">${renderMarkdown(content)}${opts.cursor ? '<span class="cursor-blink"></span>' : ''}</div></div>`;

    // Copy button — reads rendered text content at click time (works with streaming)
    card.querySelector('.msg-copy-btn').addEventListener('click', async (e) => {
      e.stopPropagation();
      const btn  = e.currentTarget;
      const text = card.querySelector('.msg-text')?.innerText || '';
      try {
        await navigator.clipboard.writeText(text);
        btn.textContent = '✓';
        btn.classList.add('copied');
        setTimeout(() => { btn.textContent = '⊡'; btn.classList.remove('copied'); }, 1600);
      } catch { btn.textContent = '✕'; setTimeout(() => { btn.textContent = '⊡'; }, 1200); }
    });
  } else {
    card.textContent = content;
  }

  el.messages.appendChild(card);
  el.messages.parentElement.scrollTop = el.messages.parentElement.scrollHeight;
  return card;
}

function updateLastMessage(card, text, done = false) {
  const body = card.querySelector('.msg-body');
  if (!body) return;
  // Update only the text area — preserves any tool-row elements inside .msg-body
  let textEl = body.querySelector('.msg-text');
  if (!textEl) {
    textEl = document.createElement('div');
    textEl.className = 'msg-text';
    body.insertBefore(textEl, body.firstChild);
  }
  textEl.innerHTML = renderMarkdown(text) + (done ? '' : '<span class="cursor-blink"></span>');
  el.messages.parentElement.scrollTop = el.messages.parentElement.scrollHeight;
}

async function sendMessage(text) {
  if (state.streaming || (!text.trim() && !state.attachments.length)) return;

  // Handle slash commands (attachments not relevant for commands)
  const trimmed = text.trim();
  if (trimmed.startsWith('/') && !state.attachments.length) { handleCommand(trimmed); return; }

  // Snapshot attachments, then clear them
  const attachments = [...state.attachments];
  state.attachments = [];
  renderAttachmentChips();

  // Build display content and message content
  const displayText  = trimmed || '(see attached files)';
  const attCtx       = buildAttachmentContext(attachments);
  const userText     = attCtx ? `${trimmed}\n\n${attCtx}` : trimmed || '(see attached files)';
  const msgContent   = buildMultimodalContent(userText, attachments);

  state.messages.push({ role: 'user', content: msgContent });

  // Render user card with optional image previews
  const userCard = addMessage('user', displayText, { attachments });

  // Update context meter after adding the user message
  updateContextMeter();

  state.streaming = true;

  // Switch send-btn to stop mode
  _abortCtrl = new AbortController();
  el.sendBtn.disabled = false;   // keep clickable so user can stop
  el.sendBtn.classList.add('stop-mode');
  el.sendBtn.title = 'Stop generation';
  el.sendBtn.onclick = () => { _abortCtrl?.abort(); };

  startThinkAnimation();

  const novaCard = addMessage('nova', '', { cursor: true });

  try {
    const sysPrompt   = buildSystemPrompt();

    // Optionally inject RAG context for the current query
    const ragContext  = await fetchRagContext(trimmed);
    const fullSys     = ragContext ? sysPrompt + ragContext : sysPrompt;

    const apiMessages = [
      { role: 'system', content: fullSys },
      ...state.messages,
    ];

    // Pick the right model tier for this message
    const chosenModel = routeModel(trimmed, 'auto');
    showRoutedBadge(chosenModel);

    await streamChat(
      apiMessages,
      chosenModel,
      (_chunk, accumulated) => updateLastMessage(novaCard, accumulated, false),
      (final) => {
        updateLastMessage(novaCard, final, true);
        state.messages.push({ role: 'assistant', content: final });
        updateContextMeter();
        _lastNovaCard = novaCard;
        attachRetryButton(novaCard);
        finishResponse();
      },
      (err) => {
        updateLastMessage(novaCard, `⚠ ${err}`, true);
        // On error: still attach retry so user can try again
        _lastNovaCard = novaCard;
        attachRetryButton(novaCard);
        finishResponse();
      },
      _abortCtrl.signal,
      (toolEvt) => renderToolEvent(novaCard, toolEvt)
    );
  } catch (err) {
    updateLastMessage(novaCard, `Connection error: ${err.message}`, true);
    finishResponse();
  }
}

function finishResponse() {
  // Clear abort controller and restore send button
  _abortCtrl = null;
  el.sendBtn.classList.remove('stop-mode');
  el.sendBtn.onclick = null;
  el.sendBtn.title   = 'Send  (Enter)';
  el.sendBtn.disabled = false;
  state.streaming = false;
  showDoneFlash();
  el.msgInput.focus();
}

// ── Tool call inline rendering ────────────────────────────────────────────────
function renderToolEvent(card, evt) {
  const body = card.querySelector('.msg-body');
  if (!body) return;

  // Dedicated container for tool rows — lives after .msg-text so updateLastMessage doesn't wipe it
  let toolContainer = body.querySelector('.tool-rows');
  if (!toolContainer) {
    toolContainer = document.createElement('div');
    toolContainer.className = 'tool-rows';
    body.appendChild(toolContainer);
  }

  if (evt.type === 'call') {
    const TOOL_ICONS = {
      read_file:          '📄',
      list_directory:     '📁',
      run_command:        '⚙',
      write_file:         '💾',
      search_code:        '🔍',
      create_document:    '📝',
      reload_skills:      '🔄',
      browser_open:       '🌐',
      browser_screenshot: '📸',
      browser_read:       '📖',
      browser_click:      '🖱',
      browser_type:       '⌨',
      browser_close:      '❌',
      edit_file:          '✏️',
      web_search:         '🔎',
      web_fetch:          '🌍',
      web_browse:         '🔬',
      git_op:             '🌿',
      spawn_agent:        '🤖',
      agent_status:       '📡',
      agent_result:       '✅',
    };
    const icon    = TOOL_ICONS[evt.name] || '🔧';
    const argsStr = (() => {
      // Show path/command/url, not full file content
      const a = evt.args || {};
      const label = a.path || a.command || a.url || a.query || a.selector || a.pattern || '';
      return label ? escapeHtml(String(label).slice(0, 60)) : '';
    })();
    const row = document.createElement('div');
    row.className        = 'tool-row tool-pending';
    row.dataset.toolName = evt.name;
    row.innerHTML = `<span class="tool-icon">${icon}</span>
      <span class="tool-name">${evt.name.replace(/_/g,' ')}</span>
      <span class="tool-arg">${argsStr}</span>
      <span class="tool-spinner">…</span>`;
    toolContainer.appendChild(row);
    toolContainer.scrollIntoView({ block: 'end', behavior: 'smooth' });

  } else if (evt.type === 'result') {
    const pending = [...toolContainer.querySelectorAll('.tool-row.tool-pending')]
      .find(r => r.dataset.toolName === evt.name);
    if (pending) {
      pending.classList.remove('tool-pending');
      pending.classList.add('tool-done');
      pending.querySelector('.tool-spinner').textContent = '✓';
    }

  } else if (evt.type === 'progress') {
    // Live line output from run_command streaming (#2)
    const running = [...toolContainer.querySelectorAll('.tool-row.tool-pending')]
      .find(r => r.dataset.toolName === evt.name);
    if (running) {
      let pre = running.querySelector('.tool-live-out');
      if (!pre) {
        pre = document.createElement('pre');
        pre.className = 'tool-live-out';
        Object.assign(pre.style, { fontSize: '11px', color: '#aaa', margin: '2px 0 0 20px', maxHeight: '120px', overflowY: 'auto', whiteSpace: 'pre-wrap' });
        running.appendChild(pre);
      }
      pre.textContent += evt.line + '\n';
      pre.scrollTop = pre.scrollHeight;
    }

  } else if (evt.type === 'screenshot') {
    // Render browser screenshot inline below the tool rows
    const img = document.createElement('img');
    img.src       = evt.src;
    img.className = 'browser-screenshot';
    img.title     = 'Click for fullscreen';
    img.loading   = 'lazy';
    img.addEventListener('click', () => {
      img.requestFullscreen?.().catch(() => {});
    });
    toolContainer.appendChild(img);
    toolContainer.scrollIntoView({ block: 'end', behavior: 'smooth' });
  }
}

// ── Workspace + Git ───────────────────────────────────────────────────────────
async function pickWorkspace() {
  const folder = await window.electronAPI?.selectFolder?.();
  if (!folder) return;
  state.workspace = folder;
  localStorage.setItem('nova_workspace', folder);
  await refreshGitContext();
  updateWorkspaceUI();

  // Start background indexing immediately
  addMessage('system-note', `📁 Workspace set to: \`${folder}\`\nIndexing files for RAG search… (runs in background)`);
  api('/workspace/index', { workspace: folder }).then(r => {
    if (r.ok) addMessage('system-note', '✓ Workspace indexed. NOVA can now search your code semantically.');
  }).catch(() => {});
}

async function indexWorkspaceIfNeeded() {
  if (!state.workspace) return;
  const status = await api(`/workspace/index/status?workspace=${encodeURIComponent(state.workspace)}`).catch(() => ({ indexed: false }));
  if (!status.indexed) {
    api('/workspace/index', { workspace: state.workspace }).catch(() => {});
  }
}

async function refreshGitContext() {
  if (!state.workspace) return;
  try {
    const res = await api(`/git-context?cwd=${encodeURIComponent(state.workspace)}`);
    state.gitCtx = res.ok ? res : null;
    updateGitStatusBar();
  } catch { state.gitCtx = null; }
}

function updateWorkspaceUI() {
  if (!el.workspaceLabel) return;
  if (state.workspace) {
    const parts = state.workspace.replace(/\\/g, '/').split('/');
    el.workspaceLabel.textContent = parts.slice(-2).join('/');
    el.workspaceLabel.title       = state.workspace;
    el.workspaceGitBtn?.classList.remove('hidden');
  } else {
    el.workspaceLabel.textContent = 'Set folder…';
    el.workspaceLabel.title       = '';
    el.workspaceGitBtn?.classList.add('hidden');
    el.gitStatusBar?.classList.add('hidden');
  }
}

function updateGitStatusBar() {
  if (!el.gitStatusBar) return;
  if (!state.gitCtx?.ok) {
    el.gitStatusBar.classList.add('hidden');
    return;
  }
  const g = state.gitCtx;
  el.gitStatusBar.classList.remove('hidden');
  if (el.gitBranchBadge)  el.gitBranchBadge.textContent  = `⎇ ${g.branch || 'detached'}`;
  if (el.gitChangesBadge) {
    const changes = (g.status || '').split('\n').filter(Boolean).length;
    el.gitChangesBadge.textContent = changes ? `${changes} changed` : 'clean';
    el.gitChangesBadge.className   = 'git-changes-badge' + (changes ? ' has-changes' : '');
  }
}

async function showGitStatus() {
  await refreshGitContext();
  if (!state.workspace) {
    addMessage('system-note', 'No workspace set. Use /workspace to set a project folder.');
    return;
  }
  if (!state.gitCtx?.ok) {
    addMessage('system-note', `${state.workspace} is not a git repository.`);
    return;
  }
  const g = state.gitCtx;
  let text = `**Git Status — ${state.workspace}**\n\n`;
  text += `Branch: \`${g.branch || 'detached'}\`\n\n`;
  if (g.status)    text += `**Uncommitted changes:**\n\`\`\`\n${g.status}\n\`\`\`\n\n`;
  else             text += `Working tree clean.\n\n`;
  if (g.diff_stat) text += `**Diff summary:**\n\`\`\`\n${g.diff_stat}\n\`\`\`\n\n`;
  if (g.log)       text += `**Recent commits:**\n\`\`\`\n${g.log}\n\`\`\``;
  if (g.stash)     text += `\n\n**Stash:**\n\`\`\`\n${g.stash}\n\`\`\``;
  addMessage('nova', text);
}

// ── RAG context injection ─────────────────────────────────────────────────────
async function fetchRagContext(query) {
  if (!state.workspace || !query || query.length < 10) return '';
  try {
    const res = await api(`/workspace/search?workspace=${encodeURIComponent(state.workspace)}&q=${encodeURIComponent(query)}&k=5`);
    if (!res.indexed || !res.results?.length) return '';
    const chunks = res.results.slice(0, 4);
    let ctx = '\n## Relevant code from workspace\n';
    for (const ch of chunks) {
      const ext = ch.file.split('.').pop() || 'text';
      ctx += `\n**${ch.file}** (line ${ch.line}):\n\`\`\`${ext}\n${ch.text.slice(0, 800)}\n\`\`\`\n`;
    }
    return ctx;
  } catch {
    return '';
  }
}

// ── Routed-model badge ────────────────────────────────────────────────────────
function showRoutedBadge(chosenModel) {
  const badge = document.getElementById('routed-badge');
  if (!badge) return;
  const isRouted = chosenModel?.api_id !== state.modelCfg?.api_id;
  if (isRouted) {
    badge.textContent = `⚡ ${chosenModel.display}`;
    badge.classList.remove('hidden');
    setTimeout(() => badge.classList.add('hidden'), 6000);
  } else {
    badge.classList.add('hidden');
  }
}

// ── Colour theme system ───────────────────────────────────────────────────────
function applyTheme(name) {
  // Apply to <html> so CSS [data-theme="..."] selectors fire
  document.documentElement.dataset.theme = (name === 'nova') ? '' : name;
  localStorage.setItem('nova_theme', name);

  // Sync active dot
  document.querySelectorAll('.theme-dot').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.theme === name);
  });
}

function initTheme() {
  const saved = localStorage.getItem('nova_theme') || 'nova';
  applyTheme(saved);

  document.querySelectorAll('.theme-dot').forEach(btn => {
    btn.addEventListener('click', () => applyTheme(btn.dataset.theme));
  });
}

// ── Background agent task (server-side execution) ─────────────────────────────
async function runAgentTaskBackground(brief) {
  if (_bgTaskId) {
    addMessage('system-note', 'A background task is already running. Wait for it to finish.');
    return;
  }

  // Start the task on the server
  const res = await api('/task/run-agent', {
    brief,
    model_cfg: routeModel('', 'fast'),  // always use fast model for bg tasks
    workspace: state.workspace || '',
  }).catch(e => ({ ok: false, error: e.message }));

  if (!res.ok) {
    addMessage('system-note', `Failed to start agent: ${res.error}`);
    return;
  }

  _bgTaskId = res.task_id;
  const fileCount = (brief.files || []).length;
  showBgTaskPill(`Agent: ${brief.task?.slice(0, 40)}…`, () => cancelBgTask());

  // Stream task progress via SSE
  const taskCard = addMessage('nova', `⚡ **Background agent started** — ${fileCount} file(s)\nTask: ${brief.task}`);
  const progressLines = {};

  const ctrl = new AbortController();
  _bgTaskAbort = ctrl;

  try {
    const resp = await fetch(`${BRIDGE}/task/stream/${_bgTaskId}`, { signal: ctrl.signal });
    const reader  = resp.body.getReader();
    const decoder = new TextDecoder();
    let buf = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const parts = buf.split('\n\n');
      buf = parts.pop();

      for (const part of parts) {
        if (!part.startsWith('data: ')) continue;
        const evt = JSON.parse(part.slice(6));
        if (evt.ping) continue;

        if (evt.done) {
          const result = evt.result || evt.error || 'Done.';
          const isErr  = !!evt.error;
          updateLastMessage(taskCard,
            `⚡ **Agent ${isErr ? 'failed' : 'complete'}**\n${result}\n\n` +
            Object.entries(progressLines).map(([f, s]) => `- ${s} \`${f}\``).join('\n'),
            true);
          hideBgTaskPill();
          _bgTaskId    = null;
          _bgTaskAbort = null;
          if (!isErr) window.electronAPI?.notify?.('NOVA Agent', result);
          break;
        }

        if (evt.file) {
          const icons = { reading:'📖', generating:'✍', writing:'💾', done:'✅', error:'❌' };
          progressLines[evt.file] = `${icons[evt.status] || '⏳'} ${evt.status}`;
          const lines = Object.entries(progressLines).map(([f, s]) => `- ${s} \`${f}\``).join('\n');
          updateLastMessage(taskCard,
            `⚡ **Agent running** [${evt.step}/${evt.total}]\nTask: ${brief.task}\n\n${lines}`,
            false);
        }
      }
    }
  } catch (err) {
    if (err.name !== 'AbortError') {
      updateLastMessage(taskCard, `⚠ Agent stream error: ${err.message}`, true);
    }
    hideBgTaskPill();
    _bgTaskId    = null;
    _bgTaskAbort = null;
  }
}

function cancelBgTask() {
  _bgTaskAbort?.abort();
  hideBgTaskPill();
  _bgTaskId    = null;
  _bgTaskAbort = null;
  addMessage('system-note', 'Background agent task cancelled.');
}

function showBgTaskPill(label, onCancel) {
  const pill = document.getElementById('bg-task-pill');
  const lbl  = document.getElementById('bg-task-label');
  const btn  = document.getElementById('bg-task-cancel-btn');
  if (!pill) return;
  if (lbl) lbl.textContent = label;
  if (btn) btn.onclick = onCancel;
  pill.classList.remove('hidden');
}

function hideBgTaskPill() {
  document.getElementById('bg-task-pill')?.classList.add('hidden');
}

// ── Sessions search ───────────────────────────────────────────────────────────
function initSessionsSearch() {
  const input = el.sessionsSearch;
  if (!input) return;

  let _searchTimer = null;

  input.addEventListener('input', () => {
    const q = input.value.trim();
    clearTimeout(_searchTimer);
    if (!q) {
      loadSessionsList();  // restore normal list
      return;
    }
    _searchTimer = setTimeout(() => searchSessions(q), 300);
  });

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { input.value = ''; loadSessionsList(); }
  });
}

async function searchSessions(q) {
  const res = await api(`/sessions/search?q=${encodeURIComponent(q)}`).catch(() => ({ results: [] }));
  renderSessionsList(res.results || [], true);
}

// Add a "↻ Retry" button to the bottom of a completed NOVA message card
function attachRetryButton(card) {
  // Remove any existing retry button first (e.g. if regenerating)
  card.querySelector('.retry-btn')?.remove();

  const btn = document.createElement('button');
  btn.className   = 'retry-btn';
  btn.textContent = '↻ Retry';
  btn.title       = 'Regenerate this response';
  btn.addEventListener('click', () => regenerateResponse(card));
  card.appendChild(btn);
}

// Remove the last assistant turn and re-stream it
async function regenerateResponse(card) {
  if (state.streaming) return;

  // Pop the last assistant message from history
  const lastIdx = [...state.messages].map(m => m.role).lastIndexOf('assistant');
  if (lastIdx === -1) return;
  state.messages.splice(lastIdx, 1);

  // Reuse the same card — clear it and restart streaming into it
  const body = card.querySelector('.msg-body');
  if (body) body.innerHTML = '<span class="cursor-blink"></span>';
  card.querySelector('.retry-btn')?.remove();

  state.streaming = true;
  _abortCtrl = new AbortController();
  el.sendBtn.classList.add('stop-mode');
  el.sendBtn.title = 'Stop generation';
  el.sendBtn.onclick = () => { _abortCtrl?.abort(); };
  startThinkAnimation();

  const apiMessages = [
    { role: 'system', content: buildSystemPrompt() },
    ...state.messages,
  ];

  await streamChat(
    apiMessages,
    state.modelCfg,
    (_chunk, accumulated) => updateLastMessage(card, accumulated, false),
    (final) => {
      updateLastMessage(card, final, true);
      state.messages.push({ role: 'assistant', content: final });
      updateContextMeter();
      _lastNovaCard = card;
      attachRetryButton(card);
      finishResponse();
    },
    (err) => {
      updateLastMessage(card, `⚠ ${err}`, true);
      attachRetryButton(card);
      finishResponse();
    },
    _abortCtrl.signal
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// PREVIEW PANE
// ══════════════════════════════════════════════════════════════════════════════

function togglePreview() {
  const col = document.getElementById('preview-column');
  if (!col) return;
  col.classList.toggle('open');
}

function navigatePreview(url) {
  if (!url || url === 'about:blank') return;
  const col      = document.getElementById('preview-column');
  const frame    = document.getElementById('preview-frame');
  const urlInput = document.getElementById('preview-url-input');
  if (!frame) return;
  // Auto-open the preview pane if it's closed
  if (col && !col.classList.contains('open')) col.classList.add('open');
  if (urlInput) urlInput.value = url;

  // file:// URLs cannot load inside an Electron iframe (sandbox restriction).
  // Show a friendly placeholder with an "Open in Browser" shortcut instead.
  if (url.startsWith('file://') || url.startsWith('file:///')) {
    frame.src = 'about:blank';
    _showPreviewFilePlaceholder(url);
  } else {
    _hidePreviewFilePlaceholder();
    frame.src = url;
  }
}

function _showPreviewFilePlaceholder(url) {
  const frame = document.getElementById('preview-frame');
  let overlay = document.getElementById('preview-file-overlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'preview-file-overlay';
    overlay.innerHTML = `
      <div class="pfo-icon">📄</div>
      <div class="pfo-title">Local File</div>
      <div class="pfo-path" id="pfo-path-text"></div>
      <div class="pfo-note">Iframes can't load <code>file://</code> URLs — open it in your system browser to preview.</div>
      <button class="pfo-open-btn" id="pfo-open-btn">↗ Open in Browser</button>
    `;
    frame?.insertAdjacentElement('afterend', overlay);
  }
  const pathEl  = overlay.querySelector('#pfo-path-text');
  const openBtn = overlay.querySelector('#pfo-open-btn');
  if (pathEl)  pathEl.textContent = decodeURIComponent(url.replace(/^file:\/\/\/?/, '').replace(/\//g, '\\'));
  if (openBtn) openBtn.onclick = () => window.electronAPI?.openExternal?.(url);
  // Hide the blank iframe, show overlay
  if (frame)  frame.style.display  = 'none';
  overlay.style.display = 'flex';
}

function _hidePreviewFilePlaceholder() {
  const overlay = document.getElementById('preview-file-overlay');
  const frame   = document.getElementById('preview-frame');
  if (overlay) overlay.style.display = 'none';
  if (frame)   frame.style.display   = '';   // restore
}

function initPreview() {
  const col      = document.getElementById('preview-column');
  const frame    = document.getElementById('preview-frame');
  const urlInput = document.getElementById('preview-url-input');
  const goBtn    = document.getElementById('preview-go-btn');
  const reloadBtn= document.getElementById('preview-reload-btn');
  const extBtn   = document.getElementById('preview-ext-btn');
  const closeBtn = document.getElementById('preview-close-btn');
  const hdrBtn   = document.getElementById('hdr-preview-btn');

  const navigate = () => {
    const url = urlInput?.value.trim();
    if (url && frame) frame.src = url;
  };

  goBtn?.addEventListener('click',  navigate);
  urlInput?.addEventListener('keydown', (e) => { if (e.key === 'Enter') navigate(); });

  reloadBtn?.addEventListener('click', () => {
    if (frame) frame.src = frame.src;
  });

  extBtn?.addEventListener('click', () => {
    const url = urlInput?.value.trim() || (frame?.src !== 'about:blank' ? frame?.src : '');
    if (url) window.electronAPI?.openExternal?.(url);
  });

  closeBtn?.addEventListener('click', () => col?.classList.remove('open'));

  hdrBtn?.addEventListener('click', togglePreview);

  // Ctrl+Shift+P → toggle preview
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key.toLowerCase() === 'p') {
      e.preventDefault();
      togglePreview();
    }
  });
}

function buildSystemPrompt() {
  const bd = state.brainData;
  let sys = `You are NOVA — the IOT St. Kitts internal AI coding assistant.
You are an expert software engineer specialising in Python, IoT, MQTT, REST APIs, and embedded systems.
You work exclusively with the IOT St. Kitts engineering team. Be concise, direct, and highly technical.

## Behaviour rules — read these first
- **When the user gives you a task, do it immediately.** Never re-greet, never re-summarise context, never ask "what would you like to work on?" — the user just told you. Start the task.
- You greet once per session (the opening message). Every subsequent user turn is a task or question — respond by doing or answering.
- Never say "I'll now…" or "Let me…" then stop. Execute, then report the result.

## Plan → Execute → Verify (for any non-trivial task)
For tasks that involve writing, modifying, or creating files — or anything with more than one step:

**1. Plan (2–4 bullets, written before any tool call):**
State what you will do and in what order. Keep it brief. Example:
> **Plan:** read auth.py → add /reset endpoint to server.py → run tests → verify response

**2. Execute:** Immediately follow the plan with actual tool calls. No commentary between steps.

**3. Verify:** After execution, confirm the result is correct:
- Code written → read it back or run it and check output
- Server/app built → open in browser, screenshot, confirm it loads
- Test written → run it and confirm it passes
- If anything is wrong, fix it autonomously in the same response — do NOT stop and tell the user to fix it

**Ultrathink:** When a problem is architecturally complex, ambiguous, or has failed once already — stop, reason deeply about root cause and approach, then execute. Prefer correctness over speed on hard problems.

## Working with attached images
When the user attaches an image (business card, logo, screenshot, photo):
- You can **see** the image and read all text, colours, layout, and details from it
- The "Attached Files" section in the context tells you the **original file path** — use it
- **Email signature / HTML output**: use \`write_file\` to create an HTML file. Embed the image either:
  - As a file reference: \`<img src="C:/path/to/image.png">\` (good for local use)
  - As inline base64: use \`run_command\` to base64-encode the file:
    \`python -c "import base64,sys; print(base64.b64encode(open(sys.argv[1],'rb').read()).decode())" "C:/path/to/image.png"\`
    Then embed: \`<img src="data:image/png;base64,<ENCODED>">\`
  - **Prefer inline base64** when the user says "with the image included" — it makes the HTML fully self-contained and portable
- For a **business card → email signature**: extract name, title, phone, email, website, company from the image; build a clean single-table HTML signature; embed the logo inline as base64
- Never say "I can't embed the image" — use run_command to encode it first, then write_file

## Conversation context — always know what you just did
After completing any task (writing a file, running a command, building something), end your response with a one-line footer:
> 📁 **Last touched:** \`path/to/file.ext\`, \`another/file.py\`

This footer is your own memory aid. On every follow-up turn, check your most recent footer to know what you were working on.

**When a follow-up is vague** ("add to it", "improve the style", "make it faster", "change the colour", "now add X to it", "can you also…"):
1. Look back at your last "Last touched:" footer in the conversation.
2. Re-read those files immediately — do NOT ask "which file?" or "what would you like to work on?".
3. Apply the change to those files and continue.

**Never ask which file on a follow-up.** If you genuinely cannot infer (e.g. the user switches topic entirely), make your best guess based on the last footer and state your assumption in one line before proceeding.

## Tools
| Tool               | Use for |
|--------------------|---------|
| read_file          | Read any file before editing — never work from memory |
| write_file         | Create or overwrite files; never use shell heredocs |
| list_directory     | Explore project structure |
| run_command        | Run scripts, tests, installs, git commands |
| search_code        | Regex search across workspace files |
| create_document    | Generate Word (.docx), Excel (.xlsx), PDF, HTML, CSV, or Markdown with rich formatting |
| reload_skills      | Hot-reload custom skills from the skills/ folder |
| browser_open       | Navigate browser to URL, screenshot result, auto-open preview pane |
| browser_screenshot | Screenshot current browser page |
| browser_read       | Get visible text content of current browser page |
| browser_click      | Click element by CSS selector or text='...' |
| browser_type       | Type into input field by CSS selector |
| browser_close      | Close browser when done verifying |
| edit_file          | Surgical find-and-replace in a file — safer than rewriting the whole file; returns a unified diff |
| web_search         | Search the web and return raw result links + snippets |
| web_fetch          | Fetch any URL and read its content as plain text |
| web_browse         | **Best for research** — searches + fetches + synthesises via Google Gemma 4; returns a clean answer instead of raw HTML |
| git_op             | Git workflow: status, diff, log, add, commit, push, pull, branch, stash |
| spawn_agent        | Spawn a background sub-agent for a long-running task; returns immediately with an agent_id |
| agent_status       | Check progress and recent activity of a spawned agent |
| agent_result       | Get the final result of a completed agent |

## Coding workflow
1. read_file first — always check current state before editing
2. edit_file for targeted changes — use when modifying a small section; safer than rewriting the whole file
3. write_file for new files or full rewrites — full content, one call
4. run_command to verify — run it, read the output, fix errors immediately
5. Iterate — if something fails, fix it in the same response without asking
6. Never stop at "I've written the file" — always run/open/test it and confirm it works

## Research workflow
- **Prefer web_browse** for any research question — it searches, fetches, and uses Google Gemma 4 to synthesise a clean answer in one call
- Use web_search + web_fetch only when you need raw content or a specific URL you already know
- web_browse accepts an optional \`focus\` param to narrow extraction (e.g. "installation steps", "API usage")

## Games & interactive demos — always single-file HTML
For ANY game, demo, visualisation, or interactive tool:
- Build as ONE self-contained HTML file (all JS + CSS inline) — no server needed
- write_file the HTML, then browser_open the file:// URL directly (e.g. \`file:///${(state.paths.desktopDir || 'C:/Users/IOT/IOT-SK-CLI/iot-sk-coder/desktop').replace(/\\\\/g, '/')}/game.html\`)
- NEVER start a local server (Flask, http.server, node http) for a self-contained HTML file — open it via file:// instead
- NEVER assume a port — if a server IS needed for a different reason, read its stdout to find the actual bound port
- After opening, use browser_click to interact — click a piece, button, or cell to confirm the game responds
- If it renders as a static image with no interactivity, the implementation is incomplete — fix it before declaring done

### Three.js FPS / mouse-look — critical
- **NEVER use \`THREE.PointerLockControls\`** — it is a SEPARATE ADDON not included in the main \`three.min.js\` CDN bundle. Importing it will silently fail and leave the camera frozen.
- Always implement mouse look MANUALLY:
  1. Call \`canvas.requestPointerLock()\` on click
  2. Listen for \`document.addEventListener('pointerlockchange', ...)\` to track lock state
  3. Listen for \`document.addEventListener('mousemove', e => { yaw -= e.movementX * sensitivity; pitch -= e.movementY * sensitivity; })\` while locked
  4. Apply \`camera.rotation.set(pitch, yaw, 0)\` each frame (order: 'YXZ')
- This applies to ALL Three.js FPS / first-person camera games — no exceptions

## Browser self-verification workflow (for web apps requiring a server)
1. write_file — write the app
2. run_command — start server and capture its output to detect the actual bound port:
   - Flask: \`python app.py\` prints "Running on http://127.0.0.1:PORT" — read that PORT
   - http.server: \`python -m http.server 8080\` prints "Serving HTTP on 0.0.0.0 port PORT"
   - If the default port is taken, the server picks another — always read stdout to confirm
3. browser_open — use the PORT from stdout, not an assumed default
4. Inspect the screenshot — verify layout, content, colours match requirements
5. browser_click / browser_type — interact with the app to test dynamic features
6. If anything is wrong, fix it and repeat from step 1
7. browser_close — close when done

## Task completion standard — never declare done without verification
A task is ONLY complete when the user can use the result right now:
- Game/demo built → must be open in browser AND playable (click confirmed working)
- Server app built → must be reachable at the correct URL AND respond to interaction
- Script written → must have been run AND produced correct output
- File modified → must have been re-read to confirm the change landed correctly
If the first attempt is broken or incomplete, fix it autonomously in the same response.
Do NOT stop and ask the user to test it — verify yourself and iterate until it works.

## Open Design Library — design systems & UI skill templates

You have access to a curated library of brand design systems and UI skill templates at:
- Design systems: ${(state.paths.openDesign || 'C:\\\\Users\\\\IOT\\\\IOT-SK-CLI\\\\open-design').replace(/\\\\/g, '\\\\\\\\')}\\\\design-systems\\\\<name>\\\\DESIGN.md
- Skill templates: ${(state.paths.openDesign || 'C:\\\\Users\\\\IOT\\\\IOT-SK-CLI\\\\open-design').replace(/\\\\/g, '\\\\\\\\')}\\\\skills\\\\<name>\\\\SKILL.md

**Before building ANY web UI, landing page, dashboard, HTML game, or interactive demo — follow this exact workflow:**
1. read_file the DESIGN.md for the chosen system. Read the ENTIRE file, not just the color section.
2. Optionally read_file the relevant skill SKILL.md for structural workflow.
3. Extract and hard-code ALL of these values from DESIGN.md before writing a single line of HTML:
   - Primary/accent color(s) — exact hex
   - Background color(s) — exact hex
   - Heading text color — exact hex (often NOT #000000)
   - Body text color — exact hex
   - Font family name + fallback stack
   - Font weight for headings (often 300 or 200, NOT 700)
   - Letter-spacing values at each size
   - font-feature-settings (e.g. "ss01", "tnum") if specified
   - Shadow formula — copy the exact rgba() multi-layer string
   - Border radius values — exact px
   - Dark section background color if one exists
4. Write the HTML using ONLY those extracted values. Every CSS color must match a value from step 3.
5. Include ALL structural sections with real content — NEVER use placeholder text like "Feature 1" or "Description here". Write actual product-specific copy based on the product name and context provided.
6. The typography system is mandatory: apply the exact font, weights, letter-spacing, and font-feature-settings from DESIGN.md to every heading and body element.

**Quality bar:** The output must look like it was designed by the brand whose design system you used. If it looks generic, you have not applied the design system correctly — fix it.

**How to choose a design system** (infer from context; ask only if ambiguous):
- User's product is AI / LLM → claude, openai, mistral-ai, cohere, elevenlabs
- Fintech / payments → stripe, coinbase, mastercard, binance, kraken
- Dev tools / SaaS → linear-app, vercel, github, cursor, raycast, framer, hashicorp, supabase (neon)
- Consumer / social → airbnb, discord, spotify, pinterest, duolingo, notion
- Enterprise / B2B → ibm, corporate, enterprise, material, ant
- Automotive / luxury → bmw, ferrari, lamborghini, bugatti, tesla, luxury
- Stylistic aesthetic requested:
  - Clean / minimal → minimal, clean, mono, flat
  - Glass / blur → glassmorphism
  - Clay / 3D soft → claymorphism, clay
  - Bold / loud → brutalism, neobrutalism, bold
  - Gradient / vibrant → gradient, colorful, energetic, expressive
  - Dark / futuristic → futuristic, cosmic, dramatic, neon
  - Editorial / magazine → editorial, publication, paper
  - Soft / friendly → friendly, neumorphism, bento

**Available design systems (read DESIGN.md for exact tokens):**
agentic, airbnb, airtable, ant, apple, application, arc, artistic, atelier-zero, bento, binance, bmw, bold, brutalism, bugatti, cafe, cal, canva, claude, clay, claymorphism, clean, clickhouse, cohere, coinbase, colorful, composio, contemporary, corporate, cosmic, creative, cursor, dashboard, default, discord, dithered, doodle, dramatic, duolingo, editorial, elegant, elevenlabs, energetic, enterprise, expo, expressive, fantasy, ferrari, figma, flat, framer, friendly, futuristic, github, glassmorphism, gradient, hashicorp, huggingface, ibm, intercom, kami, kraken, lamborghini, levels, linear-app, lingo, lovable, luxury, mastercard, material, meta, minimal, minimax, mintlify, miro, mistral-ai, modern, mongodb, mono, neobrutalism, neon, neumorphism, nike, notion, nvidia, ollama, openai, opencode-ai, pacman, paper, perspective, pinterest, playstation, posthog, premium, professional, publication, raycast, refined, retro, saas, shadcn, shopify, sketch, slack, spotify, startup, stripe, supabase, tailwind, tesla, tiktok, twitter, uber, vercel, vscode, wix, xcode, zapier, zendesk

**Available skill templates (read SKILL.md for workflow):**
saas-landing, dashboard, blog-post, docs-page, dating-web, digital-eguide, email-marketing, eng-runbook, finance-report, flowai-live-dashboard-template, gamified-app, hr-onboarding, html-ppt-pitch-deck, html-ppt-product-launch, html-ppt-tech-sharing, html-ppt-weekly-report, html-ppt-course-module, html-ppt-presenter-mode-reveal, html-ppt-taste-brutalist, html-ppt-taste-editorial, audio-jingle, critique, design-brief, guizang-ppt, hatch-pet

**Important:** The DESIGN.md is not optional for web output. A page built without reading it will look generic. Reading it takes ~3 seconds and produces dramatically better results.

## create_document — content block schema
Content is an array of blocks, each with a "type" field:
  { type:"heading",    level:1,  text:"..." }
  { type:"paragraph",  text:"..." }
  { type:"table",      headers:[...], rows:[[...], ...] }
  { type:"bullet_list",items:[...] }
  { type:"sheet",      name:"Sheet1", headers:[...], rows:[[...]] }  ← xlsx only
  { type:"page_break" }

Format is auto-detected from the file extension (.docx / .xlsx / .pdf / .html / .csv / .md).

## Skills — extending NOVA's own toolkit
Write a skill file to add a permanent new tool:
  Path: <bridge>/skills/<tool_name>.py
  Must export: TOOL_DEFINITION (OpenAI function format) + execute(args, workspace) -> str
  Then call: reload_skills  → tool is live immediately in this session

Example skill skeleton:
\`\`\`python
TOOL_DEFINITION = {
  "type": "function",
  "function": {
    "name": "my_tool",
    "description": "...",
    "parameters": {"type":"object","properties":{"arg":{"type":"string"}},"required":["arg"]}
  }
}
def execute(args: dict, workspace: str) -> str:
    return f"result: {args['arg']}"
\`\`\`

\n`;

  // Compressed conversation summary (injected when context was pruned)
  if (state.ctxSummary) {
    sys += `## Earlier conversation (compressed)\n${state.ctxSummary}\n\n`;
  }

  // Brain memory
  if (bd.recent_summary) sys += `## Recent context\n${bd.recent_summary}\n\n`;
  if (bd.projects?.length) {
    sys += `## Active projects\n${bd.projects.slice(-5).map(p => `- ${p.name}: ${p.notes||''}`).join('\n')}\n\n`;
  }
  if (bd.facts?.length) {
    sys += `## Known facts\n${bd.facts.slice(-10).map(f => `- ${f.key}: ${f.value}`).join('\n')}\n\n`;
  }
  if (bd.decisions?.length) {
    sys += `## Past decisions\n${bd.decisions.slice(-5).map(d => `- ${d.what}`).join('\n')}\n\n`;
  }

  // Workspace context
  if (state.workspace) {
    sys += `## Current workspace\nRoot: ${state.workspace}\n`;
    if (state.gitCtx?.ok) {
      const g = state.gitCtx;
      sys += `Branch: ${g.branch}\n`;
      if (g.status)    sys += `Uncommitted changes:\n${g.status}\n`;
      if (g.diff_stat) sys += `Diff summary:\n${g.diff_stat}\n`;
      if (g.log)       sys += `Recent commits:\n${g.log}\n`;
    }
    sys += '\n';
  }

  return sys;
}

// ── Token estimation + context meter ─────────────────────────────────────────
// Rough heuristic: 1 token ≈ 4 characters (works well for English code/prose)
function estimateTokens(messages) {
  let chars = 0;
  for (const m of messages) {
    const c = m.content;
    if (typeof c === 'string')   chars += c.length;
    else if (Array.isArray(c))   c.forEach(p => { if (p.type === 'text') chars += (p.text || '').length; });
  }
  return Math.round(chars / 4);
}

let _compressingCtx = false;

function updateContextMeter() {
  const tokens  = estimateTokens(state.messages);
  const ctxK    = (state.modelCfg ? CTX_WINDOWS[state.modelCfg.api_id] : null) || 128;
  const pct     = Math.min(100, (tokens / (ctxK * 1000)) * 100);

  const fill  = document.getElementById('ctx-meter-fill');
  const label = document.getElementById('ctx-token-count');
  if (!fill || !label) return;

  fill.style.width = pct + '%';
  fill.classList.toggle('warn',   pct > 60 && pct <= 85);
  fill.classList.toggle('danger', pct > 85);

  const tokStr = tokens >= 1000 ? `${(tokens / 1000).toFixed(1)}K` : `${tokens}`;
  label.textContent = `~${tokStr} / ${ctxK}K`;

  // Auto-compress when context reaches 80%+ and session has enough messages to compress
  if (pct > 80 && !state.streaming && !_compressingCtx && state.messages.length >= 10) {
    _compressingCtx = true;
    compressContext().finally(() => { _compressingCtx = false; });
  }
}

async function compressContext() {
  // Take the oldest 40% of messages and summarise them
  const cutoff  = Math.max(4, Math.floor(state.messages.length * 0.4));
  const oldMsgs = state.messages.slice(0, cutoff);
  const keepMsgs = state.messages.slice(cutoff);

  // Build a minimal text representation of the old turns to send to the model
  const convoText = oldMsgs.map(m => {
    const role = m.role === 'user' ? 'USER' : 'NOVA';
    const c    = typeof m.content === 'string' ? m.content
               : (m.content?.find?.(p => p.type === 'text')?.text || '');
    return `${role}: ${c.slice(0, 600)}`;
  }).join('\n\n');

  const summaryReq = [
    { role: 'system', content: 'You are a concise technical summariser.' },
    { role: 'user',   content:
      `Summarise the following conversation segment in 3-5 sentences. ` +
      `Focus on: what was discussed, decisions made, code written, files changed, errors fixed. ` +
      `Be specific and technical. Return only the summary — no preamble.\n\n${convoText}`
    },
  ];

  let summary = '';
  try {
    await new Promise((resolve) => {
      streamChat(summaryReq, state.modelCfg,
        (_chunk, acc) => { summary = acc; },
        () => resolve(),
        () => resolve()
      );
    });
  } catch { /* best-effort */ }

  if (!summary.trim()) return;

  // Replace the old turns with a compressed summary message
  state.ctxSummary = (state.ctxSummary ? state.ctxSummary + '\n\n' : '') + summary.trim();
  state.messages   = keepMsgs;
  updateContextMeter();
  addMessage('system-note', `⟳ Context compressed (${cutoff} turns → summary). Full history still in Brain.`);
}

// ══════════════════════════════════════════════════════════════════════════════
// COMMANDS
// ══════════════════════════════════════════════════════════════════════════════

async function handleCommand(cmd) {
  const parts = cmd.trim().split(/\s+/);
  const verb  = parts[0].toLowerCase();

  switch (verb) {
    case '/run':       return runAgentTask();
    case '/memory':    return showBrainPanel();
    case '/model':     return showModelPanel();
    case '/workspace': return pickWorkspace();
    case '/git':       return showGitStatus();
    case '/preview':   return togglePreview();
    case '/term':      return toggleTerminal();
    case '/clear':     return clearChat();
    case '/save':      return saveSession(parts.slice(1).join(' '));
    case '/export':    return exportConversation();
    case '/help':      return showHelp();
    case '/status':    return showStatus();
    default:
      addMessage('system-note', `Unknown command: ${verb}. Type /help for the list.`);
  }
}

async function runAgentTask() {
  if (state.messages.filter(m => m.role === 'user').length === 0) {
    addMessage('system-note', 'Describe what you want to build first, then use /run.');
    return;
  }
  addMessage('system-note', 'Building agent task brief…');
  startThinkAnimation();
  el.sendBtn.disabled = true;

  const res = await api('/run-brief', {
    messages:  state.messages,
    model_cfg: state.modelCfg,
  }).catch(() => ({ ok: false, error: 'Bridge unreachable.' }));

  showDoneFlash();
  el.sendBtn.disabled = false;

  if (!res.ok) {
    addMessage('system-note', `Could not build task brief: ${res.error}`);
    return;
  }

  showBriefPanel(res.brief);
}

function showHelp() {
  const ws = state.workspace ? `\`${state.workspace}\`` : 'not set';
  const helpText =
    `**NOVA Commands**\n\n` +
    `/run        — Package conversation → execute coding agent\n` +
    `/memory     — Show what NOVA remembers across sessions\n` +
    `/model      — Switch AI model or provider\n` +
    `/workspace  — Set project root folder (git context + file paths)\n` +
    `/git        — Show current git status and recent commits\n` +
    `/preview    — Toggle in-app preview pane  (Ctrl+Shift+P)\n` +
    `/term       — Toggle the terminal pane  (Ctrl+\`)\n` +
    `/clear      — Start a fresh conversation (brain kept)\n` +
    `/save       — Save this session to brain memory\n` +
    `/export     — Export conversation as Markdown file\n` +
    `/status     — Auth + model + brain stats\n` +
    `/help       — This message\n\n` +
    `**Workspace:** ${ws}\n` +
    `**Tools:** NOVA can read files, list directories, run commands, and search code autonomously.`;
  addMessage('nova', helpText);
}

async function exportConversation() {
  const msgs = state.messages.filter(m => m.role !== 'system');
  if (!msgs.length) { addMessage('system-note', 'Nothing to export yet.'); return; }

  const model = state.modelCfg?.display || 'Unknown model';
  const ts    = new Date().toLocaleString();
  let md = `# NOVA Session — IOT St. Kitts\n\n> Model: ${model}  \n> Exported: ${ts}\n\n---\n\n`;

  for (const m of msgs) {
    const role    = m.role === 'user' ? '## You' : '## NOVA';
    const content = typeof m.content === 'string'
      ? m.content
      : (m.content.find?.(p => p.type === 'text')?.text || '*[multimodal content]*');
    md += `${role}\n\n${content}\n\n---\n\n`;
  }

  const fp = await window.electronAPI?.saveFileDialog?.({
    filters:     [{ name: 'Markdown', extensions: ['md'] }, { name: 'Text', extensions: ['txt'] }],
    defaultPath: `nova-${Date.now()}.md`,
  });
  if (!fp) return;

  const r = await window.electronAPI?.writeFile?.(fp, md);
  addMessage('system-note', r?.ok ? `✓ Exported to ${fp}` : `✕ Export failed: ${r?.error || 'unknown'}`);
}

async function showStatus() {
  const health = await api('/health').catch(() => ({}));
  const text =
    `**Status**\n` +
    `Model:    ${state.modelCfg?.display || '—'}\n` +
    `Provider: ${state.modelCfg?.provider || '—'}\n` +
    `Brain:    ${health.brain || '—'}\n` +
    `Bridge:   ${health.ok ? '✓ connected' : '✕ offline'}`;
  addMessage('nova', text);
}

// ── Auto-context: read root files into system prompt on new session ────────────
async function injectWorkspaceContext() {
  if (!state.workspace || !window.electronAPI?.readFile) return;
  const root = state.workspace.replace(/\/+$/, '').replace(/\\+$/, '');
  const sep  = root.includes('/') ? '/' : '\\';
  const candidates = ['CLAUDE.md', 'README.md', 'package.json', '.nova-context.md'];
  const found = [];
  let ctx = '';
  for (const fname of candidates) {
    try {
      const data = await window.electronAPI.readFile(root + sep + fname);
      if (data?.type === 'text' && data.content?.trim()) {
        const preview = data.content.slice(0, 1800);
        ctx += `### ${fname}\n\`\`\`\n${preview}${data.content.length > 1800 ? '\n…(truncated)' : ''}\n\`\`\`\n\n`;
        found.push(fname);
      }
    } catch { /* file absent — skip */ }
  }
  if (!ctx) return;
  state.ctxSummary = (state.ctxSummary ? state.ctxSummary + '\n\n' : '') +
    `## Workspace context (auto-loaded)\n${ctx.trim()}`;
  addMessage('system-note', `📁 Loaded workspace context: ${found.join(', ')}`);
}

async function clearChat() {
  state.messages   = [];
  state.ctxSummary = '';
  _lastNovaCard    = null;
  el.messages.innerHTML = '';
  state.sessionNum++;
  updateSessionHeader();
  updateContextMeter();   // reset meter to 0
  addMessage('system-note', 'Conversation cleared. Brain and workspace are kept.');
  const wsMsg = state.workspace ? ` Workspace: \`${state.workspace}\`.` : '';
  addMessage('nova', `Fresh session started.${wsMsg} What would you like to build?`);
  if (state.workspace) injectWorkspaceContext();   // prime context from root files
}

async function saveSession(name) {
  await api('/brain/distil', { messages: state.messages, model_cfg: state.modelCfg });
  addMessage('system-note', `Session saved${name ? ': ' + name : ''}. Brain updated.`);
  await loadSessionsList();   // refresh sidebar so this session appears immediately
}

// ══════════════════════════════════════════════════════════════════════════════
// PANELS
// ══════════════════════════════════════════════════════════════════════════════

function openPanel(id) {
  el.backdrop.classList.remove('hidden');
  document.getElementById(id).classList.remove('hidden');
}
function closePanel(id) {
  document.getElementById(id).classList.add('hidden');
  el.backdrop.classList.add('hidden');
}

document.querySelectorAll('.panel-close').forEach(btn => {
  btn.addEventListener('click', () => closePanel(btn.dataset.panel));
});
el.backdrop.addEventListener('click', () => {
  document.querySelectorAll('.panel:not(.hidden)').forEach(p => p.classList.add('hidden'));
  el.backdrop.classList.add('hidden');
});

// ── Brain panel ───────────────────────────────────────────────────────────────
async function showBrainPanel() {
  const bd = await api('/brain').catch(() => ({}));
  state.brainData = bd;
  el.brainBody.innerHTML = '';

  const sec = (title, items) => {
    if (!items?.length) return;
    const t = document.createElement('div');
    t.className = 'brain-section-title';
    t.textContent = title;
    el.brainBody.appendChild(t);
    items.forEach(item => {
      const row = document.createElement('div');
      row.className = 'brain-entry';
      const key = document.createElement('span');
      const val = document.createElement('span');
      key.className = 'brain-key';
      val.className = 'brain-val';
      key.textContent  = item.key || item.name || item.what || '—';
      val.textContent  = item.value || item.notes || item.why || '—';
      row.appendChild(key);
      row.appendChild(val);
      el.brainBody.appendChild(row);
    });
  };

  if (bd.recent_summary) {
    const t = document.createElement('div');
    t.className = 'brain-section-title';
    t.textContent = 'Summary';
    el.brainBody.appendChild(t);
    const e = document.createElement('div');
    e.className = 'brain-entry';
    const v = document.createElement('span');
    v.className = 'brain-val';
    v.textContent = bd.recent_summary;
    e.appendChild(v);
    el.brainBody.appendChild(e);
  }

  sec('Projects',  bd.projects);
  sec('Facts',     bd.facts);
  sec('Decisions', bd.decisions);

  if (!bd.recent_summary && !bd.projects?.length && !bd.facts?.length) {
    el.brainBody.innerHTML = '<p style="color:var(--text-3);font-size:13px">No memories yet. Start chatting to build NOVA\'s brain.</p>';
  }

  openPanel('brain-panel');
}

el.brainBtn.addEventListener('click', showBrainPanel);

// ── Model panel ───────────────────────────────────────────────────────────────
let mpProvider = 'openai';

function showModelPanel() {
  mpProvider = state.modelCfg?.provider || 'openai';
  populateModelSelect(el.mpModelSelect, mpProvider);
  el.mpKeyInput.value = state.modelCfg?.api_key || '';
  el.mpError.textContent = '';

  // Set active provider card
  el.mpProviderGrid.querySelectorAll('.provider-card').forEach(c => {
    c.classList.toggle('active', c.dataset.provider === mpProvider);
  });

  el.mpCustomId.style.display = 'none';
  el.mpCustomId.value = '';
  updateKeyVisibility(mpProvider, null, 'mp-key-input', null);
  if (mpProvider === 'chatgpt') refreshChatGPTStatus();

  openPanel('model-panel');
}

async function refreshChatGPTStatus() {
  const info = document.getElementById('mp-chatgpt-info');
  if (!info) return;
  info.textContent = 'Checking…';
  try {
    const s = await api('/codex/status');
    if (s.authenticated) {
      const exp = s.token_expires ? new Date(s.token_expires * 1000).toLocaleDateString() : '?';
      info.textContent = `${s.email || 'unknown'} · Plan: ${s.plan || '?'} · Token expires ${exp}`;
    } else {
      info.textContent = 'Not connected — open Codex and sign in with ChatGPT Plus.';
      const badge = document.getElementById('mp-chatgpt-status');
      if (badge) { badge.style.background = '#fff7ed'; badge.style.borderColor = '#fed7aa'; badge.style.color = '#9a3412'; }
    }
  } catch (e) {
    info.textContent = 'Could not reach bridge.';
  }
}

bindProviderGrid(el.mpProviderGrid, el.mpModelSelect, (p) => {
  mpProvider = p;
  updateKeyVisibility(p, null, 'mp-key-input', null);
  if (p === 'chatgpt') refreshChatGPTStatus();
  el.mpCustomId.style.display = 'none';
  el.mpCustomId.value = '';
});
el.mpModelSelect.addEventListener('change', () => {
  const isCustom = el.mpModelSelect.value === '__custom__';
  el.mpCustomId.style.display = isCustom ? '' : 'none';
  if (isCustom) el.mpCustomId.focus();
});
el.modelPill.addEventListener('click', showModelPanel);

el.mpSaveBtn.addEventListener('click', async () => {
  const selected = el.mpModelSelect.value;
  let apiId, display;
  if (selected === '__custom__') {
    apiId = el.mpCustomId.value.trim();
    if (!apiId) { el.mpError.textContent = 'Enter a model ID.'; el.mpCustomId.focus(); return; }
    display = apiId;
  } else {
    const m = JSON.parse(selected);
    apiId   = m.api_id;
    display = m.name;
  }

  const apiKey = mpProvider === 'ollama'  ? 'ollama'
              : mpProvider === 'chatgpt' ? '__codex__'
              : (el.mpKeyInput.value.trim() || state.modelCfg?.api_key);
  if (!apiKey && mpProvider !== 'ollama' && mpProvider !== 'chatgpt') { el.mpError.textContent = 'Enter an API key.'; return; }

  const cfg = buildModelCfg(mpProvider, apiId, apiKey, display);

  el.mpSaveBtn.disabled = true; el.mpSaveBtn.textContent = 'Validating…';
  const res = await api('/model/validate', cfg).catch(() => ({ ok: false, error: 'Bridge unreachable.' }));
  el.mpSaveBtn.disabled = false; el.mpSaveBtn.textContent = 'Save & Switch';

  if (res.ok) {
    state.modelCfg = cfg;
    saveLocalCfg({ model_cfg: cfg });
    await api('/config', { model_cfg: cfg });
    updateModelDisplay();
    closePanel('model-panel');
    addMessage('system-note', `Model switched to ${display}`);
  } else {
    el.mpError.textContent = `✕ ${res.error}`;
  }
});

// ── Brief panel ───────────────────────────────────────────────────────────────
let _currentBrief = null;

function showBriefPanel(brief) {
  _currentBrief   = brief;
  el.briefBody.innerHTML = '';

  const row = (label, value) => {
    const d = document.createElement('div');
    d.className = 'brief-row';
    d.innerHTML = `<span class="brief-key">${label}</span><span class="brief-val">${value}</span>`;
    el.briefBody.appendChild(d);
  };

  const title = document.createElement('div');
  title.className = 'brief-card-title';
  title.textContent = '⚡ Agent Task Brief';
  el.briefBody.appendChild(title);

  row('Task', brief.task || '—');

  if (brief.context?.length) {
    const ul = '<ul>' + brief.context.map(c => `<li>${c}</li>`).join('') + '</ul>';
    row('Context', ul);
  }
  if (brief.files?.length) {
    row('Files', brief.files.map(f => `<code>${f}</code>`).join('<br>'));
  }

  // Show in chat AND open panel
  const inChat = document.createElement('div');
  inChat.className = 'brief-card';
  inChat.innerHTML = el.briefBody.innerHTML;
  el.messages.appendChild(inChat);
  el.messages.parentElement.scrollTop = el.messages.parentElement.scrollHeight;

  openPanel('brief-panel');
}

el.briefExecuteBtn.addEventListener('click', () => {
  if (!_currentBrief) return;

  const fileCount = (_currentBrief.files || []).length;

  // ≤ 2 files → diff-reviewed foreground flow (user sees each change before it's applied)
  // > 2 files → background agent (non-blocking, streams progress, OS notification on done)
  if (fileCount > 2) {
    // Show a quick inline choice so the user stays in control
    const pill = el.briefExecuteBtn;
    const origText = pill.textContent;

    // Swap button to a "confirm background" state
    pill.textContent = `Run ${fileCount} files in background? Click again to confirm`;
    pill.dataset.confirmBg = '1';
    pill.style.background = 'var(--amber)';
    pill.style.color = '#000';

    // Auto-reset after 5 s if user doesn't click again
    const _resetTimer = setTimeout(() => {
      pill.textContent = origText;
      pill.style.background = '';
      pill.style.color = '';
      delete pill.dataset.confirmBg;
    }, 5000);

    // One-shot second-click handler
    const onConfirm = (e) => {
      e.stopImmediatePropagation();
      clearTimeout(_resetTimer);
      pill.textContent = origText;
      pill.style.background = '';
      pill.style.color = '';
      delete pill.dataset.confirmBg;
      pill.removeEventListener('click', onConfirm);
      closePanel('brief-panel');
      runAgentTaskBackground(_currentBrief);
    };
    pill.addEventListener('click', onConfirm, { once: true });

  } else {
    // Small job → foreground diff-reviewed flow
    executeAgentBrief(_currentBrief);
  }
});

// ── Header buttons ────────────────────────────────────────────────────────────
el.hdrRunBtn.addEventListener('click',   () => runAgentTask());
el.hdrClearBtn.addEventListener('click', () => clearChat());
document.getElementById('hdr-term-btn')?.addEventListener('click', toggleTerminal);

// Ctrl+` — toggle terminal
document.addEventListener('keydown', (e) => {
  if ((e.ctrlKey || e.metaKey) && e.key === '`') { e.preventDefault(); toggleTerminal(); }
});

// ══════════════════════════════════════════════════════════════════════════════
// INPUT HANDLING
// ══════════════════════════════════════════════════════════════════════════════

el.msgInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey) {
    // Yield to the autocomplete handler when the dropdown is open
    const drop = document.getElementById('autocomplete-drop');
    if (drop && !drop.classList.contains('hidden') && _acItems.length > 0) return;

    e.preventDefault();
    const text = el.msgInput.value.trim();
    if (text) { el.msgInput.value = ''; autoResize(); sendMessage(text); }
  }
});
el.sendBtn.addEventListener('click', () => {
  const text = el.msgInput.value.trim();
  if (text) { el.msgInput.value = ''; autoResize(); sendMessage(text); }
});

el.msgInput.addEventListener('input', () => {
  autoResize();
  el.charCount.textContent = el.msgInput.value.length > 0 ? `${el.msgInput.value.length} chars` : '';
});

function autoResize() {
  el.msgInput.style.height = 'auto';
  el.msgInput.style.height = Math.min(el.msgInput.scrollHeight, 160) + 'px';
}

// Cmd chips
document.querySelectorAll('.chip').forEach(chip => {
  chip.addEventListener('click', () => {
    const cmd = chip.dataset.cmd;
    el.msgInput.value = '';
    sendMessage(cmd);
  });
});

// ══════════════════════════════════════════════════════════════════════════════
// TITLEBAR
// ══════════════════════════════════════════════════════════════════════════════

$('tb-min').addEventListener('click',   () => window.electronAPI?.minimize());
$('tb-max').addEventListener('click',   () => window.electronAPI?.maximize());
$('tb-close').addEventListener('click', () => {
  // Auto-save brain on close
  if (state.messages.length > 2 && state.modelCfg) {
    api('/brain/distil', { messages: state.messages, model_cfg: state.modelCfg })
      .finally(() => window.electronAPI?.close());
  } else {
    window.electronAPI?.close();
  }
});
el.newSessionBtn.addEventListener('click', () => clearChat());

// ══════════════════════════════════════════════════════════════════════════════
// DISPLAY HELPERS
// ══════════════════════════════════════════════════════════════════════════════

function updateModelDisplay() {
  const name = (state.modelCfg?.display || 'No model').split('(')[0].trim().split('—')[0].trim().split(' ').slice(0,2).join(' ');
  el.modelPillName.textContent = name;
  el.chatModelBadge.textContent = name;
}

function updateSessionHeader() {
  el.chatSessionLabel.textContent = `Session #${state.sessionNum}`;
  el.sbSession.textContent        = `#${state.sessionNum}`;
}

function updateBrainStats(bd) {
  el.sbFacts.textContent = bd.facts?.length    || 0;
  el.sbProj.textContent  = bd.projects?.length || 0;
  el.sbDec.textContent   = bd.decisions?.length || 0;
}

// ══════════════════════════════════════════════════════════════════════════════
// LAUNCH SEQUENCE
// ══════════════════════════════════════════════════════════════════════════════

async function launchApp() {
  el.setupScreen.classList.add('hidden');
  el.loadingScreen.classList.remove('hidden');
  el.loadingFill.style.animation = 'progressFill 1.5s ease forwards';

  await playBootAnimation(null);  // main nova art is not shown yet
  await sleep(300);

  // Load brain
  const bd = await api('/brain').catch(() => ({}));
  state.brainData  = bd;
  state.sessionNum = (bd.session_count || 0) + 1;
  updateBrainStats(bd);
  updateSessionHeader();
  updateModelDisplay();

  el.loadingScreen.classList.add('hidden');
  el.appScreen.classList.remove('hidden');

  // Play boot animation in sidebar NOVA face
  await playBootAnimation(el.novaArt);
  startIdleAnimation();

  // Init all subsystems
  initDragDrop();
  initTheme();
  initUploadButtons();
  initCodeBlockEvents();
  initDiffOverlay();
  await initTerminal();
  initPreview();
  initAutocomplete();
  initSessionsSearch();
  await loadSessionsList();

  // Restore workspace from localStorage
  const savedWs = localStorage.getItem('nova_workspace');
  if (savedWs) {
    state.workspace = savedWs;
    updateWorkspaceUI();
    refreshGitContext();          // fire-and-forget: updates git badge when ready
    indexWorkspaceIfNeeded();    // re-index if not yet indexed (fire-and-forget)
    injectWorkspaceContext();    // prime system prompt from README/CLAUDE.md/package.json
  }

  // Wire up workspace buttons
  el.workspacePickBtn?.addEventListener('click', pickWorkspace);
  el.workspaceGitBtn?.addEventListener('click',  showGitStatus);

  // Seed the context meter (empty at boot)
  updateContextMeter();

  // Bridge heartbeat — shows a reconnect banner if the Python server drops (#3)
  startBridgeHeartbeat();

  // Image paste handler — Ctrl+V / clipboard paste of images (#8)
  initImagePaste();

  // Greeting
  const nMem = (bd.facts?.length || 0) + (bd.projects?.length || 0);
  const greeting = nMem > 0
    ? `Hello! I remember **${nMem}** things about your team and projects. What would you like to build or fix today?`
    : `Hello! I'm NOVA, your IOT St. Kitts coding assistant. Describe what you'd like to build or fix and I'll help you make it happen. Type **\`/help\`** to see all commands.`;

  state.messages = [];
  addMessage('nova', greeting);
  el.msgInput.focus();
}

// ── Bridge heartbeat + reconnect banner (#3) ──────────────────────────────────
let _bridgeBanner = null;
let _heartbeatTimer = null;

function startBridgeHeartbeat() {
  clearInterval(_heartbeatTimer);
  _heartbeatTimer = setInterval(async () => {
    try {
      const h = await api('/health');
      if (h?.ok) {
        _hideBridgeBanner();
      } else {
        _showBridgeBanner();
      }
    } catch {
      _showBridgeBanner();
    }
  }, 30_000);
}

function _showBridgeBanner() {
  if (_bridgeBanner) return;
  _bridgeBanner = document.createElement('div');
  _bridgeBanner.id = 'bridge-banner';
  _bridgeBanner.innerHTML = `
    <span>⚠ Bridge disconnected</span>
    <button id="bridge-reconnect-btn">Reconnect</button>
  `;
  Object.assign(_bridgeBanner.style, {
    position: 'fixed', top: '0', left: '0', right: '0', zIndex: '9999',
    background: '#c0392b', color: '#fff', textAlign: 'center',
    padding: '6px 12px', fontSize: '13px', display: 'flex',
    alignItems: 'center', justifyContent: 'center', gap: '12px',
  });
  document.body.prepend(_bridgeBanner);
  document.getElementById('bridge-reconnect-btn').addEventListener('click', async () => {
    _bridgeBanner.querySelector('span').textContent = '⟳ Reconnecting…';
    try {
      const h = await api('/health');
      if (h?.ok) _hideBridgeBanner();
    } catch { /* still down */ }
  });
}

function _hideBridgeBanner() {
  if (_bridgeBanner) { _bridgeBanner.remove(); _bridgeBanner = null; }
}

// ── Image paste handler (#8) ──────────────────────────────────────────────────
function initImagePaste() {
  document.addEventListener('paste', (e) => {
    if (!el.appScreen || el.appScreen.classList.contains('hidden')) return;
    const items = e.clipboardData?.items;
    if (!items) return;
    for (const item of items) {
      if (!item.type.startsWith('image/')) continue;
      const file = item.getAsFile();
      if (!file) continue;
      e.preventDefault();
      const reader = new FileReader();
      reader.onload = (ev) => {
        const dataUrl = ev.target.result;
        const base64  = dataUrl.split(',')[1];
        const mime    = file.type || 'image/png';
        state.attachments.push({
          id:      crypto.randomUUID(),
          name:    `pasted-${Date.now()}.png`,
          type:    'image',
          content: base64,
          mime,
          preview: dataUrl,
        });
        renderAttachmentChips();
      };
      reader.readAsDataURL(file);
      break;  // only first image per paste
    }
  });
}

async function boot() {
  // Wait for the bridge port from Electron main
  window.electronAPI?.onBridgePort((port) => {
    BRIDGE = `http://127.0.0.1:${port}`;
  });

  // Fetch install paths (used by buildSystemPrompt for dynamic references)
  try {
    const p = await window.electronAPI?.getPaths();
    if (p) state.paths = p;
  } catch {}

  // Brief wait for IPC to fire before we start polling
  await sleep(300);

  // Show loading bar
  el.setupScreen.classList.add('hidden');
  el.loadingScreen.classList.remove('hidden');
  el.loadingFill.style.width = '20%';

  // Poll bridge health — fast interval so startup feels snappy
  let health;
  for (let i = 0; i < 25; i++) {
    try {
      health = await api('/health');
      if (health.ok) break;
    } catch {}
    await sleep(300);
  }

  el.loadingFill.style.width = '70%';

  // Fetch saved config
  const cfg    = await api('/config').catch(() => ({}));
  const saved  = cfg?.model_cfg;
  const authed = health?.authed;

  if (authed && saved) {
    // Returning user — skip animation, go straight to chat
    state.modelCfg = saved;
    el.loadingFill.style.width = '100%';
    await launchApp();
  } else {
    // First run or token expired — show setup wizard
    el.loadingScreen.classList.add('hidden');
    el.setupScreen.classList.remove('hidden');

    if (saved && !authed) {
      // Config exists but token expired — show token step only
      state.modelCfg = saved;
      el.stepToken.classList.remove('hidden');
    }

    await playBootAnimation(el.novaArtSetup);
    setFace('idle', el.novaArtSetup);
    initSetup();
  }
}

// Start
boot();
