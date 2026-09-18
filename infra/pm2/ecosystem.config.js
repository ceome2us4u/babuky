// PM2 process config for Babuki's Next.js app. Assumes the standalone build
// output (apps/web/.next/standalone, plus .next/static and public copied
// alongside it — same layout as apps/web/Dockerfile) has been deployed to
// BABUKI_DEPLOY_DIR on the box by scripts/deploy.sh. Env vars come from a
// .env file placed at <deploy dir>/.env (never committed — see
// .env.example), which Next.js loads automatically at boot.

const DEPLOY_DIR = process.env.BABUKI_DEPLOY_DIR || "/opt/babuki/app";

module.exports = {
  apps: [
    {
      name: "babuki-web",
      cwd: DEPLOY_DIR,
      script: "server.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: "production",
        PORT: "3000",
      },
    },
  ],
};
