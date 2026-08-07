#!/usr/bin/env node
/**
 * 数据库迁移执行器 — 替代"手动去 Supabase SQL 编辑器粘贴"。
 *
 * 为什么需要它:以前 push 脚本靠 `command -v psql`,而这台 Mac 上没有 psql,
 * 于是每次都静默走 else 分支、打印一句"请手动执行"。结果是代码先上线、DDL
 * 后补(或者忘了补),线上就会读一个不存在的列。这个脚本用 node-postgres 直连,
 * 不依赖任何外部二进制。
 *
 * 设计要点:
 *  · **有版本表**:已应用的迁移记进 schema_migrations,重跑只应用新的。
 *  · **单事务/文件**:一个文件要么整体成功要么整体回滚,不会留半截 schema。
 *  · **顺序确定**:按文件名排序(时间戳前缀),和 supabase CLI 的约定一致。
 *  · **先对账后执行**:先打印"待应用清单"再动手,看得见才敢按回车。
 *  · **只前进不回滚**:不做 down migration —— 生产库的回滚要人来判断。
 *
 * 用法:
 *   npm run migrate:baseline  # 【只跑一次】把现有迁移全部标记为已应用
 *   npm run migrate           # 应用所有未应用的迁移
 *   npm run migrate -- --dry  # 只列出待应用,不执行
 *
 * ⚠️ 第一次使用必须先跑 baseline。这个库是从"手动在 SQL 编辑器里执行"演进
 * 过来的,19 个历史迁移早已生效但没有版本记录。不打基线直接跑,脚本会把
 * initial_schema 之类从头重放一遍 —— 那是灾难。baseline 只写版本表、一行
 * SQL 都不执行。
 *
 * 需要 .env.local 里有 DIRECT_URL(Supabase → Project Settings → Database →
 * Connection string → URI,端口 5432 的那条直连,不是 6543 的连接池)。
 * 连接池那条不能跑 DDL。
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATIONS_DIR = join(root, "supabase", "migrations");

function readEnvLocal() {
  const file = join(root, ".env.local");
  if (!existsSync(file)) return {};
  const out = {};
  for (const line of readFileSync(file, "utf8").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (!match) continue;
    out[match[1]] = match[2].trim().replace(/^["']|["']$/g, "");
  }
  return out;
}

const env = { ...readEnvLocal(), ...process.env };
const url = env.DIRECT_URL || env.SUPABASE_DIRECT_URL || "";
const dryRun = process.argv.includes("--dry");
const baseline = process.argv.includes("--baseline");

if (!url) {
  console.error(`
✗ 找不到 DIRECT_URL。

  在 .env.local 里加一行(Supabase → Project Settings → Database →
  Connection string → URI,选 5432 直连那条):

    DIRECT_URL=postgresql://postgres:<密码>@db.<项目>.supabase.co:5432/postgres

  注意用 5432 直连,不要用 6543 的连接池 —— 连接池不能执行 DDL。
`);
  process.exit(1);
}

let pg;
try {
  pg = await import("pg");
} catch {
  console.error("✗ 缺少 pg 依赖,先跑一次:  npm install pg --save-dev");
  process.exit(1);
}

const client = new (pg.default?.Client ?? pg.Client)({
  connectionString: url,
  // Supabase 直连要求 TLS;证书链在本机不一定装全,这里只用来加密传输。
  ssl: { rejectUnauthorized: false },
  connectionTimeoutMillis: 15_000,
});

try {
  await client.connect();
} catch (error) {
  console.error(`
✗ 连不上数据库:${error.message}

  常见原因:
   · DIRECT_URL 里的密码不对(Supabase → Database → Reset database password)
   · 用了 6543 连接池那条(必须用 5432 直连,连接池跑不了 DDL)
   · 本机网络/VPN 挡住了 5432 出站
`);
  process.exit(1);
}

try {
  await client.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version     text PRIMARY KEY,
      applied_at  timestamptz NOT NULL DEFAULT now(),
      checksum    text
    );
  `);

  const files = readdirSync(MIGRATIONS_DIR).filter((f) => f.endsWith(".sql")).sort();
  const { rows } = await client.query("SELECT version, checksum FROM schema_migrations");
  const applied = new Map(rows.map((r) => [r.version, r.checksum]));

  const hash = (text) =>
    // 轻量校验和 —— 只为发现"已应用的迁移文件被改过",不做加密用途。
    String(text.split("").reduce((acc, ch) => ((acc << 5) - acc + ch.charCodeAt(0)) | 0, 0));

  const pending = [];
  const drifted = [];
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    const sum = hash(sql);
    if (!applied.has(file)) pending.push({ file, sql, sum });
    else if (applied.get(file) && applied.get(file) !== sum) drifted.push(file);
  }

  if (drifted.length > 0) {
    // 改已应用的迁移是危险操作:线上库不会自动重放,两边 schema 会悄悄分叉。
    console.warn(`⚠ 以下迁移已应用但文件内容变过(线上不会重放,请另写新迁移):`);
    for (const f of drifted) console.warn(`    ${f}`);
  }

  if (baseline) {
    // 只写版本表,不执行任何 SQL —— 用于把"历史上手动跑过"的迁移登记在案。
    //
    // ⚠️ 守卫(2026-08-07 事故后加):基线**只允许打一次**(版本表为空时)。
    // db-migrate.command 每次都先跑 baseline —— 没有这个守卫,任何新增的
    // 迁移文件都会被"登记为已应用"却从未执行:migrate 随后看到 0 待应用,
    // 输出"schema 已是最新",而列/函数根本不存在。20260807150000 就是
    // 这样被吞掉的(accept_cnt 列缺失、入库 500),事后只能在 SQL 编辑器
    // 手工补跑。静默跳过比报错更危险 —— 这里必须硬拦。
    if (applied.size > 0) {
      console.log(`✓ 基线已打过(版本表已有 ${applied.size} 条),跳过 —— 新迁移交给 npm run migrate 执行`);
      process.exit(0);
    }
    if (pending.length === 0) {
      console.log("✓ 基线已存在,无需重复打");
      process.exit(0);
    }
    for (const { file, sum } of pending) {
      await client.query(
        "INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2) ON CONFLICT (version) DO NOTHING",
        [file, sum],
      );
      console.log(`  基线登记 ${file}`);
    }
    console.log(`\n✓ 基线完成:${pending.length} 个迁移标记为已应用(未执行任何 SQL)`);
    console.log("  以后新增的迁移用 npm run migrate 即可。");
    process.exit(0);
  }

  console.log(`已应用 ${applied.size} 个 · 待应用 ${pending.length} 个`);
  if (pending.length === 0) {
    console.log("✓ 数据库 schema 已是最新");
    process.exit(0);
  }
  for (const p of pending) console.log(`  → ${p.file}`);

  if (dryRun) {
    console.log("\n(--dry:未执行)");
    process.exit(0);
  }

  for (const { file, sql, sum } of pending) {
    process.stdout.write(`\n执行 ${file} … `);
    // 一个文件一个事务:失败就整体回滚,不留半截 schema。
    await client.query("BEGIN");
    try {
      await client.query(sql);
      await client.query("INSERT INTO schema_migrations (version, checksum) VALUES ($1, $2)", [file, sum]);
      await client.query("COMMIT");
      console.log("OK");
    } catch (error) {
      await client.query("ROLLBACK");
      console.log("失败,已回滚");
      console.error(`\n✗ ${file}:\n${error.message}\n`);
      process.exit(1);
    }
  }

  console.log(`\n✓ 完成:应用了 ${pending.length} 个迁移`);
} finally {
  await client.end();
}
