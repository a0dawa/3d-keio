# 3d-keio の進歩を、ほかのモデルへ移す仕組み

3d-keio は「上流」。戸越公園・品川・渋谷・新宿・淡路などの3Dモデルは、京王のエンジンと作り方を土台にした「下流」。
京王で機能が増えるたびに、下流へ移したい。そのための3点セット。

| 物 | 置き場 | 役目 |
|---|---|---|
| 機能の目録 | `reference/porting/features.json`(京王) | 京王でできた機能 41件。移せるか(A/B/C)・先に要る物・検証・京王の文書の節・取り込み済みの目印 |
| 状況表の道具 | `tools/upstream_status.py`(京王) | 下流のリポジトリを調べて、どの機能が済・一部・未か、次に何を移せるかを出す |
| 取り込みの記録 | 各下流の `UPSTREAM.json` | どの時点の京王まで見たか・この線区に要らない機能・手書きの状況 |
| 手順書(スキル) | `reference/porting/skill/port-from-keio/SKILL.md` → 各下流の `.claude/skills/port-from-keio/` | 下流のセッションが「京王の最新を取り込みたい」と言われたときの手順 |

## 使い方(下流のセッションで)
1. 利用者が「京王の最新を取り込んで」と言う(スキル `port-from-keio` が使われる)。
2. 上流を取得し、`python3 -I <3d-keio>/tools/upstream_status.py status . --keio <3d-keio>` で状況を見る。
3. 次に移せる機能から、1回数項目ずつ移す。そのつど下流の検証を通す。
4. `UPSTREAM.json` を更新してコミット(作業ブランチ)。

## 京王の側の約束(目録の更新)
京王で機能を足す・大きく直したら、同じ作業の中で `features.json` に1項目足す(id・title・kind・portable・since・date・detect か files・verify・doc・needs)。
そして `python3 -I tools/upstream_status.py check` を通す(id の重複・since が履歴にある・detect が京王にある)。
目録が古いと、下流は新しい機能に気づけない。

## 下流の現状(2026-11-19 の監査。`status` で再計算できる)
戸越公園(エンジン共有。京王の 1afcad8 から22コミット遅れ)・品川(2026-10-30 に京王のエンジンを複製)・渋谷・新宿・淡路(独立した作り)。
詳細は各リポジトリの `UPSTREAM.json` と `status` の出力。
