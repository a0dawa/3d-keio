# -*- coding: utf-8 -*-
"""前面の照合：tools/verify_render.py の front.png（150px/m、中心列=y0、z = 4.2 − (行+0.5)/150）を、
   前面写真（ref/ftex.png：z = 3.70 − 0.010993·(行+0.5)、y = (列+0.5−147.5)/91.0）と同じ方法で測って比べる。
   v4 の結果は 14項目中12項目が ±3cm 以内（外れる2項目は写真の左右非対称と、K の赤い部分の形＝写真の解像度不足）。
   並べた画像 front_compare.png と重ねた画像 front_blend.png を front.png と同じフォルダに書く。
   使い方: python3 tools/check_front.py 出力フォルダ/front.png [ref/ftex.png]"""
import numpy as np, os, sys
from PIL import Image
HERE = os.path.dirname(os.path.abspath(__file__))
front = sys.argv[1]
ftex = sys.argv[2] if len(sys.argv) > 2 else os.path.join(HERE, "..", "ref", "ftex.png")
S = os.path.dirname(os.path.abspath(front)) + "/"
ph = np.array(Image.open(ftex).convert('RGB')).astype(float)
md = np.array(Image.open(front).convert('RGB')).astype(float)
MAP = {'photo': (ph, lambda y: y * 91.0 + 147.5 - .5, lambda z: (3.70 - z) / 0.010993 - .5),
       'model': (md, lambda y: y * 150 + 240 - .5, lambda z: (4.2 - z) * 150 - .5)}


def resample(img, fc, fr, K=150, y0=-1.5, y1=1.5, z0=.8, z1=3.75):
    """共通の格子（K px/m）に並べ直す"""
    ys = np.arange(y0, y1, 1 / K); zs = np.arange(z1, z0, -1 / K)
    Y, Z = np.meshgrid(ys, zs)
    h, w, _ = img.shape
    c = np.clip(np.round(fc(Y)).astype(int), 0, w - 1); r = np.clip(np.round(fr(Z)).astype(int), 0, h - 1)
    return img[r, c], ys, zs


res = {}
for k, (img, fc, fr) in MAP.items():
    A, ys, zs = resample(img, fc, fr)
    R, G, B = A[..., 0], A[..., 1], A[..., 2]
    L = .299 * R + .587 * G + .114 * B
    red = (R > 150) & (R - G > 60)
    navy = (B > R + 15) & (L < 140) & ~red
    dark = L < 115
    out = {}
    zc = lambda idx: zs[idx]
    # 中央（|y|<0.3）の列で：黒の上端・下端、赤帯、紺線
    cols = np.where(np.abs(ys) < .3)[0]
    def vext(mask, zlo, zhi):
        f = mask[:, cols].mean(1)
        idx = [i for i in range(len(zs)) if f[i] > .5 and zlo < zs[i] < zhi]
        return (zs[max(idx)] - .5 / 150, zs[min(idx)] + .5 / 150) if idx else (None, None)
    out['黒 下端(中央)'], out['黒 上端(中央)'] = vext(dark, 1.7, 3.6)
    out['赤帯 下端'], out['赤帯 上端'] = vext(red, 1.1, 1.7)
    out['紺線 下端'], out['紺線 上端'] = vext(navy, 1.5, 1.7)
    # 端寄り（|y| 1.0〜1.2）の黒の下端・上端
    cols = np.where((np.abs(ys) > 1.0) & (np.abs(ys) < 1.2))[0]
    out['黒 下端(|y|1.1)'], out['黒 上端(|y|1.1)'] = vext(dark, 1.7, 3.6)
    # 灯火ユニット（帯の下部の暗い塊）：|y| の範囲と z の範囲
    zi = np.where((zs > 1.19) & (zs < 1.42))[0]
    sub = (L < 80)[zi][:, :]
    for side, sg in (('左', -1), ('右', 1)):
        ci = np.where((ys * sg > .5) & (ys * sg < 1.3))[0]
        m = sub[:, ci]
        cc = np.where(m.mean(0) > .3)[0]; rr = np.where(m.mean(1) > .2)[0]
        if len(cc):
            yy = ys[ci][cc]
            out[f'{side}ユニット 内端|y|'] = np.abs(yy).min(); out[f'{side}ユニット 外端|y|'] = np.abs(yy).max()
    # KEIO（紺、右上）の範囲
    zi = np.where((zs > 1.615) & (zs < 1.70))[0]; ci = np.where((ys > .5) & (ys < 1.2))[0]
    m = navy[zi][:, ci]
    cc = np.where(m.any(0))[0]; rr = np.where(m.any(1))[0]
    if len(cc):
        out['KEIO 左端 y'] = ys[ci][cc].min(); out['KEIO 右端 y'] = ys[ci][cc].max()
    res[k] = out
print(f"{'項目':<20}{'写真':>9}{'モデル':>9}   差")
ng = 0
for key in res['photo']:
    p, m = res['photo'].get(key), res['model'].get(key)
    d = None if (p is None or m is None) else m - p
    ok = d is not None and abs(d) <= .03
    ng += not ok
    fmt = lambda v: f"{v:9.3f}" if v is not None else "      nan"
    print(f"{key:<20}{fmt(p)}{fmt(m)}  {'' if d is None else f'{d:+.3f}'} {'OK' if ok else 'NG'}")
print("RESULT:", "PASS" if ng == 0 else f"{ng} 項目が 3cm を超える差")
# 並べた画像（左：写真、右：モデル）と重ね合わせ
A, ys, zs = resample(*MAP['photo']); Bm, _, _ = resample(*MAP['model'])
gap = np.full((A.shape[0], 12, 3), 255.0)
Image.fromarray(np.concatenate([A, gap, Bm], axis=1).astype(np.uint8)).save(S + 'front_compare.png')
Image.fromarray((.5 * A + .5 * Bm).astype(np.uint8)).save(S + 'front_blend.png')
