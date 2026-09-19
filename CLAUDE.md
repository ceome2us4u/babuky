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

## Modes and config are env switches, never code changes — non-negotiable

TEST vs LIVE is **one** switch, `APP_MODE=test|live` in the API's env on the
box (Home's convention) — it drives OTP, Razorpay, and anything else that
differs between test and live. Do not add per-feature flags (`OTP_TEST_MODE`,
`RAZORPAY_MODE`, …), and never make flipping a mode a code edit, a PR, or a
redeploy: `bash scripts/set-app-mode.sh test|live <host>`. Mode-specific
credentials sit side by side as `<NAME>_LIVE` / `<NAME>_TEST` and are picked
by `apps/api/src/lib/mode.ts` `pick()`, which fails closed. Anything the
browser needs that differs by mode comes from the API, not a build-time
`NEXT_PUBLIC_*`. See `docs/architecture.md` → "Modes: TEST / LIVE". Before
inventing a mechanism for something like this, check how Home already does it.

## UI must look professional at every size — non-negotiable

Check any UI change at **1920×1080, 1366×768 / 1280×720 and a 375px phone**
before shipping, by measuring (not just eyeballing): no dead gaps, nothing
covered, the home hero's two cards and buttons above the fold on a 1280×720
laptop. Rules learned the hard way: bottom bars are `sticky bottom-0`, never
`fixed` (a fixed bar covers the footer at the end of the page); on a phone a
bar may use ≤ ~15% of the screen; icons beside labels in a flex row need an
explicit `gap-*` (the whitespace collapses); large-monitor sizing starts at
`2xl` (1536px), not `xl`, so 1280–1440 laptops keep the compact above-the-fold
layout. User-facing copy is plain language — never internal terms (lead-source
tags like `MERCHANT`, "provision", "OTP login"). When testing locally, make sure
port 3100 isn't still held by an old `next start` (it serves the OLD build).

## Every input is validated, on both sides — non-negotiable

Any new field goes through `apps/web/src/lib/validate.ts` (sanitise as you
type + inline `FieldError`) **and** `apps/api/src/lib/validation.ts` (the API
never trusts the browser). Numeric fields must reject non-digits, not just
warn; every text field needs a length cap; placeholders describe the field
("Your phone number") and are never sample values. Rules and limits are in
`docs/architecture.md` → "Input validation".

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
