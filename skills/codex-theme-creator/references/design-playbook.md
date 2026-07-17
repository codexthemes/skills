# Codex theme design playbook

## Contents

1. Design contract
2. Layout modes
3. Semantic palette
4. Page and surface scope
5. Selector discipline
6. Artwork and composition
7. Responsive and lifecycle behavior

## 1. Design contract

Write the contract before CSS. It must name the layout mode, background scope, mode reason, focal point, text-safe region, allowed changes, preserved native behavior, and target viewports.

Visual richness does not imply permission to restructure Codex. If a reference can be expressed through background, palette, material, and ornament changes, preserve native geometry.

## 2. Layout modes

| Mode | Geometry | Native components | Artwork |
| --- | --- | --- | --- |
| `native-background` | unchanged | unchanged except bounded readability surfaces for workspace artwork | home, or home plus verified conversations |
| `native-immersive` | unchanged | coordinated semantic materials and states | full workspace when contracted |
| `editorial-showcase` | bounded home hero may change | all native controls remain functional and coordinated | hero plus restrained task background |
| `palette-only` | unchanged | semantic colors and materials | none |

### Native background

Use when the user asks to change only the background or likes the default Codex layout. Preserve sidebar, header, suggestion cards, selector, composer, menus, settings, diffs, terminal, spacing, and interaction states. A readability veil may sit between artwork and native content. With `backgroundScope: workspace`, use bounded message and composer surfaces instead of recoloring every descendant.

### Native immersive

Keep the native information architecture and dimensions. Coordinate sidebar, cards, selector, composer, menus, settings, output/diff, terminal, focus, hover, and selected states through semantic tokens.

### Editorial showcase

Use only for a clearly requested portrait, product, campaign, or gallery composition. Bound the composition to the home hero. Do not turn a screenshot into fake controls or move native controls into decorative artwork.

### Palette only

Use for a restrained skin without dominant artwork. Do not add a hidden or decorative background merely to make the theme feel richer.

## 3. Semantic palette

Define these roles before component selectors:

- canvas
- surface
- raised surface
- input surface
- primary text
- muted text
- disabled text
- accent
- border
- focus
- success
- warning
- danger
- diff added and removed
- inline code and code block
- terminal foreground and background

Use at least three distinguishable surface elevations for immersive and showcase modes. Use accent selectively.

For light themes, do not leave settings, menus, dropdowns, output panels, changed-files cards, or the terminal host on stale navy, gray, or purple native tokens. A dark terminal is allowed only when the contract calls it an intentional contrast panel and its tab/header belongs to the same material system.

For dark themes, avoid pure black across every surface. Use distinguishable elevations and readable muted text.

## 4. Page and surface scope

Theme and test these surfaces independently:

| Surface | Required checks |
| --- | --- |
| Home | heading, suggestion cards, selector, composer, empty-state artwork |
| Conversation | prose, tool states, files, attachments, code, persistent composer |
| Sidebar | idle, hover, selected, project hover, long title, row actions, footer menu |
| Header | title, actions, side-task control, narrow width, readable solid surface |
| Settings | navigation, cards, inputs, selects, toggles, dialogs |
| Menus | profile menu, dropdown, context menu, tooltip, disabled item |
| Output/diff | file cards, changed-files list, additions, deletions, review controls |
| Terminal | tab strip, host, xterm viewport, xterm screen, selection and cursor |

Scope home selectors to a verified home marker. Scope task artwork to a verified conversation marker. Never use `main:not(...)`, page text, or absence of the home marker as proof that a page is a conversation. Settings and system pages require their own scope.

## 5. Selector discipline

Prefer verified stable hooks:

1. roles and test IDs
2. stable component root classes
3. narrowly anchored `:has(...)`
4. versioned fallback classes

Avoid localized text selectors and structural selectors tied to arbitrary child order.

Hard rules:

- Do not target `aside *`, `main *`, generic `svg`, or broad descendant `:is(...)` with state-changing properties.
- Do not force descendant opacity to repair contrast. Hidden and hover-only controls rely on opacity.
- Do not globally set `position`, `display`, `visibility`, `overflow`, or dimensions on native descendants.
- Do not assign the same border to both a parent and each child. Give every boundary one owner.
- Do not append repeated emergency overrides. Consolidate the original rule.
- Keep decorative pseudo-elements `pointer-events: none` and below all controls.
- Keep header controls on a solid readable surface. Put gradients behind the header, not through it.
- Reserve enough sidebar width for row actions; truncate the title before the pin/archive actions.

## 6. Artwork and composition

Record the focal point and a text-safe region. Use `object-position` or background positioning intentionally at desktop and narrow widths.

For `native-background`, artwork may be full-screen while native content remains centered and unchanged. This is a valid finished theme; do not force a showcase layout.

For `native-immersive` and `editorial-showcase`, coordinate veils and bounded content surfaces so the artwork remains visible without harming prose, code, or controls.

Artwork on conversations is opt-in through `backgroundScope: workspace`. Reduce contrast behind long-form content. Do not repeat a large hero behind every message.

Use the user's supplied artwork directly when requested. Crop or clean it only for composition, readability, private-data removal, or asset compatibility; do not replace it merely because it depicts third-party subject matter.

## 7. Responsive and lifecycle behavior

At desktop width, preserve the native relationship among heading, suggestion cards, selector, and composer unless showcase mode explicitly changes the hero. At narrow width, remove nonessential ornaments before reducing text contrast or control hit areas.

Verify cold launch. Inject base tokens and structural CSS before decoding large artwork so the page does not flash from native to themed geometry. Artwork failure must leave a readable usable app.

Verify route changes, renderer reload, theme switching, restore, and reapply. Dynamic terminal and menu portals may mount after the initial stylesheet; their semantic tokens must still resolve correctly.
