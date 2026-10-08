# 参考資料の置き場

## keio8000_v4/ — 京王8000系 車体 v4(2026-10 から HTML の車体はこれの移植)

利用者提供の Blender 4.2 用モデル `keio8000_model`(動画「京王線高架化」の車体 v4 を単体にしたもの)。
`keio_elevated_3d.html` の 9章はこの `keio8000/__init__.py` を数値も式もそのまま Three.js へ移植している。

| ファイル | 内容 |
|---|---|
| `ref/keio8000_measured_v4.md` | **寸法の根拠**(編成写真・前面写真の実測値と測り方) |
| `ref/ftex.png` | 前面写真(このリポジトリの旧前面写真)。`check_front.py` の基準 |
| `tools/check_side.py` / `check_front.py` | v4 の照合ツール。`tools/verify_k8render.js` が Three.js の描画にそのまま当てる |
| `keio8000/__init__.py` | v4 本体(形の作り方の原典) |
| `CLAUDE.md` / `README.md` | v4 の使い方・作業ルール・確かでない点 |

元の配布物のうち `keio8000.blend`(組み立て済みの編成、4.2MB)と同梱フォント
(Noto Sans CJK JP Bold の部分集合、SIL OFL 1.1)は大きいので入れていない。
`__init__.py` から作り直せる(`tools/build_library.py`)。

## 旧資料について

旧車体(2026-07〜09)の寸法の根拠だった実車写真 keio8000_front.png / keio8000_side.png は失われている。
