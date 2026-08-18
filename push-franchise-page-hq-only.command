#!/bin/bash
# /franchise「加盟治理」页:仅主后台可见(业务方 2026-08-11 定)
#
# 该页是总部内部内容(合作条款、费率模型、SOP、月度治理节奏),
# 之前加盟商门户挂着「合作方案」入口能整页看到。两层处理:
#   1. 导航:从加盟商门户模块清单移除该入口(站点门户本来就没有)
#   2. 硬守卫:页面本身检查会话 —— 加盟商/站点会话直输 URL 也会
#      被弹回各自首页(/dispatch/franchise、/dispatch/station)
# 主后台不受影响。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> Web 预检"
npm run codex:preflight

echo "==> 提交并推送"
git add app/lib/portals.ts app/franchise/page.tsx push-franchise-page-hq-only.command
git commit -m "fix(franchise): the governance page goes HQ-only — commercial terms, rate models and the monthly governance cadence are internal material, yet the franchise portal linked straight to it; the nav entry is removed and the page itself now bounces franchise and station sessions to their own home, so a pasted URL grants nothing"
git push origin main

echo
echo "==> 完成。1-2 分钟部署后验收:"
echo "  1) 加盟商账号登录:门户首页无「合作方案」入口;"
echo "     直接访问 sys.meponto.com/franchise → 跳回排班配额页"
echo "  2) 站点账号直输 URL → 跳回排班提报页"
echo "  3) 主后台(SA)访问 /franchise → 正常显示"
