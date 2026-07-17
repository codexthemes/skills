#!/usr/bin/env -S npx tsx

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { apiKeySettingsUrl, maskApiKey, resolveApiKey } from './apikey.ts';
import { submitEndpoint } from './paths.ts';

const maxPackageBytes = 30 * 1024 * 1024;

interface SubmitOptions {
  packagePath: string;
  dryRun: boolean;
}

interface PortablePackage {
  format: string;
  schemaVersion: number;
  manifest: { id: string; name?: string; version: string };
  css: string;
  [key: string]: unknown;
}

function parseArgs(argv: string[]): SubmitOptions {
  const packageArg = argv.shift();
  if (!packageArg || packageArg.startsWith('--')) {
    throw new Error('Usage: submit-theme.ts /absolute/path/theme-id.codex-theme [--dry-run]');
  }
  const options: SubmitOptions = { packagePath: path.resolve(packageArg), dryRun: false };
  for (const arg of argv) {
    if (arg !== '--dry-run') throw new Error(`Unknown argument: ${arg}`);
    options.dryRun = true;
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
  const art = record.art as Record<string, unknown> | undefined;
  if (art !== undefined) {
    if (typeof art !== 'object' || art === null) {
      errors.push('art must be an object when present');
    } else if (typeof art.filename !== 'string' || typeof art.mimeType !== 'string' || typeof art.base64 !== 'string') {
      errors.push('art must include filename, mimeType, and base64 strings');
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

export async function submitTheme(packagePath: string, dryRun = false): Promise<Record<string, unknown>> {
  const resolvedPath = path.resolve(packagePath);
  const { portable, body } = await readPackage(resolvedPath);
  const endpoint = submitEndpoint();
  const apiKey = await resolveApiKey();

  if (dryRun) {
    return {
      status: 'dry-run',
      packagePath: resolvedPath,
      packageValid: true,
      themeId: portable.manifest.id,
      themeVersion: portable.manifest.version,
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

  return {
    status: 'submitted',
    packagePath: resolvedPath,
    themeId: portable.manifest.id,
    themeVersion: portable.manifest.version,
    endpoint,
    httpStatus: response.status,
    ...(responseJson !== undefined ? { response: responseJson } : {}),
  };
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const result = await submitTheme(options.packagePath, options.dryRun);
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
