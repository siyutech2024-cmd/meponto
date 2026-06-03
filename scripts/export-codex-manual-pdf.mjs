import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const markedPath =
  "/Users/ishak/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/marked/lib/marked.esm.js";
const playwrightPath =
  "/Users/ishak/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs";

const { marked } = await import(pathToFileURL(markedPath).href);
const { chromium } = await import(pathToFileURL(playwrightPath).href);

const root = process.cwd();
const sourcePath = resolve(root, "docs/codex-team-collaboration-manual.md");
const outputDir = resolve(root, "exports/codex_manual");
const htmlPath = resolve(outputDir, "meponto-codex-team-collaboration-manual-v1.html");
const pdfPath = resolve(outputDir, "meponto-codex-team-collaboration-manual-v1.pdf");
const logoPath = resolve(root, "public/meponto-logo.svg");

mkdirSync(outputDir, { recursive: true });

marked.setOptions({
  gfm: true,
  breaks: false,
});

const markdown = readFileSync(sourcePath, "utf8");
const body = marked.parse(markdown);
const logoUrl = pathToFileURL(logoPath).href;

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MePonto Codex Team Collaboration Manual v1.0</title>
  <style>
    @page {
      size: A4;
      margin: 18mm 16mm 18mm 16mm;
    }

    * {
      box-sizing: border-box;
    }

    body {
      margin: 0;
      color: #111827;
      background: #ffffff;
      font-family: Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      font-size: 10.5pt;
      line-height: 1.58;
    }

    .cover {
      min-height: 92vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      border: 2px solid #111827;
      padding: 36mm 22mm;
      background: linear-gradient(135deg, #ffd400 0%, #ffd400 42%, #ffffff 42%, #ffffff 100%);
      page-break-after: always;
    }

    .logo {
      width: 170px;
      margin-bottom: 28mm;
    }

    .eyebrow {
      font-size: 10pt;
      font-weight: 700;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: #111827;
      margin-bottom: 8mm;
    }

    .cover h1 {
      font-size: 31pt;
      line-height: 1.08;
      margin: 0 0 8mm;
      max-width: 620px;
    }

    .subtitle {
      font-size: 13pt;
      max-width: 560px;
      margin: 0 0 18mm;
    }

    .meta {
      display: grid;
      grid-template-columns: 32mm 1fr;
      gap: 4mm 8mm;
      font-size: 10pt;
      max-width: 120mm;
    }

    .meta strong {
      color: #374151;
    }

    main {
      max-width: 178mm;
      margin: 0 auto;
    }

    h1 {
      font-size: 24pt;
      line-height: 1.2;
      margin: 0 0 8mm;
      padding-bottom: 5mm;
      border-bottom: 3px solid #ffd400;
    }

    h2 {
      font-size: 15pt;
      line-height: 1.25;
      margin: 9mm 0 3mm;
      padding-top: 2mm;
      color: #111827;
      page-break-after: avoid;
    }

    h3 {
      font-size: 12pt;
      margin: 6mm 0 2mm;
      page-break-after: avoid;
    }

    p {
      margin: 0 0 3mm;
    }

    ul, ol {
      margin: 0 0 4mm 6mm;
      padding-left: 5mm;
    }

    li {
      margin: 0 0 1.5mm;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 4mm 0 6mm;
      page-break-inside: avoid;
      font-size: 9.5pt;
    }

    th {
      background: #111827;
      color: #ffffff;
      font-weight: 700;
      text-align: left;
    }

    th, td {
      border: 1px solid #d1d5db;
      padding: 7px 8px;
      vertical-align: top;
    }

    tr:nth-child(even) td {
      background: #f9fafb;
    }

    code {
      font-family: "SFMono-Regular", Consolas, "Liberation Mono", Menlo, monospace;
      font-size: 9.2pt;
      background: #f3f4f6;
      border: 1px solid #e5e7eb;
      border-radius: 4px;
      padding: 1px 4px;
    }

    pre {
      background: #111827;
      color: #f9fafb;
      border-radius: 8px;
      padding: 10px 12px;
      overflow-wrap: anywhere;
      white-space: pre-wrap;
      margin: 3mm 0 5mm;
      page-break-inside: avoid;
    }

    pre code {
      background: transparent;
      border: 0;
      color: inherit;
      padding: 0;
      font-size: 8.8pt;
    }

    blockquote {
      border-left: 4px solid #ffd400;
      margin: 4mm 0;
      padding: 2mm 0 2mm 4mm;
      background: #fffbeb;
    }

    a {
      color: #0f766e;
      text-decoration: none;
    }

    hr {
      border: 0;
      border-top: 1px solid #e5e7eb;
      margin: 7mm 0;
    }
  </style>
</head>
<body>
  <section class="cover">
    <img class="logo" src="${logoUrl}" alt="MePonto" />
    <div class="eyebrow">Codex Collaboration Standard</div>
    <h1>MePonto Codex Team Collaboration Manual v1.0</h1>
    <p class="subtitle">三名开发人员使用 Codex 同步开发不同模块的统一执行手册。</p>
    <div class="meta">
      <strong>Brand</strong><span>MePonto</span>
      <strong>System</strong><span>PontoSys</span>
      <strong>Scope</strong><span>Module development, validation, commit, PR, and release workflow</span>
      <strong>Date</strong><span>2026-05-26</span>
    </div>
  </section>
  <main>${body}</main>
</body>
</html>`;

writeFileSync(htmlPath, html, "utf8");

const chromeCandidates = [
  "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  "/Applications/Chromium.app/Contents/MacOS/Chromium",
];
const executablePath = chromeCandidates.find((candidate) => existsSync(candidate));

const browser = await chromium.launch({
  headless: true,
  executablePath,
});
try {
  const page = await browser.newPage();
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    preferCSSPageSize: true,
    displayHeaderFooter: true,
    headerTemplate: `<div></div>`,
    footerTemplate: `
      <div style="width:100%;font-size:8px;color:#6b7280;padding:0 16mm;display:flex;justify-content:space-between;font-family:Arial,sans-serif;">
        <span>MePonto Codex Team Collaboration Manual v1.0</span>
        <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
      </div>
    `,
    margin: {
      top: "18mm",
      bottom: "20mm",
      left: "16mm",
      right: "16mm",
    },
  });
} finally {
  await browser.close();
}

console.log(pdfPath);
