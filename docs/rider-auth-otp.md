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

## 二期:Google 登录

Google 登录后做一次绑定(输 CPF + 手机验证码)→ 把 `googleSub` 写到骑手记录 →
之后 Google 一键登录按 `googleSub` 命中 `rider.id`。本期未做,接口位已预留。
