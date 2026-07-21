# `.workbuddy-theme` package format

The package is UTF-8 JSON so it remains inspectable and portable without an archive library.

```json
{
  "format": "workbuddy-theme",
  "schemaVersion": 1,
  "exportedAt": "2026-07-20T00:00:00.000Z",
  "manifest": {
    "id": "example",
    "displayName": "Example",
    "version": "1.0.0",
    "mode": "dark",
    "source": {
      "format": "codex-theme",
      "themeId": "example",
      "version": "1.0.0"
    },
    "conversion": {
      "quality": "palette-and-artwork",
      "note": "Codex-specific DOM selectors were replaced with WorkBuddy-specific CSS."
    }
  },
  "css": "html[data-workbuddy-theme=\"example\"] { ... }",
  "images": {
    "artwork": {
      "filename": "artwork.webp",
      "mimeType": "image/webp",
      "base64": "..."
    }
  }
}
```

## Compatibility rules

- Keep `schemaVersion` at `1` until a breaking reader change is required.
- Preserve unknown legacy manifest metadata only under `manifest.sourceManifest`; never treat it as executable configuration.
- Generate CSS from semantic palette values rather than copying Codex selectors.
- Limit the complete JSON package to 30 MB and decoded images to the same aggregate limit.
- Accept PNG, JPEG, and WebP images only.
- Reject remote `url(...)`, `@import`, JavaScript URLs, and HTML/script payloads.

## Runtime ownership

The manager injects `style#workbuddy-themes-runtime-style`, adds `data-workbuddy-theme` and the `workbuddy-themes-host` class to the document root, and records CDP registrations in `~/.codexthemes/state/workbuddy-runtime.json`. Restore removes only these owned values.
