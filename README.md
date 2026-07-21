# CodexThemes Skills

Official agent skills for creating cohesive, native-safe themes for the Codex desktop app, and for finding, installing, and submitting themes on [codexthemes.ai](https://codexthemes.ai).

The repository is the canonical source for the skill served through [codexthemes.ai/SKILL.md](https://codexthemes.ai/SKILL.md). It contains no bundled celebrity images, third-party themes, copied screenshots, generated theme packages, or private user assets.

## Install

Install `codex-theme-creator` globally for Codex:

```bash
npx skills add codexthemes/skills --skill codex-theme-creator -g -a codex
```

Install it in the current project instead:

```bash
npx skills add codexthemes/skills --skill codex-theme-creator -a codex
```

Install `codex-theme-submitter` to submit exported `.codex-theme` packages through the codexthemes.ai API:

```bash
npx skills add codexthemes/skills --skill codex-theme-submitter -g -a codex
```

Install `codex-theme-finder` and `codex-theme-installer` to search the codexthemes.ai gallery and install published themes locally:

```bash
npx skills add codexthemes/skills --skill codex-theme-finder -g -a codex
npx skills add codexthemes/skills --skill codex-theme-installer -g -a codex
```

Install `codex-theme-switcher` to apply, switch, and restore installed themes with one command:

```bash
npx skills add codexthemes/skills --skill codex-theme-switcher -g -a codex
```

Install `workbuddy-theme-manager` to convert `.codex-theme` packages into the standalone `.workbuddy-theme` format and apply them to Tencent WorkBuddy without a third-party theme runtime:

```bash
npx skills add codexthemes/skills --skill workbuddy-theme-manager -g
```

List the skills available in this repository:

```bash
npx skills add codexthemes/skills --list
```

Update an installed copy:

```bash
npx skills update codex-theme-creator
```

You can also give an agent this URL directly:

```text
https://codexthemes.ai/SKILL.md
```

The website entrypoint tells the agent to load the canonical skill and required references from this repository.

## Use

Examples:

```text
Use $codex-theme-creator to create a light Codex theme from this reference image. Keep the native layout and use the artwork only on the home page.
```

```text
Use $codex-theme-creator to create a native-immersive theme. Show the background on conversations too, and verify settings, menus, diffs, terminal, sidebar hover states, and narrow windows.
```

The skill defaults to preserving the native layout. It supports four explicit modes:

- `native-background`: change only scoped artwork and readability veils.
- `native-immersive`: preserve geometry while coordinating all semantic surfaces.
- `editorial-showcase`: allow a bounded home hero when the reference requires it.
- `palette-only`: change semantic colors and materials without dominant artwork.

Theme creation, validation, session application, and restore are self-contained TypeScript workflows. They do **not** require CodeDrobe, Dream/Fiona, or another theme application. The runtime uses Node.js and Codex's loopback-only debugging endpoint, never patches the signed app bundle, and may need to be applied again after a full app quit. The launcher supports macOS and Windows; builds that drop the Chromium debugging flags (for example some store packages) cannot be themed and are reported as such.

By default, editable themes live in `~/.codexthemes/themes/<id>/`, shareable packages in `~/.codexthemes/exports/<id>.codex-theme`, and runtime state in `~/.codexthemes/state/`.

`codex-theme-submitter` publishes an exported `.codex-theme` package to CodexThemes:

```text
Use $codex-theme-submitter to submit ~/.codexthemes/exports/my-theme.codex-theme to codexthemes.ai.
```

It checks for a local CodexThemes API key (`CODEXTHEMES_API_KEY` or `~/.codexthemes/credentials.json`), guides you to create one at [codexthemes.ai/settings/apikeys](https://codexthemes.ai/settings/apikeys) when none exists, validates the package with a dry run, and then submits it to the authenticated `POST /api/themes/submit` endpoint.

`codex-theme-finder` searches the published gallery, and `codex-theme-installer` downloads a theme's source files into `~/.codexthemes/themes/<id>/`:

```text
Use $codex-theme-finder to search codexthemes.ai for a dark anime Codex theme.
```

```text
Use $codex-theme-installer to install https://codexthemes.ai/themes/noir-anime locally.
```

Both work anonymously within a free API quota; when the quota or rate limit is hit (HTTP 429), they guide you to create an API key at [codexthemes.ai/settings/apikeys](https://codexthemes.ai/settings/apikeys) for higher limits. Installing places source files only.

`codex-theme-switcher` activates themes: it lists the local library, hot-swaps the running app when the debugging endpoint is live, schedules a restart-surviving relaunch when it is not (or when `--relaunch` forces a clean restart), verifies the result against the real DOM, and restores the native look:

```text
Use $codex-theme-switcher to switch my Codex theme to noir-anime.
```

`workbuddy-theme-manager` provides a separate, self-contained WorkBuddy path. It converts either a `.codex-theme` package or an installed `~/.codexthemes/themes/<id>/` source into WorkBuddy-specific CSS, writes packages under `~/.codexthemes/workbuddy-exports/`, and owns its loopback-only CDP injection and restore lifecycle:

```text
Use $workbuddy-theme-manager to convert ~/.codexthemes/exports/noir-anime.codex-theme and apply it to WorkBuddy.
```

For a theme downloaded by `codex-theme-installer`, no intermediate export is needed:

```text
Use $codex-theme-installer to install portal-panic, then use $workbuddy-theme-manager to convert the installed theme and apply it to WorkBuddy.
```

## Repository layout

```text
skills/codex-theme-creator/
├── SKILL.md
├── agents/openai.yaml
├── assets/
├── references/
└── scripts/
skills/codex-theme-submitter/
├── SKILL.md
├── agents/openai.yaml
├── references/
└── scripts/
skills/codex-theme-finder/
├── SKILL.md
├── agents/openai.yaml
├── references/
└── scripts/
skills/codex-theme-installer/
├── SKILL.md
├── agents/openai.yaml
├── references/
└── scripts/
skills/codex-theme-switcher/
├── SKILL.md
├── agents/openai.yaml
└── scripts/
skills/workbuddy-theme-manager/
├── SKILL.md
├── agents/openai.yaml
├── assets/
├── references/
└── scripts/
```

The root README is for people. Each directory inside `skills/` is a standalone installable agent skill.

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
- User-supplied material may be used directly for local theme creation and export.
- Sharing permission is confirmed by the uploader during submission; the Skill does not perform legal or copyright review.
- “Codex” and “OpenAI” are trademarks of their respective owners. This project is independent and is not endorsed by OpenAI.

See [NOTICE](NOTICE) and [skills/codex-theme-creator/references/asset-rights.md](skills/codex-theme-creator/references/asset-rights.md).

## License

Apache License 2.0. See [LICENSE](LICENSE).
