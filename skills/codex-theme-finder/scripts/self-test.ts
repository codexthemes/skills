#!/usr/bin/env -S npx tsx

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { resolveApiKey, saveApiKey } from './apikey.ts';
import { searchEndpoint } from './paths.ts';
import { buildSearchUrl, findThemes, parseSearchArgs } from './find-themes.ts';

const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexthemes-finder-'));
const previousHome = process.env.CODEX_THEMES_HOME;
const previousKey = process.env.CODEXTHEMES_API_KEY;
process.env.CODEX_THEMES_HOME = tempDir;
delete process.env.CODEXTHEMES_API_KEY;

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
}

try {
  assert.match(searchEndpoint(), /^https:\/\/codexthemes\.ai\/api\/themes$/);

  const parsed = parseSearchArgs(['dark', 'anime', '--limit', '10', '--page', '2', '--sort', 'popular']);
  assert.deepEqual(parsed, { query: 'dark anime', page: 2, limit: 10, sort: 'popular' });
  assert.equal(parseSearchArgs([]).query, '');
  assert.equal(parseSearchArgs(['--limit', '500']).limit, 50);
  assert.throws(() => parseSearchArgs(['--limit', '0']), /positive integer/);
  assert.throws(() => parseSearchArgs(['--sort', 'weird']), /--sort/);
  assert.throws(() => parseSearchArgs(['--nope']), /Unknown argument/);

  const url = new URL(buildSearchUrl(parsed));
  assert.equal(url.pathname, '/api/themes');
  assert.equal(url.searchParams.get('q'), 'dark anime');
  assert.equal(url.searchParams.get('page'), '2');
  assert.equal(url.searchParams.get('limit'), '10');
  assert.equal(url.searchParams.get('sort'), 'popular');

  let capturedHeaders: Record<string, string> = {};
  const stub = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
    ((input: string | URL | Request, init?: RequestInit) => {
      capturedHeaders = { ...(init?.headers as Record<string, string>) };
      return Promise.resolve(jsonResponse(body, status, headers));
    }) as typeof fetch;

  assert.equal(await resolveApiKey(), null);
  const anonymous = await findThemes({ query: 'dark', page: 1, limit: 20 }, stub({ themes: [{ id: 'noir' }], total: 1 }));
  assert.deepEqual(anonymous.auth, { mode: 'anonymous-free-quota' });
  assert.deepEqual(anonymous.result, { themes: [{ id: 'noir' }], total: 1 });
  assert.equal(capturedHeaders['Authorization'], undefined);

  await saveApiKey('cx-find-1234567890');
  const authed = await findThemes({ query: 'dark', page: 1, limit: 20 }, stub({ themes: [] }));
  assert.deepEqual(authed.auth, { mode: 'api-key', source: 'credentials-file', apiKey: 'cx-f…7890' });
  assert.equal(capturedHeaders['Authorization'], 'Bearer cx-find-1234567890');
  assert.doesNotMatch(JSON.stringify(authed), /cx-find-1234567890/);

  await assert.rejects(
    findThemes({ query: 'x', page: 1, limit: 20 }, stub({}, 429, { 'retry-after': '60' })),
    (error: Error) => /Rate limited/.test(error.message)
      && /Retry after 60 seconds/.test(error.message)
      && /codexthemes\.ai\/settings\/apikeys/.test(error.message),
  );
  await assert.rejects(
    findThemes({ query: 'x', page: 1, limit: 20 }, stub({}, 402)),
    /free search quota.*codexthemes\.ai\/settings\/apikeys/s,
  );
  await assert.rejects(
    findThemes({ query: 'x', page: 1, limit: 20 }, stub({}, 401)),
    /invalid or revoked/,
  );
  await assert.rejects(
    findThemes({ query: 'x', page: 1, limit: 20 }, stub({ error: 'boom' }, 500)),
    /HTTP 500/,
  );

  console.log('All TypeScript codex-theme-finder skill tests passed.');
} finally {
  if (previousHome === undefined) delete process.env.CODEX_THEMES_HOME;
  else process.env.CODEX_THEMES_HOME = previousHome;
  if (previousKey === undefined) delete process.env.CODEXTHEMES_API_KEY;
  else process.env.CODEXTHEMES_API_KEY = previousKey;
  await fs.rm(tempDir, { recursive: true, force: true });
}
