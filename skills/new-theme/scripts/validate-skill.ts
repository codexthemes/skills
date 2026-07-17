#!/usr/bin/env -S npx tsx

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export interface SkillValidationResult {
  valid: boolean;
  skillDir: string;
  errors: string[];
}

function parseSimpleYaml(block: string): Record<string, string> {
  const values: Record<string, string> = {};
  for (const rawLine of block.split('\n')) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const separator = line.indexOf(':');
    if (separator < 1) throw new Error(`Invalid YAML line: ${rawLine}`);
    const key = line.slice(0, separator).trim();
    const value = line.slice(separator + 1).trim().replace(/^(["'])(.*)\1$/, '$2');
    values[key] = value;
  }
  return values;
}

export async function validateSkill(skillDirectory: string): Promise<SkillValidationResult> {
  const skillDir = path.resolve(skillDirectory);
  const errors: string[] = [];
  let source = '';
  try {
    source = await fs.readFile(path.join(skillDir, 'SKILL.md'), 'utf8');
  } catch (error) {
    return {
      valid: false,
      skillDir,
      errors: [`Cannot read SKILL.md: ${error instanceof Error ? error.message : String(error)}`],
    };
  }

  const match = source.match(/^---\n([\s\S]*?)\n---(?:\n|$)/);
  if (!match) {
    errors.push('SKILL.md must start with YAML frontmatter');
    return { valid: false, skillDir, errors };
  }

  let frontmatter: Record<string, string> = {};
  try {
    frontmatter = parseSimpleYaml(match[1]!);
  } catch (error) {
    errors.push(error instanceof Error ? error.message : String(error));
  }

  const keys = Object.keys(frontmatter);
  for (const key of keys) {
    if (!['name', 'description'].includes(key)) errors.push(`Unsupported frontmatter field: ${key}`);
  }
  if (!frontmatter.name) errors.push('frontmatter.name is required');
  if (!frontmatter.description) errors.push('frontmatter.description is required');
  if (frontmatter.name && !/^[a-z0-9-]{1,64}$/.test(frontmatter.name)) {
    errors.push('frontmatter.name must use lowercase letters, digits, and hyphens only');
  }
  if (frontmatter.name && path.basename(skillDir) !== frontmatter.name) {
    errors.push('skill directory name must match frontmatter.name');
  }
  if ((frontmatter.description?.length ?? 0) > 1024) errors.push('frontmatter.description is too long');
  if (source.split('\n').length > 500) errors.push('SKILL.md must stay under 500 lines');

  const agentYamlPath = path.join(skillDir, 'agents', 'openai.yaml');
  try {
    const agentYaml = await fs.readFile(agentYamlPath, 'utf8');
    for (const field of ['display_name:', 'short_description:', 'default_prompt:']) {
      if (!agentYaml.includes(field)) errors.push(`agents/openai.yaml is missing ${field.slice(0, -1)}`);
    }
    if (!agentYaml.includes(`$${frontmatter.name}`)) errors.push('default_prompt must reference the skill name');
  } catch (error) {
    errors.push(`Cannot read agents/openai.yaml: ${error instanceof Error ? error.message : String(error)}`);
  }

  return { valid: errors.length === 0, skillDir, errors };
}

async function main(): Promise<void> {
  const skillDir = process.argv[2];
  if (!skillDir) {
    console.error('Usage: npx tsx scripts/validate-skill.ts /absolute/skill-directory');
    process.exitCode = 2;
    return;
  }
  const result = await validateSkill(skillDir);
  console.log(JSON.stringify(result, null, 2));
  if (!result.valid) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  });
}
