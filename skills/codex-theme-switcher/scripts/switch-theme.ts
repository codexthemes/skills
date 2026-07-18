#!/usr/bin/env -S npx tsx

import { closeSync, openSync } from 'node:fs';
import fs from 'node:fs/promises';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { runtimeStatePath, stateRoot, themesRoot } from './paths.ts';
import { decodePng, judgeSamples, textSamplerSource, type ReadabilityResult, type TextSample } from './readability.ts';

type Command = 'list' | 'apply' | 'status' | 'restore' | 'rollback';

interface Options {
  command: Command;
  theme?: string;
  port: number;
  launch: boolean;
  /** Force a clean quit+relaunch even when a debugging endpoint is already live. */
  relaunch: boolean;
  /** Keep the theme active even when the readability check fails. */
  force: boolean;
  app?: string;
  /** Internal: run the quit/relaunch/inject sequence inline (used by the detached helper). */
  worker: boolean;
}

interface Target {
  id: string;
  title: string;
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
}

interface Registration {
  targetId: string;
  identifier: string;
}

interface RuntimeState {
  port: number;
  themeId: string;
  /** Theme that was active before the current one; rollback returns to it. */
  previousThemeId?: string | null;
  registrations?: Registration[];
  /** Legacy single-target fields kept for compatibility with older applies. */
  targetId?: string;
  scriptIdentifier?: string;
}

const execFileAsync = promisify(execFile);
const statePath = runtimeStatePath();
const defaultPorts = [9335, 9222, 9223];

function parseArgs(argv: string[]): Options {
  const command = argv.shift() as Command | undefined;
  if (!command || !['list', 'apply', 'status', 'restore', 'rollback'].includes(command)) {
    throw new Error('Usage: switch-theme.ts <list|apply THEME_ID_OR_DIR|status|restore|rollback> [--port 9335] [--launch] [--relaunch] [--app /Applications/Codex.app]');
  }
  const options: Options = { command, port: 9335, launch: false, relaunch: false, force: false, worker: false };
  if (command === 'apply' && argv[0] && !argv[0].startsWith('--')) {
    options.theme = argv.shift()!;
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--port') {
      const port = Number(argv[++index]);
      if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('--port must be between 1024 and 65535');
      options.port = port;
    } else if (arg === '--launch') {
      options.launch = true;
    } else if (arg === '--relaunch') {
      options.relaunch = true;
    } else if (arg === '--force') {
      options.force = true;
    } else if (arg === '--launch-worker') {
      options.worker = true;
    } else if (arg === '--app') {
      const app = argv[++index];
      if (!app) throw new Error('--app requires a path');
      options.app = path.resolve(app);
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  if (command === 'apply' && !options.theme) throw new Error('apply requires a theme id from the managed library or an absolute theme directory');
  return options;
}

export async function resolveThemeDir(theme: string): Promise<string> {
  const candidates = theme.includes(path.sep) || theme.startsWith('~')
    ? [path.resolve(theme.replace(/^~(?=\/)/, process.env.HOME || '~'))]
    : [path.join(themesRoot(), theme), path.resolve(theme)];
  for (const candidate of candidates) {
    try {
      await fs.access(path.join(candidate, 'theme.json'));
      return candidate;
    } catch { /* try the next candidate */ }
  }
  throw new Error(
    `Cannot find theme "${theme}". Expected ${path.join(themesRoot(), theme)}/theme.json or an absolute theme directory. ` +
    'List installed themes with: switch-theme.ts list',
  );
}

interface ThemeManifest {
  id: string;
  name?: string;
  css: string;
  design?: { layoutMode?: string; backgroundScope?: string };
}

async function readManifest(themeDir: string): Promise<ThemeManifest> {
  const manifest = JSON.parse(await fs.readFile(path.join(themeDir, 'theme.json'), 'utf8')) as ThemeManifest;
  if (typeof manifest.id !== 'string' || typeof manifest.css !== 'string') {
    throw new Error(`${themeDir}/theme.json is missing id or css`);
  }
  return manifest;
}

export async function listThemes(): Promise<Array<{ id: string; name: string; layoutMode: string; themeDir: string }>> {
  let entries: string[] = [];
  try {
    entries = await fs.readdir(themesRoot());
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return [];
    throw error;
  }
  const themes: Array<{ id: string; name: string; layoutMode: string; themeDir: string }> = [];
  for (const entry of entries.sort()) {
    const themeDir = path.join(themesRoot(), entry);
    try {
      const manifest = await readManifest(themeDir);
      themes.push({
        id: manifest.id,
        name: manifest.name ?? manifest.id,
        layoutMode: manifest.design?.layoutMode ?? 'unknown',
        themeDir,
      });
    } catch { /* skip non-theme directories */ }
  }
  return themes;
}

async function readJson<T>(filename: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readFile(filename, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

function stateRegistrations(state: RuntimeState | undefined): Registration[] {
  if (!state) return [];
  if (state.registrations?.length) return state.registrations;
  if (state.targetId && state.scriptIdentifier) return [{ targetId: state.targetId, identifier: state.scriptIdentifier }];
  return [];
}

async function writeState(state: RuntimeState): Promise<void> {
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

async function clearState(): Promise<void> {
  await fs.rm(statePath, { force: true });
}

async function targetsAt(port: number): Promise<Target[]> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(800) });
    if (!response.ok) return [];
    return (await response.json()) as Target[];
  } catch {
    return [];
  }
}

function appPages(targets: Target[]): Target[] {
  return targets.filter((target) => target.type === 'page' && target.url.startsWith('app://'));
}

async function locateTargets(preferredPort: number): Promise<{ port: number; targets: Target[] } | undefined> {
  for (const port of [...new Set([preferredPort, ...defaultPorts])]) {
    const pages = appPages(await targetsAt(port));
    if (pages.length > 0) return { port, targets: pages };
  }
  return undefined;
}

async function detectMacApp(explicit?: string): Promise<string> {
  const candidates = explicit ? [explicit] : ['/Applications/Codex.app', '/Applications/ChatGPT.app'];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch { /* try the next candidate */ }
  }
  throw new Error('Cannot find Codex.app or ChatGPT.app; pass --app with the application path');
}

async function detectWindowsApp(explicit?: string): Promise<string> {
  if (explicit) {
    await fs.access(explicit);
    return explicit;
  }
  // Prefer the path of a running instance — it works for every install kind.
  for (const name of ['Codex', 'ChatGPT']) {
    try {
      const { stdout } = await execFileAsync('powershell', [
        '-NoProfile', '-Command',
        `(Get-Process -Name ${name} -ErrorAction SilentlyContinue | Where-Object Path | Select-Object -First 1).Path`,
      ]);
      const found = stdout.trim();
      if (found) return found;
    } catch { /* try the next name */ }
  }
  const local = process.env.LOCALAPPDATA;
  const candidates = local ? [
    path.join(local, 'Programs', 'Codex', 'Codex.exe'),
    path.join(local, 'Programs', 'ChatGPT', 'ChatGPT.exe'),
    path.join(local, 'Microsoft', 'WindowsApps', 'Codex.exe'),
    path.join(local, 'Microsoft', 'WindowsApps', 'ChatGPT.exe'),
  ] : [];
  for (const candidate of candidates) {
    try {
      await fs.access(candidate);
      return candidate;
    } catch { /* try the next candidate */ }
  }
  throw new Error('Cannot find the Codex/ChatGPT executable; pass --app with the full path to the .exe');
}

async function mainProcessRunning(app: string): Promise<boolean> {
  if (process.platform === 'win32') {
    const image = path.basename(app);
    try {
      const { stdout } = await execFileAsync('tasklist', ['/FI', `IMAGENAME eq ${image}`]);
      return stdout.toLowerCase().includes(image.toLowerCase());
    } catch {
      return false;
    }
  }
  try {
    await execFileAsync('pgrep', ['-f', `${app}/Contents/MacOS/`]);
    return true;
  } catch {
    return false;
  }
}

async function quitAndWait(app: string): Promise<void> {
  const appName = path.basename(app, process.platform === 'win32' ? '.exe' : '.app');
  if (process.platform === 'win32') {
    // Graceful close (no /F): the app must exit cleanly, not be killed.
    await execFileAsync('taskkill', ['/IM', path.basename(app)]).catch(() => undefined);
  } else {
    await execFileAsync('osascript', ['-e', `tell application ${JSON.stringify(appName)} to quit`]).catch(() => undefined);
  }
  // The debugging flags only take effect on a fresh instance. If the old
  // instance is still shutting down it holds the Chromium profile singleton
  // lock, and the relaunched instance silently defers to it and exits.
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (!(await mainProcessRunning(app))) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${appName} did not quit within 45s. Quit it manually, then rerun apply with --launch.`);
}

const debugFlags = (port: number) => ['--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${port}`];

async function launchWithDebugging(port: number, explicitApp?: string): Promise<string> {
  if (process.platform === 'darwin') {
    const app = await detectMacApp(explicitApp);
    await quitAndWait(app);
    const child = spawn('open', ['-na', app, '--args', ...debugFlags(port)], { detached: true, stdio: 'ignore' });
    child.unref();
    return app;
  }
  if (process.platform === 'win32') {
    const app = await detectWindowsApp(explicitApp);
    await quitAndWait(app);
    const child = spawn(app, debugFlags(port), { detached: true, stdio: 'ignore' });
    child.unref();
    return app;
  }
  throw new Error('--launch supports macOS and Windows. Start Codex with --remote-debugging-address=127.0.0.1 and --remote-debugging-port manually, then rerun without --launch.');
}

async function mainProcessCommandLine(app: string): Promise<string> {
  try {
    if (process.platform === 'win32') {
      const image = path.basename(app);
      const { stdout } = await execFileAsync('powershell', [
        '-NoProfile', '-Command',
        `(Get-CimInstance Win32_Process -Filter "Name='${image}'" | Select-Object -First 1).CommandLine`,
      ]);
      return stdout.trim();
    }
    const { stdout } = await execFileAsync('pgrep', ['-fl', `${app}/Contents/MacOS/`]);
    return stdout.split('\n')[0] ?? '';
  } catch {
    return '';
  }
}

/** Turn a silent endpoint timeout into a definite, actionable diagnosis. */
async function launchDiagnostics(app: string): Promise<string> {
  if (!(await mainProcessRunning(app))) {
    return 'Diagnosis: the app is NOT running after the relaunch — launching it failed. Verify the application path (pass --app explicitly) and launch it manually once to check it starts at all.';
  }
  const commandLine = await mainProcessCommandLine(app);
  if (commandLine.includes('--remote-debugging-port')) {
    return 'Diagnosis: the app is running WITH the debugging flags on its command line but never opened the endpoint — this build ignores or strips --remote-debugging-port (common for store-packaged builds). This installation cannot be themed; report that limitation plainly instead of retrying.';
  }
  return 'Diagnosis: the app is running WITHOUT the debugging flags — an old instance held the profile singleton lock during the relaunch and the flagged instance deferred to it and exited. Retry with: apply ... --launch --relaunch';
}

async function waitForTargetsOrDiagnose(app: string, port: number): Promise<{ port: number; targets: Target[] }> {
  try {
    return await waitForTargets(port);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${message}\n${await launchDiagnostics(app)}`);
  }
}

async function waitForTargets(port: number, timeoutMs = 30_000): Promise<{ port: number; targets: Target[] }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = await locateTargets(port);
    if (found) return found;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(
    `Codex did not expose a debuggable app page on 127.0.0.1:${port}. ` +
    'If the app is running, either an old instance was still holding the profile lock during relaunch, or this build ignores --remote-debugging-port.',
  );
}

class CdpClient {
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (reason: Error) => void }>();

  private constructor(private socket: WebSocket) {
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message ?? JSON.stringify(message.error)));
      else waiter.resolve(message.result ?? {});
    };
    socket.onerror = () => {
      for (const waiter of this.pending.values()) waiter.reject(new Error('CDP WebSocket failed'));
      this.pending.clear();
    };
  }

  static async connect(url: string): Promise<CdpClient> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error('Cannot connect to the Codex renderer'));
    });
    return new CdpClient(socket);
  }

  call(method: string, params: Record<string, unknown> = {}): Promise<any> {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close(): void {
    this.socket.close();
  }
}

function mimeType(filename: string): string {
  const extension = path.extname(filename).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  if (extension === '.svg') return 'image/svg+xml';
  if (extension === '.woff2') return 'font/woff2';
  throw new Error(`Unsupported local CSS asset: ${extension || filename}`);
}

export async function inlineLocalAssets(css: string, themeDir: string): Promise<string> {
  const matches = [...css.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/g)];
  let output = css;
  for (const match of matches) {
    const reference = match[2]!.trim();
    if (/^(?:data:|blob:|#)/i.test(reference)) continue;
    if (/^(?:https?:|\/\/|file:)/i.test(reference)) throw new Error(`External CSS asset is not allowed: ${reference}`);
    const filename = path.resolve(themeDir, reference);
    if (!filename.startsWith(`${themeDir}${path.sep}`)) throw new Error(`CSS asset escapes the theme directory: ${reference}`);
    const data = await fs.readFile(filename);
    const dataUrl = `data:${mimeType(filename)};base64,${data.toString('base64')}`;
    output = output.replaceAll(match[0], `url("${dataUrl}")`);
  }
  return output;
}

export function runtimeSource(themeId: string, backgroundScope: string, css: string): string {
  const config = JSON.stringify({ themeId, backgroundScope, css });
  return `(() => {
    const config = ${config};
    const key = '__codexThemesRuntime';
    const styleId = 'codexthemes-runtime-style';
    const clear = () => {
      const previous = globalThis[key];
      if (previous?.observer) previous.observer.disconnect();
      if (previous?.frame) cancelAnimationFrame(previous.frame);
      document.getElementById(styleId)?.remove();
      delete document.documentElement.dataset.codexthemesTheme;
      delete document.documentElement.dataset.codexthemesBackgroundScope;
      document.querySelectorAll('[data-codexthemes-page]').forEach((node) => node.removeAttribute('data-codexthemes-page'));
    };
    const install = () => {
      clear();
      const root = document.documentElement;
      root.dataset.codexthemesTheme = config.themeId;
      root.dataset.codexthemesBackgroundScope = config.backgroundScope;
      const style = document.createElement('style');
      style.id = styleId;
      style.dataset.codexthemesOwned = 'true';
      style.textContent = config.css;
      (document.head || root).appendChild(style);
      const classify = () => {
        const main = document.querySelector('main.main-surface');
        document.querySelectorAll('main[data-codexthemes-page]').forEach((node) => {
          if (node !== main) node.removeAttribute('data-codexthemes-page');
        });
        if (!main) return;
        const hasConversation = Boolean(main.querySelector('[data-thread-user-message-navigation-item-id]'));
        const hasComposer = Boolean(main.querySelector('[data-composer-navigation-target]'));
        main.dataset.codexthemesPage = hasConversation ? 'conversation' : hasComposer ? 'home' : 'system';
      };
      const state = { observer: undefined, frame: 0 };
      const schedule = () => {
        if (state.frame) return;
        state.frame = requestAnimationFrame(() => { state.frame = 0; classify(); });
      };
      state.observer = new MutationObserver(schedule);
      state.observer.observe(document.documentElement, { childList: true, subtree: true });
      globalThis[key] = state;
      classify();
    };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', install, { once: true });
    else install();
  })();`;
}

const restoreSource = `(() => {
  const state = globalThis.__codexThemesRuntime;
  if (state?.observer) state.observer.disconnect();
  if (state?.frame) cancelAnimationFrame(state.frame);
  delete globalThis.__codexThemesRuntime;
  document.getElementById('codexthemes-runtime-style')?.remove();
  delete document.documentElement.dataset.codexthemesTheme;
  delete document.documentElement.dataset.codexthemesBackgroundScope;
  document.querySelectorAll('[data-codexthemes-page]').forEach((node) => node.removeAttribute('data-codexthemes-page'));
})()`;

export function launchLogPath(): string {
  return path.join(stateRoot(), 'launch.log');
}

/**
 * Run the quit → relaunch → inject sequence in a detached helper process.
 * When the applying agent is hosted inside Codex itself, quitting Codex kills
 * the agent's tool call before the relaunch can happen. The helper starts its
 * own session, so it survives the restart; its output lands in launch.log.
 */
async function scheduleDetachedLaunch(options: Options, themeDir: string): Promise<void> {
  await fs.mkdir(stateRoot(), { recursive: true });
  const logPath = launchLogPath();
  const logFd = openSync(logPath, 'w');
  const args = [
    ...process.execArgv,
    process.argv[1]!,
    'apply', themeDir,
    '--launch', '--launch-worker',
    ...(options.relaunch ? ['--relaunch'] : []),
    ...(options.force ? ['--force'] : []),
    '--port', String(options.port),
    ...(options.app ? ['--app', options.app] : []),
  ];
  const child = spawn(process.execPath, args, { detached: true, stdio: ['ignore', logFd, logFd] });
  child.unref();
  closeSync(logFd);
  console.log(JSON.stringify({
    status: 'scheduled',
    note: 'Codex is restarting with the debugging endpoint; a detached helper that survives the restart will inject the theme. This tool call may be interrupted by the restart. Afterwards verify with: switch-theme.ts status',
    logPath,
  }, null, 2));
}

async function injectIntoTarget(target: Target, previous: Registration[], source: string): Promise<Registration> {
  const client = await CdpClient.connect(target.webSocketDebuggerUrl);
  try {
    for (const registration of previous) {
      if (registration.targetId === target.id) {
        await client.call('Page.removeScriptToEvaluateOnNewDocument', { identifier: registration.identifier }).catch(() => undefined);
      }
    }
    await client.call('Page.enable');
    const registration = await client.call('Page.addScriptToEvaluateOnNewDocument', { source });
    await client.call('Runtime.evaluate', { expression: source, awaitPromise: true });
    return { targetId: target.id, identifier: registration.identifier };
  } finally {
    client.close();
  }
}

async function apply(options: Options): Promise<void> {
  const themeDir = await resolveThemeDir(options.theme!);
  const manifest = await readManifest(themeDir);
  const css = await inlineLocalAssets(await fs.readFile(path.join(themeDir, manifest.css), 'utf8'), themeDir);
  const backgroundScope = manifest.design?.backgroundScope ?? 'home';

  let found = await locateTargets(options.port);
  // --relaunch forces a clean quit+relaunch even when an endpoint is live:
  // it evicts stale sessions from earlier tasks whose on-new-document
  // registrations keep re-injecting an old theme that a hot swap cannot
  // remove (their identifiers belong to other CDP sessions).
  if (!found || options.relaunch) {
    if (!options.launch) {
      throw new Error(found
        ? 'A live endpoint exists; --relaunch also requires --launch (and the user\'s explicit restart permission).'
        : 'No debuggable Codex renderer found. With explicit restart permission, rerun with --launch; no external theme program is required.');
    }
    if (!options.worker) {
      await scheduleDetachedLaunch(options, themeDir);
      return;
    }
    const app = await launchWithDebugging(options.port, options.app);
    found = await waitForTargetsOrDiagnose(app, options.port);
  }

  const source = runtimeSource(manifest.id, backgroundScope, css);
  const previousState = await readJson<RuntimeState>(statePath);
  const previous = stateRegistrations(previousState);
  const registrations: Registration[] = [];
  // Theme every app page, not just the first one /json/list happens to return;
  // a single-window assumption previously themed one window while status
  // probed another, producing conflicting evidence.
  for (const target of found.targets) {
    registrations.push(await injectIntoTarget(target, previous, source));
  }

  // Readability gate: measure the real rendered pixels. A theme that leaves
  // text unreadable must never stay on the user's screen.
  await new Promise((resolve) => setTimeout(resolve, 1500));
  const failures: ReadabilityResult[] = [];
  for (const target of found.targets) {
    failures.push(...(await checkReadability(target)));
  }
  if (failures.length >= 2 && !options.force) {
    const revertedTo = await revertAfterFailedApply(found.port, found.targets, registrations, previousState, manifest.id);
    console.log(JSON.stringify({
      status: 'reverted',
      appliedThemeId: manifest.id,
      revertedTo,
      reason: 'readability check failed: the applied theme leaves visible text unreadable on the live pages',
      failures: failures.slice(0, 10),
      note: 'The theme is broken as shipped — report this to the user and suggest fixing it with codex-theme-creator. Re-run with --force only if the user explicitly wants to keep it anyway.',
    }, null, 2));
    process.exitCode = 1;
    return;
  }

  await writeState({
    port: found.port,
    themeId: manifest.id,
    previousThemeId:
      previousState?.themeId && previousState.themeId !== manifest.id
        ? previousState.themeId
        : previousState?.previousThemeId ?? null,
    registrations,
    ...(registrations[0] ? { targetId: registrations[0].targetId, scriptIdentifier: registrations[0].identifier } : {}),
  });
  console.log(JSON.stringify({
    status: 'active',
    themeId: manifest.id,
    port: found.port,
    pagesThemed: registrations.length,
    readability: failures.length === 0 ? 'pass' : { failed: failures.length, kept: true, worst: failures.slice(0, 5) },
  }, null, 2));
}

async function checkReadability(target: Target): Promise<ReadabilityResult[]> {
  const client = await CdpClient.connect(target.webSocketDebuggerUrl);
  try {
    const sampled = await client.call('Runtime.evaluate', { expression: textSamplerSource, returnByValue: true });
    const parsed = JSON.parse(sampled.result.value) as { samples: TextSample[]; viewportWidth: number };
    const shot = await client.call('Page.captureScreenshot', { format: 'png' });
    const image = decodePng(Buffer.from(shot.data, 'base64'));
    return judgeSamples(image, parsed.samples.filter((sample) => sample.size >= 9), parsed.viewportWidth)
      .filter((result) => result.ratio < 2.5);
  } catch {
    // A failed measurement must not block applying; the gate only acts on
    // positive evidence of unreadable text.
    return [];
  } finally {
    client.close();
  }
}

async function revertAfterFailedApply(
  port: number,
  targets: Target[],
  failedRegistrations: Registration[],
  previousState: RuntimeState | undefined,
  failedThemeId: string,
): Promise<string> {
  const fallbackId = previousState?.themeId;
  if (fallbackId && fallbackId !== failedThemeId) {
    try {
      const prevDir = await resolveThemeDir(fallbackId);
      const prevManifest = await readManifest(prevDir);
      const prevCss = await inlineLocalAssets(await fs.readFile(path.join(prevDir, prevManifest.css), 'utf8'), prevDir);
      const prevSource = runtimeSource(prevManifest.id, prevManifest.design?.backgroundScope ?? 'home', prevCss);
      const prevRegistrations: Registration[] = [];
      for (const target of targets) {
        prevRegistrations.push(await injectIntoTarget(target, failedRegistrations, prevSource));
      }
      await writeState({
        port,
        themeId: prevManifest.id,
        previousThemeId: previousState?.previousThemeId ?? null,
        registrations: prevRegistrations,
        ...(prevRegistrations[0] ? { targetId: prevRegistrations[0].targetId, scriptIdentifier: prevRegistrations[0].identifier } : {}),
      });
      return prevManifest.id;
    } catch { /* fall through to native restore */ }
  }
  for (const target of targets) {
    const client = await CdpClient.connect(target.webSocketDebuggerUrl);
    try {
      for (const registration of failedRegistrations) {
        if (registration.targetId === target.id) {
          await client.call('Page.removeScriptToEvaluateOnNewDocument', { identifier: registration.identifier }).catch(() => undefined);
        }
      }
      await client.call('Runtime.evaluate', { expression: restoreSource, awaitPromise: true });
    } finally {
      client.close();
    }
  }
  await clearState();
  return 'native';
}

async function probeTarget(target: Target): Promise<string | null> {
  const client = await CdpClient.connect(target.webSocketDebuggerUrl);
  try {
    const evaluated = await client.call('Runtime.evaluate', {
      expression: "document.documentElement.dataset.codexthemesTheme ?? ''",
      returnByValue: true,
    });
    return evaluated.result?.value || null;
  } finally {
    client.close();
  }
}

async function status(options: Options): Promise<void> {
  const state = await readJson<RuntimeState>(statePath);
  const found = await locateTargets(state?.port ?? options.port);
  const pages: Array<{ targetId: string; themeId: string | null }> = [];
  if (found) {
    for (const target of found.targets) {
      pages.push({ targetId: target.id, themeId: await probeTarget(target) });
    }
  }
  const themed = pages.filter((page) => page.themeId);
  const themeIds = [...new Set(themed.map((page) => page.themeId))];
  console.log(JSON.stringify({
    status: themed.length === pages.length && pages.length > 0 && themeIds.length === 1 ? 'active' : themed.length > 0 ? 'partial' : 'inactive',
    themeId: themeIds.length === 1 ? themeIds[0] : themeIds.length > 1 ? themeIds : null,
    pages,
    debugEndpoint: found ? `127.0.0.1:${found.port}` : null,
    recordedState: state ?? null,
    launchLog: launchLogPath(),
  }, null, 2));
}

async function restore(options: Options): Promise<void> {
  const state = await readJson<RuntimeState>(statePath);
  const found = await locateTargets(state?.port ?? options.port);
  if (!found) {
    await clearState();
    console.log(JSON.stringify({ status: 'inactive', note: 'Codex was not running; local runtime state was cleared.' }, null, 2));
    return;
  }
  const previous = stateRegistrations(state);
  for (const target of found.targets) {
    const client = await CdpClient.connect(target.webSocketDebuggerUrl);
    try {
      for (const registration of previous) {
        if (registration.targetId === target.id) {
          await client.call('Page.removeScriptToEvaluateOnNewDocument', { identifier: registration.identifier }).catch(() => undefined);
        }
      }
      await client.call('Runtime.evaluate', { expression: restoreSource, awaitPromise: true });
    } finally {
      client.close();
    }
  }
  await clearState();
  console.log(JSON.stringify({ status: 'inactive', restoredThemeId: state?.themeId, pagesRestored: found.targets.length }, null, 2));
}

async function list(options: Options): Promise<void> {
  const themes = await listThemes();
  const state = await readJson<RuntimeState>(statePath);
  const found = await locateTargets(state?.port ?? options.port);
  let activeThemeId: string | null = null;
  if (found && found.targets[0]) activeThemeId = await probeTarget(found.targets[0]).catch(() => null);
  console.log(JSON.stringify({
    themes: themes.map((theme) => ({ ...theme, active: theme.id === activeThemeId })),
    activeThemeId,
    themesRoot: themesRoot(),
  }, null, 2));
}

async function rollback(options: Options): Promise<void> {
  const state = await readJson<RuntimeState>(statePath);
  if (!state?.themeId) {
    console.log(JSON.stringify({
      status: 'native',
      note: 'No theme is currently applied; nothing to roll back.',
    }, null, 2));
    return;
  }
  if (state.previousThemeId && state.previousThemeId !== state.themeId) {
    await apply({ ...options, command: 'apply', theme: state.previousThemeId });
    return;
  }
  await restore(options);
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === 'apply') await apply(options);
  else if (options.command === 'restore') await restore(options);
  else if (options.command === 'rollback') await rollback(options);
  else if (options.command === 'list') await list(options);
  else await status(options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
