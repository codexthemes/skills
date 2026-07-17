# Codex theme QA checklist

## Evidence levels

Keep these claims separate:

1. **Designed**: source and preview exist in `~/.codexthemes/themes/<theme-id>/` (previews under its `previews/` directory), not in a workspace or staging copy.
2. **Statically valid**: `validate-theme.ts` passes through `tsx`.
3. **Applied**: the expected theme ID and version are active.
4. **Visually verified**: real Codex screenshots and geometry checks pass.
5. **Packaged**: a safe portable package matches the verified version.

Never promote one level into another without evidence.

## P0 hard failures

Reject and revise when any item occurs:

- native layout changes outside the selected layout mode
- artwork leaks from home or conversation scope into settings/system pages
- light theme contains accidental dark settings, menu, diff, output, or terminal surfaces
- theme readability depends on the user's native appearance: the native `--color-token-*` sweep is missing or partial, so the theme renders correctly only when the machine's native light/dark mode matches the theme's mode
- text, placeholder, icon, focus ring, code, diff, or menu contrast is unreadable
- `scripts/qa-contrast.ts` reports any failure (text below 2.5:1 on a verified opaque backdrop) — run it immediately after every apply
- broad opacity rules expose hidden sidebar actions
- row title overlaps pin, archive, project, or overflow actions
- header gradient makes later controls or side-task text unreadable
- duplicate borders create double vertical or horizontal lines
- suggestion cards, project selector, composer, or task content is clipped
- terminal tab strip and xterm body use unrelated theme systems
- decoration intercepts pointer or keyboard input
- cold launch visibly flashes into a different geometry
- theme works only on home while the contract requires immersive/workspace coverage
- contracted `decorDensity` coverage is missing: a `balanced` or `rich` theme ships as a background swap without the design playbook's required elements (materials, token sweep, cards, composer, and for `rich` the hero, tagline, lockup, emblem, and ambient layer)
- remote CSS, scripts, tracking, secrets, or private data are packaged

A background-only result is not a failure when the contract selected `native-background` with `minimal` density. It is a failure when component restyling or a higher density was promised but not completed.

## Required state matrix

Verify at least:

- sidebar: idle, task hover, selected task, project hover, long title, collapsed group
- header: default, narrow, side-task panel open
- composer: empty, focused, running, disabled, approval mode, microphone/send controls
- menus: personal menu, general dropdown, tooltip, disabled item
- conversation: prose, tool call, attachment, file card, changed-files card, output panel
- settings: navigation, section card, toggle, select, dialog
- system pages: plugins/apps directory, sites, scheduled — headings, search input, cards readable with no native-mode surfaces left behind
- terminal: before mount, after xterm mount, cursor, selection
- mode independence: switch Codex's native appearance to the opposite of the theme's mode (or clear the injected style and compare) and re-verify home, one system page, and one menu — the theme must render identically from a native-light and a native-dark start

## Geometry checks

At desktop and narrow widths, record:

- horizontal overflow: `0px`
- sidebar title/action overlap: `0px`
- header control overlap: `0px`
- clipped interactive controls: `0`
- duplicate boundary owners: `0`

Inspect computed styles rather than trusting the screenshot alone.

## Palette checks

For every changed surface, record background, foreground, border, and focus color. Verify text and icon tokens separately; pale icons often remain unreadable after prose is fixed.

For light themes, explicitly inspect settings canvas, settings sidebar, menus, dialogs, output panels, changed-files cards, code blocks, terminal tab strip, terminal host, and xterm viewport.

## Lifecycle checks

Verify:

1. cold launch
2. home to conversation navigation
3. conversation to settings navigation
4. menu and dialog portals opened after injection
5. terminal mounted after injection
6. renderer reload
7. theme switch
8. restore to native
9. reapply after restore

## Revision protocol

When a P0 check fails:

1. Identify the selector, token, scope, or boundary owner responsible.
2. Fix the owning layer rather than appending a symptom override.
3. Remove obsolete competing rules.
4. Increment the visible theme version.
5. Rerun static validation and the complete affected matrix.
6. Capture fresh real-app evidence.
