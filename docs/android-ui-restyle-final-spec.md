# Android Rider App 视觉定稿 Spec — Tropical Modernista / Noite

> 定稿方向:v4(`docs/android-ui-restyle-mockups-v4.html`)。日间 Tropical、夜间 Noite,双主题共用一套组件。
> 状态:**基础层已落地**(token / 等级渐变 / 波浪纹 / 会员卡 / 积分卡 / 主按钮),布局级改造见「待办」。

## 1. Token 表(已写入 `ui/theme/Theme.kt`)

| 语义 token | Tropical(light) | Noite(dark) | 用途 |
|---|---|---|---|
| background | `#FAF6EE` 米白 | `#12081F` 深紫夜 | 页面底 |
| surface | `#FFFFFF` | `#1D1230` | 卡片 |
| surfaceRaised | `#F4EFE3` | `#251740` | 次级面 |
| surfaceHover | `#EFE9DA` | `#2E2044` | 按压态 |
| line | `#EAE4D4` | `#2E2044` | 描边/分隔 |
| text / textSoft / muted | `#141B14` / `#3B4038` / `#8B8778` | `#F4EFFA` / `#D9D2E8` / `#9D92B3` | 文字三级 |
| accent / accentInk | `#FFC400` / `#3A2C00` | `#FFC400` / `#2A1400` | 品牌黄(主行动) |
| secondary / secondaryInk | `#FF4D8D` / 白 | 同 | 荧光粉(强调/危急品牌化) |
| tertiary | `#2D6BFF` 电蓝 | `#B14DFF` 电紫 | 第三强调 |
| jungle | `#0B5C3B` | 同 | 日间 hero 深绿面 |
| ok / warning / danger | `#00A868` / `#FF6A3D` / `#E23A4E` | `#4DE0A8` / `#FF6A3D` / `#FF4D6D` | 状态 |
| heroGradient | 丛林绿 `0B5C3B→0E7A4C` | 里约落日 `FF6A3D→FF4D8D→B14DFF` | 会员/等级 hero |
| pointsGradient | `FF8A3D→FF4D8D→B14DFF` | `FFC400→FF6A3D→FF4D8D` | 积分/奖励卡 |

圆角:`MeRadius.card 20dp`、`small 12dp`、新增 `hero 24dp`;M3 Shapes 整体上调(12/14/20/24/32)。

## 2. 已完成的代码改动

| 文件 | 改动 |
|---|---|
| `ui/theme/Theme.kt` | 双色板全换;新增 secondary/tertiary/jungle/heroGradient/pointsGradient;圆角上调 |
| `data/RiderTier.kt` | 等级渐变换新语言:diamond=电蓝夜空、gold=里约落日、orange(prata)=落日粉、green(bronze)=热带绿、base=深紫 |
| `ui/components/WaveMotif.kt` | **新增** Burle Marx 波浪纹 Canvas 组件(品牌图形) |
| `ui/components/MembershipCard.kt` | hero 圆角 24dp + 波浪纹叠加(BottomEnd, alpha .22) |
| `ui/components/Components.kt` | PrimaryButton 胶囊化(CircleShape) |
| `ui/screens/MallScreen.kt` | 积分余额卡 → pointsGradient 渐变 + 波浪纹 + 白字大数字(32sp Black) |

所有 173 处 `me.*` 引用均为语义 token,未新增裸 hex(WaveMotif 默认白色属图形本体)。文案零改动,zh/en/pt 不受影响。

## 3. 色彩使用规则

1. 黄 = 主行动与关键数字,每屏一个主角;粉 = 强调与"危急"的品牌化表达;蓝/紫 = 第三层强调(KPI、图标底)。
2. 状态语义固定:绿=开放/成功、粉=危急、灰=满员/禁用(班次左边条、日历圆点同规则)。
3. 渐变只出现在 hero 级卡(会员卡、积分卡),列表与面板保持纯色,防止廉价感。
4. 波浪纹 alpha ≤ .25,只做背景纹理,禁止盖住文字。

## 4. 待办(布局级,建议单独分支逐屏做)

- HomeScreen:问候语放大(30sp)、KPI 三色块(accent/secondary/tertiary 底)、顶栏去 logo 标题化。
- ShiftsScreen:时段行加左侧状态色条(绿/粉/灰),日条选中态用 text 底+accent 数字。
- 底部导航:活性态胶囊高亮。
- 空状态插画/大图标(波浪纹可复用)。

## 5. 护栏与跨端同步(合并前必做)

- **iOS 同步**:`ios-rider-app` 的 `Theme.swift` 需同批换到本表(CLAUDE.md 要求 1:1);做不到则 PR 中声明临时例外+补齐计划。
- **design-system.md**:token 表同步更新。
- 视觉 token 替换不引入新能力,不涉及账本/RBAC/事件;若产品要求灰度,可挂 `ui.restyle.v2` flag 控制新旧色板切换。
- 验收:Android Studio 构建 + 双主题截图对比(本环境无 Android SDK,未执行编译;已做括号/引用静态检查)。
