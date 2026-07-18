#!/usr/bin/env -S npx tsx

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { apiKeySettingsUrl, maskApiKey, resolveApiKey } from './apikey.ts';
import { submitEndpoint } from './paths.ts';

const maxPreviewBytes = 10 * 1024 * 1024;

const imageTypes = new Map([
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
]);

export interface SkinOptions {
  name: string;
  slug: string;
  sourceUrl: string;
  previewPath: string;
  author?: string;
  description?: string;
  mode?: string;
  dryRun: boolean;
}

function parseArgs(argv: string[]): SkinOptions {
  const options: SkinOptions = { name: '', slug: '', sourceUrl: '', previewPath: '', dryRun: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      options.dryRun = true;
      continue;
    }
    const value = argv[++index];
    if (value === undefined) throw new Error(`${arg} requires a value`);
    if (arg === '--name') options.name = value;
    else if (arg === '--slug') options.slug = value;
    else if (arg === '--source-url') options.sourceUrl = value;
    else if (arg === '--preview') options.previewPath = path.resolve(value);
    else if (arg === '--author') options.author = value;
    else if (arg === '--description') options.description = value;
    else if (arg === '--mode') options.mode = value;
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!options.name || !options.slug || !options.sourceUrl || !options.previewPath) {
    throw new Error(
      'Usage: submit-skin.ts --name "<skin name>" --slug <ascii-slug> --source-url <https://...> --preview /absolute/preview.png [--author "<name>"] [--description "<text>"] [--mode light|dark|mixed] [--dry-run]',
    );
  }
  return options;
}

export function validateSkinOptions(options: SkinOptions): string[] {
  const errors: string[] = [];
  if (!options.name.trim() || options.name.trim().length > 120) {
    errors.push('name must be a non-empty string of at most 120 characters');
  }
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(options.slug)) {
    errors.push('slug must be a lowercase ASCII slug (letters, digits, hyphens) derived from the theme name');
  }
  try {
    const url = new URL(options.sourceUrl);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
  } catch {
    errors.push('source-url must be an http or https URL');
  }
  if (!imageTypes.has(path.extname(options.previewPath).toLowerCase())) {
    errors.push('preview must be a PNG, JPEG, or WebP file');
  }
  if (options.mode !== undefined && !['light', 'dark', 'mixed'].includes(options.mode)) {
    errors.push('mode must be light, dark, or mixed');
  }
  return errors;
}

async function buildBody(options: SkinOptions): Promise<string> {
  const preview = await fs.readFile(options.previewPath);
  if (preview.byteLength === 0) throw new Error('Preview image is empty');
  if (preview.byteLength > maxPreviewBytes) throw new Error('Preview image exceeds 10 MB');
  return JSON.stringify({
    format: 'codex-skin',
    schemaVersion: 1,
    name: options.name.trim(),
    slug: options.slug,
    ...(options.author?.trim() ? { author: options.author.trim() } : {}),
    ...(options.description?.trim() ? { description: options.description.trim() } : {}),
    ...(options.mode ? { mode: options.mode } : {}),
    sourceUrl: options.sourceUrl,
    preview: {
      filename: path.basename(options.previewPath),
      mimeType: imageTypes.get(path.extname(options.previewPath).toLowerCase()),
      base64: preview.toString('base64'),
    },
  });
}

export async function submitSkin(options: SkinOptions): Promise<Record<string, unknown>> {
  const errors = validateSkinOptions(options);
  if (errors.length > 0) throw new Error(`Skin submission failed validation:\n${errors.join('\n')}`);
  const endpoint = submitEndpoint();
  const apiKey = await resolveApiKey();

  if (options.dryRun) {
    await fs.access(options.previewPath);
    return {
      status: 'dry-run',
      name: options.name.trim(),
      slug: options.slug,
      sourceUrl: options.sourceUrl,
      previewPath: options.previewPath,
      endpoint,
      apiKey: apiKey
        ? { configured: true, source: apiKey.source, apiKey: maskApiKey(apiKey.key) }
        : { configured: false, settingsUrl: apiKeySettingsUrl },
    };
  }

  if (!apiKey) {
    throw new Error(
      `No CodexThemes API key configured. Create one at ${apiKeySettingsUrl}, then store it with: npx tsx scripts/apikey.ts set`,
    );
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey.key}`,
      'Content-Type': 'application/json',
    },
    body: await buildBody(options),
  });

  const responseText = await response.text();
  let responseJson: unknown;
  try {
    responseJson = responseText ? JSON.parse(responseText) : undefined;
  } catch {
    responseJson = undefined;
  }

  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `Submission rejected (HTTP ${response.status}): the API key is invalid, revoked, or lacks permission. ` +
      `Create a new key at ${apiKeySettingsUrl} and store it with: npx tsx scripts/apikey.ts set`,
    );
  }
  if (!response.ok) {
    const detail = responseText.slice(0, 500);
    throw new Error(`Submission failed (HTTP ${response.status})${detail ? `: ${detail}` : ''}`);
  }

  const skinUrl =
    responseJson && typeof responseJson === 'object' && typeof (responseJson as Record<string, unknown>).url === 'string'
      ? ((responseJson as Record<string, unknown>).url as string)
      : undefined;

  return {
    status: 'submitted',
    name: options.name.trim(),
    sourceUrl: options.sourceUrl,
    endpoint,
    httpStatus: response.status,
    ...(skinUrl ? { skinUrl } : {}),
    ...(responseJson !== undefined ? { response: responseJson } : {}),
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const result = await submitSkin(options);
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
