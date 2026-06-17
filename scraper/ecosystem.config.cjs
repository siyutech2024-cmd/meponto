/**
 * pm2 process config for the Eastwind scraper.
 *   pm2 start ecosystem.config.cjs
 *   pm2 save && pm2 startup     # survive server reboots
 *
 * Env is loaded from ./.env by the script itself (load-env.mjs), so pm2 only
 * needs the correct cwd. Logs: pm2 logs eastwind-scraper
 */
module.exports = {
  apps: [
    {
      name: "eastwind-scraper",
      script: "eastwind-rider-status.mjs",
      cwd: __dirname,
      interpreter: "node",
      autorestart: true,
      max_restarts: 50,
      restart_delay: 10000, // 10s backoff between restarts
      max_memory_restart: "500M",
      time: true, // timestamp log lines
    },
  ],
};
