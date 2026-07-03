#!/bin/zsh
# MePonto Android 一键出包:./gradlew bundleRelease,日志写入 build-release.log
cd "$(dirname "$0")"
echo "== MePonto bundleRelease started $(date) ==" > build-release.log
./gradlew bundleRelease >> build-release.log 2>&1
STATUS=$?
if [ $STATUS -eq 0 ]; then
  echo "== BUILD OK $(date) ==" >> build-release.log
  ls -la app/build/outputs/bundle/release/ >> build-release.log 2>&1
  cp app/build/outputs/bundle/release/app-release.aab ../MePonto-v1.1.aab 2>>build-release.log \
    && echo "AAB copied to repo root: MePonto-v1.1.aab" >> build-release.log
else
  echo "== BUILD FAILED exit=$STATUS $(date) ==" >> build-release.log
fi
exit $STATUS
