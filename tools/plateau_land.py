# -*- coding: utf-8 -*-
"""PLATEAU(国土交通省 3D都市モデル)の道路(tran)・土地利用(luse)・水部(wtr)の CityGML から、
沿線の「地表に敷く面」を取り出し、ビューアが読む別ファイル plateau_land.js にする。

  python3 -I tools/plateau_land.py --html keio_elevated_3d.html --out plateau_land.js \
      --tran <道路の CityGML(tran/*.gml)>... [--luse <土地利用(luse/*.gml)>...] [--wtr <水部(wtr/*.gml)>...]

  ・道路 …… tran:Road の lod1MultiSurface(道路区域の平面形。高さは0)。種別は Road_function と名称から:
            0=一般(区市町村道など)/1=幹線(国道・都道=function 2,3)/2=自動車専用(function 1・名称に「高速」)
            区間の種類 uro:sectionType(1=道路・2=橋梁・3=トンネル・4=交差部)も残す。
  ・射影・帯の絞り込み・単純化は plateau_import.py と同じ(ビューアの射影の定数は HTML から読む)。
  ・入力は外部のデータなので、DOCTYPE/ENTITY を含むファイルは読まない。

  出力(リトルエンディアン、base64 で JS に入れる):
    道路 b'PLR1' + 件数(uint32) + 件数×{種別(uint8)・区間(uint8)・頂点数 n(uint16)・
         1点目 x,z(int32,0.1m)・2点目以降 (dx,dz)(int16,0.1m)×(n−1)}
  ライセンス:CC BY 4.0。画面に出典を出すこと(建物と同じ表示に含める)。
"""
import argparse
import base64
import datetime
import json
import math
import os
import sys
import xml.etree.ElementTree as ET

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from plateau_import import html_projection, poslist, area2d, simplify  # noqa: E402

NS = {
    'gml': 'http://www.opengis.net/gml',
    'tran': 'http://www.opengis.net/citygml/transportation/2.0',
    'uro': 'https://www.geospatial.jp/iur/uro/3.1',
}
ROAD = '{%s}Road' % NS['tran']


def safe(path):
    raw = open(path, 'rb').read(4096)
    if b'<!DOCTYPE' in raw or b'<!ENTITY' in raw:
        raise SystemExit('DOCTYPE/ENTITY を含むファイルは読まない: ' + path)


def band_fn(proj, margin):
    mlat, mlon, lat0, lon0, pts = proj
    P = [((q[1] - lon0) * mlon, -(q[0] - lat0) * mlat) for q in pts]

    def ext(a, b, L):
        dx, dz = a[0] - b[0], a[1] - b[1]
        n = math.hypot(dx, dz) or 1
        return (a[0] + dx / n * L, a[1] + dz / n * L)
    P = [ext(P[0], P[1], margin)] + P + [ext(P[-1], P[-2], margin)]

    def dist(x, z):
        best = 1e18
        for (ax, az), (bx, bz) in zip(P, P[1:]):
            dx, dz = bx - ax, bz - az
            L2 = dx * dx + dz * dz
            u = max(0.0, min(1.0, ((x - ax) * dx + (z - az) * dz) / L2)) if L2 else 0.0
            best = min(best, math.hypot(x - ax - dx * u, z - az - dz * u))
        return best
    return dist


def local_name(tag):
    return tag.rsplit('}', 1)[-1]


def read_roads(path, proj, band, tol):
    safe(path)
    mlat, mlon, lat0, lon0, _ = proj
    dist = band_fn(proj, 600.0)
    out = []
    for ev, el in ET.iterparse(path, events=('end',)):
        if el.tag != ROAD:
            continue
        fn = sec = None
        name = ''
        surf = None
        for ch in el:
            ln = local_name(ch.tag)
            if ln == 'function':
                fn = (ch.text or '').strip()
            elif ln == 'name':
                name = (ch.text or '').strip()
            elif ln == 'lod1MultiSurface':
                surf = ch
        for e in el.iter():
            if local_name(e.tag) == 'sectionType':
                sec = (e.text or '').strip()
        polys = []
        if surf is not None:
            for pg in surf.iter('{%s}Polygon' % NS['gml']):
                ext = pg.find('gml:exterior', NS)       # 内周(島)は省く。道路区域の穴はごく僅か
                if ext is None:
                    continue
                for pl in ext.iter('{%s}posList' % NS['gml']):
                    polys.append(poslist(pl))
        el.clear()
        kind = 2 if (fn == '1' or '高速' in name or '自動車道' in name) else (1 if fn in ('2', '3') else 0)
        for r in polys:
            p = [((q[1] - lon0) * mlon, -(q[0] - lat0) * mlat) for q in r]
            if len(p) > 1 and math.hypot(p[0][0] - p[-1][0], p[0][1] - p[-1][1]) < 1e-6:
                p = p[:-1]
            if len(p) < 3 or area2d(p) < 1.0:
                continue
            if band and min(dist(x, z) for x, z in p[::max(1, len(p) // 24)]) > band:
                continue
            p = simplify(p, tol)
            out.append((kind, int(sec) if sec and sec.isdigit() else 0, p))
    return out


def enc_polys(magic, items):
    b = bytearray(magic) + struct_pack('<I', len(items))
    for kind, sec, p in items:
        q = [(round(x * 10), round(z * 10)) for x, z in p][:65535]
        b += struct_pack('<BBH', kind, sec, len(q))
        b += struct_pack('<ii', q[0][0], q[0][1])
        for i in range(1, len(q)):
            dx, dz = q[i][0] - q[i - 1][0], q[i][1] - q[i - 1][1]
            b += struct_pack('<hh', max(-32768, min(32767, dx)), max(-32768, min(32767, dz)))
    return bytes(b)


def struct_pack(fmt, *v):
    import struct
    return struct.pack(fmt, *v)


def main():
    ap = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    ap.add_argument('--html', default='keio_elevated_3d.html')
    ap.add_argument('--out', required=True)
    ap.add_argument('--source', default='国土交通省 3D都市モデル(Project PLATEAU)')
    ap.add_argument('--band', type=float, default=560.0, help='駅を結ぶ折れ線からこの距離[m]より遠い面は捨てる')
    ap.add_argument('--tol', type=float, default=0.3, help='輪郭の単純化の許容[m]')
    ap.add_argument('--tran', nargs='*', default=[])
    a = ap.parse_args()
    proj = html_projection(a.html)
    roads = []
    for g in a.tran:
        roads += read_roads(g, proj, a.band, a.tol)
    data = {'source': a.source, 'license': 'CC BY 4.0', 'made': datetime.date.today().isoformat(),
            'files': [os.path.basename(g) for g in a.tran],
            'roads': len(roads), 'road64': base64.b64encode(enc_polys(b'PLR1', roads)).decode('ascii')}
    with open(a.out, 'w', encoding='utf-8') as f:
        f.write('// 沿線の地表の面(道路)。出典:%s(CC BY 4.0)。tools/plateau_land.py が作る。手で直さない\n' % a.source)
        f.write('globalThis.PLATEAU_LAND=' + json.dumps(data, ensure_ascii=False) + ';\n')
    nk = [sum(1 for r in roads if r[0] == k) for k in range(3)]
    nv = sum(len(r[2]) for r in roads)
    print('道路 %d 面(一般 %d・幹線 %d・自専 %d)/ 頂点 %d / %d バイト'
          % (len(roads), nk[0], nk[1], nk[2], nv, os.path.getsize(a.out)))


if __name__ == '__main__':
    main()
