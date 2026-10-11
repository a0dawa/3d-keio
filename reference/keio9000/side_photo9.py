# -*- coding: utf-8 -*-
"""京王9000系の側面写真(利用者提供 2026-10:下高井戸付近の踏切から 9736=先頭車・新宿方と 9036)の実測を作り直す。
measured_9000.md の「3c. 側面写真の実測」の値はこれで出した。写真はリポジトリに入れていない(引数で渡す)。

  python3 -I reference/keio9000/side_photo9.py s1.jpg s2.jpg [--out 作業フォルダ]

  s1 … 運転台が箱に隠れ、車両の後ろ半分と 9036 が見える写真(2576×1450)
  s2 … 列車が約 11.6m 右にいる写真。運転台まわりが見える
  手順(measured_9000.md 3c と同じ):
    1. 赤帯の中心線の傾きで写真を回して水平にする
    2. 列 x ⇄ 車体の X を1次元の射影 x=(aX+b)/(cX+1) で当てる。s1 は扉の中心(戸の合わせ目の暗線)を ±2.35・±7.05、
       9036 の2枚を −12.95・−17.65 として当てる(9736 の4枚だけで当てた射影が 9036 の扉と後端を当てることで、扉の位置が
       8000系と同じことを確かめる)。s2 は扉1・2 の中心と、s1 で X が決まった窓の縁で当てる
    3. 縦は扉の外形の下の線=床面 1.130(公表)。縦の縮尺は奥行きに反比例(主点の列で横と同じ)
    4. 窓は車体の明るい面が切れる所(ゴムの外縁)、帯は色の半値、細い線は暗さの極小
    5. 前面の角(平面形)は、両方の写真の前面の輪郭(側面の平面へ写した X)に x(y)=9.752−y²/20−D(1−√(1−|y/hw|ⁿ)) を当てる
  画素の範囲(どこを測るか)はこの2枚の写真に合わせた値。別の写真では範囲を見直す。
  外部の写真を読むので python は -I で走らせる。
"""
import argparse
import os
import numpy as np
from PIL import Image

CX = 1288.0                    # 主点(画像の中心。傾きはこの点の回りに直す)
Z_FLR = 1.130                  # 床面(公表)
HW = 1.384                     # 車体半幅(公表)


# ---------- 1次元の射影 ----------
def fit(pts):
    A, y = [], []
    for x, X in pts:
        xp = x - CX
        A.append([X, 1.0, -X * xp]); y.append(xp)
    p, *_ = np.linalg.lstsq(np.array(A), np.array(y), rcond=None)
    return p


def x_of(p, X):
    a, b, c = p
    return CX + (a * X + b) / (c * X + 1)


def X_of(p, x):
    a, b, c = p
    xp = x - CX
    return (xp - b) / (a - c * xp)


def sv(p, X):
    """縦の縮尺 [px/m]:主点の列では横と同じ。奥行き(cX+1)に反比例"""
    a, b, c = p
    Xc = -b / a
    sh = abs((a - b * c) / (c * Xc + 1) ** 2)
    return sh * (c * Xc + 1) / (c * X + 1)


# ---------- 画像 ----------
def deskew(path):
    im = Image.open(path).convert('RGB')
    a = np.asarray(im).astype(float)
    R, G, B = a[..., 0], a[..., 1], a[..., 2]
    red = (R - G > 25) & (R - B > 12) & (R > 45)
    xs, ys = [], []
    for x in range(300, 2300, 4):
        idx = np.nonzero(red[600:800, x])[0]
        if len(idx) < 6:
            continue
        runs = np.split(idx, np.where(np.diff(idx) > 1)[0] + 1)
        r = max(runs, key=len)
        if 7 <= len(r) <= 12:
            xs.append(x); ys.append(600 + (r[0] + r[-1]) / 2)
    xs, ys = np.array(xs), np.array(ys)
    for _ in range(3):
        k, c = np.polyfit(xs, ys, 1)
        res = ys - (k * xs + c)
        keep = np.abs(res) < max(1.0, 2.5 * res.std())
        xs, ys = xs[keep], ys[keep]
    ang = float(np.degrees(np.arctan(k)))
    imd = im.rotate(ang, resample=Image.BICUBIC, center=(im.width / 2, im.height / 2))
    b = np.asarray(imd).astype(float)
    return imd, b, .299 * b[..., 0] + .587 * b[..., 1] + .114 * b[..., 2], ang


def line_center(prof, lo):
    i = int(np.argmin(prof))
    if 0 < i < len(prof) - 1:
        a_, b_, c_ = prof[i - 1], prof[i], prof[i + 1]
        den = a_ - 2 * b_ + c_
        return lo + i + (.5 * (a_ - c_) / den if den else 0)
    return lo + i


def vline(L, x0, half, y0, y1):
    xs = np.arange(int(x0 - half), int(x0 + half) + 1)
    return line_center(L[y0:y1 + 1, xs].mean(0), xs[0])


def outer(prof, lo, hi, k=.7):
    """暗い区間の外縁(車体の明るい面が切れる所)。閾値=暗+k×(明−暗)"""
    seg = prof[lo:hi + 1]
    dv = np.percentile(seg, 20)
    bv = max(np.percentile(prof[max(0, lo - 8):lo + 1], 50), np.percentile(prof[hi:hi + 9], 50))
    thr = dv + k * (bv - dv)
    c = (lo + hi) // 2
    i = c
    while i > 0 and prof[i - 1] < thr:
        i -= 1
    left = (i - 1) + (thr - prof[i - 1]) / (prof[i] - prof[i - 1]) if prof[i] != prof[i - 1] else i
    j = c
    while j < len(prof) - 1 and prof[j + 1] < thr:
        j += 1
    right = j + (thr - prof[j]) / (prof[j + 1] - prof[j]) if prof[j + 1] != prof[j] else j
    return left + .5, right + .5


def win_box(L, p, yf, xr, yr, rows=None):
    x0, x1 = xr
    y0, y1 = yr
    ry = rows or (int(y0 + (y1 - y0) * .35), int(y0 + (y1 - y0) * .65))
    l, r = outer(L[ry[0]:ry[1] + 1].mean(0), x0 + 3, x1 - 3)
    cx = (int(x0 + (x1 - x0) * .3), int(x0 + (x1 - x0) * .7))
    t, b = outer(L[:, cx[0]:cx[1] + 1].mean(1), y0 + 3, y1 - 3)
    Xl, Xr = X_of(p, l), X_of(p, r)
    s = sv(p, (Xl + Xr) / 2)
    return (Xr, Xl), (Z_FLR + (yf - b) / s, Z_FLR + (yf - t) / s), (l, r)


def band_z(a, L, p, yf, xs):
    """赤帯と紺の帯の上下(列ごとの半値の中央値)"""
    R, G = a[..., 0], a[..., 1]
    out = []
    for x in xs:
        rg = (R - G)[680:740, x - 1:x + 2].mean(1)
        lp = L[680:740, x - 1:x + 2].mean(1)
        thr = (np.percentile(rg, 92) + np.percentile(rg, 15)) / 2
        idx = np.nonzero(rg[10:45] > thr)[0] + 10
        if len(idx) < 5:
            continue
        r = max(np.split(idx, np.where(np.diff(idx) > 1)[0] + 1), key=len)
        cr = lambda i, j, t, pr: i + (t - pr[i]) / (pr[j] - pr[i]) * (j - i) if pr[j] != pr[i] else (i + j) / 2
        r0 = 680 + cr(r[0] - 1, r[0], thr, rg) + .5
        r1 = 680 + cr(r[-1], r[-1] + 1, thr, rg) + .5
        seg = lp[int(r1 - 680) + 2:int(r1 - 680) + 14]
        dv, bv = np.percentile(seg, 15), np.percentile(lp, 92)
        t2 = (dv + bv) / 2
        di = np.nonzero(seg < t2)[0]
        if not len(di):
            continue
        d = max(np.split(di, np.where(np.diff(di) > 1)[0] + 1), key=len)
        base = int(r1 - 680) + 2
        n0 = 680 + base + cr(d[0] - 1, d[0], t2, seg) + .5 if d[0] > 0 else 680 + base + d[0]
        n1 = 680 + base + cr(d[-1], d[-1] + 1, t2, seg) + .5 if d[-1] < len(seg) - 1 else 680 + base + d[-1] + 1
        X = X_of(p, x)
        s = sv(p, X)
        z = lambda y: Z_FLR + (yf - y) / s
        out.append((z(r1), z(r0), z(n1), z(n0)))
    return np.median(np.array(out), axis=0), len(out)


# ---------- 前面の角 ----------
def nose_x(y, D, n, R=10.0):
    return 9.752 - y * y / (2 * R) - D * (1 - np.sqrt(np.maximum(0, 1 - np.abs(y / HW) ** n)))


def silhouette(cam, f, D, n):
    a, b, c = cam
    Xc, z0 = -b / a, f / abs(a)
    y = np.linspace(-HW, HW, 4001)
    t = (nose_x(y, D, n) - Xc) / (z0 + HW - y)
    return Xc + t.max() * z0


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('s1')
    ap.add_argument('s2')
    ap.add_argument('--out')
    o = ap.parse_args()
    im1, a1, L1, ang1 = deskew(o.s1)
    im2, a2, L2, ang2 = deskew(o.s2)
    if o.out:
        os.makedirs(o.out, exist_ok=True)
        im1.save(os.path.join(o.out, 's1_d.png')); im2.save(os.path.join(o.out, 's2_d.png'))
    print('傾き s1 %.3f° s2 %.3f°' % (ang1, ang2))
    # s1:扉の中心(9736 の4枚と 9036 の2枚)
    d1 = [vline(L1, x, 6, 640, 690) for x in (466.5, 789, 1100, 1416, 1808.5, 2119)]
    Xd = [7.05, 2.35, -2.35, -7.05, -12.95, -17.65]
    p1 = fit(list(zip(d1, Xd)))
    p4 = fit(list(zip(d1[:4], Xd[:4])))
    print('s1 扉の中心 x', ' '.join('%.2f' % v for v in d1), ' 残差', ' '.join('%+.2f' % (x - x_of(p1, X)) for x, X in zip(d1, Xd)))
    print('  9736 の4枚だけの射影:9036 の扉 %.1f/%.1f(実 %.1f/%.1f)・後端 X=−9.75 → x %.1f' % (
        x_of(p4, -12.95), x_of(p4, -17.65), d1[4], d1[5], x_of(p4, -9.75)))
    yf1 = float(np.median([line_center(L1[744:753, x - 1:x + 2].mean(1), 744) + .5 for x in (1070, 1080, 1120, 1130, 1385, 1395, 1435, 1445)]))
    yt1 = float(np.median([line_center(L1[619:630, x - 1:x + 2].mean(1), 619) + .5 for x in (1070, 1080, 1120, 1130, 1385, 1395, 1435, 1445)]))
    print('扉の外形:床(下の線) y %.2f・上の線 z %.3f' % (yf1, Z_FLR + (yf1 - yt1) / sv(p1, -4.7)))
    bz, nb = band_z(a1, L1, p1, yf1, list(range(560, 680, 6)) + list(range(840, 1050, 6)) + list(range(1160, 1340, 6)) + list(range(1470, 1580, 6)))
    print('帯(%d列):赤 %.3f〜%.3f・紺 %.3f〜%.3f' % (nb, bz[0], bz[1], bz[2], bz[3]))
    print('窓(外縁):[X の範囲] [z の範囲]  基準からの離れ')
    for nm, xr, yr, ref, rows in (('扉2 左の戸の窓', (742, 782), (626, 702), 2.35, (640, 650)), ('扉2 右の戸の窓', (787, 827), (626, 702), 2.35, (640, 650)),
                                  ('扉3 左の戸の窓', (1058, 1098), (626, 702), -2.35, (668, 690)), ('扉3 右の戸の窓', (1103, 1143), (626, 702), -2.35, (668, 690)),
                                  ('側窓 扉2-3 左', (874, 946), (628, 702), 0, None), ('側窓 扉2-3 右', (938, 1010), (628, 702), 0, None),
                                  ('側窓 扉3-4 左', (1190, 1262), (628, 702), -4.70, None), ('側窓 扉3-4 右', (1254, 1326), (628, 702), -4.70, None),
                                  ('車端の窓', (1504, 1577), (628, 702), 0, None)):
        (Xa, Xb), (za, zb), _ = win_box(L1, p1, yf1, xr, yr, rows)
        print('  %-14s X %+.3f〜%+.3f  z %.3f〜%.3f  (|X−%+.2f| %.3f〜%.3f)' % (nm, Xa, Xb, za, zb, ref, min(abs(Xa - ref), abs(Xb - ref)), max(abs(Xa - ref), abs(Xb - ref))))
    # s2:扉1・2 の中心と、s1 で X が決まった窓の縁(両方の写真で見える窓)で当て、1.2px を超えて外れる点を落とす
    #     (縁の名前:s1 での範囲・行 / s2 での範囲・行)
    W = (((556, 630), None, (1166, 1240), None), ((622, 690), None, (1233, 1304), None), ((874, 946), None, (1482, 1553), None),
         ((938, 1010), None, (1546, 1618), None), ((1190, 1262), None, (1793, 1864), None), ((1254, 1326), None, (1857, 1928), None),
         ((742, 782), (640, 650), (1352, 1390), (655, 668)), ((787, 827), (640, 650), (1396, 1436), (655, 668)),
         ((425, 465), (640, 650), (1033, 1074), (655, 668)), ((1058, 1098), (668, 690), (1662, 1702), (655, 668)),
         ((1504, 1577), None, (2100, 2172), None))
    pts = [(vline(L2, 1077, 6, 646, 700), 7.05), (vline(L2, 1393, 6, 646, 700), 2.35)]
    for xr1, r1, xr2, r2 in W:
        (Xa, Xb), _, _ = win_box(L1, p1, yf1, xr1, (626, 702), r1)
        _, _, (l2, r2x) = win_box(L2, (1, 0, 0), 0, xr2, (630, 712), r2)
        pts += [(l2, Xb), (r2x, Xa)]                 # 写真の左の縁=運転台の側(X の大きい方)
    p2 = fit(pts)
    for _ in range(3):
        keep = [q for q in pts if abs(q[0] - x_of(p2, q[1])) < 1.2]
        p2 = fit(keep)
    yf2 = float(np.median([line_center(L2[752:768, x - 1:x + 2].mean(1), 752) + .5 for x in (1050, 1060, 1095, 1105, 1365, 1375, 1410, 1420)]))
    print('s2 の射影(%d/%d点、残差 1.2px 以内)・床 y %.2f・後端 X=−9.75 → x %.1f' % (len(keep), len(pts), yf2, x_of(p2, -9.75)))

    def edge(L, x0, x1, y0, y1, rising):
        pr = L[y0:y1 + 1, x0:x1 + 1].mean(0)
        g = np.diff(pr) * (1 if rising else -1)
        i = int(np.argmax(g))
        if 0 < i < len(g) - 1:
            a_, b_, c_ = g[i - 1], g[i], g[i + 1]
            den = a_ - 2 * b_ + c_
            return x0 + i + 1 + (.5 * (a_ - c_) / den if den else 0)
        return x0 + i + 1
    for nm, x in (('前面窓の回り込みの後端', edge(L2, 905, 922, 640, 680, True)), ('乗務員扉 前', vline(L2, 944.5, 3, 640, 660) + .5),
                  ('乗務員扉 後', vline(L2, 977.5, 3, 640, 660) + .5), ('手すり 前', vline(L2, 938.5, 3, 690, 712) + .5),
                  ('手すり 後', vline(L2, 980.5, 4, 690, 740) + .5), ('乗務員扉の窓 前', edge(L2, 946, 956, 660, 700, False)),
                  ('乗務員扉の窓 後', edge(L2, 967, 978, 660, 700, True)), ('アイボリーの後端', edge(L2, 980, 992, 605, 640, False))):
        print('  %-14s X %+.3f' % (nm, X_of(p2, x)))
    def hedge(L, x0, x1, y0, y1, rising):
        pr = L[y0:y1 + 1, x0:x1 + 1].mean(1)
        g = np.diff(pr) * (1 if rising else -1)
        i = int(np.argmax(g))
        if 0 < i < len(g) - 1:
            a_, b_, c_ = g[i - 1], g[i], g[i + 1]
            den = a_ - 2 * b_ + c_
            return y0 + i + 1 + (.5 * (a_ - c_) / den if den else 0)
        return y0 + i + 1
    z2 = lambda x, y: Z_FLR + (yf2 - y) / sv(p2, X_of(p2, x))
    hl = lambda x0, x1, y0, y1: line_center(L2[y0:y1 + 1, x0:x1 + 1].mean(1), y0) + .5
    print('運転台まわりの高さ(s2)')
    for nm, x, y in (('乗務員扉 上の線', 960, hl(950, 970, 630, 645)), ('乗務員扉 下の線', 948, hl(946, 950, 752, 770)),
                     ('乗務員扉の窓 上', 961, hedge(L2, 955, 968, 640, 656, False)), ('乗務員扉の窓 下', 961, hedge(L2, 955, 968, 696, 712, True)),
                     ('手すり 上', 941, hl(938, 944, 660, 680)), ('手すり 下', 941, hl(938, 944, 740, 760)),
                     ('回り込み 上', 904, hedge(L2, 898, 910, 600, 625, False)), ('回り込み 下', 904, hedge(L2, 898, 910, 690, 712, True)),
                     ('KEIO 上', 1007, hedge(L2, 995, 1020, 642, 652, False)), ('KEIO 下', 1007, hedge(L2, 995, 1020, 654, 664, True))):
        print('  %-12s z %.3f' % (nm, z2(x, y)))

    def bbox(L, p, yf, x0, x1, y0, y1, k=.5):
        sub = L[y0:y1 + 1, x0:x1 + 1]
        bg = np.percentile(sub, 85)
        ys, xs = np.nonzero(sub < bg - k * (bg - np.percentile(sub, 3)))
        l, r, t, b = x0 + xs.min(), x0 + xs.max() + 1, y0 + ys.min(), y0 + ys.max() + 1
        Xl, Xr = X_of(p, l), X_of(p, r)
        s = sv(p, (Xl + Xr) / 2)
        return Xr, Xl, Z_FLR + (yf - b) / s, Z_FLR + (yf - t) / s
    print('幕板・窓の上端の高さの小物(s1、暗い所の外接矩形)')
    for nm, r in (('行先表示器', (880, 936, 604, 630)), ('表示灯', (942, 960, 602, 630)), ('車号 9736', (516, 558, 630, 648)),
                  ('KEIO(運転台側)', (372, 420, 630, 650)), ('KEIO(反対の端)', (1326, 1366, 630, 648)), ('車号 9036', (1858, 1900, 630, 648))):
        print('  %-14s X %+.3f〜%+.3f  z %.3f〜%.3f' % ((nm,) + bbox(L1, p1, yf1, *r)))
    # すそ・側面の上端(雨どいの下)
    sz, tz = [], []
    for x in list(range(840, 870, 2)) + list(range(1160, 1190, 2)) + list(range(1460, 1500, 2)):
        pr = L1[740:770, x - 1:x + 2].mean(1)
        i = int(np.argmin(np.diff(pr)))
        thr = (pr[i] + pr[i + 1]) / 2
        yb = 740 + i + .5 + ((thr - pr[i]) / (pr[i + 1] - pr[i]) if pr[i + 1] != pr[i] else .5)
        pt = L1[592:606, x - 1:x + 2].mean(1)
        yt = 592 + int(np.argmax(np.diff(pt))) + 1
        X = X_of(p1, x)
        sz.append(Z_FLR + (yf1 - yb) / sv(p1, X)); tz.append(Z_FLR + (yf1 - yt) / sv(p1, X))
    print('すそ z %.3f・側面の上端(雨どいの下) z %.3f' % (np.median(sz), np.median(tz)))
    # 前面の角:両方の写真の輪郭(窓の高さ)。s1 は背景から運転台の端の暗い帯(回り込んだ窓)へ変わる所、s2 は背景から窓へ
    obs1 = X_of(p1, edge(L1, 288, 304, 635, 645, False))
    obs2 = X_of(p2, edge(L2, 890, 906, 640, 680, False))
    print('前面の輪郭(側面の平面へ写した X):s1 %.3f・s2 %.3f' % (obs1, obs2))
    for f in (1935, 2100):
        best = sorted((np.hypot(silhouette(p1, f, D, n) - obs1, silhouette(p2, f, D, n) - obs2), D, n)
                      for D in np.arange(.10, .36, .02) for n in (3, 4, 6, 8))[:3]
        print('  f=%d px:' % f, '  '.join('D %.2f n %d 誤差 %.3f' % (D, n, e) for e, D, n in best))


if __name__ == '__main__':
    main()
