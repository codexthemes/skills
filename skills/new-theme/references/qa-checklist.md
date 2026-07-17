# Codex theme QA checklist

## Evidence levels

Keep these claims separate:

1. **Designed**: source and preview exist.
2. **Statically valid**: `validate-theme.mjs` passes.
3. **Applied**: the expected theme ID and version are active.
4. **Visually verified**: real Codex screenshots and geometry checks pass.
5. **Packaged**: a safe portable package matches the verified version.

Never promote one level into another without evidence.

## P0 hard failures

Reject and revise when any item occurs:

- native layout changes outside the selected layout mode
- artwork leaks from home or conversation scope into settings/system pages
- light theme contains accidental dark settings, menu, diff, output, or terminal surfaces
- text, placeholder, icon, focus ring, code, diff, or menu contrast is unreadable
- broad opacity rules expose hidden sidebar actions
- row title overlaps pin, archive, project, or overflow actions
- header gradient makes later controls or side-task text unreadable
- duplicate borders create double vertical or horizontal lines
- suggestion cards, project selector, composer, or task content is clipped
- terminal tab strip and xterm body use unrelated theme systems
- decoration intercepts pointer or keyboard input
- cold launch visibly flashes into a different geometry
- theme works only on home while the contract requires immersive/workspace coverage
- remote CSS, scripts, tracking, secrets, private data, or unlicensed assets are packaged

A background-only result is not a failure when the contract selected `native-background`. It is a failure when component restyling was promised but not completed.

## Required state matrix

Verify at least:

- sidebar: idle, task hover, selected task, project hover, long title, collapsed group
- header: default, narrow, side-task panel open
- composer: empty, focused, running, disabled, approval mode, microphone/send controls
- menus: personal menu, general dropdown, tooltip, disabled item
- conversation: prose, tool call, attachment, file card, changed-files card, output panel
- settings: navigation, section card, toggle, select, dialog
- terminal: before mount, after xterm mount, cursor, selection

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
