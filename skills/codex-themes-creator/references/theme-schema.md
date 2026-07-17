# Theme schema

Use UTF-8 JSON in `theme.json`.

## Managed storage contract

- Editable source: `~/.codex-themes/themes/<theme-id>/`
- Shareable package: `~/.codex-themes/exports/<theme-id>.codex-theme`
- Runtime state: `~/.codex-themes/state/`

These are mandatory defaults, not examples. A user may explicitly request a custom source or export directory. Never default to the current repository, workspace, Downloads folder, or the installed Skill directory. `CODEX_THEMES_HOME` may override the root for automation and tests; do not set it during normal creation unless the user asks for a custom managed root.

## Required fields

```json
{
  "schemaVersion": 1,
  "id": "safe-theme-id",
  "displayName": "Theme name",
  "description": "Public description",
  "version": "0.1.0",
  "mode": "light",
  "css": "theme.css",
  "art": "assets/artwork.png",
  "design": {
    "layoutMode": "native-background",
    "backgroundScope": "home",
    "modeReason": "Reference uses warm light paper surfaces.",
    "artFocalPoint": "70% 35%",
    "textSafeRegion": "left 52%",
    "contrastStrategy": "Warm veil behind native text only.",
    "allowedChanges": ["home background"],
    "preserve": ["native geometry", "native controls", "native states"],
    "verificationViewports": ["1440x900", "980x760"]
  },
  "palette": {
    "canvas": "#fffaf6",
    "surface": "#fffdfb",
    "raised": "#ffffff",
    "text": "#3f3033",
    "muted": "#806d72",
    "accent": "#bd4968",
    "border": "#ead3d9",
    "focus": "#bd4968",
    "success": "#27785a",
    "warning": "#9a671f",
    "danger": "#b33d4c",
    "terminalBackground": "#fffaf6",
    "terminalForeground": "#3f3033"
  },
  "platforms": ["macos", "windows"],
  "author": { "name": "Theme author" },
  "homepage": "https://codexthemes.ai",
  "skillUrl": "https://codexthemes.ai/SKILL.md"
}
```

Omit `art` for `palette-only`. Paths must be relative and remain inside the theme directory. Increment `version` after every visible change.

## Design fields

- `layoutMode`: `native-background`, `native-immersive`, `editorial-showcase`, or `palette-only`.
- `backgroundScope`: `home` or `workspace`.
- `modeReason`: why the reference and concept require light or dark.
- `allowedChanges`: exact surfaces or properties the theme may alter.
- `preserve`: native geometry, components, routes, and states that remain invariant.
- `verificationViewports`: at least one desktop and one narrow viewport.

`workspace` means home plus verified conversation shells. It never means settings or every `main` element.

## Portable package

A `.codex-theme` file is UTF-8 JSON, not a ZIP:

```json
{
  "format": "codex-theme",
  "schemaVersion": 1,
  "exportedAt": "ISO-8601 timestamp",
  "manifest": {},
  "css": "complete CSS source",
  "readme": "theme README",
  "art": {
    "filename": "artwork.png",
    "mimeType": "image/png",
    "base64": "..."
  },
  "verification": {}
}
```

Normalize CSS to `theme.css` and artwork to a safe basename. Remove absolute paths and private evidence. Reject packages over 30 MB, path traversal, executable content, external CSS resources, scripts, and unsupported asset MIME types.
