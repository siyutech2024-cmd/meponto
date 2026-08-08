#!/bin/bash
# PRO 提报与审核:三处减负(业务方 2026-08-07 提出"操作更简单一些")
#
# ── ① 提报列表按池过滤(加盟商/站点两端)
# 之前选中 PRO 班次,右侧仍列出全部 190 名骑手 —— 加盟商要在里面找出自己的
# 十几个 PRO,还可能误勾普通骑手,提交后才收到一串"não é PRO"的拒绝。
# 服务端校验没错,错在把校验当交互。现在:
#   · PRO 班次 → 只列 PRO 池骑手(190 → 十几人);普通班次 → 只列普通骑手
#   · 标题带金色 PRO 徽章;空列表提示写明"PRO 班只能提报 PRO 骑手"
#
# ── ② PRO 一键整周提报
# PRO 是全职、固定排班,常态是"这批人整周全班次都上"。逐班提报 = 7天×3班
# 重复点击。现在选中 PRO 班次时多一个金色按钮:
#   「提报到本周全部 PRO 班次(n 班)」
# 循环走现有 signup 接口 —— 服务端自带去重(已提报的自动跳过)、池校验、
# 配额校验,重复点也安全;结果一次汇总(新增 n 条,已存在自动跳过)。
# 加盟商每周的 PRO 提报从几十次点击变成:选人 → 一键。
#
# ── ③ 主后台审核队列加池过滤 chip
# 队列头部加「全部 / PRO / 普通」三个 chip(PRO 为金色)。
# 每周批准 PRO 名单 = 点 PRO → 全选 → 通过,三下清完。
# 全选只作用于过滤后的集合,不会把普通池的一起带上。
#
# 不动的东西:审批流仍是 提报 → 总部审核(D5"免审直通"业务方定过暂不做);
# 配额、锁班、池隔离的服务端规则一概未变 —— 变的只是把人从校验错误里解放出来。
cd "$(dirname "$0")" || exit 1
set -e
rm -f .git/index.lock

echo "==> Web 预检"
npm run codex:preflight

echo "==> 提交并推送"
git add app/components/shift-rider-picker.tsx \
        app/dispatch/franchise/page.tsx \
        app/dispatch/station/page.tsx \
        app/dispatch/page.tsx \
        push-pro-nomination-ux.command
git commit -m "feat(dispatch): make PRO nomination humane — the rider picker now filters by the shift's pool so a PRO slot lists only PRO riders instead of all 190 with server-side rejections doing the teaching, a gold one-click button submits the selected riders to every PRO shift of the week (the existing signup endpoint already dedupes, pool-checks and quota-caps, so repeats are safe), and the HQ review queue gains all/PRO/standard chips so the weekly PRO batch is chip → select all → approve"
git push origin main

echo
echo "==> 完成。验收:"
echo "  1) 加盟商工作台选 PRO 班次 → 右侧只列 PRO 骑手,标题带金色 PRO 徽章"
echo "  2) 勾人后出现金色「提报到本周全部 PRO 班次」按钮 → 一键提报整周"
echo "     再点一次 → 提示已存在自动跳过(幂等)"
echo "  3) 选普通班次 → PRO 骑手不再出现在列表里,金色按钮消失"
echo "  4) 主后台审核 tab → 队列标题下有 全部/PRO/普通 chip;"
echo "     点 PRO → 全选 → 通过,只处理 PRO 提报"
