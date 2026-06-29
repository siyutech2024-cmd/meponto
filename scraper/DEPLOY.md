# Eastwind 抓取器 · 服务器常驻部署

目标：把抓取器从"开在你电脑终端"搬到一台常开服务器，按圣保罗时间
**10:30–22:30** 每 5 分钟抓骑手看板。关掉你电脑也不影响。

---

## 0. 选服务器（重要）

**强烈建议选「巴西/圣保罗」机房的小 VPS**（如 AWS sa-east-1、Vultr São Paulo、
Magalu Cloud、Hostinger BR）。原因：那个专用账号平时从巴西登录，登录态/设备风控
（secdd）对「IP 突然换国家」比较敏感。同区域 IP 能显著降低被挑战/掉登录的概率。

规格：1 vCPU / 1–2 GB 内存 / Ubuntu 22.04 即可（Chromium 跑得动）。

---

## 1. 装运行环境（Ubuntu 22.04）

```bash
# Node 20 LTS
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 部署目录
sudo mkdir -p /opt/eastwind-scraper && sudo chown $USER /opt/eastwind-scraper
```

把 scraper 目录传上去（在你 Mac 上执行；排除本地 profile/依赖）：

```bash
cd ~/Documents/MePonto
rsync -av --exclude node_modules --exclude .eastwind-profile \
  scraper/ <user>@<server-ip>:/opt/eastwind-scraper/
```

服务器上装依赖 + Chromium（含系统库）：

```bash
cd /opt/eastwind-scraper
npm install
npx playwright install --with-deps chromium
```

---

## 2. 登录态：把已登录的 profile 搬过去（推荐）

服务器没有图形界面，没法直接手动登录。最简单：**把你 Mac 上已登录的
`.eastwind-profile` 拷过去**（会话 cookie 随之转移）。

在你 Mac 上（先停掉本地 `npm start`）：

```bash
cd ~/Documents/MePonto/scraper
rsync -av .eastwind-profile/ <user>@<server-ip>:/opt/eastwind-scraper/.eastwind-profile/
```

> 备选（若 profile 拷过去后仍提示 LOGIN_REQUIRED）：在服务器装轻量桌面 + VNC，
> 用 `HEADLESS=false node login.mjs` 在 VNC 里手动登录一次。一般用不上。

---

## 3. 配置 .env

`/opt/eastwind-scraper/.env`（rsync 已带上，确认这几项）：

```
MEPONTO_INGEST_URL=https://sys.meponto.com/api/eastwind/rider-status
MEPONTO_INGEST_TOKEN=db1e6d6411c0ca4c392c878074de8c5a0b053dfb94aa85ee
CITY_ID=55000199
INTERVAL_MIN=5
SHIFT_START=10:30
SHIFT_END=22:30
TZ=America/Sao_Paulo
HEADLESS=true
```

> `.env` 不进 git（已 gitignore），需手动确认存在于服务器。

---

## 4A. 用 pm2 跑（推荐，简单）

```bash
sudo npm install -g pm2
cd /opt/eastwind-scraper
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup        # 按提示执行它打印的那条 sudo 命令 → 开机自启
pm2 logs eastwind-scraper   # 看日志，应见 ingest 200
```

常用：`pm2 restart eastwind-scraper`、`pm2 stop ...`、`pm2 status`。

## 4B. 或用 systemd（二选一）

```bash
sudo useradd -r -s /usr/sbin/nologin eastwind 2>/dev/null || true
sudo chown -R eastwind /opt/eastwind-scraper
sudo cp /opt/eastwind-scraper/eastwind-scraper.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now eastwind-scraper
journalctl -u eastwind-scraper -f
```

---

## 5. 验证

- 日志出现 `starting scraper { ... shift: '10:30-22:30' ... }`
- 时段内每 5 分钟一条 `ingest 200: {"ridersInserted":N,...}`
- 时段外打印 `outside shift window — skip`（正常）

数据库侧（Supabase）确认最近一批在 5 分钟内：

```sql
select max(captured_at) from rider_status_snapshots;
```

---

## 6. 运维

- **登录态过期**：日志出现 `LOGIN_REQUIRED` → 重新拷一份新的 `.eastwind-profile`
  上来（在 Mac 上重跑 `node login.mjs` 后 rsync），或走 VNC 方案。建议把这行日志
  接到告警（MePonto 已有 SendGrid）。
- **反爬挑战**（少见）：把 `.env` 改 `HEADLESS=false`，装 `sudo apt-get install -y xvfb`，
  systemd 改用 `xvfb-run -a node ...`（unit 文件里有注释），更像真人。
- **数据归档**：另加定时任务，明细保留 90 天：
  `delete from rider_status_snapshots where captured_at < now() - interval '90 days';`
- **监控**：可加一个外部检查，若 `max(captured_at)` 超 15 分钟没更新就告警。
  实时看板页本身也会在最新批次超 15 分钟时显示「数据已过期」红标。

---

## 7. 登录态过期 → 重新登录（约每周一次）

Eastwind 风控会周期性让登录失效。表现：看板停更、看板顶部红标、日志刷
`nothing captured ... pc-login`。**务必在 `.env` 配 `ALERT_WEBHOOK_URL`**，
这样一过期手机就收到告警，而不是几天后才发现。

重新登录（需要：1 个 VPS 终端 + 1 个 Mac 隧道终端 + 一个 VNC 查看器）：

```bash
# ① VPS（先 ssh root@<vps>，确认提示符是 root@srv...，再跑）
cd /opt/eastwind-scraper && bash novnc-login.sh
#   等待出现 "x11vnc listening on 5900 OK" 并停在 "press Enter"，先别按

# ② Mac（另开一个本机终端）建隧道（端口被占就换 5902/5903…）
ssh -L 5901:localhost:5900 root@<vps> -N

# ③ Mac 连 VNC：RealVNC Viewer 或系统屏幕共享 → localhost:5901，密码 eastwind99
#   在 VPS 桌面浏览器里手动登录 99/Didi，直到看见骑手看板

# ④ 回 ① 的 VPS 终端按 Enter → 会话保存、抓取器自动重启
```

要点：登录必须在 **VPS 自己的浏览器**里完成（会话绑定 VPS 的 IP+浏览器指纹，
从 Mac 拷会话过去无效）。完成后 `pm2 logs eastwind-scraper` 应恢复 `ingest 200`。
