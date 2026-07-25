# -*- coding: utf-8 -*-
"""京王8000系 前面:実車写真 ⇄ モデル 自動検証(写真テクスチャ方式)

  HTMLに埋め込まれた前面テクスチャ(実車正面写真を車体座標へ実寸展開したPNG)を
  復元し、実車写真から独立に測った基準値と突き合わせる。人の目視を介さず反復可能。

  使い方: python3 tools/verify_face.py [keio_elevated_3d.html]
  依存: numpy, pillow
"""
import base64
import io
import re
import sys
from collections import Counter

import numpy as np
from PIL import Image

HTML = sys.argv[1] if len(sys.argv) > 1 else 'keio_elevated_3d.html'
TOL = 0.10
# 実車写真から独立に測った基準値[m](正面シルエット=車体幅2.845m 基準)
REF = {'前面窓(黒)': (1.95, 3.42), '赤帯': (1.43, 1.66)}


def load_tex():
    src = open(HTML, encoding='utf-8').read()
    m = re.search(r'const FTEX=\{w:(\d+), h:(\d+), url:"data:image/png;base64,([^"]+)"\}', src, re.S)
    if not m:
        print('NG: HTMLに前面テクスチャ(FTEX)が見つからない'); sys.exit(1)
    img = Image.open(io.BytesIO(base64.b64decode(m.group(3)))).convert('RGB')
    # テクスチャは前面いっぱい(高さ=床0.95m〜屋根3.64m)に対応
    return np.array(img).astype(int), (-1.4225, 1.4225, 0.95, 3.64)


def classify(px):
    R, G, B = px
    if R > 115 and R - G > 50 and 55 < B < 200: return '赤帯'
    if R < 95 and G < 100 and B < 115:          return '前面窓(黒)'
    if R > 175 and G > 165 and B > 140:         return 'アイボリー'
    return 'その他'


def main():
    a, (z0, z1, y0, y1) = load_tex()
    H, W, _ = a.shape
    mid = a[:, W // 2 - 6: W // 2 + 6]
    seq = [(y1 - (iy + 0.5) * (y1 - y0) / H,
            Counter(classify(p) for p in mid[iy]).most_common(1)[0][0]) for iy in range(H)]

    print('=== 京王8000系 前面:実車写真 ⇄ モデルテクスチャ 自動検証 ===')
    print('テクスチャ %dx%d px / 範囲 z=%.2f〜%.2f m, y=%.2f〜%.2f m' % (W, H, z0, z1, y0, y1))
    print()
    print('%-12s %14s %14s %8s  %s' % ('項目', '実車[m]', 'モデル[m]', '差[m]', '判定'))
    ng = 0
    for name, (lo, hi) in REF.items():
        lim = 1.85 if name.startswith('前面窓') else 1.35
        hi_lim = 3.55 if name.startswith('前面窓') else 9.0
        ys = [y for y, c in seq if c == name and lim < y < hi_lim]
        if not ys:
            print('%-12s %14s %14s %8s  NG' % (name, '%.2f-%.2f' % (lo, hi), '-', '-')); ng += 1; continue
        g = (min(ys), max(ys))
        d = max(abs(g[0] - lo), abs(g[1] - hi))
        ok = d <= TOL
        if not ok: ng += 1
        print('%-12s %14s %14s %8.2f  %s'
              % (name, '%.2f-%.2f' % (lo, hi), '%.2f-%.2f' % g, d, 'OK' if ok else 'NG'))

    src = open(HTML, encoding='utf-8').read()
    old = ('const FWB' in src) or ('CC.black' in src)
    print('\n旧デザイン(条件式の前面窓)の残存:', 'あり NG' if old else 'なし OK')
    if old: ng += 1
    print('\nRESULT:', 'PASS' if ng == 0 else 'FAIL(%d項目NG)' % ng)
    sys.exit(1 if ng else 0)


if __name__ == '__main__':
    main()
