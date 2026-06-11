# MePonto 业务逻辑梳理与待办清单
更新：2026-06-11

## 一、资金流（已上线，全程留痕）

```
Eastwind T+1 报表导入（结算金额按源表「金额」列）
        ↓
骑手余额 = Σ 截至昨日的结算金额 −（在途提现 + 已付提现）
        ↓
骑手APP /rider-app/wallet 申请提现（T+1 后才可提；同一时间只允许 1 笔在途；不可超额）
        ↓
加盟商后台 /wallet 看到待付款列表 → 线下 PIX 付款 → 点「已付款确认」
        ↓
骑手余额自动扣减；记录含申请时间/付款时间/操作人/PIX；拒绝则释放冻结并附原因
        ↓
总部 /wallet 只与加盟商对账：应结余额 = 骑手累计结算 − 加盟商已付骑手
```

每一步均写入 RiderWithdrawal 记录 + 审计日志（WITHDRAWAL_REQUESTED / PAID / REJECTED）。
线上实测：JHEMYSON 提现 R$100 → 确认付款 → 余额 206.82→106.82，Norte 应结自动减为 R$585.63 ✓

## 二、积分流（已上线）

| 来源 | 规则 | 防刷机制 |
|---|---|---|
| 完单 | 每单 2 分（总后台可改），按等级倍率放大 | 幂等记账（同日同骑手只记一次），数据源为 Eastwind 导入 |
| 邀请骑手 | +20 分 | **被邀人首次在 Eastwind 出现完单后才发放**；每个新骑手只触发一次 |
| Partner 扫码 | Partner 得 +20 分 | 仅有完单记录的骑手可验证；同骑手对同 Partner 每日 1 次；每 Partner 每日上限 10 次 |

扫码路径：骑手商城页有邀请二维码（链接 app.meponto.com/scan?ref=骑手ID）；
扫 Partner 码打开 /scan?partner=ID → 骑手登录确认 → Partner 即时得分。
线上实测：首扫 +20（SupriMoto Tatuape）✓，同日重复返回 409 ✓

## 三、商城流（已上线）

- 实物：供应商上传定供应价 → 总部定分成/积分价上架 → 骑手兑换（仅所属站点取货）→ 按供应商周期估到货 → 站点确认到货 → APP 取货提醒 → 核销
- **虚拟商品（新）**：兑换即发核销码（如 MP-XXXX-XXXX），无物流，立即完成
- 已建测试虚拟商品：Recarga R$10（20分）、Cupom iFood R$5（10分）
- 线上实测：CARLOS 兑换 Cupom → 即时 fulfilled + 核销码 + 积分 30→20 ✓

## 四、会员等级（已上线）

注册即会员；Eastwind 数据出现才升等级会员（按累计完单）：
Bronze ≥1 单 → Prata ≥100（积分×1.05、生日 50 分）→ Ouro ≥300（×1.10、兑换 95 折、生日 100）→ Diamante ≥600（×1.15、9 折、生日 200）

## 五、Google Play 提交状态

全部声明已完成（App content 显示 "You're all caught up"）。
**仅剩 1 项**：隐私页此前部署中被 Google 检测为 404，页面现已正常，Google 缓存复检后（通常数小时内）
到 Publishing overview 点 **Send for review** 即可。上架后记得到 App integrity 页核对正式签名指纹。

## 六、未完成 / 建议事项

1. **会话级鉴权**（重要）：当前 API 按 x-vento-role 头鉴权，属演示级；正式商用前应改为服务端 session/JWT。已确认暂缓。
2. **生日礼自动发放**：等级权益中的生日积分目前为规则定义，尚无自动发放任务（可加定时任务在生日当天入账）。
3. **提现风控增强**（可选）：单日提现上限、加盟商余额预存校验。
4. **Vercel Hobby → Pro**：商用流量前升级。
5. **本地 git 仓库**与 GitHub 有分叉：本地推送前先 `git pull --rebase`。
6. Play 上架批准后：用 Play Console「App integrity」页的正式指纹替换 assetlinks.json（当前为上传密钥指纹）。
7. Partner 服务完成次数（partnerServiceCount=3 规则）目前按扫码即给分简化；如需"完成 N 次服务才给分"，可在扫码记录满 N 次后再入账。

## 七、域名速查

| 端 | 地址 | 财务入口 |
|---|---|---|
| 总部 | sys.meponto.com | 结算与提现（加盟商对账+全网台账） |
| 加盟商 | franchise.meponto.com | 结算与提现（本加盟商待付款确认） |
| 站点 | ponto.meponto.com | KPI/到货确认 |
| 骑手 | app.meponto.com | 我的钱包（余额+提现）、积分商城（邀请码） |
