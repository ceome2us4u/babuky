#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Deploy Babuki's app box (infra/terraform/ec2.tf) — two services under PM2,
# mirroring Home's separate-service shape: apps/api (Hono, api.babuki.com)
# and apps/web (Next.js, babuki.com + *.babuki.com), behind one Nginx, with
# a Let's Encrypt wildcard cert covering both (*.babuki.com covers the
# single-label api.babuki.com too).
#
#   scripts/deploy.sh <elastic-ip>        # or: EC2_HOST=<ip> scripts/deploy.sh
#
# What it does (idempotent — safe to re-run):
#   1. install deps for both apps locally; build the Next.js standalone output
#   2. scp both apps + nginx config to the box
#   3. assemble apps/api/.env and apps/web/.env on the box, pulling secrets
#      from Secrets Manager via the instance role — no secret value ever
#      touches this machine (non-secret config — Razorpay key id, MSG91
#      template id — is set below as plain values, same convention as
#      Home's deploy.sh)
#   4. run DB migrations (apps/api owns the schema)
#   5. issue/renew the wildcard TLS cert (DNS-01 via the instance's scoped
#      Route 53 permission) — skipped if already valid
#   6. pm2 (re)start both apps under infra/pm2/ecosystem.config.js, reload nginx
#   7. smoke-test both services
#
# Prereqs on THIS machine: aws CLI with $AWS_PROFILE set (senthilkumar),
# and ssh to the box using Babuki's OWN dedicated key
# (~/.ssh/babuki-app-box — never Home's me2us4u-app-box key).
#
# On the owner's machine specifically: `bash` resolves to WSL2 (confirmed
# live 2026-09-18 — `uname -a` shows microsoft-standard-WSL2), a genuinely
# separate Linux environment from the PowerShell prompt this is usually
# launched from. Two consequences, both already bitten once:
#   - PowerShell's `$env:VAR = "value"` does NOT reach this script — it
#     silently falls back to this script's own defaults (e.g. $HOME below)
#     instead of erroring, which looks like a bug here but isn't one.
#   - $HOME/paths need the WSL mount form (/mnt/c/Users/<you>/...), not
#     Git Bash's (/c/Users/<you>/...) — same file, different path.
# Reliable fix from a PowerShell prompt: set overrides *inside* the same
# `bash -c "..."` call so nothing crosses the PowerShell<->WSL boundary:
#   bash -c "SSH_KEY=/mnt/c/Users/<you>/.ssh/babuki-app-box bash scripts/deploy.sh <ip>"
# See CLAUDE.md's shell-environment section for the full story.
# ---------------------------------------------------------------------------
set -euo pipefail

HOST="${1:-${EC2_HOST:-}}"
if [ -z "$HOST" ]; then
	echo "usage: $0 <elastic-ip>   (or set EC2_HOST)" >&2
	exit 2
fi

SSH_USER="${SSH_USER:-ubuntu}"
REGION="${AWS_REGION:-ap-south-1}"
REMOTE_DIR=/opt/babuki
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SSH_TARGET="$SSH_USER@$HOST"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/babuki-app-box}"
SSH_OPTS=(-i "$SSH_KEY" -o StrictHostKeyChecking=accept-new)

# --- non-secret config — EDIT THESE before a real deploy, or export
# overrides before calling this script. Every one has a safe fallback so
# the parts of the app that don't need it still work if left blank
# (Razorpay/MSG91-dependent routes report 503 "not configured" instead). --
RAZORPAY_KEY_ID="${RAZORPAY_KEY_ID:-}"
NEXT_PUBLIC_RAZORPAY_KEY_ID="${NEXT_PUBLIC_RAZORPAY_KEY_ID:-$RAZORPAY_KEY_ID}"
# Track 1 (hyperlocal vendors) ₹500/mo early-bird plan — created in the
# Razorpay dashboard 2026-09-18 ("babuki subdomain - early bird"). Its
# amount is immutable on Razorpay's side, so pointing a subscription at
# this specific plan id IS the lifetime-lock mechanism (see
# apps/api/src/lib/razorpay.ts). A future ₹1,500/mo cohort gets a second,
# separate plan id — this one is never edited to change price.
RAZORPAY_VENDOR_PLAN_ID="${RAZORPAY_VENDOR_PLAN_ID:-plan_TdVzzDQoYIGSj0}"
MSG91_OTP_TEMPLATE_ID="${MSG91_OTP_TEMPLATE_ID:-}"
MSG91_SENDER_ID="${MSG91_SENDER_ID:-}"
BABUKI_S3_BUCKET="${BABUKI_S3_BUCKET:-babuki-item-images-551362153374}"
NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-https://api.babuki.com}"

echo "==> [1/7] build the standalone Next.js output (apps/api ships as source — no build step, tsx runs it directly)"
(cd "$ROOT/apps/web" && npm install && npm run build)

echo "==> [2/7] ship both apps + nginx config to $HOST"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "mkdir -p $REMOTE_DIR/api/db $REMOTE_DIR/web/.next"

# apps/api: source only (package.json + src + db) — the box runs its own
# npm install, no node_modules transferred over the wire.
scp -r "${SSH_OPTS[@]}" "$ROOT/apps/api/src" "$SSH_TARGET:$REMOTE_DIR/api/src"
scp -r "${SSH_OPTS[@]}" "$ROOT/apps/api/db/migrations" "$SSH_TARGET:$REMOTE_DIR/api/db/migrations"
scp "${SSH_OPTS[@]}" "$ROOT/apps/api/db/migrate.mjs" "$SSH_TARGET:$REMOTE_DIR/api/db/migrate.mjs"
scp "${SSH_OPTS[@]}" "$ROOT/apps/api/package.json" "$ROOT/apps/api/tsconfig.json" "$SSH_TARGET:$REMOTE_DIR/api/"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "cd $REMOTE_DIR/api && npm install --omit=dev"

# apps/web: standalone build output only
scp -r "${SSH_OPTS[@]}" "$ROOT/apps/web/.next/standalone/." "$SSH_TARGET:$REMOTE_DIR/web/"
scp -r "${SSH_OPTS[@]}" "$ROOT/apps/web/.next/static" "$SSH_TARGET:$REMOTE_DIR/web/.next/static"
scp -r "${SSH_OPTS[@]}" "$ROOT/apps/web/public" "$SSH_TARGET:$REMOTE_DIR/web/public"

scp "${SSH_OPTS[@]}" "$ROOT/infra/nginx/babuki.conf" "$SSH_TARGET:/tmp/babuki.conf"
scp "${SSH_OPTS[@]}" "$ROOT/infra/pm2/ecosystem.config.js" "$SSH_TARGET:$REMOTE_DIR/ecosystem.config.js"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "sudo mv /tmp/babuki.conf /etc/nginx/sites-available/babuki.conf && sudo ln -sf /etc/nginx/sites-available/babuki.conf /etc/nginx/sites-enabled/babuki.conf && sudo rm -f /etc/nginx/sites-enabled/default"

echo "==> [3/7] assemble apps/api/.env + apps/web/.env on the box (Secrets Manager via instance role)"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" \
	REGION="$REGION" REMOTE_DIR="$REMOTE_DIR" \
	RAZORPAY_KEY_ID="$RAZORPAY_KEY_ID" NEXT_PUBLIC_RAZORPAY_KEY_ID="$NEXT_PUBLIC_RAZORPAY_KEY_ID" \
	RAZORPAY_VENDOR_PLAN_ID="$RAZORPAY_VENDOR_PLAN_ID" \
	MSG91_OTP_TEMPLATE_ID="$MSG91_OTP_TEMPLATE_ID" MSG91_SENDER_ID="$MSG91_SENDER_ID" \
	BABUKI_S3_BUCKET="$BABUKI_S3_BUCKET" NEXT_PUBLIC_API_URL="$NEXT_PUBLIC_API_URL" \
	'bash -s' <<'REMOTE'
set -euo pipefail
umask 077
sec() { aws secretsmanager get-secret-value --region "$REGION" --secret-id "$1" --query SecretString --output text; }
opt_sec() { sec "$1" 2>/dev/null || true; }

cat > "$REMOTE_DIR/api/.env" <<ENV
NODE_ENV=production
PORT=8000
AWS_REGION=$REGION
DATABASE_URL=$(sec babuki/prod/db-url)
SESSION_SECRET=$(sec babuki/prod/session-secret)
MSG91_AUTH_KEY=$(opt_sec babuki/prod/msg91-auth-key)
MSG91_OTP_TEMPLATE_ID=$MSG91_OTP_TEMPLATE_ID
MSG91_SENDER_ID=$MSG91_SENDER_ID
RAZORPAY_KEY_ID=$RAZORPAY_KEY_ID
RAZORPAY_KEY_SECRET=$(opt_sec babuki/prod/razorpay-key-secret)
RAZORPAY_WEBHOOK_SECRET=$(opt_sec babuki/prod/razorpay-webhook-secret)
RAZORPAY_VENDOR_PLAN_ID=$RAZORPAY_VENDOR_PLAN_ID
BABUKI_S3_BUCKET=$BABUKI_S3_BUCKET
ENV

cat > "$REMOTE_DIR/web/.env" <<ENV
NODE_ENV=production
PORT=3000
NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
NEXT_PUBLIC_RAZORPAY_KEY_ID=$NEXT_PUBLIC_RAZORPAY_KEY_ID
ENV

echo "  wrote $REMOTE_DIR/{api,web}/.env"
REMOTE

echo "==> [4/7] run DB migrations"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "cd $REMOTE_DIR/api/db && set -a && source $REMOTE_DIR/api/.env && set +a && node migrate.mjs"

echo "==> [5/7] wildcard TLS cert (DNS-01 via Route 53, skips if already valid)"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" REGION="$REGION" 'bash -s' <<'REMOTE'
set -euo pipefail
if sudo certbot certificates --cert-name babuki.com 2>/dev/null | grep -q VALID; then
	echo "  cert already valid, skipping issuance"
else
	sudo certbot certonly --non-interactive --agree-tos -m ceo@me2us4u.com \
		--dns-route53 -d babuki.com -d '*.babuki.com'
fi
REMOTE

echo "==> [6/7] pm2 (re)start both apps, reload nginx"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "cd $REMOTE_DIR && pm2 startOrRestart ecosystem.config.js --update-env && pm2 save"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "sudo nginx -t && sudo systemctl reload nginx"

echo "==> [7/7] smoke test"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "curl -sf -o /dev/null -w 'local api :8000 -> %{http_code}\n' http://127.0.0.1:8000/health || echo '  FAILED: api not responding on :8000'"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "curl -sf -o /dev/null -w 'local web :3000 -> %{http_code}\n' http://127.0.0.1:3000/ || echo '  FAILED: web not responding on :3000'"
curl -sf -o /dev/null -w "https://babuki.com -> %{http_code}\n" https://babuki.com/ || echo "  FAILED (or DNS not propagated yet): https://babuki.com"
curl -sf -o /dev/null -w "https://api.babuki.com/health -> %{http_code}\n" https://api.babuki.com/health || echo "  FAILED (or DNS not propagated yet): https://api.babuki.com/health"

echo "==> done."
