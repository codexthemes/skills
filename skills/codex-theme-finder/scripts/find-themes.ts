#!/usr/bin/env -S npx tsx

import { pathToFileURL } from 'node:url';

import { apiKeySettingsUrl, maskApiKey, resolveApiKey } from './apikey.ts';
import { searchEndpoint } from './paths.ts';

export interface SearchOptions {
  query: string;
  page: number;
  limit: number;
  sort?: 'popular' | 'newest' | 'name';
}

export function parseSearchArgs(argv: string[]): SearchOptions {
  const options: SearchOptions = { query: '', page: 1, limit: 20 };
  const terms: string[] = [];
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index]!;
    if (arg === '--page' || arg === '--limit') {
      const value = Number(argv[++index]);
      if (!Number.isInteger(value) || value < 1) throw new Error(`${arg} requires a positive integer`);
      if (arg === '--page') options.page = value;
      else options.limit = Math.min(value, 50);
    } else if (arg === '--sort') {
      const value = argv[++index];
      if (value !== 'popular' && value !== 'newest' && value !== 'name') {
        throw new Error('--sort must be popular, newest, or name');
      }
      options.sort = value;
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown argument: ${arg}`);
    } else {
      terms.push(arg);
    }
  }
  options.query = terms.join(' ').trim();
  return options;
}

export function buildSearchUrl(options: SearchOptions): string {
  const url = new URL(searchEndpoint());
  if (options.query) url.searchParams.set('q', options.query);
  url.searchParams.set('page', String(options.page));
  url.searchParams.set('limit', String(options.limit));
  if (options.sort) url.searchParams.set('sort', options.sort);
  return url.toString();
}

export function rateLimitGuidance(response: { status: number; headers: { get(name: string): string | null } }): string {
  const retryAfter = response.headers.get('retry-after');
  const wait = retryAfter ? ` Retry after ${retryAfter} seconds, or better:` : '';
  const cause = response.status === 429
    ? 'Rate limited: the free anonymous search quota is used up.'
    : 'The free search quota for this client is exhausted.';
  return `${cause}${wait} configure a personal CodexThemes API key for higher limits. ` +
    `Create one at ${apiKeySettingsUrl}, then store it with: npx tsx scripts/apikey.ts set`;
}

export async function findThemes(options: SearchOptions, fetchImpl: typeof fetch = fetch): Promise<Record<string, unknown>> {
  const apiKey = await resolveApiKey();
  const url = buildSearchUrl(options);
  const headers: Record<string, string> = { 'Accept': 'application/json' };
  if (apiKey) headers['Authorization'] = `Bearer ${apiKey.key}`;

  const response = await fetchImpl(url, { headers });
  const responseText = await response.text();
  let responseJson: unknown;
  try {
    responseJson = responseText ? JSON.parse(responseText) : undefined;
  } catch {
    responseJson = undefined;
  }

  if (response.status === 429 || response.status === 402) {
    throw new Error(rateLimitGuidance(response));
  }
  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `Search rejected (HTTP ${response.status}): the configured API key is invalid or revoked. ` +
      `Create a new key at ${apiKeySettingsUrl} and store it with: npx tsx scripts/apikey.ts set`,
    );
  }
  if (!response.ok) {
    throw new Error(`Search failed (HTTP ${response.status})${responseText ? `: ${responseText.slice(0, 500)}` : ''}`);
  }

  return {
    status: 'ok',
    query: options.query,
    page: options.page,
    limit: options.limit,
    ...(options.sort ? { sort: options.sort } : {}),
    auth: apiKey ? { mode: 'api-key', source: apiKey.source, apiKey: maskApiKey(apiKey.key) } : { mode: 'anonymous-free-quota' },
    ...(responseJson !== undefined ? { result: responseJson } : { result: null }),
  };
}

async function main(): Promise<void> {
  const options = parseSearchArgs(process.argv.slice(2));
  const result = await findThemes(options);
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
