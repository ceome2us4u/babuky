# Babuki — infrastructure & deployment

Everything here is Terraform-managed and scripted — not manual steps to
follow by hand. Two pieces:

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

```bash
# One-time, before the first apply: generate Babuki's own dedicated SSH key
# (never Home's me2us4u-app-box key)
ssh-keygen -t ed25519 -f ~/.ssh/babuki-app-box -N "" -C babuki-app-box-deploy

cd infra/terraform
AWS_PROFILE=senthilkumar terraform init
AWS_PROFILE=senthilkumar terraform plan -out=tfplan
AWS_PROFILE=senthilkumar terraform apply tfplan
```

`terraform output app_box_public_ip` gives the Elastic IP `scripts/deploy.sh`
targets.

## 2. Deploying a build (`scripts/deploy.sh`)

Run from your own machine (or here) after `terraform apply` — builds the
Next.js app, ships it + the Nginx config to the box over SSH, assembles
`apps/web/.env` **on the box** by pulling secrets from Secrets Manager via
its own instance role (no secret ever touches this machine), runs DB
migrations, issues/renews the wildcard TLS cert (DNS-01, idempotent), and
(re)starts the app under PM2.

```bash
scripts/deploy.sh "$(cd infra/terraform && AWS_PROFILE=senthilkumar terraform output -raw app_box_public_ip)"
```

Non-secret config (Razorpay's publishable key id, the vendor plan id,
MSG91's template id) are plain values inside `scripts/deploy.sh` itself —
edit them there, or export overrides before calling it. Same convention
Home's `scripts/deploy.sh` uses for its own non-secret Razorpay/MSG91 ids.

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
