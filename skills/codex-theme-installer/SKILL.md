---
name: codex-theme-installer
description: Download a published Codex theme from codexthemes.ai and install its source files into the local ~/.codexthemes theme library, anonymously within a free quota or with a CodexThemes API key for higher limits. Use when a user asks to install, download, get, or try a theme from CodexThemes, names a codexthemes.ai theme URL or theme id to install, or hits a download rate limit and needs API key guidance.
---

# Install a Codex theme from CodexThemes

Download a published theme's portable package from codexthemes.ai and unpack its source files into `~/.codexthemes/themes/<theme-id>/`. This skill is standalone: its TypeScript scripts own the download, validation, and local installation. It does not search the gallery (codex-theme-finder), create themes (codex-theme-creator), or submit them (codex-theme-submitter). Applying belongs to codex-theme-switcher — but a successful install chains directly into it (Step 4); installing files and stopping is not a finished job. The only required local tools are Node.js 20+ and `npx`.

Read `references/download-api.md` before diagnosing an unexpected API response or changing endpoint behavior. Run all commands from the installed skill directory.

## Step 1: identify the theme

Resolve what to install to a theme id — the lowercase slug from codex-theme-finder results or from a `https://codexthemes.ai/themes/<theme-id>` URL. The script accepts either form. If the user only describes a style without naming a theme, find candidates with codex-theme-finder first instead of guessing ids.

## Step 2: install

```bash
npx tsx scripts/install-theme.ts <theme-id | codexthemes.ai theme URL> [--force]
```

Downloads work without any API key inside a free anonymous quota, so do not demand a key up front. When a key is already configured (`CODEXTHEMES_API_KEY` environment variable or `~/.codexthemes/credentials.json`), the script sends it automatically for higher limits.

The script validates the downloaded package (format, schema version, matching theme id, safe relative filenames, ≤30 MB) before writing anything, then unpacks `theme.json`, the stylesheet, the artwork, and the readme into `~/.codexthemes/themes/<theme-id>/`. It refuses to overwrite an existing non-empty theme directory; pass `--force` only after the user confirms replacing their local copy — the directory may hold their own edits.

## Step 3: handle quota and rate limits

On HTTP `429` or `402` the free quota is exhausted; the script's error message includes any `Retry-After` value. Do not retry in a loop. Tell the user the free download quota is used up and guide them to configure a personal API key:

1. Create a key at `https://codexthemes.ai/settings/apikeys`.
2. Store it: `printf '%s' "<api-key>" | npx tsx scripts/apikey.ts set` (stdin keeps the key out of shell history; `apikey.ts set <key>` also works).
3. Re-run the install.

Check the current key state with `npx tsx scripts/apikey.ts status`; remove a stored key with `npx tsx scripts/apikey.ts clear`. Never print a full key (scripts only show a masked form), never write it into a project file, and never commit it.

On `401`/`403` the configured key is invalid or revoked — guide the user to create a fresh key the same way. On `404` the theme id does not exist; re-check the id with codex-theme-finder.

## Step 4: activate, or hand the user the exact next reply

An install request means the user wants to see the theme in Codex, not merely store its files. Report the installed path (`~/.codexthemes/themes/<theme-id>/`), the theme version, and the files written — then continue directly into activation with codex-theme-switcher. If codex-theme-switcher is not installed, bootstrap it the same way this skill was bootstrapped (`npx skills add codexthemes/skills --skill codex-theme-switcher -g -a codex`).

- If Codex already exposes its debugging endpoint, hot-swap now with the switcher's `switch-theme.ts apply <theme-id>` and verify with `switch-theme.ts status` — a hot swap is reversible and needs no confirmation beyond the install request itself.
- If activation requires restarting Codex, do not restart silently and do not stop at "installed". End by telling the user the exact reply that continues, for example: "Reply `apply` and I will restart Codex to activate `<theme-id>`." When they reply, follow the switcher's `--launch` flow.

Never end the conversation with only "files installed, not applied" and no actionable next step, and never claim the theme is active until the switcher's `status` reports `active`.
