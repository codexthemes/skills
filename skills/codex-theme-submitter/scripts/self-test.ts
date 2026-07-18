#!/usr/bin/env -S npx tsx

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { clearApiKey, maskApiKey, resolveApiKey, saveApiKey } from './apikey.ts';
import { credentialsPath, submitEndpoint } from './paths.ts';
import { submitSkin, validateSkinOptions } from './submit-skin.ts';
import { submitTheme, validatePackage } from './submit-theme.ts';

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexthemes-submitter-'));
const previousHome = process.env.CODEX_THEMES_HOME;
const previousKey = process.env.CODEXTHEMES_API_KEY;
process.env.CODEX_THEMES_HOME = tempDir;
delete process.env.CODEXTHEMES_API_KEY;

const validPackage = {
  format: 'codex-theme',
  schemaVersion: 1,
  exportedAt: '2026-01-01T00:00:00.000Z',
  manifest: { id: 'test-theme', name: 'Test Theme', version: '1.0.0', css: 'theme.css' },
  css: ':root { --codexthemes-test: 1; }',
  readme: '',
  verification: {},
};

try {
  assert.equal(await resolveApiKey(), null);

  const savedTo = await saveApiKey('cx-test-1234567890');
  assert.equal(savedTo, credentialsPath());
  const stats = await fs.stat(savedTo);
  assert.equal(stats.mode & 0o777, 0o600, 'credentials file must be private');
  const fromFile = await resolveApiKey();
  assert.equal(fromFile?.source, 'credentials-file');
  assert.equal(fromFile?.key, 'cx-test-1234567890');
  assert.equal(maskApiKey(fromFile!.key), 'cx-t…7890');
  assert.doesNotMatch(maskApiKey(fromFile!.key), /test-12345/);

  process.env.CODEXTHEMES_API_KEY = 'cx-env-0987654321';
  const fromEnv = await resolveApiKey();
  assert.equal(fromEnv?.source, 'env');
  assert.equal(fromEnv?.key, 'cx-env-0987654321');
  delete process.env.CODEXTHEMES_API_KEY;

  assert.equal(await clearApiKey(), true);
  assert.equal(await clearApiKey(), false);
  assert.equal(await resolveApiKey(), null);
  await assert.rejects(saveApiKey('   '), /must not be empty/);
  await assert.rejects(saveApiKey('has space'), /whitespace/);

  assert.deepEqual(validatePackage(validPackage), []);
  assert.match(validatePackage({ ...validPackage, format: 'zip' }).join('\n'), /format/);
  assert.match(validatePackage({ ...validPackage, schemaVersion: 2 }).join('\n'), /schemaVersion/);
  assert.match(validatePackage({ ...validPackage, css: '' }).join('\n'), /css/);
  assert.match(validatePackage({ ...validPackage, manifest: { id: 'Bad Slug', version: '1' } }).join('\n'), /lowercase slug/);
  assert.match(validatePackage({ ...validPackage, art: { filename: 'a.png' } }).join('\n'), /art/);

  const packagePath = path.join(tempDir, 'test-theme.codex-theme');
  await fs.writeFile(packagePath, `${JSON.stringify(validPackage, null, 2)}\n`, 'utf8');

  const dryWithoutKey = await submitTheme(packagePath, true);
  assert.equal(dryWithoutKey.status, 'dry-run');
  assert.equal(dryWithoutKey.packageValid, true);
  assert.equal(dryWithoutKey.themeId, 'test-theme');
  assert.equal(dryWithoutKey.endpoint, submitEndpoint());
  assert.deepEqual(dryWithoutKey.apiKey, {
    configured: false,
    settingsUrl: 'https://codexthemes.ai/settings/apikeys',
  });

  await saveApiKey('cx-test-1234567890');
  const dryWithKey = await submitTheme(packagePath, true);
  assert.deepEqual(dryWithKey.apiKey, { configured: true, source: 'credentials-file', apiKey: 'cx-t…7890' });
  assert.doesNotMatch(JSON.stringify(dryWithKey), /cx-test-1234567890/);

  const badPackagePath = path.join(tempDir, 'broken.codex-theme');
  await fs.writeFile(badPackagePath, JSON.stringify({ format: 'codex-theme' }), 'utf8');
  await assert.rejects(submitTheme(badPackagePath, true), /failed validation/);
  await assert.rejects(submitTheme(packagePath.replace('.codex-theme', '-missing.codex-theme'), true), /ENOENT/);

  const previewPath = path.join(tempDir, 'preview.png');
  await fs.writeFile(previewPath, Buffer.from('89504e470d0a1a0a', 'hex'));
  const validSkin = {
    name: 'Test Skin',
    sourceUrl: 'https://example.com/theme',
    previewPath,
    dryRun: true,
  };
  assert.deepEqual(validateSkinOptions(validSkin), []);
  assert.match(validateSkinOptions({ ...validSkin, name: ' ' }).join('\n'), /name/);
  assert.match(validateSkinOptions({ ...validSkin, sourceUrl: 'ftp://x' }).join('\n'), /source-url/);
  assert.match(validateSkinOptions({ ...validSkin, previewPath: '/tmp/p.gif' }).join('\n'), /preview/);
  assert.match(validateSkinOptions({ ...validSkin, mode: 'sepia' }).join('\n'), /mode/);

  const skinDry = await submitSkin(validSkin);
  assert.equal(skinDry.status, 'dry-run');
  assert.equal(skinDry.name, 'Test Skin');
  assert.equal(skinDry.endpoint, submitEndpoint());
  await assert.rejects(submitSkin({ ...validSkin, sourceUrl: 'not-a-url' }), /source-url/);

  process.env.CODEXTHEMES_API_BASE = 'https://staging.codexthemes.ai/';
  assert.equal(submitEndpoint(), 'https://staging.codexthemes.ai/api/themes/submit');
  delete process.env.CODEXTHEMES_API_BASE;

  console.log('All TypeScript codex-theme-submitter skill tests passed.');
} finally {
  if (previousHome === undefined) delete process.env.CODEX_THEMES_HOME;
  else process.env.CODEX_THEMES_HOME = previousHome;
  if (previousKey === undefined) delete process.env.CODEXTHEMES_API_KEY;
  else process.env.CODEXTHEMES_API_KEY = previousKey;
  await fs.rm(tempDir, { recursive: true, force: true });
}
