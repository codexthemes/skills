#!/usr/bin/env -S npx tsx

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import zlib from 'node:zlib';

import { themesRoot } from './paths.ts';
import { contrastRatio, decodePng, judgeSamples, ringBackdrop } from './readability.ts';
import { inlineLocalAssets, listThemes, resolveThemeDir, runtimeSource } from './switch-theme.ts';

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexthemes-switcher-'));
const previousHome = process.env.CODEX_THEMES_HOME;
process.env.CODEX_THEMES_HOME = tempDir;

async function writeTheme(id: string, name: string): Promise<string> {
  const themeDir = path.join(themesRoot(), id);
  await fs.mkdir(themeDir, { recursive: true });
  await fs.writeFile(path.join(themeDir, 'theme.json'), JSON.stringify({
    id,
    name,
    version: '1.0.0',
    css: 'theme.css',
    design: { layoutMode: 'native-background', backgroundScope: 'home' },
  }, null, 2), 'utf8');
  await fs.writeFile(path.join(themeDir, 'theme.css'), `:root { --codexthemes-${id}: 1; }\n`, 'utf8');
  return themeDir;
}

try {
  assert.deepEqual(await listThemes(), []);

  const noirDir = await writeTheme('noir-anime', 'Noir Anime');
  await writeTheme('paper-light', 'Paper Light');
  await fs.mkdir(path.join(themesRoot(), 'not-a-theme'), { recursive: true });

  const themes = await listThemes();
  assert.deepEqual(themes.map((theme) => theme.id), ['noir-anime', 'paper-light']);
  assert.equal(themes[0]!.name, 'Noir Anime');
  assert.equal(themes[0]!.layoutMode, 'native-background');

  assert.equal(await resolveThemeDir('noir-anime'), noirDir);
  assert.equal(await resolveThemeDir(noirDir), noirDir);
  await assert.rejects(resolveThemeDir('missing-theme'), /Cannot find theme "missing-theme".*switch-theme\.ts list/s);

  const artPath = path.join(noirDir, 'art.png');
  await fs.writeFile(artPath, Buffer.from('89504e470d0a1a0a', 'hex'));
  const inlined = await inlineLocalAssets('body { background: url("art.png"); }', noirDir);
  assert.match(inlined, /data:image\/png;base64,/);
  await assert.rejects(inlineLocalAssets('body { background: url("../escape.png"); }', noirDir), /escapes the theme directory/);
  await assert.rejects(inlineLocalAssets('body { background: url(https://x.example/a.png); }', noirDir), /External CSS asset/);

  const source = runtimeSource('noir-anime', 'home', ':root { --x: 1; }');
  assert.match(source, /codexthemes-runtime-style/);
  assert.match(source, /data-thread-user-message-navigation-item-id/);
  assert.match(source, /data-composer-navigation-target/);

  // Readability pixel pipeline: encode a synthetic PNG (dark left half,
  // white right half), decode it, and judge text samples on both halves.
  const encodePng = (width: number, height: number, pixel: (x: number, y: number) => [number, number, number]): Buffer => {
    const stride = width * 4;
    const raw = Buffer.alloc((stride + 1) * height);
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const [r, g, b] = pixel(x, y);
        const at = y * (stride + 1) + 1 + x * 4;
        raw[at] = r; raw[at + 1] = g; raw[at + 2] = b; raw[at + 3] = 255;
      }
    }
    const chunk = (type: string, data: Buffer): Buffer => {
      const head = Buffer.alloc(4);
      head.writeUInt32BE(data.length);
      return Buffer.concat([head, Buffer.from(type, 'ascii'), data, Buffer.alloc(4)]);
    };
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(width, 0);
    ihdr.writeUInt32BE(height, 4);
    ihdr[8] = 8; ihdr[9] = 6; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
    return Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk('IHDR', ihdr),
      chunk('IDAT', zlib.deflateSync(raw)),
      chunk('IEND', Buffer.alloc(0)),
    ]);
  };

  const image = decodePng(encodePng(80, 40, (x) => (x < 40 ? [20, 20, 20] : [255, 255, 255])));
  assert.equal(image.width, 80);
  assert.equal(image.pixels[0], 20);
  assert.equal(image.pixels[(41 * 4)], 255);

  const darkBackdrop = ringBackdrop(image, { x: 10, y: 12, width: 16, height: 12 }, 1);
  assert.ok(darkBackdrop && darkBackdrop.r <= 25);
  const lightBackdrop = ringBackdrop(image, { x: 50, y: 12, width: 16, height: 12 }, 1);
  assert.ok(lightBackdrop && lightBackdrop.r >= 250);
  assert.ok(contrastRatio({ r: 255, g: 255, b: 255, a: 1 }, darkBackdrop!) > 10);

  const judgedPixels = judgeSamples(image, [
    { text: 'readable', path: 'main > p', color: 'rgb(255, 255, 255)', size: 14, rect: { x: 10, y: 12, width: 16, height: 12 } },
    { text: 'invisible', path: 'main > p', color: 'rgb(255, 255, 255)', size: 14, rect: { x: 50, y: 12, width: 16, height: 12 } },
  ], 80);
  assert.equal(judgedPixels[0]!.text, 'invisible');
  assert.ok(judgedPixels[0]!.ratio < 1.3);
  assert.ok(judgedPixels.find((result) => result.text === 'readable')!.ratio > 10);

  console.log('All TypeScript codex-theme-switcher skill tests passed.');
} finally {
  if (previousHome === undefined) delete process.env.CODEX_THEMES_HOME;
  else process.env.CODEX_THEMES_HOME = previousHome;
  await fs.rm(tempDir, { recursive: true, force: true });
}
