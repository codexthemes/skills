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

Summarize the matching themes for the user: id, name, author, short description, and the public URL when present. Recommend the closest matches to what the user described instead of dumping the raw list. Keep the theme `id` visible — codex-theme-installer needs it to install a theme.

If the result is empty, say so and suggest broader terms, or offer to create a custom theme with codex-theme-creator.

## Step 3: handle quota and rate limits

On HTTP `429` or `402` the free quota is exhausted; the script's error message includes any `Retry-After` value. Do not retry in a loop. Tell the user the free search quota is used up and guide them to configure a personal API key:

1. Create a key at `https://codexthemes.ai/settings/apikeys`.
2. Store it: `printf '%s' "<api-key>" | npx tsx scripts/apikey.ts set` (stdin keeps the key out of shell history; `apikey.ts set <key>` also works).
3. Re-run the search.

Check the current key state at any time with `npx tsx scripts/apikey.ts status`; remove a stored key with `npx tsx scripts/apikey.ts clear`. Never print a full key (scripts only show a masked form), never write it into a project file, and never commit it.

On `401`/`403` the configured key is invalid or revoked — guide the user to create a fresh key the same way.
