#!/usr/bin/env -S npx tsx

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { exportsRoot } from './paths.ts';
import { validateTheme } from './validate-theme.ts';

interface ExportOptions {
  themeDir: string;
  outputDir: string;
}

interface ThemeManifest {
  id: string;
  version: string;
  css: string;
  art?: string;
  [key: string]: unknown;
}

const maxPackageBytes = 30 * 1024 * 1024;

function parseArgs(argv: string[]): ExportOptions {
  const themeArg = argv.shift();
  if (!themeArg) throw new Error('Usage: export-theme.ts /absolute/theme-directory [--output /absolute/export-directory]');
  const options: ExportOptions = {
    themeDir: path.resolve(themeArg),
    outputDir: exportsRoot(),
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg !== '--output') throw new Error(`Unknown argument: ${arg}`);
    const value = argv[++index];
    if (!value) throw new Error('--output requires a directory');
    options.outputDir = path.resolve(value);
  }
  return options;
}

function assetMimeType(filename: string): string {
  const extension = path.extname(filename).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  throw new Error(`Unsupported artwork type: ${extension || filename}`);
}

async function readOptionalText(filename: string): Promise<string> {
  try {
    return await fs.readFile(filename, 'utf8');
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw error;
  }
}

async function readOptionalJson(filename: string): Promise<Record<string, unknown>> {
  const source = await readOptionalText(filename);
  return source ? JSON.parse(source) as Record<string, unknown> : {};
}

export async function exportTheme(themeDirectory: string, outputDirectory = exportsRoot()): Promise<string> {
  const themeDir = path.resolve(themeDirectory);
  const validation = await validateTheme(themeDir);
  if (!validation.valid) throw new Error(`Theme validation failed:\n${validation.errors.join('\n')}`);

  const manifest = JSON.parse(await fs.readFile(path.join(themeDir, 'theme.json'), 'utf8')) as ThemeManifest;
  const css = await fs.readFile(path.join(themeDir, manifest.css), 'utf8');
  const readme = await readOptionalText(path.join(themeDir, 'README.md'));
  const verification = await readOptionalJson(path.join(themeDir, 'state', 'verification.json'));
  let art: { filename: string; mimeType: string; base64: string } | undefined;
  if (manifest.art) {
    const artPath = path.resolve(themeDir, manifest.art);
    if (!artPath.startsWith(`${themeDir}${path.sep}`)) throw new Error('Artwork path escapes the theme directory');
    art = {
      filename: path.basename(artPath),
      mimeType: assetMimeType(artPath),
      base64: (await fs.readFile(artPath)).toString('base64'),
    };
  }

  const portable = {
    format: 'codex-theme',
    schemaVersion: 1,
    exportedAt: new Date().toISOString(),
    manifest,
    css,
    readme,
    ...(art ? { art } : {}),
    verification,
  };
  const body = `${JSON.stringify(portable, null, 2)}\n`;
  if (Buffer.byteLength(body) > maxPackageBytes) throw new Error('Portable theme package exceeds 30 MB');

  const outputDir = path.resolve(outputDirectory);
  await fs.mkdir(outputDir, { recursive: true });
  const outputPath = path.join(outputDir, `${manifest.id}.codex-theme`);
  await fs.writeFile(outputPath, body, 'utf8');
  return outputPath;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));
  const outputPath = await exportTheme(options.themeDir, options.outputDir);
  console.log(JSON.stringify({ status: 'exported', outputPath }, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
