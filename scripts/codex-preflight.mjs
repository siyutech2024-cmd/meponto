import { spawn } from "node:child_process";

const npmCommand = process.platform === "win32" ? "npm.cmd" : "npm";
const full = process.argv.includes("--full") || process.env.CODEX_PREFLIGHT_FULL === "1";

const steps = [
  ["Module guard", ["run", "module:guard"]],
  ["Production build", ["run", "build"]],
];

if (full) {
  steps.push(["Full smoke check", ["run", "check"]]);
}

function run(label, args) {
  return new Promise((resolve, reject) => {
    console.log(`\n> ${label}`);
    const child = spawn(npmCommand, args, {
      stdio: "inherit",
      shell: false,
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${label} failed with exit code ${code}`));
    });
  });
}

for (const [label, args] of steps) {
  await run(label, args);
}

console.log(`\nCodex preflight passed${full ? " with full smoke check" : ""}.`);
