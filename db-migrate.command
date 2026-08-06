#!/bin/bash
# 数据库迁移 —— 一键把 supabase/migrations 里未应用的 SQL 跑到线上库
#
# 解决的问题:以前 push 脚本靠 `command -v psql`,而这台 Mac 没有 psql,
# 每次都静默跳过、只打印一句"请手动去 SQL 编辑器执行"。于是代码先上线、
# DDL 后补,线上就可能读一个不存在的列。现在改用 node-postgres 直连,
# 不依赖任何外部二进制,并且有版本表记录谁跑过了。
#
# 第一次使用:脚本会自动打基线(把 19 个历史迁移标记为已应用,不执行 SQL)。
# 之后每次:只应用新增的迁移,重复运行是安全的。
cd "$(dirname "$0")" || exit 1

if [ ! -d node_modules/pg ]; then
  echo "==> 安装 pg 依赖(只需一次)"
  npm install pg --save-dev --no-audit --no-fund
fi

# 版本表不存在 = 还没打过基线。先登记历史迁移,否则会把 initial_schema 重放。
echo "==> 检查基线"
npm run migrate:baseline

echo
echo "==> 待应用的迁移"
npm run migrate:dry

echo
read -r -p "确认执行以上迁移?(y/N) " answer
case "$answer" in
  [yY]*) npm run migrate ;;
  *) echo "已取消。" ;;
esac

echo
echo "完成。以后新增迁移文件后,双击这个脚本即可。"
