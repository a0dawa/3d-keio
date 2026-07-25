#!/usr/bin/env bash
# 全チェックポイントを通しで実行する。どれか失敗したら止まる。
#   使い方: bash tools/verify_all.sh [keio_elevated_3d.html]
set -e
HTML="${1:-keio_elevated_3d.html}"
cd "$(dirname "$0")/.."

echo "[1/4] JS構文チェック ..."
python3 tools/check_syntax.py "$HTML"

echo "[2/4] スタブ実行(ReferenceError・初期化順序バグの検出) ..."
node tools/harness.js "$HTML"

echo "[3/4] 諸元表 ⇄ 実車実測値(ソースレベル) ..."
python3 tools/auto_check.py "$HTML"

echo "[4/4] 実ジオメトリ ⇄ 実車実測値(HTMLを実行して頂点を測定) ..."
node tools/verify_car.js "$HTML"

echo ""
echo "==== ALL CHECKPOINTS PASSED ===="
