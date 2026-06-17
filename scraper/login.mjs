/**
 * One-time interactive login for the Eastwind scraper.
 *
 * Opens a visible browser using the SAME persistent profile the scraper uses.
 * Log in by hand (do NOT let any automation type your password). Once you can
 * see the rider board, press Enter in this terminal to save and exit.
 *
 *   node login.mjs
 */
import "./load-env.mjs";
import { chromium } from "playwright";
import readline from "node:readline";

const profileDir = process.env.PROFILE_DIR || "./.eastwind-profile";

const ctx = await chromium.launchPersistentContext(profileDir, {
  headless: false,
  viewport: { width: 1440, height: 900 },
});
const page = ctx.pages()[0] || (await ctx.newPage());
await page.goto("https://eastwind.99app.com/monitor/riders/list");

console.log("\nLog in by hand in the opened window.");
console.log("When you can see the rider board, come back here and press Enter to save the session.\n");

await new Promise((resolve) => {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  rl.question("Press Enter when logged in… ", () => {
    rl.close();
    resolve();
  });
});

await ctx.close();
console.log("Session saved to", profileDir);
