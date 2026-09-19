#!/usr/bin/env bash
# Flip Babuki between TEST and LIVE — ONE switch for everything (OTP, Razorpay,
# ...), the same idea as Home's infra/scripts/set-app-mode.py.
#
#   bash scripts/set-app-mode.sh test <elastic-ip>   # TEST: no SMS is sent, the
#                                                    #  fixed code 12345 signs in ANY
#                                                    #  number; Razorpay uses TEST keys
#   bash scripts/set-app-mode.sh live <elastic-ip>   # LIVE: real MSG91 SMS + LIVE keys
#
# It edits APP_MODE in the API's env on the box (/opt/babuki/api/.env),
# restarts the API, and prints /health so you see the mode that is actually
# running. No code change, no PR, no redeploy — and `scripts/deploy.sh`
# preserves whatever is set here, so a normal deploy never flips it.
#
# Run it the same way as deploy.sh (WSL bash; the SSH key is the chmod-600
# copy in WSL's ~/.ssh — see CLAUDE.md's shell section):
#   bash scripts/set-app-mode.sh test 13.204.187.141
set -euo pipefail

MODE="${1:-}"
HOST="${2:-${EC2_HOST:-}}"
if { [ "$MODE" != "test" ] && [ "$MODE" != "live" ]; } || [ -z "$HOST" ]; then
	echo "usage: $0 <test|live> <elastic-ip>   (or set EC2_HOST)" >&2
	exit 2
fi

SSH_USER="${SSH_USER:-ubuntu}"
REMOTE_DIR=/opt/babuki
SSH_KEY="${SSH_KEY:-$HOME/.ssh/babuki-app-box}"
if [ ! -f "$SSH_KEY" ]; then
	echo "ERROR: SSH key not found at $SSH_KEY" >&2
	exit 2
fi
if [ "$(stat -c %a "$SSH_KEY")" != "600" ] && [ "$(stat -c %a "$SSH_KEY")" != "400" ]; then
	echo "ERROR: $SSH_KEY has mode $(stat -c %a "$SSH_KEY"); ssh will refuse it (see deploy.sh's note)." >&2
	exit 2
fi
SSH_OPTS=(-i "$SSH_KEY" -o StrictHostKeyChecking=accept-new)

echo "==> setting APP_MODE=$MODE on $HOST"
HEALTH="$(ssh "${SSH_OPTS[@]}" "$SSH_USER@$HOST" MODE="$MODE" REMOTE_DIR="$REMOTE_DIR" 'bash -s' <<'REMOTE'
set -euo pipefail
ENVF="$REMOTE_DIR/api/.env"
[ -f "$ENVF" ] || { echo "no $ENVF - run scripts/deploy.sh first" >&2; exit 1; }
if grep -q '^APP_MODE=' "$ENVF"; then
	sed -i "s/^APP_MODE=.*/APP_MODE=$MODE/" "$ENVF"
else
	echo "APP_MODE=$MODE" >> "$ENVF"
fi
pm2 restart babuki-api --update-env >/dev/null
for _ in 1 2 3 4 5 6 7 8 9 10; do
	sleep 1
	if out="$(curl -fsS http://127.0.0.1:8000/health 2>/dev/null)"; then echo "$out"; exit 0; fi
done
echo "API did not come back healthy after restart" >&2
exit 1
REMOTE
)"
echo "  /health -> $HEALTH"

case "$HEALTH" in
	*"\"mode\":\"$MODE\""*) echo "==> confirmed: the API is running in $MODE mode" ;;
	*) echo "ERROR: /health does not report mode=$MODE" >&2; exit 1 ;;
esac

if [ "$MODE" = "test" ]; then
	echo
	echo "  TEST MODE: no SMS is sent, the code 12345 signs in ANY phone number (anyone can"
	echo "  sign in as anyone), and Razorpay uses the TEST keys - payments fail closed until"
	echo "  babuki/prod/razorpay-*-test are set in Secrets Manager. Flip back with:"
	echo "    bash scripts/set-app-mode.sh live $HOST"
fi
