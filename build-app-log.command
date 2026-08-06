#!/bin/bash
# 重跑 APP 构建,完整日志写到 build-app.log,并把编译错误摘出来打在屏幕上。
#
# 用途:gradle 失败时终端只留一句 BUILD FAILED,真正的错误在上面几十行外
# 已经滚走了。这个脚本把全量日志落盘,最后只把 "e: " 开头的 Kotlin 编译错误
# 和 FAILURE 段落提取出来 —— 直接复制这段给我就够定位。
cd "$(dirname "$0")/android-rider-app" || exit 1

echo "==> 构建中(日志:build-app.log)…"
./gradlew bundleRelease > ../build-app.log 2>&1
status=$?
echo "exit=$status" >> ../build-app.log

echo
if [ $status -eq 0 ]; then
  echo "✓ BUILD SUCCESSFUL"
  echo "  AAB: android-rider-app/app/build/outputs/bundle/release/app-release.aab"
  ls -lh app/build/outputs/bundle/release/app-release.aab 2>/dev/null
else
  echo "✗ 构建失败 —— 编译错误如下(完整日志见 build-app.log):"
  echo "──────────────────────────────────────────"
  grep -E "^e: |^> Task .* FAILED|FAILURE:|Caused by:|error:" ../build-app.log | head -40
  echo "──────────────────────────────────────────"
  echo "把上面这段复制给 Claude 即可。"
fi
