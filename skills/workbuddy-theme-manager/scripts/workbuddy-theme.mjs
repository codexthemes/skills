#!/usr/bin/env node

import { closeSync, openSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const scriptPath = fileURLToPath(import.meta.url);
const scriptDir = path.dirname(scriptPath);
const skillDir = path.dirname(scriptDir);
const maxPackageBytes = 30 * 1024 * 1024;
const defaultPort = 9336;
const stateDir = path.join(resolveThemesHome(), 'state');
const statePath = path.join(stateDir, 'workbuddy-runtime.json');
const launchLogPath = path.join(stateDir, 'workbuddy-launch.log');
const exportsDir = path.join(resolveThemesHome(), 'workbuddy-exports');
const idPattern = /^[a-z0-9][a-z0-9-]{0,63}$/;

function resolveThemesHome() {
  return path.resolve(process.env.CODEX_THEMES_HOME?.trim() || path.join(os.homedir(), '.codexthemes'));
}

function assertSafeId(id) {
  if (!idPattern.test(id)) throw new Error(`Invalid theme id: ${JSON.stringify(id)}`);
  return id;
}

function safeColor(value, fallback) {
  return typeof value === 'string' && /^(?:#[0-9a-f]{6}|#[0-9a-f]{3}|rgba?\([0-9.,%\s]+\))$/i.test(value.trim())
    ? value.trim()
    : fallback;
}

function normalizeMode(value) {
  return value === 'dark' ? 'dark' : 'light';
}

function imageMime(filename, declared) {
  const extension = path.extname(filename || '').toLowerCase();
  const inferred = extension === '.png' ? 'image/png'
    : extension === '.jpg' || extension === '.jpeg' ? 'image/jpeg'
      : extension === '.webp' ? 'image/webp' : null;
  const mime = declared || inferred;
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mime)) {
    throw new Error(`Unsupported image type: ${declared || extension || 'unknown'}`);
  }
  return mime;
}

function validateBase64(value, label) {
  if (typeof value !== 'string' || value.length === 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(value)) {
    throw new Error(`${label} is not valid base64`);
  }
  const bytes = Buffer.from(value, 'base64');
  if (bytes.length === 0) throw new Error(`${label} is empty`);
  return bytes;
}

function assertSafeCss(css) {
  if (typeof css !== 'string' || !css.trim()) throw new Error('Theme CSS must be a non-empty string');
  if (/@import\b/i.test(css)) throw new Error('External CSS imports are not allowed');
  if (/url\(\s*["']?\s*(?:https?:|\/\/|file:|javascript:)/i.test(css)) throw new Error('External CSS resources are not allowed');
  if (/<\/?(?:script|style)\b/i.test(css)) throw new Error('HTML or script payloads are not allowed in theme CSS');
}

function validateLegacyPackage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Legacy package must be a JSON object');
  if (value.format !== 'codex-theme' || value.schemaVersion !== 1) throw new Error('Input must be a schemaVersion 1 .codex-theme package');
  const manifest = value.manifest;
  if (!manifest || typeof manifest !== 'object') throw new Error('Legacy package is missing manifest');
  assertSafeId(manifest.id);
  if (typeof manifest.version !== 'string' || !manifest.version.trim()) throw new Error('Legacy manifest.version is required');
  if (typeof value.css !== 'string' || !value.css.trim()) throw new Error('Legacy package is missing CSS');
  if (value.art !== undefined) {
    if (!value.art || typeof value.art !== 'object') throw new Error('Legacy artwork must be an object');
    imageMime(value.art.filename, value.art.mimeType);
    validateBase64(value.art.base64, 'Legacy artwork');
  }
  return value;
}

export function validateWorkBuddyPackage(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('WorkBuddy package must be a JSON object');
  if (value.format !== 'workbuddy-theme' || value.schemaVersion !== 1) throw new Error('Package must be a schemaVersion 1 workbuddy-theme');
  const manifest = value.manifest;
  if (!manifest || typeof manifest !== 'object') throw new Error('Package is missing manifest');
  assertSafeId(manifest.id);
  if (typeof manifest.version !== 'string' || !manifest.version.trim()) throw new Error('manifest.version is required');
  assertSafeCss(value.css);
  const images = value.images ?? {};
  if (!images || typeof images !== 'object' || Array.isArray(images)) throw new Error('images must be an object');
  let decodedBytes = 0;
  for (const [name, image] of Object.entries(images)) {
    if (!/^[A-Za-z0-9_-]{1,32}$/.test(name)) throw new Error(`Invalid image name: ${name}`);
    if (!image || typeof image !== 'object') throw new Error(`Image ${name} must be an object`);
    imageMime(image.filename, image.mimeType);
    decodedBytes += validateBase64(image.base64, `Image ${name}`).length;
  }
  if (decodedBytes > maxPackageBytes) throw new Error('Decoded theme images exceed 30 MB');
  return value;
}

async function readJsonPackage(filename, validator) {
  const resolved = path.resolve(filename.replace(/^~(?=\/)/, os.homedir()));
  const stat = await fs.stat(resolved);
  if (stat.size > maxPackageBytes) throw new Error('Theme package exceeds 30 MB');
  let parsed;
  try {
    parsed = JSON.parse(await fs.readFile(resolved, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot parse ${resolved}: ${error instanceof Error ? error.message : String(error)}`);
  }
  return { filename: resolved, theme: validator(parsed) };
}

function paletteFrom(manifest) {
  const palette = manifest.palette && typeof manifest.palette === 'object' ? manifest.palette : {};
  const mode = normalizeMode(manifest.mode);
  const dark = mode === 'dark';
  return {
    mode,
    canvas: safeColor(palette.canvas, dark ? '#111827' : '#f5f7fb'),
    surface: safeColor(palette.surface, dark ? '#1f2937' : '#ffffff'),
    raised: safeColor(palette.raised, dark ? '#273449' : '#ffffff'),
    text: safeColor(palette.text, dark ? '#f3f4f6' : '#1f2937'),
    muted: safeColor(palette.muted, dark ? '#aab4c3' : '#667085'),
    accent: safeColor(palette.accent, '#5b7cfa'),
    border: safeColor(palette.border, dark ? '#42516a' : '#d7dce5'),
    focus: safeColor(palette.focus, safeColor(palette.accent, '#5b7cfa')),
    danger: safeColor(palette.danger, '#d94c4c'),
    terminalBackground: safeColor(palette.terminalBackground, dark ? '#0b1220' : '#eef2f7'),
    terminalForeground: safeColor(palette.terminalForeground, dark ? '#eef2f7' : '#1f2937'),
  };
}

function replaceTemplate(template, values) {
  return template.replace(/\{\{([A-Za-z][A-Za-z0-9]*)\}\}/g, (match, key) => {
    if (!(key in values)) throw new Error(`Unknown CSS template token: ${key}`);
    return String(values[key]);
  });
}

async function writeConvertedPackage(legacy, input, outputPath, { force = false, sourceFormat = 'codex-theme' } = {}) {
  const manifest = legacy.manifest;
  const palette = paletteFrom(manifest);
  const template = await fs.readFile(path.join(skillDir, 'assets', 'workbuddy.css.template'), 'utf8');
  const css = replaceTemplate(template, { themeId: manifest.id, ...palette });
  assertSafeCss(css);

  const images = {};
  if (legacy.art) {
    images.artwork = {
      filename: path.basename(legacy.art.filename || `artwork.${legacy.art.mimeType === 'image/png' ? 'png' : legacy.art.mimeType === 'image/webp' ? 'webp' : 'jpg'}`),
      mimeType: imageMime(legacy.art.filename, legacy.art.mimeType),
      base64: legacy.art.base64,
    };
  }

  const portable = {
    format: 'workbuddy-theme',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    manifest: {
      id: manifest.id,
      displayName: manifest.displayName || manifest.name || manifest.id,
      description: manifest.description || '',
      version: manifest.version,
      mode: palette.mode,
      source: { format: sourceFormat, themeId: manifest.id, version: manifest.version, filename: path.basename(input) },
      conversion: {
        quality: 'palette-and-artwork',
        note: 'Codex-specific DOM selectors were replaced with WorkBuddy-specific CSS; exact layout-specific styling requires a later authored revision.',
      },
      palette,
      sourceManifest: manifest,
    },
    css,
    images,
  };
  validateWorkBuddyPackage(portable);
  const body = `${JSON.stringify(portable, null, 2)}\n`;
  if (Buffer.byteLength(body) > maxPackageBytes) throw new Error('Converted package exceeds 30 MB');
  const output = path.resolve(outputPath || path.join(exportsDir, `${manifest.id}.workbuddy-theme`));
  if (path.extname(output) !== '.workbuddy-theme') throw new Error('Output filename must end in .workbuddy-theme');
  if (!force) {
    try {
      await fs.access(output);
      throw new Error(`Output already exists: ${output}. Re-run with --force to replace it.`);
    } catch (error) {
      if (error instanceof Error && error.message.startsWith('Output already exists:')) throw error;
      if (error?.code !== 'ENOENT') throw error;
    }
  }
  await fs.mkdir(path.dirname(output), { recursive: true });
  await fs.writeFile(output, body, { mode: 0o600 });
  return {
    status: 'converted',
    input,
    output,
    themeId: manifest.id,
    themeVersion: manifest.version,
    conversionQuality: 'palette-and-artwork',
    artwork: Boolean(legacy.art),
    note: portable.manifest.conversion.note,
  };
}

export async function convertPackage(inputPath, outputPath, options = {}) {
  const { filename: input, theme: legacy } = await readJsonPackage(inputPath, validateLegacyPackage);
  return writeConvertedPackage(legacy, input, outputPath, options);
}

function resolveInside(root, relative, label) {
  if (typeof relative !== 'string' || !relative.trim() || path.isAbsolute(relative)) {
    throw new Error(`${label} must be a non-empty relative path`);
  }
  const resolved = path.resolve(root, relative);
  if (!resolved.startsWith(`${root}${path.sep}`)) throw new Error(`${label} escapes the installed theme directory`);
  return resolved;
}

export async function convertInstalledTheme(input, outputPath, options = {}) {
  const expanded = input.replace(/^~(?=\/)/, os.homedir());
  const themeDir = input.includes(path.sep)
    ? path.resolve(expanded)
    : path.join(resolveThemesHome(), 'themes', assertSafeId(input));
  const manifestPath = path.join(themeDir, 'theme.json');
  let manifest;
  try {
    manifest = JSON.parse(await fs.readFile(manifestPath, 'utf8'));
  } catch (error) {
    throw new Error(`Cannot read installed theme manifest at ${manifestPath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) throw new Error('Installed theme manifest must be an object');
  assertSafeId(manifest.id);
  if (typeof manifest.version !== 'string' || !manifest.version.trim()) throw new Error('Installed theme manifest.version is required');
  const cssPath = resolveInside(themeDir, manifest.css, 'manifest.css');
  const css = await fs.readFile(cssPath, 'utf8');
  if (!css.trim()) throw new Error('Installed theme CSS is empty');

  let art;
  if (manifest.art) {
    const artPath = resolveInside(themeDir, manifest.art, 'manifest.art');
    const mimeType = imageMime(artPath);
    const bytes = await fs.readFile(artPath);
    if (bytes.length === 0) throw new Error('Installed theme artwork is empty');
    art = { filename: path.basename(artPath), mimeType, base64: bytes.toString('base64') };
  }
  const legacy = validateLegacyPackage({ format: 'codex-theme', schemaVersion: 1, manifest, css, ...(art ? { art } : {}) });
  return writeConvertedPackage(legacy, themeDir, outputPath, { ...options, sourceFormat: 'installed-codex-theme' });
}

async function resolveWorkBuddyPackage(input) {
  const expanded = input.replace(/^~(?=\/)/, os.homedir());
  const candidate = input.includes(path.sep) || input.endsWith('.workbuddy-theme')
    ? path.resolve(expanded)
    : path.join(exportsDir, `${assertSafeId(input)}.workbuddy-theme`);
  return readJsonPackage(candidate, validateWorkBuddyPackage);
}

async function readState() {
  try { return JSON.parse(await fs.readFile(statePath, 'utf8')); }
  catch (error) { if (error?.code === 'ENOENT') return undefined; throw error; }
}

async function writeState(state) {
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

async function clearState() {
  await fs.rm(statePath, { force: true });
}

async function targetsAt(port) {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(900) });
    if (!response.ok) return [];
    const targets = await response.json();
    return targets.filter((target) => target.type === 'page' && (
      target.url?.startsWith('vscode-file:')
      || /workbuddy|workbench/i.test(`${target.title || ''} ${target.url || ''}`)
    ));
  } catch { return []; }
}

async function locateTargets(port) {
  const targets = await targetsAt(port);
  return targets.length > 0 ? { port, targets } : undefined;
}

class CdpClient {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message || JSON.stringify(message.error)));
      else waiter.resolve(message.result || {});
    };
    socket.onerror = () => {
      for (const waiter of this.pending.values()) waiter.reject(new Error('WorkBuddy CDP WebSocket failed'));
      this.pending.clear();
    };
  }

  static async connect(url) {
    if (typeof WebSocket === 'undefined') throw new Error('Applying themes requires Node.js 22 or newer (conversion works on older Node.js).');
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.onopen = resolve;
      socket.onerror = () => reject(new Error('Cannot connect to the WorkBuddy renderer'));
    });
    return new CdpClient(socket);
  }

  call(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() { this.socket.close(); }
}

function runtimeSource(theme) {
  const image = theme.images?.artwork;
  const imageUrl = image ? `data:${image.mimeType};base64,${image.base64}` : null;
  const config = JSON.stringify({ id: theme.manifest.id, css: theme.css, imageUrl });
  return `(() => {
    const config = ${config};
    const key = '__workbuddyThemesRuntime';
    const styleId = 'workbuddy-themes-runtime-style';
    const clear = () => {
      document.getElementById(styleId)?.remove();
      document.documentElement.classList.remove('workbuddy-themes-host');
      delete document.documentElement.dataset.workbuddyTheme;
      delete globalThis[key];
    };
    const install = () => {
      clear();
      const root = document.documentElement;
      root.classList.add('workbuddy-themes-host');
      root.dataset.workbuddyTheme = config.id;
      const imageCss = config.imageUrl
        ? ':root { --workbuddy-theme-artwork: url(' + JSON.stringify(config.imageUrl) + '); }\\n'
        : ':root { --workbuddy-theme-artwork: none; }\\n';
      const style = document.createElement('style');
      style.id = styleId;
      style.dataset.workbuddyThemesOwned = 'true';
      style.textContent = imageCss + config.css;
      (document.head || root).appendChild(style);
      globalThis[key] = { themeId: config.id };
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
    else install();
  })()`;
}

const restoreSource = `(() => {
  document.getElementById('workbuddy-themes-runtime-style')?.remove();
  document.documentElement.classList.remove('workbuddy-themes-host');
  delete document.documentElement.dataset.workbuddyTheme;
  delete globalThis.__workbuddyThemesRuntime;
})()`;

function stateRegistrations(state) {
  return Array.isArray(state?.registrations) ? state.registrations : [];
}

async function injectTarget(target, previous, source) {
  const client = await CdpClient.connect(target.webSocketDebuggerUrl);
  try {
    for (const registration of previous) {
      if (registration.targetId === target.id) {
        await client.call('Page.removeScriptToEvaluateOnNewDocument', { identifier: registration.identifier }).catch(() => undefined);
      }
    }
    await client.call('Page.enable');
    const added = await client.call('Page.addScriptToEvaluateOnNewDocument', { source });
    await client.call('Runtime.evaluate', { expression: source, awaitPromise: true });
    return { targetId: target.id, identifier: added.identifier };
  } finally { client.close(); }
}

async function probeTarget(target) {
  const client = await CdpClient.connect(target.webSocketDebuggerUrl);
  try {
    const result = await client.call('Runtime.evaluate', {
      expression: `JSON.stringify({ themeId: document.documentElement.dataset.workbuddyTheme || null, style: Boolean(document.getElementById('workbuddy-themes-runtime-style')) })`,
      returnByValue: true,
    });
    return JSON.parse(result.result?.value || '{}');
  } finally { client.close(); }
}

async function detectApp(explicit) {
  const candidates = explicit ? [path.resolve(explicit)] : process.platform === 'darwin'
    ? ['/Applications/WorkBuddy.app', path.join(os.homedir(), 'Applications', 'WorkBuddy.app')]
    : process.platform === 'win32' && process.env.LOCALAPPDATA
      ? [path.join(process.env.LOCALAPPDATA, 'Programs', 'WorkBuddy', 'WorkBuddy.exe'), path.join(process.env.LOCALAPPDATA, 'WorkBuddy', 'WorkBuddy.exe')]
      : [];
  for (const candidate of candidates) {
    try { await fs.access(candidate); return candidate; } catch { /* continue */ }
  }
  throw new Error('Cannot find WorkBuddy; pass --app-path with its application path');
}

async function appRunning(app) {
  try {
    if (process.platform === 'win32') {
      const { stdout } = await execFileAsync('tasklist', ['/FI', `IMAGENAME eq ${path.basename(app)}`]);
      return stdout.toLowerCase().includes(path.basename(app).toLowerCase());
    }
    await execFileAsync('pgrep', ['-f', `${app}/Contents/MacOS/`]);
    return true;
  } catch { return false; }
}

async function quitApp(app) {
  if (process.platform === 'win32') await execFileAsync('taskkill', ['/IM', path.basename(app)]).catch(() => undefined);
  else await execFileAsync('osascript', ['-e', 'tell application "WorkBuddy" to quit']).catch(() => undefined);
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (!(await appRunning(app))) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error('WorkBuddy did not quit within 45 seconds');
}

async function launchApp(port, explicit) {
  const app = await detectApp(explicit);
  await quitApp(app);
  const flags = ['--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${port}`];
  const child = process.platform === 'darwin'
    ? spawn('open', ['-na', app, '--args', ...flags], { detached: true, stdio: 'ignore' })
    : process.platform === 'win32'
      ? spawn(app, flags, { detached: true, stdio: 'ignore' })
      : null;
  if (!child) throw new Error('--launch supports macOS and Windows only');
  child.unref();
  return app;
}

async function waitForTargets(port) {
  const deadline = Date.now() + 35_000;
  while (Date.now() < deadline) {
    const found = await locateTargets(port);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`WorkBuddy did not expose a renderer on 127.0.0.1:${port}`);
}

async function scheduleLaunch(options, packagePath) {
  await fs.mkdir(stateDir, { recursive: true });
  const logFd = openSync(launchLogPath, 'w');
  const args = [scriptPath, 'apply', packagePath, '--launch', '--worker', '--port', String(options.port)];
  if (options.appPath) args.push('--app-path', options.appPath);
  const child = spawn(process.execPath, args, { detached: true, stdio: ['ignore', logFd, logFd] });
  child.unref();
  closeSync(logFd);
  return { status: 'scheduled', themeId: options.themeId, logPath: launchLogPath, note: 'WorkBuddy restart and theme injection were delegated to a detached helper; verify with the status command.' };
}

async function applyTheme(input, options) {
  const { filename, theme } = await resolveWorkBuddyPackage(input);
  options.themeId = theme.manifest.id;
  let found = await locateTargets(options.port);
  if (!found) {
    if (!options.launch) throw new Error(`No debuggable WorkBuddy renderer found on 127.0.0.1:${options.port}. After explicit restart permission, rerun with --launch.`);
    if (!options.worker) return scheduleLaunch(options, filename);
    await launchApp(options.port, options.appPath);
    found = await waitForTargets(options.port);
  }
  const previousState = await readState();
  const previous = stateRegistrations(previousState);
  const source = runtimeSource(theme);
  const registrations = [];
  for (const target of found.targets) registrations.push(await injectTarget(target, previous, source));
  await writeState({ port: found.port, themeId: theme.manifest.id, packagePath: filename, registrations });
  const pages = [];
  for (const target of found.targets) pages.push({ targetId: target.id, ...(await probeTarget(target)) });
  return { status: pages.every((page) => page.themeId === theme.manifest.id && page.style) ? 'active' : 'partial', themeId: theme.manifest.id, port: found.port, pages };
}

async function status(options) {
  const state = await readState();
  const found = await locateTargets(state?.port || options.port);
  const pages = [];
  if (found) for (const target of found.targets) pages.push({ targetId: target.id, ...(await probeTarget(target)) });
  const ids = [...new Set(pages.map((page) => page.themeId).filter(Boolean))];
  return {
    status: pages.length > 0 && pages.every((page) => page.style) && ids.length === 1 ? 'active' : pages.some((page) => page.style) ? 'partial' : 'inactive',
    themeId: ids.length === 1 ? ids[0] : ids,
    pages,
    debugEndpoint: found ? `127.0.0.1:${found.port}` : null,
    recordedState: state || null,
    launchLog: launchLogPath,
  };
}

async function restore(options) {
  const state = await readState();
  const found = await locateTargets(state?.port || options.port);
  if (!found) {
    await clearState();
    return { status: 'inactive', note: 'WorkBuddy renderer is unavailable; local runtime state was cleared.' };
  }
  const registrations = stateRegistrations(state);
  for (const target of found.targets) {
    const client = await CdpClient.connect(target.webSocketDebuggerUrl);
    try {
      for (const registration of registrations) {
        if (registration.targetId === target.id) await client.call('Page.removeScriptToEvaluateOnNewDocument', { identifier: registration.identifier }).catch(() => undefined);
      }
      await client.call('Runtime.evaluate', { expression: restoreSource, awaitPromise: true });
    } finally { client.close(); }
  }
  await clearState();
  return { status: 'inactive', restoredThemeId: state?.themeId || null, pagesRestored: found.targets.length };
}

function parseArgs(argv) {
  const command = argv.shift();
  if (!['convert', 'convert-installed', 'inspect', 'list', 'apply', 'status', 'restore'].includes(command)) {
    throw new Error('Usage: workbuddy-theme.mjs <convert|convert-installed|inspect|list|apply|status|restore> [input] [--output file] [--force] [--launch] [--port 9336] [--app-path path]');
  }
  const options = { command, input: undefined, output: undefined, force: false, launch: false, worker: false, port: defaultPort, appPath: undefined };
  if (['convert', 'convert-installed', 'inspect', 'apply'].includes(command) && argv[0] && !argv[0].startsWith('--')) options.input = argv.shift();
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--output') options.output = argv[++index];
    else if (arg === '--force') options.force = true;
    else if (arg === '--launch') options.launch = true;
    else if (arg === '--worker') options.worker = true;
    else if (arg === '--port') options.port = Number(argv[++index]);
    else if (arg === '--app-path') options.appPath = argv[++index];
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (['convert', 'convert-installed', 'inspect', 'apply'].includes(command) && !options.input) throw new Error(`${command} requires an input path or theme id`);
  if (!Number.isInteger(options.port) || options.port < 1024 || options.port > 65535) throw new Error('--port must be between 1024 and 65535');
  if (options.output && !options.output.endsWith('.workbuddy-theme')) throw new Error('--output must end in .workbuddy-theme');
  return options;
}

async function listPackages() {
  let entries = [];
  try { entries = await fs.readdir(exportsDir); } catch (error) { if (error?.code !== 'ENOENT') throw error; }
  const themes = [];
  for (const entry of entries.filter((name) => name.endsWith('.workbuddy-theme')).sort()) {
    try {
      const { theme } = await readJsonPackage(path.join(exportsDir, entry), validateWorkBuddyPackage);
      themes.push({ id: theme.manifest.id, displayName: theme.manifest.displayName || theme.manifest.id, version: theme.manifest.version, path: path.join(exportsDir, entry) });
    } catch { /* skip invalid package */ }
  }
  return { themes, themesRoot: exportsDir };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  let result;
  if (options.command === 'convert') result = await convertPackage(options.input, options.output, options);
  else if (options.command === 'convert-installed') result = await convertInstalledTheme(options.input, options.output, options);
  else if (options.command === 'inspect') {
    const { filename, theme } = await readJsonPackage(options.input, validateWorkBuddyPackage);
    result = { path: filename, format: theme.format, schemaVersion: theme.schemaVersion, manifest: theme.manifest, images: Object.keys(theme.images || {}), cssBytes: Buffer.byteLength(theme.css) };
  } else if (options.command === 'list') result = await listPackages();
  else if (options.command === 'apply') result = await applyTheme(options.input, options);
  else if (options.command === 'status') result = await status(options);
  else result = await restore(options);
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
