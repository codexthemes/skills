#!/usr/bin/env -S npx tsx

import { closeSync, openSync } from 'node:fs';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile, spawn } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { promisify } from 'node:util';

import { validateTheme } from './validate-theme.ts';
import { runtimeStatePath, stateRoot } from './paths.ts';

type Command = 'apply' | 'restore' | 'status';

interface Options {
  command: Command;
  themeDir?: string;
  port: number;
  launch: boolean;
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

interface RuntimeState {
  port: number;
  targetId: string;
  scriptIdentifier: string;
  themeId: string;
}

const execFileAsync = promisify(execFile);
const statePath = runtimeStatePath();
const legacyStatePath = path.join(os.homedir(), '.codexthemes', 'runtime.json');
const defaultPorts = [9335, 9222, 9223];

function parseArgs(argv: string[]): Options {
  const command = argv.shift() as Command | undefined;
  if (!command || !['apply', 'restore', 'status'].includes(command)) {
    throw new Error('Usage: apply-theme.ts <apply THEME_DIR|restore|status> [--port 9335] [--launch] [--app /Applications/Codex.app]');
  }

  const options: Options = { command, port: 9335, launch: false, worker: false };
  if (command === 'apply' && argv[0] && !argv[0].startsWith('--')) {
    options.themeDir = path.resolve(argv.shift()!);
  }
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--port') {
      const port = Number(argv[++index]);
      if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error('--port must be between 1024 and 65535');
      options.port = port;
    } else if (arg === '--launch') {
      options.launch = true;
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
  if (command === 'apply' && !options.themeDir) throw new Error('apply requires an absolute theme directory');
  return options;
}

async function readJson<T>(filename: string): Promise<T | undefined> {
  try {
    return JSON.parse(await fs.readFile(filename, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return undefined;
    throw error;
  }
}

async function writeState(state: RuntimeState): Promise<void> {
  await fs.mkdir(path.dirname(statePath), { recursive: true });
  await fs.writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, { mode: 0o600 });
}

async function clearState(): Promise<void> {
  await fs.rm(statePath, { force: true });
  await fs.rm(legacyStatePath, { force: true });
}

async function readRuntimeState(): Promise<RuntimeState | undefined> {
  return (await readJson<RuntimeState>(statePath)) ?? (await readJson<RuntimeState>(legacyStatePath));
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

function codexTarget(targets: Target[]): Target | undefined {
  return targets.find((target) => target.type === 'page' && target.url.startsWith('app://'));
}

async function locateTarget(preferredPort: number): Promise<{ port: number; target: Target } | undefined> {
  for (const port of [...new Set([preferredPort, ...defaultPorts])]) {
    const target = codexTarget(await targetsAt(port));
    if (target) return { port, target };
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

async function mainProcessRunning(app: string): Promise<boolean> {
  try {
    await execFileAsync('pgrep', ['-f', `${app}/Contents/MacOS/`]);
    return true;
  } catch {
    return false;
  }
}

async function quitAndWait(app: string): Promise<void> {
  const appName = path.basename(app, '.app');
  await execFileAsync('osascript', ['-e', `tell application ${JSON.stringify(appName)} to quit`]).catch(() => undefined);
  // The debugging flags only take effect on a fresh instance. If the old
  // instance is still shutting down it holds the Chromium profile singleton
  // lock, and the relaunched instance silently defers to it and exits, so the
  // app comes back WITHOUT the debugging endpoint. Wait for a real exit.
  const deadline = Date.now() + 45_000;
  while (Date.now() < deadline) {
    if (!(await mainProcessRunning(app))) return;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`${appName} did not quit within 45s. Quit it manually, then rerun apply with --launch.`);
}

async function launchWithDebugging(port: number, explicitApp?: string): Promise<void> {
  if (process.platform !== 'darwin') {
    throw new Error('--launch currently supports macOS. Start Codex with --remote-debugging-address=127.0.0.1 and --remote-debugging-port manually, then rerun without --launch.');
  }
  const app = await detectMacApp(explicitApp);
  await quitAndWait(app);
  const child = spawn('open', [
    '-na', app, '--args', '--remote-debugging-address=127.0.0.1', `--remote-debugging-port=${port}`,
  ], { detached: true, stdio: 'ignore' });
  child.unref();
}

async function waitForTarget(port: number, timeoutMs = 30_000): Promise<{ port: number; target: Target }> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = await locateTarget(port);
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

async function connect(options: Options): Promise<{ client: CdpClient; port: number; target: Target } | undefined> {
  let found = await locateTarget(options.port);
  if (!found && options.launch) {
    await launchWithDebugging(options.port, options.app);
    found = await waitForTarget(options.port);
  }
  if (!found) return undefined;
  return { client: await CdpClient.connect(found.target.webSocketDebuggerUrl), ...found };
}

async function removePreviousRegistration(client: CdpClient, target: Target): Promise<void> {
  const previous = await readRuntimeState();
  if (previous?.targetId === target.id && previous.scriptIdentifier) {
    await client.call('Page.removeScriptToEvaluateOnNewDocument', { identifier: previous.scriptIdentifier }).catch(() => undefined);
  }
}

export function launchLogPath(): string {
  return path.join(stateRoot(), 'launch.log');
}

/**
 * Run the quit → relaunch → inject sequence in a detached helper process.
 * When the applying agent is hosted inside Codex itself, quitting Codex kills
 * the agent's tool call (and any process in its group) before the relaunch
 * can happen. The helper starts its own session, so it survives the restart
 * and finishes the injection on its own; its output lands in launch.log.
 */
async function scheduleDetachedLaunch(options: Options): Promise<void> {
  await fs.mkdir(stateRoot(), { recursive: true });
  const logPath = launchLogPath();
  const logFd = openSync(logPath, 'w');
  const args = [
    ...process.execArgv,
    process.argv[1]!,
    'apply', options.themeDir!,
    '--launch', '--launch-worker',
    '--port', String(options.port),
    ...(options.app ? ['--app', options.app] : []),
  ];
  const child = spawn(process.execPath, args, { detached: true, stdio: ['ignore', logFd, logFd] });
  child.unref();
  closeSync(logFd);
  console.log(JSON.stringify({
    status: 'scheduled',
    note: 'Codex is restarting with the debugging endpoint; a detached helper that survives the restart will inject the theme. This tool call may be interrupted by the restart. Afterwards verify with: apply-theme.ts status',
    logPath,
  }, null, 2));
}

async function apply(options: Options): Promise<void> {
  const themeDir = options.themeDir!;
  const validation = await validateTheme(themeDir);
  if (!validation.valid) throw new Error(`Theme validation failed:\n${validation.errors.join('\n')}`);
  const manifest = JSON.parse(await fs.readFile(path.join(themeDir, 'theme.json'), 'utf8')) as {
    id: string; css: string; design: { backgroundScope: string };
  };
  const css = await inlineLocalAssets(await fs.readFile(path.join(themeDir, manifest.css), 'utf8'), themeDir);
  if (options.launch && !options.worker && !(await locateTarget(options.port))) {
    await scheduleDetachedLaunch(options);
    return;
  }
  const connection = await connect(options);
  if (!connection) {
    throw new Error('No debuggable Codex renderer found. With explicit restart permission, rerun with --launch; no external theme program is required.');
  }
  const { client, port, target } = connection;
  try {
    await removePreviousRegistration(client, target);
    await client.call('Page.enable');
    const source = runtimeSource(manifest.id, manifest.design.backgroundScope, css);
    const registration = await client.call('Page.addScriptToEvaluateOnNewDocument', { source });
    await client.call('Runtime.evaluate', { expression: source, awaitPromise: true });
    await writeState({ port, targetId: target.id, scriptIdentifier: registration.identifier, themeId: manifest.id });
    console.log(JSON.stringify({ status: 'active', themeId: manifest.id, port, targetId: target.id, warnings: validation.warnings }, null, 2));
  } finally {
    client.close();
  }
}

async function restore(options: Options): Promise<void> {
  const connection = await connect(options);
  const previous = await readRuntimeState();
  if (!connection) {
    await clearState();
    console.log(JSON.stringify({ status: 'inactive', note: 'Codex was not running; local runtime state was cleared.' }, null, 2));
    return;
  }
  const { client, target } = connection;
  try {
    if (previous?.targetId === target.id && previous.scriptIdentifier) {
      await client.call('Page.removeScriptToEvaluateOnNewDocument', { identifier: previous.scriptIdentifier }).catch(() => undefined);
    }
    await client.call('Runtime.evaluate', { expression: restoreSource, awaitPromise: true });
    await clearState();
    console.log(JSON.stringify({ status: 'inactive', restoredThemeId: previous?.themeId }, null, 2));
  } finally {
    client.close();
  }
}

async function status(options: Options): Promise<void> {
  const state = await readRuntimeState();
  const found = await locateTarget(state?.port ?? options.port);
  let liveThemeId: string | null = null;
  if (found) {
    const client = await CdpClient.connect(found.target.webSocketDebuggerUrl);
    try {
      const evaluated = await client.call('Runtime.evaluate', {
        expression: "document.documentElement.dataset.codexthemesTheme ?? ''",
        returnByValue: true,
      });
      liveThemeId = evaluated.result?.value || null;
    } finally {
      client.close();
    }
  }
  console.log(JSON.stringify({
    status: liveThemeId ? 'active' : 'inactive',
    themeId: liveThemeId,
    debugEndpoint: found ? `127.0.0.1:${found.port}` : null,
    recordedState: state ?? null,
    launchLog: launchLogPath(),
  }, null, 2));
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  if (options.command === 'apply') await apply(options);
  else if (options.command === 'restore') await restore(options);
  else await status(options);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
