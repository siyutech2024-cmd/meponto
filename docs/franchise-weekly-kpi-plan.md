# 加盟商周 KPI 考核方案（最终版 · 仅展示）

> 结论：周 KPI = **把加盟商名下骑手的每日真实数据，按自然周汇总后展示**。
> **不套任何系数、不影响结算/定价**（已与业务确认）。

---

## 1. 数据来源

- `riderDailyKpis`：T+1 真实数据（Eastwind「按骑手」导入），含
  `completedOrders / onlineHours / signedShiftHours / inShiftOnlineHours / tsh / tshCritical / ar / caa`。
- 加盟商归属：`riders.franchise`（按 99 ID 关联）。

## 2. 周维度

- 自然周（周一–周日），复用 `weekWindow()`，与 `/wallet` 结算周一致。
- 范围：某加盟商当周所有骑手、所有日的 KPI 行；加盟商一行，可下钻站点。
- 权限：HQ 看全部；加盟商/站点只看自己（已实现）。

## 3. 周计算口径（已确认）

| 指标 | 周计算方法 |
|---|---|
| 完单数 | 当周每日**求和** |
| 在线时长 | 当周每日**求和** |
| 出勤天数 / 骑手数 | **去重计数** |
| **%TSH** | Σ(在班在线时长) ÷ Σ(签约班次时长) ×100 —— **真实工时还原** |
| **%TSH 关键班次** | 按**签约工时加权**平均 |
| **AR** | 按**完单加权**平均：Σ(AR×完单) ÷ Σ完单 |
| **CAA** | 按**完单加权**平均（越低越好） |

> 无数据的指标显示「无数据」，不计入。

## 4. 实现

- 仅改 `app/api/assessment/route.ts` 的 `buildBoard`：
  - %TSH 由 `inShiftOnlineHours / signedShiftHours` 还原；
  - %TSH 关键班次按签约工时加权；
  - AR/CAA 维持完单加权；
  - 完单/时长求和、骑手/天数去重。
- 展示沿用现有「考核」页（`app/assessment/page.tsx`）的周看板，按周切换、分权限。
- **未改结算**：`/wallet` 仍按导入 `settleAmount` 结算，KPI 不参与金额计算。

## 5. 明确不做（本期）

- ❌ KPI 系数（0.8–1.2）
- ❌ 基准价 12 × 系数 的金额计算
- ❌ KPI 影响加盟商应结/定价

> 如后续要把 KPI 接入结算，再单独立项确认口径。
