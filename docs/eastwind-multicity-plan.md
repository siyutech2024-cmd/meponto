# Eastwind 老号多城市抓取方案（São Paulo + São João da Boa Vista）

更新：2026-08-27 ｜ 状态：方案设计（未实现，确认后动代码）
背景：老 OL 账号新增城市 São João da Boa Vista，下周开始新区域运营。
目标：sys.meponto.com 实时监控覆盖**两个城市的全部骑手**，且不破坏现有单城市数据链路。

## 一、现状与关键约束（已核实）

- 抓取方式：`scraper/eastwind-rider-status.mjs` 用持久化 profile 的真浏览器打开
  `/monitor/riders/list`，捕获页面自己发出的 gateway XHR（riderList / KPI / riderTarget）。
  请求逐条由页面 JS 签名（wsgsig / secdd-*），**无法服务端重放** → 切换城市只能
  在页面里点地图上的城市下拉框，让页面自己重新发请求。
- 城市标记：抓取器 env `CITY_ID`（默认 55000199 = SP）只是随 POST 上报的标签，
  并不驱动页面；页面显示的城市 = 会话里上次选中的城市。
- **入库坑（本方案必须一起改）**：`app/api/eastwind/rider-status` 幂等删旧的范围是
  `(captured_at, source)`。若同一轮按城市分两次 POST（同 source、同对齐分钟），
  **第二城会把第一城整批删掉**。
- KPI 口径：`rider_kpi_snapshots` 每批一行（带 city_id 列）；`riders-live` 取当日
  每个 source 的最后一行做头部 KPI。两城交替上报后「最后一行」会在两城之间跳变；
  且 AR/%TSH 是比率，**不能跨城直接平均**。
- 快照本身已带 `city_id`（`app/lib/eastwind.ts` parseRiders 全链路透传），riders-live
  返回骑手明细后地图/列表自动可见 —— 展示层新城市骑手"出现"不需要改动。
- 骑手归属：新区域会建新加盟商/站点（业务确认 2026-08-27），监控页现有
  byFranchise / byPonto 分组天然可区分两城。

## 二、改动设计（三层，均为小改）

### 1) 抓取器 `scraper/eastwind-rider-status.mjs`

- 新 env `CITIES`（JSON 数组，保序）：
  `[{"name":"Sao Paulo","id":"55000199"},{"name":"São João da Boa Vista","id":""}]`
  未配置时行为与现在完全一致（单城市，零回归）。
- 每轮 pull：打开页面后 for each city：
  1. 读地图选择器当前城市文本，已是目标城则跳过点击；否则点选择器 → 点城市名
     （getByText 精确匹配，PT/EN 界面下城市名不变）。
  2. `waitForResponse(riderList)`（切换会触发重新请求）→ settle → 收取该城
     riderList/KPI；`caps` 每城清空重建。
  3. cityId 解析优先级：riderList 请求 URL 里的 city 参数（自动提取，首轮日志打印
     完整 URL 便于确认参数名）→ env 配置 id → 城市名兜底。
  4. 骑手详情点击照常，`detailMax` 为全轮共享上限，`deadline` 仍是全轮 4 分钟
     （新城初期骑手少，成本可忽略）。
  5. **每城分别 POST**（cityId 不同）；某城切换/捕获失败：告警
     `CITY_SWITCH_FAILED(<name>)`，跳过该城，**不影响其它城入库**。
- 轮末把页面切回首城（可选），避免会话默认城漂移影响下轮首屏。

### 2) Ingest `app/api/eastwind/rider-status/route.ts`

- 两处 delete 收紧为 `(captured_at, source, city_id)`：
  `rider_status_snapshots`、`rider_kpi_snapshots` 各加一个 `.eq("city_id", cityId)`。
- 单城市 feed（PRO 号、未升级的老号）city_id 恒定 → 行为不变，**向后完全兼容**，
  可先于抓取器部署（部署顺序无约束，但建议先发 ingest）。

### 3) 读取 `app/api/eastwind/riders-live/route.ts`

- 头部 KPI 改为**按城取行**：当日每 (source, city) 各取最后一行；
  `kpi` = 主城（SP，DEFAULT_CITY）的行，口径与今天一致，不跳变；
  响应新增 `kpiByCity: { [cityId]: {...} }` 供二期 UI 使用（一期不消费，不算新能力，
  无需 flag）。计数类字段（acceptCnt/finishedCnt）如需"全网合计"可求和，
  比率类（AR/CAA/%TSH）只按城展示，不做跨城平均。
- 骑手对象透传 `city`（city_id），供二期筛选。

## 三、二期（数据链路稳定后另开分支）

rider-monitor 城市/区域筛选：全部 / SP / São João 切换，分城 KPI 条，地图按所选
区域 fitBounds（两城相距约 200km，不筛选时地图缩得太小）。按 CLAUDE.md：三语文案、
feature flag（默认关）、走 preflight。T+1 考核与 KPI 序列的分城口径同期确认，
避免新城数据稀释老城考核数字。

## 四、部署与验证

1. 仓库内改完 → `npm run codex:preflight` 绿（app 侧两个文件）。
2. Vercel 发布 ingest + riders-live（先发，兼容旧抓取器）。
3. 抓取器上 VPS：新增 `push-scraper-multicity.command`（rsync `eastwind-rider-status.mjs`
   + `.env` 增量 `CITIES` → `pm2 restart eastwind-scraper` → 打印 15 行日志）。
   仅动老号实例，**PRO 实例（systemd）不碰**。
4. 验证清单：
   - [ ] 日志出现两城各一条 `ingest 200`，无 CITY_SWITCH_FAILED；
   - [ ] 首轮日志确认 riderList URL 的 city 参数名与 São João 的真实 cityId，回填 env；
   - [ ] `riders-today`：standard 池骑手含两个 city_id；
   - [ ] rider-monitor 地图出现 São João 的点（新加盟商分组正确）；
   - [ ] KPI 头仍为 SP 口径、数值不跳变；PRO 池链路不受影响；
   - [ ] 连续 3 轮（15 分钟）两城批次时间都在刷新。
5. 回滚：抓取器删掉 `CITIES` env 重启即回单城市；ingest 改动兼容单城，无需回滚。

## 五、风险

| 风险 | 应对 |
|---|---|
| 下拉框 DOM 变化 / 点不中 | 每城独立 try，失败只丢该城并告警；保留 debug 截图 |
| 切城后 riderList 未触发重新请求 | waitForResponse 超时兜底：主动 reload 后再等一次 |
| 两城详情点击拉长轮次 | 全轮 4 分钟 deadline 不变，partial 优于卡死；watchdog 已有 |
| KPI「最后一行」跳变（改动前旧数据） | riders-live 按城取行后自然消除 |
| 会话默认城漂移 | 每轮显式选城，不依赖默认值 |

## 六、待确认

- São João 的 cityId（首轮日志自动打印后回填）。
- 新加盟商/站点建档时间（开营前建好，骑手才能正确归组）。
- 新城抓取时段是否与 SP 相同（SHIFT_START/END 目前全局共享）。
