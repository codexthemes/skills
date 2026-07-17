# CodexThemes Skills

Official agent skills for creating cohesive, native-safe themes for the Codex desktop app.

The repository is the canonical source for the skill served through [codexthemes.ai/SKILL.md](https://codexthemes.ai/SKILL.md). It contains no bundled celebrity images, third-party themes, copied screenshots, generated theme packages, or private user assets.

## Install

Install `codex-themes-creator` globally for Codex:

```bash
npx skills add codexthemes/skills --skill codex-themes-creator -g -a codex
```

Install it in the current project instead:

```bash
npx skills add codexthemes/skills --skill codex-themes-creator -a codex
```

List the skills available in this repository:

```bash
npx skills add codexthemes/skills --list
```

Update an installed copy:

```bash
npx skills update codex-themes-creator
```

You can also give an agent this URL directly:

```text
https://codexthemes.ai/SKILL.md
```

The website entrypoint tells the agent to load the canonical skill and required references from this repository.

## Use

Examples:

```text
Use $codex-themes-creator to create a light Codex theme from this reference image. Keep the native layout and use the artwork only on the home page.
```

```text
Use $codex-themes-creator to create a native-immersive theme. Show the background on conversations too, and verify settings, menus, diffs, terminal, sidebar hover states, and narrow windows.
```

The skill defaults to preserving the native layout. It supports four explicit modes:

- `native-background`: change only scoped artwork and readability veils.
- `native-immersive`: preserve geometry while coordinating all semantic surfaces.
- `editorial-showcase`: allow a bounded home hero when the reference requires it.
- `palette-only`: change semantic colors and materials without dominant artwork.

Theme creation, validation, session application, and restore are self-contained TypeScript workflows. They do **not** require CodeDrobe, Dream/Fiona, or another theme application. The runtime uses Node.js and Codex's loopback-only debugging endpoint, never patches the signed app bundle, and may need to be applied again after a full app quit.

By default, editable themes live in `~/.codex-themes/themes/<id>/`, shareable packages in `~/.codex-themes/exports/<id>.codex-theme`, and runtime state in `~/.codex-themes/state/`.

## Repository layout

```text
skills/codex-themes-creator/
├── SKILL.md
├── agents/openai.yaml
├── assets/
├── references/
└── scripts/
```

The root README is for people. Everything inside `skills/codex-themes-creator/` is the installable agent skill.

> This skill was previously named `new-theme`. Reinstall it using the new name and remove the old local directory if both versions are present; keeping both can make Skill routing ambiguous.

## Validation

```bash
npm ci
npm run check
```

`npm run check` runs strict TypeScript type checking, validates Agent Skill metadata with the bundled TypeScript validator, and tests every scaffold mode plus static theme rejection rules. The repository does not require Python.

## Content and rights policy

- Source, documentation, and templates in this repository are Apache-2.0 licensed unless a file states otherwise.
- No third-party binary artwork is included.
- References may be used for high-level visual direction only; they must not be republished without permission.
- A generated theme must record the source and redistribution rights for every packaged asset.
- “Codex” and “OpenAI” are trademarks of their respective owners. This project is independent and is not endorsed by OpenAI.

See [NOTICE](NOTICE) and [skills/codex-themes-creator/references/asset-rights.md](skills/codex-themes-creator/references/asset-rights.md).

## License

Apache License 2.0. See [LICENSE](LICENSE).
