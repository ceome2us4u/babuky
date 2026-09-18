// PM2 process config — two apps, mirroring Home's separate-service shape:
// babuki-api (apps/api, Hono, port 8000) and babuki-web (apps/web,
// Next.js standalone build, port 3000), both deployed by scripts/deploy.sh.
// Each reads its own .env file (never committed — see .env.example),
// placed alongside its code by the deploy script.

const API_DIR = process.env.BABUKI_API_DIR || "/opt/babuki/api";
const WEB_DIR = process.env.BABUKI_WEB_DIR || "/opt/babuki/web";

module.exports = {
  apps: [
    {
      name: "babuki-api",
      cwd: API_DIR,
      script: "src/server.ts",
      interpreter: "node_modules/.bin/tsx",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: "production",
        PORT: "8000",
      },
    },
    {
      name: "babuki-web",
      cwd: WEB_DIR,
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
