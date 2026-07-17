#!/usr/bin/env -S npx tsx

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { themesRoot } from './paths.ts';
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

  console.log('All TypeScript codex-theme-switcher skill tests passed.');
} finally {
  if (previousHome === undefined) delete process.env.CODEX_THEMES_HOME;
  else process.env.CODEX_THEMES_HOME = previousHome;
  await fs.rm(tempDir, { recursive: true, force: true });
}
