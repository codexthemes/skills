#!/usr/bin/env -S npx tsx

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { apiKeySettingsUrl, maskApiKey, resolveApiKey } from './apikey.ts';
import { submitEndpoint } from './paths.ts';

const maxPackageBytes = 30 * 1024 * 1024;
const maxPreviewBytes = 10 * 1024 * 1024;
const previewTypes: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
};

interface SubmitOptions {
  packagePath: string;
  dryRun: boolean;
  previewPath?: string;
  allowArtPreview: boolean;
}

interface PortablePackage {
  format: string;
  schemaVersion: number;
  manifest: { id: string; name?: string; version: string };
  css: string;
  preview?: { filename: string; mimeType: string; base64: string };
  [key: string]: unknown;
}

function parseArgs(argv: string[]): SubmitOptions {
  const packageArg = argv.shift();
  if (!packageArg || packageArg.startsWith('--')) {
    throw new Error('Usage: submit-theme.ts /absolute/path/theme-id.codex-theme [--dry-run] [--preview /absolute/screenshot.png] [--allow-art-preview]');
  }
  const options: SubmitOptions = { packagePath: path.resolve(packageArg), dryRun: false, allowArtPreview: false };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--dry-run') {
      options.dryRun = true;
    } else if (arg === '--preview') {
      const value = argv[++index];
      if (!value) throw new Error('--preview requires an image path');
      options.previewPath = path.resolve(value);
    } else if (arg === '--allow-art-preview') {
      options.allowArtPreview = true;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }
  return options;
}

export function validatePackage(portable: unknown): string[] {
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
    if (typeof manifest.id !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(manifest.id)) {
      errors.push('manifest.id must be a lowercase slug');
    }
    if (typeof manifest.version !== 'string' || !manifest.version.trim()) {
      errors.push('manifest.version must be a non-empty string');
    }
  }
  if (typeof record.css !== 'string' || !record.css.trim()) errors.push('css must be a non-empty string');
  for (const field of ['art', 'preview'] as const) {
    const asset = record[field] as Record<string, unknown> | undefined;
    if (asset === undefined) continue;
    if (typeof asset !== 'object' || asset === null) {
      errors.push(`${field} must be an object when present`);
    } else if (typeof asset.filename !== 'string' || typeof asset.mimeType !== 'string' || typeof asset.base64 !== 'string') {
      errors.push(`${field} must include filename, mimeType, and base64 strings`);
    }
  }
  return errors;
}

async function readPackage(packagePath: string): Promise<{ portable: PortablePackage; body: string }> {
  const body = await fs.readFile(packagePath, 'utf8');
  if (Buffer.byteLength(body) > maxPackageBytes) throw new Error('Package exceeds 30 MB');
  let portable: unknown;
  try {
    portable = JSON.parse(body);
  } catch {
    throw new Error('Package is not valid UTF-8 JSON; export it with codex-theme-creator before submitting');
  }
  const errors = validatePackage(portable);
  if (errors.length > 0) throw new Error(`Package failed validation:\n${errors.join('\n')}`);
  return { portable: portable as PortablePackage, body };
}

const missingPreviewGuidance =
  'The package has no workspace preview, so the gallery card would show the raw background artwork instead of the real themed app. ' +
  'Re-export with codex-theme-creator (it embeds the newest capture from the theme\'s previews/ directory), or pass ' +
  '--preview /absolute/screenshot.png with a full-app screenshot that shows the sidebar and home content. ' +
  'Pass --allow-art-preview only when the user explicitly accepts the artwork as the gallery image.';

async function loadPreviewOverride(previewPath: string): Promise<{ filename: string; mimeType: string; base64: string }> {
  const mimeType = previewTypes[path.extname(previewPath).toLowerCase()];
  if (!mimeType) throw new Error(`--preview must be a .png, .jpg, or .webp image: ${previewPath}`);
  const data = await fs.readFile(previewPath);
  if (data.length === 0 || data.length > maxPreviewBytes) {
    throw new Error(`--preview image must be non-empty and under 10 MB: ${previewPath}`);
  }
  return { filename: path.basename(previewPath), mimeType, base64: data.toString('base64') };
}

export async function submitTheme(
  packagePath: string,
  dryRun = false,
  extras: { previewPath?: string; allowArtPreview?: boolean } = {},
): Promise<Record<string, unknown>> {
  const resolvedPath = path.resolve(packagePath);
  let { portable, body } = await readPackage(resolvedPath);

  let previewSource: 'package' | 'override' | 'none' = portable.preview ? 'package' : 'none';
  if (extras.previewPath) {
    portable = { ...portable, preview: await loadPreviewOverride(extras.previewPath) };
    body = `${JSON.stringify(portable, null, 2)}\n`;
    previewSource = 'override';
  }
  if (previewSource === 'none' && !extras.allowArtPreview && !dryRun) {
    throw new Error(missingPreviewGuidance);
  }

  const endpoint = submitEndpoint();
  const apiKey = await resolveApiKey();
  const preview = previewSource === 'none'
    ? { present: false, galleryFallback: 'raw background artwork', guidance: missingPreviewGuidance }
    : { present: true, source: previewSource, filename: portable.preview!.filename };

  if (dryRun) {
    return {
      status: 'dry-run',
      packagePath: resolvedPath,
      packageValid: true,
      themeId: portable.manifest.id,
      themeVersion: portable.manifest.version,
      preview,
      endpoint,
      apiKey: apiKey ? { configured: true, source: apiKey.source, apiKey: maskApiKey(apiKey.key) } : { configured: false, settingsUrl: apiKeySettingsUrl },
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
    body,
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

  const themeUrl =
    responseJson && typeof responseJson === 'object' && typeof (responseJson as Record<string, unknown>).url === 'string'
      ? ((responseJson as Record<string, unknown>).url as string)
      : undefined;

  return {
    status: 'submitted',
    packagePath: resolvedPath,
    themeId: portable.manifest.id,
    themeVersion: portable.manifest.version,
    preview,
    endpoint,
    httpStatus: response.status,
    ...(themeUrl ? { themeUrl } : {}),
    ...(responseJson !== undefined ? { response: responseJson } : {}),
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const result = await submitTheme(options.packagePath, options.dryRun, {
    ...(options.previewPath ? { previewPath: options.previewPath } : {}),
    allowArtPreview: options.allowArtPreview,
  });
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
