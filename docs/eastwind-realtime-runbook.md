# Eastwind 实时同步 · 执行手册（Runbook）

配套设计见 `eastwind-realtime-sync-plan.md`。本文件只讲**怎么一步步跑起来**。

## 0. 总览

```
[专用账号] 常驻 Playwright 浏览器（保存登录态）
   每5分钟 → 打开 骑手看板 + 运单看板 → 抓 gateway JSON
        │  POST {capturedAt, cityId, riders, delivery}  (x-ingest-token)
        ▼
[MePonto] POST /api/eastwind/rider-status  →  解析(容错, 留 raw)
        ▼
[Supabase] rider_status_snapshots / rider_kpi_snapshots / eastwind_deliveries
```

三块代码已就位：
- 迁移：`supabase/migrations/20260617120000_eastwind_realtime_status.sql`
- 接口：`app/api/eastwind/rider-status/route.ts` ＋ 解析 `app/lib/eastwind.ts`
- 抓取器：`scraper/`

执行分 6 阶段。阶段 1–4 先在**你本机**跑通验证，确认无误再做阶段 5 的常驻部署。

---

## 阶段 1 · 建表（Supabase staging）

任选一种方式执行那个迁移文件：

```bash
# 方式A：Supabase CLI（推荐，和现有 migrations 一致）
supabase db push

# 方式B：直接用 DIRECT_URL 跑 SQL（.env.local 里的 DIRECT_URL）
psql "$DIRECT_URL" -f supabase/migrations/20260617120000_eastwind_realtime_status.sql

# 方式C：Supabase 控制台 → SQL Editor，把该 .sql 内容粘贴执行
```

验证三张表建好：

```sql
select table_name from information_schema.tables
where table_name in ('rider_status_snapshots','rider_kpi_snapshots','eastwind_deliveries');
```

---

## 阶段 2 · 配置服务端密钥并部署

1. 生成一个随机密钥（抓取器和服务端要一致）：
   ```bash
   openssl rand -hex 24
   ```
2. 在 **Vercel 项目环境变量**里加：
   ```
   EASTWIND_INGEST_TOKEN = <上一步生成的值>
   ```
3. 重新部署（让接口带上密钥校验）。
4. 冒烟测试接口在线（未带密钥应返回 401；GET 看说明）：
   ```bash
   curl -s https://sys.meponto.com/api/eastwind/rider-status        # GET 说明
   curl -s -X POST https://sys.meponto.com/api/eastwind/rider-status # 401
   ```

> 注：`EASTWIND_INGEST_TOKEN` 不设时接口是开放的（方便本地联调）；上线前务必设上。

---

## 阶段 3 · 起抓取器（本机验证，有头模式）

```bash
cd scraper
npm install
npx playwright install chromium
cp .env.example .env
```

编辑 `.env`：
```
MEPONTO_INGEST_URL=https://sys.meponto.com/api/eastwind/rider-status
MEPONTO_INGEST_TOKEN=<和 Vercel 上一致>
HEADLESS=false          # 本机验证先看得见
SHIFT_START=0
SHIFT_END=24
```

一次性登录（**你本人手动登录**，用那个专用账号；密码不经过自动化）：
```bash
node login.mjs
# 弹出浏览器 → 手动登录到能看见骑手看板 → 回终端按回车
```

启动：
```bash
npm start
# 立即抓一次，之后每5分钟一次；看日志里的 "ingest 200"
```

---

## 阶段 4 · 校准字段映射（关键，跑通后必做）

第一批数据进库后，查有没有字段没对上（typed 列为空但 raw 里有值）：

```sql
-- 看一条原始记录，对照字段名
select raw from rider_status_snapshots order by id desc limit 1;
select raw from eastwind_deliveries  order by updated_at desc limit 1;

-- 哪些关键列没解析出来
select count(*) total,
       count(rider_ext_id) has_id,
       count(status) has_status,
       count(online_mins) has_online,
       count(lat) has_geo
from rider_status_snapshots
where captured_at = (select max(captured_at) from rider_status_snapshots);
```

按 raw 里的真实键名，补进 `app/lib/eastwind.ts` 顶部的候选键列表（`K` / `KD`），重部署。
同时确认三件事：

1. **骑手关联键**：`rider_ext_id` 能不能 join 到 MePonto 现有骑手（你们有 `ninetyNineId`）？
   对不上就改用电话兜底。
2. **时间**：`raw` 里的节点时间是 epoch 还是只有 "HH:mm"？只有 HH:mm 的话要确认时区(圣保罗)处理对。
3. **分页**：当前只抓 `pageSize=500` 第一页。查 `raw` 里的总数/总页字段，若运单峰值超 500，
   需要在抓取器里循环翻页（`pageNo`）。

---

## 阶段 5 · 常驻部署（VPS / 容器）

本机验证 OK 后，搬到常开环境。抓取器是**独立 worker**（和 Next.js 应用分开）。

要点：
- 小 VPS 或容器，`node:20-slim` + Playwright + Chromium。
- VPS 上仍用**有头 + Xvfb**（`xvfb-run -a node eastwind-rider-status.mjs`），比纯 headless 更不易被风控识别。
- 进程用 `pm2` 或 systemd 守护，挂了自动重启。
- profile 目录（`.eastwind-profile`）要持久化（挂卷），保住登录态。
- 频率维持 5 分钟、单会话，别并发。

示例 systemd（简化）：
```ini
[Service]
WorkingDirectory=/opt/eastwind-scraper
ExecStart=/usr/bin/xvfb-run -a /usr/bin/node eastwind-rider-status.mjs
Restart=always
EnvironmentFile=/opt/eastwind-scraper/.env
```

---

## 阶段 6 · 运维

1. **登录态过期告警**：日志出现 `LOGIN_REQUIRED` 时发邮件（MePonto 已接 SendGrid）。
   收到后到该机器重跑 `node login.mjs` 重登一次。
2. **数据归档/清理**（防膨胀）：加一个定时任务，明细保留 90 天后降采样或删除：
   ```sql
   delete from rider_status_snapshots where captured_at < now() - interval '90 days';
   ```
3. **健康监控**：定期看「最近一批 captured_at 是不是在 5 分钟内」，超时说明抓取器停了。

---

## 现在就能开始的顺序

1. （你）建账号 ✅ 已建
2. （你）阶段 1 建表 → 阶段 2 配密钥并部署
3. （你）阶段 3 本机 `login.mjs` + `npm start`
4. （一起）阶段 4 看第一批 raw，校准字段、确认关联键
5. （你）阶段 5 上 VPS 常驻 + 阶段 6 运维任务

阶段 4 我可以直接帮你看 raw、改解析器候选键。
```
