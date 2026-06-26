# 骑手登录 / 身份认证(手机号归一化 + OTP + CPF 锚定)

## 身份模型(单点收敛)

骑手唯一身份 = **后台那条骑手记录 `rider.id`**(由 99 日报导入,按 99 ID / CPF 唯一)。
手机号、验证码、(二期)Google 都只是**认证方式**,最终都解析到同一个 `rider.id`。
积分 / 钱包 / 班次 / FCM token **全部绑 `rider.id`,绝不绑手机号字符串**。

## 手机号归一化

后端 `member-login` 现在把手机号归一化为巴西 E.164(数字 + 国家码 55)再比对:

- `11 98765-4321`、`11987654321`、`+55 11 98765-4321` → 都解析成 `5511987654321`。
- 导入的号码格式不一致也能匹配(比对时两边都归一化),不用改导入数据。

> 修复了之前"只输 11 位 / 带不带 55 就 404 登不进"的问题。

## OTP 流程(`/api/member-login`)

| action | 入参 | 行为 |
| --- | --- | --- |
| `request-otp` | `{ phone }` | 号在库 → 发送 6 位验证码(5 分钟有效,30s 重发限流)。号不在库 → 404 且 `needsCpf:true` |
| `request-otp` | `{ phone, cpf }` | 按 CPF 找到骑手 → 把验证码发到**新手机号**,标记为"重绑" |
| `verify-otp` | `{ phone, code }` | 校验通过 → 若是重绑则把该骑手手机号更新为新号(`rider.id` 不变,积分保留并落库)→ 下发骑手会话 cookie |
| (无 action) | `{ phone }` | Legacy 手机号直登,**给原生 App 过渡用**;设 `MEMBER_LOGIN_OTP=1` 可禁用 |

### CPF 锚定重绑(换号不丢分)

骑手用新手机号登录 → 号不在库 → 前端引导输 CPF → 用 CPF 命中已有骑手 → 验证码发到新号 →
验码通过即把手机号改到这条骑手记录上。**同一个 `rider.id`,积分/钱包零丢失,绝不产生重复账号。**

## 短信下发(Twilio,可插拔)

`sendOtp` 已接 Twilio,配置以下**生产环境变量**即真实发短信;不配则仅日志(`OTP_DEV_RETURN=1` 时把验证码回传前端便于测试):

```
TWILIO_ACCOUNT_SID=ACxxxxxxxx
TWILIO_AUTH_TOKEN=xxxxxxxx
TWILIO_FROM=+1xxxxxxxxxx        # 你的 Twilio 发送号(或 messaging service 号)
```

> 巴西建议用 WhatsApp 优先 + SMS 兜底(Twilio 同账号可扩展)。想换 Zenvia/Infobip 时,
> 只改 `sendOtp` 一个函数即可。

## 网页登录页:统一到 /register

会员登录/注册统一在 **`/register`**(骑手也是会员)。登录改为**手机验证码**(手机号 → 验证码 →
号不在库时补 CPF 重绑),走同一套 `member-login` OTP;注册仍走 `/api/register`。
**`/rider-login` 已废弃 → 301 重定向到 `/register`**(旧链接/二维码/书签继续可用),
全站内部链接已改指 `/register`。不再有第二套骑手登录页。

## 灰度与原生 App

- 网页落地页与**原生 App 都已实现 OTP**(手机号 → 验证码 → CPF 重绑),走显式
  `request-otp`/`verify-otp`,登录成功后注册 FCM token、按 `rider.id` 流转数据。
- 两端都就绪后,可在生产设 **`MEMBER_LOGIN_OTP=1`** 全量强制验证码(关闭 legacy 手机直登)。
  在没配 `TWILIO_*` 之前,可先用 `OTP_DEV_RETURN=1` 让验证码回传前端做联调。
- 原生 OTP 界面在 `AuthSheet`(手机号/验证码/CPF 三步),控制器 `AuthController.requestOtp/verifyOtp`。

## Google 登录(已落地:后端 + 网页)

单一身份:Google 只是认证方式,最终都解析到 `rider.id`(`Rider.googleSub`)。

- 后端 `member-login`:
  - `action:"google"` `{credential}` → 校验 Google ID token(`oauth2.googleapis.com/tokeninfo`,校验 `aud`==`NEXT_PUBLIC_GOOGLE_CLIENT_ID`)→ 已绑定(`googleSub` 命中)直接发会话;未绑定返回 `{needsLink:true,email}`。
  - `verify-otp` 增加可选 `googleCredential`:手机/CPF 验证通过后,把该 Google `sub` 写到骑手记录(`googleSub`),完成绑定。
- 网页 `/register`:登录页显示「Continuar com Google」按钮;已绑定直登 `/store`,未绑定切到手机+CPF 流程并在 verify 时带上 `googleCredential` 完成绑定。
- 配置:Vercel 已有 `NEXT_PUBLIC_GOOGLE_CLIENT_ID`(网页用)。

### 原生 App(代码已落地,需 OAuth 配置 + 本机编译验证)

已实现:`AuthSheet` 加「用 Google 继续」按钮(Credential Manager 取 Google ID token)→ `RiderRepository.googleLogin` → `action:"google"`;未绑定走手机+CPF,`verifyOtp` 带 `googleCredential` 完成绑定。依赖已加(`androidx.credentials` + `googleid`)。

**按钮做了门控**:`BuildConfig.GOOGLE_WEB_CLIENT_ID` 为空时按钮隐藏,不配也不影响。

启用需要:
1. `gradle.properties` 加 `GOOGLE_WEB_CLIENT_ID=xxxxx.apps.googleusercontent.com`(= `NEXT_PUBLIC_GOOGLE_CLIENT_ID` 那个 Web 客户端 ID)。
2. Google Cloud 控制台:把原生应用(包名 `com.meponto.rider` + release/上传证书 SHA-1)注册为 Android OAuth 客户端,与该 Web 客户端同一项目。
3. **在 Android Studio 编译验证**(Credential Manager 代码沙箱无法编译验证)。

> 仍建议首版可先不配(按钮隐藏)、过审后再启用 Google;不影响上架。

## 渐进式 Google 登录(可跳过先进商城,后验证)— `GOOGLE_LITE_LOGIN`

未绑定的 Google 登录**直接以"访客会员"进 PontoMall 浏览**,敏感操作(积分兑换、钱包/提现、骑手功能)再要求验证;验证时按 CPF/手机号自动把 Google 关联到已有骑手记录(**不建临时账号、不产生重复、积分零丢失**)。
**`GOOGLE_LITE_LOGIN` 默认开**;设 `GOOGLE_LITE_LOGIN=0` 才回到旧的"先绑定再进"行为。

实现要点:

- **会话 `auth-session.ts`**:`AuthSession` 增可选 `verified?`/`email?`/`googleSub?`;`verified===false` 即访客。助手 `isVerifiedSession(session)`。
- **后端 `member-login`**:`action:"google"` 未绑定 → `issueGuestSession`(发 `verified:false` 会话、`userId=guest-google-<sub>`、`defaultPath=/store`,**不写任何记录**)。`verify-otp` 成功后 `linkGoogleSubIfPresent` 把访客会话里的 `googleSub` 写到验证通过的骑手记录(完成"延后认证→合并")。
- **前端 `/register`**:访客响应带 `name` → 命中现有"写会话→跳 `/store`"分支,直接进商城。
- **越权防护(集中式)**:根目录 **`middleware.ts`** 统一拦截——对 `/api/wallet`、`/api/points`、`/api/mall`、`/api/marketplace`、`/api/partner`、`/api/tasks` 的写请求(POST/PUT/PATCH/DELETE),若是 `verified:false` 访客 → `403 needs_verification`。浏览类 GET 全部放行。
  - 这一处覆盖所有敏感写接口,各路由无需各自加守卫;新增敏感接口只需把路径加进 `GUARDED`/`matcher`。
  - 中间件**只拦 `verified:false`**(仅渐进式开时存在),所以即使关掉 flag 也是空操作、绝对安全。`wallet` 提现内另有一条明确守卫做兜底。
  - 中间件自包含、只用 Web Crypto 校验签名,**Edge 运行时安全**(不引入 `node:crypto`)。

启用步骤:**只需 push 部署**即生效(默认开)。想关闭:Vercel 设 `GOOGLE_LITE_LOGIN=0` 重新部署。
前端 Google 按钮仍受 `NEXT_PUBLIC_GOOGLE_CLIENT_ID` 与 Google Cloud 授权来源约束(记得加 `https://www.meponto.com`、`https://meponto.com`)。
