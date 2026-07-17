import os from 'node:os';
import path from 'node:path';

export function codexThemesHome(): string {
  const configured = process.env.CODEX_THEMES_HOME?.trim();
  return path.resolve(configured || path.join(os.homedir(), '.codex-themes'));
}

export function themesRoot(): string {
  return path.join(codexThemesHome(), 'themes');
}

export function exportsRoot(): string {
  return path.join(codexThemesHome(), 'exports');
}

export function stateRoot(): string {
  return path.join(codexThemesHome(), 'state');
}

export function runtimeStatePath(): string {
  return path.join(stateRoot(), 'runtime.json');
}
