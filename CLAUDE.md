# Babuki — working rules

Mirrors the standards the owner's Home repo enforces
(`C:\Users\prass\OneDrive\Documents\Home\CLAUDE.md`) — same owner, same
account, same discipline. See `docs/architecture.md` (and the
`babuki-architecture` skill that points to it) for what the system
actually is; this file is about *how* to work in this repo.

## Branching & commits — non-negotiable

- **Never commit or push directly to `main`.** A GitHub ruleset enforces
  this account-wide (`current_user_can_bypass: never`) — every change
  lands via a merged PR.
- Branch from a fresh `main`: `git fetch origin && git switch -c
  <type>/<slug> origin/main`. Prefixes: `feat/`, `fix/`, `chore/`, `docs/`,
  `infra/`.
- **Stage explicit paths — never `git add -A` / `.` / `-u`.** List the
  files you mean to commit. Run `git status` before staging and review the
  diff before committing.
- Commit messages end with `Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>`;
  PR descriptions end with the "Generated with Claude Code" line.

## AWS — non-negotiable

- **Always clear the stale global `AWS_ACCESS_KEY_ID`/`AWS_SECRET_ACCESS_KEY`
  env vars in the SAME command as any AWS call**, then set
  `AWS_PROFILE=senthilkumar`. Env vars outrank `--profile`, and no shell
  state persists between tool calls — this is not a one-time fix:
  ```bash
  unset AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY AWS_SESSION_TOKEN
  export AWS_PROFILE=senthilkumar
  ```
  Skipping this is the most common cause of `InvalidClientTokenId` here.
- Same AWS account as Home (551362153374) — that's fine, it's the same
  owner's account. **Every resource must still be new and separate**: own
  VPC, own EC2, own IAM roles, own S3 bucket, own Terraform state bucket
  (`babuki-tfstate-551362153374`, not Home's `me2us4u-tfstate-*`), own SSH
  key (`~/.ssh/babuki-app-box`, never `me2us4u-app-box`). Only the
  account-level GitHub OIDC *provider* and the MSG91/Razorpay *vendor
  accounts* are intentionally shared — see `docs/architecture.md`'s
  isolation section for the exact boundary and why.
- No secrets in transcripts or logs — pipe them directly into commands
  (`aws secretsmanager get-secret-value ... | docker login ...`), never
  echo/print a real value. **`set -x` (or `set -eux`) prints every variable
  assignment**, so a script that fetches a secret into a variable under
  xtrace leaks it to the terminal and any log it tees to — this happened
  once (the Postgres password, in `catchup-first-boot.sh`). Wrap the
  secret handling in `set +x` … `set -x`.
- Applying real infrastructure changes (`terraform apply`) is a protected
  action requiring the user's explicit permission — expect it to be
  blocked by the harness until they grant it, and don't try to route
  around that block.

## Shell environment on the owner's machine — `bash` is WSL2, not Git Bash

Confirmed live (2026-09-18, deploying via `scripts/deploy.sh`): when the
owner types `bash ...` at a `PS C:\...>` prompt, it resolves to **WSL2**
(`uname -a` → `...microsoft-standard-WSL2...`, `$HOME` → `/home/<wsl-user>`),
**not** Git Bash. This matters every time a command needs to cross the
PowerShell↔bash boundary:

- **PowerShell's `$env:VAR = "value"` does NOT propagate into WSL.** WSL is
  a genuinely separate Linux environment; Windows process-env-var
  inheritance that normally reaches a child process does not reach it the
  same way. Setting a var in PowerShell then calling `bash script.sh`
  expecting the script to see that var **will silently fall back to the
  script's own default** instead of erroring — confirmed live: `SSH_KEY`
  set via `$env:SSH_KEY` in PowerShell was invisible inside
  `scripts/deploy.sh`, which fell back to `$HOME/.ssh/...` (a WSL path
  that didn't exist) rather than failing loudly.
- **Windows paths need the WSL mount form.** `/c/Users/prass/...` is the
  Git-Bash/MSYS convention and does not exist inside WSL — the same file
  is `/mnt/c/Users/prass/...` there. Using the wrong one fails silently
  the same way (file not found, not "wrong shell").
- **The reliable fix: set the var *inside* the same `bash -c "..."`
  invocation**, using the WSL path form, so nothing has to cross the
  PowerShell↔bash boundary at all.
- **Never point `SSH_KEY` at a `/mnt/c/...` path** — files on the Windows
  mount always report mode 0777 and ssh ignores the key ("UNPROTECTED
  PRIVATE KEY FILE", then `Permission denied (publickey)`). The key lives
  as a `chmod 600` copy in WSL's own `~/.ssh/babuki-app-box`, which is
  `deploy.sh`'s default, so the deploy command has **no override**
  (`deploy.sh` also checks the key's mode up front and says how to fix it):
  ```powershell
  bash scripts/deploy.sh 13.204.187.141
  ```
- **WSL has no Linux `node`/`npm` here** — `type -a npm` →
  `/mnt/c/Program Files/nodejs/npm`, the *Windows* one via interop. Env
  vars set in the bash script (`VAR=x npm run build`) never reach it
  (`WSLENV` is empty). Confirmed live: `NEXT_PUBLIC_API_URL` passed inline
  to `npm run build` was silently ignored and the bundle shipped with the
  `localhost:8000` fallback. Anything a Node process must see from
  `deploy.sh` goes in a file (`apps/web/.env.production.local`), never an
  inline env var — and verify the built output, don't trust the step.
- Before assuming which shell a `bash`/env-var problem is happening in,
  check rather than guess a second time:
  ```powershell
  bash -c "echo HOME=\$HOME; uname -a"
  ```

## Verify before you build on top

`npx tsc --noEmit && npm run build && npx next lint` (from `apps/web`)
before opening or updating a PR. No test runner yet.

## Keep `docs/architecture.md` current — non-negotiable

There's no tooling that regenerates it automatically; the mechanism is
this rule. **Any change to the schema, API surface, infra, or the
isolation boundary updates `docs/architecture.md` in the same commit/PR**
— not as a follow-up, not "later." Same convention Home uses for its
VaultGate skill: treat the doc as out of date only if you find it
contradicted by the code, and fix both in that case. A fresh session
should never have to re-derive this system from scratch.

## Isolation from Me2Us4U — read before touching infra or auth

Full rule and reasoning: `docs/architecture.md`. Short version: nothing
here imports from, deploys to, or shares state/credentials/DNS/IAM with
the Home repo or its AWS resources, except the MSG91/Razorpay vendor
accounts (Babuki uses its own plan/template IDs inside them).
