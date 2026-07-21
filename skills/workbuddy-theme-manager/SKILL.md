---
name: workbuddy-theme-manager
description: Convert portable .codex-theme packages or installed ~/.codexthemes/themes/<id> sources into self-contained .workbuddy-theme packages, inspect and list converted themes, and apply, verify, switch, or restore themes in the Tencent WorkBuddy desktop app through its loopback CDP endpoint. Use when a user wants to reuse a CodexThemes theme in WorkBuddy, continue after codex-theme-installer downloads a published theme, manage WorkBuddy theme exports, or diagnose whether a WorkBuddy theme is active.
---

# Manage WorkBuddy themes

Use the bundled Node.js runtime only. Do not install or invoke CodeDrobe, another theme CLI, an MCP server, or an application patcher. Never modify `WorkBuddy.app`, `app.asar`, or the WorkBuddy user profile.

Run commands from this skill directory.

## Convert a Codex theme

```bash
node scripts/workbuddy-theme.mjs convert /absolute/theme.codex-theme
```

After `codex-theme-installer` downloads a published theme into the local library, convert it directly by id without exporting an intermediate package:

```bash
node scripts/workbuddy-theme.mjs convert-installed <theme-id>
```

Also accept an absolute installed source directory in place of the id. Prefer `convert-installed` for the download-to-WorkBuddy chain.

The default output is `~/.codexthemes/workbuddy-exports/<theme-id>.workbuddy-theme`. Conversion carries over metadata, semantic palette, and embedded artwork, then generates WorkBuddy-specific CSS. It deliberately excludes Codex DOM selectors; report the conversion quality as “palette and artwork adapted,” not pixel-identical.

When the user asks to install a published CodexThemes theme in WorkBuddy, run the official `codex-theme-installer` first, then `convert-installed`, then `apply`. Do not activate it in Codex unless the user separately requested that target.

Use `--output /absolute/file.workbuddy-theme` to choose a destination. Existing output requires `--force`.

Inspect or list packages:

```bash
node scripts/workbuddy-theme.mjs inspect /absolute/theme.workbuddy-theme
node scripts/workbuddy-theme.mjs list
```

Read [references/package-format.md](references/package-format.md) only when editing the format, converter, or compatibility policy.

## Apply a WorkBuddy theme

Apply by absolute package path or by theme id from the default export directory:

```bash
node scripts/workbuddy-theme.mjs apply <theme-id-or-path>
```

When the loopback renderer is already available, this hot-swaps without restarting. If the command reports that port 9336 is unavailable, ask for explicit permission to restart WorkBuddy, then run:

```bash
node scripts/workbuddy-theme.mjs apply <theme-id-or-path> --launch
```

`--launch` schedules a detached helper because restarting WorkBuddy may terminate the invoking agent. Never add it before restart permission. Pass `--app-path` only for a nonstandard installation and `--port` only for an explicit port override.

## Verify and restore

After a scheduled launch, verify instead of treating scheduling as success:

```bash
node scripts/workbuddy-theme.mjs status
```

Only report success when every discovered WorkBuddy page has the expected theme id. Restore through the owned runtime:

```bash
node scripts/workbuddy-theme.mjs restore
```

The runtime owns one style element, one new-document registration per renderer, and root markers. A full WorkBuddy quit also drops the active CSS.

## Safety

- Bind CDP to `127.0.0.1` only.
- Treat theme packages as untrusted input; reject external CSS resources, scripts, traversal paths, oversized images, and invalid base64.
- Keep decorative layers noninteractive and preserve native navigation, menus, composer behavior, focus, and scrolling.
- Do not claim exact visual fidelity from automatic conversion. Hand-author a later CSS revision when route-specific polish is required.
- Do not restart WorkBuddy without explicit user authorization.
