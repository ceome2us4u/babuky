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
#   bash -c "SSH_KEY=<wsl path> bash scripts/deploy.sh <ip>"
# NOT a /mnt/c key path: files there are always 0777 and ssh ignores them.
# The key lives as a chmod-600 copy in WSL's ~/.ssh, which is the default,
# so normally no override at all: bash scripts/deploy.sh <ip>
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

# Fail in a second, not after the build: ssh silently ignores a key that's
# missing or group/world-accessible. Files on /mnt/c always report 0777, so
# under WSL the key must be a copy inside WSL's own ~/.ssh with chmod 600.
if [ ! -f "$SSH_KEY" ]; then
	echo "ERROR: SSH key not found at $SSH_KEY" >&2
	exit 2
fi
if [ "$(stat -c %a "$SSH_KEY")" != "600" ] && [ "$(stat -c %a "$SSH_KEY")" != "400" ]; then
	echo "ERROR: $SSH_KEY has mode $(stat -c %a "$SSH_KEY"); ssh will refuse it." >&2
	echo "  Under WSL, /mnt/c files are always 0777 - copy the key into ~/.ssh and chmod 600 it:" >&2
	echo "    mkdir -p ~/.ssh && cp /mnt/c/Users/<you>/.ssh/babuki-app-box ~/.ssh/ && chmod 600 ~/.ssh/babuki-app-box" >&2
	exit 2
fi

# --- non-secret config — EDIT THESE before a real deploy, or export
# overrides before calling this script. Every one has a safe fallback so
# the parts of the app that don't need it still work if left blank
# (Razorpay/MSG91-dependent routes report 503 "not configured" instead). --
# TEST / LIVE is ONE switch, APP_MODE=test|live, in the API's env on the box —
# it drives OTP (test = no SMS, fixed code) AND Razorpay (test = TEST keys)
# together, like Home's APP_MODE. It is flipped with scripts/set-app-mode.sh,
# not by editing this file, and a deploy preserves the current value. Set
# APP_MODE when calling this script only to force a value on deploy.
APP_MODE_OVERRIDE="${APP_MODE:-}"
case "$APP_MODE_OVERRIDE" in ""|test|live) ;; *) echo "APP_MODE must be 'test' or 'live'" >&2; exit 2 ;; esac
# LIVE Razorpay config. The publishable key id is NOT a secret (Razorpay hands
# it to the browser in Checkout); same account as Home, so same key id as
# Home's own deploy.sh; the matching SECRET is babuki/prod/razorpay-key-secret.
# The TEST set (key id/secret, webhook secret, plan id) lives entirely in
# Secrets Manager as babuki/prod/razorpay-*-test — nothing to edit here.
RAZORPAY_KEY_ID_LIVE="${RAZORPAY_KEY_ID_LIVE:-rzp_live_TVcJ60rbXf8yFR}"
# Track 1 (hyperlocal vendors) ₹500/mo early-bird plan — created in the
# Razorpay dashboard 2026-09-18 ("babuki subdomain - early bird"). Its
# amount is immutable on Razorpay's side, so pointing a subscription at
# this specific plan id IS the lifetime-lock mechanism (see
# apps/api/src/lib/razorpay.ts). A future ₹1,500/mo cohort gets a second,
# separate plan id — this one is never edited to change price.
RAZORPAY_VENDOR_PLAN_ID_LIVE="${RAZORPAY_VENDOR_PLAN_ID_LIVE:-plan_TdVzzDQoYIGSj0}"
MSG91_OTP_TEMPLATE_ID="${MSG91_OTP_TEMPLATE_ID:-}"
MSG91_SENDER_ID="${MSG91_SENDER_ID:-}"
BABUKI_S3_BUCKET="${BABUKI_S3_BUCKET:-babuki-item-images-551362153374}"
NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-https://api.babuki.com}"

echo "==> [1/7] build the standalone Next.js output (apps/api ships as source — no build step, tsx runs it directly)"
# NEXT_PUBLIC_* values are inlined into the client bundle at BUILD time —
# setting them in the box's .env afterwards does nothing. Confirmed by
# grepping a build made without them: the bundle contained the
# "http://localhost:8000" fallback, which would have shipped to production.
# Start from a clean .next so no stale (un-inlined) output can be reused.
rm -rf "$ROOT/apps/web/.next"
# Root cause of that first bad bundle (confirmed live 2026-09-18): under WSL
# there is no Linux node, so `npm` resolves to the WINDOWS npm via interop
# (/mnt/c/Program Files/nodejs/npm), and env vars set in this shell never
# reach a Windows process (WSLENV is empty). So passing them inline, as
# above, silently does nothing. A file is read by Next no matter which OS's
# node runs the build. `.env*.local` is gitignored; removed again right after.
BUILD_ENV_FILE="$ROOT/apps/web/.env.production.local"
trap 'rm -f "$BUILD_ENV_FILE"' EXIT
cat > "$BUILD_ENV_FILE" <<EOF
NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
EOF
(cd "$ROOT/apps/web" && npm install && npm run build)
rm -f "$BUILD_ENV_FILE"
# Verify rather than trust: a first deploy shipped a bundle that still had
# the http://localhost:8000 fallback even though this step ran. If the API
# URL isn't literally in the built client JS, stop before shipping it.
if ! grep -rqF "$NEXT_PUBLIC_API_URL" "$ROOT/apps/web/.next/static"; then
	echo "ERROR: $NEXT_PUBLIC_API_URL was not inlined into the client bundle - refusing to deploy a frontend that would call localhost." >&2
	exit 1
fi

echo "==> [2/7] ship both apps + nginx config to $HOST"
# /opt is root-owned by default — ubuntu can't mkdir there directly, and
# scp can't sudo the file transfer itself, so chown it to ubuntu once,
# up front, idempotent (harmless no-op on a re-deploy where it already
# exists and is already owned correctly).
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "sudo mkdir -p $REMOTE_DIR && sudo chown -R $SSH_USER:$SSH_USER $REMOTE_DIR"

# Wipe what's about to be replaced, then copy into the PARENT directory.
# `scp -r dir host:existing_dir` nests (existing_dir/dir) when the
# destination already exists, which would silently leave the old code
# running on any re-deploy. api/node_modules and api/.env are kept (the
# .env is rewritten in step 3 anyway).
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "rm -rf $REMOTE_DIR/api/src $REMOTE_DIR/api/db/migrations $REMOTE_DIR/web && mkdir -p $REMOTE_DIR/api/db $REMOTE_DIR/web/apps/web/.next"

# apps/api: source only (package.json + src + db) — the box runs its own
# npm install, no node_modules transferred over the wire.
scp -r "${SSH_OPTS[@]}" "$ROOT/apps/api/src" "$SSH_TARGET:$REMOTE_DIR/api/"
scp -r "${SSH_OPTS[@]}" "$ROOT/apps/api/db/migrations" "$SSH_TARGET:$REMOTE_DIR/api/db/"
scp "${SSH_OPTS[@]}" "$ROOT/apps/api/db/migrate.mjs" "$SSH_TARGET:$REMOTE_DIR/api/db/migrate.mjs"
scp "${SSH_OPTS[@]}" "$ROOT/apps/api/package.json" "$ROOT/apps/api/tsconfig.json" "$SSH_TARGET:$REMOTE_DIR/api/"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "cd $REMOTE_DIR/api && npm install --omit=dev"

# apps/web: standalone build output only. In this npm-workspaces monorepo
# Next nests it as standalone/apps/web/server.js (the tracing root is the
# repo root), so static/ and public/ belong under apps/web/ too — they're
# NOT part of the standalone folder and must be copied next to server.js.
scp -r "${SSH_OPTS[@]}" "$ROOT/apps/web/.next/standalone/." "$SSH_TARGET:$REMOTE_DIR/web/"
scp -r "${SSH_OPTS[@]}" "$ROOT/apps/web/.next/static" "$SSH_TARGET:$REMOTE_DIR/web/apps/web/.next/"
# public/ is optional in Next.js — copy it if present, don't fail the
# deploy if it's ever missing (confirmed live: it wasn't, once).
if [ -d "$ROOT/apps/web/public" ]; then
	scp -r "${SSH_OPTS[@]}" "$ROOT/apps/web/public" "$SSH_TARGET:$REMOTE_DIR/web/apps/web/"
fi

scp "${SSH_OPTS[@]}" "$ROOT/infra/nginx/babuki.conf" "$SSH_TARGET:/tmp/babuki.conf"
scp "${SSH_OPTS[@]}" "$ROOT/infra/pm2/ecosystem.config.js" "$SSH_TARGET:$REMOTE_DIR/ecosystem.config.js"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "sudo mv /tmp/babuki.conf /etc/nginx/sites-available/babuki.conf && sudo ln -sf /etc/nginx/sites-available/babuki.conf /etc/nginx/sites-enabled/babuki.conf && sudo rm -f /etc/nginx/sites-enabled/default"

echo "==> [3/7] assemble apps/api/.env + apps/web/.env on the box (Secrets Manager via instance role)"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" \
	REGION="$REGION" REMOTE_DIR="$REMOTE_DIR" \
	APP_MODE_OVERRIDE="$APP_MODE_OVERRIDE" \
	RAZORPAY_KEY_ID_LIVE="$RAZORPAY_KEY_ID_LIVE" RAZORPAY_VENDOR_PLAN_ID_LIVE="$RAZORPAY_VENDOR_PLAN_ID_LIVE" \
	MSG91_OTP_TEMPLATE_ID="$MSG91_OTP_TEMPLATE_ID" MSG91_SENDER_ID="$MSG91_SENDER_ID" \
	BABUKI_S3_BUCKET="$BABUKI_S3_BUCKET" NEXT_PUBLIC_API_URL="$NEXT_PUBLIC_API_URL" \
	'bash -s' <<'REMOTE'
set -euo pipefail
umask 077
sec() { aws secretsmanager get-secret-value --region "$REGION" --secret-id "$1" --query SecretString --output text; }
opt_sec() { sec "$1" 2>/dev/null || true; }

# APP_MODE (test|live) is an env property on the box, flipped with
# scripts/set-app-mode.sh — never by editing this script. A deploy PRESERVES
# it: an explicit APP_MODE override wins, else whatever is already on the box,
# else (first deploy) LIVE. Must be read BEFORE the `cat >` below truncates it.
CURRENT_MODE="$(grep -s '^APP_MODE=' "$REMOTE_DIR/api/.env" | tail -1 | cut -d= -f2 || true)"
case "${APP_MODE_OVERRIDE:-$CURRENT_MODE}" in test) APP_MODE=test ;; *) APP_MODE=live ;; esac

# Both credential sets side by side (Home's convention): the API picks
# <NAME>_LIVE or <NAME>_TEST by APP_MODE and fails closed if the active one is
# missing. TEST values live in Secrets Manager (empty/placeholder until set).
cat > "$REMOTE_DIR/api/.env" <<ENV
NODE_ENV=production
PORT=8000
AWS_REGION=$REGION
APP_MODE=$APP_MODE
DATABASE_URL=$(sec babuki/prod/db-url)
SESSION_SECRET=$(sec babuki/prod/session-secret)
MSG91_AUTH_KEY=$(opt_sec babuki/prod/msg91-auth-key)
MSG91_OTP_TEMPLATE_ID=$MSG91_OTP_TEMPLATE_ID
MSG91_SENDER_ID=$MSG91_SENDER_ID
RAZORPAY_KEY_ID_LIVE=$RAZORPAY_KEY_ID_LIVE
RAZORPAY_KEY_SECRET_LIVE=$(opt_sec babuki/prod/razorpay-key-secret)
RAZORPAY_WEBHOOK_SECRET_LIVE=$(opt_sec babuki/prod/razorpay-webhook-secret)
RAZORPAY_VENDOR_PLAN_ID_LIVE=$RAZORPAY_VENDOR_PLAN_ID_LIVE
RAZORPAY_KEY_ID_TEST=$(opt_sec babuki/prod/razorpay-key-id-test)
RAZORPAY_KEY_SECRET_TEST=$(opt_sec babuki/prod/razorpay-key-secret-test)
RAZORPAY_WEBHOOK_SECRET_TEST=$(opt_sec babuki/prod/razorpay-webhook-secret-test)
RAZORPAY_VENDOR_PLAN_ID_TEST=$(opt_sec babuki/prod/razorpay-vendor-plan-id-test)
BABUKI_S3_BUCKET=$BABUKI_S3_BUCKET
ENV

cat > "$REMOTE_DIR/web/apps/web/.env" <<ENV
NODE_ENV=production
PORT=3000
NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV

echo "  APP_MODE=$APP_MODE"

echo "  wrote $REMOTE_DIR/api/.env and $REMOTE_DIR/web/apps/web/.env"
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
# Boot hook: without this the site stays down after a reboot even though
# `pm2 save` recorded the process list. Idempotent; a failure here must not
# fail an otherwise-good deploy, so it only warns.
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" 'sudo env PATH="$PATH:/usr/bin" pm2 startup systemd -u ubuntu --hp /home/ubuntu >/dev/null' || echo "  WARN: pm2 startup hook not installed - site will not auto-start after a reboot"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "sudo nginx -t && sudo systemctl reload-or-restart nginx"

echo "==> [7/7] smoke test"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "curl -sf -o /dev/null -w 'local api :8000 -> %{http_code}\n' http://127.0.0.1:8000/health || echo '  FAILED: api not responding on :8000'"
ssh "${SSH_OPTS[@]}" "$SSH_TARGET" "curl -sf -o /dev/null -w 'local web :3000 -> %{http_code}\n' http://127.0.0.1:3000/ || echo '  FAILED: web not responding on :3000'"
curl -sf -o /dev/null -w "https://babuki.com -> %{http_code}\n" https://babuki.com/ || echo "  FAILED (or DNS not propagated yet): https://babuki.com"
curl -sf -o /dev/null -w "https://api.babuki.com/health -> %{http_code}\n" https://api.babuki.com/health || echo "  FAILED (or DNS not propagated yet): https://api.babuki.com/health"

echo "==> done."
