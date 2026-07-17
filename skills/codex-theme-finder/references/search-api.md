# CodexThemes search API contract

The scripts in this skill implement the contract below. If the live API differs, adjust the base URL with `CODEXTHEMES_API_BASE` or update `scripts/find-themes.ts` to match the server.

## Endpoint

```
GET {base}/api/themes?q=<terms>&page=<n>&limit=<1-50>&sort=<popular|newest|name>
Accept: application/json
```

`{base}` defaults to `https://codexthemes.ai` and can be overridden with `CODEXTHEMES_API_BASE`. All query parameters are optional; omitting `q` lists themes.

## Authentication and quota

Search works anonymously inside a free quota. When a personal API key is configured, requests send it for higher limits:

```
Authorization: Bearer <api-key>
```

Key resolution order:

1. `CODEXTHEMES_API_KEY` environment variable
2. `~/.codexthemes/credentials.json` (`{ "apiKey": "..." }`, file mode `0600`), written by `scripts/apikey.ts set`

`CODEX_THEMES_HOME` relocates the `~/.codexthemes` directory, matching the other CodexThemes skills.

## Responses

- `2xx`: JSON result, shape `{ "themes": [ { "id", "name", "description", "author", "mode", "tags", "image", "url", "installable", "downloadUrl", "verified" } ], "total", "page", "limit", "sort", "query" }`. `installable: true` means codex-theme-installer can install the theme by `id`. The client passes the body through unmodified under `result`.
- `429` (and `402`): the free quota is exhausted or the client is rate limited. A `Retry-After` header, when present, is surfaced. The remedy is a personal API key from `https://codexthemes.ai/settings/apikeys`.
- `401` / `403`: a configured API key is invalid, revoked, or lacks permission; create a fresh key.

Other non-2xx statuses are reported with the first 500 characters of the response body.
