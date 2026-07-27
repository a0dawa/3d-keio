#!/usr/bin/env bash
# 全チェックポイントを通しで実行する。どれか失敗したら止まる。
#   使い方: bash tools/verify_all.sh [keio_elevated_3d.html]
set -e
HTML="${1:-keio_elevated_3d.html}"
cd "$(dirname "$0")/.."

echo "[1/7] JS構文チェック ..."
python3 tools/check_syntax.py "$HTML"

echo "[2/7] スタブ実行(ReferenceError・初期化順序バグの検出) ..."
node tools/harness.js "$HTML"

echo "[3/7] 諸元表 ⇄ 実車実測値(ソースレベル) ..."
python3 tools/auto_check.py "$HTML"

echo "[4/7] 実ジオメトリ ⇄ 実車実測値(HTMLを実行して頂点を測定) ..."
node tools/verify_car.js "$HTML"

echo "[5/7] 自動運転(停止位置・停車時間・走行線) ..."
node tools/verify_run.js "$HTML"

echo "[6/7] 高架橋の桁幅・架線 ..."
node tools/verify_line.js "$HTML"

echo "[7/7] 街並みの配置・交差鉄道 ..."
node tools/verify_city.js "$HTML"

echo ""
echo "==== ALL CHECKPOINTS PASSED ===="
