# CodexThemes Skills

Official agent skills for creating cohesive, native-safe themes for the Codex desktop app.

The repository is the canonical source for the skill served through [codexthemes.ai/SKILL.md](https://codexthemes.ai/SKILL.md). It contains no bundled celebrity images, third-party themes, copied screenshots, generated theme packages, or private user assets.

## Install

Install `new-theme` globally for Codex:

```bash
npx skills add codexthemes/skills --skill new-theme -g -a codex
```

Install it in the current project instead:

```bash
npx skills add codexthemes/skills --skill new-theme -a codex
```

List the skills available in this repository:

```bash
npx skills add codexthemes/skills --list
```

Update an installed copy:

```bash
npx skills update new-theme
```

You can also give an agent this URL directly:

```text
https://codexthemes.ai/SKILL.md
```

The website entrypoint tells the agent to load the canonical skill and required references from this repository.

## Use

Examples:

```text
Use $new-theme to create a light Codex theme from this reference image. Keep the native layout and use the artwork only on the home page.
```

```text
Use $new-theme to create a native-immersive theme. Show the background on conversations too, and verify settings, menus, diffs, terminal, sidebar hover states, and narrow windows.
```

The skill defaults to preserving the native layout. It supports four explicit modes:

- `native-background`: change only scoped artwork and readability veils.
- `native-immersive`: preserve geometry while coordinating all semantic surfaces.
- `editorial-showcase`: allow a bounded home hero when the reference requires it.
- `palette-only`: change semantic colors and materials without dominant artwork.

## Repository layout

```text
skills/new-theme/
├── SKILL.md
├── agents/openai.yaml
├── assets/
├── references/
└── scripts/
```

The root README is for people. Everything inside `skills/new-theme/` is the installable agent skill.

## Validation

```bash
npm test
python3 /path/to/skill-creator/scripts/quick_validate.py skills/new-theme
```

The first command tests the scaffold and static theme validator. The second validates Agent Skill metadata when the OpenAI skill-creator utilities are available.

## Content and rights policy

- Source, documentation, and templates in this repository are Apache-2.0 licensed unless a file states otherwise.
- No third-party binary artwork is included.
- References may be used for high-level visual direction only; they must not be republished without permission.
- A generated theme must record the source and redistribution rights for every packaged asset.
- “Codex” and “OpenAI” are trademarks of their respective owners. This project is independent and is not endorsed by OpenAI.

See [NOTICE](NOTICE) and [skills/new-theme/references/asset-rights.md](skills/new-theme/references/asset-rights.md).

## License

Apache License 2.0. See [LICENSE](LICENSE).
