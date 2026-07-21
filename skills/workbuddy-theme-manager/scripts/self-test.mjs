#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const managerPath = path.join(scriptDir, 'workbuddy-theme.mjs');
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'workbuddy-theme-manager-'));
process.env.CODEX_THEMES_HOME = tempDir;

try {
  const { convertInstalledTheme, convertPackage, validateWorkBuddyPackage } = await import('./workbuddy-theme.mjs');
  const legacyPath = path.join(tempDir, 'night.codex-theme');
  const outputPath = path.join(tempDir, 'night.workbuddy-theme');
  const legacy = {
    format: 'codex-theme',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    manifest: {
      schemaVersion: 1,
      id: 'night-test',
      displayName: 'Night Test',
      version: '1.2.3',
      mode: 'dark',
      css: 'theme.css',
      art: 'assets/artwork.png',
      palette: {
        canvas: '#101820',
        surface: '#182430',
        raised: '#223344',
        text: '#f5f7fa',
        muted: '#aab4c0',
        accent: '#e9a23b',
        border: '#405066',
        focus: '#ffd078',
        danger: '#ef7070',
        terminalBackground: '#0a1018',
        terminalForeground: '#eef2f6',
      },
    },
    css: ':root[data-codexthemes-theme="night-test"] main.main-surface { color: red; }',
    art: {
      filename: 'artwork.png',
      mimeType: 'image/png',
      base64: Buffer.from('89504e470d0a1a0a', 'hex').toString('base64'),
    },
  };
  await fs.writeFile(legacyPath, JSON.stringify(legacy));

  const result = await convertPackage(legacyPath, outputPath);
  assert.equal(result.status, 'converted');
  assert.equal(result.themeId, 'night-test');
  assert.equal(result.conversionQuality, 'palette-and-artwork');

  const converted = JSON.parse(await fs.readFile(outputPath, 'utf8'));
  validateWorkBuddyPackage(converted);
  assert.equal(converted.format, 'workbuddy-theme');
  assert.equal(converted.manifest.mode, 'dark');
  assert.equal(converted.manifest.palette.canvas, '#101820');
  assert.equal(converted.images.artwork.base64, legacy.art.base64);
  assert.match(converted.css, /workbuddy-themes-host/);
  assert.match(converted.css, /\.wb-home-header/);
  assert.match(converted.css, /\.chat-container/);
  assert.doesNotMatch(converted.css, /main\.main-surface/);
  assert.doesNotMatch(converted.css, /data-codexthemes/);

  await assert.rejects(convertPackage(legacyPath, outputPath), /already exists/);
  await convertPackage(legacyPath, outputPath, { force: true });

  const installedDir = path.join(tempDir, 'themes', 'installed-night');
  const installedOutput = path.join(tempDir, 'installed-night.workbuddy-theme');
  await fs.mkdir(path.join(installedDir, 'assets'), { recursive: true });
  await fs.writeFile(path.join(installedDir, 'theme.json'), JSON.stringify({
    ...legacy.manifest,
    id: 'installed-night',
    displayName: 'Installed Night',
  }));
  await fs.writeFile(path.join(installedDir, 'theme.css'), legacy.css);
  await fs.writeFile(path.join(installedDir, 'assets', 'artwork.png'), Buffer.from(legacy.art.base64, 'base64'));
  const installedResult = await convertInstalledTheme('installed-night', installedOutput);
  assert.equal(installedResult.status, 'converted');
  assert.equal(installedResult.input, installedDir);
  const installedPackage = JSON.parse(await fs.readFile(installedOutput, 'utf8'));
  assert.equal(installedPackage.manifest.id, 'installed-night');
  assert.equal(installedPackage.manifest.source.format, 'installed-codex-theme');
  assert.equal(installedPackage.images.artwork.base64, legacy.art.base64);

  await fs.writeFile(path.join(installedDir, 'theme.json'), JSON.stringify({ ...legacy.manifest, id: 'installed-night', css: '../escape.css' }));
  await assert.rejects(convertInstalledTheme('installed-night', path.join(tempDir, 'escape.workbuddy-theme')), /escapes/);

  assert.throws(
    () => validateWorkBuddyPackage({ ...converted, css: '@import url("https://example.com/theme.css");' }),
    /imports|resources/,
  );
  assert.throws(
    () => validateWorkBuddyPackage({ ...converted, images: { artwork: { ...converted.images.artwork, base64: 'not base64!' } } }),
    /base64/,
  );

  const inspected = await execFileAsync(process.execPath, [managerPath, 'inspect', outputPath]);
  const inspectResult = JSON.parse(inspected.stdout);
  assert.equal(inspectResult.format, 'workbuddy-theme');
  assert.deepEqual(inspectResult.images, ['artwork']);

  await fs.writeFile(path.join(installedDir, 'theme.json'), JSON.stringify({ ...legacy.manifest, id: 'installed-night' }));
  const cliOutput = path.join(tempDir, 'cli-installed.workbuddy-theme');
  const convertedInstalled = await execFileAsync(process.execPath, [managerPath, 'convert-installed', 'installed-night', '--output', cliOutput]);
  assert.equal(JSON.parse(convertedInstalled.stdout).themeId, 'installed-night');

  const source = await fs.readFile(managerPath, 'utf8');
  assert.doesNotMatch(source, /@codedrobe|codedrobe\s+(?:apply|probe|verify|launch)/i);

  console.log('All WorkBuddy theme manager tests passed.');
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
