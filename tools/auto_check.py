# -*- coding: utf-8 -*-
"""京王8000系:HTML内の"諸元表"を基準値と照合する(ソースレベルの検査)。

  役割分担:
    auto_check.py  … HTMLに書かれた数値そのものを検査する。実行しないので速く、
                     表を書き換えた瞬間に落ちる。
    verify_car.js  … HTMLを実行して"出来上がったジオメトリ"を測る。
                     表は正しいのに生成コードが表を無視している、という食い違いを捕まえる。
  両方あることで「表を直したのにモデルが追従していない」「モデルを直すために
  表を書き換えてしまった」の双方を検出できる。

  基準の出典:
    [B] 実車写真の画素解析による実測値(元写真は失われたが記録は残る)
    [D] 利用者提供の前面プロポーション仕様書[mm]
    実地確認による調整(帯の下げ量 BAND_DROP / 灯具の拡大率 LAMP_K)

  使い方: python3 tools/auto_check.py [keio_elevated_3d.html]
"""
import re
import sys

HTML = sys.argv[1] if len(sys.argv) > 1 else 'keio_elevated_3d.html'
TOL = 0.02

BAND_DROP = 364     # 実地確認による帯の下げ量[mm](0.350m相当)
LAMP_K = 1.30       # 実地確認による灯具の拡大率

# [B] 実車写真の実測値[m]
REF_VAL = {
    '車体幅': 2.845,
    '車体裾(床面)高さ': 0.95,
    '肩の高さ': 3.15,
    '屋根高さ': 3.64,
    '軌間(レール内面間)': 1.372,
}
# [D] 仕様書の値[mm](実地確認の調整を反映)。mmのまま突き合わせるので換算誤差が入らない。
REF_SPEC_MM = {
    '京王ブルー帯 下端': 900 - BAND_DROP,
    '京王ブルー帯 上端': 950 - BAND_DROP,
    '京王レッド帯 上端': 1100 - BAND_DROP,
    '前面窓 下端': 1200 - BAND_DROP,      # 帯を下げたぶん窓を下へ広げる
    '前面窓 上端': 2500,
    'ガラス半幅': 1350,
    '貫通扉 半幅': 400,
    'ライトケース幅': 300 * LAMP_K,
    'ランプ直径': 80 * LAMP_K,
    '排障器 下端': -500,
}


def main():
    src = open(HTML, encoding='utf-8').read()
    ng = 0

    # 実地調整の定数をHTMLから読み、式の評価に使う
    env = {}
    for name in ('BAND_DROP', 'LAMP_K'):
        m = re.search(r'const %s\s*=\s*(-?[\d.]+)\s*;' % name, src)
        if not m:
            print('NG: %s が見つからない' % name)
            sys.exit(1)
        env[name] = float(m.group(1))

    def expr(pat, label):
        """fy(900-BAND_DROP) のような式を取り出して評価する"""
        m = re.search(pat, src)
        if not m:
            print('NG: %s が見つからない (%s)' % (label, pat))
            sys.exit(1)
        try:
            return float(eval(m.group(1), {'__builtins__': {}}, dict(env)))
        except Exception:
            print('NG: %s の値を解釈できない: %r' % (label, m.group(1)))
            sys.exit(1)

    def val(pat, label):
        m = re.search(pat, src)
        if not m:
            print('NG: %s が見つからない (%s)' % (label, pat))
            sys.exit(1)
        return float(m.group(1))

    mdl_val = {
        '車体幅': val(r'\bW:([\d.]+),', '車体幅'),
        '車体裾(床面)高さ': val(r'\bFLOOR:([\d.]+),', '床面高さ'),
        '肩の高さ': val(r'\bSHLD:([\d.]+),', '肩'),
        '屋根高さ': val(r'\bROOF:([\d.]+),', '屋根'),
        '軌間(レール内面間)': val(r'const GAUGE=([\d.]+);', '軌間'),
    }
    mdl_spec = {
        '京王ブルー帯 下端': expr(r'const BLU=\[fy\(([^)]+)\)', 'BLU下端'),
        '京王ブルー帯 上端': expr(r'const BLU=\[fy\([^)]+\),fy\(([^)]+)\)\]', 'BLU上端'),
        '京王レッド帯 上端': expr(r'RED=\[fy\([^)]+\),fy\(([^)]+)\)\]', 'RED上端'),
        '前面窓 下端': expr(r'const FWIN=\{B:fy\(([^)]+)\)', 'FWIN下端'),
        '前面窓 上端': expr(r'const FWIN=\{B:fy\([^)]+\),\s*T:fy\(([^)]+)\)\}', 'FWIN上端'),
        'ガラス半幅': expr(r'const GZ=fz\(([^)]+)\)', 'GZ'),
        '貫通扉 半幅': expr(r'const DZ=fz\(([^)]+)\)', 'DZ'),
        'ライトケース幅': expr(r'buildFacePanelGeo\(s,\s*LZ,fz\(([^)]+)\)', 'ケース幅'),
        'ランプ直径': expr(r'G_LAMP=new THREE\.CylinderGeometry\(fz\(([^)]+)\)/2', 'ランプ径'),
        '排障器 下端': expr(r'const SK_BOT=fy\(([^)]+)\)', 'SK_BOT'),
    }

    print('=== 京王8000系:諸元表 ⇄ 基準値(ソースレベル) ===')
    print('%-18s %14s %14s %8s  %s' % ('項目[B] (m)', '実測', 'モデル', '差', '判定'))
    for k, v in REF_VAL.items():
        d = mdl_val[k] - v
        ok = abs(d) <= TOL
        ng += 0 if ok else 1
        print('%-18s %14.3f %14.3f %8.3f  %s' % (k, v, mdl_val[k], d, 'OK' if ok else 'NG'))

    # 側窓は「帯の上10cm→上下30cm切詰→高さ+10%」という関係で決まる。式の形で確認する。
    ok = ('RED[1]+0.10+WIN_TRIM' in src) and ('WIN_GROW' in src)
    ng += 0 if ok else 1
    print('%-18s %14s %14s %8s  %s' % ('側窓の決め方', '帯+10cm/切詰/+10%',
                                       '帯+10cm/切詰/+10%' if ok else '別の決め方', '-',
                                       'OK' if ok else 'NG'))
    # 戸袋窓は幅を30%狭めて角丸にする
    ok = ('POCKET_NARROW' in src) and ('roundWindow(' in src)
    ng += 0 if ok else 1
    print('%-18s %14s %14s %8s  %s' % ('戸袋窓', '幅-30%・角丸',
                                       '幅-30%・角丸' if ok else '未対応', '-',
                                       'OK' if ok else 'NG'))
    # 前/後面の赤帯は側面よりさらに下げる。青帯は同じ高さ。
    m2 = re.search(r'const FRED_DROP=([\d.]+);', src)
    ok = bool(m2) and abs(float(m2.group(1)) - 0.33) < 1e-9
    ng += 0 if ok else 1
    print('%-18s %14s %14s %8s  %s' % ('前面の赤帯の追加下げ', '0.33m',
                                       (m2.group(1) + 'm') if m2 else 'なし', '-',
                                       'OK' if ok else 'NG'))
    # 灯具の高さは床面から200mm
    ok = 'const LY=fy(200)' in src
    ng += 0 if ok else 1
    print('%-18s %14s %14s %8s  %s' % ('灯具の高さ', '床面+200mm',
                                       '床面+200mm' if ok else '別の値', '-',
                                       'OK' if ok else 'NG'))
    # パンタグラフはシングルアーム型
    ok = 'シングルアーム' in src and 'PIVX:-' in src
    ng += 0 if ok else 1
    print('%-18s %14s %14s %8s  %s' % ('パンタグラフ', 'シングルアーム',
                                       'シングルアーム' if ok else '菱形', '-',
                                       'OK' if ok else 'NG'))

    print()
    print('%-18s %14s %14s %8s  %s' % ('項目[D] (mm)', '仕様書', 'モデル', '差', '判定'))
    for k, v in REF_SPEC_MM.items():
        g = mdl_spec[k]
        ok = abs(g - v) < 0.5
        ng += 0 if ok else 1
        print('%-18s %14.0f %14.0f %8.0f  %s' % (k, v, g, g - v, 'OK' if ok else 'NG'))

    # 帯の並び:[D] §6 では青が下の細帯、赤が上の太帯で、隙間なく接する
    blu = (mdl_spec['京王ブルー帯 下端'], mdl_spec['京王ブルー帯 上端'])
    red_t = mdl_spec['京王レッド帯 上端']
    ok = red_t > blu[1] and (red_t - blu[1]) > (blu[1] - blu[0])
    ng += 0 if ok else 1
    print()
    print('%-18s %14s %14s %8s  %s' % ('帯の上下', '赤が上で太い',
                                       '赤が上で太い' if ok else '不一致', '-', 'OK' if ok else 'NG'))

    # BANDS 表が下から順に隙間なく並んでいること(境界が同じ式で書かれているか)
    bands = [(a.strip(), b.strip(), c) for a, b, c
             in re.findall(r"\{y0:([^,]+),\s*y1:([^,]+),\s*c:'(\w+)'\s*\}", src)]
    if not bands:
        print('NG: BANDS 表が見つからない')
        sys.exit(1)
    gap = [i for i in range(1, len(bands)) if bands[i][0] != bands[i - 1][1]]
    ok = not gap
    ng += 0 if ok else 1
    print('%-18s %14s %14s %8s  %s' % ('BANDSの連続性', '隙間なし',
                                       '隙間なし' if ok else '段%s で不連続' % gap, '-',
                                       'OK' if ok else 'NG'))
    seq = [b[2] for b in bands]
    ok = seq == ['stl', 'navy', 'red', 'stl', 'roof']
    ng += 0 if ok else 1
    print('%-18s %14s %14s %8s  %s' % ('帯の並び順', 'stl/navy/red/stl/roof',
                                       '/'.join(seq), '-', 'OK' if ok else 'NG'))

    # 曲線追従の直方体(cbox)に上面と下面の両方があること。
    # 下面が無いと、駅の上屋を下から見たときに何も無いように見える(運転モードで発覚)。
    cb = re.search(r'function cbox\(([\s\S]*?)\n\}', src)
    ok = bool(cb) and cb.group(1).count('strip(') == 4
    ng += 0 if ok else 1
    print('%-18s %14s %14s %8s  %s' % ('cboxの面の数', '4面(上下+側面2)',
                                       '%d面' % (cb.group(1).count('strip(') if cb else 0),
                                       '-', 'OK' if ok else 'NG'))

    # 客用扉の開口は外板に"穴"を開けて奥まった戸袋にすること。
    # 外板に穴が無いと、扉を内側に置いても車体シェルに隠れて見えない。
    ok = ('DOOR_REC=' in src) and ('inDoor(' in src) and ('PAL.void' in src)
    ng += 0 if ok else 1
    print('%-18s %14s %14s %8s  %s' % ('客用扉の開口', '外板に穴+戸袋',
                                       '外板に穴+戸袋' if ok else '未対応', '-',
                                       'OK' if ok else 'NG'))
    # 開く面(ホーム側)は姿勢から計算すること(符号を決め打つと左右が逆になる)
    ok = 'localZSign(' in src
    ng += 0 if ok else 1
    print('%-18s %14s %14s %8s  %s' % ('開く面の判定', '姿勢から計算',
                                       '姿勢から計算' if ok else '決め打ち', '-',
                                       'OK' if ok else 'NG'))

    # 旧「写真転写方式」の残骸が無いこと
    dead = [s for s in ('FTEX', 'FRONT_TEX', 'FACEMAT', 'buildCarGeo', 'carColor') if s in src]
    ok = not dead
    ng += 0 if ok else 1
    print('%-18s %14s %14s %8s  %s' % ('旧写真転写方式の残存', 'なし',
                                       'なし' if ok else ','.join(dead), '-', 'OK' if ok else 'NG'))

    print('\nRESULT:', 'PASS' if ng == 0 else 'FAIL(%d項目NG)' % ng)
    sys.exit(1 if ng else 0)


if __name__ == '__main__':
    main()
