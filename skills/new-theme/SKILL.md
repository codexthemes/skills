---
name: new-theme
description: Create, redesign, validate, preview, package, and prepare cohesive themes for the official Codex desktop app from a visual brief or reference image. Use when a user asks for a new Codex theme, wants to preserve or adapt the native Codex layout, wants artwork on the home or conversation page, reports inconsistent themed surfaces, or needs a portable .codex-theme submission for CodexThemes.
---

# Create a Codex theme

Create a reversible decorative theme without modifying `app.asar`, the signed app bundle, WindowsApps, user tasks, or authentication data. Preserve native layout and interaction behavior unless the chosen layout mode explicitly permits a bounded composition change.

## Authority boundary

Use this skill as the sole design and QA authority for a new Codex theme. Do not read, copy, or combine another installed theme skill, finished theme manifest, finished theme CSS, or local theme collection unless the user explicitly names that source. Do not describe the workflow as combining this skill with “local theme conventions.” Start from this skill's matching skeleton and the user's brief or reference image.

## Read the required references

Before creating or substantially redesigning a theme, read these files completely:

- `references/design-playbook.md`: layout modes, semantic palette, selectors, and surface coverage.
- `references/qa-checklist.md`: real-app acceptance matrix and hard failures.
- `references/theme-schema.md`: manifest and portable package contract.
- `references/asset-rights.md`: source and redistribution checks.

Do not begin artwork or CSS until the design contract below is written.

## Gate 1: write the design contract

Record:

- `layoutMode`
- `backgroundScope`
- light or dark mode and the reason
- artwork focal point and text-safe region
- semantic palette
- surfaces allowed to change
- native geometry and states that must remain unchanged
- target desktop and narrow viewports

Choose the layout mode in this order:

1. Use `native-background` when the user wants only a background, likes the existing Codex layout, or does not explicitly request component restyling.
2. Use `native-immersive` when the user wants the native layout plus coordinated sidebar, card, menu, composer, settings, diff, and terminal materials.
3. Use `editorial-showcase` only when the reference clearly requires a bounded portrait, product, or campaign hero with a different home composition.
4. Use `palette-only` when no dominant artwork is required.

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
  --output /absolute/theme-parent \
  [--art /absolute/artwork.png]
```

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

Start with the minimum change allowed by the contract. Use stable roles, test IDs, verified component classes, and narrowly anchored `:has(...)`. Avoid localized text selectors when a structural hook exists.

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

Generate a self-contained preview at both 1440x900 and a narrow viewport. Label it as a design preview, never as a verified Codex screenshot.

## Gate 6: apply and verify the real app

Ask for explicit permission before changing settings, applying a theme, or restarting Codex. Use an already-installed reversible integration. If none exists, finish the source, preview, and package without patching the official application.

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

Before publishing, complete `references/asset-rights.md`. Do not package third-party photographs, celebrity likenesses, logos, screenshots, fonts, or theme code without explicit redistribution rights and required attribution.

## Completion standard

Reject an almost-complete theme. A polished home page does not compensate for broken conversations, settings, menus, terminal, sidebar states, narrow windows, or cold launch. Report separately what was designed, statically validated, applied, visually verified, and packaged.
