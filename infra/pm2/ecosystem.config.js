// PM2 process config — two apps, mirroring Home's separate-service shape:
// babuki-api (apps/api, Hono, port 8000) and babuki-web (apps/web,
// Next.js standalone build, port 3000), both deployed by scripts/deploy.sh.
// Each reads its own .env file (never committed — see .env.example),
// written next to its code by the deploy script.

const API_DIR = process.env.BABUKI_API_DIR || "/opt/babuki/api";
// Next nests the standalone output as standalone/apps/web/server.js in
// this npm-workspaces monorepo (tracing root = repo root), so the web app's
// real directory is web/apps/web, not web/.
const WEB_DIR = process.env.BABUKI_WEB_DIR || "/opt/babuki/web/apps/web";

module.exports = {
  apps: [
    {
      name: "babuki-api",
      cwd: API_DIR,
      script: "src/server.ts",
      // Plain `node` with tsx registered via --import (Node 20.6+), instead
      // of pointing `interpreter` at a relative node_modules/.bin path PM2
      // may not resolve. Nothing in apps/api loads a .env itself, so Node's
      // built-in --env-file does it (path is relative to cwd = API_DIR).
      interpreter: "node",
      interpreter_args: "--env-file=.env --import tsx",
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
        // Next's standalone server binds to $HOSTNAME, which the shell sets
        // to the machine name (ip-10-20-1-x) — Nginx proxies to 127.0.0.1,
        // so pin it or the upstream refuses connections.
        HOSTNAME: "127.0.0.1",
      },
    },
  ],
};
