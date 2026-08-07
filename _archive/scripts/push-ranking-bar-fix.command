#!/bin/bash
# 修:排行榜每行的进度条一条都不显示
#
# ── 根因
# 名次色带是 `hsl(...)` 算出来的,而我用 `${c1}66` 这种**8 位 hex 后缀**给它加
# alpha。那个写法只对 hex 合法 —— `hsl(14 78% 56%)66` 是非法 CSS,
# 浏览器直接把整条 background 声明丢掉。
#
# 最难查的地方:**控制台不报错**。颜色本身(数字、头像、圆点)全是不带 alpha 的
# 纯 hsl,所以都正常显示;唯独需要透明度的进度条整条消失。看起来像"没写这个功能",
# 而不是"写了但坏了"。
#
# ── 修法
# 加一个 hsl(h,s,l,a) 函数,alpha 走标准的 `hsl(H S% L% / A)` 语法。
# PRO 的金色也一并转成 hsl,让两条路用同一套写法 —— 否则下次又会有人
# 对着金色 hex 拼 `${GOLD}66`(那个是合法的),然后照抄到色带上(那个不合法)。
# 函数注释里写死了这条,别再踩。
#
# 保留的 8 位 hex 都是真 hex(领奖台奖牌色、光晕),合法,没动。
#
# ── 部署后确认
# 每行应出现一条横向彩色渐变条,长度 = 单量/榜首,末端渐隐;榜尾保底 8% 宽。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> Web 预检"
npm run codex:preflight

echo "==> 提交并推送"
git add app/rider-app/ranking/page.tsx push-ranking-bar-fix.command
git commit -m "fix(ranking): progress bars were invisible — the rank colour ramp is built with hsl(), and an 8-digit hex alpha suffix (\`\${c1}66\`) is only valid on hex, so \`hsl(14 78% 56%)66\` made the browser drop the whole background declaration silently; every opaque colour still rendered, so it looked like the bars were never built rather than broken. Alpha now goes through an hsl(h,s,l,a) helper using the standard slash syntax, and the PRO gold is converted to hsl too so both paths share one spelling"
git push origin main

echo
echo "==> 完成。等 1-2 分钟部署,然后开 https://app.meponto.com/ranking"
echo "    每行应有一条横向彩色条(第 1 名最长、颜色最暖,越往下越偏紫)"
