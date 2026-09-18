#!/usr/bin/env bash
# One-time catch-up for the first Babuki instance, whose user_data aborted
# partway through (the `awscli` apt package doesn't exist on Ubuntu 24.04 —
# fixed in infra/terraform/templates/user_data.sh.tpl for any future
# instance, but Terraform's ignore_changes on user_data/ami means it won't
# re-run on this already-booted box). Replays everything after the break
# point. Safe to re-run — every step is idempotent.
set -eux

export DEBIAN_FRONTEND=noninteractive
sudo apt-get install -y \
  postgresql postgresql-contrib postgresql-16-postgis-3 \
  nginx certbot python3-certbot-dns-route53 \
  curl unzip ca-certificates gnupg

if ! command -v aws >/dev/null; then
  curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
  unzip -q /tmp/awscliv2.zip -d /tmp
  sudo /tmp/aws/install
  rm -rf /tmp/awscliv2.zip /tmp/aws
fi

if ! command -v node >/dev/null; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | sudo bash -
  sudo apt-get install -y nodejs
fi
sudo npm install -g pm2

# xtrace off around the password: `set -x` would print it to the terminal/logs.
set +x
DB_PASSWORD="$(aws secretsmanager get-secret-value --region ap-south-1 --secret-id babuki/prod/db-password --query SecretString --output text)"

sudo -u postgres psql -v ON_ERROR_STOP=1 <<SQL
DO \$\$
BEGIN
  IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'babuki') THEN
    CREATE ROLE babuki LOGIN PASSWORD '$DB_PASSWORD';
  ELSE
    ALTER ROLE babuki WITH PASSWORD '$DB_PASSWORD';
  END IF;
END
\$\$;
SQL
set -x

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = 'babuki'" | grep -q 1 \
  || sudo -u postgres createdb babuki --owner=babuki

# CREATE EXTENSION requires superuser — babuki isn't one, so this has to
# run as postgres, once, before migrations. Then migration 0002's own
# CREATE EXTENSION IF NOT EXISTS just no-ops for babuki (already exists).
sudo -u postgres psql -d babuki -c "CREATE EXTENSION IF NOT EXISTS postgis;"

# nginx is only enabled here, not restarted: an earlier deploy attempt may
# already have installed babuki.conf, which references a TLS cert that
# doesn't exist until deploy.sh step 5 — so nginx can't start yet. Step 6
# of deploy.sh starts it once the cert is in place.
sudo systemctl enable postgresql nginx
sudo systemctl restart postgresql

echo "catch-up complete"
