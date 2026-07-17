#!/usr/bin/env -S npx tsx

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseScaffoldArgs, scaffoldTheme, type LayoutMode } from './scaffold-theme.ts';
import { inlineLocalAssets, runtimeSource } from './apply-theme.ts';
import { exportTheme } from './export-theme.ts';
import { exportsRoot, runtimeStatePath, themesRoot } from './paths.ts';
import { validateTheme } from './validate-theme.ts';
import { validateSkill } from './validate-skill.ts';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.dirname(scriptDir);
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexthemes-skill-'));
const artPath = path.join(tempDir, 'art.png');
await fs.writeFile(artPath, Buffer.from('89504e470d0a1a0a', 'hex'));

try {
  const skillResult = await validateSkill(skillDir);
  assert.equal(skillResult.valid, true, skillResult.errors.join('\n'));
  assert.equal(parseScaffoldArgs(['--id', 'default-path', '--name', 'Default path', '--layout-mode', 'palette-only']).output, themesRoot());
  assert.match(exportsRoot(), /\.codexthemes\/exports$/);
  assert.match(runtimeStatePath(), /\.codexthemes\/state\/runtime\.json$/);

  const modes: LayoutMode[] = [
    'native-background',
    'native-immersive',
    'editorial-showcase',
    'palette-only',
  ];

  for (const mode of modes) {
    const id = `test-${mode}`;
    await scaffoldTheme({
      id,
      name: `Test ${mode}`,
      layoutMode: mode,
      backgroundScope: 'home',
      output: tempDir,
      ...(mode === 'palette-only' ? {} : { art: artPath }),
    });
    const result = await validateTheme(path.join(tempDir, id));
    assert.equal(result.valid, true, JSON.stringify(result, null, 2));
  }

  const nativeDir = path.join(tempDir, 'test-native-background');
  const inlined = await inlineLocalAssets(await fs.readFile(path.join(nativeDir, 'theme.css'), 'utf8'), nativeDir);
  assert.match(inlined, /data:image\/png;base64,/);
  assert.doesNotMatch(inlined, /dream-home|dream-conversation/i);
  const runtime = runtimeSource('test-native-background', 'home', inlined);
  assert.match(runtime, /data-thread-user-message-navigation-item-id/);
  assert.match(runtime, /data-composer-navigation-target/);
  assert.match(runtime, /codexthemes-runtime-style/);

  const exportDir = path.join(tempDir, 'exports');
  const packagePath = await exportTheme(nativeDir, exportDir);
  assert.equal(packagePath, path.join(exportDir, 'test-native-background.codex-theme'));
  const portable = JSON.parse(await fs.readFile(packagePath, 'utf8')) as Record<string, unknown>;
  assert.equal(portable.format, 'codex-theme');
  assert.equal((portable.manifest as Record<string, unknown>).id, 'test-native-background');

  const badDir = path.join(tempDir, 'test-native-immersive');
  await fs.appendFile(path.join(badDir, 'theme.css'), '\nmain * { opacity: 1; }\n');
  const bad = await validateTheme(badDir);
  assert.equal(bad.valid, false);
  assert.match(bad.errors.join('\n'), /broad descendant state override/);

  console.log('All TypeScript codex-theme-creator skill tests passed.');
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
