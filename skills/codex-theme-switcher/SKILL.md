---
name: codex-theme-switcher
description: Apply, switch, and restore Codex desktop themes from the local ~/.codexthemes library with one command, and report which theme is currently active. Use when a user asks to apply or activate a theme they created or installed, switch between installed themes, restore the native Codex look, or check or debug which theme is currently applied.
---

# Switch the active Codex theme

Apply a theme from the managed local library `~/.codexthemes/themes/<theme-id>/` to the running Codex desktop app, switch between installed themes, restore the native look, and verify what is actually active. This skill is standalone: its TypeScript scripts own the reversible injection runtime. It does not create or edit themes (codex-theme-creator), install them from the gallery (codex-theme-installer), or publish them (codex-theme-submitter). The only required local tools are Node.js 20+, `npx`, and the official Codex desktop app.

Run all commands from the installed skill directory. The runtime injects only an owned `<style>` element over Codex's loopback-only debugging endpoint; it never modifies the signed app bundle, and it themes **every** open Codex page, not just one window.

## Step 1: pick the theme

```bash
npx tsx scripts/switch-theme.ts list
```

Lists every installed theme (id, name, layout mode) and which one is currently active. Themes arrive in the library from codex-theme-creator (created locally) or codex-theme-installer (downloaded from codexthemes.ai). If the theme the user wants is not listed, hand off to those skills instead of guessing paths.

## Step 2: apply or switch

```bash
npx tsx scripts/switch-theme.ts apply <theme-id>
```

- If Codex is already exposing its debugging endpoint (it is after any previous themed launch), this hot-swaps the theme in place on every open page — no restart, output `{"status": "active", "pagesThemed": n}`.
- If there is no endpoint (first apply of this app session, or Codex was fully quit), ask the user for explicit permission to restart Codex, then rerun with `--launch`:

```bash
npx tsx scripts/switch-theme.ts apply <theme-id> --launch
```

`--launch` prints `{"status": "scheduled"}` and hands the quit → relaunch → inject sequence to a detached helper that survives the restart (an agent hosted inside Codex dies with it; expect the tool call to be interrupted). Never build your own restart mechanism — no shell wrappers, launchd or scheduled tasks, or script copies; the helper already survives the restart.

The launcher supports macOS and Windows. On Windows it finds the Codex/ChatGPT executable (running process path, `%LOCALAPPDATA%\Programs\...`, or the WindowsApps execution alias — pass `--app` with the full `.exe` path if detection fails), closes it gracefully with `taskkill` (never `/F`), and relaunches it with the debugging flags. If the endpoint never appears after the relaunch, that installed build (for example a Microsoft Store package) drops the debugging flags — report that limitation plainly; never modify files under `WindowsApps` or the installation directory.

## Built-in readability gate

Every apply measures the real rendered pixels after injection (screenshot-based contrast of visible text). If the theme leaves text unreadable, the apply **automatically reverts** to the previously active theme (or the native look) and reports `{"status": "reverted", "failures": [...]}` with the measured evidence. Tell the user the theme is broken as shipped and offer to fix it with codex-theme-creator; pass `--force` only when the user explicitly says they want to keep the unreadable theme anyway.

## Step 3: verify — `scheduled` is not success

```bash
npx tsx scripts/switch-theme.ts status
```

`status` probes every live Codex page and reports `active` (all pages themed, one theme id), `partial` (pages disagree — reapply to converge them), or `inactive`, plus the per-page evidence. Only report success to the user after `status` shows `active` with the expected theme id. If it stays `inactive` after a `--launch`, read `~/.codexthemes/state/launch.log` for the helper's result.

If an **old theme keeps coming back** after a successful hot swap (a stale session from an earlier task is still re-injecting it, and its registrations cannot be removed from outside that session), get the user's restart permission and force a clean relaunch — never ask the user to quit the app by hand:

```bash
npx tsx scripts/switch-theme.ts apply <theme-id> --launch --relaunch
```

`--relaunch` restarts Codex even though an endpoint is already live, which evicts every stale session, then injects the requested theme. It follows the same `scheduled` → `status` verification flow.

## Step 4: always hand the user the escape hatch

Every successful apply report must end with the restore hint, for example: "Reply `restore` at any time and I will return Codex to its native look — fully quitting Codex also removes the theme." A user who dislikes the result must never have to ask how to undo it.

When the user asks to restore (or replies `restore`):

```bash
npx tsx scripts/switch-theme.ts restore
```

Removes the injected style and page markers from every page and clears the runtime state — no restart needed. A full application quit also drops the theme; reapply with `--launch` when the user wants it back. If the theme keeps reappearing after restore, a stale session is re-injecting it — use the `--launch --relaunch` flow from Step 2 with the user's permission, or have them fully quit and reopen Codex.

## Boundaries

- Ask before any restart; a hot swap needs no permission beyond the user's request to switch.
- Never claim a theme is active based on `apply` output alone when a restart was involved — verify with `status`.
- Never modify `app.asar`, the signed application bundle, user tasks, or authentication data.
- Do not edit theme sources here; route design changes to codex-theme-creator.
