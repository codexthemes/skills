#!/usr/bin/env -S npx tsx

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { themesRoot } from './paths.ts';

export type LayoutMode =
  | 'native-background'
  | 'native-immersive'
  | 'editorial-showcase'
  | 'palette-only';

export type BackgroundScope = 'home' | 'workspace';

export interface ScaffoldOptions {
  id: string;
  name: string;
  layoutMode: LayoutMode;
  backgroundScope: BackgroundScope;
  output: string;
  art?: string;
}

export interface ScaffoldResult {
  created: true;
  themeDir: string;
}

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const skillDir = path.dirname(scriptDir);
const layoutModes: LayoutMode[] = [
  'native-background',
  'native-immersive',
  'editorial-showcase',
  'palette-only',
];

function nextValue(argv: string[], index: number, flag: string): string {
  const value = argv[index + 1];
  if (!value) throw new Error(`${flag} requires a value`);
  return value;
}

export function parseScaffoldArgs(argv: string[]): ScaffoldOptions {
  const values: Partial<ScaffoldOptions> = {
    layoutMode: 'native-background',
    backgroundScope: 'home',
    output: themesRoot(),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--id') values.id = nextValue(argv, index++, arg);
    else if (arg === '--name') values.name = nextValue(argv, index++, arg);
    else if (arg === '--layout-mode') values.layoutMode = nextValue(argv, index++, arg) as LayoutMode;
    else if (arg === '--background-scope') values.backgroundScope = nextValue(argv, index++, arg) as BackgroundScope;
    else if (arg === '--output') values.output = path.resolve(nextValue(argv, index++, arg));
    else if (arg === '--art') values.art = path.resolve(nextValue(argv, index++, arg));
    else throw new Error(`Unknown argument: ${arg}`);
  }

  if (!/^[a-z0-9][a-z0-9-]*$/.test(values.id ?? '')) throw new Error('--id must be a lowercase safe slug');
  if (!layoutModes.includes(values.layoutMode as LayoutMode)) throw new Error('--layout-mode is invalid');
  if (!['home', 'workspace'].includes(values.backgroundScope ?? '')) {
    throw new Error('--background-scope must be home or workspace');
  }
  if (values.layoutMode === 'native-background' && !values.art) throw new Error('native-background requires --art');
  if (values.layoutMode === 'palette-only' && values.art) throw new Error('palette-only does not accept --art');

  return {
    id: values.id!,
    name: values.name ?? values.id!,
    layoutMode: values.layoutMode as LayoutMode,
    backgroundScope: values.backgroundScope as BackgroundScope,
    output: values.output!,
    ...(values.art ? { art: values.art } : {}),
  };
}

export async function scaffoldTheme(options: ScaffoldOptions): Promise<ScaffoldResult> {
  const themeDir = path.join(options.output, options.id);
  try {
    await fs.access(themeDir);
    throw new Error(`Refusing to overwrite ${themeDir}`);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
  }

  await fs.mkdir(path.join(themeDir, 'assets'), { recursive: true });
  await fs.mkdir(path.join(themeDir, 'previews'), { recursive: true });
  await fs.mkdir(path.join(themeDir, 'state'), { recursive: true });

  const templateName = `${options.layoutMode}.css`;
  let css = await fs.readFile(path.join(skillDir, 'assets', templateName), 'utf8');
  css = css.replaceAll('__THEME_ID__', options.id);

  let art: string | undefined;
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
  const allowedChanges: Record<LayoutMode, string[]> = {
    'native-background': options.backgroundScope === 'workspace'
      ? ['home background', 'conversation background', 'bounded reading surfaces']
      : ['home background'],
    'native-immersive': ['semantic palette', 'native materials', 'scoped artwork', 'decoration'],
    'editorial-showcase': ['bounded home hero', 'semantic palette', 'native materials', 'decoration'],
    'palette-only': ['semantic palette', 'native materials'],
  };

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
      allowedChanges: allowedChanges[options.layoutMode],
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
  await fs.writeFile(
    path.join(themeDir, 'README.md'),
    `# ${options.name}\n\nCreated with [CodexThemes](https://codexthemes.ai).\n\nAfter real-app verification, export the theme and submit it at https://codexthemes.ai/submit.\n`,
    'utf8',
  );
  await fs.writeFile(
    path.join(themeDir, 'state', 'verification.json'),
    `${JSON.stringify({ status: 'not-verified' }, null, 2)}\n`,
    'utf8',
  );

  return { created: true, themeDir };
}

async function main(): Promise<void> {
  const result = await scaffoldTheme(parseScaffoldArgs(process.argv.slice(2)));
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
