# Codex theme design playbook

## Contents

1. Design contract
2. Layout modes
3. Semantic palette
4. Page and surface scope
5. Selector discipline
6. Artwork and composition
7. Responsive and lifecycle behavior
8. Decoration menu and density coverage

## 1. Design contract

Write the contract before CSS. It must name the layout mode, background scope, decor density, mode reason, focal point, text-safe region, allowed changes, preserved native behavior, and target viewports.

Visual richness does not imply permission to restructure Codex. If a reference can be expressed through background, palette, material, and ornament changes, preserve native geometry. The reverse also holds: preserving native geometry does not mean shipping a bare background — section 8 defines how much of the decoration menu each density must cover.

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

### Native token sweep (required for immersive, showcase, and palette modes)

Codex resolves most component colors from its own `--color-token-*` CSS variables, and those variables follow the **user's** native light/dark appearance — not yours. A theme that recolors surfaces but leaves native tokens untouched only looks right on machines whose native mode happens to match the theme, and breaks on everyone else's (dark text on a dark canvas, stray white bands). Do not invent lookalike token names (`--background`, `--card`, shadcn-style HSL triples); they change nothing.

Inside the theme root selector, set `color-scheme` to the theme's mode and override the full native token set with `!important`, mapping every token to the semantic palette. The canonical set:

`bg-primary`, `bg-secondary`, `bg-tertiary`, `main-surface-primary`, `side-bar-background`, `foreground`, `text-primary`, `text-secondary`, `text-tertiary`, `description-foreground`, `icon-foreground`, `input-background`, `input-foreground`, `input-placeholder-foreground`, `input-border`, `border`, `border-default`, `border-heavy`, `border-light`, `list-hover-background`, `list-active-selection-background`, `list-active-selection-foreground`, `toolbar-hover-background`, `button-background`, `button-foreground`, `button-border`, `link`, `text-link-foreground`, `text-link-active-foreground`, `primary`, `focus-border`, `dropdown-background`, `dropdown-foreground`, `menu-background`, `menu-border`, `checkbox-background`, `checkbox-border`, `checkbox-foreground`, `badge-background`, `badge-foreground`, `scrollbar-slider-background`, `scrollbar-slider-hover-background`, `scrollbar-slider-active-background`, `conversation-header`, `conversation-body`, `conversation-summary-leading`, `conversation-summary-trailing`, `non-assistant-body-descendant`, `text-preformat-foreground`, `text-preformat-background`, `text-code-block-background`

(each prefixed `--color-token-`). Verify against the live DOM and add any token the current app version defines that this list misses. The finished theme must render identically whether the user's Codex starts in native light or native dark mode.

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
| System pages | plugins/apps directory, sites, scheduled tasks: headings, descriptions, search inputs, cards — no native-mode surfaces or fades left behind |

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

## 8. Decoration menu and density coverage

A theme reads as finished when the reference's world shows up in the details, not only in the wallpaper. Build decoration from this menu. Every item is pure CSS on verified hooks — no scripts, no fake controls, `pointer-events: none` on every decorative layer, and native geometry, hit targets, and hover-only actions untouched.

### Element menu

**Materials and typography**

- Themed font pairing: one display stack for headings and brand moments, one body stack; apply through scoped selectors, never `* { font-family }`.
- Layered surfaces: gradient plus subtle texture or grain on canvas, sidebar, header, composer, and cards instead of one flat color. Keep prose and code regions calm.
- Full token sweep: recolor scrollbars, selection, caret, links, badges, checkboxes, toggles, dropdown and menu materials, code/diff panels, and terminal together with the headline surfaces so no stale native color survives.

**Home stage** (scope with `main.main-surface[data-codexthemes-page="home"]`)

- Hero treatment: frame the native heading region as a banner card — artwork on one side, a veil gradient protecting the text-safe region, a themed border and shadow.
- Tagline: a short themed line under the heading via a pseudo-element `content:` on a verified non-interactive hook.
- Suggestion cards: themed material, a circular or badged icon treatment, and a small hover lift/glow; keep label text readable and the whole card clickable.
- Project selector: themed chip material consistent with the cards.

**Chrome accents** (all `pointer-events: none`, below native controls)

- Header lockup: a small brand/title or motto treatment at a header edge that never covers native actions.
- Corner emblem: one signature ornament — a seal, sticker, framed miniature of the artwork, or mascot — anchored to a home corner and hidden at narrow widths.
- Ambient layer: sparse particles, sparkles, mist, or ink motes as positioned pseudo-elements with a gentle keyframe animation; disable the animation under `prefers-reduced-motion`.
- Composer accent: a themed frame for the composer chrome plus one small decorative marker on its edge.
- Sidebar accents: coordinated hover/selected materials and at most one small glyph flourish; never hide or displace row actions.

### Density coverage

| `decorDensity` | Required coverage |
| --- | --- |
| `minimal` | background with veil, semantic palette, readable states |
| `balanced` | minimal, plus layered surfaces, full token sweep, themed suggestion cards and composer, font pairing |
| `rich` | balanced, plus hero treatment, tagline, header lockup, one corner emblem, one ambient layer, sidebar accents |

Decoration never outranks readability: if an element fights prose, code, or control contrast at any viewport, cut the element, not the contrast. At narrow widths drop corner emblems and ambient layers first, keep materials and palette.
