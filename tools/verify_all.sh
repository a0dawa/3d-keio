#!/usr/bin/env bash
# 全チェックポイントを通しで実行する。どれか失敗したら止まる。
#   使い方: bash tools/verify_all.sh [keio_elevated_3d.html]
set -e
HTML="${1:-keio_elevated_3d.html}"
cd "$(dirname "$0")/.."

echo "[1/6] JS構文チェック ..."
python3 tools/check_syntax.py "$HTML"

echo "[2/6] スタブ実行(ReferenceError・初期化順序バグの検出) ..."
node tools/harness.js "$HTML"

echo "[3/6] 諸元表 ⇄ 実車実測値(ソースレベル) ..."
python3 tools/auto_check.py "$HTML"

echo "[4/6] 実ジオメトリ ⇄ 実車実測値(HTMLを実行して頂点を測定) ..."
node tools/verify_car.js "$HTML"

echo "[5/6] 自動運転(停止位置・停車時間・走行線) ..."
node tools/verify_run.js "$HTML"

echo "[6/6] 高架橋の桁幅・架線 ..."
node tools/verify_line.js "$HTML"

echo ""
echo "==== ALL CHECKPOINTS PASSED ===="
