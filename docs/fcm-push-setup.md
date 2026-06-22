# 原生 FCM 推送接入 / Native FCM Push Setup

后端现已支持**原生 FCM 推送**(Android/iOS 原生 App),与既有的 Web Push(PWA / VAPID)并存。
两条通道由同一套接口与业务事件驱动,互不影响。

The backend now supports **native FCM push** (Android/iOS native apps) alongside the existing
Web Push (PWA / VAPID) path. Both channels are driven by the same endpoint and business events.

## 改了什么 / What changed

- `app/lib/push.ts` — 新增 `FcmTokenRecord` 类型与 `fcmTokens` 存储。
- `app/lib/server/fcm.ts` — Firebase Admin SDK 发送封装(`sendFcmToTokens` / `sendFcmToRider`),
  懒加载、读 env 凭据、永不抛错;无凭据时为干净的 no-op。
- `app/lib/server/memory.ts` — 注册 `fcmTokens` 集合(自动随持久层落库)。
- `app/api/push/route.ts` — 新增 `registerToken` / `unregisterToken` 动作;`send` 同时投递 FCM。
- `app/lib/server/notify.ts` — `sendPushToRider` 业务事件同时推 Web Push + FCM。
- `package.json` — 新增依赖 `firebase-admin`。

## 接口 / API contract

`POST /api/push`(开放端点,App 自行注册自己的设备 token):

```jsonc
// 注册 token(登录后,App 启动时调用)
{ "action": "registerToken", "token": "<FCM_TOKEN>", "riderName": "张三", "platform": "android" }
// 注销 token(登出时)
{ "action": "unregisterToken", "token": "<FCM_TOKEN>" }
// 发送(需 view_audit 权限;同时投 Web Push 与 FCM)
{ "action": "send", "title": "标题", "body": "正文", "riderName": "张三" }
```

Android 端已对接:`RiderRepository.registerPushToken / unregisterPushToken` → 上述动作。

## 必须配置的凭据 / Required credential（项目所有者操作)

启用前需在**服务器环境变量**注入 Firebase service-account 私钥(任选其一)。无凭据时 FCM 自动降级为不发送,不报错。

1. Firebase 控制台 → 项目设置 → **服务账号 (Service accounts)** → **生成新的私钥**,下载 JSON。
2. 二选一注入(切勿提交进仓库):
   - `FIREBASE_SERVICE_ACCOUNT` = 该 JSON 的字符串(或其 base64)。
   - 或 `GOOGLE_APPLICATION_CREDENTIALS` = 该 JSON 文件的绝对路径。
3. 部署后重启服务。`firebase-admin` 需已 `npm install`(已加入 package.json)。

> 安全:私钥由你下载并以 env secret 形式注入,绝不进仓库、绝不经过我处理。

## 验证 / Verify

```bash
npm install            # 拉取 firebase-admin
npm run codex:preflight
# App 登录 → 触发一次业务事件(如提现到账)→ 设备应收到通知
```
