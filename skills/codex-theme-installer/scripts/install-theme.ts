#!/usr/bin/env -S npx tsx

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { apiKeySettingsUrl, maskApiKey, resolveApiKey } from './apikey.ts';
import { downloadEndpoint, themesRoot } from './paths.ts';

const maxPackageBytes = 30 * 1024 * 1024;
const themeIdPattern = /^[a-z0-9][a-z0-9-]{0,63}$/;

interface InstallOptions {
  themeId: string;
  force: boolean;
}

interface PortablePackage {
  format: string;
  schemaVersion: number;
  manifest: { id: string; version: string; css: string; art?: string; [key: string]: unknown };
  css: string;
  readme?: string;
  art?: { filename: string; mimeType: string; base64: string };
  [key: string]: unknown;
}

export function parseThemeId(input: string): string {
  let candidate = input.trim();
  if (/^https?:\/\//.test(candidate)) {
    const url = new URL(candidate);
    if (!/(^|\.)codexthemes\.ai$/.test(url.hostname)) {
      throw new Error(`Not a codexthemes.ai URL: ${candidate}`);
    }
    const segments = url.pathname.split('/').filter(Boolean);
    const themesIndex = segments.indexOf('themes');
    candidate = themesIndex >= 0 && segments[themesIndex + 1] ? segments[themesIndex + 1]! : segments[segments.length - 1] ?? '';
  }
  if (!themeIdPattern.test(candidate)) {
    throw new Error(`Invalid theme id: "${candidate}" (expected a lowercase slug or a codexthemes.ai theme URL)`);
  }
  return candidate;
}

function parseArgs(argv: string[]): InstallOptions {
  const idArg = argv.shift();
  if (!idArg || idArg.startsWith('--')) {
    throw new Error('Usage: install-theme.ts <theme-id | codexthemes.ai theme URL> [--force]');
  }
  const options: InstallOptions = { themeId: parseThemeId(idArg), force: false };
  for (const arg of argv) {
    if (arg !== '--force') throw new Error(`Unknown argument: ${arg}`);
    options.force = true;
  }
  return options;
}

export function validatePackage(portable: unknown, expectedId: string): string[] {
  const errors: string[] = [];
  if (typeof portable !== 'object' || portable === null || Array.isArray(portable)) {
    return ['Package must be a JSON object'];
  }
  const record = portable as Record<string, unknown>;
  if (record.format !== 'codex-theme') errors.push('format must be "codex-theme"');
  if (record.schemaVersion !== 1) errors.push('schemaVersion must be 1');
  const manifest = record.manifest as Record<string, unknown> | undefined;
  if (typeof manifest !== 'object' || manifest === null) {
    errors.push('manifest must be an object');
  } else {
    if (manifest.id !== expectedId) errors.push(`manifest.id must be "${expectedId}"`);
    if (typeof manifest.version !== 'string' || !manifest.version.trim()) errors.push('manifest.version must be a non-empty string');
    if (typeof manifest.css !== 'string' || !isSafeRelativePath(manifest.css)) errors.push('manifest.css must be a safe relative path');
    if (manifest.art !== undefined && (typeof manifest.art !== 'string' || !isSafeRelativePath(manifest.art))) {
      errors.push('manifest.art must be a safe relative path when present');
    }
  }
  if (typeof record.css !== 'string' || !record.css.trim()) errors.push('css must be a non-empty string');
  const art = record.art as Record<string, unknown> | undefined;
  if (art !== undefined) {
    if (typeof art !== 'object' || art === null) {
      errors.push('art must be an object when present');
    } else if (typeof art.filename !== 'string' || !isSafeRelativePath(art.filename)
      || typeof art.mimeType !== 'string' || typeof art.base64 !== 'string') {
      errors.push('art must include a safe relative filename plus mimeType and base64 strings');
    }
  }
  return errors;
}

/**
 * Allow subdirectories (creator manifests use paths like "assets/artwork.png",
 * and the CSS references them relatively) while still rejecting traversal,
 * absolute paths, and Windows separators.
 */
function isSafeRelativePath(candidate: string): boolean {
  if (!candidate || candidate.length > 200) return false;
  if (candidate.includes('\\') || candidate.startsWith('/')) return false;
  const segments = candidate.split('/');
  return segments.every((segment) => /^[A-Za-z0-9][A-Za-z0-9._ -]*$/.test(segment) && !segment.includes('..'));
}

export async function installPackage(portable: PortablePackage, force: boolean, root = themesRoot()): Promise<Record<string, unknown>> {
  const themeDir = path.join(root, portable.manifest.id);
  let exists = false;
  try {
    exists = (await fs.readdir(themeDir)).length > 0;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  if (exists && !force) {
    throw new Error(`Theme already installed at ${themeDir}. Re-run with --force to overwrite it.`);
  }

  await fs.mkdir(themeDir, { recursive: true });
  const written: string[] = [];
  const writeThemeFile = async (relative: string, data: string | Buffer): Promise<void> => {
    const target = path.resolve(themeDir, relative);
    if (!target.startsWith(`${themeDir}${path.sep}`)) throw new Error(`Path escapes the theme directory: ${relative}`);
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, data);
    written.push(relative);
  };

  const manifest = { ...portable.manifest };
  if (portable.art && !manifest.art) manifest.art = portable.art.filename;
  await writeThemeFile('theme.json', `${JSON.stringify(manifest, null, 2)}\n`);

  // Preserve the manifest's relative layout (e.g. assets/artwork.png): the
  // CSS references these files by relative url(), so flattening breaks them.
  await writeThemeFile(manifest.css, portable.css);

  if (portable.art) {
    await writeThemeFile(manifest.art ?? portable.art.filename, Buffer.from(portable.art.base64, 'base64'));
  }

  if (typeof portable.readme === 'string' && portable.readme.trim()) {
    await writeThemeFile('README.md', portable.readme);
  }

  return {
    status: 'installed',
    themeId: portable.manifest.id,
    themeVersion: portable.manifest.version,
    themeDir,
    files: written,
    ...(exists ? { overwrote: true } : {}),
  };
}

export function rateLimitGuidance(response: { status: number; headers: { get(name: string): string | null } }): string {
  const retryAfter = response.headers.get('retry-after');
  const wait = retryAfter ? ` Retry after ${retryAfter} seconds, or better:` : '';
  const cause = response.status === 429
    ? 'Rate limited: the free anonymous download quota is used up.'
    : 'The free download quota for this client is exhausted.';
  return `${cause}${wait} configure a personal CodexThemes API key for higher limits. ` +
    `Create one at ${apiKeySettingsUrl}, then store it with: npx tsx scripts/apikey.ts set`;
}

export async function installTheme(idOrUrl: string, force = false, fetchImpl: typeof fetch = fetch): Promise<Record<string, unknown>> {
  const themeId = parseThemeId(idOrUrl);
  const apiKey = await resolveApiKey();
  const endpoint = downloadEndpoint(themeId);
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey.key}`;

  const response = await fetchImpl(endpoint, { headers });
  const responseText = await response.text();

  if (response.status === 429 || response.status === 402) throw new Error(rateLimitGuidance(response));
  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `Download rejected (HTTP ${response.status}): the configured API key is invalid or revoked. ` +
      `Create a new key at ${apiKeySettingsUrl} and store it with: npx tsx scripts/apikey.ts set`,
    );
  }
  if (response.status === 404) throw new Error(`Theme "${themeId}" was not found on codexthemes.ai`);
  if (!response.ok) {
    throw new Error(`Download failed (HTTP ${response.status})${responseText ? `: ${responseText.slice(0, 500)}` : ''}`);
  }
  if (Buffer.byteLength(responseText) > maxPackageBytes) throw new Error('Downloaded package exceeds 30 MB');

  let portable: unknown;
  try {
    portable = JSON.parse(responseText);
  } catch {
    throw new Error('Downloaded package is not valid JSON');
  }
  const errors = validatePackage(portable, themeId);
  if (errors.length > 0) throw new Error(`Downloaded package failed validation:\n${errors.join('\n')}`);

  const result = await installPackage(portable as PortablePackage, force);
  return {
    ...result,
    endpoint,
    auth: apiKey ? { mode: 'api-key', source: apiKey.source, apiKey: maskApiKey(apiKey.key) } : { mode: 'anonymous-free-quota' },
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const result = await installTheme(options.themeId, options.force);
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
