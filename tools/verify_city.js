// 街並み(建物・樹木)の配置と、交差鉄道(井の頭線・世田谷線)の列車を検査する。
//
//   建物が道路や川の上に建っている・高架下に潜り込んでいる・建物同士がめり込んでいる、
//   といった不具合は俯瞰では気づきにくい。実際に置かれた1棟ずつの世界座標を測り、
//   「置いてはいけない場所」と突き合わせる。
//
//   ※ 期待値(道路の幅・鉄道の建築限界・最小離隔)は検証側が独立に持つ。
//     モデルの KEEP 表をそのまま読むと、表を緩めれば検査も緩む循環になる。
//
//   使い方: node tools/verify_city.js [keio_elevated_3d.html]
const path = process.argv[2] || 'keio_elevated_3d.html';
const X = require('./stub_three')(path,
  'CITY:CITY,deckHalf:deckHalf,DOM:DOM,INO:INO,SETA:SETA,XR:XR,K8:K8,' +
  'KAN7_X:KAN7_X,NAKANO_X:NAKANO_X,HOSHA23_X:HOSHA23_X,KYU_INOKA_X:KYU_INOKA_X,H154_X:H154_X,H128_X:H128_X,' +
  'H133_X:H133_X,H215_X:H215_X,KANPACHI_X:KANPACHI_X,H216_X:H216_X,H217_X:H217_X,' +
  'JOSUI_X:JOSUI_X,BRIDGE:BRIDGE,XINGS:XINGS,WADA_S:WADA_S,WADA_OFF:WADA_OFF,' +
  'PLAZA_S:PLAZA_S,PLAZA_OFF:PLAZA_OFF,SUBK:SUBK,SUBC:SUBC,' +
  'stepXRail:stepXRail,inoTrains:inoTrains,setaCars:setaCars,LAT0:LAT0,MLAT:MLAT,' +
  'SETA_LO:SETA_LO,SETA_HI:SETA_HI,SETA_CARS:SETA_CARS,SETA_PITCH:SETA_PITCH,' +
  'XCAR:XCAR,K8GEO:K8GEO,XM_WHL:XM_WHL,' +
  'GAUGE_INO:GAUGE_INO,GAUGE_SETA:GAUGE_SETA,RAIL_W:RAIL_W,prjXY:prjXY,frame:frame,' +
  'VIA_COLS:VIA_COLS,EXPY:EXPY,railY:railY,DECK_END:DECK_END,ROADS_PL:ROADS_PL');

/* ---- 期待値(検証側が独立して持つ) ----------------------------------------
   道路の幅は4章の描画寸法(box の第1引数)。ここでは"路面の半幅"だけを持ち、
   モデル側が持つ余裕(路肩)は足さない ⇒ 路面に載っていれば必ずNGになる。 */
const REF = {
  MIN_BUILDINGS: 9000,      // 倍増後の下限(2026-10 利用者指示。前回は約5,000棟)
  MIN_TREES: 2000,          // 倍増後の下限(前回1,100本)
  DECK_CLEAR: 4.6,          // 高架下+側道の外縁(桁半幅からの距離[m])
  // 交差鉄道の建築限界の半幅[m]。井の頭線=複線+掘割擁壁(±9.4)、世田谷線=単線+ホーム
  XRAIL_HALF: { 井の頭線: 11.0, 世田谷線: 7.5 },
  GAP: 0.0,                 // 物同士は外接円が重ならなければよい(接触=NG)
  // [s位置, 路面の半幅[m], offの半長([m]。省略=全幅)]
  CROSS: [['環七', 'KAN7_X', 15], ['中野通り', 'NAKANO_X', 10], ['放射23', 'HOSHA23_X', 9], ['旧井の頭', 'KYU_INOKA_X', 7],
  ['補助154', 'H154_X', 8, undefined, '計画'], ['補助128', 'H128_X', 7.5, undefined, '計画'], ['補助133', 'H133_X', 7.5, undefined, '計画'],
  ['補助215', 'H215_X', 7.5, undefined, '計画'], ['環八', 'KANPACHI_X', 17], ['補助216', 'H216_X', 8, undefined, '計画'],
  ['補助217', 'H217_X', 8, undefined, '計画'], ['玉川上水', 'JOSUI_X', 7.5, 230]],
  // 実データの道路(plateau_land.js)があるときの基準。建物は道路の縁に接して建つので、食い込み 0.3m までは許す
  ROAD_BLDG_IN: 0.3,
  XING_MIN: 3,              // 線路を横切る道路とみなす長さ[m](中心と桁の両端が道路の上に続く)
  XING_COL_CLEAR: 1.0,      // 横切る道路の縁から柱の中心までの最小[m](柱の半幅0.5+余裕)
  EXPY_CLEAR: 7.0,          // 自動車道の床版の下面とレール面の最小の差[m](架線の上)
  RIVER_HALF: 4.5,          // 仙川(河川)の半幅[m]
  RIVER_OFF: 75,
  POND: [[-105, 22, 19], [115, -24, 21]],   // 和田堀給水所の池 [WADA_Sからのs, off, 半径]
  // 並行道路 [名称, offの中心, 路面の半幅, s範囲]
  PARA: [['甲州街道', 158, 13, -1e9, 1e9], ['旧甲州街道', 93, 5, 4200, 1e9],
  ['首都高4号', 300, 8, 2000, 6100]],
  // 井の頭線:5両編成。明大前のホーム(実測緯度・長さ110m)。上り(渋谷方)は東側、下り(吉祥寺方)は西側
  INO_CARS: 5,
  INO_PLAT: [{ n: '上り(東側)', lat: 35.6674073382136, side: 1 }, { n: '下り(西側)', lat: 35.66801642659758, side: -1 }],
  INO_PLAT_LEN: 110,
  INO_DWELL_MIN: 15,        // 明大前での停車[秒]の下限
  SIM: [0.25, 1600],        // 走らせる刻み[秒]・回数(400秒=上下とも1往復以上)
};

const rows = [];
let ng = 0;
function ok(name, cond, expect, got) {
  if (!cond) ng++;
  rows.push([name, String(expect), String(got), cond ? 'OK' : 'NG']);
}

const B = X.CITY.buildings, T = X.CITY.trees;
/* 測る点:模式の建物・樹木は外接円(中心と半径)。PLATEAU の建物は足跡の多角形なので、頂点と辺の1mごとの点
   (半径0)で測る。点の (s,off) は検証側で求める:重心を線形へ射影し、その s の接線・法線で近似する */
const POLY = (o) => !!(o.poly && o.poly.length >= 3);
function pts(o) {
  if (!POLY(o)) return [{ s: o.s, off: o.off, x: o.x, z: o.z, r: o.r }];
  if (o.__pts) return o.__pts;
  const P = o.poly; let A = 0, cx = 0, cz = 0;
  for (let i = 0; i < P.length; i++) { const a = P[i], c = P[(i + 1) % P.length], w = a[0] * c[1] - c[0] * a[1]; A += w; cx += (a[0] + c[0]) * w; cz += (a[1] + c[1]) * w; }
  cx /= 3 * A; cz /= 3 * A;
  const pr = X.prjXY(cx, cz), f0 = X.frame(pr.s, 0), f1 = X.frame(pr.s + 1, 0), fn = X.frame(pr.s, 1);
  const out = [];
  for (let i = 0; i < P.length; i++) {
    const a = P[i], c = P[(i + 1) % P.length], m = Math.max(1, Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1])));
    for (let k = 0; k < m; k++) {
      const x = a[0] + (c[0] - a[0]) * k / m, z = a[1] + (c[1] - a[1]) * k / m;
      out.push({ s: pr.s + (x - cx) * (f1.x - f0.x) + (z - cz) * (f1.z - f0.z), off: pr.off + (x - cx) * (fn.x - f0.x) + (z - cz) * (fn.z - f0.z), x: x, z: z, r: 0 });
    }
  }
  return (o.__pts = out);
}
// 多角形までの距離(内側なら負)。検証側の実装
function polyDist(P, x, z) {
  let inside = false, d = 1e18;
  for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[j], b = P[i];
    if (((a[1] > z) !== (b[1] > z)) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) inside = !inside;
    const dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz, u = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)) : 0;
    d = Math.min(d, Math.hypot(x - a[0] - dx * u, z - a[1] - dz * u));
  }
  return inside ? -d : d;
}
/* 実データの道路(plateau_land.js)。検証側で独自に読む(モデルの登録簿ではなくファイルそのもの) */
const LAND = (() => {
  const fs = require('fs'), pth = require('path');
  const f = pth.join(pth.dirname(path), 'plateau_land.js');
  const html = fs.readFileSync(path, 'utf8');
  if (!html.includes('<script src="plateau_land.js">') || !fs.existsSync(f)) return null;
  const g = {}; new Function('globalThis', fs.readFileSync(f, 'utf8'))(g);
  const b = Buffer.from(g.PLATEAU_LAND.road64, 'base64');
  if (b.toString('latin1', 0, 4) !== 'PLR1') throw new Error('道路データの形式');
  const N = b.readUInt32LE(4), out = []; let o = 8;
  for (let n = 0; n < N; n++) {
    const k = b.readUInt8(o), sec = b.readUInt8(o + 1), nv = b.readUInt16LE(o + 2); o += 4;
    let x = b.readInt32LE(o), z = b.readInt32LE(o + 4); o += 8;
    const P = [[x / 10, z / 10]];
    for (let i = 1; i < nv; i++) { x += b.readInt16LE(o); z += b.readInt16LE(o + 2); o += 4; P.push([x / 10, z / 10]); }
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const v of P) { x0 = Math.min(x0, v[0]); x1 = Math.max(x1, v[0]); z0 = Math.min(z0, v[1]); z1 = Math.max(z1, v[1]); }
    out.push({ k: k, sec: sec, P: P, bb: [x0, x1, z0, z1] });
  }
  const C = 30, grid = new Map();
  for (const R of out) {
    if (R.k === 2 && R.sec === 2) continue;          // 高架の自動車道は地表の道路ではない
    for (let a = Math.floor(R.bb[0] / C); a <= Math.floor(R.bb[1] / C); a++)
      for (let c = Math.floor(R.bb[2] / C); c <= Math.floor(R.bb[3] / C); c++) {
        const kk = a + ',' + c; let l = grid.get(kk); if (!l) { l = []; grid.set(kk, l); } l.push(R);
      }
  }
  // 点の、最も深く入っている道路の面までの距離(内側なら負)
  const depth = (x, z) => {
    let d = 1e9;
    for (const R of grid.get(Math.floor(x / C) + ',' + Math.floor(z / C)) || [])
      if (x > R.bb[0] - 5 && x < R.bb[1] + 5 && z > R.bb[2] - 5 && z < R.bb[3] + 5) d = Math.min(d, polyDist(R.P, x, z));
    return d;
  };
  return { roads: out, depth: depth, elev: out.filter((R) => R.k === 2 && R.sec === 2) };
})();
const ALL = B.map((o) => ({ o: o, kind: '建物' })).concat(T.map((o) => ({ o: o, kind: '樹木' })));

/* ---- 1. 数 ---------------------------------------------------------------- */
ok('建物の数', B.length >= REF.MIN_BUILDINGS, '≥' + REF.MIN_BUILDINGS + '棟', B.length + '棟');
ok('樹木の数', T.length >= REF.MIN_TREES, '≥' + REF.MIN_TREES + '本', T.length + '本');

/* ---- 2. 高架下・側道に入らない ------------------------------------------- */
{
  let bad = null;
  for (const e of ALL) for (const q of pts(e.o)) {
    const lim = X.deckHalf(q.s) + REF.DECK_CLEAR;
    if (Math.abs(q.off) - q.r < lim && !bad)
      bad = [e.kind, 's=' + q.s.toFixed(0), 'off=' + q.off.toFixed(1), '限界' + lim.toFixed(1)];
  }
  ok('高架下・側道に入らない', bad === null, '桁半幅+' + REF.DECK_CLEAR + 'm以遠',
    bad ? bad.join(' ') : ALL.length + '件すべて');
}

/* ---- 3. 交差鉄道(井の頭線・世田谷線)の上に無い --------------------------
   線路は営業距離に対して斜めに走る(井の頭線は880mの延長でsが約160m動く)。
   sだけの帯では覆えないので、世界座標の直線からの距離で判定する。 */
{
  const lines = [['井の頭線', X.INO, X.XR.U0, X.XR.U1], ['世田谷線', X.SETA, X.XR.SETA_U0, X.XR.SETA_U1]];
  let bad = null, worst = 1e9;
  for (const [nm, A, u0, u1] of lines) {
    for (const e of ALL) for (const q of pts(e.o)) {
      const dx = q.x - A.x, dz = q.z - A.z;
      const du = dx * A.ax + dz * A.az, dn = Math.abs(dx * A.nx + dz * A.nz);
      if (du < u0 - q.r || du > u1 + q.r) continue;      // 線路の延長の外
      const clear = dn - q.r;
      if (clear - REF.XRAIL_HALF[nm] < worst) worst = clear - REF.XRAIL_HALF[nm];
      if (clear < REF.XRAIL_HALF[nm] && !bad)
        bad = [nm, e.kind, 'u=' + du.toFixed(0), '離隔' + clear.toFixed(1) + 'm'];
    }
  }
  ok('交差鉄道の上に無い', bad === null,
    '離隔≥' + REF.XRAIL_HALF['井の頭線'] + 'm/' + REF.XRAIL_HALF['世田谷線'] + 'm',
    bad ? bad.join(' ') : '余裕' + worst.toFixed(1) + 'm');
}

/* ---- 4. 道路・河川の上に無い --------------------------------------------- */
{
  let bad = null;
  for (const c of REF.CROSS) {
    // 実データの道路があるときは、道路は「実際の道路の上に無い」で見る。ここは模式のまま描く物(計画の放射23・玉川上水)だけ
    if (LAND && !['放射23', '玉川上水'].includes(c[0])) continue;
    const cs = X[c[1]], hw = c[2], oh = c[3] === undefined ? 1e9 : c[3];
    for (const e of ALL) for (const q of pts(e.o)) {
      if (Math.abs(q.off) > oh) continue;
      if (Math.abs(q.s - cs) - q.r < hw && !bad)
        bad = [c[0], e.kind, 's=' + q.s.toFixed(0), 'off=' + q.off.toFixed(0)];
    }
  }
  ok('交差道路の上に無い', bad === null, LAND ? '放射23・玉川上水(他は実データ)' : REF.CROSS.length + '路線すべて',
    bad ? bad.join(' ') : ALL.length + '件すべて');

  let bp = null;
  for (const c of (LAND ? [] : REF.PARA)) {         // 実データがあるときは下の「実際の道路の上に無い」で見る
    for (const e of ALL) for (const q of pts(e.o)) {
      if (q.s < c[3] || q.s > c[4]) continue;
      if (Math.abs(q.off - c[1]) - q.r < c[2] && !bp)
        bp = [c[0], e.kind, 's=' + q.s.toFixed(0), 'off=' + q.off.toFixed(1)];
    }
  }
  ok('並行道路の上に無い', bp === null, LAND ? '実データの道路で見る' : REF.PARA.length + '路線すべて',
    bp ? bp.join(' ') : ALL.length + '件すべて');

  let br = null;
  for (const e of ALL) for (const p of pts(e.o)) {
    if (Math.abs(p.off) < REF.RIVER_OFF &&
      Math.abs(p.s - X.BRIDGE.s) - p.r < REF.RIVER_HALF && !br)
      br = ['仙川', e.kind, 's=' + p.s.toFixed(0)];
    for (const q of REF.POND) {
      if (Math.hypot(p.s - (X.WADA_S + q[0]), p.off - (X.WADA_OFF + q[1])) - p.r < q[2] && !br)
        br = ['和田堀の池', e.kind, 's=' + p.s.toFixed(0)];
    }
  }
  ok('河川・池の上に無い', br === null, '仙川+池2面', br ? br.join(' ') : ALL.length + '件すべて');
}

/* ---- 4b. 実データの道路(plateau_land.js があるとき) ------------------------
   ・建物・樹木が道路の上に無い(建物は道路の縁に接して建つので 0.3m の食い込みまで)
   ・京王線を横切る道路(中心と桁の両端が道路の上に続く所)に高架の柱が立っていない
     (模式の道路の位置 RAW.roads・XINGS と実際がずれていても、実際の道路の上には立てない)
   ・自動車道の高架(首都高・中央道)の床版の下面が、京王線の上ではレール面+7.0m 以上。橋脚は高架下・側道に無い */
if (LAND) {
  let bad = null, worst = 1e9;
  for (const e of ALL) for (const q of pts(e.o)) {
    const d = LAND.depth(q.x, q.z), lim = POLY(e.o) ? -REF.ROAD_BLDG_IN : q.r;
    if (d - lim < worst) worst = d - lim;
    if (d < lim && !bad) bad = [e.kind, '(' + q.x.toFixed(0) + ',' + q.z.toFixed(0) + ')', '道路の面まで' + d.toFixed(2) + 'm'];
  }
  ok('実際の道路の上に無い', bad === null, '建物は食い込み≤' + REF.ROAD_BLDG_IN + 'm・樹木は半径ぶん離れる',
    bad ? bad.join(' ') : ALL.length + '件すべて(余裕' + worst.toFixed(2) + 'm)');

  // 京王線を横切る道路を検証側で見つける
  const xing = []; let a = null;
  for (let s = Math.floor(X.DOM.x0); s <= X.DECK_END + 1; s++) {
    const dh = X.deckHalf(s);
    const on = [0, -dh, dh].every((o) => { const f = X.frame(s, o); return LAND.depth(f.x, f.z) < 0; });
    if (on) { if (a === null) a = s; } else if (a !== null) { if (s - a >= REF.XING_MIN) xing.push([a, s - 1]); a = null; }
  }
  let bc = null, nc = 0;
  for (const c of X.VIA_COLS) {
    if (!xing.some((r) => c.s > r[0] - 10 && c.s < r[1] + 10)) continue;
    for (const o of c.offs) {
      const f = X.frame(c.s, o), d = LAND.depth(f.x, f.z);
      nc++;
      if (d < REF.XING_COL_CLEAR && xing.some((r) => c.s > r[0] - REF.XING_COL_CLEAR && c.s < r[1] + REF.XING_COL_CLEAR) && !bc)
        bc = ['s=' + c.s.toFixed(0), 'off=' + o.toFixed(1), '道路の縁まで' + d.toFixed(2) + 'm'];
    }
  }
  ok('横切る道路に柱が無い', bc === null && xing.length >= 20, '横切る道路≥20か所・柱は縁から' + REF.XING_COL_CLEAR + 'm',
    bc ? bc.join(' ') : xing.length + 'か所・近くの柱' + nc + '本');

  // 自動車道の高架
  let be = null, ne = 0;
  for (let s = Math.floor(X.DOM.x0); s <= X.DECK_END; s += 2) {
    const dh = X.deckHalf(s);
    for (const o of [0, -dh, dh]) {
      const f = X.frame(s, o);
      if (!LAND.elev.some((R) => polyDist(R.P, f.x, f.z) < 0)) continue;
      ne++;
      // 描かれた床版(登録簿)のうち、この点の上にある物の下面
      let bot = 1e9;
      for (const D of X.EXPY.deck) if (polyDist(D.P, f.x, f.z) < 0) bot = Math.min(bot, D.bot);
      if (!(bot - X.railY(s) >= REF.EXPY_CLEAR) && !be)
        be = ['s=' + s, '下面' + (bot > 1e8 ? 'なし' : bot.toFixed(1)), 'レール面' + X.railY(s).toFixed(1)];
    }
  }
  for (const pr of X.EXPY.piers) {
    const q = X.prjXY(pr[0], pr[1]);
    if (q.s > X.DOM.x0 - 50 && q.s < X.DECK_END + 50 && Math.abs(q.off) < X.deckHalf(q.s) + REF.DECK_CLEAR + 1.0 && !be)
      be = ['橋脚が高架下・側道に', 's=' + q.s.toFixed(0), 'off=' + q.off.toFixed(1)];
  }
  ok('自動車道の高架が京王線と当たらない', be === null && X.EXPY.deck.length === LAND.elev.filter((R) => R.P.some((v) => { const q = X.prjXY(v[0], v[1]); return q.s > X.DOM.x0 - 150 && q.s < X.DOM.x1 + 150 && Math.abs(q.off) < X.DOM.z + 60; })).length,
    '下面≥レール面+' + REF.EXPY_CLEAR + 'm・橋脚は側道の外',
    be ? be.join(' ') : '床版' + X.EXPY.deck.length + '面・重なる点' + ne + '・橋脚' + X.EXPY.piers.length + '基');
}

/* ---- 5. 建物・樹木どうしが重ならない ------------------------------------- */
{
  const CELL = 26, grid = new Map();
  const key = (a, b) => a + ',' + b;
  let bad = null, worst = 1e9, pairs = 0;
  /* PLATEAU の建物(実データ)どうしは実際に壁を接して建つので見ない。樹木など円の物とは、
     円の中心から足跡の多角形までの距離で見る(足跡の外接矩形が掛かる格子に入れて引く) */
  const pg = new Map();
  for (const e of ALL) if (POLY(e.o)) {
    let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
    for (const v of e.o.poly) { x0 = Math.min(x0, v[0]); x1 = Math.max(x1, v[0]); z0 = Math.min(z0, v[1]); z1 = Math.max(z1, v[1]); }
    for (let a = Math.floor((x0 - 8) / CELL); a <= Math.floor((x1 + 8) / CELL); a++)
      for (let b = Math.floor((z0 - 8) / CELL); b <= Math.floor((z1 + 8) / CELL); b++) {
        let l = pg.get(key(a, b)); if (!l) { l = []; pg.set(key(a, b), l); } l.push(e);
      }
  }
  for (const e of ALL) {
    if (POLY(e.o)) continue;
    for (const q of (pg.get(key(Math.floor(e.o.x / CELL), Math.floor(e.o.z / CELL))) || [])) {
      const gap = polyDist(q.o.poly, e.o.x, e.o.z) - e.o.r;
      pairs++;
      if (gap < worst) worst = gap;
      if (gap < REF.GAP && !bad) bad = [e.kind + '⇄' + q.kind + '(PLATEAU)', 'すき間' + gap.toFixed(2) + 'm', '(' + e.o.x.toFixed(0) + ',' + e.o.z.toFixed(0) + ')'];
    }
  }
  for (const e of ALL) {
    if (POLY(e.o)) continue;
    const cx = Math.floor(e.o.x / CELL), cz = Math.floor(e.o.z / CELL);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) {
      const l = grid.get(key(cx + a, cz + b)); if (!l) continue;
      for (const q of l) {
        const gap = Math.hypot(e.o.x - q.o.x, e.o.z - q.o.z) - e.o.r - q.o.r;
        pairs++;
        if (gap < worst) worst = gap;
        if (gap < REF.GAP && !bad) bad = [e.kind + '⇄' + q.kind, 'すき間' + gap.toFixed(2) + 'm'];
      }
    }
    let l = grid.get(key(cx, cz)); if (!l) { l = []; grid.set(key(cx, cz), l); }
    l.push(e);
  }
  ok('建物・樹木が重ならない', bad === null, 'すき間≥' + REF.GAP + 'm',
    bad ? bad.join(' ') : '最小すき間' + worst.toFixed(2) + 'm(' + pairs + '組)');
}

/* ---- 6. 交差鉄道の列車 --------------------------------------------------- */
{
  const railTop = X.XR.RAILY + X.XR.RAILH / 2;    // レール頭頂面(検証側で計算)
  X.stepXRail(3.0);                                // 実際に走らせてから測る
  const inoG = X.inoTrains.map((t) => t.g);
  // 車両の数は車輪の軸の数から数える(1両=4軸)。編成は1つのジオメトリなので、車輪の頂点の x を軸ごとにまとめる
  const cars = (g) => { const xs = new Set(); g.traverse((o) => {
    if (o.material !== X.XM_WHL || !o.geometry) return;
    const P = o.geometry.attributes.position.array; for (let i = 0; i < P.length; i += 3) xs.add(Math.round(P[i] * 1000) / 1000); });
    // 車輪は半径0.43の円柱なので、軸ごとに x が ±0.43 の幅に散る(角の間隔≤0.22m)。軸と軸は2m前後離れるので、
    // 0.6m より大きい切れ目で塊に分けて数える
    const v = [...xs].sort((a, b) => a - b); let n = 0, last = -1e9;
    for (const x of v) { if (x - last > 0.6) n++; last = x; }
    return n / 4; };
  const nc = inoG.map(cars);
  ok('井の頭線の車両数', nc.every((n) => n === REF.INO_CARS), REF.INO_CARS + '両×' + inoG.length + '本', nc.join('・') + '両');
  // 車体の原点はレール面。道床に載っていなければ車輪が沈む/浮く
  let by = null;
  for (const c of inoG.concat(X.setaCars))
    if (Math.abs(c.position.y - railTop) > 1e-6 && !by) by = [c.position.y.toFixed(3)];
  ok('レール面に載っている', by === null, railTop.toFixed(3) + 'm', by ? by[0] + 'm' : railTop.toFixed(3) + 'm');
  // 折り返しても編成の最後尾が線路からはみ出さない
  /* 交差鉄道は京王線とは別形式。8000系のジオメトリを使い回していないこと
     (使い回すと井の頭線・世田谷線にまで京王8000系の前面が付く)。 */
  {
    const keio = new Set();
    // 8000系(v4)の幾何はすべて K8GEO に集約している(入れ子も含めて走査する)
    const walk = (o) => { if (!o || typeof o !== 'object') return;
      if (o.attributes) { keio.add(o); return; }
      for (const k in o) walk(o[k]); };
    walk(X.K8GEO);
    let bad = null;
    for (const c of inoG.concat(X.setaCars)) {
      if (!c.userData || !c.userData.xcar) { bad = bad || ['専用モデルでない']; continue; }
      c.traverse((o) => { if (o.geometry && keio.has(o.geometry) && !bad) bad = ['8000系のジオメトリを共有']; });
    }
    ok('交差鉄道は専用モデル', bad === null, '8000系と別', bad ? bad[0] : '井の頭線/世田谷線とも専用');
    // 軌間は線区ごと(井の頭線1067mm / 世田谷線1372mm)。車輪の左右位置で測る。
    // 車輪は材質ごとに結合した1つのジオメトリなので、その頂点の |z| の平均(左右対称の円柱の中心)で測る
    const wheelZ = (c) => { let sum = 0, n = 0; c.traverse((o) => {
      if (o.material !== X.XM_WHL || !o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
      const P = o.geometry.attributes.position.array; for (let i = 2; i < P.length; i += 3) { sum += Math.abs(P[i]); n++; } });
      return n ? sum / n : 0; };
    const wantI = (X.GAUGE_INO + X.RAIL_W) / 2, wantS = (X.GAUGE_SETA + X.RAIL_W) / 2;
    const gotI = wheelZ(inoG[0]), gotS = wheelZ(X.setaCars[0]);
    ok('交差鉄道の軌間', Math.abs(gotI - wantI) < 1e-6 && Math.abs(gotS - wantS) < 1e-6,
      wantI.toFixed(3) + ' / ' + wantS.toFixed(3) + 'm',
      gotI.toFixed(3) + ' / ' + gotS.toFixed(3) + 'm');
  }
  /* 井の頭線を走らせて、描かれている頂点を測る:
     ・左側通行(進行方向の左=上×進行方向 の側を走る)。走る線は敷設した軌道の中心(XR.TRK)
     ・描かれている頂点がすべて線路の範囲(XR.U0〜U1)の上にある
     ・明大前に停車し、停車中の編成がその側のホームの範囲に収まる */
  {
    const A = X.INO;
    const drawnU = (g) => { let lo = 1e9, hi = -1e9, n = 0; const cs = Math.cos(g.rotation.y), sn = Math.sin(g.rotation.y);
      g.traverse((o) => { if (!o.geometry || !o.geometry.index || !g.visible) return;
        const P = o.geometry.attributes.position.array, I = o.geometry.index.array, r = o.geometry.drawRange;
        const e = Math.min(I.length, r.start + r.count);
        for (let i = r.start; i < e; i++) { const k = 3 * I[i], x = P[k], z = P[k + 2];
          const wx = g.position.x + x * cs + z * sn, wz = g.position.z - x * sn + z * cs;
          const u = (wx - A.x) * A.ax + (wz - A.z) * A.az; if (u < lo) lo = u; if (u > hi) hi = u; n++; } });
      return n ? [lo, hi] : null; };
    const plat = REF.INO_PLAT.map((q) => { const u0 = ((-(q.lat - X.LAT0) * X.MLAT) - A.z) / A.az;
      return { n: q.n, side: q.side, u0: u0, u1: u0 + REF.INO_PLAT_LEN }; });
    const trk = X.XR.TRK.map(Math.abs);
    let badL = null, badT = null, badOut = null, badStop = null, nObs = 0;
    const dirs = new Set(), stopT = inoG.map(() => 0), maxStop = inoG.map(() => 0);
    let prev = inoG.map((g) => ({ x: g.position.x, z: g.position.z }));
    for (let k = 0; k < REF.SIM[1]; k++) {
      X.stepXRail(REF.SIM[0]);
      inoG.forEach((g, i) => {
        const dx = g.position.x - prev[i].x, dz = g.position.z - prev[i].z, mv = Math.hypot(dx, dz);
        prev[i] = { x: g.position.x, z: g.position.z };
        const du = drawnU(g); if (!du) { stopT[i] = 0; return; }
        if (du[0] < X.XR.U0 - 1e-6 || du[1] > X.XR.U1 + 1e-6) if (!badOut) badOut = [i, du[0].toFixed(1) + '〜' + du[1].toFixed(1)];
        const ox = g.position.x - A.x, oz = g.position.z - A.z, off = ox * A.nx + oz * A.nz;
        if (!trk.some((t) => Math.abs(Math.abs(off) - t) < 1e-6) && !badT) badT = [i, off.toFixed(3)];
        if (mv > 1e-4 && mv < 50) {                         // 走っている(端の先での折り返しの跳びは除く)
          nObs++; dirs.add(Math.sign(dx * A.ax + dz * A.az));
          const left = ox * (dz / mv) - oz * (dx / mv);      // 上×進行方向=(dz,0,-dx) への射影
          if (left <= 0 && !badL) badL = [i, '進行方向の右 ' + left.toFixed(2) + 'm'];
          stopT[i] = 0;
        } else if (mv <= 1e-4) {                             // 停車中:その側のホームに収まる
          stopT[i] += REF.SIM[0]; maxStop[i] = Math.max(maxStop[i], stopT[i]);
          const pl = plat.find((q) => Math.sign(off) === q.side);
          if ((!pl || du[0] < pl.u0 - 1e-6 || du[1] > pl.u1 + 1e-6) && !badStop)
            badStop = [i, pl ? pl.n + ' ' + pl.u0.toFixed(1) + '〜' + pl.u1.toFixed(1) + ' に ' + du[0].toFixed(1) + '〜' + du[1].toFixed(1) : 'ホームの無い側'];
        }
      });
    }
    ok('井の頭線は左側通行', badL === null && dirs.size === 2, '上下とも進行方向の左', badL ? badL.join(' ') :
      (dirs.size === 2 ? '上下とも左(' + nObs + '標本)' : '片方向のみ'));
    ok('井の頭線の走る線が軌道中心', badT === null, '|off|∈[' + trk.join(',') + ']', badT ? badT.join(' ') : '全て');
    ok('井の頭線の編成が線路内', badOut === null, X.XR.U0 + '〜' + X.XR.U1 + 'm', badOut ? badOut.join(' ') : '全て');
    ok('井の頭線が明大前に停車', badStop === null && maxStop.every((t) => t >= REF.INO_DWELL_MIN),
      '上下とも' + REF.INO_DWELL_MIN + '秒以上・ホームに収まる', badStop ? badStop.join(' ') : maxStop.map((t) => t.toFixed(0) + '秒').join('・'));
  }
  const sHalf = X.XCAR.seta.L / 2;
  const sLo = X.SETA_LO - (X.SETA_CARS - 1) * X.SETA_PITCH - sHalf, sHi = X.SETA_HI + sHalf;
  ok('世田谷線の編成が線路内',
    sLo >= X.XR.SETA_U0 - 1e-6 && sHi <= X.XR.SETA_U1 + 1e-6,
    X.XR.SETA_U0 + '〜' + X.XR.SETA_U1 + 'm',
    sLo.toFixed(1) + '〜' + sHi.toFixed(1) + 'm');
  ok('世田谷線の折り返し範囲が正の長さ', X.SETA_HI > X.SETA_LO, '走行する',
    'SETA' + X.SETA_LO.toFixed(0) + '〜' + X.SETA_HI.toFixed(0));
}

/* ---- 出力 ---------------------------------------------------------------- */
console.log('=== 街並みと交差鉄道の検証 ===');
console.log('(置かれた1件ずつの世界座標を測り、道路・河川・鉄道・高架下と突き合わせ)\n');
const w = [0, 0, 0].map((_, i) => Math.max.apply(null, rows.map((r) => [...r[i]].length).concat([8])));
const pad = (s, n) => s + ' '.repeat(Math.max(1, n - [...s].length + 2));
console.log(pad('項目', 30) + pad('期待', 24) + pad('実測', 30) + '判定');
for (const r of rows) console.log(pad(r[0], 30) + pad(r[1], 24) + pad(r[2], 30) + r[3]);
console.log('\n建物 ' + B.length + '棟 / 樹木 ' + T.length + '本');
console.log(ng ? 'RESULT: FAIL(' + ng + '項目NG)' : 'RESULT: PASS');
process.exit(ng ? 1 : 0);
