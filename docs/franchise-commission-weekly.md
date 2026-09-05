# 结算口径 v2 · 加盟商佣金与骑手工资(2026-09-05/06)

> 业务方 2026-09-05 确认。生效周:**2026-08-31(周一)起的自然周**。之前的周一律按旧口径显示,历史数据、已有付款记录一个字节不动 —— 那些周已经结算过了。

## 两个数字,分开显示,互不冲抵

| 数字 | 公式 | 谁付给谁 · 频率 | 数据来源 |
| --- | --- | --- | --- |
| **加盟商应付骑手** `riderPayable` | Σ 今日统计 `total`(= 行程收入 + 奖励 + 小费 + 其他 + 人工调整 + 推荐奖励 − 现金单欠款 − 餐损) | 加盟商 → 骑手 · **每日** | `riderDailyEarnings`(99 结算表导入) |
| **总部应付加盟商佣金** `commission` | `round(Σ 行程收入 tripIncome × 抽佣比例 / 100, 2)` | 总部 → 加盟商 · **每周** | 同上 + 考核看板 |
| 抽佣比例 `pct` | `max(最小抽佣, 最小抽佣 + Σ KPI 加减)`,与 `/assessment` 考核页同一函数 `buildAssessmentBoard` | — | `assessmentRules` + `riderDailyKpis` |

- 只统计**普通池**骑手(`rider.pool !== "pro"` 且行的 `account !== "pro"`)。PRO 维持 完单 × R$12 的既有口径,PRO 运营即将取消。
- 某加盟商当周没有 KPI 行 → 所有指标 na → 不加不减 → 取最小抽佣。
- 校验示例(`tmp-settlement/…settlement-2026-07-11.csv` 第一行):`Total do dia 333.49 = Renda de viagem 379.31 + Bônus 56 − Dívida em dinheiro 101.82`。

## 生效与冻结

- `AssessmentRule.commissionEffectiveFrom`(考核页规则编辑器"佣金生效周"字段)。缺省 `COMMISSION_EFFECTIVE_FROM_DEFAULT = "2026-08-31"`。
- `/api/wallet?view=weekly`:周窗口 `from < 生效周` → 返回体与改动前**逐字节一致**(不附加任何佣金字段);`>=` 生效周 → 每个加盟商附加 `commission` 对象,顶层附加 `commission` 汇总。
- **支付即冻结**:`POST /api/wallet {action:"payCommission", franchise, weekFrom, weekTo}`(仅总部)由服务端计算金额,追加一条 `walletPayments` 记录:`target:"franchise", kind:"commission", commission:{pct, tripIncome, commission, riderPayable, riders, days, minPct, totalAdjust, metrics}`。之后该周看板读快照,KPI 重导入 / 规则调整不再改变已付周的数字。一周一个加盟商只能付一次(409 `already_paid`);生效周之前的周拒绝(409 `before_effective`)。
- 佣金付款与结算付款(既有 `target:"franchise"`,`kind` 缺省 = settlement)**互不混算**:不计入"已付·总部→商",不参与 `recordPayment` 的超付校验,不级联标记骑手已付。
- 审计:`FRANCHISE_COMMISSION_PAID`。

## 数据层

- 内存集合:复用 `walletPayments`(未新增集合,`module:guard` 棘轮不变)。
- W3 镜像表 `wallet_payments`:迁移 `20260905120000_wallet_payments_commission.sql` 增加 `kind`(默认 `settlement`)与 `commission jsonb`。`paymentToRow` 只在佣金行带这两列,因此迁移执行前既有付款镜像照常;佣金行在迁移前会被 mirror 拒绝(仅 warn,legacy JSONB 不受影响)。**部署顺序:先跑 `db-migrate`,再推代码**(与 `push-migrate-guard.command` 复盘一致)。

## 涉及文件

`app/lib/assessment.ts`(`buildAssessmentBoard` 提为共享纯函数 + 生效周字段)· `app/api/assessment/route.ts`(改为调用共享函数;`saveRule` 接收 `commissionEffectiveFrom`)· `app/lib/finance.ts`(`WalletPayment.kind/commission`,`FranchiseCommissionSnapshot`)· `app/api/wallet/route.ts`(weekly 附加字段、`payCommission`、佣金行排除)· `app/lib/server/db/finance-repo.ts` · `supabase/migrations/20260905120000_wallet_payments_commission.sql` · `app/wallet/page.tsx` · `app/assessment/page.tsx` · `app/lib/i18n.ts`(zh/en/pt 各 16 key + `asCommissionFrom`)。

## 池筛选(全部 / PRO / 普通)—— 2026-09-06 修正

之前筛选只过滤表格行,组头部与顶部合计仍是加盟商全量,切换时数字不变。现在**所有可见金额都跟随筛选**:顶部三张统计卡、工具栏"该周应结"、每个加盟商头部的 应结 / 已付 / 待付 都按筛出的骑手重算(已付 = Σ 骑手已付,含已付 PIX 提现;待付 = Σ 骑手净额 − 已付)。「全部」视图口径不变。因为加盟商级付款记录不分池,"标记付加盟商 / 支付佣金"按钮只在「全部」视图出现;佣金行与佣金合计在 PRO 视图隐藏(佣金只算普通池)。

## 结算口径 v2 全链路(2026-09-06 业务方确认,生效周同 `commissionEffectiveFrom` = 2026-08-31)

**唯一取数入口:`app/lib/settlement.ts`**(`payableOf` / `poolOfRow` / `breakdownOf` / `deductionOf`)。周结算板、每日对账单、付款超付校验、级联标记、骑手 App 钱包、倒扣待扣全部由它决定"一行值多少钱",不再各写一份。

### 为什么要改
- 24 份真实结算表 310 行实测:系统 `settleAmount` = 表格"金额"列 **= 行程收入(310/310)**,不含奖励,也没扣现金;而表格 `今日统计 = 行程收入 + 奖励 + 小费 + 其他 + 人工调整 + 推荐奖励 − 现金单欠款 − 餐损`(310/310 成立),这才是加盟商每日实付。
- 由此派生:普通池现金从未被扣;倒扣待扣对普通骑手永不触发(行程收入 ≥ 0);骑手 App 余额与实付不一致且提现与每日付款是并行通道。

### v2 规则(生效日起的每一行)
| 项 | 口径 | 谁付谁 |
|---|---|---|
| 应付骑手(每日) | `今日统计`(表格原值);为负 → 倒扣待扣 | 加盟商 → 骑手,每日 Trampay |
| 骑手工资(每周) | Σ 今日统计(普通池) | 总部 → 加盟商 |
| 佣金(每周) | 考核抽佣比例 × Σ 行程收入(普通池) | 总部 → 加盟商,与工资分开显示 |
| PRO 池 | 完单 × 费率(不变);池按**行的 account** 判定,不再按骑手当前 pool | — |
| 骑手已付 | 按 99ID 归集(新记录带 `rider99Id`;历史记录回退姓名) | — |
| App 提现 | 停用(`requestWithdrawal` → 409 `withdrawals_disabled`);钱包页改为每日结算单 + 已付状态 | — |
| 导入校验 | 今日统计 ≠ 各列重算 → 行记 `totalMismatch`,响应返回 `totalMismatches`,页面标 ⚠;原值照旧入库 | — |

生效日之前的每一行、每一周:`payableOf` 返回 `settleAmount`、池按骑手 pool、姓名 key —— 接口返回体与页面逐字节不变(实测 08-24 周 965.63 不变,无 v2 字段)。

### 接口变化(仅 v2 周/日期)
- `GET /api/wallet?view=weekly`:顶层 `settlementVersion: 2`, `v2From`;每个加盟商 `wages`, `wagesBreakdown{tripIncome, extras, cashDebt, mealDeduction, total, consistent}`;普通池骑手行 `breakdown`。同一骑手转池后同周出现普通+PRO 两行(rowKey = 99ID|池)。
- `GET /api/wallet?statement=`:每行 `payable`, `v2`, `pool`, `consistent`, `totalMismatch`, `paid`(按 99ID);`total` = Σ payable,`legacyTotal` = Σ settleAmount。
- `GET /api/wallet?riderName=`:`daily[]`(31 天,含拆解与已付)、`withdrawalsEnabled`、`settlementVersion`。
- `POST recordPayment`:接受 `rider99Id`;超付校验与级联口径同看板(普通 payableOf + PRO 完单×费率),级联也扣已付 PIX 提现。
- `POST /api/performance importEarnings`:响应 `totalMismatches[]`。
- 迁移 `20260905120000`:`wallet_payments` 加 `kind`, `commission`, `rider99_id`。
