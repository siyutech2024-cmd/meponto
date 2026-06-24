# MePonto Android — 上架打包指南 / Release Guide

面向 Google Play 的正式打包(AAB)。签名密钥由你本人持有,密码不进仓库。

## 1. 配置签名(一次性)

你已有 keystore。在项目根目录 `android-rider-app/` 下:

```bash
cp keystore.properties.template keystore.properties
```

编辑 `keystore.properties`,填你的真实值(此文件已被 `.gitignore`,不会提交):

```properties
storeFile=你的keystore文件.jks      # 相对 android-rider-app/ 的路径,或绝对路径
storePassword=你的keystore密码
keyAlias=你的key别名
keyPassword=你的key密码
```

把 `.jks`/`.keystore` 文件放到上面 `storeFile` 指向的位置(也已被 `.gitignore`)。
密码请存在密码管理器里,别发给任何人(包括我)。

`app/build.gradle` 已接好:有 `keystore.properties` 时 release 自动用它签名;没有时 release 不签名、debug 不受影响。

## 2. 出 AAB(每次发版)

发版前按需在 `app/build.gradle` 调 `versionCode`(每次 +1)和 `versionName`。

Android Studio:**Build → Generate Signed App Bundle / APK → Android App Bundle**,
选你的 keystore(或直接用已配置的 release signingConfig),输出 `release` →
得到 `app/release/app-release.aab`。

命令行等价:

```bash
cd android-rider-app
./gradlew bundleRelease
# 产物:app/build/outputs/bundle/release/app-release.aab
```

> 首版 R8/混淆是关闭的(Moshi/Retrofit/Firebase 用反射,开混淆需额外 keep 规则),
> 体积略大但稳。后续要开 `minifyEnabled true` 时我再补 proguard 规则。

## 3. Play Console 上架清单

- [ ] **应用名**:MePonto(已配)
- [ ] **包名**:`com.meponto.rider`(已配,首次上传后不可改)
- [ ] **应用图标**:512×512 PNG(Play 商店图标,需单独提供)
- [ ] **特色图 Feature graphic**:1024×500 PNG(需单独提供)
- [ ] **手机截图**:至少 2 张。`play-store-assets/` 已有 4 张(首页/商城/班次/钱包)✅
- [ ] **简短说明 + 完整说明**:zh/en/pt 三语(对齐 App 内文案)
- [ ] **隐私政策 URL**:Play 必填(放一个 `meponto.com/privacy` 页面)
- [ ] **数据安全表单**:声明采集手机号、推送 token(FCM)等
- [ ] **内容分级问卷**
- [ ] 上传 `app-release.aab` 到内部测试轨道先验,再发生产

## 注意

- 这台模拟器跑的是 **debug** 变体(包名 `com.meponto.rider.debug`);上架的是 **release**(`com.meponto.rider`)。
- FCM 的 `google-services.json` 已含正式包 `com.meponto.rider`,正式包能正常收推送。
- 正式包首次安装登录后,FCM token 会自动注册到后端 `/api/push`。
