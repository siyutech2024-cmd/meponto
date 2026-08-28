# 组长模式（Leader Mode）设计文档 / Station-Leader Mode Design

> 状态：设计定稿（与运营方逐条确认完毕），待评审排期。
> 目标：新开城市以"站长（组长）+队伍"轻资产模式复制，圣保罗大区物理 Ponto 模式**零改动**。
> 原则：不建新系统、不建新实体、不改骑手绑定与骑手结算链路——组长模式是**站点系统的一种运营形态**。

---

## 1. 核心决策记录（与运营确认的定稿）

| # | 决策 | 结论 |
| --- | --- | --- |
| D1 | 组长身份 | 组长=站长=站点账号（1 站 1 账号），加盟商创建，登录现有 Painel do Ponto。账号上补收款信息（Pix/CPF）。站长若本人跑单，可选关联其骑手记录（启用自跑占比上限用） |
| D2 | 骑手接入 | 不变：Eastwind 出现的骑手自动进总部后台，运营绑定 加盟商+站点（现有 assign） |
| D3 | 骑手结算 | 不变：总部 T+1 直付骑手（Trampay），资金不经组长，组长不可见骑手收入 |
| D4 | 数据基础 | 以 T+1 表格导入为准（riderDailyKpis）；导入时按**当日绑定关系**给每行打站点标（归属固化，永不回溯） |
| D5 | 排班 | 总部分配 slot 额度给加盟商 → 加盟商分配给站点 → **组长必须 T-1 完成填报**（与现逻辑一致） |
| D6 | 考核不达标 | 骑手留在总部系统，**换绑站长**即可（批量 rebind / 暂不绑=回池）。无降级状态机 |
| D7 | 通知触达 | 暂不改 APP。系统生成葡语日报文本，**总部运营经 WhatsApp 转发**；门户看板为详情入口 |
| D8 | 管理规模 | 5–12 人（下限软线：跌破 5 人给 14 天补人缓冲；上限为加盟商护栏内配置，默认 12） |

## 2. 开关与数据结构

### 2.1 唯一开关

```ts
// franchise 记录新增（默认 undefined = off，圣保罗全部不动）
leaderMode?: boolean;
```

开启后：该加盟商的站点允许 `virtual: true`（免场地字段）、门户出现"考核与结算"页签、
考核/结算引擎将其站点纳入计算。关闭状态下所有新代码路径均不执行。

### 2.2 站点（复用 pontos，新增字段）

```ts
virtual?: boolean;                  // 组长模式站点，无物理场地
stationStatus?: "trial" | "active" | "suspended" | "closed";  // 默认 active；trial 用独立门槛
leaderName?: string;
leaderPixKey?: string;              // 结算收款
leaderCpf?: string;                 // 收款人校验（LGPD：门户内脱敏显示）
leaderRiderId?: string;             // 可选：站长本人的骑手记录（自跑占比上限用）
trialStartedAt?: string;            // trial 起点，14 天窗口
```

### 2.3 KPI 行打标（D4，导入管道内完成）

`ninety-nine-import` 写入 riderDailyKpis 时新增：

```ts
stationId?: string;    // 当日 rider.ponto 的快照
franchise?: string;    // 同上
importBatchId: string; // 追溯用
```

**规则：考核只按行上的 stationId 聚合。周中转站、事后改绑均不影响已打标数据。**

### 2.4 考核快照（唯一新增集合，append-only）

```ts
type LeaderAssessment = {
  id: string;                // `${stationId}:${isoWeek}`，如 "p12:2026-W36"
  stationId: string; franchise: string; week: string;
  state: "provisional" | "closed" | "settled" | "adjusted";
  metrics: {
    activeRiders: number;        // 周内 ≥minOrdersPerActiveRider 单的绑定骑手数
    totalOrders: number;
    avgOrdersPerRider: number;
    slotFilingOnTimePct: number; // T-1 前完成填报的班次占比（系统自产数据）
    leaderSelfOrdersPct?: number;// 站长自跑占比（关联了 leaderRiderId 才有）
  };
  targetsSnapshot: LeaderTargets;   // 计算时的目标快照（防规则变更争议）
  gaps: { metric: string; deficit: number }[];  // 瓶颈归因输出
  passed: boolean;
  importBatchIds: string[];         // 数据溯源
  dataCompleteDays: number;         // 完整性闸门：<7 不得 close
  createdAt: string; closedAt?: string;
};
```

状态机：`provisional`（周内每次导入后重算覆盖）→ `closed`（周日 24:00 后且 7 天数据齐 + 48h 申诉期过）→ `settled`（付款单生成）→ `adjusted`（付款后修正，走下期冲正，历史快照不改）。

### 2.5 考核目标与结算规则（加盟商配置，护栏内）

```ts
type LeaderTargets = {
  minActiveRiders: number;          // 默认 5（软线：连续 2 周低于才判不达标）
  minOrdersPerActiveRider: number;  // "活跃"定义，默认 10 单/周
  minWeeklyOrders: number;
  minSlotFilingPct: number;         // 默认 90%
  maxTeamSize: number;              // 总部护栏 8–15，默认 12
  selfOrdersCapPct?: number;        // 默认 30%，未关联 leaderRiderId 则不启用
};

type LeaderSettlementComponent = {
  key: string;                      // "base" | "bonus" | 未来扩展
  label: { zh: string; en: string; pt: string };   // 三语（护栏 #7）
  type: "per_order" | "kpi_tiered" | "fixed";
  params: Record<string, number>;   // per_order: {amountBRL} / kpi_tiered: {ratePerOrder, tiers…}
  cycle: "d1_daily" | "weekly";
  effectiveFrom: string;            // 强制 = 下一周期起点，当期锁定
  version: number;                  // 全量变更日志，改动提前 7 天公告
};
```

## 3. 自动化闭环

```
T+1 导入成功（含站点打标）
 ├─ 未匹配骑手 → 待办队列（加盟商+运营）
 ├─ 触发重算：本周 assessment → provisional
 ├─ 金额守恒自检：Σ组长应计 ≈ 单量×费率；导入单量 vs Eastwind 差异>阈值 → 拦截+告警
 ├─ 瓶颈归因：缺人（差 N 人+池内候选）/ 人效（低于人均的骑手名单）/ 填报（漏报班次）
 └─ 生成葡语日报文本 → 总部运营后台展示 → 运营复制转发 WhatsApp（D7）
周日 24:00 封周 → 数据完整性闸门 → 48h 申诉期 → closed
 └─ passed → 按结算组件生成 walletPayments（收款人=站点 Pix）→ 加盟商复核 → Trampay 批付 → settled
```

组长行动闭环（半自动，权限保留在平台侧）：
门户看到缺口 → 对未绑定骑手发起**绑定申请** → 加盟商待办一键批准 → 生效（次日 KPI 打标即计入）。

## 4. 门户与后台改动

- **Painel do Ponto（组长端）新增"考核与结算"页签**：本周进度条（三指标 vs 目标线）、
  瓶颈归因卡、队员列表（单量/活跃状态/黄牌预警，**不含收入与完整 CPF**）、
  池内候选（同城未绑定骑手，按近 28 天单量排序）+ 绑定申请按钮、结算明细（按组件分行、标注规则版本）。
- **加盟商端新增"待办"页**：待复核付款单 / 待批绑定申请 / 未匹配骑手 / 申诉 / 豁免日标记，各带一键操作。
- **总部端新增横向列表页**：leaderMode 城市 × 站点考核分布、周结算总额、金额自检异常。
- **总部运营端**：WhatsApp 日报文本聚合页（按加盟商分组，一键复制）。

## 5. 硬规则（v1 必须带上线）

1. 归属以导入打标为准（D4），转站不回溯；
2. "活跃骑手" = 周内 ≥N 单，杜绝拉人头（配合现有同设备/同收款账户风控）；
3. 站长自跑占比上限（仅当关联 leaderRiderId）；
4. 封周后数据修正一律走下期 `adjusted` 冲正，快照 append-only；
5. 规则变更 `effectiveFrom` 强制下周期生效 + 7 天公告；
6. 豁免日：加盟商可标记（暴雨/平台故障），当日不计考核，留审计日志；
7. 金额守恒自检不通过 → 结算流程拦截，人工介入；
8. 话术合规：全部使用权益语言（"优先权益按表现分配"），避免义务/处罚表述（CLT 风险）；
   组长界面按 LGPD 脱敏。

## 6. PR 拆分

| PR | 内容 | 模块 | 备注 |
| --- | --- | --- | --- |
| PR-1 | `leaderMode` flag、站点新字段、导入打标、LeaderAssessment 集合+重算 API、归因计算、金额自检 | franchise / pontos / ninety-nine-import / 新 `app/api/leaders/assessment` | flag off 时零行为变化 |
| PR-2 | 结算组件配置+生成 walletPayments、门户页签、加盟商待办页、总部列表、WhatsApp 日报页 | wallet / ponto portal / franchise portal | 依赖 PR-1 数据 |

## 7. 新组长申请与推荐（防晋升阻断）

> 仅 `franchise.leaderMode === true` 的加盟商辖下骑手可见/可用。
> 设计核心：绕开组长的通道 + 客观资格线 + 把"被挖走"变成"有奖毕业"。

### 7.1 资格与通道

- **资格系统自动判定**（T+1 数据，加盟商护栏内配置）：近 28 天 ≥N 单、在网 ≥8 周、活跃 ≥6 周。
  组长不知情、不在审批链、**无否决权**。
- **自荐**：达标骑手经 Web 表单（现有 rider-login 登录）提交，直达加盟商待办页；审批前对组长保密。
- **推荐**：组长/加盟商可推荐骑手开站；新站转正后推荐人得推荐奖（复用现有 R$300/600 单、R$500/1000 单规则，系统自动判定发放）。
- **培养奖**：自荐成功的，原组长同样获得培养奖（略低于推荐奖）——买断堵人动机；
  培养出站长计入原站点荣誉指标。

### 7.2 保护规则

1. **失败安全网**：试运营失败自动绑回原站点（组长无权拒收）或回池；
2. **限带走人数**：新站长从池内组队，原站点最多带走 2 人（原组长同意+加盟商批准）；
3. 加盟商审批页附申请人 28 天数据卡 + 城市饱和度提示（站点数 vs 单量）。

### 7.3 数据结构

```ts
type LeaderApplication = {
  id: string; franchise: string; applicantRiderId: string;
  channel: "self" | "leader_referral" | "franchisee";
  referrerStationId?: string;          // 推荐奖归属
  eligibilitySnapshot: { orders28d: number; tenureWeeks: number; activeWeeks: number }; // 申请时固化
  status: "pending" | "approved" | "rejected" | "trial" | "confirmed" | "failed";
  reviewedBy?: string; reason?: string; createdAt: string;
};
```

流程：资格达标 → 申请/被推荐 → 加盟商审批 → 建 trial 站点+站长账号 → 14 天试运营
（≥5 活跃骑手 + 600 单）→ 转正（推荐/培养奖自动生成 walletPayments）/ 失败（关站+自动回原站）。

### 7.4 PR 归属

申请表 + 资格判定 + Web 表单入 **PR-2**（复用待办页与结算管道）；推荐/培养奖的自动判定发放可作 PR-2 收尾或独立 PR-3。

## 8. 终审补充（角色生命周期压测结果）

### 8.1 流程规则（v1 直接实现）

1. **换站长结算切割**：换人日按比例切割周期——老站长应计部分照常复核支付，新站长次日起新周期；站点历史数据连续归站点，结算归人。
2. **骑手转站申请**：骑手经 Web 表单发起转站/申诉，直达加盟商待办，组长无否决权（与开站申请同入口，防"被烂组长困住"）。
3. **待办 SLA 升级**：绑定申请 48h、付款复核 72h 未处理 → 自动升级总部运营待办并通知（加盟商是唯一人工节点，必须有兜底）。
4. **影子运行期**：新城上线前 2 周模拟结算（付款单只生成不支付），核对金额守恒与分数分布后再放开真实支付。

### 8.2 运营决策（已确认定稿）

| # | 决策点 | 定稿 | 状态 |
| --- | --- | --- | --- |
| P0 | 试点 | **SJBV 加盟商**为组长模式首个试点城市 | ✅ 已确认 |
| P1 | 试运营期结算 | 试运营期照常结算（基础提成），考核提成自转正起 | ✅ 已确认 |
| P2 | 支付频率 | **组长提成按周**（计算按日、进度条日更）；骑手工资 T+1 每日支付不变 | ✅ 已确认 |
| P3 | 站长收款 | Pix（CPF）与 CNPJ 均可，账号收款信息二选一填写 | ✅ 已确认 |

## 9. v2 待办（明确不做进 v1）

排班兑现率入考核（需在岗心跳数据）、自动关站与 A/B/C 评级、骑手分多维模型、
WhatsApp Business API 自动发送、站点分赛马与新增单量分配、多城开城模板一键复制。
标定方式：新城试点跑 4–8 周后，用真实分布（如末位 15%）校准各标准线，加**绝对下限+最小样本量**约束。

---

*圣保罗零感知 · flag 默认关 · 账本式快照 · 三语文案 · 资金不经个人。*
