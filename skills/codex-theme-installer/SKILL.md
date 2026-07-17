---
name: codex-theme-installer
description: Download a published Codex theme from codexthemes.ai and install its source files into the local ~/.codexthemes theme library, anonymously within a free quota or with a CodexThemes API key for higher limits. Use when a user asks to install, download, get, or try a theme from CodexThemes, names a codexthemes.ai theme URL or theme id to install, or hits a download rate limit and needs API key guidance.
---

# Install a Codex theme from CodexThemes

Download a published theme's portable package from codexthemes.ai and unpack its source files into `~/.codexthemes/themes/<theme-id>/`. This skill is standalone: its TypeScript scripts own the download, validation, and local installation. It does not search the gallery (codex-theme-finder), create or apply themes (codex-theme-creator), or submit them (codex-theme-submitter). The only required local tools are Node.js 20+ and `npx`.

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

## Step 4: report and hand off

Report the installed path (`~/.codexthemes/themes/<theme-id>/`), the theme version, and the files written. Installation places source files only — it does not change the running Codex app. To see the theme in Codex, hand off to codex-theme-creator's reversible apply workflow (`apply-theme.ts apply <theme-dir>`), which asks the user before restarting the app; when a restart is needed its `--launch` mode schedules a detached helper that survives the restart and the result must be verified afterwards with `apply-theme.ts status`. Never claim a theme is active in Codex just because the files were installed or a restart was scheduled.
