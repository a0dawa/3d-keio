# -*- coding: utf-8 -*-
"""側面の帯・窓の寸法を「モデル定数」と「実車写真の実測」で照合する。

  前面は写真テクスチャ方式(verify_face.py で検証)なので、ここは側面を担当する。
  HTML内の定数 REDB/REDT/NVB/NVT/WINB を読み取り、正面写真から測った実測と比較する。

  使い方: python3 tools/auto_check.py [keio_elevated_3d.html]
"""
import re
import sys

HTML = sys.argv[1] if len(sys.argv) > 1 else 'keio_elevated_3d.html'
TOL = 0.10
# 正面写真(シルエット=車体幅2.845m 基準)から測った実測値[m]
REF = {'側_赤帯_上': 1.66, '側_赤帯_下': 1.43, '側_紺線_上': 1.87, '側窓_下': 2.27}


def read_model():
    src = open(HTML, encoding='utf-8').read()
    def g(p):
        m = re.search(p, src)
        if not m:
            print('NG: 定数が見つからない: %s' % p); sys.exit(1)
        return float(m.group(1))
    return {
        '側_赤帯_上': g(r'const REDB=[\d.]+, REDT=([\d.]+)'),
        '側_赤帯_下': g(r'const REDB=([\d.]+),'),
        '側_紺線_上': g(r'const NVB=[\d.]+, NVT=([\d.]+)'),
        '側窓_下':   g(r'const WINB=([\d.]+),'),
    }


def main():
    mdl = read_model()
    print('=== 側面の帯・窓:実車実測 ⇄ モデル定数 ===')
    print('%-12s %8s %8s %8s  %s' % ('項目', '実車[m]', 'モデル[m]', '差[m]', '判定'))
    ng = 0
    for k, v in REF.items():
        d = mdl[k] - v
        ok = abs(d) <= TOL
        if not ok: ng += 1
        print('%-12s %8.2f %8.2f %8.2f  %s' % (k, v, mdl[k], d, 'OK' if ok else 'NG'))
    print('\nRESULT:', 'PASS(全項目 ±%.2fm 以内)' % TOL if ng == 0 else 'FAIL(%d項目NG)' % ng)
    sys.exit(1 if ng else 0)


if __name__ == '__main__':
    main()
