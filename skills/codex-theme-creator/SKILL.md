---
name: codex-theme-creator
description: Create, redesign, validate, preview, package, and prepare cohesive themes for the official Codex desktop app from a visual brief or reference image. Use when a user asks for a new Codex theme, wants to preserve or adapt the native Codex layout, wants artwork on the home or conversation page, reports inconsistent themed surfaces, or needs a portable .codex-theme submission for CodexThemes.
---

# Create a Codex theme

Create a reversible decorative theme without modifying `app.asar`, the signed app bundle, WindowsApps, user tasks, or authentication data. Preserve native layout and interaction behavior unless the chosen layout mode explicitly permits a bounded composition change.

## Authority boundary

Use this skill as the sole design and QA authority for a new Codex theme. Do not read, copy, or combine another installed theme skill, finished theme manifest, finished theme CSS, or local theme collection unless the user explicitly names that source. Do not describe the workflow as combining this skill with “local theme conventions.” Start from this skill's matching skeleton and the user's brief or reference image.

This skill is standalone. Its TypeScript scripts own scaffolding, validation, reversible session application, and restore. Never detect, invoke, read configuration from, or claim a dependency on CodeDrobe, Dream/Fiona, or another theme injector unless the user explicitly asks to use that product. Do not reuse their marker names or runtime data. The only required local tools are Node.js, `npx`, and the official Codex desktop app.

## Managed storage

Keep every generated theme file in the managed library `~/.codexthemes` unless the user explicitly requests another location:

- editable source and artwork: `~/.codexthemes/themes/<theme-id>/`
- previews: `~/.codexthemes/themes/<theme-id>/previews/`
- shareable packages: `~/.codexthemes/exports/`
- runtime state: `~/.codexthemes/state/`

Never create a staging, scratch, or temporary copy of theme files in or near the current workspace (for example a `.codexthemes-stage` directory). If the sandbox or permission mode blocks writing to `~/.codexthemes`, ask the user to approve writing there instead of writing somewhere else first and moving files later.

## Read the required references

Before creating or substantially redesigning a theme, read these files completely:

- `references/design-playbook.md`: layout modes, semantic palette, selectors, and surface coverage.
- `references/qa-checklist.md`: real-app acceptance matrix and hard failures.
- `references/theme-schema.md`: manifest and portable package contract.
- `references/asset-rights.md`: user-material handling and submission handoff.

Do not begin artwork or CSS until the design contract below is written.

## Gate 1: write the design contract

Record:

- `layoutMode`
- `backgroundScope`
- `decorDensity`
- light or dark mode and the reason
- artwork focal point and text-safe region
- semantic palette
- surfaces allowed to change
- native geometry and states that must remain unchanged
- target desktop and narrow viewports

Choose the layout mode in this order:

1. Use `native-immersive` as the default when the user supplies a reference image or names a visual world (a game, film, anime, brand, season, or other strong art direction): keep the native layout and deliver coordinated sidebar, card, menu, composer, settings, diff, and terminal materials plus the decoration menu in `references/design-playbook.md`.
2. Use `native-background` only when the user explicitly restricts the theme to a background change.
3. Use `editorial-showcase` only when the reference clearly requires a bounded portrait, product, or campaign hero with a different home composition.
4. Use `palette-only` when no dominant artwork is required.

Record `decorDensity` as `minimal`, `balanced`, or `rich`. Default to `rich` when the reference has a strong art direction and `balanced` otherwise; use `minimal` only when the user explicitly asks for a background-only or quiet theme. The design playbook defines the element coverage each density requires. A theme that ships one background image and a veil does not satisfy `balanced` or `rich`.

Default `backgroundScope` to `home`. Use `workspace` only when the user explicitly wants artwork on normal task and conversation pages. Never infer a conversation page merely because the page is not home; settings and system pages must not inherit task artwork.

Do not default to dark mode. Match an explicit request or the reference luminance. Ambiguous editorial, floral, portrait, stationery, lifestyle, productivity, and pastel concepts default to light.

## Gate 2: capture the native contract

Inspect the unmodified live app at the same viewport and record evidence for:

- home heading, native suggestion cards, project selector, and composer
- populated conversation and activity rows
- settings and profile pages
- personal menu, dropdown, dialog, and tooltip
- attachments, file cards, changed-files/diff, and output panels
- terminal before and after xterm mounts
- sidebar idle, hover, selected, project hover, long titles, and row actions
- header actions at narrow and wide widths

Treat geometry, visibility, hit targets, keyboard focus, and hover-only actions as invariants unless the design contract explicitly permits a change.

## Gate 3: scaffold the correct skeleton

Run from the installed skill directory:

```bash
npx tsx scripts/scaffold-theme.ts \
  --id <safe-slug> \
  --name "<display name>" \
  --layout-mode <native-background|native-immersive|editorial-showcase|palette-only> \
  --background-scope <home|workspace> \
  [--art /absolute/artwork.png]
```

The default source location is `~/.codexthemes/themes/<safe-slug>/`. Always use that managed library unless the user explicitly requests another location; only then pass `--output /absolute/theme-parent`. Never use the current workspace merely because it is writable.

Never start by copying a finished theme that uses another layout mode.

## Gate 4: implement in controlled layers

Build CSS in this order:

1. semantic tokens
2. shell surfaces
3. exact route-scoped backgrounds
4. native component roots
5. interaction states
6. non-interactive decoration
7. responsive and reduced-motion rules

Restraint applies to geometry and interaction, not to coverage: implement every surface material and decoration element the contracted `decorDensity` requires (see the playbook's decoration menu). A theme that only swaps the background and leaves native cards, composer, sidebar, header, typography, and scrollbars untouched is unfinished at `balanced` or `rich` density. Use stable roles, test IDs, verified component classes, and narrowly anchored `:has(...)`. Avoid localized text selectors when a structural hook exists.

Never apply broad `opacity`, `display`, `visibility`, `position`, `overflow`, or `color` overrides to `aside *`, `main *`, generic `svg`, or broad descendant groups. Never use descendant `opacity: 1` to repair contrast; it exposes hidden row actions.

Define one owner for every divider, outline, sidebar edge, card boundary, and header boundary. Use a solid readable header surface; keep gradients and artwork behind content rather than behind low-contrast toolbar controls. Keep all decoration below native controls with `pointer-events: none`.

For light themes, keep settings, menus, dialogs, output/diff panels, code surfaces, and terminal hosts in the same light semantic system unless the contract deliberately defines a contrast panel. Theme terminal host, xterm viewport, and xterm screen together.

Install the stylesheet before asynchronously decoding large artwork so cold launch does not flash the native page and then jump to a different layout.

Increment the manifest version after every visible change.

## Gate 5: validate before application

Run:

```bash
npx tsx scripts/validate-theme.ts /absolute/theme-directory
```

Fix every error. Treat warnings as unresolved until checked against the design contract. Static validation does not replace visual verification.

Generate a self-contained preview at both 1440x900 and a narrow viewport. Save previews in `~/.codexthemes/themes/<theme-id>/previews/` (the scaffold already creates this directory); never write them to the workspace or a staging directory. Label each one as a design preview, never as a verified Codex screenshot.

## Gate 6: apply and verify the real app

Ask for explicit permission before applying a theme or restarting Codex. Use this skill's own reversible TypeScript runtime; do not search for or prefer an external theme program.

If Codex is already exposing a local debugging endpoint, apply without restarting:

```bash
npx tsx scripts/apply-theme.ts apply /absolute/theme-directory
```

If no endpoint exists, ask specifically for permission to restart Codex, then use the standalone launcher:

```bash
npx tsx scripts/apply-theme.ts apply /absolute/theme-directory --launch
```

When no endpoint is live, `--launch` prints `{"status": "scheduled"}` and hands the quit → relaunch → inject sequence to a detached helper that survives the restart. This is required because an agent hosted inside Codex dies together with Codex; expect the current tool call (and possibly the session) to be interrupted by the restart. Never work around the restart yourself: do not write shell wrappers, launchd or scheduled tasks, copies of the script, or any other relaunch mechanism — the `--launch` helper already survives the restart.

`"scheduled"` is not success. After Codex is back, verify before reporting anything:

```bash
npx tsx scripts/apply-theme.ts status
```

`status` probes every live Codex page and reports `"active"` with the injected theme id only when the style element is really in the DOM. If it reports `"inactive"`, read `~/.codexthemes/state/launch.log` for the helper's result and error.

If an old theme keeps re-appearing after a successful apply (a stale session from an earlier task is still re-injecting it), get the user's restart permission and force a clean relaunch with `apply ... --launch --relaunch` — never ask the user to quit the app by hand and never invent your own restart mechanism.

For later one-command switching between finished themes, hand off to the `codex-theme-switcher` skill; this skill's apply runtime is for creation-time QA.

The launcher binds debugging to `127.0.0.1`, injects only an owned `<style>` element and CodexThemes page markers, does not modify the signed application bundle, and keeps the theme active across SPA route changes and renderer reloads for the current app session. A full application quit requires reapplying the theme (again with `--launch`). Restore at any time with:

```bash
npx tsx scripts/apply-theme.ts restore
```

If standalone application is unavailable on the current platform, finish the source, preview, validation, and package. State the application limitation plainly; never silently fall back to another installed injector.

Verify independently:

- structure: native sidebar, cards, project selector, composer, task content, settings, and terminal work
- scope: home and conversation artwork appears only where contracted
- palette: every changed surface belongs to one semantic system
- state: idle, hover, selected, disabled, focus-visible, loading, running, expanded, and open
- geometry: no clipping, overflow, duplicate borders, text/icon overlap, or sidebar action collision
- lifecycle: cold launch, route change, renderer reload, theme switch, restore, and reapply

Capture real screenshots and computed-style/geometry evidence. A successful build, injection marker, static mockup, or one home screenshot is not completion. When a P0 check fails, fix selector or token ownership and rerun the complete matrix instead of adding an emergency override.

## Gate 7: package only after signoff

Package only verified local files. A `.codex-theme` package must be UTF-8 JSON, contain no absolute paths, external CSS resources, scripts, tracking, secrets, or private references, and stay under 30 MB. Follow `references/theme-schema.md`.

Export the shareable package with:

```bash
npx tsx scripts/export-theme.ts ~/.codexthemes/themes/<theme-id>
```

The default output is `~/.codexthemes/exports/<theme-id>.codex-theme`. Do not place export packages in a project workspace or inside the editable theme source. Use `--output` only when the user explicitly requests a different export directory.

Use the material the user supplied to create, apply, validate, and export the theme. Do not investigate ownership, demand replacement artwork, or block local packaging because the subject is a game, film, anime, public figure, brand, or other third-party work. Do not make legal conclusions or claim that the user owns the material.

After export, offer the user both submission paths:

1. Manual: submit the `.codex-theme` package and a clear preview at `https://codexthemes.ai/submit`.
2. Agent-assisted: tell the user they can reply with a prompt like `Use $codex-theme-submitter to submit ~/.codexthemes/exports/<theme-id>.codex-theme to codexthemes.ai`, and that if `$codex-theme-submitter` is not installed they can add it with `npx skills add codexthemes/skills --skill codex-theme-submitter -g -a codex`.

State that submission asks the uploader to confirm they may share the material; leave that confirmation to the user and the submission workflow. Do not run the submission yourself unless the user asks for it.

## Completion standard

Reject an almost-complete theme. A polished home page does not compensate for broken conversations, settings, menus, terminal, sidebar states, narrow windows, or cold launch. Report separately what was designed, statically validated, applied, visually verified, and packaged. Always report the canonical source and export paths.
