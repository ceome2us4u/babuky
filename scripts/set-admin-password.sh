#!/usr/bin/env bash
# Set (or reset) the password for the admin console at https://babuki.com/admin.
# You type the password here; it goes to the box over SSH on stdin, is hashed
# there, and only the hash is stored — it never appears in a command line, a
# log or a chat. Run it from WSL bash, like deploy.sh:
#
#   bash scripts/set-admin-password.sh 13.204.187.141 [email]
#
# The email must be listed in ADMIN_EMAILS (default ceo@me2us4u.com, set by
# scripts/deploy.sh). Run it again any time to reset a forgotten password.
set -euo pipefail

HOST="${1:-${EC2_HOST:-}}"
EMAIL="${2:-ceo@me2us4u.com}"
if [ -z "$HOST" ]; then
	echo "usage: $0 <elastic-ip> [admin-email]   (or set EC2_HOST)" >&2
	exit 2
fi
[[ "$EMAIL" =~ ^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$ ]] || { echo "ERROR: '$EMAIL' doesn't look like an email" >&2; exit 2; }

SSH_USER="${SSH_USER:-ubuntu}"
SSH_KEY="${SSH_KEY:-$HOME/.ssh/babuki-app-box}"
[ -f "$SSH_KEY" ] || { echo "ERROR: SSH key not found at $SSH_KEY" >&2; exit 2; }
if [ "$(stat -c %a "$SSH_KEY")" != "600" ] && [ "$(stat -c %a "$SSH_KEY")" != "400" ]; then
	echo "ERROR: $SSH_KEY has mode $(stat -c %a "$SSH_KEY"); ssh will refuse it (see deploy.sh's note)." >&2
	exit 2
fi

echo "Setting the admin password for $EMAIL on $HOST (at least 12 characters)."
read -rs -p "New password: " PW; echo
read -rs -p "Repeat it:    " PW2; echo
[ "$PW" = "$PW2" ] || { echo "ERROR: the two passwords don't match" >&2; exit 1; }

# Password on stdin only (printf is a shell builtin, so it isn't in any process list).
printf '%s' "$PW" | ssh -i "$SSH_KEY" -o StrictHostKeyChecking=accept-new "$SSH_USER@$HOST" \
	"cd /opt/babuki/api && set -a && . ./.env && set +a && npx tsx src/scripts/set-admin-password.ts '$EMAIL'"
