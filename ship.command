#!/bin/zsh
# MePonto 一键发布:编译验证 Android + push git。日志写入 ship.log。
cd "$(dirname "$0")"
echo "== SHIP started $(date) ==" > ship.log
echo "-- gradle assembleDebug (compile check) --" >> ship.log
(cd android-rider-app && ./gradlew assembleDebug -q) >> ship.log 2>&1
BUILD=$?
echo "-- gradle exit=$BUILD --" >> ship.log
if [ $BUILD -ne 0 ]; then
  echo "== BUILD FAILED — push aborted ==" >> ship.log
  exit 1
fi
echo "-- git push origin main --" >> ship.log
git push origin main >> ship.log 2>&1
PUSH=$?
echo "-- push exit=$PUSH --" >> ship.log
echo "== SHIP done $(date) ==" >> ship.log
exit $PUSH
