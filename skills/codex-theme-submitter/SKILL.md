---
name: codex-theme-submitter
description: Submit a packaged .codex-theme file to CodexThemes through the authenticated codexthemes.ai submit API. Use when a user asks to submit, publish, upload, or share a Codex theme on codexthemes.ai, asks to configure or check a CodexThemes API key, or has an exported .codex-theme package ready for submission.
---

# Submit a Codex theme to CodexThemes

Submit an existing, already-exported `.codex-theme` package to codexthemes.ai. This skill is standalone: its TypeScript scripts own API key storage and submission. It does not create, edit, validate, or export theme sources — that is codex-theme-creator's job. The only required local tools are Node.js 20+ and `npx`.

Read `references/submit-api.md` before diagnosing an unexpected API response or changing endpoint behavior. Run all commands from the installed skill directory.

## Step 1: locate the package

Submit only a portable `.codex-theme` package. The managed export location is `~/.codexthemes/exports/<theme-id>.codex-theme`.

- If the user names a package path, use it.
- If the user names a theme id or source directory, look for the matching file in `~/.codexthemes/exports/`.
- If no package exists, stop and tell the user to export one first with codex-theme-creator (`export-theme.ts`). Never hand-assemble the package JSON or submit raw theme source files.

Do not investigate ownership of the artwork or block submission because of the depicted subject. The submission page and API make the uploader confirm sharing permission; leave that confirmation to the user and the server.

## Step 2: ensure an API key exists

Check for a locally configured CodexThemes API key:

```bash
npx tsx scripts/apikey.ts status
```

The key resolves from the `CODEXTHEMES_API_KEY` environment variable first, then from `~/.codexthemes/credentials.json`.

If no key is configured, do not guess or fabricate one. Direct the user to create an API key at:

```text
https://codexthemes.ai/settings/apikeys
```

Then store the key they provide:

```bash
printf '%s' "<api-key>" | npx tsx scripts/apikey.ts set
```

Prefer the stdin form so the key stays out of shell history; `apikey.ts set <key>` also works. Never print a full key back to the user (scripts only ever show a masked form), never write it into a project file, and never commit it. Remove a stored key with `npx tsx scripts/apikey.ts clear`.

## Step 3: preflight with a dry run

Validate the package and configuration without any network call:

```bash
npx tsx scripts/submit-theme.ts /absolute/path/<theme-id>.codex-theme --dry-run
```

The dry run confirms the package parses as a valid `codex-theme` document (format, schema version, manifest slug and version, non-empty CSS, ≤30 MB), reports the resolved endpoint, and states whether a key is configured. Fix every reported problem before submitting; if the package itself is invalid, send the user back to codex-theme-creator to re-export rather than editing the package by hand.

## Step 4: submit

Submitting publishes the package to codexthemes.ai for review. Confirm with the user before uploading, then run:

```bash
npx tsx scripts/submit-theme.ts /absolute/path/<theme-id>.codex-theme
```

The script sends the package as UTF-8 JSON to `POST https://codexthemes.ai/api/themes/submit` with `Authorization: Bearer <key>`. Override the base URL with `CODEXTHEMES_API_BASE` only when the user explicitly targets another environment (for example staging).

## Step 5: report the result

On success, relay the server response to the user: submission id, review status, and public URL when present, plus the theme id and version that were submitted.

On failure, report the HTTP status and server message plainly, then act on it:

- `401`/`403`: the key is invalid or revoked. Guide the user through Step 2 again with a fresh key from `https://codexthemes.ai/settings/apikeys`.
- `409`: this theme version was already submitted. Bump the manifest version in the theme source, re-export with codex-theme-creator, and resubmit.
- Other errors: see `references/submit-api.md`.

Never retry a failed submission in a loop, and never claim a theme was submitted unless the script reported `"status": "submitted"`.
