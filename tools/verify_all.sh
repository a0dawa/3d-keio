#!/usr/bin/env bash
# 全チェックポイントを通しで実行する。どれか失敗したら止まる。
#   使い方: bash tools/verify_all.sh [keio_elevated_3d.html]
set -e
HTML="${1:-keio_elevated_3d.html}"
cd "$(dirname "$0")/.."

echo "[1/10] JS構文チェック ..."
python3 tools/check_syntax.py "$HTML"

echo "[2/10] スタブ実行(ReferenceError・初期化順序バグの検出) ..."
node tools/harness.js "$HTML"

echo "[3/10] 諸元表 ⇄ 実車実測値(ソースレベル) ..."
python3 tools/auto_check.py "$HTML"

echo "[4/10] 実ジオメトリ ⇄ 実車実測値(HTMLを実行して頂点を測定) ..."
node tools/verify_car.js "$HTML"

echo "[5/10] 自動運転(停止位置・停車時間・走行線) ..."
node tools/verify_run.js "$HTML"

echo "[6/10] 高架橋の桁幅・架線 ..."
node tools/verify_line.js "$HTML"

echo "[7/10] 街並みの配置・交差鉄道 ..."
node tools/verify_city.js "$HTML"

echo "[8/10] 照明と影 ..."
node tools/verify_light.js "$HTML"

echo "[9/10] 撮影モード(時刻・季節・カメラ) ..."
node tools/verify_cine.js "$HTML"

# ⑩ は実際に描いた画素を v4 の照合ツールで測る。ブラウザ(Playwright)と three.min.js が要るので、
#    環境変数 K8_PW(playwright-core のある node_modules)と K8_THREE を渡したときだけ走る。
echo "[10/10] 8000系の描画 ⇄ v4 の照合(側面45項目・前面14項目) ..."
node tools/verify_k8render.js --html "$HTML"

echo ""
echo "==== ALL CHECKPOINTS PASSED ===="
