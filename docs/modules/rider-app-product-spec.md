# MePonto 骑手端 APP 产品策划书 v1.0

本文档是 MePonto 骑手端 APP 模块的产品策划书，用于指导开发、测试、验收和后续并入 PontoSys 总系统。模块合同见 `docs/modules/rider-app-contract.md`，本文件负责说明具体产品能力、页面结构、接口拆分、数据来源、业务规则和验收标准。

## 1. 模块基本信息

| 项目 | 内容 |
| --- | --- |
| 模块名称 | MePonto Rider App / MePonto Member Experience |
| 产品定位 | 巴西骑手的 MePonto 会员入口 |
| 当前状态 | beta preview |
| 当前路由 | `/rider-app` |
| 当前页面 | `app/rider-app/page.tsx` |
| 模块合同 | `docs/modules/rider-app-contract.md` |
| Feature Flag | `meponto_member.beta_enabled` |
| 主要用户 | 骑手、Leader、站点运营、总部运营 |
| 主要语言 | 葡语，后台评审保留中文，技术交付保留英文 |

当前实现已经作为 PontoSys 内部预览页挂入总系统导航，但还没有完成生产级 API、真实移动端认证、设备注册、推送和正式 Feature Flag 控制。

## 2. 产品背景

MePonto 需要一个面向骑手的统一入口，让骑手能够看到自己的状态、钱包、积分、任务、站点、Partner 服务、帮助和安全支持。

当前如果只依赖站点线下沟通或分散工具，会出现：

- 骑手不知道自己当天表现和任务进度。
- 钱包、积分、奖励和 Partner 权益分散。
- 事故、安全、帮助入口不统一。
- Leader 和站点难以及时触达骑手。
- 总部无法形成骑手生命周期数据闭环。

骑手端 APP 的目标不是做一个独立系统，而是作为 PontoSys 的骑手入口，连接 Rider、Ponto、Leader、Finance、Points、Partner、PontoMall、Incident、Chat、Notification、Risk 等模块。

## 3. 产品目标

### 3.1 v1 目标

- 给骑手一个 Android-first 的 MePonto 首页体验。
- 展示骑手钱包、积分、今日表现、任务、站点和 Leader 信息。
- 展示可用 Partner 服务和优惠地图。
- 展示 PontoMall 入口。
- 展示安全与帮助入口。
- 展示应用内通知和应用内聊天入口。
- 支持 slot 报名入口。
- 不暴露内部风控分、Partner 私有备注、ledger 内部细节。
- 不暗示雇佣关系或劳动合同关系。

### 3.2 本期不做

- 不做独立登录体系。
- 不做真实提现吗。
- 不让骑手直接改 ledger。
- 不让骑手看到内部财务结算规则。
- 不让骑手看到 Partner 风控数据。
- 不做第三方聊天依赖。
- 不做生产级 GPS 轨迹存储，除非经过 LGPD 和安全评审。

## 4. 用户角色与场景

| 角色 | 场景 | 目标 | 关键限制 |
| --- | --- | --- | --- |
| 骑手 | 打开 APP 查看今日状态 | 知道是否在线、站点、Leader、今日订单、积分、可提现金额 | 只能看自己的数据 |
| 骑手 | 查看钱包 | 看可用金额、待释放金额、提现状态和流水 | 不显示内部结算公式 |
| 骑手 | 查看积分 | 看可用积分、待审核积分、任务、PontoMall 入口 | 不显示风控规则和 ledger 内部字段 |
| 骑手 | 找 Partner 服务 | 查附近维修、加油、车辆服务、会员优惠 | 不显示 Partner 私有备注 |
| 骑手 | 安全求助 | 快速发起安全、事故、账号或支持请求 | 高风险动作必须审计 |
| Leader | 查看骑手状态 | 了解骑手是否在线、是否需要支持 | Leader 不直接修改财务/积分 |
| 总部运营 | 预览骑手体验 | 检查产品、SOP、语言、规则是否正确 | 通过 PontoSys 权限访问 |

## 5. 信息架构

骑手端 APP 采用四个底部 Tab：

```txt
Inicio
Carteira
Pontos
Ajuda
```

### 5.1 首页 Inicio

首页展示：

- 骑手问候。
- 钱包卡片。
- 当前会员等级。
- 今日收益。
- 今日订单。
- 今日积分。
- performance score。
- Orders / TSH / AR / CAA。
- Ponto 与 Leader。
- 安全状态。
- Partner 地图。
- Slot 报名入口。
- PontoMall 入口。
- 任务与奖励。
- 通知。
- MePonto 权益。

### 5.2 钱包 Carteira

钱包展示：

- 可用金额。
- 待释放金额。
- 周目标。
- 现金流水。
- 提现入口。
- 收款账户状态。

规则：

- v1 可展示 wallet read model。
- 不允许骑手端直接写 finance ledger。
- 提现动作进入 future API，必须有 audit 和 idempotency。

### 5.3 积分 Pontos

积分展示：

- 可用积分。
- 待审核积分。
- member QR。
- Partner 折扣。
- Partner 地图。
- 等级体系。
- 积分 ledger 摘要。
- PontoMall 商品。

规则：

- 骑手可以看积分余额和摘要。
- 不显示内部 fraud score。
- 不显示 Partner 私有风险备注。
- 不允许直接改 points ledger。

### 5.4 帮助 Ajuda

帮助展示：

- 安全求助。
- 支持聊天。
- 账号与访问。
- 安全状态。
- 通知历史。

高风险动作：

- SOS。
- 事故上报。
- 位置分享。
- 账号敏感数据。

这些动作必须在生产版进入 API、权限、LGPD、audit 和人工升级流程。

## 6. 当前页面模型

当前页面文件：

```txt
app/rider-app/page.tsx
```

当前页面已经包含：

| 区块 | 当前状态 | 说明 |
| --- | --- | --- |
| 顶部身份 | 已有 | MePonto logo、骑手名、通知入口 |
| 钱包会员卡 | 已有 | 可用金额、待释放金额、积分、performance score |
| 今日数据 | 已有 | 收益、订单、积分 |
| 等级体系 | 已有 | Base / Consistente / Forte / Elite / Top |
| 站点状态 | 已有 | Ponto、Leader、安全状态 |
| Partner 地图 | 已有 | Partner 位置、服务、折扣、导航 |
| Slot 报名 | 已有 | 跳转 `/slot-enrollment` |
| PontoMall | 已有 | 商品和 points price |
| 任务奖励 | 已有 | 任务进度和奖励 |
| 通知 | 已有 | inbox 示例 |
| 钱包页 | 已有 | 余额、流水、PIX 状态 |
| 积分页 | 已有 | QR、Partner benefit、ledger、shopping |
| 帮助页 | 已有 | 安全、支持、账号、事故状态 |

当前缺口：

- 数据仍来自 demo data 和前端组合。
- 没有正式 `/api/rider-app/*`。
- 没有真实 member identity。
- 没有真实 push token。
- 没有真实 read receipt。
- 没有正式 audit。
- Feature Flag 未实际接入控制。

## 7. 功能范围与优先级

| 功能 | 优先级 | v1 要求 | 状态 |
| --- | --- | --- | --- |
| APP 首页 | P0 | 展示骑手今日状态、钱包、积分、Ponto、Leader、安全状态 | beta preview 已有 |
| 钱包摘要 | P0 | 读取 wallet read model，不写 ledger | beta preview 已有 |
| 积分摘要 | P0 | 读取 points read model，显示可用/待审核/任务/PontoMall | beta preview 已有 |
| Partner 地图 | P0 | 显示活跃 Partner、距离、服务、折扣、导航 | beta preview 已有 |
| 帮助中心 | P0 | 安全、支持、账号入口 | beta preview 已有 |
| 应用内聊天入口 | P0 | 支持联系运营/Leader/支持 | beta preview 文案已有 |
| Slot 报名入口 | P0 | 跳转到 slot enrollment | beta preview 已有 |
| 通知中心 | P1 | 合并 push 与 in-app notification | demo 已有 |
| 状态确认 | P1 | 骑手确认在线、车辆、电量、Ponto | future API |
| SOS / 事故上报 | P1 | 进入 Incident API 和 audit | future API |
| Push token | P1 | Android 设备注册 | future API |
| Member QR | P1 | Partner 扫码核验权益 | demo UI 已有 |
| 真实登录 | P1 | 统一身份体系，不做独立登录 | planned |
| 多语言 | P1 | 葡语优先，中英葡完整 | 部分已有，需补齐 |
| 宠物成长入口 | P2 | 与积分、任务、成长体系联动 | planned |

## 8. API 规划

生产级接入需要新增以下 API。

| Method | Path | 用途 | 权限 / 身份 | 数据来源 |
| --- | --- | --- | --- | --- |
| GET | `/api/rider-app/profile` | 读取骑手会员首页所需资料 | `member.self.read` | Rider read model、Ponto、Leader |
| GET | `/api/rider-app/wallet` | 读取钱包摘要和流水摘要 | `member.wallet.read` | Finance read model |
| GET | `/api/rider-app/points` | 读取积分、任务、PontoMall 入口 | `member.points.read` | Points read model、PontoMall |
| GET | `/api/rider-app/partners-map` | 读取附近 Partner 与权益 | `member.benefits.read` | CRM、Partner Points read model |
| GET | `/api/rider-app/notifications` | 读取通知和应用内消息摘要 | `member.notification.read` | Notifications、Chat read model |
| POST | `/api/rider-app/status-confirmations` | 提交上线/状态确认 | `member.status.confirm` | Rider App private data + Events |
| POST | `/api/rider-app/incidents` | 提交事故/SOS | `member.incident.create` | Incident module / Integration Gateway |
| POST | `/api/rider-app/push-token` | 注册 Android push token | `member.device.register` | Notification module |
| POST | `/api/rider-app/chat/read` | 标记应用内消息已读 | `member.notification.read` | Chat module |

### 8.1 API 原则

- 骑手端只能读取自己的数据。
- 钱包、积分、Partner、事故等必须通过 read model 或模块 API。
- 骑手端不得直接写 finance ledger、points ledger、partner private data。
- 所有写动作必须有 audit。
- 位置、设备、SOS、事故属于高敏感数据，需要 LGPD 策略。

## 9. 事件规划

| Event | Producer | Consumer | 说明 |
| --- | --- | --- | --- |
| `meponto_member.status_confirmed.v1` | Rider App | Dispatch、Leader、Analytics | 骑手确认状态 |
| `meponto_member.safety_pulse.created.v1` | Rider App | Leader、Risk、Incident | 安全 pulse |
| `meponto_member.incident.requested.v1` | Rider App | Incident、Support、Chat | 骑手事故/求助 |
| `meponto_member.notification.read.v1` | Rider App | Notifications、Analytics | 通知已读 |
| `meponto_member.partner_navigation.opened.v1` | Rider App | Partner、Analytics | 打开 Partner 导航 |
| `meponto_member.wallet.viewed.v1` | Rider App | Finance、Audit、Analytics | 查看钱包 |
| `meponto_member.points.viewed.v1` | Rider App | Points、Analytics | 查看积分 |

所有事件必须带 version，不允许使用未版本化事件名。

## 10. 数据需求

| 数据 | 来源 | 读写 | 敏感等级 | 说明 |
| --- | --- | --- | --- | --- |
| rider profile | Rider module | read | 中 | 姓名、状态、Ponto、Leader |
| wallet summary | Finance read model | read | 高 | 可用金额、待释放金额、提现状态 |
| points summary | Points read model | read | 中 | 可用积分、待审核、任务 |
| partner map | CRM / Partner Points | read | 低/中 | 活跃 Partner、服务、优惠、导航 |
| incidents | Incident module | read/write request | 高 | 安全、事故、SOS |
| notifications | Notifications / Chat | read/write read receipt | 中 | 通知、消息已读 |
| device token | Notification module | write | 高 | push token、设备信息 |
| location | Rider App private / Incident evidence | write when needed | 高 | 只在必要场景采集 |

## 11. 业务规则

### 11.1 钱包

- 钱包只显示 rider-visible read model。
- 可用金额和待释放金额来自 Finance read model。
- 提现入口 v1 可以展示，真实提交必须进入未来 API。
- 不显示内部结算公式。
- 不显示平台收入字段中不该被骑手看到的项目。

### 11.2 积分

- 积分遵守 `docs/meponto-points-economy-standard.md`。
- 显示 available、pending、expiring soon、missions、ledger summary。
- 不显示 fraud score。
- 不显示 Partner private notes。
- 兑换和退款必须走 points ledger。

### 11.3 Partner 权益

- 骑手向 Partner 现金 / PIX / card 支付。
- 骑手获得 MePonto member discount。
- Partner 完成核验后获得 Partner points。
- 骑手积分不直接支付给 Partner。
- Partner 地图只显示对骑手有用的信息。

### 11.4 安全与事故

- SOS、事故、位置分享必须审计。
- 事故提交必须进入 Incident module。
- 高风险事件必须能通知 Leader / Support。
- 夜班安全场景需要支持定时 safety pulse。

### 11.5 应用内聊天

- 使用 PontoSys 原生应用内聊天。
- 不依赖第三方聊天平台。
- 支持 room、personal message、read receipt、audit。
- 骑手可联系 Leader、Support、Ponto。
- 关键安全消息必须留痕。

## 12. 权限、隐私与风控

### 12.1 权限

| 动作 | 权限 |
| --- | --- |
| 读取自己的首页 | `member.self.read` |
| 读取钱包 | `member.wallet.read` |
| 读取积分 | `member.points.read` |
| 读取 Partner 权益 | `member.benefits.read` |
| 提交状态确认 | `member.status.confirm` |
| 提交事故/SOS | `member.incident.create` |
| 注册设备 | `member.device.register` |
| 读取通知 | `member.notification.read` |

### 12.2 LGPD

高敏感数据：

- CPF。
- PIX。
- phone。
- precise location。
- emergency context。
- device token。
- incident evidence。

要求：

- 默认不显示 CPF / PIX。
- 敏感字段必须 mask。
- 访问敏感字段必须 audit。
- 位置只在必要场景采集。
- 数据保留期限必须可配置。

## 13. 页面文案与语言

骑手端面向巴西用户，葡语为主。

必须补齐：

- 葡语正式文案。
- 中文业务评审说明。
- 英文技术标签。

当前页面已有较多葡语文案，但仍需做一次语言 QA：

- 去除无重音的临时葡语，例如 `Seguranca` 应规范为 `Segurança`。
- 检查 `Inicio` 应为 `Início`。
- 检查 `Disponivel` 应为 `Disponível`。
- 检查 `Manutencao` 应为 `Manutenção`。
- 检查 `Beneficio` 应为 `Benefício`。
- 检查所有用户可见文案是否进入 i18n 或移动端本地化结构。

## 14. 验收标准

### 14.1 产品验收

- 骑手打开 APP 能在 5 秒内理解当前状态。
- 骑手能看到钱包、积分、Ponto、Leader、安全状态。
- 骑手能进入 Partner 地图和 PontoMall。
- 骑手能找到帮助和安全入口。
- 页面不出现内部系统字段。
- 页面不暗示劳动雇佣关系。

### 14.2 技术验收

- `/rider-app` 页面可访问。
- 新增 API 有 smoke test。
- 新增写 API 有权限检查。
- 新增事件全部版本化。
- 不直接写其他模块私有数据。
- `npm run codex:preflight` 通过。
- 高风险发布前 `npm run codex:preflight:full` 通过。

### 14.3 语言验收

- 葡语完整。
- 中文产品评审说明完整。
- 英文技术标签合理。
- 不混用旧品牌。
- 不出现外部聊天依赖文案。

### 14.4 安全验收

- CPF / PIX 不默认显示。
- 钱包和积分只读 read model。
- SOS、事故、位置、设备 token 有 audit 设计。
- Partner private notes 和 fraud score 不出现在骑手端。

## 15. 开发拆分建议

### Phase 1：正式接入总系统

- 创建 `app/api/rider-app/profile/route.ts`。
- 创建 `app/api/rider-app/wallet/route.ts`。
- 创建 `app/api/rider-app/points/route.ts`。
- 创建 `app/api/rider-app/partners-map/route.ts`。
- 创建 `app/api/rider-app/notifications/route.ts`。
- 页面从 demo import 改为读取 API payload。
- smoke 覆盖上述 API。

### Phase 2：写动作与审计

- `POST /api/rider-app/status-confirmations`。
- `POST /api/rider-app/incidents`。
- `POST /api/rider-app/push-token`。
- `POST /api/rider-app/chat/read`。
- 写动作加入 RBAC / member scope。
- 写动作加入 audit。
- 事件进入 versioned event list。

### Phase 3：移动端真实化

- Android shell / PWA 策略确认。
- 设备 token。
- Push notification。
- member auth。
- offline / low bandwidth 策略。
- LGPD consent。
- 安全上报流程。

### Phase 4：成长体系

- 宠物入口。
- 任务体系。
- 等级权益。
- PontoMall 深度接入。
- Partner 服务推荐。
- 风控和留存分析。

## 16. 开发任务清单

| 编号 | 任务 | 优先级 | 交付物 |
| --- | --- | --- | --- |
| RA-001 | 建立 rider-app API payload 类型 | P0 | `app/lib/riderApp.ts` |
| RA-002 | 建立 profile API | P0 | `/api/rider-app/profile` |
| RA-003 | 建立 wallet API | P0 | `/api/rider-app/wallet` |
| RA-004 | 建立 points API | P0 | `/api/rider-app/points` |
| RA-005 | 建立 partners-map API | P0 | `/api/rider-app/partners-map` |
| RA-006 | 建立 notifications API | P1 | `/api/rider-app/notifications` |
| RA-007 | 页面改为 API/read model 数据源 | P0 | `app/rider-app/page.tsx` |
| RA-008 | 补 smoke manifest | P0 | `scripts/smoke-manifest.mjs` |
| RA-009 | 葡语文案 QA | P0 | i18n / page copy |
| RA-010 | Feature Flag 控制 | P0 | `meponto_member.beta_enabled` |
| RA-011 | status confirmation API | P1 | write API + event |
| RA-012 | incident/SOS API | P1 | write API + audit |
| RA-013 | push token API | P1 | device registration |
| RA-014 | chat read receipt API | P1 | chat integration |

## 17. 上线策略

### 17.1 Beta 范围

第一阶段只开放：

- 内部运营。
- 指定 Leader。
- 指定 Ponto。
- 少量测试骑手。

### 17.2 灰度顺序

```txt
internal preview -> one Ponto -> one franchise -> one city area -> wider beta
```

### 17.3 回滚

优先回滚方式：

1. 关闭 `meponto_member.beta_enabled`。
2. 移除导航曝光。
3. 回滚 PR。
4. 禁用写 API。

## 18. 成功指标

| 指标 | 目标 |
| --- | --- |
| 首页打开成功率 | 99%+ |
| 钱包查看率 | beta 骑手 60%+ |
| 积分查看率 | beta 骑手 50%+ |
| Partner 地图打开率 | beta 骑手 25%+ |
| 帮助入口使用成功率 | 95%+ |
| SOS 响应 SLA | 60 秒内进入人工队列 |
| 通知已读率 | 50%+ |
| APP 崩溃率 | 低于 1% |

## 19. 最终开发口径

骑手端 APP 已经有产品模型，也已经作为 beta preview 挂入总系统，但还没有完成生产级模块接入。

开发部门下一步必须按本产品策划书执行，而不是只看页面模型。

正式接入的判断标准是：

```txt
有模块合同，
有产品策划书，
有 Feature Flag，
有 API/read model，
有权限和 audit，
有三语文案，
有 smoke test，
可以在 PontoSys 总系统中灰度、验收、回滚。
```
