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
  echo/print a real value.
- Applying real infrastructure changes (`terraform apply`) is a protected
  action requiring the user's explicit permission — expect it to be
  blocked by the harness until they grant it, and don't try to route
  around that block.

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
