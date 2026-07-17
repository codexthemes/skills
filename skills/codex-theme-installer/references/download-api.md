# CodexThemes download API contract

The scripts in this skill implement the contract below. If the live API differs, adjust the base URL with `CODEXTHEMES_API_BASE` or update `scripts/install-theme.ts` to match the server.

## Endpoint

```
GET {base}/api/themes/{theme-id}/download
Accept: application/json
```

`{base}` defaults to `https://codexthemes.ai` and can be overridden with `CODEXTHEMES_API_BASE`. `{theme-id}` is the lowercase slug shown in search results and theme URLs (`https://codexthemes.ai/themes/<theme-id>`).

## Authentication and quota

Downloads work anonymously inside a free quota. When a personal API key is configured, requests send it for higher limits:

```
Authorization: Bearer <api-key>
```

Key resolution order:

1. `CODEXTHEMES_API_KEY` environment variable
2. `~/.codexthemes/credentials.json` (`{ "apiKey": "..." }`, file mode `0600`), written by `scripts/apikey.ts set`

`CODEX_THEMES_HOME` relocates the `~/.codexthemes` directory, matching the other CodexThemes skills.

## Response

The server responds with a `302` redirect to the stored package file (the client's fetch follows it automatically); the final body is the portable `.codex-theme` package — UTF-8 JSON, at most 30 MB, the same document codex-theme-creator exports:

```json
{
  "format": "codex-theme",
  "schemaVersion": 1,
  "manifest": { "id": "<theme-id>", "displayName": "...", "version": "1.0.0", "css": "theme.css", "art": "art.png" },
  "css": "...",
  "readme": "...",
  "art": { "filename": "art.png", "mimeType": "image/png", "base64": "..." }
}
```

The client verifies `format`, `schemaVersion`, that `manifest.id` matches the requested theme id, and that every filename in the package is a plain relative name (no separators or `..`) before writing anything to disk.

## Installed layout

The package is unpacked into `~/.codexthemes/themes/<theme-id>/`:

- `theme.json` — the manifest
- `<manifest.css>` — the stylesheet (usually `theme.css`)
- `<art.filename>` — the decoded artwork, when present
- `README.md` — when the package carries a readme

An existing non-empty theme directory is never overwritten without `--force`.

## Errors

- `429` (and `402`): the free quota is exhausted or the client is rate limited. A `Retry-After` header, when present, is surfaced. The remedy is a personal API key from `https://codexthemes.ai/settings/apikeys`.
- `401` / `403`: a configured API key is invalid, revoked, or lacks permission; create a fresh key.
- `404`: no published theme has that id.

Other non-2xx statuses are reported with the first 500 characters of the response body.
