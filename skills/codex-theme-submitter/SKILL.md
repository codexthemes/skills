---
name: codex-theme-submitter
description: Submit a packaged .codex-theme file or a linked theme showcase (skin) to CodexThemes through the authenticated codexthemes.ai submit API. Use when a user asks to submit, publish, upload, or share a Codex theme on codexthemes.ai, shares a URL of a theme to list in the directory, asks to configure or check a CodexThemes API key, or has an exported .codex-theme package ready for submission.
---

# Submit a Codex theme to CodexThemes

Submit an existing, already-exported `.codex-theme` package — or a linked theme showcase (skin) extracted from a URL — to codexthemes.ai. This skill is standalone: its TypeScript scripts own API key storage and submission. It does not create, edit, validate, or export theme sources — that is codex-theme-creator's job. The only required local tools are Node.js 20+ and `npx`.

Read `references/submit-api.md` before diagnosing an unexpected API response or changing endpoint behavior. Run all commands from the installed skill directory.

Pick the path by what the user shared, not by what exists on disk:

- an exported `.codex-theme` package or a local theme id → **package submission**, Steps 1–5.
- a URL of a theme showcase (repo, gallery, post) → **link submission**, see "Submit a linked theme from a URL". A link submission needs no package, no export, and no local theme source — never search `~/.codexthemes/exports/` for a match, never ask the user to export a package first, and never block on a "missing" package. Use the package path for a URL share only if the user explicitly says they want the installable package published.
- nothing specific ("submit my theme") → **discover locally, then ask**:
  1. List `~/.codexthemes/exports/*.codex-theme`. Exactly one package → name it (id, version, modified time) and confirm it is the one to submit. Several → show the list and ask which one.
  2. No exports but `~/.codexthemes/themes/` holds theme sources → tell the user which sources exist and offer two options: export one with codex-theme-creator and submit the package, or share a URL of the theme's page for a link submission.
  3. Nothing local at all → ask for the URL of the theme to list (link submission), or point them to codex-theme-creator to build one first.
  Ask once with the concrete findings; never guess which theme the user meant, and never silently pick one of several.

## Step 1: locate the package

Submit only a portable `.codex-theme` package. The managed export location is `~/.codexthemes/exports/<theme-id>.codex-theme`.

- If the user names a package path, use it.
- If the user names a theme id or source directory, look for the matching file in `~/.codexthemes/exports/`.
- If no package exists, stop and tell the user to export one first with codex-theme-creator (`export-theme.ts`). Never hand-assemble the package JSON or submit raw theme source files.
- The package must embed a `preview` — a workspace capture with the sidebar visible; it becomes the gallery and detail image on codexthemes.ai. `submit-theme.ts` **refuses to submit** a package that lacks one (the gallery would show the raw background artwork). Fix it by re-exporting with codex-theme-creator after adding a capture to the theme's `previews/` directory, or by passing `--preview /absolute/screenshot.png` with a full-app screenshot at submit time. Never pass the theme's background artwork as `--preview`; `--allow-art-preview` exists only for when the user explicitly accepts the artwork as the gallery image.

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

The dry run confirms the package parses as a valid `codex-theme` document (format, schema version, manifest slug and version, non-empty CSS, ≤30 MB), reports the resolved endpoint and whether a key is configured, and reports the gallery `preview` status — `present` (from the package or a `--preview` override) or a warning that the submission would fall back to raw artwork and be refused. Fix every reported problem before submitting; if the package itself is invalid, send the user back to codex-theme-creator to re-export rather than editing the package by hand.

## Step 4: submit

The API is the **only** agent submission path. Never open `codexthemes.ai/submit` in a browser, drive a browser extension, or fill the web upload form — that form's file picker is for humans and fails under automation (Chrome blocks file access for extensions). If `submit-theme.ts` fails or no API key is configured, report that plainly and guide the user through the fix; do not fall back to the website form.

Submitting publishes the theme on codexthemes.ai immediately — there is no review queue. Resubmitting an already-published theme id is the normal update path (bump `manifest.version`, re-export, submit again). Confirm with the user before uploading, then run:

```bash
npx tsx scripts/submit-theme.ts /absolute/path/<theme-id>.codex-theme \
  [--preview /absolute/workspace-screenshot.png]
```

The script sends the package as UTF-8 JSON to `POST https://codexthemes.ai/api/themes/submit` with `Authorization: Bearer <key>`. `--preview` replaces the package's embedded gallery preview with the given full-app screenshot before uploading. Override the base URL with `CODEXTHEMES_API_BASE` only when the user explicitly targets another environment (for example staging).

## Step 5: report the result

On success, the theme is live immediately and the response contains its detail page URL (`url`, e.g. `https://codexthemes.ai/themes/<theme-id>`). Always give the user that link, plus the published id and version **from the response** — when the requested slug already belongs to another submitter or a builtin item, the server publishes under the slug plus a random suffix instead of overwriting it, so the final id/url may differ from what was sent. Resubmitting your own theme id with the same API key updates the published theme in place — bump the manifest version first so the change is visible.

On failure, report the HTTP status and server message plainly, then act on it:

- `401`/`403`: the key is invalid or revoked. Guide the user through Step 2 again with a fresh key from `https://codexthemes.ai/settings/apikeys`.
- Other errors: see `references/submit-api.md`.

Never retry a failed submission in a loop, and never claim a theme was submitted unless the script reported `"status": "submitted"`.

## Submit a linked theme from a URL

When the user shares a URL of a theme showcase (a repo, gallery page, or post), publish it as a linked directory entry (skin). This path is complete on its own: it requires no `.codex-theme` package, no export, and no local theme source, and it must never stall waiting for one — the extracted name, author, preview image, and the URL itself are the entire submission.

1. **Extract**: fetch the page and pull out the theme name, the author (page author, repo owner, or byline), and the best preview image — a capture of the themed workspace (window with sidebar and content), preferring `og:image` or a README/screenshot image. Never use a bare wallpaper or logo as the preview.
2. **Derive the slug**: a short lowercase ASCII slug from the theme name — it becomes the public URL `https://codexthemes.ai/skins/<slug>`. Romanize or translate non-Latin names (功夫女足 → `kungfu-womens-football`); never let it fall back to a timestamp id, and never use unrelated words.
3. **Download the preview** to a temporary file (PNG, JPEG, or WebP, under 10 MB). Do not save it into a project workspace.
4. **Confirm with the user** before uploading: show the extracted name, slug, author, source URL, and which image will be the preview. Let them correct any field.
5. **Submit** (API key required, same as Step 2; the same no-web-form rule applies):

```bash
npx tsx scripts/submit-skin.ts \
  --name "<theme name>" \
  --slug <ascii-slug> \
  --source-url "<the user's URL>" \
  --preview /absolute/preview.png \
  [--author "<author>"] [--description "<one-line description>"] [--mode light|dark|mixed] [--dry-run]
```

6. **Report**: on success the response contains the public listing URL (`https://codexthemes.ai/skins/<slug>`) — always give the user that link, taken from the response: if the slug already belongs to another submitter, the server publishes under a random-suffixed slug instead of overwriting. Resubmitting your own slug with the same API key updates the published entry in place.

If the page has no usable workspace preview image, stop and ask the user to provide one instead of substituting artwork or generating a mockup.
