#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.dirname(scriptDir);

function parseArgs(argv) {
  const options = { layoutMode: 'native-background', backgroundScope: 'home', output: process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--id') options.id = argv[++index];
    else if (arg === '--name') options.name = argv[++index];
    else if (arg === '--layout-mode') options.layoutMode = argv[++index];
    else if (arg === '--background-scope') options.backgroundScope = argv[++index];
    else if (arg === '--output') options.output = path.resolve(argv[++index]);
    else if (arg === '--art') options.art = path.resolve(argv[++index]);
    else throw new Error(`Unknown argument: ${arg}`);
  }
  if (!/^[a-z0-9][a-z0-9-]*$/.test(options.id ?? '')) throw new Error('--id must be a lowercase safe slug');
  options.name ??= options.id;
  if (!['native-background', 'native-immersive', 'editorial-showcase', 'palette-only'].includes(options.layoutMode)) {
    throw new Error('--layout-mode is invalid');
  }
  if (!['home', 'workspace'].includes(options.backgroundScope)) throw new Error('--background-scope must be home or workspace');
  if (options.layoutMode === 'native-background' && !options.art) throw new Error('native-background requires --art');
  if (options.layoutMode === 'palette-only' && options.art) throw new Error('palette-only does not accept --art');
  return options;
}

const options = parseArgs(process.argv.slice(2));
const themeDir = path.join(options.output, options.id);
try {
  await fs.access(themeDir);
  throw new Error(`Refusing to overwrite ${themeDir}`);
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}

await fs.mkdir(path.join(themeDir, 'assets'), { recursive: true });
await fs.mkdir(path.join(themeDir, 'previews'), { recursive: true });
await fs.mkdir(path.join(themeDir, 'state'), { recursive: true });

const templateName = `${options.layoutMode}.css`;
let css = await fs.readFile(path.join(skillDir, 'assets', templateName), 'utf8');
css = css.replaceAll('__THEME_ID__', options.id);

let art = null;
if (options.art) {
  const extension = path.extname(options.art).toLowerCase();
  if (!['.png', '.jpg', '.jpeg', '.webp'].includes(extension)) throw new Error('--art must be PNG, JPEG, or WebP');
  art = `assets/artwork${extension}`;
  await fs.copyFile(options.art, path.join(themeDir, art));
  css = css.replaceAll('./assets/artwork.png', `./${art}`);
}
await fs.writeFile(path.join(themeDir, 'theme.css'), css, 'utf8');

const preserve = ['native controls', 'native states'];
if (options.layoutMode !== 'editorial-showcase') preserve.unshift('native geometry');
const allowedChanges = {
  'native-background': options.backgroundScope === 'workspace'
    ? ['home background', 'conversation background', 'bounded reading surfaces']
    : ['home background'],
  'native-immersive': ['semantic palette', 'native materials', 'scoped artwork', 'decoration'],
  'editorial-showcase': ['bounded home hero', 'semantic palette', 'native materials', 'decoration'],
  'palette-only': ['semantic palette', 'native materials'],
}[options.layoutMode];

const manifest = {
  schemaVersion: 1,
  id: options.id,
  displayName: options.name,
  description: `A Codex desktop theme named ${options.name}.`,
  version: '0.1.0',
  mode: 'light',
  css: 'theme.css',
  ...(art ? { art } : {}),
  design: {
    layoutMode: options.layoutMode,
    backgroundScope: options.backgroundScope,
    modeReason: 'Replace with the explicit reason derived from the brief or reference.',
    artFocalPoint: '50% 50%',
    textSafeRegion: 'Replace with the verified text-safe region.',
    contrastStrategy: 'Replace with the intended veil and bounded-surface strategy.',
    allowedChanges,
    preserve,
    verificationViewports: ['1440x900', '980x760'],
  },
  palette: {
    canvas: '#fffaf6', surface: '#fffdfb', raised: '#ffffff', text: '#3f3033',
    muted: '#806d72', accent: '#bd4968', border: '#ead3d9', focus: '#bd4968',
    success: '#27785a', warning: '#9a671f', danger: '#b33d4c',
    terminalBackground: '#fffaf6', terminalForeground: '#3f3033',
  },
  platforms: ['macos', 'windows'],
  author: { name: 'Theme author' },
  homepage: 'https://codexthemes.ai',
  skillUrl: 'https://codexthemes.ai/SKILL.md',
};

await fs.writeFile(path.join(themeDir, 'theme.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
await fs.writeFile(path.join(themeDir, 'README.md'), `# ${options.name}\n\nCreated with [CodexThemes](https://codexthemes.ai).\n\nBefore publishing, document artwork ownership and complete real-app verification.\n`, 'utf8');
await fs.writeFile(path.join(themeDir, 'state', 'verification.json'), `${JSON.stringify({ status: 'not-verified' }, null, 2)}\n`, 'utf8');
console.log(JSON.stringify({ created: true, themeDir }, null, 2));
