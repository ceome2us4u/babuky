#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# HTTPS for the "own web address" plan — runs as ROOT every minute from
# babuki-domain-certs.timer (installed by scripts/deploy.sh as
# /usr/local/bin/babuki-domain-certs).
#
# The API owns the list of domains (apps/api/src/routes/internal.ts, reachable
# only from this box). For each line "<domain> <slug> <issue|serve>":
#   issue -> get a Let's Encrypt cert by HTTP-01 (webroot /var/www/acme, served
#            by the catch-all port-80 block in infra/nginx/babuki.conf), write
#            the domain's Nginx server block, tell the API (cert-ok / cert-failed)
#   serve -> make sure its server block exists
# Server blocks for domains no longer listed are removed. Nginx is reloaded
# only after `nginx -t` passes. The API itself never runs as root.
#
# Each block proxies to the web app with Host: <slug>.babuki.com, so the
# existing slug.babuki.com -> /store/<slug> rewrite (apps/web/next.config.mjs)
# serves the page unchanged. Cert renewal is certbot's own timer (the
# --deploy-hook reloads Nginx).
# ---------------------------------------------------------------------------
set -uo pipefail

API=http://127.0.0.1:8000/internal/domains
CONF_DIR=/etc/nginx/babuki-domains
WEBROOT=/var/www/acme
EMAIL=ceo@me2us4u.com
ROOT_DOMAIN=babuki.com

mkdir -p "$CONF_DIR" "$WEBROOT"

# API down (deploy/restart) -> try again next minute; never touch configs blind.
LIST="$(curl -fsS --max-time 10 "$API/certs")" || exit 0

DOMAIN_RE='^[a-z0-9-]+(\.[a-z0-9-]+){1,3}$'
SLUG_RE='^[a-z0-9-]{3,24}$'
changed=0
declare -A keep=()

write_conf() { # domain slug -> writes the server block if it differs
	local d="$1" s="$2" f="$CONF_DIR/$1.conf" tmp
	tmp="$(mktemp)"
	cat >"$tmp" <<CONF
# Written by babuki-domain-certs — do not edit; regenerated every minute.
server {
    listen 443 ssl http2;
    listen [::]:443 ssl http2;
    server_name $d www.$d;

    ssl_certificate     /etc/letsencrypt/live/$d/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/$d/privkey.pem;
    ssl_protocols TLSv1.2 TLSv1.3;

    client_max_body_size 10m;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $s.$ROOT_DOMAIN;
        proxy_set_header X-Forwarded-Host $d;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto https;
    }
}
CONF
	if ! cmp -s "$tmp" "$f"; then
		install -m 644 "$tmp" "$f"
		changed=1
	fi
	rm -f "$tmp"
}

report() { # ok|failed domain [reason]
	local args=(--data-urlencode "domain=$2")
	[ -n "${3:-}" ] && args+=(--data-urlencode "reason=$3")
	curl -fsS --max-time 10 -G -X POST "${args[@]}" "$API/cert-$1" >/dev/null || true
}

while read -r domain slug action; do
	[ -n "${domain:-}" ] || continue
	if ! [[ "$domain" =~ $DOMAIN_RE && "$slug" =~ $SLUG_RE ]]; then
		echo "skipping malformed line: $domain $slug" >&2
		continue
	fi
	keep["$domain"]=1

	if [ "$action" = issue ]; then
		log="$(mktemp)"
		if certbot certonly --non-interactive --agree-tos -m "$EMAIL" --keep-until-expiring \
			--webroot -w "$WEBROOT" --cert-name "$domain" -d "$domain" -d "www.$domain" \
			--deploy-hook "systemctl reload nginx" >"$log" 2>&1; then
			write_conf "$domain" "$slug"
			report ok "$domain"
			echo "issued: $domain"
		else
			reason="$(grep -iE 'detail|error|problem' "$log" | tail -n 2 | tr '\n' ' ' | cut -c1-250)"
			report failed "$domain" "${reason:-certbot failed}"
			echo "cert failed: $domain — ${reason:-see certbot log}" >&2
		fi
		rm -f "$log"
	elif [ -f "/etc/letsencrypt/live/$domain/fullchain.pem" ]; then
		write_conf "$domain" "$slug"
	fi
done <<<"$LIST"

# Domains that are no longer served (released, deleted) lose their block.
for f in "$CONF_DIR"/*.conf; do
	[ -e "$f" ] || continue
	d="$(basename "$f" .conf)"
	if [ -z "${keep[$d]:-}" ]; then
		rm -f "$f"
		changed=1
		echo "removed: $d"
	fi
done

if [ "$changed" = 1 ]; then
	if nginx -t >/dev/null 2>&1; then
		systemctl reload nginx
	else
		echo "nginx -t failed after writing domain configs — not reloading" >&2
		nginx -t >&2 || true
		exit 1
	fi
fi
