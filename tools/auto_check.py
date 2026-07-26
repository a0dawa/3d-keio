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
    '軌間(レール内面間)': 1.372,   # 京王線は馬車軌間1372mm(公表値)
}
REF_RANGE = {
    '側窓': (2.27, 3.05),          # [B] 実車写真の実測
}
# 利用者提供の前面プロポーション仕様書[D]の値[mm]。HTMLにも同じmm値が書かれている
# はずなので、そのまま突き合わせる(実寸への換算を挟まないので誤差が入らない)。
REF_SPEC_MM = {
    '京王ブルー帯 下端': 900,
    '京王ブルー帯 上端': 950,
    '京王レッド帯 上端': 1100,
    '前面窓 下端': 1200,
    '前面窓 上端': 2500,
    'ガラス半幅': 1350,
    '貫通扉 半幅': 400,
    'ライトケース幅': 300,
    'ランプ直径': 80,
    '排障器 下端': -500,
}


def read(src):
    def num(pat, label):
        m = re.search(pat, src)
        if not m:
            print('NG: %s が見つからない (%s)' % (label, pat))
            sys.exit(1)
        return float(m.group(1))

    # BANDS は仕様書の値を fy() で写した式(BLU[0] 等)を含むので、
    # 数値ではなく"式のまま"読み取り、隣り合う段の境界が同じ式かどうかで連続性を見る。
    bands = [(a.strip(), b.strip(), c) for a, b, c
             in re.findall(r"\{y0:([^,]+),\s*y1:([^,]+),\s*c:'(\w+)'\s*\}", src)]
    if not bands:
        print('NG: BANDS 表が見つからない')
        sys.exit(1)

    return {
        'vals': {
            '車体幅': num(r'\bW:([\d.]+),', '車体幅'),
            '車体裾(床面)高さ': num(r'\bFLOOR:([\d.]+),', '床面高さ'),
            '肩の高さ': num(r'\bSHLD:([\d.]+),', '肩'),
            '屋根高さ': num(r'\bROOF:([\d.]+),', '屋根'),
            '軌間(レール内面間)': num(r'const GAUGE=([\d.]+);', '軌間'),
        },
        'ranges': {
            '側窓': (num(r'const WIN\s*=\{B:([\d.]+),', '側窓下端'),
                     num(r'const WIN\s*=\{B:[\d.]+,\s*T:([\d.]+)\}', '側窓上端')),
        },
        'spec': {
            '京王ブルー帯 下端': num(r'const BLU=\[fy\((-?[\d.]+)\)', 'BLU下端'),
            '京王ブルー帯 上端': num(r'const BLU=\[fy\(-?[\d.]+\),fy\((-?[\d.]+)\)\]', 'BLU上端'),
            '京王レッド帯 上端': num(r'RED=\[fy\(-?[\d.]+\),fy\((-?[\d.]+)\)\]', 'RED上端'),
            '前面窓 下端': num(r'const FWIN=\{B:fy\((-?[\d.]+)\)', 'FWIN下端'),
            '前面窓 上端': num(r'const FWIN=\{B:fy\(-?[\d.]+\),\s*T:fy\((-?[\d.]+)\)\}', 'FWIN上端'),
            'ガラス半幅': num(r'const GZ=fz\((-?[\d.]+)\)', 'GZ'),
            '貫通扉 半幅': num(r'const DZ=fz\((-?[\d.]+)\)', 'DZ'),
            'ライトケース幅': num(r'G_LCASE=new THREE\.BoxGeometry\([\d.]+,fh\([\d.]+\),fz\((-?[\d.]+)\)\)', 'ケース幅'),
            'ランプ直径': num(r'G_LAMP\s*=new THREE\.CylinderGeometry\(fz\((-?[\d.]+)\)/2', 'ランプ径'),
            '排障器 下端': num(r'const SK_BOT=fy\((-?[\d.]+)\)', 'SK_BOT'),
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

    # 前面プロポーション仕様書[D]との照合(mmのまま比べる)
    print()
    print('%-18s %14s %14s %8s  %s' % ('項目([D] mm)', '仕様書', 'モデル', '差', '判定'))
    for k, v in REF_SPEC_MM.items():
        g = mdl['spec'][k]
        okk = abs(g - v) < 0.5
        ng += 0 if okk else 1
        print('%-18s %14.0f %14.0f %8.0f  %s' % (k, v, g, g - v, 'OK' if okk else 'NG'))

    # 帯の並び:[D] §6 では青が下の細帯、赤が上の太帯で、隙間なく接する。
    blu = (mdl['spec']['京王ブルー帯 下端'], mdl['spec']['京王ブルー帯 上端'])
    red_t = mdl['spec']['京王レッド帯 上端']
    ok = red_t > blu[1] and (red_t - blu[1]) > (blu[1] - blu[0])
    ng += 0 if ok else 1
    print('%-18s %14s %14s %8s  %s' % ('帯の上下', '赤が上で太い', '赤が上で太い' if ok else '不一致',
                                       '-', 'OK' if ok else 'NG'))

    # BANDS 表が下から順に隙間なく並んでいること(境界が同じ式で書かれているか)
    bands = mdl['bands']
    gap = [i for i in range(1, len(bands)) if bands[i][0] != bands[i - 1][1]]
    ok = not gap
    ng += 0 if ok else 1
    print('%-18s %14s %14s %8s  %s' % ('BANDSの連続性', '隙間なし',
                                       '隙間なし' if ok else '段%s で不連続' % gap, '-',
                                       'OK' if ok else 'NG'))
    # 帯の色の並び(下から):ステンレス→青→赤→ステンレス→屋根
    seq = [b[2] for b in bands]
    ok = seq == ['stl', 'navy', 'red', 'stl', 'roof']
    ng += 0 if ok else 1
    print('%-18s %14s %14s %8s  %s' % ('帯の並び順', 'stl/navy/red/stl/roof',
                                       '/'.join(seq), '-', 'OK' if ok else 'NG'))

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
