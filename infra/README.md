# Babuki — infrastructure & deployment

Everything here is Terraform-managed and scripted — not manual steps to
follow by hand. Two pieces:

> **Shell note**: on the owner's machine, typing `bash ...` at a
> `PS C:\...>` prompt runs **WSL2**, a separate Linux environment —
> confirm with `bash -c "echo HOME=\$HOME; uname -a"` if unsure. PowerShell's
> `$env:VAR = "value"` does **not** reach it, and it needs `/mnt/c/...`
> paths, not `/c/...`. The commands below that mix an env var with a
> `bash` call set the var *inside* the same `bash -c "..."` invocation for
> exactly this reason — see `CLAUDE.md`'s shell-environment section for
> the full story and how it was found.

## 1. Provisioning (`infra/terraform/`)

Creates, in Babuki's own VPC (never Home's, never any resource named
`me2us4u-*`): the EC2 instance (Postgres+PostGIS installed at first boot
via `user_data`, Node/Nginx/Certbot/PM2 too), its security group, IAM role
(scoped to Secrets Manager `babuki/*`, the one S3 bucket, and Route 53
`ChangeResourceRecordSets` on just the `babuki.com` zone), the S3 bucket
for item photos, the `*.babuki.com` + apex wildcard DNS record, and the
Secrets Manager entries (`babuki/prod/db-url` and `session-secret` are
generated automatically; `msg91-auth-key`/`razorpay-key-secret`/
`razorpay-webhook-secret` start empty — fill those in via the AWS console
or CLI once you have them, `deploy.sh` degrades gracefully to "not
configured" for whichever are still blank).

Uses the same AWS account as Home (551362153374, `senthilkumar` profile)
— that's fine, it's your account either way — but every resource is new
and separate. State lives in its own bucket, `babuki-tfstate-551362153374`
(not Home's `me2us4u-tfstate-*`).

```powershell
# One-time, before the first apply: generate Babuki's own dedicated SSH key
# (never Home's me2us4u-app-box key). Runs fine directly in PowerShell —
# this is native Windows OpenSSH, not WSL/bash.
ssh-keygen -t ed25519 -f "$env:USERPROFILE\.ssh\babuki-app-box" -N "" -C babuki-app-box-deploy

# terraform itself runs fine directly in PowerShell too (it's a native exe,
# not a bash script) — $env: works normally here, no WSL boundary involved.
cd infra/terraform
$env:AWS_PROFILE = "senthilkumar"
terraform init
terraform plan -out=tfplan
terraform apply tfplan
```

`terraform output app_box_public_ip` gives the Elastic IP `scripts/deploy.sh`
targets.

## 2. Deploying a build (`scripts/deploy.sh`)

Run from your own machine (or here) after `terraform apply` — builds the
Next.js frontend, ships `apps/api`'s source (the box runs its own `npm
install`) + the Nginx config to the box over SSH, assembles
`apps/api/.env` and `apps/web/.env` **on the box** by pulling secrets from
Secrets Manager via its own instance role (no secret ever touches this
machine), runs DB migrations, issues/renews the wildcard TLS cert (DNS-01,
idempotent — `*.babuki.com` also covers `api.babuki.com`), and (re)starts
both `babuki-api` (:8000) and `babuki-web` (:3000) under PM2.

`scripts/deploy.sh` is a bash script, so it runs under WSL on this
machine — get the IP from `terraform output` (PowerShell, above) and pass
it in explicitly rather than trying to chain the two across the
PowerShell↔WSL boundary in one line:

```powershell
terraform output -raw app_box_public_ip   # from infra/terraform — copy the IP it prints
cd ..\..
bash scripts/deploy.sh <the-ip>
```

If it needs an override, set it *inside* the same `bash -c "..."` call —
see the shell note at the top of this file. Do **not** point `SSH_KEY` at a
`/mnt/c/...` path: files on the Windows mount are always mode 0777 and ssh
ignores the key. Use the `chmod 600` copy in WSL's `~/.ssh` (the default),
so normally no override is needed.

Non-secret config (Razorpay's publishable key id, the vendor plan id,
MSG91's template id) are plain values inside `scripts/deploy.sh` itself —
edit them there, or set overrides the same `bash -c "VAR=... bash ..."` way
shown above. Same convention Home's `scripts/deploy.sh` uses for its own
non-secret Razorpay/MSG91 ids.

## Not set up yet: automated CI/CD

Home avoids GitHub-hosted Actions minutes entirely by running its
`ci`/`images` workflows on a CodeBuild-hosted runner instead (see its
`.github/workflows/{ci,images}.yml`). Wiring the same pattern up for Babuki
needs one thing that genuinely can't be scripted: a one-time GitHub App
OAuth connection, created by hand in the AWS Console (CodeBuild → Developer
Tools → Connections → Create connection → GitHub App, authorizing it against
`ceome2us4u/babuky`) under the account owner's own GitHub login. Everything
else (the CodeBuild project, its IAM role, the GitHub OIDC deploy role) is
Terraform-able once that one click is done — not part of this pass, since
today's actual deploy runs directly from this session via `scripts/deploy.sh`
and doesn't need it.
