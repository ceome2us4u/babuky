# Babuki — EC2 deployment notes

Target: a single, dedicated EC2 instance (own VPC, own security group, own
IAM role — see the "Infrastructure" plan) running Ubuntu. Nothing here is
provisioned automatically; these are the manual steps for that box.

## One-time box setup

```bash
# PostgreSQL + PostGIS
sudo apt update
sudo apt install -y postgresql postgresql-15-postgis-3
sudo -u postgres createuser babuki --pwprompt
sudo -u postgres createdb babuki --owner=babuki

# Node + PM2
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt install -y nodejs
sudo npm install -g pm2

# Nginx + Certbot (Route 53 DNS-01 plugin, for the wildcard cert)
sudo apt install -y nginx certbot python3-certbot-dns-route53
sudo cp infra/nginx/babuki.conf /etc/nginx/sites-available/babuki.conf
sudo ln -s /etc/nginx/sites-available/babuki.conf /etc/nginx/sites-enabled/
sudo certbot certonly --dns-route53 -d babuki.com -d '*.babuki.com'
sudo nginx -t && sudo systemctl reload nginx
```

The IAM role attached to this instance needs `route53:ChangeResourceRecordSets`
scoped to the `babuki.com` hosted zone for the DNS-01 challenge (both the
first issuance above and certbot's renewal cron/systemd timer).

## Deploying a build

```bash
# From the repo, after `npm install && npm run build` in apps/web:
mkdir -p /opt/babuki/current
cp -r apps/web/.next/standalone/. /opt/babuki/current/
cp -r apps/web/.next/static /opt/babuki/current/.next/static
cp -r apps/web/public /opt/babuki/current/public
cp apps/web/.env /opt/babuki/current/.env   # filled from .env.example, never committed

cd apps/web && node db/migrate.mjs           # applies any new migrations

pm2 start infra/pm2/ecosystem.config.js
pm2 save
```

Re-deploys repeat the `cp`/migrate/`pm2 reload babuki-web` steps. Nothing
here is wired to CI yet — see the plan file for that as a future step.
