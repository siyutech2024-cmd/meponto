# MePonto 数据核心根治方案 — 终态架构与全量迁移路线图

> 定位：这是**根治**方案，不是续命。终点是彻底告别"内存集合 + JSONB 镜像"架构，
> Postgres 成为唯一事实源。`docs/phase2-transactional-core-migration.md`（交易核心三表 +
> 原子兑换 RPC）自动成为本方案的 **Wave 1**，其表结构、RPC、双写/对账/回滚策略原样沿用。
> `docs/overview-read-path-optimization-plan.md` 的 L1/L2 是过渡期止血，终态下自然废弃。

---

## 1. 病根（为什么修补永远修不完）

当前架构：60+ 个内存集合是事实源，`app_state_records`（JSONB，一行一记录）只是镜像；
每个请求"全量刷入内存 → 内存读改写 → 回刷数据库"。由此派生全部顽疾：

| # | 症状 | 根因 | 已打的补丁（都是续命） |
| --- | --- | --- | --- |
| 1 | 页面越用越慢 | 读 = O(全集合下载) | overview RPC、翻页修复、快照缓存 |
| 2 | 超卖/积分双花风险 | 多实例内存互不可见，读改写无锁 | 无法在现架构内根治 |
| 3 | 写入丢失 | 先响应后落库 | 24 个路由补 flush（治标） |
| 4 | 数据质量靠自觉 | JSONB 无外键/唯一/CHECK 约束 | 无 |
| 5 | 冷启动慢 | 每个新实例重新水合全部集合 | TTL 调参（治标） |

**结论：症状 2、4 在现架构内无解。根治 = 换数据层，别无他路。**

## 2. 终态架构（Definition of Cured）

1. **Postgres 是唯一事实源**：热数据全部住进带约束、带索引的真表；路由直接查库，
   `memory.*`、`refreshCollectionsFromDatabase`、`flushPendingToDatabase`、集合 Proxy 全部删除。
2. **仓储层（Repository Layer）**：新增 `app/lib/server/db/<module>.ts`，路由只调用
   `ordersRepo.findByRider(id)` 这类方法，不写裸 SQL——路由改造因此是机械替换。
3. **钱、积分、库存的每一次变更都在数据库事务里**：复用 phase2 的原子 RPC 模式
   （行锁 + CHECK 约束 + 幂等键），并发压测 50 并发无双花无超卖是硬验收。
4. **账本硬化**：所有 `*LedgerEntries` 迁为 append-only 表（禁 UPDATE/DELETE），
   余额一律走快照表（`points_balances` 模式），彻底消灭"全量求和"。
5. **`app_state_records` 降级为配置存储**：只保留低频小集合（见 §3 W7），表保留归档，
   一年后再议删除。
6. **护栏进化**：`module:guard` 新增规则——禁止新增 `trackCollection`、禁止路由 import
   `memory`（白名单渐减至零）；`verify:persistence` 改为校验仓储层。

## 3. 全量集合处置表（60+ 集合 → 7 个 Wave）

迁移优先级 = 风险消除价值 × 读写频率。**每个 Wave 一支分支、一个 flag、独立可回滚。**

| Wave | 集合 | 去向 | 为什么在这个位置 |
| --- | --- | --- | --- |
| **W1 交易核心**（= phase2 草案） | pointsLedgerEntries、marketplaceOrders、站点库存（stationStockLedgerEntries → station_stock 池） | `points_ledger` + `points_balances`、`marketplace_orders`、`station_stock` + 原子 RPC | 双花/超卖是最高风险；方案已评审过半 |
| **W2 报表事实表** | riderDailyKpis、riderDailyEarnings | `rider_daily_kpis`、`rider_daily_earnings`（按 (rider99Id,date) 唯一，date 索引） | 只增不减、导入幂等、无并发写——**最容易迁**，且是页面慢的最大贡献者；建议与 W1 并行首发 |
| **W3 金融账本族** | riderWithdrawals、walletPayments、cashLedgerEntries、cashTopUps、mallPayments、franchiseDepositLedgerEntries、franchiseDepositTopUps、mallRevenueShareEntries、revenueShareStatements、procurementMarginEntries、inventoryLedgerEntries、partnerPointsLedgerEntries、ledgerEntries | 每个一张 append-only 表 + 各自余额/状态快照 | 钱的第二梯队；结构与 W1 同构，复制模式即可 |
| **W4 身份与组织** | riders、appUsers、franchises、pontos、leaders | 真表 + 唯一约束（phone/cpf/identifier）+ 外键（rider→ponto→franchise） | 登录、RBAC、脱敏都读它们；等 W1–W3 团队手熟后再动认证链路 |
| **W5 排班调度** | dispatchShifts、shiftQuotas、shiftSignups、riderSlots、slotEnrollments、hotZoneAssignments | 真表 + (shift,rider) 唯一约束（根治重复报名） | 有并发报名竞态，但金额风险低于 W1/W3 |
| **W6 商城目录与协作** | marketplaceProducts、mallCategories、mallBanners、mallCoupons、priceChangeRequests、purchaseOrders、franchisePurchaseOrders、supplierProfiles、supplierStatements、procurementDiscrepancies、crmPartners、crmCategories、partnerServiceRecords、partnerReviews、supportTickets、incidents、leads、memberMessages、chatRooms、chatMessages | 真表（结构直译，低风险批量走） | 中低频，机械迁移 |
| **W7 留在配置存储**（不迁） | systemSettings、mallConfigs、assessmentRules、appSplashConfigs、appTasks、taskClaims、rewards、notifications、pushSubscriptions、fcmTokens、auditEntries* | 留在 `app_state_records` | 几十~几百行的小配置，迁移无收益；*auditEntries 例外——量大，建议随 W3 顺手迁 append-only 表 |

## 4. 每个 Wave 的标准作业流程（一次定义，七次复用）

```
S1 建表 + 索引 + 约束 + （需要时）事务 RPC        —— 上线即空转，零风险
S2 仓储层 lib/server/db/<module>.ts + 单元测试
S3 双写：路由写内存集合的同时写新表（flag: <module>CoreEnabled，默认 off）
S4 回填：app_state_records → 新表；对账脚本（行数、金额、余额三方核对）
S5 影子读 7 天：请求同时读两边，diff 记日志，为空才允许下一步
S6 读切换（flag 灰度：先 1 个加盟商/站点 → 全量）
S7 停写旧集合；从各路由 COLLECTIONS 移除；镜像数据只读归档
S8 删除该模块的 memory 依赖；module:guard 白名单收缩一格
```

回滚：S3–S6 任一步关 flag 即回旧路径（双写保证旧数据始终最新）；S7 之后回滚 = 重开双写。

## 5. 里程碑与工作量（一人全职估算）

| 里程碑 | 内容 | 工作量 | 退出标准 |
| --- | --- | --- | --- |
| M0 | 仓储层骨架 + 双写/对账/影子读工具函数 + module:guard 新规则 | 3 天 | 工具函数有测试 |
| M1 | **W2 报表事实表**（先易后难练手） | 3 天 | performance/wallet/overview 读新表，全站最慢页面 <500ms |
| M2 | **W1 交易核心**（按 phase2 草案 M1–M5） | 2 周 | 50 并发压测无双花无超卖；对账 7 天全绿 |
| M3 | W3 金融账本族 | 1.5 周 | 同上对账标准 |
| M4 | W4 身份组织 + W5 排班 | 1.5 周 | 登录/RBAC 回归全过；重复报名压测通过 |
| M5 | W6 批量直译 + 退役收尾（删 memory/persistence 机制、归档镜像表） | 1 周 | 仓库 `grep -r "memory\." app/api` 为零 |

**总计约 7–8 周**。每个里程碑独立发版、独立回滚，任何时刻 main 可部署（CLAUDE.md 铁律）。

## 6. 风险与对策

- **双写窗口不一致** → 对账脚本每日跑，diff 非空自动告警并阻断下一步；
- **回填期间线上还在写** → 回填按 `updated_at` 水位增量重放，最后停写 60 秒做终态校验；
- **RPC/SQL 逻辑与 TS 旧逻辑不一致** → 影子读 diff 是唯一裁判，不靠人肉审查；
- **迁移疲劳/半途而废** → W2 先行拿到"全站变快"的显性收益，为后续 Wave 换取耐心；
- **Supabase 单点** → 终态天然支持 PITR 时点恢复（真表 + WAL），比 JSONB 镜像更可恢复。

## 7. 验收（整体 Definition of Cured）

- [ ] 症状表 5 项逐条复测：任意页面 P95 < 500ms；并发压测无双花/超卖/重复报名；
      kill -9 实例零写入丢失；约束层拒绝脏数据（负余额/重复 CPF 插不进去）；冷启动无水合。
- [ ] `app/api` 下无任何 `memory.` 引用；`refreshCollectionsFromDatabase`/`flushPendingToDatabase` 已删除。
- [ ] 全部 `*_ledger` 表禁 UPDATE/DELETE 生效（护栏 #4 落到数据库层）。
- [ ] `npm run codex:preflight:full` 与对账脚本进 CI，红灯阻断合并。
- [ ] `docs/architecture.md`、`docs/api.md`、事件契约（`.v2`）更新完毕。
