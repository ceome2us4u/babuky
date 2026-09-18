#!/usr/bin/env bash
# One-time base-image setup ONLY (Postgres+PostGIS, Node, Nginx, Certbot,
# PM2, AWS CLI) — the actual app deploy (build, migrate, pm2 start) is
# scripts/deploy.sh's job, run over SSH after boot, same principle Home
# uses: keeping this out of user_data means a redeploy never needs an
# instance replacement.
set -eux
exec > >(tee -a /var/log/babuki-user-data.log) 2>&1

export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y

apt-get install -y \
  postgresql postgresql-contrib postgresql-16-postgis-3 \
  nginx certbot python3-certbot-dns-route53 \
  curl unzip ca-certificates gnupg

# AWS CLI v2 — Ubuntu dropped the `awscli` apt package (confirmed live on
# 24.04: "Package 'awscli' has no installation candidate"); install via
# AWS's own bundled installer instead, the officially documented method.
curl -fsSL "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o /tmp/awscliv2.zip
unzip -q /tmp/awscliv2.zip -d /tmp
/tmp/aws/install
rm -rf /tmp/awscliv2.zip /tmp/aws

# Node.js 20.x
curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs
npm install -g pm2

# --- Postgres: role + db, password pulled from Secrets Manager via this
# instance's own IAM role (never passed as a literal here) -----------------
DB_PASSWORD="$(aws secretsmanager get-secret-value --region ${region} --secret-id babuki/prod/db-password --query SecretString --output text)"

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

sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname = 'babuki'" | grep -q 1 \
  || sudo -u postgres createdb babuki --owner=babuki

systemctl enable postgresql nginx
systemctl restart postgresql nginx

mkdir -p /opt/babuki
chown ubuntu:ubuntu /opt/babuki

echo "babuki user_data complete" > /opt/babuki/PROVISIONED
