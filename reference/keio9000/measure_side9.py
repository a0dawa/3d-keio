# -*- coding: utf-8 -*-
"""京王9000系の側面写真(編成写真)を測る。写真が手に入ったら、これで 60px/m に揃えて帯・窓・扉の位置を測り、
measured_9000.md の「3. 推定値」を写真の実測へ置き換える(8000系 v4 と同じ要領。値は K9 と検証 ⑭⑮ の REF に写す)。

  python3 -I reference/keio9000/measure_side9.py 写真.png --ends 列A 列B --rail 行 [--cab left|right] [--out 出力.png] [--json]

  --ends 列A 列B … 1両の車体の両端(連結面ではなく車体の端=車体長19.5m)の列。画素の境界で
                   (左端の画素の左の縁・右端の画素の右の縁。1画素の違いは車体長の約0.1%)
  --rail 行      … レール面(レールの頭頂)の行。画素の境界で
  --cab          … 運転台がある端(先頭車を測るとき。left=画像の左)。中間車は省く
  --json         … JSON だけを出す(⑮が自分の描画に当てて、この道具が値を正しく戻すことを毎回確かめる)
  写真は真横から撮った編成写真(RailFile.jp のように遠近の小さいもの)を想定する。縦横の画素の大きさは同じとみなす。

  u = 車体の中心からの距離。--cab を渡すと運転台の側が +(v4 の measured の表と同じ)、渡さなければ画像の右が +。
  z = レール面からの高さ。どちらも [m]。
  出力:帯(京王レッド・京王ブルー)の高さ、側窓・扉窓の下端と上端、窓の並び、扉の中心(扉窓の対から)、
        先頭車ならアイボリーの後端。右の列に measured_9000.md の今の値(推定)を並べる。--out で 60px/m に直した画像も書く。
  色の判定は v4 の照合ツール(reference/keio8000_v4/tools/check_side.py)と同じ閾値:窓は「ステンレスでも
  アイボリーでも赤帯でもない所」(窓越しに見える車内や向こう側の窓の明るさに左右されない)。
  写真は 1両 1000px 以上(45px/m 未満なら警告を出す)。写真の光の具合で外れたら masks() の閾値を見直す。
  外部の写真を読むので python は -I で走らせる(手元の同名のモジュールを読み込まない)。
"""
import argparse
import json
import numpy as np
from PIL import Image

S = 60.0                       # 揃える縮尺[px/m]
BODY_L = 19.5                  # 車体長[m](公表)
DOOR_WIN_MAX = 0.60            # これより幅の狭い窓は扉窓(側窓は 0.93、扉窓は 0.41)
# measured_9000.md の今の値(推定。比べるために並べるだけで、測り方には使わない)
EST = {'red_z': (1.668, 1.833), 'blue_z': (1.557, 1.631), 'win_z': (1.924, 2.845), 'dwin_z': (1.890, 2.884),
       'doors_u': (-7.05, -2.35, 2.35, 7.05), 'ivory_u': 8.40}


def load(path, ends, rail, cab):
    im = Image.open(path).convert('RGB')
    x0, x1 = sorted(ends)
    k = S * BODY_L / (x1 - x0)                      # 60px/m への倍率
    W = int(round(im.width * k)); H = int(round(im.height * k))
    im = im.resize((W, H), Image.BICUBIC)
    a = np.asarray(im).astype(int)
    uc, rr = (x0 + x1) / 2 * k, rail * k            # 車体の中心の列・レール面の行(画素の境界)
    sg = -1.0 if cab == 'left' else 1.0             # 運転台の側を + に
    u_of = lambda px: sg * (px + .5 - uc) / S
    px_of = lambda u: int(round(uc + sg * u * S - .5))
    z_of = lambda r: (rr - (r + .5)) / S
    row_of = lambda z: int(round(rr - z * S - .5))
    return a, u_of, px_of, z_of, row_of, im, (x1 - x0) / BODY_L


def masks(a):
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    red = (R > 150) & (G < 120) & (R - G > 70)
    blue = (B > R + 25) & (R < 120)
    ivory = (R > 200) & (G > 190) & (B > 150) & (R - B > 12)
    steel = (np.abs(R - G) < 14) & (np.abs(G - B) < 16) & (R > 150) & ~ivory   # 雑音でアイボリーが灰に入るのでアイボリーを優先
    # 窓は青の判定を外さない(窓越しの暗い車内は青みが勝ちやすい。青帯は窓より下なので混ざらない)
    return {'red': red, 'blue': blue, 'ivory': ivory, 'steel': steel, 'win': ~(steel | red | ivory)}


def zrun(m, col, z_of, zlo, zhi):
    """列 col で mask が続く最も長い区間(zlo〜zhi の中)の (下端, 上端)。画素の境界で。
    1画素だけの切れ目(窓枠の細い光り・ガラスの縁)はつなぐ"""
    best, cur, gap = None, None, 0
    for r in range(m.shape[0]):
        on = bool(m[r, col]) and zlo < z_of(r) < zhi
        if on:
            cur = (r, r) if cur is None else (cur[0], r)
            gap = 0
            if best is None or cur[1] - cur[0] > best[1] - best[0]:
                best = cur
        elif cur is not None and gap == 0 and zlo < z_of(r) < zhi:
            gap = 1                                   # 1画素だけ待つ
        else:
            cur, gap = None, 0
    if best is None:
        return None
    return (z_of(best[1]) - .5 / S, z_of(best[0]) + .5 / S)


def median_run(m, cols, z_of, zlo, zhi, minlen=0.0):
    v = [q for q in (zrun(m, c, z_of, zlo, zhi) for c in cols) if q and q[1] - q[0] >= minlen]
    if not v:
        return None
    return (float(np.median([q[0] for q in v])), float(np.median([q[1] for q in v])))


def uruns(m, row, u_of, ulo, uhi, minlen=0.10):
    """行 row で mask が続く区間 [(u下限, u上限)]。ulo〜uhi の中に収まるものだけ(端で切れたものは捨てる)"""
    out, st = [], None
    W = m.shape[1]
    for px in range(W + 1):
        on = px < W and bool(m[row, px])
        if on and st is None:
            st = px
        if (not on) and st is not None:
            a_, b_ = sorted((u_of(st), u_of(px - 1)))
            lo, hi = a_ - .5 / S, b_ + .5 / S
            if hi - lo >= minlen and ulo < lo and hi < uhi:
                out.append((lo, hi))
            st = None
    return sorted(out)


def measure(path, ends, rail, cab):
    img, u_of, px_of, z_of, row_of, im, src = load(path, ends, rail, cab)
    M = masks(img)
    hw = BODY_L / 2
    # 調べる範囲:車体の端の 0.3m(妻の丸み)と、運転台の側の 1.5m(前頭部)を除く
    ulo, uhi = -hw + 0.3, (hw - 1.5) if cab else (hw - 0.3)
    ua, ub = sorted((u_of(0), u_of(img.shape[1] - 1)))      # 写真に写っている所だけ(車体が写真の端で切れていても測れる)
    ulo, uhi = max(ulo, ua + .05), min(uhi, ub - .05)
    cols = [px_of(u) for u in np.arange(ulo, uhi, 0.1)]
    # 帯:列ごとに帯の色が続く最も長い区間の、下端・上端の中央値
    red = median_run(M['red'], cols, z_of, 1.2, 2.3, 0.05)
    blue = median_run(M['blue'], cols, z_of, 1.2, 2.3, 0.05)
    # 窓の並び:窓の高さの中ほど(z 2.45)の行で「ステンレスでない」区間
    spans = uruns(M['win'], row_of(2.45), u_of, ulo, uhi)
    side = [s for s in spans if s[1] - s[0] >= DOOR_WIN_MAX]
    dwin = [s for s in spans if s[1] - s[0] < DOOR_WIN_MAX]
    # 扉:隣り合う扉窓の対(間が 0.5m 未満)の中点
    doors = [round((a_[1] + b_[0]) / 2, 3) for a_, b_ in zip(dwin, dwin[1:]) if b_[0] - a_[1] < 0.5]
    # 窓の上下:窓の幅の中ほど(角の丸みを避けて両端から 0.12m 内側)の列で、窓の続く高さの中央値
    def wz(sp):
        cs = [px_of(u) for s in sp for u in np.arange(s[0] + .12, s[1] - .12, 1 / S)]
        return median_run(M['win'], cs, z_of, 1.85, 3.15, 0.5) if cs else None
    res = {'scale_px_per_m': S, 'source_px_per_m': round(src, 1), 'u_sign': ('運転台の側が+' if cab else '画像の右が+'),
           'red_z': red, 'blue_z': blue, 'win_z': wz(side), 'dwin_z': wz(dwin),
           'side_windows_u': [(round(p, 3), round(q, 3)) for p, q in side],
           'door_windows_u': [(round(p, 3), round(q, 3)) for p, q in dwin],
           'doors_u': doors}
    if cab:
        # アイボリーの後端:乗務員扉と運転台側の KEIO ロゴより上(z 2.97〜3.25。写真では乗務員扉の上端 2.94・ロゴの上端 2.79)の
        # 行を後ろから運転台へ向かって見て、ステンレスが途切れる所(その先 0.3m のステンレスが2割未満)の中央値。
        # 境の近くの手すりの溝・扉の線がぼけてステンレスの灰に見えても、境の位置で測れる(ロゴの高さで測るとロゴを境と取る)
        n, ends = int(.3 * S), []
        for z in np.arange(2.97, 3.26, .05):
            st = M['steel'][row_of(z)]
            for u in np.arange(hw - 2.0, hw - .3, 1 / S):
                if not st[px_of(u)] and sum(bool(st[px_of(u + i / S)]) for i in range(n)) < .2 * n:
                    ends.append(u - .5 / S)
                    break
        res['ivory_u'] = round(float(np.median(ends)), 3) if ends else None
    return res, im


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('photo')
    ap.add_argument('--ends', type=float, nargs=2, required=True)
    ap.add_argument('--rail', type=float, required=True)
    ap.add_argument('--cab', choices=['left', 'right'])
    ap.add_argument('--out')
    ap.add_argument('--json', action='store_true')
    a = ap.parse_args()
    res, im = measure(a.photo, a.ends, a.rail, a.cab)
    if a.out:
        im.save(a.out)
    if a.json:
        print(json.dumps(res, ensure_ascii=False))
        return
    f = lambda q: '%.3f〜%.3f' % tuple(q) if q else '(測れない)'
    print('縮尺 %.0fpx/m(写真は %.1fpx/m)・u は%s\n' % (S, res['source_px_per_m'], res['u_sign']))
    if res['source_px_per_m'] < 45:
        print('※写真の解像度が低い(45px/m 未満=1両 880px 未満)。扉間の2枚の窓の間の柱(5cm)がぼけて1枚につながり、'
              '窓の下端が帯に寄る(33px/m で確かめた)。1両 1000px 以上の写真を使う\n')
    print('| 項目 | 写真の実測 [m] | 今の値(measured_9000.md) |\n|---|---|---|')
    print('| 京王レッドの帯 | z %s | z %s |' % (f(res['red_z']), f(EST['red_z'])))
    print('| 京王ブルーの帯 | z %s | z %s |' % (f(res['blue_z']), f(EST['blue_z'])))
    print('| 側窓 下端・上端 | z %s | z %s |' % (f(res['win_z']), f(EST['win_z'])))
    print('| 扉窓 下端・上端 | z %s | z %s |' % (f(res['dwin_z']), f(EST['dwin_z'])))
    print('| 側窓の並び | %s | 扉間の中心から 0.035〜0.938(2枚)・車端 8.49〜9.395 |'
          % ' / '.join('%.3f〜%.3f' % s for s in res['side_windows_u']))
    print('| 扉窓の並び | %s | 扉の中心から 0.113〜0.540 |' % ' / '.join('%.3f〜%.3f' % s for s in res['door_windows_u']))
    print('| 扉の中心 | %s | %s |' % (' / '.join('%.3f' % d for d in res['doors_u']),
                                      ' / '.join('%.2f' % d for d in EST['doors_u'])))
    if 'ivory_u' in res:
        print('| アイボリーの後端 | u %s | u %.2f |' % (res['ivory_u'], EST['ivory_u']))


if __name__ == '__main__':
    main()
