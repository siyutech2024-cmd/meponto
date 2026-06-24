# MePonto Rider — Android App (Kotlin + Jetpack Compose)

原生 Kotlin / Jetpack Compose 重写的 MePonto 骑手端 Android App,与 `ios-rider-app`
功能对齐,复刻 `docs/design-system.md` 的设计 token,文案三语齐全(zh / en / pt)。
Native Android rewrite mirroring the iOS rider app and the MePonto design tokens.

## 在 Android Studio 中运行 / Run in Android Studio

要求 / Requirements: **Android Studio Koala (2024.1) 或更新版本**,内置 JDK 17,Android SDK Platform 34。

1. Android Studio → **Open**,选择本目录 `android-rider-app`。
2. 首次打开会自动 **Gradle Sync**,下载依赖(需联网)。
3. 选择一个模拟器(如 Pixel 7, API 34)或真机。
4. 点击 **Run ▶**。无需任何 API Key 即可运行。

> 提示:本工程不包含二进制 `gradle/wrapper/gradle-wrapper.jar`(无法随源码文本分发)。
> 首次 Sync 时 Android Studio 会自动重建该文件;若用命令行,请先执行一次
> `gradle wrapper`(本机已装 Gradle 8.x),之后即可使用 `./gradlew assembleDebug`。

## 功能 / Features(与 iOS 端一致)

- **登录 Login** — 启动先走 `member-login`(手机号),成功后进入;也可「演示模式」用本地 mock 体验。
- **开屏 Splash** — 冷启动品牌开屏动画,配置可由后台下发(`/api/app/rider/splash`),Profile 内可本地预览编辑。
- **首页 Início** — 会员卡(骑手等级/星级/分数/权益 + 网点·队长·片区·99ID)、今日收益/单量/积分、绩效、任务、现金账本、合作商户权益、消息、等级预览、扫码 + 邀请二维码入口。
- **钱包 Carteira** — 可用/待结算余额、周目标、申请提现、流水。
- **班次 Turnos** — 网点限定的周排班(本周/下周切换 + 日条 + 当日列表),详情页报名进入「审核中→已通过」状态流;热区/高峰标记。
- **商城 Loja** — 积分余额 + 我的/邀请二维码快捷入口 + 商品网格(积分兑换)+ 积分流水。
- **地图 Mapa** — 风格化网点/商户分布图 + 商户列表,详情底栏一键导航(系统地图 `geo:` intent)。
- **扫码 Scan** — CameraX + ML Kit 设备端二维码扫描;无相机/模拟器可"模拟扫码"。二维码生成用 ZXing。
- **支持 / 我的** — 求助入口、FAQ、**三语切换 (中/EN/PT)**、深色/浅色/跟随系统、退出登录。

## 设计与规范对齐 / Alignment

- **设计 token**:`ui/theme/Theme.kt` 复刻 `--background / --surface / --accent(#ffd100) / --ok / --warning / --danger` 等语义 token,深色为默认,支持浅色;半径 ≤ 8,无嵌套卡片。
- **三语 (zh/en/pt)**:`i18n/Localization.kt` 运行时切换,默认葡语,选择持久化(SharedPreferences)。
- **账本式展示**:现金账本与流水以 append-only 条目呈现(对齐积分经济/账本标准)。
- **权限**:`CAMERA` 在 `AndroidManifest.xml` 声明,扫码时按需动态申请。

## 结构 / Structure

```
android-rider-app/
  settings.gradle / build.gradle / gradle.properties
  app/
    build.gradle
    src/main/AndroidManifest.xml
    src/main/res/                      # 主题、字符串、矢量启动图标
    src/main/java/com/meponto/rider/
      MainActivity.kt                  # 入口 + 主题/语言/外观注入(CompositionLocal)
      ui/theme/Theme.kt                # 设计 token、Tone、MePontoTheme
      i18n/Localization.kt             # zh/en/pt 运行时本地化
      data/Models.kt                   # 数据模型(含 Shift/ScheduleDay/积分流水)
      data/RiderTier.kt                # 骑手等级算法 + 会员资料
      data/SplashConfig.kt             # 开屏配置 + 后台拉取
      data/AppStore.kt                 # Compose 快照状态 Store(apply 合并 API 快照)
      data/MockData.kt                 # 回退用 mock 数据
      data/SessionManager.kt           # 登录态
      data/RiderRepository.kt          # API → 领域模型映射(失败回退 mock)
      data/remote/                     # Retrofit ApiService/DTO/ApiClient/CookieJar
      ui/components/                   # Panel/Badge/会员卡/二维码/QuickActionTile 等
      ui/RootScaffold.kt               # 底部导航 + Scan/Profile 全屏覆盖
      ui/screens/                      # Login/Splash/Home/Wallet/Shifts/Mall/Map/Scan/Support/Profile
```

## 接入后端 / PontoSys API

App 已接入真实 PontoSys API,基础地址在 `app/build.gradle` 的 `BuildConfig.BASE_URL`
(默认 `https://mall.meponto.com/api/`,可按 buildType 覆盖)。

- **网络栈**:Retrofit + Moshi(反射)+ OkHttp;持久化 `SessionCookieJar` 保存会话
  cookie `meponto_session`(`data/remote/`)。
- **登录**:`POST /api/member-login`(手机号)→ 写会话 cookie;`SessionManager` 记住登录态。
- **数据拉取**(登录后 `RiderRepository.loadSnapshot`):
  - `GET /api/wallet?riderName=` → 可用/待结算余额,并取得 `riderId`;
  - `GET /api/points?riderId=` → 积分余额 + 积分流水;
  - `GET /api/marketplace/catalog` → 商城商品;
  - `GET /api/slots` → 周排班;`POST /api/slots {slotId}` → 报名(需 tier-2+ 且本周开放)。
- **容错**:每个请求都包了 try/catch,任何失败(离线 / 4xx / 字段变动)自动回退到 `MockData`,
  界面永不白屏。映射在 `RiderRepository` 内,按 `docs/api.md` 契约对齐;若真实响应结构有出入,
  仅需调整该处的 DTO/mapper。
- **退出登录**:清会话 + cookie 回到登录页。

> 说明:`slots` 依赖后端会话角色与 Supabase 配额周期,需用真实可登录账号联调;未登录/演示模式下
> 自动回退本地周排班。经济类写操作(提现/兑换)目前为前端乐观更新,接入对应写端点时在
> `AppStore` 与 `RiderRepository` 收敛即可。

## 说明 / Notes

- 该 Android 工程独立于 Next.js Web 仓库,放在 `android-rider-app/`,不改动 `app/`、`app/lib`、`app/api` 等共享模块。
- 启动图标为矢量占位(品牌黄闪电);上架前可在 Android Studio 用 Image Asset 生成多密度图标。
- `applicationId` 为 `com.meponto.rider`(debug 版自动加 `.debug` 后缀,便于与 release 共存)。
