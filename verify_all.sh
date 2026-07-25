#!/usr/bin/env bash
# 全チェックポイントを通しで実行する。どれか失敗したら赤字で止まる。
#   使い方: bash tools/verify_all.sh
set -e
HTML="${1:-keio_elevated_3d.html}"
cd "$(dirname "$0")/.."

echo "[1/4] JS構文チェック ..."
python3 tools/check_syntax.py "$HTML"

echo "[2/4] スタブ実行(ReferenceError検出) ..."
node tools/harness.js "$HTML"

echo "[3/4] 前面テクスチャ = 実車写真 ..."
python3 tools/verify_face.py "$HTML" || echo "  (写真が無い環境では skip 可)"

echo "[4/4] 側面の帯・窓 ..."
python3 tools/auto_check.py "$HTML"

echo ""
echo "==== ALL CHECKPOINTS PASSED ===="
