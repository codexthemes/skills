#!/usr/bin/env node

import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.dirname(scriptDir);
const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'codexthemes-skill-'));
const artPath = path.join(tempDir, 'art.png');
await fs.writeFile(artPath, Buffer.from('89504e470d0a1a0a', 'hex'));

function run(script, args) {
  return spawnSync(process.execPath, [path.join(scriptDir, script), ...args], { encoding: 'utf8' });
}

try {
  const skill = await fs.readFile(path.join(skillDir, 'SKILL.md'), 'utf8');
  assert.match(skill, /^---\nname: new-theme\ndescription: .+\n---/);

  for (const mode of ['native-background', 'native-immersive', 'editorial-showcase', 'palette-only']) {
    const args = ['--id', `test-${mode}`, '--name', `Test ${mode}`, '--layout-mode', mode, '--output', tempDir];
    if (mode !== 'palette-only') args.push('--art', artPath);
    const scaffold = run('scaffold-theme.mjs', args);
    assert.equal(scaffold.status, 0, scaffold.stderr);
    const themeDir = path.join(tempDir, `test-${mode}`);
    const validate = run('validate-theme.mjs', [themeDir]);
    assert.equal(validate.status, 0, `${validate.stdout}\n${validate.stderr}`);
  }

  const badDir = path.join(tempDir, 'test-native-immersive');
  await fs.appendFile(path.join(badDir, 'theme.css'), '\nmain * { opacity: 1; }\n');
  const bad = run('validate-theme.mjs', [badDir]);
  assert.equal(bad.status, 1);
  assert.match(bad.stdout, /broad descendant state override/);

  console.log('All new-theme skill tests passed.');
} finally {
  await fs.rm(tempDir, { recursive: true, force: true });
}
