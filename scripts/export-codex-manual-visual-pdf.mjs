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
const htmlPath = resolve(outputDir, "meponto-codex-team-collaboration-manual-v1-visual.html");
const pdfPath = resolve(outputDir, "meponto-codex-team-collaboration-manual-v1-visual.pdf");
const logoPath = resolve(root, "public/meponto-logo.svg");

mkdirSync(outputDir, { recursive: true });

function esc(value) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function flow(title, items) {
  return `<section class="diagram flow-diagram"><div class="diagram-title">${esc(title)}</div><div class="flow-row">${items
    .map((item, index) => `<div class="flow-item">${esc(item)}</div>${index < items.length - 1 ? '<div class="arrow">→</div>' : ""}`)
    .join("")}</div></section>`;
}

function lanes(title, groups) {
  return `<section class="diagram lane-diagram"><div class="diagram-title">${esc(title)}</div><div class="lane-grid">${groups
    .map(
      (group) => `<div class="lane"><strong>${esc(group.title)}</strong>${group.items
        .map((item) => `<span>${esc(item)}</span>`)
        .join("")}</div>`,
    )
    .join("")}</div></section>`;
}

function stack(title, items) {
  return `<section class="diagram stack-diagram"><div class="diagram-title">${esc(title)}</div><div class="stack">${items
    .map((item) => `<div>${esc(item)}</div>`)
    .join("")}</div></section>`;
}

function hub(title, center, items) {
  return `<section class="diagram hub-diagram"><div class="diagram-title">${esc(title)}</div><div class="hub-grid"><div class="hub-center">${esc(
    center,
  )}</div>${items.map((item) => `<div class="hub-node">${esc(item)}</div>`).join("")}</div></section>`;
}

function checklist(title, items) {
  return `<section class="diagram checklist-diagram"><div class="diagram-title">${esc(title)}</div><div class="check-grid">${items
    .map((item) => `<div><b>✓</b><span>${esc(item)}</span></div>`)
    .join("")}</div></section>`;
}

function diagramFor(heading) {
  if (heading.includes("1. 目标")) {
    return hub("系统协作目标图", "统一规则驱动开发", ["三名开发人员", "三个 Codex", "模块边界", "统一验证", "可扩展平台"]);
  }
  if (heading.includes("2. 核心原则")) {
    return flow("原则执行链路", ["规则先行", "契约先行", "边界清楚", "可灰度", "可验证", "可合并"]);
  }
  if (heading.includes("3. 项目内规则文件")) {
    return stack("规则文件层级", ["AGENTS.md: Codex 总规则", "Development Standard: 平台架构标准", "Playbook: 日常开发流程", "Contract Template: 模块接入契约", "PR / CI: 合并守门"]);
  }
  if (heading.includes("4. 三人分工")) {
    return lanes("三人模块分工图", [
      { title: "Developer A", items: ["Franchise", "Finance", "Cooperation docs"] },
      { title: "Developer B", items: ["Riders", "Leaders", "Mobile"] },
      { title: "Developer C", items: ["Marketplace", "Supply Chain", "Gamification"] },
    ]);
  }
  if (heading.includes("5. 分支策略")) {
    return flow("Git 合并路径", ["codex/<module-task>", "PR Review", "dev", "Full Check", "main", "Production"]);
  }
  if (heading.includes("6. 每个开发人员")) {
    return flow("开发人员启动流程", ["进入项目", "切到 dev", "拉取最新代码", "创建任务分支", "启动 Codex"]);
  }
  if (heading.includes("7. 给 Codex")) {
    return stack("Codex 指令结构", ["读取 AGENTS.md", "声明本次模块边界", "声明禁止修改范围", "实现任务", "运行 codex:preflight"]);
  }
  if (heading.includes("8. 新模块开发流程")) {
    return flow("新模块从 0 到 beta", ["模块契约", "权限", "数据边界", "API / Events", "Feature Flag", "Beta 页面", "Preflight"]);
  }
  if (heading.includes("9. 模块接入总系统")) {
    return flow("模块接入控制链", ["Module Contract", "Module Registry", "Feature Flag", "RBAC", "Gateway", "Events / API", "Monitoring"]);
  }
  if (heading.includes("10. Codex 可以直接")) {
    return checklist("Codex 适合自动执行", ["普通页面", "表格表单", "Mock Data", "SOP 文档", "翻译补全", "Smoke Test", "构建验证", "导出草稿"]);
  }
  if (heading.includes("11. 需要人确认")) {
    return hub("人工审批范围", "高风险决策", ["权限", "数据库", "钱/积分/库存", "Ledger", "生产部署", "合同政策"]);
  }
  if (heading.includes("11A. 语言支持要求")) {
    return lanes("三语覆盖图", [
      { title: "中文 zh", items: ["总部确认", "政策讨论", "文档初稿"] },
      { title: "English en", items: ["技术交付", "后台标签", "跨团队协作"] },
      { title: "Português pt", items: ["巴西骑手", "站点运营", "培训 SOP"] },
    ]);
  }
  if (heading.includes("12. 提交前验证")) {
    return lanes("验证级别", [
      { title: "Normal", items: ["module:guard", "build", "普通模块提交"] },
      { title: "Full", items: ["module:guard", "build", "smoke", "release/high-risk"] },
    ]);
  }
  if (heading.includes("13. Codex 提交流程")) {
    return flow("Codex 提交流程", ["开发完成", "运行 preflight", "只 stage 相关文件", "创建 commit", "开发者确认"]);
  }
  if (heading.includes("14. PR 流程")) {
    return flow("PR 合并流程", ["Feature Branch", "PR to dev", "Checklist", "CI", "Owner Review", "Merge"]);
  }
  if (heading.includes("15. GitHub 自动检查")) {
    return flow("CI 自动检查", ["push / PR", "npm ci", "module:guard", "build", "check", "merge allowed"]);
  }
  if (heading.includes("16. CODEOWNERS")) {
    return lanes("代码负责人机制", [
      { title: "Core", items: ["app/lib", "app/api", "components"] },
      { title: "Business", items: ["franchise", "finance", "riders"] },
      { title: "Ops", items: ["sops", "docs", "training"] },
    ]);
  }
  if (heading.includes("17. 多人开发")) {
    return flow("冲突预防流程", ["每日 pull", "模块内开发", "小步提交", "共享代码先沟通", "PR Review", "合并"]);
  }
  if (heading.includes("18. 每日工作")) {
    return flow("每日工作节奏", ["Start: pull dev", "Branch", "Develop", "Preflight", "PR", "Sync"]);
  }
  if (heading.includes("19. 新增商城模块")) {
    return flow("商城模块示例", ["Contract", "Permissions", "Catalog", "Points Ledger", "Events", "Beta", "Active"]);
  }
  if (heading.includes("20. 推荐给 Codex")) {
    return stack("常用 Codex 指令类型", ["开发模块", "检查模块", "提交代码", "高风险检查", "新增模块"]);
  }
  if (heading.includes("21. 最终执行标准")) {
    return checklist("合并门槛", ["契约清楚", "边界清楚", "权限清楚", "语言完整", "Feature Flag", "Preflight", "CI", "Owner Review"]);
  }
  return "";
}

function injectDiagrams(markdown) {
  return markdown
    .split("\n")
    .map((line) => {
      if (!line.startsWith("## ")) {
        return line;
      }
      return `${line}\n\n${diagramFor(line)}`;
    })
    .join("\n");
}

marked.setOptions({ gfm: true, breaks: false });

const markdown = injectDiagrams(readFileSync(sourcePath, "utf8"));
const body = marked.parse(markdown);
const logoUrl = pathToFileURL(logoPath).href;

const html = `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>MePonto Codex Team Collaboration Manual v1.0 - Visual Edition</title>
  <style>
    @page { size: A4; margin: 18mm 16mm 20mm 16mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #111827;
      background: #fff;
      font-family: Arial, "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", sans-serif;
      font-size: 10pt;
      line-height: 1.55;
    }
    .cover {
      min-height: 92vh;
      display: flex;
      flex-direction: column;
      justify-content: center;
      border: 2px solid #111827;
      padding: 34mm 22mm;
      background: linear-gradient(135deg, #ffd400 0%, #ffd400 42%, #ffffff 42%, #ffffff 100%);
      page-break-after: always;
    }
    .logo { width: 170px; margin-bottom: 24mm; }
    .eyebrow { font-size: 10pt; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; margin-bottom: 8mm; }
    .cover h1 { font-size: 30pt; line-height: 1.08; margin: 0 0 8mm; max-width: 650px; }
    .subtitle { font-size: 13pt; max-width: 590px; margin: 0 0 16mm; }
    .meta { display: grid; grid-template-columns: 32mm 1fr; gap: 4mm 8mm; font-size: 10pt; max-width: 125mm; }
    .meta strong { color: #374151; }
    main { max-width: 178mm; margin: 0 auto; }
    h1 { font-size: 23pt; line-height: 1.2; margin: 0 0 8mm; padding-bottom: 5mm; border-bottom: 3px solid #ffd400; }
    h2 { font-size: 15pt; line-height: 1.25; margin: 9mm 0 3mm; padding-top: 2mm; page-break-after: avoid; }
    h3 { font-size: 12pt; margin: 6mm 0 2mm; page-break-after: avoid; }
    p { margin: 0 0 3mm; }
    ul, ol { margin: 0 0 4mm 6mm; padding-left: 5mm; }
    li { margin: 0 0 1.4mm; }
    table { width: 100%; border-collapse: collapse; margin: 4mm 0 6mm; page-break-inside: avoid; font-size: 9.2pt; }
    th { background: #111827; color: #fff; font-weight: 700; text-align: left; }
    th, td { border: 1px solid #d1d5db; padding: 7px 8px; vertical-align: top; }
    tr:nth-child(even) td { background: #f9fafb; }
    code { font-family: "SFMono-Regular", Consolas, Menlo, monospace; font-size: 8.9pt; background: #f3f4f6; border: 1px solid #e5e7eb; border-radius: 4px; padding: 1px 4px; }
    pre { background: #111827; color: #f9fafb; border-radius: 8px; padding: 10px 12px; overflow-wrap: anywhere; white-space: pre-wrap; margin: 3mm 0 5mm; page-break-inside: avoid; }
    pre code { background: transparent; border: 0; color: inherit; padding: 0; font-size: 8.5pt; }
    .diagram {
      border: 1.5px solid #111827;
      border-radius: 10px;
      padding: 10px;
      margin: 3mm 0 5mm;
      background: #fffdf2;
      page-break-inside: avoid;
    }
    .diagram-title { font-weight: 800; font-size: 10.5pt; margin-bottom: 8px; color: #111827; }
    .flow-row { display: flex; align-items: stretch; gap: 6px; flex-wrap: wrap; }
    .flow-item, .hub-node, .lane, .stack div, .check-grid div {
      border: 1px solid #d1d5db;
      background: #fff;
      border-radius: 8px;
      padding: 8px 9px;
      min-height: 34px;
      display: flex;
      align-items: center;
      justify-content: center;
      text-align: center;
      font-weight: 700;
    }
    .flow-item { flex: 1 1 88px; }
    .arrow { display: flex; align-items: center; justify-content: center; color: #c49a00; font-size: 14pt; font-weight: 900; }
    .lane-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .lane { align-items: stretch; justify-content: flex-start; flex-direction: column; text-align: left; }
    .lane strong { display: block; color: #111827; margin-bottom: 6px; }
    .lane span { display: block; border-top: 1px solid #e5e7eb; padding-top: 5px; margin-top: 5px; font-weight: 500; }
    .stack { display: grid; gap: 6px; }
    .stack div { justify-content: flex-start; text-align: left; border-left: 6px solid #ffd400; }
    .hub-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; align-items: stretch; }
    .hub-center { grid-row: span 2; background: #111827; color: #ffd400; border-radius: 10px; min-height: 78px; display: flex; align-items: center; justify-content: center; text-align: center; font-weight: 900; padding: 10px; }
    .check-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 7px; }
    .check-grid div { justify-content: flex-start; gap: 6px; text-align: left; font-weight: 600; }
    .check-grid b { color: #0f766e; font-size: 12pt; }
    blockquote { border-left: 4px solid #ffd400; margin: 4mm 0; padding: 2mm 0 2mm 4mm; background: #fffbeb; }
    a { color: #0f766e; text-decoration: none; }
    hr { border: 0; border-top: 1px solid #e5e7eb; margin: 7mm 0; }
  </style>
</head>
<body>
  <section class="cover">
    <img class="logo" src="${logoUrl}" alt="MePonto" />
    <div class="eyebrow">Visual Collaboration Standard</div>
    <h1>MePonto Codex Team Collaboration Manual v1.0</h1>
    <p class="subtitle">图示增强版：每个章节配套流程图、架构图或执行图，方便开发团队快速执行。</p>
    <div class="meta">
      <strong>Brand</strong><span>MePonto</span>
      <strong>System</strong><span>PontoSys</span>
      <strong>Edition</strong><span>Visual PDF</span>
      <strong>Date</strong><span>2026-05-29</span>
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

const browser = await chromium.launch({ headless: true, executablePath });
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
        <span>MePonto Codex Team Collaboration Manual v1.0 - Visual Edition</span>
        <span><span class="pageNumber"></span> / <span class="totalPages"></span></span>
      </div>
    `,
    margin: { top: "18mm", bottom: "20mm", left: "16mm", right: "16mm" },
  });
} finally {
  await browser.close();
}

console.log(pdfPath);
