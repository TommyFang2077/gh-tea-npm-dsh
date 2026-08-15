# gh-tea-npm-dsh

[![npm](https://img.shields.io/npm/v/@tommyfang/gh-tea-npm-dsh)](https://www.npmjs.com/package/@tommyfang/gh-tea-npm-dsh)
[![license](https://img.shields.io/badge/license-MIT-blue)](./LICENSE)
[![topic](https://img.shields.io/badge/topic-dsh--plugin-4b32c3)](https://github.com/topics/dsh-plugin)

A [DeepSeek Harness](https://github.com/deepseek-ai) (dsh) plugin that brings **GitHub (`gh`)**, **Gitea (`tea`)**, and **npm** into the agent. It detects and installs the CLIs, guides the user through authentication with explicit choices, and operates issues and publishes packages.

## Features

**gh / tea**

- detect installation, version, auth status, and token environment variables (values masked)
- one-command install — Homebrew when available, otherwise a no-sudo binary into `~/.local/bin`
- guided auth: import from env, browser OAuth device flow, or manual token
- issues: `list` · `view` · `create` · `comment` · `close` · `reopen`

**npm**

- detect node/npm, login state (`npm whoami`), and registry
- guided login: browser OAuth device flow (`npm login --auth-type=web`) or automation token
- publish packages (`npm publish --access public`)
- **90-day token expiry notice and rotation** guidance

**Skill**

- registers a companion `gh-tea-npm` skill that documents the workflows and points at each CLI's own `--help` as the authoritative command surface

## Requirements

- Node.js ≥ 18 and npm (for the npm tools)
- `gh` and `tea` are optional — the plugin installs them if missing

## Install

```bash
npx -y @deepseek-ai/dsh plugin add @tommyfang/gh-tea-npm-dsh
```

This is a host-only bundle: `cordis.patch.yml` (referenced by the package's `dsh.bundle` manifest) inserts the plugin row, and `dsh/index.js` registers the tools and the skill.

## Guided configuration

The plugin never poses open-ended questions. It returns a menu, the agent presents it as options, and the user advances one step at a time.

**gh / tea** — `gitclis_configure`:

1. `gitclis_configure method=auto` → current state + next-step menu
2. install a missing CLI with `gitclis_install`, or pick a token source:
   - env import → `method=env`
   - browser OAuth (GitHub) → `method=web` (returns a device code) → `method=poll` to verify
   - manual → `gitclis_set_token`
3. verify with `gitclis_status`

**npm** — `npm_configure`:

1. `npm_configure method=auto` → current state + next-step menu
2. browser OAuth → `method=web` (returns a login URL) → `method=poll` to verify, or automation token → `method=token`
3. publish with `npm_publish` (or `npm_publish dry_run=true`)

## npm token policy (90 days)

npm now caps access tokens — including automation tokens — at a **90-day** lifetime. An expired token breaks `npm publish`, so rotate before it lapses:

- generate a new Automation token at `https://www.npmjs.com/settings/<user>/tokens/new`, then `npm_configure method=token`; or
- re-run `npm_configure method=web`.

`npm_status` surfaces this policy and `npm_configure` walks through rotation.

## Tools

| Tool | Description |
| --- | --- |
| `gitclis_status` | detect gh/tea install, version, auth, env tokens (masked) |
| `gitclis_configure` | guided gh/tea config — `auto`/`env`/`web`/`manual`/`poll` |
| `gitclis_install` | install gh and/or tea |
| `gitclis_set_token` | store a gh/tea token (never echoed) |
| `gitclis_token_env` | read/import token environment variables |
| `gitclis_issue_list` | list issues |
| `gitclis_issue_view` | view one issue, optionally with comments |
| `gitclis_issue_create` | create an issue |
| `gitclis_issue_comment` | comment on an issue |
| `gitclis_issue_close` | close an issue |
| `gitclis_issue_reopen` | reopen an issue |
| `npm_status` | detect node/npm, login state, registry |
| `npm_configure` | guided npm auth — `auto`/`web`/`token`/`poll` |
| `npm_publish` | publish to npm |

Issue tools take a `provider` argument: `github` → `gh`, `gitea` → `tea`.

## Skill

The companion skill is registered at runtime and shipped on disk at `skills/gh-tea-npm/SKILL.md`. It documents issue-workflow recipes, the auth flows, and the npm token policy, and defers to `gh <cmd> --help`, `tea <cmd> --help`, and `npm <cmd> --help` for exact flags.

## Repository layout

```text
dsh/index.js        Host Cordis plugin — registers tools + the gh-tea-npm skill
cordis.patch.yml    dsh bundle layer — inserts this package
skills/gh-tea-npm/  companion skill markdown
package.json        dsh + exports manifest
```

## License

[MIT](./LICENSE)
