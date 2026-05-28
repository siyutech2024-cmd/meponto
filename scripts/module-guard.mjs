import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const requiredDocs = [
  "AGENTS.md",
  "docs/meponto-ecosystem-development-standard-v2.md",
  "docs/meponto-ecosystem-os-v2-diagram.md",
  "docs/module-development-playbook.md",
  "docs/module-contract-template.md",
  "docs/pr-checklist.md",
  "docs/codex-team-collaboration-manual.md",
];

const textExtensions = new Set([
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".md",
  ".mjs",
  ".json",
]);

const ignoredDirs = new Set([
  ".git",
  ".next",
  ".vercel",
  "node_modules",
  "exports",
]);

function fail(message) {
  console.error(`module-guard: ${message}`);
  process.exitCode = 1;
}

function extname(path) {
  const index = path.lastIndexOf(".");
  return index === -1 ? "" : path.slice(index);
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir)) {
    if (ignoredDirs.has(entry)) {
      continue;
    }

    const path = join(dir, entry);
    const stats = statSync(path);
    if (stats.isDirectory()) {
      walk(path, files);
      continue;
    }

    if (textExtensions.has(extname(path))) {
      files.push(path);
    }
  }
  return files;
}

for (const doc of requiredDocs) {
  try {
    statSync(join(root, doc));
  } catch {
    fail(`missing required collaboration file: ${doc}`);
  }
}

const files = walk(root);
const warnings = [];

for (const file of files) {
  const rel = relative(root, file);
  const text = readFileSync(file, "utf8");

  if (/eastwind/i.test(text) && rel !== "scripts/module-guard.mjs") {
    warnings.push(`${rel}: contains legacy platform naming; use MePonto/PontoSys unless this is reference material.`);
  }

  if (/event[\w.-]*(created|updated|deleted)/i.test(text) && !/\.v\d\b/.test(text)) {
    warnings.push(`${rel}: possible unversioned event name; use names like module.action.created.v1.`);
  }

  if (/balance\s*[+\-]?=|balance\s*:\s*[^,\n]+[+\-]/i.test(text)) {
    warnings.push(`${rel}: possible direct balance mutation; ledger-style records are required.`);
  }
}

if (warnings.length > 0) {
  for (const warning of warnings) {
    console.warn(`module-guard warning: ${warning}`);
  }
}

if (process.exitCode !== 1) {
  console.log("module-guard: collaboration and module rules passed");
}
