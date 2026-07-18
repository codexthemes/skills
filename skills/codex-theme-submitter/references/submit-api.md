# CodexThemes submit API contract

The scripts in this skill implement the contract below. If the live API differs, adjust the base URL with `CODEXTHEMES_API_BASE` or update `scripts/submit-theme.ts` to match the server.

## Authentication

Every request sends a personal API key created at `https://codexthemes.ai/settings/apikeys`:

```
Authorization: Bearer <api-key>
```

Key resolution order:

1. `CODEXTHEMES_API_KEY` environment variable
2. `~/.codexthemes/credentials.json` (`{ "apiKey": "..." }`, file mode `0600`), written by `scripts/apikey.ts set`

`CODEX_THEMES_HOME` relocates the `~/.codexthemes` directory, matching the codex-theme-creator convention.

## Endpoint

```
POST {base}/api/themes/submit
Content-Type: application/json
```

`{base}` defaults to `https://codexthemes.ai` and can be overridden with `CODEXTHEMES_API_BASE` (useful for staging).

## Request body

The body is the portable `.codex-theme` package exactly as exported by codex-theme-creator — UTF-8 JSON, at most 30 MB:

```json
{
  "format": "codex-theme",
  "schemaVersion": 1,
  "exportedAt": "2026-07-17T00:00:00.000Z",
  "manifest": { "id": "<slug>", "displayName": "<display name>", "version": "1.0.0", "css": "theme.css" },
  "css": "...",
  "readme": "...",
  "art": { "filename": "art.png", "mimeType": "image/png", "base64": "..." },
  "preview": { "filename": "home-1440x900.png", "mimeType": "image/png", "base64": "..." },
  "verification": {}
}
```

`art`, `preview`, and `verification` are optional. `preview` should be a raster capture of the themed workspace (sidebar + home); the server uses it as the gallery and detail image and falls back to `art` only when no preview is embedded — a package without a workspace preview lists with the raw artwork, which looks wrong on the site. The client validates `format`, `schemaVersion`, `manifest.id` (lowercase slug), `manifest.version`, and non-empty `css` before sending anything.

## Link (skin) submission body

`scripts/submit-skin.ts` posts a `codex-skin` JSON body to the same endpoint to publish a linked directory entry with no installable package:

```json
{
  "format": "codex-skin",
  "schemaVersion": 1,
  "name": "<skin name>",
  "author": "<author>",
  "description": "<one-line description>",
  "mode": "dark",
  "sourceUrl": "https://example.com/theme-page",
  "preview": { "filename": "preview.png", "mimeType": "image/png", "base64": "..." }
}
```

`name`, `sourceUrl` (http/https), and `preview` (PNG/JPEG/WebP ≤ 10 MB, a themed workspace capture) are required; `author`, `description`, and `mode` are optional. The `201` response mirrors the theme response with `url` pointing at `https://codexthemes.ai/skins/<slug>`; resubmitting the same name updates the entry in place.

## Responses

- `201`: the theme is published immediately — there is no review queue. The response JSON is passed through to the user: `{ "status": "published", "id", "name", "version", "submissionId", "url", "message" }`. `url` is the theme's public detail page (`https://codexthemes.ai/themes/<id>`); always report it. Resubmitting the same theme id updates the published theme in place — bump `manifest.version` first.
- `429`: submissions are rate limited (one per 30 seconds per account); retry after the `Retry-After` value.
- `401` / `403`: the API key is missing, invalid, revoked, or lacks permission. Direct the user to `https://codexthemes.ai/settings/apikeys` to create a fresh key.
- `413`: the package exceeds the server size limit.
- `422`: the server rejected the package contents; the response body explains why.
- `503`: storage is unavailable on the server; retry later.

Other non-2xx statuses are reported with the first 500 characters of the response body.
