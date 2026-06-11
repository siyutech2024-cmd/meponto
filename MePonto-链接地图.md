# MePonto 链接地图（唯一权威清单）
更新：2026-06-11 ｜ 本表为全系统页面归属唯一参考，标注「主线」的是业务正在使用的页面。

## 一、四端入口（给用户的链接）

| 端 | 域名 | 登录后首页 |
|---|---|---|
| 官网 | meponto.com | 招募落地页（底栏含四端入口）|
| 总部 PontoSys | sys.meponto.com | 模块导航页 /pontosys |
| 加盟商后台 | franchise.meponto.com | 模块导航页 /franchise-admin |
| 站点后台 | ponto.meponto.com | 模块导航页 /ponto-admin |
| 骑手 APP | app.meponto.com | 骑手首页 /rider-app |
| 供应商后台 | （经总部 portal 进入）| /supplier-admin |
| Partner 端 | （经总部 portal 进入）| /partner-app |

> /pontosys、/franchise-admin、/ponto-admin、/app 等是各域名的「模块导航首页」（卡片菜单），不是废页面——每个域名登录后落在这里。

## 二、主线业务页面

**排班链路**：/dispatch（总部周排班+配额+审核+填报）→ /dispatch/franchise（加盟商拆分+审核）→ /dispatch/station（站点提报）→ /rider-app/shifts（骑手自助报名）

**数据链路**：/performance（T+1 KPI + 收入结算，三端按权限过滤）｜ /ninety-nine-import（99 报表导入）

**资金链路**：/wallet（总部对账/加盟商付款确认）→ /rider-app/wallet（骑手余额+提现）

**商城链路**：/mall（总部：规则/定价/商品配置/订单）→ /mall/supplier（供应商上传）→ /mall/station（站点到货/领取确认）→ /rider-app/mall（骑手商城，PC/手机自适应）

**客服链路**：/rider-app/support（骑手工单）/ /support（加盟商站点提交、总部处理队列）

**其他主线**：/riders（骑手档案）/pontos（站点）/users（多用户权限）/franchise（加盟方案）/sops（5 个正式 SOP）/finance/model（站点利润模拟器）/scan（二维码邀请/Partner 验证落地页）/privacy（隐私政策）

## 三、辅助/演示页面（保留但非主线）

/dashboard、/operations-core、/finance（旧账本演示）、/marketplace（旧 PontoMall，Partner 兑换仍用）、/points-economy、/rewards、/partner-points、/crm、/analytics、/reports、/realtime、/audit、/access-control、/chat、/incidents、/night-shift、/mobile、/leaders、/territory、/tools、/security、/settings

这些是早期搭建的展示模块，菜单可见但数据多为演示。**后续若确认不用，可整组删除**；本次先保留避免误删业务。

## 四、已删除

- ~~/slot-enrollment~~（被 /dispatch 完全替代，已删除）

## 五、本次修复

1. 骑手首页底部 Tab 此前是装饰锚点，现已接通：Carteira→钱包、Loja→商城、Ajuda→工单、报名按钮→班次报名。
2. "两套代码"的由来：早期演示模块（第三节）与新业务模块并存。主线以第二节为准；演示模块不再迭代。
3. 数据库写入：所有关键写接口（排班/商城/钱包/工单/绩效导入）现在**响应前同步落库**（此前为 300ms 延迟异步，serverless 实例休眠可能丢失），跨实例读取也即时一致。
