# MePonto Rider — iOS App (SwiftUI)

原生 SwiftUI 重写的 MePonto 骑手端 iOS App，对齐 `app/rider-app` 的功能与 `docs/design-system.md` 的设计 token。
Native SwiftUI rewrite of the MePonto rider app, mirroring `app/rider-app` and the MePonto design tokens.

## 本地运行 / Run locally

要求 / Requirements: **macOS + Xcode 16 或更新版本**(工程使用 `objectVersion 77` 文件系统同步组,部署目标 iOS 17.0)。

1. 打开 `MePontoRider.xcodeproj`(双击,或 `open MePontoRider.xcodeproj`)。
2. 顶部选择一个 iPhone 模拟器(如 iPhone 16)。
3. 按 **⌘R** 运行。无需配置签名即可在模拟器上运行。
4. 真机调试:选中 target → Signing & Capabilities → 填入你的 Team(Bundle ID 为 `com.meponto.rider`,可按需修改)。

## 功能 / Features

- **首页 Início** — 今日收益/单量/积分、绩效、任务进度、现金账本、合作商户权益、消息、等级预览、扫码入口。
- **钱包 Carteira** — 可用/待结算余额、周目标、申请提现(内存态)、流水。
- **班次 Turnos** — 可报名班次与我的日程,报名/取消会更新名额。
- **商城 Loja** — 积分余额 + 商品网格,积分足够即可兑换(扣减积分与库存)。
- **地图 Mapa** — MapKit 显示附近合作商户,点选查看权益并一键导航(Apple Maps)。
- **扫码 Scan** — AVFoundation 二维码扫描;模拟器无相机时提供"模拟扫码"。
- **支持 / 我的** — 求助入口、FAQ、**三语切换 (中/EN/PT)**、深色/浅色/跟随系统。

## 设计与规范对齐 / Alignment

- **设计 token**:`Theme.swift` 复刻 `--background / --surface / --accent(#ffd100) / --ok / --warning / --danger` 等语义 token,深色为默认,支持浅色;半径 ≤ 8,无嵌套卡片。
- **三语 (zh/en/pt)**:`Localization.swift` 提供运行时切换,默认葡语,选择持久化(`@AppStorage`)。
- **账本式展示**:现金账本与流水以 append-only 条目呈现(对齐积分经济/账本标准)。
- **权限**:相机/定位用途说明通过构建设置注入(`INFOPLIST_KEY_NS*UsageDescription`)。

## 结构 / Structure

```
MePontoRider/
  MePontoRiderApp.swift        # @main 入口、主题/语言注入
  Theme/Theme.swift            # 设计 token
  Localization/Localization.swift  # zh/en/pt
  Models/Models.swift          # 数据模型
  Models/MockData.swift        # AppStore + 对齐 web 的 mock 数据
  Components/Components.swift   # Panel / Badge / ProgressBar / 按钮等
  Features/                    # 各页面 (Home/Wallet/Shifts/Mall/Map/Scan/Support/Profile)
  Assets.xcassets/             # AppIcon(占位)、AccentColor
```

## 接入后端 / PontoSys API

App 已接入真实 PontoSys API(与 Android 端同一套契约,`docs/api.md`),基础地址在
`Networking/APIClient.swift` 的 `API.baseURL`(默认 `https://mall.meponto.com/api/`)。

- **架构**:屏幕只读 `AppStore`;`AppStore` 通过 `RiderAPI` 协议取数。访客用
  `MockRiderAPI`(本地 mock),会员登录后注入 `LiveRiderAPI`(真实接口)——UI 零改动。
- **登录**:`AuthManager.login` 调 `POST /api/member-login`(手机号);URLSession 共享
  `HTTPCookieStorage`,会话 cookie `meponto_session` 自动保存/回传;退出登录清除该 cookie。
- **数据拉取**(`LiveRiderAPI.fetchBootstrap`):`GET /api/wallet?riderName=` →
  余额 + riderId;`GET /api/points?riderId=` → 积分余额/流水;
  `GET /api/marketplace/catalog` → 商城;`GET /api/slots` → 周排班;
  报名走 `POST /api/slots {slotId}`(详情页,用 `Shift.apiId`)。
- **容错**:每个请求 best-effort,失败/缺字段自动回退 `MockData`,界面永不空白;
  整体读取失败时 `RootContainer` 显示重试态。

## 说明 / Notes

- 访客(guest)默认 mock;登录会员后切换到真实接口。映射在 `Networking/APIClient.swift` +
  `Services/LiveRiderAPI.swift`,若真实响应结构与契约有出入,仅调整该处。
- AppIcon 目前为占位(无图),不影响编译运行;上架前在 `Assets.xcassets/AppIcon` 放入 1024×1024 图标。
- 该 iOS 工程独立于 Next.js Web 仓库,放在 `ios-rider-app/`,不改动 `app/`、`app/lib`、`app/api` 等共享模块。
