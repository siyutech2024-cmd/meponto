# 系统业务闭环审计报告

> 范围：商城(mall) + 积分(points) + partner + 骑手商城页 + 供应链。
> 结论：**架构完整、主闭环大多闭合、风控齐全。** 主要风险集中在「鉴权身份来源」与「积分待定期未落地」两处。

---

## 1. 端到端闭环总览

```
供应商提报(pending_pricing) → HQ定价/上架(active)
        │
        ▼
骑手/Partner 兑换(redeem) ──积分spend账本── 扣库存
        │  ├ 虚拟：即时发券(fulfilled)
        │  ├ 实物(骑手)：created → 站点 markArrived → markPickedUp(fulfilled)
        │  ├ 实物(partner)：created → confirmReceipt(fulfilled)
        │  ├ 高价值(≥8000)：held(reviewStatus=pending) → reviewOrder(approve/reject)
        │  └ 取消(created)：cancelOrder → 退积分+退现金+回补库存
        ▼
月度对账 generateStatement(fulfilled/arrived × supplyPrice)
        → 供应商 confirmStatement → HQ payStatement
补货：createPO → confirmPO → shipPO → receivePO(库存+)
```

五条主链 **全部实现并闭合**。

---

## 2. 各闭环评估

| 闭环 | 状态 | 说明 |
|---|---|---|
| 积分账本 | ✅ 闭合 | append-only，type(earn/spend/refund/expire/reverse/adjust/hold/release)、status、balanceAfter、reasonCode 齐全；FIFO 12 月过期留痕。 |
| 商城兑换 | ✅ 闭合 | 风控拦截 + 余额校验 + 扣库存 + spend 账本 + 事件/审计；虚拟即时券、实物站点/partner 履约。 |
| 取消/驳回 | ✅ 闭合 | 退积分(refund 账本)+退现金(cash ledger)+回补库存+推送，net 归零。 |
| 高价值审核 | ✅ 闭合 | 兑换即扣分(held)，未发券；approve 发券/放行，reject 退分+回补。 |
| 优惠券 | ✅ 闭合 | perRiderLimit 通过「非取消订单数」隐式计数，redeem 时二次校验，取消即释放。 |
| 供应链定价 | ✅ 闭合 | 供应商改自己未定价品(状态锁)，HQ priceProduct 上架；改价走 requestPriceChange→decide(留价格史)。 |
| 采购补货 | ✅ 闭合 | PO ordered→confirmed→shipped→received(库存+)→cancelled。 |
| 月度对账 | ✅ 闭合 | 按 fulfilled/arrived×supplyPrice 生成，幂等(仅 draft 可重算)，supplier confirm→HQ pay，确认后不可变。 |
| Partner 扫码积分 | ✅ 闭合 | 完单门槛 + 每日每 partner 去重 + 日上限 10 + 每 N 次发分，账本留痕。 |
| 现金/Hybrid | ✅ 闭合 | 独立 immutable cash ledger；hybrid PIX 人工核销(submit→confirm/reject)；topup R$1–5000。 |

---

## 3. 发现的问题与风险（按优先级）

### 🔴 高
**H1. 兑换/取消的「骑手身份」来自客户端入参，非会话派生。**
`redeem`(rider 分支) 用 body 的 `riderId/riderName` 定位骑手；`cancelOrder` 仅当请求带了 `riderId` 才校验归属（不传则跳过）；`scanPartner` 同样信任 body `riderId`。
→ 任一持 `use_rider_app` 的账号可**冒用他人 riderId 兑换（花别人的积分）或取消他人订单**。
对比：partner / supplier 分支已正确从 `session.organization` 派生身份并校验所有权。
属已知 demo 级鉴权（x-vento-role，「鉴权暂缓」）的系统性遗留，但这是最实质的越权面。
**建议**：rider 分支统一从会话派生 riderId，cancelOrder 去掉「不传就跳过」的归属校验。

### 🟠 中
**M1. 积分「待定期/释放」机制未落地。**
`acquisitionPointRules / pendingReleaseRules` 定义了注册/推荐/绩效的 pendingDays 与 autoRelease（反欺诈持有窗口），但实际发放 `creditPoints` **直接写 status="approved"**，无 pending→release 转换作业。
→ 文档里的「推荐积分需 14 天活跃后释放」等反欺诈持有**形同虚设**，发分即可用、即可兑换。
**建议**：发放按规则写 pending，加定时/触发的 release；或在标准里把这部分降级为「v1 即时发放」并注明。

**M2. 并发原子性。** 库存「检查→扣减」、积分「校验→扣分」分两步、无锁/事务。内存单进程下风险低，但 Supabase 多实例并发可能**超卖/双花**。建议关键路径加乐观锁或 DB 约束。

**M3. `adjust` 账目只能加分。** `getAvailablePoints` 对 `type==="adjust"` 一律 `+points`，负向调整需把 `points` 存负值才生效，语义不清。建议显式区分增/减，或新增 `debit_adjust`。

### 🟡 低 / 备注
- **L1.** `cancelOrder` 不校验 `reviewStatus`：高价值待审单(status=created)可被骑手直接取消退款——通常无害（本人撤回），但绕过审核可见性，记录即可。
- **L2.** `generateStatement` 含 `arrived`（已到站未取）订单计入供应商应付，符合「供应商已交付到站」口径，但若后续出现到站后异常需人工冲销（当前 arrived/fulfilled 不可取消，安全）。

---

## 4. 设计亮点（无需改）

- 积分/现金均为 **append-only 账本 + balanceAfter**，可审计、可回溯。
- 兑换风控分层：风控骑手拦截、日次数/日积分/月积分/新账户上限、单品月限、≥8000 高价值审核。
- 取消/驳回**严格 net 归零**（退分+退现金+回补库存+通知）。
- 优惠券**无需单独计数表**，靠订单隐式计 + 取消释放 + redeem 二次校验，简洁且自洽。
- 供应链**三段式 + 价格史 + 月度对账幂等不可变**，财务可追。
- partner/supplier 写操作**会话派生身份 + 所有权 + 状态锁**（rider 分支是唯一例外，见 H1）。

---

## 5. 建议处理顺序

1. **H1**（越权面）—— 把 rider 兑换/取消/扫码的身份改为会话派生（需确认是否在「鉴权暂缓」范围内放行此项）。
2. **M1**（积分待定期）—— 确认 v1 是否需要反欺诈持有窗口；要则补 release 作业。
3. **M2/M3** —— 上 Supabase 多实例前处理并发与 adjust 语义。
4. L 级记录备查即可。

> 以上均为**只读审计结论，未改任何代码**。要修哪几项告诉我，我按优先级来（涉及主/加盟商后台业务码的会先和你确认口径）。
