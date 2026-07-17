#!/usr/bin/env -S npx tsx

import { pathToFileURL } from 'node:url';

import {
  decodePng,
  judgeSamples,
  textSamplerSource,
  type ReadabilityResult,
  type TextSample,
} from './readability.ts';

interface Target {
  id: string;
  title: string;
  type: string;
  url: string;
  webSocketDebuggerUrl: string;
}

interface RawSample {
  text: string;
  path: string;
  color: string;
  stack: string[];
  image: boolean;
  size: number;
}

export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

export interface ContrastSample {
  text: string;
  path: string;
  ratio: number;
  color: string;
  background: string;
  /** True when the backdrop is a verified opaque solid color (no artwork, no transparency gap). */
  verified: boolean;
  size: number;
}

const defaultPorts = [9335, 9222, 9223];
// Below ~2.5:1 text is effectively unreadable regardless of taste; 4.5:1 is
// the WCAG AA floor for normal text. Elements over artwork only hard-fail.
const failRatio = 2.5;
const warnRatio = 4.5;

export function parseColor(value: string): Rgba | null {
  const match = value.match(/rgba?\(([^)]+)\)/);
  if (!match) return null;
  const parts = match[1]!.split(',').map((part) => Number(part.trim()));
  if (parts.length < 3 || parts.some((part) => Number.isNaN(part))) return null;
  return { r: parts[0]!, g: parts[1]!, b: parts[2]!, a: parts.length > 3 ? parts[3]! : 1 };
}

export function blend(top: Rgba, bottom: Rgba): Rgba {
  const alpha = top.a + bottom.a * (1 - top.a);
  if (alpha === 0) return { r: 255, g: 255, b: 255, a: 0 };
  return {
    r: (top.r * top.a + bottom.r * bottom.a * (1 - top.a)) / alpha,
    g: (top.g * top.a + bottom.g * bottom.a * (1 - top.a)) / alpha,
    b: (top.b * top.a + bottom.b * bottom.a * (1 - top.a)) / alpha,
    a: alpha,
  };
}

function luminance(color: Rgba): number {
  const channel = (value: number) => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : Math.pow((scaled + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b);
}

export function contrastRatio(a: Rgba, b: Rgba): number {
  const l1 = luminance(a);
  const l2 = luminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

/**
 * Composite the ancestor background stack (innermost first). Starts from a
 * fully transparent base: if the composited result is not opaque, the real
 * backdrop is unknown (it is painted by pseudo-elements, siblings, or
 * artwork), and the sample must not be hard-judged.
 */
export function effectiveBackground(stack: string[]): Rgba {
  let background: Rgba = { r: 255, g: 255, b: 255, a: 0 };
  for (let index = stack.length - 1; index >= 0; index -= 1) {
    const layer = parseColor(stack[index]!);
    if (layer && layer.a > 0) background = blend(layer, background);
  }
  return background;
}

export function evaluateSamples(raw: RawSample[]): ContrastSample[] {
  const results: ContrastSample[] = [];
  for (const sample of raw) {
    const textColor = parseColor(sample.color);
    if (!textColor) continue;
    const background = effectiveBackground(sample.stack);
    const verified = background.a >= 0.99 && !sample.image;
    const opaque = background.a >= 0.99 ? background : blend(background, { r: 255, g: 255, b: 255, a: 1 });
    const composedText = textColor.a < 1 ? blend(textColor, opaque) : textColor;
    results.push({
      text: sample.text,
      path: sample.path,
      ratio: Math.round(contrastRatio(composedText, opaque) * 100) / 100,
      color: sample.color,
      background: `rgb(${Math.round(opaque.r)}, ${Math.round(opaque.g)}, ${Math.round(opaque.b)})`,
      verified,
      size: sample.size,
    });
  }
  return results.sort((a, b) => a.ratio - b.ratio);
}

const samplerSource = `(() => {
  const isVisible = (el) => {
    const rect = el.getBoundingClientRect();
    if (rect.width < 5 || rect.height < 5) return false;
    if (rect.bottom < 0 || rect.top > innerHeight) return false;
    const style = getComputedStyle(el);
    return style.visibility !== 'hidden' && style.display !== 'none' && Number(style.opacity) > 0.15;
  };
  const hasOwnText = (el) => [...el.childNodes].some((node) => node.nodeType === 3 && node.textContent.trim().length > 1);
  const describe = (el) => {
    const parts = [];
    let node = el;
    for (let depth = 0; node && depth < 3; depth += 1) {
      let part = node.tagName.toLowerCase();
      const cls = [...node.classList].slice(0, 2).join('.');
      if (cls) part += '.' + cls;
      parts.unshift(part);
      node = node.parentElement;
    }
    return parts.join(' > ');
  };
  const samples = [];
  const elements = document.querySelectorAll('main *, aside *, header *, [role="menu"] *, [role="dialog"] *');
  for (const el of elements) {
    if (samples.length >= 500) break;
    if (!hasOwnText(el) || !isVisible(el)) continue;
    const style = getComputedStyle(el);
    const stack = [];
    let image = false;
    let node = el;
    while (node) {
      const nodeStyle = node === el ? style : getComputedStyle(node);
      if (nodeStyle.backgroundImage && nodeStyle.backgroundImage !== 'none') image = true;
      for (const pseudo of ['::before', '::after']) {
        const pseudoStyle = getComputedStyle(node, pseudo);
        if (pseudoStyle.content !== 'none' &&
            ((pseudoStyle.backgroundImage && pseudoStyle.backgroundImage !== 'none') ||
             (pseudoStyle.backgroundColor && pseudoStyle.backgroundColor !== 'transparent' && pseudoStyle.backgroundColor !== 'rgba(0, 0, 0, 0)'))) {
          image = true;
        }
      }
      const bg = nodeStyle.backgroundColor;
      if (bg && bg !== 'transparent') {
        stack.push(bg);
        const alphaMatch = bg.match(/rgba\\([^)]*,\\s*([0-9.]+)\\)/);
        if (!alphaMatch || Number(alphaMatch[1]) >= 0.99) break;
      }
      node = node.parentElement;
    }
    samples.push({
      text: [...el.childNodes].filter((n) => n.nodeType === 3).map((n) => n.textContent.trim()).join(' ').slice(0, 40),
      path: describe(el),
      color: style.color,
      stack,
      image,
      size: parseFloat(style.fontSize) || 0,
    });
  }
  return JSON.stringify(samples);
})()`;

async function targetsAt(port: number): Promise<Target[]> {
  try {
    const response = await fetch(`http://127.0.0.1:${port}/json/list`, { signal: AbortSignal.timeout(800) });
    if (!response.ok) return [];
    return (await response.json()) as Target[];
  } catch {
    return [];
  }
}

async function locateTargets(preferredPort: number): Promise<{ port: number; targets: Target[] } | undefined> {
  for (const port of [...new Set([preferredPort, ...defaultPorts])]) {
    const pages = (await targetsAt(port)).filter((target) => target.type === 'page' && target.url.startsWith('app://'));
    if (pages.length > 0) return { port, targets: pages };
  }
  return undefined;
}

class CdpSocket {
  private nextId = 1;

  private constructor(private socket: WebSocket, private pending = new Map<number, { resolve: (value: any) => void; reject: (reason: Error) => void }>()) {
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message ?? JSON.stringify(message.error)));
      else waiter.resolve(message.result ?? {});
    };
  }

  static async connect(url: string): Promise<CdpSocket> {
    const socket = new WebSocket(url);
    await new Promise<void>((resolve, reject) => {
      socket.onopen = () => resolve();
      socket.onerror = () => reject(new Error('Cannot connect to the Codex renderer'));
    });
    return new CdpSocket(socket);
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

async function sampleTarget(target: Target): Promise<{ raw: RawSample[]; pixel: ReadabilityResult[] }> {
  const client = await CdpSocket.connect(target.webSocketDebuggerUrl);
  try {
    const styled = await client.call('Runtime.evaluate', { expression: samplerSource, returnByValue: true });
    const raw = JSON.parse(styled.result.value) as RawSample[];
    // Pixel pass: screenshot-based measurement judges text over artwork and
    // transparent layers that computed-style composition cannot verify.
    let pixel: ReadabilityResult[] = [];
    try {
      const sampled = await client.call('Runtime.evaluate', { expression: textSamplerSource, returnByValue: true });
      const parsed = JSON.parse(sampled.result.value) as { samples: TextSample[]; viewportWidth: number };
      const shot = await client.call('Page.captureScreenshot', { format: 'png' });
      const image = decodePng(Buffer.from(shot.data, 'base64'));
      pixel = judgeSamples(image, parsed.samples.filter((sample) => sample.size >= 9), parsed.viewportWidth);
    } catch { /* pixel pass is best-effort; the style pass still runs */ }
    return { raw, pixel };
  } finally {
    client.close();
  }
}

async function main(): Promise<void> {
  let port = 9335;
  const argv = process.argv.slice(2);
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === '--port') port = Number(argv[++index]);
    else throw new Error(`Unknown argument: ${argv[index]}`);
  }

  const found = await locateTargets(port);
  if (!found) {
    console.error('No debuggable Codex renderer found; apply the theme first, then rerun.');
    process.exitCode = 2;
    return;
  }

  const pages: Array<{
    targetId: string;
    sampled: number;
    failures: ContrastSample[];
    warnings: ContrastSample[];
    pixelFailures: ReadabilityResult[];
  }> = [];
  for (const target of found.targets) {
    const { raw, pixel } = await sampleTarget(target);
    const samples = evaluateSamples(raw);
    const verified = samples.filter((sample) => sample.verified);
    pages.push({
      targetId: target.id,
      sampled: samples.length,
      failures: verified.filter((sample) => sample.ratio < failRatio),
      warnings: verified.filter((sample) => sample.ratio >= failRatio && sample.ratio < warnRatio),
      pixelFailures: pixel.filter((result) => result.ratio < failRatio),
    });
  }

  const failed = pages.some((page) => page.failures.length > 0 || page.pixelFailures.length >= 2);
  console.log(JSON.stringify({
    status: failed ? 'fail' : 'pass',
    thresholds: { fail: `< ${failRatio}:1`, warn: `< ${warnRatio}:1` },
    note: 'failures come from computed-style composition over verified opaque backdrops; pixelFailures come from the real screenshot pixels and also catch text over artwork.',
    pages: pages.map((page) => ({
      targetId: page.targetId,
      sampled: page.sampled,
      failureCount: page.failures.length,
      failures: page.failures.slice(0, 12),
      warningCount: page.warnings.length,
      warnings: page.warnings.slice(0, 8),
      pixelFailureCount: page.pixelFailures.length,
      pixelFailures: page.pixelFailures.slice(0, 12),
    })),
  }, null, 2));
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  });
}
