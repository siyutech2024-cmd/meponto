import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { createRequire } from "node:module";

const root = process.cwd();
const source = path.join(root, "docs/meponto-product-development-department-handbook.md");
const outDir = path.join(root, "exports");
const htmlPath = path.join(outDir, "meponto-product-development-department-handbook.html");
const pdfPath = path.join(outDir, "meponto-product-development-department-handbook.pdf");
const runtimeNodeModules =
  process.env.CODEX_RUNTIME_NODE_MODULES ??
  "/Users/ishak/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules";

const { marked } = await import(pathToFileURL(path.join(runtimeNodeModules, "marked/lib/marked.esm.js")));
const require = createRequire(import.meta.url);
const { chromium } = require(path.join(runtimeNodeModules, "playwright"));

await fs.mkdir(outDir, { recursive: true });

const markdown = await fs.readFile(source, "utf8");
const renderer = new marked.Renderer();
renderer.code = ({ text, lang }) => {
  if (lang === "mermaid") {
    return `<pre class="mermaid">${escapeHtml(text)}</pre>`;
  }
  return `<pre><code>${escapeHtml(text)}</code></pre>`;
};

const body = marked(markdown, {
  gfm: true,
  breaks: false,
  renderer,
});

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MePonto 产品策划书与开发部门执行手册</title>
  <style>
    :root {
      --yellow: #ffd400;
      --ink: #121212;
      --muted: #5f6368;
      --line: #dfe3ea;
      --soft: #fff8cf;
      --panel: #f7f9fc;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: var(--ink);
      background: #ffffff;
      font-family: Arial, "PingFang SC", "Microsoft YaHei", sans-serif;
      line-height: 1.62;
    }
    .cover {
      padding: 42px 56px 30px;
      color: #101018;
      background: linear-gradient(135deg, var(--yellow), #ffe96a);
      border-bottom: 5px solid #111827;
    }
    .brand {
      font-size: 14px;
      font-weight: 900;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .cover h1 {
      max-width: 920px;
      margin: 24px 0 12px;
      font-size: 36px;
      line-height: 1.15;
    }
    .cover p {
      max-width: 840px;
      margin: 0;
      font-size: 15px;
      font-weight: 700;
    }
    main {
      max-width: 980px;
      margin: 0 auto;
      padding: 34px 42px 72px;
    }
    h1, h2, h3 {
      line-height: 1.25;
      letter-spacing: 0;
    }
    main > h1 { display: none; }
    h2 {
      margin: 34px 0 14px;
      padding-bottom: 8px;
      border-bottom: 2px solid var(--ink);
      font-size: 24px;
    }
    h3 {
      margin: 24px 0 10px;
      font-size: 18px;
    }
    p { margin: 10px 0; }
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 14px 0 22px;
      font-size: 13px;
      page-break-inside: avoid;
    }
    th {
      background: #111827;
      color: #ffffff;
      text-align: left;
      font-weight: 800;
    }
    th, td {
      border: 1px solid var(--line);
      padding: 9px 10px;
      vertical-align: top;
    }
    tr:nth-child(even) td { background: #fafbfe; }
    ul, ol { padding-left: 24px; }
    li { margin: 5px 0; }
    code {
      padding: 2px 5px;
      border-radius: 4px;
      background: #f0f2f5;
      font-family: Menlo, Consolas, monospace;
      font-size: .92em;
    }
    pre {
      margin: 14px 0 22px;
      padding: 14px 16px;
      overflow: auto;
      border: 1px solid #d8dee9;
      border-radius: 8px;
      background: #101827;
      color: #f8fafc;
      font-size: 12px;
      line-height: 1.45;
      page-break-inside: avoid;
    }
    pre code { background: transparent; color: inherit; padding: 0; }
    pre.mermaid {
      background: var(--panel);
      color: #1f2937;
      white-space: pre-wrap;
    }
    blockquote {
      margin: 14px 0;
      padding: 12px 16px;
      border-left: 5px solid var(--yellow);
      background: var(--soft);
    }
    a { color: #0f62fe; }
    @page { margin: 16mm 14mm; }
    @media print {
      .cover { page-break-after: avoid; }
      h2, h3 { page-break-after: avoid; }
      table, pre { break-inside: avoid; }
    }
  </style>
</head>
<body>
  <section class="cover">
    <div class="brand">MePonto · PontoSys</div>
    <h1>产品策划书与开发部门执行手册 v1.0</h1>
    <p>用于开发部门执行产品规划、模块开发、沙盒测试、分支提交、Preview 验收、代码合并和生产发布。</p>
  </section>
  <main>${body}</main>
</body>
</html>`;

await fs.writeFile(htmlPath, html);

const browser = await chromium.launch({ headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 960 } });
  await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
  await page.pdf({
    path: pdfPath,
    format: "A4",
    printBackground: true,
    displayHeaderFooter: true,
    headerTemplate: "<div></div>",
    footerTemplate:
      '<div style="font-family:Arial,sans-serif;font-size:8px;color:#777;width:100%;padding:0 12mm;text-align:right;">MePonto PontoSys · <span class="pageNumber"></span>/<span class="totalPages"></span></div>',
    margin: { top: "14mm", right: "12mm", bottom: "16mm", left: "12mm" },
  });
} finally {
  await browser.close();
}

console.log(JSON.stringify({ htmlPath, pdfPath }, null, 2));

function escapeHtml(value) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
