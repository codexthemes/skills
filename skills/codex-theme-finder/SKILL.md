---
name: codex-theme-finder
description: Search and browse published Codex themes on codexthemes.ai through the themes API, anonymously within a free quota or with a CodexThemes API key for higher limits. Use when a user asks to find, search, browse, list, or discover Codex themes on CodexThemes, wants theme recommendations from the gallery, or hits a search rate limit and needs API key guidance.
---

# Find Codex themes on CodexThemes

Search the published theme gallery on codexthemes.ai. This skill is standalone: its TypeScript scripts own the search request and API key storage. It does not create, install, or submit themes — codex-theme-creator, codex-theme-installer, and codex-theme-submitter own those jobs. The only required local tools are Node.js 20+ and `npx`.

Read `references/search-api.md` before diagnosing an unexpected API response or changing endpoint behavior. Run all commands from the installed skill directory.

## Step 1: search

Turn the user's request into short search terms (style, subject, mood — for example `dark anime`, `pastel floral light`), then run:

```bash
npx tsx scripts/find-themes.ts <terms...> [--limit <1-50>] [--page <n>] [--sort <popular|newest|name>]
```

Searching works without any API key inside a free anonymous quota, so do not demand a key up front. When a key is already configured (`CODEXTHEMES_API_KEY` environment variable or `~/.codexthemes/credentials.json`), the script sends it automatically for higher limits; the output's `auth` field shows which mode was used.

Run more than one search with different terms when the first result set is thin, but never loop on the same query.

## Step 2: present the results

Present the closest matches — several candidates (up to 5) when the gallery has them, not just the first hit; run one or two broader searches before concluding there is only a single match. For each recommended theme show: id, name, author, short description, the public `url` (its codexthemes.ai detail page — always include it so the user can view the theme in the browser), **and its preview image**. Every result carries an `image` URL: download it to a temporary file and display that local image to the user — do not hotlink the remote URL in chat markdown, it often fails to render. If a result has no image, say "no preview" instead of showing a broken embed. Keep the theme `id` visible — codex-theme-installer needs it.

Results mix three kinds — check `kind` and `installable` (each entry's `guidance` field restates its next step):

- `installable: true` — a `.codex-theme` package; codex-theme-installer can install it one-click.
- `kind: "theme"`, `installable: false` — an archive package (zip). Not agent-installable: point the user to `url` to sign in, download the archive, and install manually.
- `kind: "skin"` — a design reference with no package. Share `url`, and offer to recreate the look with codex-theme-creator.

If the result is empty, say so and suggest broader terms, or offer to create a custom theme with codex-theme-creator.

## Step 3: offer installation — never end at the list

Finding is not the finish line; close the loop with the action that fits each result's kind:

- Several installable candidates → ask which one to install, for example: "Reply with a theme id (e.g. `shaolin-kickoff`) and I will install and apply it."
- Exactly one good installable match → offer it directly: "Reply `install` and I will install and apply `<id>`."
- Archive-only theme (`installable: false`) → give the user its `url` and explain they can sign in there to download the archive for manual install.
- Skin (`kind: "skin"`) → give the user its `url` and offer: "I can recreate this look as an installable theme with codex-theme-creator — want me to?"

When the user picks, hand off to codex-theme-installer (bootstrap it the same way this skill was bootstrapped if missing: `npx skills add codexthemes/skills --skill codex-theme-installer -g -a codex`); the installer then chains into activation via codex-theme-switcher. Never end the conversation with only a result list and no install path.

## Step 4: handle quota and rate limits

On HTTP `429` or `402` the free quota is exhausted; the script's error message includes any `Retry-After` value. Do not retry in a loop. Tell the user the free search quota is used up and guide them to configure a personal API key:

1. Create a key at `https://codexthemes.ai/settings/apikeys`.
2. Store it: `printf '%s' "<api-key>" | npx tsx scripts/apikey.ts set` (stdin keeps the key out of shell history; `apikey.ts set <key>` also works).
3. Re-run the search.

Check the current key state at any time with `npx tsx scripts/apikey.ts status`; remove a stored key with `npx tsx scripts/apikey.ts clear`. Never print a full key (scripts only show a masked form), never write it into a project file, and never commit it.

On `401`/`403` the configured key is invalid or revoked — guide the user to create a fresh key the same way.
