# MePonto 骑手端 · 后端需求(增补)：商户服务核销 + 商户评价

> 承接 `docs-backend-prd.md`。本次新增 2 个能力：**① 折扣核销=记录商户服务并给商户加积分；② 骑手对商户服务点打分评论，地图展示评价**。
> 规则不变：写接口走 **`Idempotency-Key`**、统一 RBAC(scope=rider)、经济类(积分)走**账本**、事件**版本化**、`{data,error}` 信封、错误用机器码。
> 基址 `https://mall.meponto.com/api/`，会话 cookie `meponto_session`。

---

## 1. 商户服务核销（折扣 + 商户积分）— P0/P1

**场景**：骑手扫商户二维码 → 核销一笔服务折扣；**这笔核销要被记录**，且**商户获得积分**（骑手获得折扣由骑手线下少付）。

**POST `/partner/redeem`**
- 鉴权：会员；`Idempotency-Key` 必带。
- 请求：`{ "partnerCode": "<商户码/二维码内容>", "category": "<fuel|phone_data|maintenance|equipment|vehicle_service>" }`
- 业务规则：
  - 校验 `partnerCode` 有效且商户在营；无效 → `404 partner_not_found`。
  - 折扣金额、商户积分按**类别固定**（与 `partnerServiceBenefitRules` 一致）：
    | category | 骑手折扣(R$) | 商户积分 | 骑手冷却 | 商户每日上限 |
    |---|---|---|---|---|
    | fuel | 5 | 30 | 1 天 | 80 |
    | phone_data | 5 | 30 | 1 天 | 50 |
    | maintenance | 20 | 100 | 7 天 | 20 |
    | equipment | 20 | 80 | 30 天 | 10 |
    | vehicle_service | 30 | 120 | 30 天 | 10 |
  - **冷却**：同骑手×同类别在冷却期内重复 → `409 cooldown_active`（返回 `nextEligibleAt`）。
  - **商户每日上限**：超出 → `409 partner_cap_reached`。
  - **商户积分入账走积分账本**（append-only），事件 `partner.benefit.redeemed.v1`。
- 响应 `data`：`{ "redeemId": "...", "riderDiscountBrl": 20, "partnerPoints": 100, "nextEligibleAt": "2026-07-01T12:00:00Z" }`
- 端上用法：扫码结果页显示"折扣已核销 -R$X" + "商户获得 +partnerPoints pts"。

> 端侧当前 `redeemPartnerService(partnerCode, category)` 已接 `POST /partner/redeem`，取返回的 `partnerPoints` 展示；失败 best-effort 不报错。

---

## 2. 商户服务点评价（打分 + 评论）— P1

**场景**：骑手对服务点打 1–5 星并留言；地图卡片显示平均分/评价数，详情页展示评价列表。

### 2.1 提交评价
**POST `/partner/review`**
- 鉴权：会员；`Idempotency-Key` 必带。
- 请求：`{ "partnerCode": "<商户标识>", "rating": 1..5, "comment": "<可空, ≤500 字>" }`
- 规则：
  - `rating` 必填 1–5；越界 → `400 invalid_rating`。
  - **建议限制**：仅"近 N 天有过该商户核销记录"的骑手可评价(防刷)；否则 `403 not_eligible`（可作为开关，先放开也行）。
  - 同骑手对同商户**可更新**自己的最新评价(覆盖)或限频，二选一，请后端定。
  - 评论做敏感词/长度校验。
- 响应 `data`：`{ "reviewId": "...", "partnerRatingAvg": 4.6, "partnerReviewCount": 29 }`（返回更新后的聚合，便于端上对齐）。
- 事件：`partner.review.created.v1`。

### 2.2 读取评价（聚合 + 列表）
**GET `/partner/{partnerCode}/reviews`**（或 `?partnerCode=`）
- 响应 `data`：
  ```json
  {
    "ratingAvg": 4.6,
    "reviewCount": 29,
    "items": [
      { "id": "...", "author": "Carlos M.", "rating": 5, "comment": "Atendimento rápido", "createdAt": "2026-06-20T10:00:00Z" }
    ]
  }
  ```
- 支持分页：`?limit=20&cursor=`（评价多时）。
- `author` 用脱敏名（名 + 姓首字母），不暴露手机号/CPF。

### 2.3 商户列表带聚合评分
**在合作商户列表接口补充字段**（骑手地图用，例如现有 `/partner/nearby` 或合作商户读接口）：
- 每个商户对象追加：`ratingAvg`(0–5, 一位小数)、`reviewCount`(int)。
- 地图卡片直接展示星级 + 平均分 + 评价数，无需逐个再查。

---

## 3. 数据模型（建议）

- 新表 `partner_redeem_log`：`id, riderId, partnerId, category, riderDiscountBrl, partnerPoints, createdAt`（核销记录，用于冷却/上限/防刷评价资格）。
- 新表 `partner_review`：`id, riderId, partnerId, rating(1-5), comment, createdAt, updatedAt`；唯一约束可选(同骑手同商户一条)。
- `partner` 增加聚合字段或物化视图：`rating_avg, review_count`（评价提交后更新）。
- 商户积分入账复用现有 `points_ledger`，`sourceType=partner_service_benefit`、`reasonCode=PARTNER_SERVICE_BENEFIT`。

---

## 4. 错误码（新增）

`partner_not_found / cooldown_active / partner_cap_reached / invalid_rating / not_eligible`
（前端按机器码做三语提示。）

---

## 5. 验收标准

1. 核销一次：写入 `partner_redeem_log`，商户积分账本 +N，返回 `partnerPoints` 与 `nextEligibleAt`；冷却内重复被拒。
2. 商户每日累计核销超上限被拒。
3. 评价提交后，`GET reviews` 与商户列表的 `ratingAvg/reviewCount` **立即更新**且一致（以评价记录聚合为准）。
4. 评价作者脱敏；无核销资格(若开启)被拒。
5. 所有写接口幂等：重复 `Idempotency-Key` 不重复加分/不重复评价。

---

## 附：接口清单(本次)

| 优先级 | 方法 路径 | 请求 | 关键返回 |
|---|---|---|---|
| P0/P1 | `POST /partner/redeem` | `{partnerCode,category}` | `{redeemId,riderDiscountBrl,partnerPoints,nextEligibleAt}` |
| P1 | `POST /partner/review` | `{partnerCode,rating,comment}` | `{reviewId,partnerRatingAvg,partnerReviewCount}` |
| P1 | `GET /partner/{code}/reviews` | `?limit&cursor` | `{ratingAvg,reviewCount,items[]}` |
| P1 | 商户列表接口补字段 | — | 每个商户加 `ratingAvg,reviewCount` |

> 端侧已按 `RiderAPI` 协议预留 `redeemPartnerService` / `submitPartnerReview`；后端补齐后仅需在 `Networking/APIClient.swift` 校对 DTO/路径（`PartnerRedeemDto.partnerPoints`、`AckDto`、reviews 列表结构），`LiveRiderAPI` 与 UI 不动。Android 同构。
