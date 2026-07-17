#!/usr/bin/env -S npx tsx

import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import type { BackgroundScope, LayoutMode } from './scaffold-theme.ts';

interface ThemeDesign {
  layoutMode?: LayoutMode;
  backgroundScope?: BackgroundScope;
  modeReason?: string;
  contrastStrategy?: string;
  allowedChanges?: string[];
  preserve?: string[];
  verificationViewports?: string[];
}

interface ThemeManifest {
  id?: string;
  displayName?: string;
  description?: string;
  version?: string;
  mode?: string;
  css?: string;
  art?: string;
  platforms?: string[];
  design?: ThemeDesign;
  palette?: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  theme?: string;
  version?: string;
  layoutMode?: LayoutMode;
  backgroundScope?: BackgroundScope;
  errors: string[];
  warnings: string[];
}

interface CssRule {
  selector: string;
  body: string;
}

const allowedModes: LayoutMode[] = [
  'native-background',
  'native-immersive',
  'editorial-showcase',
  'palette-only',
];

export async function validateTheme(themeDirectory: string): Promise<ValidationResult> {
  const themeDir = path.resolve(themeDirectory);
  const errors: string[] = [];
  const warnings: string[] = [];
  const requireString = (value: unknown, label: string): string => {
    if (typeof value !== 'string' || !value.trim()) {
      errors.push(`${label} must be a non-empty string`);
      return '';
    }
    return value.trim();
  };
  const requireArray = (value: unknown, label: string): void => {
    if (!Array.isArray(value) || value.length === 0) errors.push(`${label} must be a non-empty array`);
  };

  let manifest: ThemeManifest;
  try {
    manifest = JSON.parse(await fs.readFile(path.join(themeDir, 'theme.json'), 'utf8')) as ThemeManifest;
  } catch (error) {
    return {
      valid: false,
      errors: [`Cannot read theme.json: ${error instanceof Error ? error.message : String(error)}`],
      warnings,
    };
  }

  requireString(manifest.id, 'id');
  requireString(manifest.displayName, 'displayName');
  requireString(manifest.description, 'description');
  requireString(manifest.version, 'version');
  if (!/^[a-z0-9][a-z0-9-]*$/.test(manifest.id ?? '')) errors.push('id must be a lowercase safe slug');
  if (!['light', 'dark'].includes(manifest.mode ?? '')) errors.push('mode must be light or dark');
  requireArray(manifest.platforms, 'platforms');

  const design = manifest.design ?? {};
  if (!allowedModes.includes(design.layoutMode as LayoutMode)) errors.push('design.layoutMode is invalid');
  if (!['home', 'workspace'].includes(design.backgroundScope ?? '')) {
    errors.push('design.backgroundScope must be home or workspace');
  }
  for (const key of ['modeReason', 'contrastStrategy'] as const) requireString(design[key], `design.${key}`);
  requireArray(design.allowedChanges, 'design.allowedChanges');
  requireArray(design.preserve, 'design.preserve');
  if (!Array.isArray(design.verificationViewports) || design.verificationViewports.length < 2) {
    errors.push('design.verificationViewports must include desktop and narrow viewports');
  }

  const palette = manifest.palette ?? {};
  for (const key of ['canvas', 'surface', 'raised', 'text', 'muted', 'accent', 'border', 'focus']) {
    requireString(palette[key], `palette.${key}`);
  }

  const cssRel = requireString(manifest.css, 'css') || 'theme.css';
  const cssPath = path.resolve(themeDir, cssRel);
  if (!cssPath.startsWith(`${themeDir}${path.sep}`)) errors.push('css path must remain inside the theme directory');
  let css = '';
  try {
    css = await fs.readFile(cssPath, 'utf8');
  } catch (error) {
    errors.push(`cannot read CSS: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (manifest.art) {
    const artPath = path.resolve(themeDir, manifest.art);
    if (!artPath.startsWith(`${themeDir}${path.sep}`)) errors.push('art path must remain inside the theme directory');
    try { await fs.access(artPath); } catch { errors.push(`declared artwork does not exist: ${manifest.art}`); }
  } else if (design.layoutMode === 'native-background') {
    errors.push('native-background requires local artwork');
  }
  if (design.layoutMode === 'palette-only' && manifest.art) errors.push('palette-only must not declare dominant artwork');

  const cleanCss = css.replace(/\/\*[\s\S]*?\*\//g, '');
  if (/@import\s|expression\s*\(|javascript\s*:|url\(\s*["']?(?:https?:|\/\/)/i.test(cleanCss)) {
    errors.push('CSS contains an external or executable resource');
  }
  if (/__THEME_[A-Z0-9_]+__/.test(cleanCss)) errors.push('CSS still contains scaffold placeholders');

  const rules: CssRule[] = [...cleanCss.matchAll(/([^{}]+)\{([^{}]*)\}/g)].map((match) => ({
    selector: match[1]!.trim(),
    body: match[2]!,
  }));

  for (const { selector, body } of rules) {
    const normalized = selector.replace(/\s+/g, ' ');
    const broad = /\b(?:aside|main)\b[^,{]*\*/i.test(normalized) || /(^|,)\s*svg\s*(?:,|$)/i.test(normalized);
    const stateProperty = /\b(?:opacity|display|visibility|position|overflow|color)\s*:/i.test(body);
    if (broad && stateProperty) errors.push(`broad descendant state override: ${normalized}`);
    if (/\bheader\b/i.test(normalized) && /background(?:-image)?\s*:[^;]*gradient/i.test(body)) {
      warnings.push(`header gradient requires real-app contrast evidence: ${normalized}`);
    }
  }

  if (!/@media\s*\(/.test(cleanCss)) errors.push('CSS needs a narrow-window media query');
  if (!/@media\s*\(prefers-reduced-motion:\s*reduce\)/.test(cleanCss)) warnings.push('CSS has no reduced-motion rule');
  if ((cleanCss.match(/pointer-events\s*:\s*none/g) ?? []).length < 1 && manifest.art) {
    errors.push('artwork themes need pointer-events: none on decorative layers');
  }

  const homeScoped = /dream-home|home-shell|data-codexthemes-page=["']home/.test(cleanCss);
  const conversationScoped = /dream-conversation|conversation-shell|data-codexthemes-page=["']conversation/.test(cleanCss);
  if (manifest.art && !homeScoped) errors.push('artwork is not scoped to a verified home marker');
  if (design.backgroundScope === 'workspace' && !conversationScoped) {
    errors.push('workspace background lacks a verified conversation scope');
  }
  if (design.backgroundScope === 'home' && conversationScoped) {
    warnings.push('home-only theme contains conversation selectors; confirm they do not render artwork');
  }
  if (/main\s*:not\(/.test(cleanCss)) errors.push('do not infer conversation state with main:not(...)');

  if (design.layoutMode === 'native-background') {
    const forbidden = /\b(?:width|height|min-height|max-height|flex-basis|grid-template|order)\s*:/i;
    for (const { selector, body } of rules) {
      if (forbidden.test(body) && !/::(?:before|after)/.test(selector)) {
        errors.push(`native-background changes native geometry: ${selector.replace(/\s+/g, ' ')}`);
      }
    }
    for (const invariant of ['native geometry', 'native controls', 'native states']) {
      if (!design.preserve?.includes(invariant)) errors.push(`native-background must preserve ${invariant}`);
    }
  }

  if (manifest.mode === 'light' && design.layoutMode !== 'native-background') {
    for (const key of ['terminalBackground', 'terminalForeground']) requireString(palette[key], `palette.${key}`);
    for (const signal of ['role="menu"', 'role="dialog"', 'xterm']) {
      if (!cleanCss.includes(signal)) warnings.push(`light immersive theme has no explicit ${signal} surface rule`);
    }
  }

  return {
    valid: errors.length === 0,
    ...(manifest.id === undefined ? {} : { theme: manifest.id }),
    ...(manifest.version === undefined ? {} : { version: manifest.version }),
    ...(design.layoutMode === undefined ? {} : { layoutMode: design.layoutMode }),
    ...(design.backgroundScope === undefined ? {} : { backgroundScope: design.backgroundScope }),
    errors: [...new Set(errors)],
    warnings: [...new Set(warnings)],
  };
}

async function main(): Promise<void> {
  const themeDir = process.argv[2];
  if (!themeDir) {
    console.error('Usage: npx tsx scripts/validate-theme.ts /absolute/theme-directory');
    process.exitCode = 2;
    return;
  }
  const result = await validateTheme(themeDir);
  console.log(JSON.stringify(result, null, 2));
  if (!result.valid) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error: unknown) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 2;
  });
}
