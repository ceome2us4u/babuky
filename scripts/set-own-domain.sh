#!/usr/bin/env bash
# Turn the ₹1,500 "own web address" plan on or off for EVERYONE — one switch,
# like set-app-mode.sh. No code change, no PR, no redeploy:
#
#   bash scripts/set-own-domain.sh on  <elastic-ip>   # merchants see both plans
#   bash scripts/set-own-domain.sh off <elastic-ip>   # exactly the ₹500 subdomain flow
#
# OFF stops new sales only. Shops already paying for their own address keep it,
# their domains keep renewing, and payments already taken are still processed.
#
# The plan's domain settings live in the same place and are changed the same way:
#   bash scripts/set-own-domain.sh set DOMAIN_PRICE_CAP_USD 14 <elastic-ip>
#   bash scripts/set-own-domain.sh set DOMAIN_TLDS_OFFERED .com,.in,.co.in,.net,.org <elastic-ip>
#   bash scripts/set-own-domain.sh set DOMAIN_TLDS_ON_REQUEST .shop,.online,.io <elastic-ip>
#   bash scripts/set-own-domain.sh set DOMAIN_IN_LIMIT 90 <elastic-ip>
#
# It edits /opt/babuki/api/.env on the box, restarts the API and checks /health.
# scripts/deploy.sh keeps whatever is set here. Run it like deploy.sh (WSL bash,
# the chmod-600 key in WSL's ~/.ssh — see CLAUDE.md's shell section).
set -euo pipefail

usage() {
	echo "usage: $0 on|off <elastic-ip>" >&2
	echo "       $0 set <DOMAIN_PRICE_CAP_USD|DOMAIN_TLDS_OFFERED|DOMAIN_TLDS_ON_REQUEST|DOMAIN_IN_LIMIT> <value> <elastic-ip>" >&2
	exit 2
}

case "${1:-}" in
	on|off) KEY=FEATURE_OWN_DOMAIN; VALUE="$1"; HOST="${2:-${EC2_HOST:-}}" ;;
	set) KEY="${2:-}"; VALUE="${3:-}"; HOST="${4:-${EC2_HOST:-}}" ;;
	*) usage ;;
esac
[ -n "$HOST" ] || usage
case "$KEY" in
	FEATURE_OWN_DOMAIN) ;;
	DOMAIN_PRICE_CAP_USD) [[ "$VALUE" =~ ^[0-9]{1,3}(\.[0-9]{1,2})?$ ]] || { echo "price cap: a dollar amount like 14" >&2; exit 2; } ;;
	DOMAIN_IN_LIMIT) [[ "$VALUE" =~ ^[0-9]{1,4}$ ]] || { echo "limit: a whole number" >&2; exit 2; } ;;
	DOMAIN_TLDS_OFFERED|DOMAIN_TLDS_ON_REQUEST)
		[[ "$VALUE" =~ ^(\.[a-z]{2,24}(\.[a-z]{2,24})?)(,\.[a-z]{2,24}(\.[a-z]{2,24})?)*$ ]] || { echo "endings: a list like .com,.in,.co.in" >&2; exit 2; } ;;
	*) usage ;;
esac

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

echo "==> setting $KEY=$VALUE on $HOST"
HEALTH="$(ssh "${SSH_OPTS[@]}" "$SSH_USER@$HOST" KEY="$KEY" VALUE="$VALUE" REMOTE_DIR="$REMOTE_DIR" 'bash -s' <<'REMOTE'
set -euo pipefail
ENVF="$REMOTE_DIR/api/.env"
[ -f "$ENVF" ] || { echo "no $ENVF - run scripts/deploy.sh first" >&2; exit 1; }
if grep -q "^$KEY=" "$ENVF"; then
	# | as the sed delimiter: values contain dots and commas, never |.
	sed -i "s|^$KEY=.*|$KEY=$VALUE|" "$ENVF"
else
	echo "$KEY=$VALUE" >> "$ENVF"
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

if [ "$KEY" = FEATURE_OWN_DOMAIN ]; then
	want=false; [ "$VALUE" = on ] && want=true
	case "$HEALTH" in
		*"\"ownDomain\":$want"*) echo "==> confirmed: own web address plan is $VALUE for everyone" ;;
		*) echo "ERROR: /health does not report ownDomain=$want" >&2; exit 1 ;;
	esac
fi
