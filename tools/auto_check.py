# -*- coding: utf-8 -*-
"""京王8000系:HTML内の"諸元表"を実車実測値と照合する(ソースレベルの検査)。

  役割分担:
    auto_check.py  … HTMLに書かれた数値(K8 / BANDS / WIN / FWIN)そのものを検査する。
                     実行しないので速く、表を書き換えた瞬間に落ちる。
    verify_car.js  … HTMLを実行して"出来上がったジオメトリ"を測る。
                     表は正しいのに生成コードが表を無視している、という食い違いを捕まえる。
  両方あることで「表を直したのにモデルが追従していない」「モデルを直すために
  表を書き換えてしまった」の双方を検出できる。

  使い方: python3 tools/auto_check.py [keio_elevated_3d.html]
"""
import re
import sys

HTML = sys.argv[1] if len(sys.argv) > 1 else 'keio_elevated_3d.html'
TOL = 0.02

# 実車写真の画素解析による実測値[m]。元写真は失われたが、この記録が実車由来の唯一の基準。
REF_VAL = {
    '車体幅': 2.845,
    '車体裾(床面)高さ': 0.95,
    '肩の高さ': 3.15,
    '屋根高さ': 3.64,
}
REF_RANGE = {
    '京王レッド帯': (1.43, 1.66),
    '京王ブルー細線': (1.83, 1.87),
    '側窓': (2.27, 3.05),
    '前面窓': (1.95, 3.42),
}


def read(src):
    def num(pat, label):
        m = re.search(pat, src)
        if not m:
            print('NG: %s が見つからない (%s)' % (label, pat))
            sys.exit(1)
        return float(m.group(1))

    bands = [(float(a), float(b), c) for a, b, c
             in re.findall(r"\{y0:([\d.]+),\s*y1:([\d.]+),\s*c:'(\w+)'\s*\}", src)]
    if not bands:
        print('NG: BANDS 表が見つからない')
        sys.exit(1)

    def band(color):
        hit = [b for b in bands if b[2] == color]
        if not hit:
            print('NG: BANDS に %s が無い' % color)
            sys.exit(1)
        return (min(b[0] for b in hit), max(b[1] for b in hit))

    return {
        'vals': {
            '車体幅': num(r'\bW:([\d.]+),', '車体幅'),
            '車体裾(床面)高さ': num(r'\bFLOOR:([\d.]+),', '床面高さ'),
            '肩の高さ': num(r'\bSHLD:([\d.]+),', '肩'),
            '屋根高さ': num(r'\bROOF:([\d.]+),', '屋根'),
        },
        'ranges': {
            '京王レッド帯': band('red'),
            '京王ブルー細線': band('navy'),
            '側窓': (num(r'const WIN\s*=\{B:([\d.]+),', '側窓下端'),
                     num(r'const WIN\s*=\{B:[\d.]+,\s*T:([\d.]+)\}', '側窓上端')),
            '前面窓': (num(r'const FWIN=\{B:([\d.]+),', '前面窓下端'),
                       num(r'const FWIN=\{B:[\d.]+,\s*T:([\d.]+)\}', '前面窓上端')),
        },
        'bands': bands,
    }


def main():
    src = open(HTML, encoding='utf-8').read()
    mdl = read(src)
    ng = 0

    print('=== 京王8000系:諸元表 ⇄ 実車実測値(ソースレベル) ===')
    print('%-18s %14s %14s %8s  %s' % ('項目', '実車[m]', '諸元表[m]', '差[m]', '判定'))
    for k, v in REF_VAL.items():
        d = mdl['vals'][k] - v
        ok = abs(d) <= TOL
        ng += 0 if ok else 1
        print('%-18s %14.3f %14.3f %8.3f  %s' % (k, v, mdl['vals'][k], d, 'OK' if ok else 'NG'))
    for k, (lo, hi) in REF_RANGE.items():
        g = mdl['ranges'][k]
        d = max(abs(g[0] - lo), abs(g[1] - hi))
        ok = d <= TOL
        ng += 0 if ok else 1
        print('%-18s %14s %14s %8.3f  %s'
              % (k, '%.2f-%.2f' % (lo, hi), '%.2f-%.2f' % g, d, 'OK' if ok else 'NG'))

    # 帯の並び:紺の細線は赤帯の"上"。ここを取り違えたのが旧実装で最も長く残ったバグ。
    red, navy = mdl['ranges']['京王レッド帯'], mdl['ranges']['京王ブルー細線']
    ok = navy[0] > red[1]
    ng += 0 if ok else 1
    print('%-18s %14s %14s %8s  %s' % ('帯の上下', '紺が上', '紺が上' if ok else '逆転', '-',
                                       'OK' if ok else 'NG'))

    # BANDS 表が下から順に隙間なく並んでいること
    bands = mdl['bands']
    gap = [i for i in range(1, len(bands)) if abs(bands[i][0] - bands[i - 1][1]) > 1e-9]
    ok = not gap
    ng += 0 if ok else 1
    print('%-18s %14s %14s %8s  %s' % ('BANDSの連続性', '隙間なし',
                                       '隙間なし' if ok else '段%s で不連続' % gap, '-',
                                       'OK' if ok else 'NG'))

    # 旧「写真転写方式」の残骸が無いこと
    dead = [s for s in ('FTEX', 'FRONT_TEX', 'FACEMAT', 'buildCarGeo', 'carColor') if s in src]
    ok = not dead
    ng += 0 if ok else 1
    print('%-18s %14s %14s %8s  %s' % ('旧写真転写方式の残存', 'なし',
                                       'なし' if ok else ','.join(dead), '-', 'OK' if ok else 'NG'))

    print('\nRESULT:', 'PASS(全項目 ±%.2fm 以内)' % TOL if ng == 0 else 'FAIL(%d項目NG)' % ng)
    sys.exit(1 if ng else 0)


if __name__ == '__main__':
    main()
