#!/bin/bash
# 排行榜:PRO 徽章清晰显示(用户 2026-08-10 截图反馈)
#
# ── 根因
# 徽章一直在渲染,但它被放在名字的 truncate 容器**里面** ——
# 名字一长(ALEXANDRE JOSE SOBRAL JUNIOR…),截断把徽章一起裁掉,
# 只露出一条橙色残边,看起来像渲染故障。
#
# ── 修法
#   1. 榜单行:徽章移到 truncate 容器外,名字自己截断,徽章 shrink-0
#      永远完整;徽章加大一号(9→10px)+ 金色渐变 + 微投影,更醒目
#   2. 领奖台:原来 PRO 只体现在头像渐变色(和金牌色几乎分不清),
#      名字旁加显式 PRO 徽章,与榜单行同款
#
# 数据侧不用动:接口本来就带 pool 字段;配合入库自动标记
# (push-pro-autotag),新看板骑手上榜即带金标。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> Web 预检"
npm run codex:preflight

echo "==> 提交并推送"
git add app/rider-app/ranking/page.tsx push-ranking-pro-badge.command
git commit -m "fix(ranking): the PRO badge sat inside the name's truncate container, so any long name clipped it down to an orange sliver that read as a rendering glitch — the badge now lives outside the truncation as a shrink-proof sibling while the name ellipsizes on its own, and the podium gains the same explicit badge because gold-on-gold avatar tinting was indistinguishable from the medal palette"
git push origin main

echo
echo "==> 完成。1-2 分钟部署后打开 app.meponto.com/ranking:"
echo "  · PRO 骑手每行名字后有完整金色 PRO 徽章(长名字也不裁)"
echo "  · 前三名如有 PRO,领奖台名字旁同样有徽章"
