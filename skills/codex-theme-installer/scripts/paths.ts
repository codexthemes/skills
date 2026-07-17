import os from 'node:os';
import path from 'node:path';

export function codexThemesHome(): string {
  const configured = process.env.CODEX_THEMES_HOME?.trim();
  return path.resolve(configured || path.join(os.homedir(), '.codexthemes'));
}

export function themesRoot(): string {
  return path.join(codexThemesHome(), 'themes');
}

export function credentialsPath(): string {
  return path.join(codexThemesHome(), 'credentials.json');
}

export function apiBaseUrl(): string {
  const configured = process.env.CODEXTHEMES_API_BASE?.trim();
  return (configured || 'https://codexthemes.ai').replace(/\/+$/, '');
}

export function downloadEndpoint(themeId: string): string {
  return `${apiBaseUrl()}/api/themes/${encodeURIComponent(themeId)}/download`;
}
