#!/usr/bin/env -S npx tsx

import fs from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { codexThemesHome, credentialsPath } from './paths.ts';

export const apiKeySettingsUrl = 'https://codexthemes.ai/settings/apikeys';

export interface ResolvedApiKey {
  key: string;
  source: 'env' | 'credentials-file';
}

export function maskApiKey(key: string): string {
  if (key.length <= 8) return `${key.slice(0, 2)}…`;
  return `${key.slice(0, 4)}…${key.slice(-4)}`;
}

export async function resolveApiKey(): Promise<ResolvedApiKey | null> {
  const fromEnv = process.env.CODEXTHEMES_API_KEY?.trim();
  if (fromEnv) return { key: fromEnv, source: 'env' };
  try {
    const parsed = JSON.parse(await fs.readFile(credentialsPath(), 'utf8')) as { apiKey?: unknown };
    if (typeof parsed.apiKey === 'string' && parsed.apiKey.trim()) {
      return { key: parsed.apiKey.trim(), source: 'credentials-file' };
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }
  return null;
}

export async function saveApiKey(key: string): Promise<string> {
  const trimmed = key.trim();
  if (!trimmed) throw new Error('API key must not be empty');
  if (/\s/.test(trimmed)) throw new Error('API key must not contain whitespace');
  await fs.mkdir(codexThemesHome(), { recursive: true });
  const filename = credentialsPath();
  await fs.writeFile(filename, `${JSON.stringify({ apiKey: trimmed }, null, 2)}\n`, { encoding: 'utf8', mode: 0o600 });
  await fs.chmod(filename, 0o600);
  return filename;
}

export async function clearApiKey(): Promise<boolean> {
  try {
    await fs.rm(credentialsPath());
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return false;
    throw error;
  }
}

async function readKeyFromStdin(): Promise<string> {
  if (process.stdin.isTTY) return '';
  let input = '';
  for await (const chunk of process.stdin) input += chunk;
  return input.trim();
}

async function main(): Promise<void> {
  const [command, argument] = process.argv.slice(2);
  if (command === 'status') {
    const resolved = await resolveApiKey();
    console.log(JSON.stringify(
      resolved
        ? { configured: true, source: resolved.source, apiKey: maskApiKey(resolved.key), credentialsPath: credentialsPath() }
        : {
            configured: false,
            settingsUrl: apiKeySettingsUrl,
            hint: `Create an API key at ${apiKeySettingsUrl}, then store it with: npx tsx scripts/apikey.ts set`,
          },
      null,
      2,
    ));
    if (!resolved) process.exitCode = 1;
    return;
  }
  if (command === 'set') {
    const key = argument ?? await readKeyFromStdin();
    if (!key) throw new Error('Usage: apikey.ts set <key>  (or pipe the key on stdin: printf %s "$KEY" | apikey.ts set)');
    const filename = await saveApiKey(key);
    console.log(JSON.stringify({ status: 'saved', apiKey: maskApiKey(key.trim()), credentialsPath: filename }, null, 2));
    return;
  }
  if (command === 'clear') {
    const removed = await clearApiKey();
    console.log(JSON.stringify({ status: removed ? 'cleared' : 'not-configured', credentialsPath: credentialsPath() }, null, 2));
    return;
  }
  console.error('Usage: apikey.ts <status|set [key]|clear>');
  process.exitCode = 2;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
