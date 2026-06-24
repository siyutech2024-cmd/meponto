# MePonto 上架收尾清单 / Play Store Release Checklist

> 应用:**MePonto**(包名 `com.meponto.rider`,App ID `4975379615518393315`)
> 状态(截至 2026-06-24):App content 全部声明完成;Store listing(en-US)文案草稿已保存。
> 以下为剩余步骤,按顺序做完即可提交审核。

---

## ✅ 已完成(无需再动)

- App access / 登录说明:已填演示账号(`+55 11 98423-9911`,验证码 `246810`)+ 英文操作说明,完整访问已勾选。
- 隐私政策:`https://meponto.com/privacy`
- 广告:无;广告 ID:不使用;金融功能:无;政务应用:否;健康应用:无。
- **内容评级**:问卷完成,巴西 ClassInd = Livre(全年龄),各区 Everyone/3+。
- **目标受众**:18 岁以上。
- **数据安全**:已如实声明(大致定位、姓名/邮箱/手机号/CPF、收款与提现财务信息、照片、崩溃日志与诊断、FCM 设备 ID;加密传输;不与第三方共享;删除链接 `https://meponto.com/account-deletion`)。
- **Store listing(en-US)**:App name「MePonto」+ 简短描述 + 完整描述,草稿已保存。

---

## ☐ 1. 上传并应用商店图形(Store listing → 当前页)

资源文件都在 `play-store-assets/`:

| 槽位 | 文件 | 备注 |
| --- | --- | --- |
| App icon (512×512) | `play_icon_512.png` | **已在你的素材库**,直接选中即可 |
| Feature graphic (1024×500) | `play_feature_graphic_1024x500.png` | 点 Add assets 上传后选中 |
| Phone screenshots (1080×1920) | `screen1_home.png` `screen2_loja.png` `screen3_turnos.png` `screen4_carteira.png` | 至少 2 张,建议 4 张全传 |

操作:每个槽位点 **Add assets** → 上传/选中对应文件 → 右下角 **Save**。

> 我已生成图标和特色图,并把图标上传进素材库;但 Console 的素材选择器是画布控件,自动化无法可靠点选,这一步请手动完成(几次点击)。

---

## ☐ 2. 加 pt-BR 与 zh-CN 本地化

Store listing 右上角 **Manage translations** → 添加 `Português (Brasil)` 和 `中文 (简体)`。
文案直接从 `docs/play-store-listing.md` 复制粘贴(应用名 / 简短描述 / 完整描述)。图形可复用同一套。

> 默认/面向巴西用户至少要有 **pt-BR**;zh-CN 可选。

---

## ☐ 3. 推代码 + 重新部署(让删除页上线)

提审前 `https://meponto.com/account-deletion` 必须可访问(Google 会校验)。

```bash
cd /Users/ishak/Documents/MePonto
git add app/account-deletion/page.tsx app/api/member-login/route.ts app/register/page.tsx app/lib/data.ts docs/
git commit -m "feat: account-deletion page + Google login + store listing assets"
git push        # 触发 Vercel 部署
```

部署后浏览器打开 `https://meponto.com/account-deletion` 确认正常显示(三语)。

---

## ☐ 4. 构建并签名 release AAB

要求:`targetSdk 35`(已配置)、用你已有的 keystore 签名。

```bash
cd /Users/ishak/Documents/MePonto/android-rider-app
# 确认 keystore.properties 已按 keystore.properties.template 配好(storeFile/storePassword/keyAlias/keyPassword)
./gradlew bundleRelease
# 产物:app/build/outputs/bundle/release/app-release.aab
```

> 沙箱无 Android SDK 且不接触密钥,此步必须在你本机的 Android Studio / 命令行完成。
> (可选)若要启用原生 Google 登录:在 `gradle.properties` 加 `GOOGLE_WEB_CLIENT_ID=...`,并在 Google Cloud 把 `com.meponto.rider` + 上传证书 SHA-1 注册为 Android OAuth 客户端。不配则按钮自动隐藏,不影响上架。

---

## ☐ 5. 上传 AAB 并提交审核

1. Play Console → **Test and release** → 选轨道(建议先 **Internal testing** 验证,再 **Production**)。
2. **Create new release** → 上传 `app-release.aab` → 填发布说明(Release notes,可三语)。
3. 回 **Publishing overview**,确认所有项为绿色 / 已就绪。
4. **Send for review** 提交。

---

## 提交前自查 / Pre-submit check

- [ ] 图标、特色图、≥2 张截图已应用并保存
- [ ] 至少 pt-BR 本地化完整
- [ ] `https://meponto.com/account-deletion` 与 `/privacy` 均可访问
- [ ] 演示账号能在 App 内成功登录(`+55 11 98423-9911` / `246810`)
- [ ] AAB 用正式 keystore 签名、versionCode=1、targetSdk=35
- [ ] Publishing overview 无 “Need attention”

---

*被拒主因(上一版)= 审核员无法登录。已通过演示账号 + App access 说明解决,提审时务必确认演示账号在生产环境可用。*
