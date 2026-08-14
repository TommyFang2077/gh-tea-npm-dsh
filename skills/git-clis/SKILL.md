# GitHub (gh) & Gitea (tea) CLI

Companion skill for the `git-clis` DSH plugin (TommyFang2077). Operates issues (and
other forge entities) on GitHub via `gh` and on Gitea via `tea`.

The CLIs are the source of truth for their exact command surface. Prefer their own
help over anything here: commands and flags change between releases.

```text
gh help issue            # GitHub issue commands
gh issue list --help     # exact flags for one subcommand
tea help issues          # Gitea issue commands
tea issues list --help
```

## When to use

Use this skill and the `git-clis` plugin tools whenever the user asks to read, create,
comment on, close, or reopen issues on GitHub or Gitea, or to set up / check forge auth.

## Guided configuration (gitclis_configure)

Configure a CLI step by step with explicit choices. Never ask open-ended questions;
always present options via `ask_user_question` and advance one step at a time.

1. Call `gitclis_configure method=auto` to get the current state and the next-step menu.
2. Present the menu as options. On the chosen branch, call the matching action:
   - install a missing CLI: `gitclis_install cli=gh|tea|both`
   - env token: `gitclis_configure method=env provider=...`
   - browser OAuth (GitHub): `gitclis_configure method=web` → show code + URL to the
     user → after they authorize, `gitclis_configure method=poll flow_id=...`
   - manual token: `gitclis_set_token provider=... token=...` (token then appears in
     chat; prefer env or web)
3. After auth, verify with `gitclis_status`.

## Plugin tools

```text
gitclis_status        detect gh/tea, versions, auth, env tokens (masked)
gitclis_configure     guided install + auth flow (auto/env/web/manual/poll)
gitclis_install       one-click install of gh and/or tea
gitclis_set_token     store an auth token for gh and/or tea
gitclis_token_env     read/import tokens from the environment
```

## Authentication

GitHub (`gh`):

- token env vars: `GH_TOKEN` (preferred) or `GITHUB_TOKEN`; gh reads them automatically.
- or store it: `gh auth login --with-token` (reads the token from stdin)
- or OAuth: `gh auth login --web` (device flow, no token in chat)
- check status: `gh auth status`

Gitea (`tea`):

- store a token: `tea login add --name default --url <server> --token <token>`
- list logins: `tea login list`
- tea keeps tokens in `~/.config/tea/config.yml`; there is no first-class token env
  var, so store it with `tea login add`, or set `GITEA_TOKEN` / `TEA_TOKEN` and import
  it with `gitclis_token_env`.

## Issue workflow recipes

Confirm every flag against `--help` before relying on it. These are the shapes, not a
frozen reference. `owner/repo` is the repository slug.

List open issues:

```text
gh   issue list --repo owner/repo --state open --limit 50
tea  issues list --repo owner/repo --state open --limit 50
```

List with filters:

```text
gh   issue list --repo owner/repo --label bug --search "memory leak"
tea  issues list --repo owner/repo --labels bug --keyword "memory leak"
```

View one issue with comments:

```text
gh   issue view 42 --repo owner/repo --comments
tea  issues 42 --repo owner/repo --comments
```

Create an issue:

```text
gh   issue create --repo owner/repo --title "Title" --body "Body text"
tea  issues create --repo owner/repo --title "Title" --description "Body text"
```

Comment on an issue:

```text
gh   issue comment 42 --repo owner/repo --body "Comment text"
tea  comments add 42 --repo owner/repo --description "Comment text"
```

Close an issue:

```text
gh   issue close 42 --repo owner/repo --comment "Closing because fixed"
tea  issues close 42 --repo owner/repo
```

Reopen an issue:

```text
gh   issue reopen 42 --repo owner/repo
tea  issues reopen 42 --repo owner/repo
```

## Provider mapping in plugin tools

The issue tools take a `provider` argument: `github` maps to `gh`, `gitea` maps to `tea`.

## Safety notes

- Read first: prefer `list` / `view` to understand state before mutating.
- `close` / `reopen` / `comment` mutate state; confirm the target issue number first.
- Never print a token back into the conversation; the plugin masks env token values.
- Flags can drift between releases; when a command fails with an unknown flag, read
  `gh <cmd> --help` or `tea <cmd> --help` and adapt.
