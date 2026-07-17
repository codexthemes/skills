#!/usr/bin/env -S npx tsx

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { saveApiKey } from './apikey.ts';
import { downloadEndpoint, themesRoot } from './paths.ts';
import { installTheme, parseThemeId, validatePackage } from './install-theme.ts';

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexthemes-installer-'));
const previousHome = process.env.CODEX_THEMES_HOME;
const previousKey = process.env.CODEXTHEMES_API_KEY;
process.env.CODEX_THEMES_HOME = tempDir;
delete process.env.CODEXTHEMES_API_KEY;

const validPackage = {
  format: 'codex-theme',
  schemaVersion: 1,
  exportedAt: '2026-01-01T00:00:00.000Z',
  manifest: { id: 'noir-anime', name: 'Noir Anime', version: '1.2.0', css: 'theme.css' },
  css: ':root { --codexthemes-test: 1; }',
  readme: '# Noir Anime\n',
  art: { filename: 'art.png', mimeType: 'image/png', base64: Buffer.from('89504e470d0a1a0a', 'hex').toString('base64') },
};

const stub = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  ((_input: string | URL | Request, _init?: RequestInit) =>
    Promise.resolve(new Response(typeof body === 'string' ? body : JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json', ...headers },
    }))) as typeof fetch;

try {
  assert.equal(parseThemeId('noir-anime'), 'noir-anime');
  assert.equal(parseThemeId('https://codexthemes.ai/themes/noir-anime'), 'noir-anime');
  assert.equal(parseThemeId('https://codexthemes.ai/themes/noir-anime?tab=preview'), 'noir-anime');
  assert.throws(() => parseThemeId('https://evil.example.com/themes/noir-anime'), /Not a codexthemes\.ai URL/);
  assert.throws(() => parseThemeId('Bad Slug'), /Invalid theme id/);
  assert.throws(() => parseThemeId('../escape'), /Invalid theme id/);

  assert.equal(downloadEndpoint('noir-anime'), 'https://codexthemes.ai/api/themes/noir-anime/download');

  assert.deepEqual(validatePackage(validPackage, 'noir-anime'), []);
  assert.deepEqual(
    validatePackage({ ...validPackage, manifest: { ...validPackage.manifest, art: 'assets/doraemon-pocket-room.webp' } }, 'noir-anime'),
    [],
  );
  assert.match(validatePackage({ ...validPackage, manifest: { ...validPackage.manifest, id: 'other' } }, 'noir-anime').join('\n'), /manifest\.id/);
  assert.match(validatePackage({ ...validPackage, manifest: { ...validPackage.manifest, css: '../evil.css' } }, 'noir-anime').join('\n'), /relative path/);
  assert.match(validatePackage({ ...validPackage, manifest: { ...validPackage.manifest, art: 'assets/../../evil.png' } }, 'noir-anime').join('\n'), /relative path/);
  assert.match(validatePackage({ ...validPackage, manifest: { ...validPackage.manifest, art: '/etc/evil.png' } }, 'noir-anime').join('\n'), /relative path/);
  assert.match(
    validatePackage({ ...validPackage, art: { ...validPackage.art, filename: '../../evil.png' } }, 'noir-anime').join('\n'),
    /art/,
  );

  const installed = await installTheme('noir-anime', false, stub(validPackage));
  assert.equal(installed.status, 'installed');
  assert.equal(installed.themeDir, path.join(themesRoot(), 'noir-anime'));
  assert.deepEqual(installed.files, ['theme.json', 'theme.css', 'art.png', 'README.md']);
  assert.deepEqual(installed.auth, { mode: 'anonymous-free-quota' });
  const manifest = JSON.parse(await fs.readFile(path.join(themesRoot(), 'noir-anime', 'theme.json'), 'utf8')) as { id: string; art?: string };
  assert.equal(manifest.id, 'noir-anime');
  assert.equal(manifest.art, 'art.png');
  const artBytes = await fs.readFile(path.join(themesRoot(), 'noir-anime', 'art.png'));
  assert.equal(artBytes.toString('hex'), '89504e470d0a1a0a');

  await assert.rejects(installTheme('noir-anime', false, stub(validPackage)), /already installed.*--force/s);
  const overwritten = await installTheme('noir-anime', true, stub(validPackage));
  assert.equal(overwritten.overwrote, true);

  const nestedPackage = {
    ...validPackage,
    manifest: { ...validPackage.manifest, id: 'doraemon-pocket', art: 'assets/doraemon-pocket-room.webp' },
    art: { filename: 'doraemon-pocket-room.webp', mimeType: 'image/webp', base64: Buffer.from('52494646', 'hex').toString('base64') },
  };
  const nested = await installTheme('doraemon-pocket', false, stub(nestedPackage));
  assert.deepEqual(nested.files, ['theme.json', 'theme.css', 'assets/doraemon-pocket-room.webp', 'README.md']);
  await fs.access(path.join(themesRoot(), 'doraemon-pocket', 'assets', 'doraemon-pocket-room.webp'));
  const nestedManifest = JSON.parse(await fs.readFile(path.join(themesRoot(), 'doraemon-pocket', 'theme.json'), 'utf8')) as { art?: string };
  assert.equal(nestedManifest.art, 'assets/doraemon-pocket-room.webp');

  await saveApiKey('cx-inst-1234567890');
  const authed = await installTheme('noir-anime', true, stub(validPackage));
  assert.deepEqual(authed.auth, { mode: 'api-key', source: 'credentials-file', apiKey: 'cx-i…7890' });
  assert.doesNotMatch(JSON.stringify(authed), /cx-inst-1234567890/);

  await assert.rejects(
    installTheme('noir-anime', true, stub({}, 429, { 'retry-after': '30' })),
    (error: Error) => /Rate limited/.test(error.message)
      && /Retry after 30 seconds/.test(error.message)
      && /codexthemes\.ai\/settings\/apikeys/.test(error.message),
  );
  await assert.rejects(installTheme('noir-anime', true, stub({}, 402)), /free download quota/);
  await assert.rejects(installTheme('noir-anime', true, stub({}, 401)), /invalid or revoked/);
  await assert.rejects(installTheme('missing-theme', true, stub({}, 404)), /was not found/);
  await assert.rejects(installTheme('noir-anime', true, stub('not json')), /not valid JSON/);
  await assert.rejects(installTheme('noir-anime', true, stub({ format: 'zip' })), /failed validation/);

  console.log('All TypeScript codex-theme-installer skill tests passed.');
} finally {
  if (previousHome === undefined) delete process.env.CODEX_THEMES_HOME;
  else process.env.CODEX_THEMES_HOME = previousHome;
  if (previousKey === undefined) delete process.env.CODEXTHEMES_API_KEY;
  else process.env.CODEXTHEMES_API_KEY = previousKey;
  await fs.rm(tempDir, { recursive: true, force: true });
}
