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
  'bldFacadeAt:(typeof bldFacadeAt!=="undefined"?bldFacadeAt:null),BLD_WIN_SRC:(typeof bldWinPatch!=="undefined"?bldWinPatch.toString():""),BLD_WIN:BLD_WIN,FS_G0:FS_G0,ATT_NEAR:ATT_NEAR,attBoxes:(typeof attBoxes!=="undefined"?attBoxes:null),cityLod:cityLod,LOD_STRUCT:LOD_STRUCT,CITY:CITY,deckHalf:deckHalf,cutHalf:cutHalf,DOM:DOM,INO:INO,SETA:SETA,XR:XR,K8:K8,' +
  'KAN7_X:KAN7_X,NAKANO_X:NAKANO_X,HOSHA23_X:HOSHA23_X,KYU_INOKA_X:KYU_INOKA_X,H154_X:H154_X,H128_X:H128_X,' +
  'H133_X:H133_X,H215_X:H215_X,KANPACHI_X:KANPACHI_X,H216_X:H216_X,H217_X:H217_X,' +
  'JOSUI_X:JOSUI_X,BRIDGE:BRIDGE,XINGS:XINGS,WADA_S:WADA_S,WADA_OFF:WADA_OFF,' +
  'PLAZA_S:PLAZA_S,PLAZA_OFF:PLAZA_OFF,SUBK:SUBK,SUBC:SUBC,' +
  'stepXRail:stepXRail,inoTrains:inoTrains,setaTrain:setaTrain,LAT0:LAT0,MLAT:MLAT,RAW:RAW,' +
  'SETA_CARS:SETA_CARS,' +
  'K8GEO:K8GEO,XM_WHL:XM_WHL,K10:K10,K30:K30,' +
  'GAUGE_INO:GAUGE_INO,GAUGE_SETA:GAUGE_SETA,RAIL_W:RAIL_W,prjXY:prjXY,frame:frame,' +
  'VIA_COLS:VIA_COLS,EXPY:EXPY,railY:railY,DECK_END:DECK_END,ROADS_PL:ROADS_PL,CITY_LODS:CITY_LODS,' +
  'RD_CARS:(typeof RD_CARS!=="undefined"?RD_CARS:[]),RD_LANES:(typeof RD_LANES!=="undefined"?RD_LANES:[]),' +
  'stepRoadCars:(typeof stepRoadCars!=="undefined"?stepRoadCars:()=>{}),carsDraw:carsDraw,camera:camera,' +
  'PEDS:(typeof PEDS!=="undefined"?PEDS:[]),SIDEWALKS:(typeof SIDEWALKS!=="undefined"?SIDEWALKS:[]),pedPos:(typeof pedPos!=="undefined"?pedPos:null),' +
  'stepPeds:(typeof stepPeds!=="undefined"?stepPeds:()=>{}),KANPACHI_X:KANPACHI_X,' +
  'STRUCT:STRUCT,groundMesh:groundMesh,scene:scene,ROAD_LAMPS:(typeof ROAD_LAMPS!=="undefined"?ROAD_LAMPS:[]),' +
  'TER:(typeof TER!=="undefined"?TER:null),terH:(typeof terH!=="undefined"?terH:()=>0),DP:DP,S_OFS:S_OFS,MAT:MAT,MAT_FENCE:MAT_FENCE,NIGHT:NIGHT,' +
  'ORTHO_MGR:(typeof ORTHO_MGR!=="undefined"?ORTHO_MGR:null),ORTHO_U:(typeof ORTHO_U!=="undefined"?ORTHO_U:null),LON0:LON0,MLON:MLON,' +
  'lodStruct:lodStruct,renderer:renderer,LU:LU,CINE:CINE,MAT_JOSUI:(typeof MAT_JOSUI!=="undefined"?MAT_JOSUI:null),IS_MOBILE:IS_MOBILE,' +
  'KPZ:(typeof KPZ!=="undefined"?KPZ:null),plazaStep:(typeof plazaStep!=="undefined"?plazaStep:()=>{}),KARA_LAMPS:(typeof KARA_LAMPS!=="undefined"?KARA_LAMPS:null),' +
  'DENCHU:(typeof DENCHU!=="undefined"?DENCHU:null),STA:STA,STRUCT:STRUCT,MPZ:(typeof MPZ!=="undefined"?MPZ:null),MEIDA_LAMPS:(typeof MEIDA_LAMPS!=="undefined"?MEIDA_LAMPS:null),' +
  'ROAD_MARKS:(typeof ROAD_MARKS!=="undefined"?ROAD_MARKS:null),SIGNAL:(typeof SIGNAL!=="undefined"?SIGNAL:null),signalLit:(typeof signalLit!=="undefined"?signalLit:null)');

/* ---- 期待値(検証側が独立して持つ) ----------------------------------------
   道路の幅は4章の描画寸法(box の第1引数)。ここでは"路面の半幅"だけを持ち、
   モデル側が持つ余裕(路肩)は足さない ⇒ 路面に載っていれば必ずNGになる。 */
const REF = {
  MIN_BUILDINGS: 9000,      // 倍増後の下限(2026-10 利用者指示。前回は約5,000棟)
  MIN_TREES: 2000,          // 倍増後の下限(前回1,100本)
  DECK_CLEAR: 4.6,          // 高架下+側道の外縁(桁半幅からの距離[m])
  // 高架の南は壁の 1m 付近まで建物を置いてよい(2026-11 利用者指示)。駅の所(ホーム・駅舎の範囲の外へ SOUTH_STA)は従来の DECK_CLEAR。
  // ホームの範囲は 6章の表から写した値(笹塚は中心の 155m 東〜55m 西、ほかは ±105m。下高井戸の駅舎は西端部 +112m まで)
  SOUTH_CLEAR: 0.6, SOUTH_STA: 18, SOUTH_WALL: 0.5, SOUTH_NEAR: [1.0, 4.6], SOUTH_MIN_N: 30,   // 以前(4.6m の外)は 0棟。2026-11 の実数は約40棟
  PLAT_RANGE0: [-155, 55], PLAT_HALF: 105, BLDG_END: { 下高井戸: 112 },
  // 交差鉄道の建築限界の半幅[m]。井の頭線=複線+掘割擁壁(±9.4)、世田谷線=単線+ホーム
  XRAIL_HALF: { 井の頭線: 13.0, 世田谷線: 3.7 },   // 井の頭線は 2026-10-27 から下の INO_CLEAR(線路から測る)。13.0 は写真の検査で近くを除く幅だけに使う
  INO_CLEAR: 3.2,           // 井の頭線:建物は実際の線路の中心から 3.2m(擁壁の外面)より外。ホームの範囲は INO_PLAT_CLEAR
  INO_PLAT_CLEAR: 1.55 + 8.4 + 0.5 + 0.3,   // ホームの縁 1.55+幅 8.4+背面の擁壁 0.5(+厚さの半分)
  // 占有域に掛かっても描く建物(2026-11 利用者指示「フレンテ明大前…被っても表示させて」)。PLATEAU の足跡の面積の重心(reference/plateau/README.md)。
  // ホームの範囲でも INO_CLEAR(線路から 3.2m)の外ならよい。街に有ることも見る
  KEEP_SHOW: [{ n: 'フレンテ明大前', lat: 35.66893362, lon: 139.65020239, h: 29.6 }],
  INO_KEEP_MAX: 4.0,        // 井の頭線の脇の建物を消しすぎない:ホームの外で、線路の中心から この距離の外の建物は残る   // 世田谷線は線路の脇まで建物が建つ(架線柱の外まで。2026-10-27 利用者指示)
  SETA_TERM: { u: -48, hw: 6.6 },   // 世田谷線の終端(u=0)から 48m はホームと上屋があるので 6.6m
  SETA_KEEP_MAX: 4.5,       // 世田谷線の脇の建物を消しすぎない:終端の外では、線路の中心から この距離の内に掛かって外した建物が無い
  GAP: 0.0,                 // 物同士は外接円が重ならなければよい(接触=NG)
  // [s位置, 路面の半幅[m], offの半長([m]。省略=全幅)]
  CROSS: [['環七', 'KAN7_X', 15], ['中野通り', 'NAKANO_X', 10], ['放射23', 'HOSHA23_X', 9], ['旧井の頭', 'KYU_INOKA_X', 7],
  ['補助154', 'H154_X', 8, undefined, '計画'], ['補助128', 'H128_X', 7.5, undefined, '計画'], ['補助133', 'H133_X', 7.5, undefined, '計画'],
  ['補助215', 'H215_X', 7.5, undefined, '計画'], ['環八', 'KANPACHI_X', 17], ['補助216', 'H216_X', 8, undefined, '計画'],
  ['補助217', 'H217_X', 8, undefined, '計画'], ['玉川上水', 'JOSUI_X', 7.5, 230]],
  // 実データの道路(plateau_land.js)があるときの基準。建物は道路の縁に接して建つので、食い込み 0.3m までは許す
  ROAD_BLDG_IN: 0.3,
  SIDEWALK_IN: 1.5,         // 歩道の並木(桜)は道路区域の縁からこの深さ[m]まで入ってよい(幹の位置)
  // 用途の区分(plateau_import.py の USAGE)。住宅(1〜3)と業務(4)・工場倉庫(7,8)は別の色の組であること
  USE_GROUPS: [[1, 2, 3], [4], [7, 8]],
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
  // 交差鉄道の線路の位置(RAW.rail の tr=国土地理院のベクトルタイルの軌道の中心線)。台車の中心・レールはその上(検証側で線までの距離を測る)
  XR_ON_TRACK: 0.02,        // 台車の中心と線路の中心線の差[m]
  XR_RAIL_TOL: 0.08,        // レールの頂点と(軌間+頭部の幅)/2 の差[m](頭部・腹・底部の幅の内)
  SETA_XO_ZONE: [-100, -30],// 世田谷線の渡り線を探してよい u の範囲(終端から)。台車はこの外では線路の上、これより南では左側通行の線
  SETA_BOGIES: 3,          // 世田谷線 300系は2車体3台車の連接車(公表)
  SETA_END: 12,             // 世田谷線の終端に停まるとき、北の端が終端(u=0)から何m 以内か
  SIM: [0.25, 1600],        // 走らせる刻み[秒]・回数(400秒=上下とも1往復以上)
};

const rows = [];
let ng = 0;
function ok(name, cond, expect, got) {
  if (!cond) ng++;
  rows.push([name, String(expect), String(got), cond ? 'OK' : 'NG']);
}

// 交差鉄道の線形(検証側の実装。tools/xcurve.js):RAW.rail の tr から検証側の換算で作った曲線
const xCurve = (rl, origin) => require('./xcurve')(X, rl, origin);
const XC = { INO: xCurve(X.RAW.rail.ino, 'cross'), SETA: xCurve(X.RAW.rail.seta, 'end') };
// 井の頭線の線路 k(0=西・下り/1=東・上り)の側のホームの u の範囲(利用者が測った緯度から 110m。端から m の余裕)
const inoPlat = (k, u, m) => { const q = REF.INO_PLAT[k ? 0 : 1], u0 = XC.INO.uAtZ(-(q.lat - X.LAT0) * X.MLAT); return u > u0 - m && u < u0 + REF.INO_PLAT_LEN + m; };

const B = X.CITY.buildings, T = X.CITY.trees;
// 駅の所(ホームの実範囲と駅舎の範囲の外へ REF.SOUTH_STA):高架の南でも建物は従来の DECK_CLEAR の外
const STA_ZONES = X.STA.map((st, i) => { const r = i === 0 ? REF.PLAT_RANGE0 : [-REF.PLAT_HALF, REF.PLAT_HALF];
  return [st.x + r[0] - REF.SOUTH_STA, st.x + Math.max(r[1], REF.BLDG_END[st.n] || 0) + REF.SOUTH_STA]; });
const inStaZone = (s) => STA_ZONES.some((z) => s > z[0] && s < z[1]);
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
/* 千歳烏山駅前広場南側地区(再開発の計画。2026-11):検証側の基準 tools/kara_ref.js(資料の図を読んだ値。HTML の KARA は読まない)。
   区域 D(凸の5角形)・補助216号線の帯(中心線 C の区間ごとの四角形 ROW。継ぎ目は角の二等分線)・線路沿いの帯 S(区域の北の辺と
   モデルの桁の南の縁の間。桁は構造物なのでモデルの deckHalf・frame から検証側で組む。s の 5m ごとの四角形を区域の東・西の辺の線で切る)・
   穴 H=[D, ROW…, S…]。計画の範囲 A=(D ∪ S)−ROW。
   描くべきかは検証側がファイルから決める(HTML が plateau_land.js・plateau_bldg.js を読み、隣にある) */
const KR = require('./kara_ref');
const KARA_DATA = (() => { const fs = require('fs'), pth = require('path'), html = fs.readFileSync(path, 'utf8');
  return ['plateau_land.js', 'plateau_bldg.js'].every((f) => html.includes('<script src="' + f + '">') && fs.existsSync(pth.join(pth.dirname(path), f))); })();
const KV = (() => {
  const W = (a) => a.map((p) => KR.toXY(X, p)), D = W(KR.district), C = W(KR.h216), h = KR.W216 / 2;
  const nr = (i) => { const a = C[i], b = C[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l]; };
  const of = C.map((_, i) => { const n0 = nr(Math.max(0, i - 1)), n1 = nr(Math.min(C.length - 2, i)), m = [n0[0] + n1[0], n0[1] + n1[1]], l = Math.hypot(m[0], m[1]), c = (m[0] * n1[0] + m[1] * n1[1]) / l;
    return [m[0] / l * h / c, m[1] / l * h / c]; });
  const ROW = []; for (let i = 0; i < C.length - 1; i++) { const a = C[i], b = C[i + 1], oa = of[i], ob = of[i + 1];
    ROW.push([[a[0] + oa[0], a[1] + oa[1]], [b[0] + ob[0], b[1] + ob[1]], [b[0] - ob[0], b[1] - ob[1]], [a[0] - oa[0], a[1] - oa[1]]]); }
  const ccw = (P) => { let A = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; A += a[0] * b[1] - b[0] * a[1]; } return A > 0 ? P : P.slice().reverse(); };
  const S = []; {
    const [D0, D1, D2, , D4] = D, edge = (s) => { const f = X.frame(s, -X.deckHalf(s, -1)); return [f.x, f.z]; };
    const onN = (s) => { const p = X.frame(s, 0), q = X.frame(s, 1), nx = q.x - p.x, nz = q.z - p.z, bx = D1[0] - D0[0], bz = D1[1] - D0[1], t = ((D0[0] - p.x) * bz - (D0[1] - p.z) * bx) / (nx * bz - nz * bx); return [p.x + nx * t, p.z + nz * t]; };
    const clip = (Q, a, b) => { const o = [], f = (q) => (b[0] - a[0]) * (q[1] - a[1]) - (b[1] - a[1]) * (q[0] - a[0]);   // 線 a→b の左を残す
      for (let i = 0; i < Q.length; i++) { const p = Q[i], q = Q[(i + 1) % Q.length], fp = f(p), fq = f(q); if (fp >= 0) o.push(p);
        if ((fp >= 0) !== (fq >= 0)) { const t = fp / (fp - fq); o.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); } } return o; };
    const area = (P) => { let A = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; A += a[0] * b[1] - b[0] * a[1]; } return A / 2; };
    const s0 = X.prjXY(D1[0], D1[1]).s, s1 = X.prjXY(D0[0], D0[1]).s;
    for (let k = Math.floor(s0 / 5) - 2; k <= Math.ceil(s1 / 5) + 1; k++) { let Q = [edge(5 * k), edge(5 * k + 5), onN(5 * k + 5), onN(5 * k)];
      if (area(Q) < 0) Q.reverse(); Q = clip(Q, D1, D2); if (Q.length >= 3) Q = clip(Q, D4, D0); if (Q.length >= 3 && Math.abs(area(Q)) > 1e-3) S.push(Q); } }
  const H = [D].concat(ROW, S).map(ccw);
  const bb = [1e9, -1e9, 1e9, -1e9]; for (const P of H) for (const p of P) { bb[0] = Math.min(bb[0], p[0]); bb[1] = Math.max(bb[1], p[0]); bb[2] = Math.min(bb[2], p[1]); bb[3] = Math.max(bb[3], p[1]); }
  const rowD = (x, z) => Math.min(...ROW.map((Q) => polyDist(Q, x, z)));          // 216 の帯までの距離(中は負)
  const stripD = (x, z) => S.length ? Math.min(...S.map((Q) => polyDist(Q, x, z))) : 1e9;   // 線路沿いの帯
  const planD = (x, z) => Math.min(polyDist(D, x, z), rowD(x, z), stripD(x, z));    // 区域か帯までの距離(中は負)
  const aD = (x, z) => Math.max(Math.min(polyDist(D, x, z), stripD(x, z)), -rowD(x, z));   // 計画の範囲 A=(D∪S)−ROW までの距離(おおよそ。中は負)
  const near = (x, z, r) => x > bb[0] - r && x < bb[1] + r && z > bb[2] - r && z < bb[3] + r;
  // 線分 a→b のうち凸の多角形 Q(反時計回り)の外の部分
  const segOut = (a, b, Q) => { let t0 = 0, t1 = 1;
    for (let k = 0; k < Q.length; k++) { const p = Q[k], q = Q[(k + 1) % Q.length], nx = -(q[1] - p[1]), nz = q[0] - p[0], fa = nx * (a[0] - p[0]) + nz * (a[1] - p[1]), fb = nx * (b[0] - p[0]) + nz * (b[1] - p[1]);
      if (fa < 0 && fb < 0) return [[a, b]]; if (fa < 0) t0 = Math.max(t0, fa / (fa - fb)); else if (fb < 0) t1 = Math.min(t1, fa / (fa - fb)); }
    if (t0 >= t1) return [[a, b]]; const L = (u) => [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], o = [];
    if (t0 > 1e-9) o.push([a, L(t0)]); if (t1 < 1 - 1e-9) o.push([L(t1), b]); return o; };
  return { D: D, C: C, ROW: ROW, S: S, H: H, bb: bb, rowD: rowD, stripD: stripD, planD: planD, aD: aD, near: near, segOut: segOut,
    P: W(KR.plaza), T: W(KR.tower), inPlan: (x, z, r) => near(x, z, r + 1) && planD(x, z) < r };
})();
/* 明大前駅前広場と補助第154号線(都市計画。2026-11)の検証側の形:tools/meida_ref.js の緯度・経度から組む(HTML の MEIDA は読まない)。
   154 の帯 ROW(中心線の区間ごとの四角形。継ぎ目は角の二等分線)・広場 D(四隅。北東と南東の角は北と南の辺に沿って 154 の西の縁の線へ寄せる)・
   穴 H=[D, ROW…]。描くべきかは千歳烏山と同じく検証側がファイルから決める(KARA_DATA) */
const MR = require('./meida_ref');
const MV = (() => {
  const W = (a) => a.map((p) => MR.toXY(X, p)), C = W(MR.h154), h = MR.W154 / 2;
  const nr = (i) => { const a = C[i], b = C[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l]; };
  const of = C.map((_, i) => { const n0 = nr(Math.max(0, i - 1)), n1 = nr(Math.min(C.length - 2, i)), m = [n0[0] + n1[0], n0[1] + n1[1]], l = Math.hypot(m[0], m[1]), c = (m[0] * n1[0] + m[1] * n1[1]) / l;
    return [m[0] / l * h / c, m[1] / l * h / c]; });
  const ccw = (P) => { let A = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; A += a[0] * b[1] - b[0] * a[1]; } return A > 0 ? P : P.slice().reverse(); };
  const ROW = []; for (let i = 0; i < C.length - 1; i++) { const a = C[i], b = C[i + 1], oa = of[i], ob = of[i + 1];
    ROW.push(ccw([[a[0] + oa[0], a[1] + oa[1]], [b[0] + ob[0], b[1] + ob[1]], [b[0] - ob[0], b[1] - ob[1]], [a[0] - oa[0], a[1] - oa[1]]])); }
  const Q = W(MR.plaza), a = C[1], b = C[2], L = Math.hypot(b[0] - a[0], b[1] - a[1]), t = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], nW = [t[1], -t[0]];
  const sg = (nW[0] * (Q[0][0] - a[0]) + nW[1] * (Q[0][1] - a[1])) > 0 ? 1 : -1, p0 = [a[0] + sg * nW[0] * h, a[1] + sg * nW[1] * h];   // 154 の西の縁の線上の点
  const meet = (u, v) => { const e = [v[0] - u[0], v[1] - u[1]], den = e[0] * t[1] - e[1] * t[0], s = ((p0[0] - u[0]) * t[1] - (p0[1] - u[1]) * t[0]) / den; return [u[0] + e[0] * s, u[1] + e[1] * s]; };
  const D = [Q[0], meet(Q[0], Q[1]), meet(Q[3], Q[2]), Q[3]];
  const H = [ccw(D)].concat(ROW);
  const bb = [1e9, -1e9, 1e9, -1e9]; for (const P of H) for (const q of P) { bb[0] = Math.min(bb[0], q[0]); bb[1] = Math.max(bb[1], q[0]); bb[2] = Math.min(bb[2], q[1]); bb[3] = Math.max(bb[3], q[1]); }
  const rowD = (x, z) => Math.min(...ROW.map((R) => polyDist(R, x, z)));
  const planD = (x, z) => Math.min(polyDist(D, x, z), rowD(x, z));
  const near = (x, z, r) => x > bb[0] - r && x < bb[1] + r && z > bb[2] - r && z < bb[3] + r;
  const area = (P) => { let A = 0; for (let i = 0; i < P.length; i++) { const u = P[i], v = P[(i + 1) % P.length]; A += u[0] * v[1] - v[0] * u[1]; } return Math.abs(A / 2); };
  let len = 0; for (let i = 0; i + 1 < C.length; i++) len += Math.hypot(C[i + 1][0] - C[i][0], C[i + 1][1] - C[i][1]);
  return { D: D, C: C, ROW: ROW, H: H, bb: bb, rowD: rowD, planD: planD, aD: (x, z) => polyDist(D, x, z), near: near, area: area(D), len: len, Q: Q,
    inPlan: (x, z, r) => near(x, z, r + 1) && planD(x, z) < r };
})();
/* 放射第23号線(都市計画。2026-11)の検証側の形:tools/h23_ref.js の中心線と幅から、区間ごとの四角形(継ぎ目は角の二等分線)の帯 ROW と外形 O を組む
   (HTML の H23 は読まない)。帯は道路になり、帯の既存の道路・建物・木は無い。地形は平らにしない */
const HR = require('./h23_ref');
const HV = (() => {
  const C = HR.c.map((p) => HR.toXY(X, p)), n = C.length;
  const nr = (i) => { const a = C[i], b = C[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]); return [-(b[1] - a[1]) / l, (b[0] - a[0]) / l]; };
  const of = C.map((_, i) => { const n0 = nr(Math.max(0, i - 1)), n1 = nr(Math.min(n - 2, i)), m = [n0[0] + n1[0], n0[1] + n1[1]], l = Math.hypot(m[0], m[1]), c = (m[0] * n1[0] + m[1] * n1[1]) / l, h = HR.w[i] / 2;
    return [m[0] / l * h / c, m[1] / l * h / c]; });
  const ccw = (P) => { let A = 0; for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length]; A += a[0] * b[1] - b[0] * a[1]; } return A > 0 ? P : P.slice().reverse(); };
  const ROW = []; for (let i = 0; i < n - 1; i++) { const a = C[i], b = C[i + 1], oa = of[i], ob = of[i + 1];
    ROW.push(ccw([[a[0] + oa[0], a[1] + oa[1]], [b[0] + ob[0], b[1] + ob[1]], [b[0] - ob[0], b[1] - ob[1]], [a[0] - oa[0], a[1] - oa[1]]])); }
  const O = ccw(C.map((a, i) => [a[0] + of[i][0], a[1] + of[i][1]]).concat(C.map((a, i) => [a[0] - of[i][0], a[1] - of[i][1]]).reverse()));
  const bb = [1e9, -1e9, 1e9, -1e9]; for (const q of O) { bb[0] = Math.min(bb[0], q[0]); bb[1] = Math.max(bb[1], q[0]); bb[2] = Math.min(bb[2], q[1]); bb[3] = Math.max(bb[3], q[1]); }
  const near = (x, z, r) => x > bb[0] - r && x < bb[1] + r && z > bb[2] - r && z < bb[3] + r;
  const rowD = (x, z) => near(x, z, 12) ? polyDist(O, x, z) : 12;           // 帯までの距離(中は負。12m より遠くは 12)
  let len = 0; for (let i = 0; i + 1 < n; i++) len += Math.hypot(C[i + 1][0] - C[i][0], C[i + 1][1] - C[i][1]);
  return { C: C, ROW: ROW, O: O, H: ROW, bb: bb, near: near, rowD: rowD, planD: rowD, len: len, inPlan: (x, z, r) => near(x, z, r + 1) && polyDist(O, x, z) < r };
})();
// 計画の区域の和(千歳烏山 KV・明大前 MV・放射第23号線 HV)。地表の道路の深さ・航空写真・交差部で、区域の別なく使う所(地形を平らにするのは KV・MV だけ)
const PV = { H: KV.H.concat(MV.H, HV.H), near: (x, z, r) => KV.near(x, z, r) || MV.near(x, z, r) || HV.near(x, z, r), rowD: (x, z) => Math.min(KV.rowD(x, z), MV.rowD(x, z), HV.rowD(x, z)),
  planD: (x, z) => Math.min(KV.planD(x, z), MV.planD(x, z), HV.planD(x, z)), inPlan: (x, z, r) => KV.inPlan(x, z, r) || MV.inPlan(x, z, r) || HV.inPlan(x, z, r), segOut: KV.segOut };
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
  // 水面(河川・池):land64 の種別3
  const water = [];
  if (g.PLATEAU_LAND.land64) {
    const w = Buffer.from(g.PLATEAU_LAND.land64, 'base64');
    if (w.toString('latin1', 0, 4) !== 'PLU1') throw new Error('地表データの形式');
    const M = w.readUInt32LE(4); let q = 8;
    for (let n = 0; n < M; n++) {
      const k = w.readUInt8(q), nv = w.readUInt16LE(q + 2); q += 4;
      let x = w.readInt32LE(q), z = w.readInt32LE(q + 4); q += 8;
      const P = [[x / 10, z / 10]];
      for (let i = 1; i < nv; i++) { x += w.readInt16LE(q); z += w.readInt16LE(q + 2); q += 4; P.push([x / 10, z / 10]); }
      if (k === 3) water.push(P);
    }
  }
  /* 千歳烏山駅前広場南側地区(計画):区域と 216 の帯の中の既存の道路の面は無くなり、216 の帯が道路になる。区域の近く(30m)では
     道路の面=(既存の道路 − 穴 H)∪ 216 の帯 までの符号付きの距離を検証側で求める:既存の道路の辺のうち穴の外の部分と、穴の辺のうち
     既存の道路の中の部分(0.2m ごとの点)までの距離(10m の格子で引く。10m より遠くは 10m 以上としか分からないが検査には足りる) */
  let depthP = depth;
  if (KARA_DATA) {
    const NR = out.filter((R) => !(R.k === 2 && R.sec === 2) && [KV, MV, HV].some((V) => R.bb[1] > V.bb[0] - 40 && R.bb[0] < V.bb[1] + 40 && R.bb[3] > V.bb[2] - 40 && R.bb[2] < V.bb[3] + 40));   // 2026-11 から明大前(MV)も
    const G = new Map(), GC = 10, put = (x0, x1, z0, z1, o) => { for (let a = Math.floor(x0 / GC); a <= Math.floor(x1 / GC); a++) for (let c = Math.floor(z0 / GC); c <= Math.floor(z1 / GC); c++) { const k = a + ',' + c; if (!G.has(k)) G.set(k, []); G.get(k).push(o); } };
    for (const R of NR) for (let i = 0; i < R.P.length; i++) { let segs = [[R.P[i], R.P[(i + 1) % R.P.length]]];
      for (const Q of PV.H) segs = [].concat(...segs.map(([a, b]) => PV.segOut(a, b, Q)));
      for (const [a, b] of segs) put(Math.min(a[0], b[0]), Math.max(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[1], b[1]), [a, b]); }
    const inU = (x, z) => NR.some((R) => x > R.bb[0] && x < R.bb[1] && z > R.bb[2] && z < R.bb[3] && polyDist(R.P, x, z) < 0);
    for (const Q of PV.H) for (let i = 0; i < Q.length; i++) { const a = Q[i], b = Q[(i + 1) % Q.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 0.2));
      for (let k = 0; k <= n; k++) { const x = a[0] + (b[0] - a[0]) * k / n, z = a[1] + (b[1] - a[1]) * k / n; if (inU(x, z)) put(x, x, z, z, [[x, z], [x, z]]); } }
    depthP = (x, z) => {
      if (!PV.near(x, z, 30)) return depth(x, z);
      let d = 10; for (let a = Math.floor(x / GC) - 1; a <= Math.floor(x / GC) + 1; a++) for (let c = Math.floor(z / GC) - 1; c <= Math.floor(z / GC) + 1; c++)
        for (const [p, q] of G.get(a + ',' + c) || []) { const dx = q[0] - p[0], dz = q[1] - p[1], L2 = dx * dx + dz * dz, u = L2 ? Math.max(0, Math.min(1, ((x - p[0]) * dx + (z - p[1]) * dz) / L2)) : 0;
          d = Math.min(d, Math.hypot(x - p[0] - dx * u, z - p[1] - dz * u)); }
      const inPlan = PV.H.some((Q) => polyDist(Q, x, z) < 0), dU = (inU(x, z) && !inPlan) ? -d : d;
      return Math.min(dU, PV.rowD(x, z));
    };
  }
  // 高架の自動車道=自動車専用(k=2)の全部(橋梁 sec 2 と分合流 sec 4。2026-11 から sec 4 も床版。地表の道路の扱いは橋梁だけ高架)
  return { roads: out, depth: depthP, elev: out.filter((R) => R.k === 2), water: water };
})();
const ALL = B.map((o) => ({ o: o, kind: '建物' })).concat(T.map((o) => ({ o: o, kind: '樹木' })));

/* ---- 1. 数 ---------------------------------------------------------------- */
ok('建物の数', B.length >= REF.MIN_BUILDINGS, '≥' + REF.MIN_BUILDINGS + '棟', B.length + '棟');
ok('樹木の数', T.length >= REF.MIN_TREES, '≥' + REF.MIN_TREES + '本', T.length + '本');

/* ---- 2. 高架下・側道に入らない ------------------------------------------- */
{
  let bad = null;
  for (const e of ALL) for (const q of pts(e.o)) {
    // 掘割(DECK_END より西)は側ごとの幅(仙川の北は単式ホームの分だけ広い)
    const south = q.off < 0 && q.s <= X.DECK_END && !inStaZone(q.s);
    const lim = (q.s > X.DECK_END ? X.cutHalf(q.s, q.off < 0 ? -1 : 1) : X.deckHalf(q.s, q.off < 0 ? -1 : 1)) + (south ? REF.SOUTH_CLEAR : REF.DECK_CLEAR);
    if (Math.abs(q.off) - q.r < lim && !bad)
      bad = [e.kind, 's=' + q.s.toFixed(0), 'off=' + q.off.toFixed(1), '限界' + lim.toFixed(1)];
  }
  ok('高架下・側道に入らない', bad === null, '桁半幅+' + REF.DECK_CLEAR + 'm以遠(高架の南の駅の外は +' + REF.SOUTH_CLEAR + 'm)',
    bad ? bad.join(' ') : ALL.length + '件すべて');
}
/* 2b. 高架の南は壁の 1m 付近まで建物が建つ(2026-11 利用者指示)。駅の外の南で、建物の足跡の点が桁の縁から SOUTH_NEAR の内にある建物が
   SOUTH_MIN_N 棟以上(以前は 4.6m より内に 0 棟。実際の建物は線路の脇の道路の外に建つ物が多く、壁の近くまで来るのは約40棟)。南へ出た構造物(登録簿 STRUCT=高欄・外装・庇)の外面から SOUTH_WALL の内に建物・木が無い */
{
  let nNear = 0, bad = null;
  const SB = X.STRUCT.filter((q) => q.o0 < 0 && Math.min(q.s0, q.s1) < X.DECK_END && -q.o0 > X.deckHalf((q.s0 + q.s1) / 2, -1) - 0.5);
  const SG = new Map(); for (const q of SB) for (let k = Math.floor(Math.min(q.s0, q.s1) / 10); k <= Math.floor(Math.max(q.s0, q.s1) / 10); k++) { if (!SG.has(k)) SG.set(k, []); SG.get(k).push(q); }
  for (const e of ALL) { let near = false;
    for (const q of pts(e.o)) { if (q.off >= 0 || q.s > X.DECK_END) continue;
      const d = -q.off - q.r - X.deckHalf(q.s, -1);
      if (e.kind === '建物' && !inStaZone(q.s) && d >= REF.SOUTH_NEAR[0] - 0.05 && d < REF.SOUTH_NEAR[1]) near = true;
      for (const S of SG.get(Math.floor(q.s / 10)) || []) {
        if (q.s > Math.min(S.s0, S.s1) - q.r - REF.SOUTH_WALL && q.s < Math.max(S.s0, S.s1) + q.r + REF.SOUTH_WALL &&
            q.off > S.o0 - q.r - REF.SOUTH_WALL && q.off < S.o1 + q.r + REF.SOUTH_WALL && !bad)
          bad = e.kind + ' s=' + q.s.toFixed(1) + ' off=' + q.off.toFixed(2) + ' が ' + S.tag + '(off ' + S.o0.toFixed(2) + ')から ' + REF.SOUTH_WALL + 'm の内'; } }
    if (near) nNear++; }
  ok('高架の南は壁の 1m 付近まで建物', bad === null && nNear >= REF.SOUTH_MIN_N, '駅の外の南で桁の縁から ' + REF.SOUTH_NEAR.join('〜') + 'm に足跡が掛かる建物 ' + REF.SOUTH_MIN_N + '棟以上・南へ出た構造物から ' + REF.SOUTH_WALL + 'm の内に無い',
    bad || nNear + '棟(構造物 ' + SB.length + '件)');
}

/* ---- 3. 交差鉄道(井の頭線・世田谷線)の上に無い --------------------------
   線路は営業距離に対して斜めに走る(井の頭線は880mの延長でsが約160m動く)。
   sだけの帯では覆えないので、世界座標の線路の中心線(検証側で RAW から作った曲線 XC)からの距離で判定する。 */
{
  const lines = [['井の頭線', XC.INO, X.XR.U0, X.XR.U1], ['世田谷線', XC.SETA, X.XR.SETA_U0, X.XR.SETA_U1]];
  let bad = null, worst = 1e9;
  const SHOW = REF.KEEP_SHOW.map((q) => ({ n: q.n, h: q.h, x: (q.lon - X.LON0) * X.MLON, z: -(q.lat - X.LAT0) * X.MLAT, e: null }));
  const cenA = (P) => { let A = 0, cx = 0, cz = 0; for (let i = 0; i < P.length; i++) { const a = P[i], c = P[(i + 1) % P.length], w = a[0] * c[1] - c[0] * a[1]; A += w; cx += (a[0] + c[0]) * w; cz += (a[1] + c[1]) * w; } return [cx / (3 * A), cz / (3 * A)]; };
  for (const e of ALL) if (e.kind === '建物' && POLY(e.o)) { const [cx, cz] = cenA(e.o.poly); for (const q of SHOW) if (Math.hypot(cx - q.x, cz - q.z) < 2) { q.e = e; e.show = true; } }
  for (const [nm, A, u0, u1] of lines) {
    for (const e of ALL) for (const q of pts(e.o)) {
      const p = A.uv(q.x, q.z), du = p.u, dn = Math.abs(p.n);
      if (du < u0 - q.r || du > u1 + q.r) continue;      // 線路の延長の外
      let clear = dn - q.r, lim = nm === '世田谷線' && du > REF.SETA_TERM.u ? REF.SETA_TERM.hw : REF.XRAIL_HALF[nm];
      if (nm === '井の頭線') { if (dn > 25) continue; const sd = p.n < 0 ? 0 : 1; clear = dn - Math.abs(A.trackV(sd, du)) - q.r; lim = inoPlat(sd, du, 1.5) && !e.show ? REF.INO_PLAT_CLEAR : REF.INO_CLEAR; }
      if (clear - lim < worst) worst = clear - lim;
      if (clear < lim && !bad)
        bad = [nm, e.kind, 'u=' + du.toFixed(0), '離隔' + clear.toFixed(1) + 'm'];
    }
  }
  for (const q of SHOW) ok(q.n + 'を描く', !!q.e && Math.abs(q.e.o.h - q.h) < 0.2, '交差鉄道の占有域に掛かっても街に有る(高さ ' + q.h + 'm)', q.e ? '有り・高さ ' + q.e.o.h.toFixed(1) + 'm' : '無い');
  ok('交差鉄道の上に無い', bad === null,
    '井の頭線は線路から ' + REF.INO_CLEAR + 'm(ホーム ' + REF.INO_PLAT_CLEAR.toFixed(2) + 'm)・世田谷線は中心から ' + REF.XRAIL_HALF['世田谷線'] + 'm(終端 ' + REF.SETA_TERM.hw + 'm)',
    bad ? bad.join(' ') : '余裕' + worst.toFixed(1) + 'm');
}

/* ---- 3b. 交差鉄道の脇の建物を消しすぎない(2026-10-27 利用者指示:線路の脇の建物が無くなっていた) -------------------
   plateau_bldg.js を検証側で読み、足跡(頂点と辺の 1m ごとの点)の線路からの距離で:
   ・世田谷線:中心線から REF.SETA_KEEP_MAX〜20m に掛かる建物(終端のホームの外・線路の範囲の中)
   ・井の頭線:その側の実際の線路の中心から REF.INO_KEEP_MAX〜20m に掛かる建物(ホームの範囲の外)
   のうち、街(CITY.buildings)に残っている割合が 90% 以上 */
{
  const fs = require('fs'), pth = require('path'), f = pth.join(pth.dirname(path), 'plateau_bldg.js');
  if (fs.readFileSync(path, 'utf8').includes('<script src="plateau_bldg.js">') && fs.existsSync(f)) {
    const gB = {}; new Function('globalThis', fs.readFileSync(f, 'utf8'))(gB);
    const pb = Buffer.from(gB.PLATEAU_BLDG.b64, 'base64'), N = pb.readUInt32LE(4);
    const kept = new Set(B.filter((e) => e.plateau && e.poly).map((e) => e.poly[0][0].toFixed(1) + ',' + e.poly[0][1].toFixed(1) + ',' + e.h.toFixed(1)));
    const R = { 世田谷線: { n: 0, k: 0, miss: null }, 井の頭線: { n: 0, k: 0, miss: null } };
    for (let n = 0, o = 8; n < N; n++) {
      const nv = pb.readUInt8(o), h = pb.readUInt16LE(o + 1) / 10; o += 4;
      let x = pb.readInt32LE(o), z = pb.readInt32LE(o + 4); o += 8; const P = [[x / 10, z / 10]];
      for (let i = 1; i < nv; i++) { x += pb.readInt16LE(o); z += pb.readInt16LE(o + 2); o += 4; P.push([x / 10, z / 10]); }
      if (P.length < 3 || !(h > 0)) continue;
      const kp = kept.has(P[0][0].toFixed(1) + ',' + P[0][1].toFixed(1) + ',' + h.toFixed(1));
      for (const nm of ['世田谷線', '井の頭線']) {
        const A = nm === '世田谷線' ? XC.SETA : XC.INO, lo = nm === '世田谷線' ? X.XR.SETA_U0 + 10 : X.XR.U0 + 10, hi = nm === '世田谷線' ? REF.SETA_TERM.u - 5 : X.XR.U1 - 10;
        let dmin = 1e9, uIn = false, plat = false;
        for (let i = 0; i < P.length && dmin > 0; i++) { const a = P[i], c = P[(i + 1) % P.length], m = Math.max(1, Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1])));
          for (let k = 0; k < m; k++) { const q = A.uv(a[0] + (c[0] - a[0]) * k / m, a[1] + (c[1] - a[1]) * k / m); if (Math.abs(q.n) > 30 || q.u <= lo || q.u >= hi) continue;
            uIn = true; let d = Math.abs(q.n);
            if (nm === '井の頭線') { const sd = q.n < 0 ? 0 : 1; d -= Math.abs(A.trackV(sd, q.u)); if (inoPlat(sd, q.u, 5)) plat = true; }
            dmin = Math.min(dmin, d); } }
        const lim = nm === '世田谷線' ? REF.SETA_KEEP_MAX : REF.INO_KEEP_MAX;
        if (!uIn || plat || dmin < lim || dmin > 20) continue;
        const r = R[nm]; r.n++; if (kp) r.k++; else if (!r.miss) r.miss = '(' + P[0][0].toFixed(0) + ',' + P[0][1].toFixed(0) + ') 線路から ' + dmin.toFixed(1) + 'm';
      }
    }
    for (const [nm, r] of Object.entries(R))
      ok(nm + 'の脇の建物が残る', r.n >= 50 && r.k >= 0.9 * r.n, (nm === '世田谷線' ? '中心線から ' + REF.SETA_KEEP_MAX : '線路の中心から ' + REF.INO_KEEP_MAX + '(ホームの外)') + '〜20m に掛かる実際の建物の 90% 以上',
        r.k + '/' + r.n + '棟' + (r.miss ? '(外した例 ' + r.miss + ')' : ''));
  }
}

/* ---- 4. 道路・河川の上に無い --------------------------------------------- */
{
  let bad = null;
  for (const c of REF.CROSS) {
    // 実データの道路があるときは、道路は「実際の道路の上に無い」で見る。ここは模式のまま描く物(玉川上水)だけ。
    // 計画の放射23 は 2026-11 から計画の形(4l。h23_ref.js の帯)で見る
    if (LAND && !['玉川上水'].includes(c[0])) continue;
    const cs = X[c[1]], hw = c[2], oh = c[3] === undefined ? 1e9 : c[3];
    for (const e of ALL) for (const q of pts(e.o)) {
      if (Math.abs(q.off) > oh) continue;
      if (Math.abs(q.s - cs) - q.r < hw && !bad)
        bad = [c[0], e.kind, 's=' + q.s.toFixed(0), 'off=' + q.off.toFixed(0)];
    }
  }
  ok('交差道路の上に無い', bad === null, LAND ? '玉川上水(他は実データ・放射23 は 4l)' : REF.CROSS.length + '路線すべて',
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
    for (const q of (B.some((e) => e.plateau) ? [] : REF.POND)) {   // 実データの建物があるときは模式の池を描かない
      if (Math.hypot(p.s - (X.WADA_S + q[0]), p.off - (X.WADA_OFF + q[1])) - p.r < q[2] && !br)
        br = ['和田堀の池', e.kind, 's=' + p.s.toFixed(0)];
    }
  }
  /* 実データの建物があるときは、模式の施設(和田堀給水所 430m×230m)で実際の街を消さない。
     模式の範囲にある実データの建物が消えずに残っていること(2026-10:模式の箱と占有域が203棟を隠していた) */
  if (B.some((e) => e.plateau)) {
    const nW = B.filter((e) => e.plateau && Math.abs(e.s - X.WADA_S) < 215 && Math.abs(e.off - X.WADA_OFF) < 115).length;
    ok('和田堀給水所の範囲の実データ', nW >= 100, '100棟以上が残る', nW + '棟');
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
    const side = !POLY(e.o) && e.o.kind === '桜';   // 歩道の並木:幹が道路の縁から SIDEWALK_IN 以内
    const d = LAND.depth(side ? e.o.x : q.x, side ? e.o.z : q.z), lim = POLY(e.o) ? -REF.ROAD_BLDG_IN : (side ? -REF.SIDEWALK_IN : q.r);
    if (d - lim < worst) worst = d - lim;
    if (d < lim && !bad) bad = [e.kind, '(' + q.x.toFixed(0) + ',' + q.z.toFixed(0) + ')', '道路の面まで' + d.toFixed(2) + 'm'];
  }
  ok('実際の道路の上に無い', bad === null, '建物は食い込み≤' + REF.ROAD_BLDG_IN + 'm・樹木は半径ぶん離れる(歩道の桜は幹が縁から' + REF.SIDEWALK_IN + 'm以内)',
    bad ? bad.join(' ') : ALL.length + '件すべて(余裕' + worst.toFixed(2) + 'm)');

  // 河川・池の水面の上に無い(建物も樹木も、水面に入らない)
  let bw = null;
  if (LAND.water.length) {
    const WB = LAND.water.map((P) => { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const v of P) { x0 = Math.min(x0, v[0]); x1 = Math.max(x1, v[0]); z0 = Math.min(z0, v[1]); z1 = Math.max(z1, v[1]); } return { P: P, bb: [x0, x1, z0, z1] }; });
    for (const e of ALL) for (const q of pts(e.o)) {
      for (const W of WB) {
        if (q.x < W.bb[0] - 10 || q.x > W.bb[1] + 10 || q.z < W.bb[2] - 10 || q.z > W.bb[3] + 10) continue;
        const d = polyDist(W.P, q.x, q.z), lim = POLY(e.o) ? -REF.ROAD_BLDG_IN : q.r;
        if (d < lim && !bw) bw = [e.kind, '(' + q.x.toFixed(0) + ',' + q.z.toFixed(0) + ')', '水面まで' + d.toFixed(2) + 'm'];
      }
    }
  }
  ok('水面(河川・池)の上に無い', bw === null && LAND.water.length > 0, '水面' + '>0面・建物は食い込み≤' + REF.ROAD_BLDG_IN + 'm',
    bw ? bw.join(' ') : '水面' + LAND.water.length + '面・' + ALL.length + '件すべて');

  // 京王線を横切る道路を検証側で見つける
  const xing = []; let a = null;
  for (let s = Math.floor(X.DOM.x0); s <= X.DECK_END + 1; s++) {
    const on = [0, -X.deckHalf(s, -1), X.deckHalf(s, 1)].every((o) => { const f = X.frame(s, o); return LAND.depth(f.x, f.z) < 0; });
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
    for (const o of [0, -X.deckHalf(s, -1), X.deckHalf(s, 1)]) {
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
    if (q.s > X.DOM.x0 - 50 && q.s < X.DECK_END + 50 && Math.abs(q.off) < X.deckHalf(q.s, q.off < 0 ? -1 : 1) + REF.DECK_CLEAR + 1.0 && !be)
      be = ['橋脚が高架下・側道に', 's=' + q.s.toFixed(0), 'off=' + q.off.toFixed(1)];
  }
  ok('自動車道の高架が京王線と当たらない', be === null && X.EXPY.deck.length === LAND.elev.filter((R) => R.P.some((v) => { const q = X.prjXY(v[0], v[1]); return q.s > X.DOM.x0 - 150 && q.s < X.DOM.x1 + 150 && Math.abs(q.off) < X.DOM.z + 60; })).length,
    '下面≥レール面+' + REF.EXPY_CLEAR + 'm・橋脚は側道の外',
    be ? be.join(' ') : '床版' + X.EXPY.deck.length + '面・重なる点' + ne + '・橋脚' + X.EXPY.piers.length + '基');
  /* 自動車道の高架は途切れない(2026-11 利用者指摘「甲州街道の上に中途半端に高架橋」:分合流の面 sec 4 が抜けて床版が宙で途切れ、片の継ぎ目に
     高欄が車道を横切っていた)。検証側で plateau_land.js から読んだ自動車専用の面(k=2)の和で:
     ・高欄の線分(登録簿 EXPY.rails)は和の外周にある(中点の両側 0.4m のどちらかが和の外)・外周(辺の 2m ごとの点で、外へ 0.6m が和の外)の
       98% 以上に 0.3m 以内の高欄がある
     ・橋脚の柱は和の中(縁から 1.2m 以上内)・地表の道路の交差部(sec 4)から 2m 以上・互いに 6m 以上・京王線の帯(桁の半幅+4.6m)の外
     ・和の中の 10m 格子の点(縁から 2m 以上内・京王線の帯の 40m の外)から 70m 以内に橋脚がある(支えの無い区間が無い) */
  { const EL = LAND.elev.filter((R) => R.P.some((v) => { const q = X.prjXY(v[0], v[1]); return q.s > X.DOM.x0 - 150 && q.s < X.DOM.x1 + 150 && Math.abs(q.off) < X.DOM.z + 60; }));
    const bbOf = (P) => { let a = 1e9, b = -1e9, c = 1e9, d = -1e9; for (const p of P) { a = Math.min(a, p[0]); b = Math.max(b, p[0]); c = Math.min(c, p[1]); d = Math.max(d, p[1]); } return [a, b, c, d]; };
    for (const R of EL) R.bb2 = bbOf(R.P);
    const uD = (x, z) => { let d = 1e9; for (const R of EL) if (x > R.bb2[0] - 30 && x < R.bb2[1] + 30 && z > R.bb2[2] - 30 && z < R.bb2[3] + 30) d = Math.min(d, polyDist(R.P, x, z)); return d; };   // 和までの距離(中は負。和の外周から測る近似)
    const inU = (x, z) => EL.some((R) => x > R.bb2[0] && x < R.bb2[1] && z > R.bb2[2] && z < R.bb2[3] && polyDist(R.P, x, z) < 0);
    let bad = null, nOut = 0, nCov = 0, nGrid = 0;
    const RL = X.EXPY.rails || [];
    for (const r of RL) { const dx = r[2] - r[0], dz = r[3] - r[1], L = Math.hypot(dx, dz) || 1, mx = (r[0] + r[2]) / 2, mz = (r[1] + r[3]) / 2, nx = dz / L, nz = -dx / L;
      if (inU(mx + nx * 0.4, mz + nz * 0.4) && inU(mx - nx * 0.4, mz - nz * 0.4) && !bad) bad = '高欄 (' + mx.toFixed(0) + ',' + mz.toFixed(0) + ') が床版の継ぎ目(両側とも床版)'; }
    const RG = new Map(); for (const r of RL) { const k = Math.floor((r[0] + r[2]) / 40) + ',' + Math.floor((r[1] + r[3]) / 40); if (!RG.has(k)) RG.set(k, []); RG.get(k).push(r); }
    const nearRail = (x, z) => { for (let a = Math.floor(x / 20) - 1; a <= Math.floor(x / 20) + 1; a++) for (let c = Math.floor(z / 20) - 1; c <= Math.floor(z / 20) + 1; c++)
      for (const r of RG.get(a + ',' + c) || []) { const dx = r[2] - r[0], dz = r[3] - r[1], L2 = dx * dx + dz * dz, u = L2 ? Math.max(0, Math.min(1, ((x - r[0]) * dx + (z - r[1]) * dz) / L2)) : 0;
        if (Math.hypot(x - r[0] - dx * u, z - r[1] - dz * u) < 0.3) return true; } return false; };
    for (const R of EL) for (let i = 0; i < R.P.length; i++) { const a = R.P[i], c = R.P[(i + 1) % R.P.length], L = Math.hypot(c[0] - a[0], c[1] - a[1]); if (L < 0.5) continue;
      let nx = (c[1] - a[1]) / L, nz = -(c[0] - a[0]) / L; if (polyDist(R.P, (a[0] + c[0]) / 2 + nx * 0.3, (a[1] + c[1]) / 2 + nz * 0.3) < 0) { nx = -nx; nz = -nz; }
      for (let t = 1; t < L; t += 2) { const x = a[0] + (c[0] - a[0]) * t / L, z = a[1] + (c[1] - a[1]) * t / L; if (inU(x + nx * 0.6, z + nz * 0.6)) continue; nOut++; if (nearRail(x, z)) nCov++; } }
    if (!bad && nCov < nOut * 0.98) bad = '外周に高欄が無い所 ' + (nOut - nCov) + '/' + nOut;
    const XS = LAND.roads.filter((R) => R.k !== 2 && R.sec === 4); for (const R of XS) R.bb2 = R.bb2 || bbOf(R.P);
    const PI = X.EXPY.piers;
    PI.forEach((p, i) => { if (bad) return; const q = X.prjXY(p[0], p[1]);
      if (!(uD(p[0], p[1]) < -1.2)) bad = '橋脚 (' + p[0].toFixed(0) + ',' + p[1].toFixed(0) + ') が床版の縁から 1.2m の内でない';
      else if (XS.some((R) => p[0] > R.bb2[0] - 2 && p[0] < R.bb2[1] + 2 && p[1] > R.bb2[2] - 2 && p[1] < R.bb2[3] + 2 && polyDist(R.P, p[0], p[1]) < 2)) bad = '橋脚 (' + p[0].toFixed(0) + ',' + p[1].toFixed(0) + ') が交差部の 2m 内';
      else if (PI.some((o, j) => j !== i && Math.hypot(o[0] - p[0], o[1] - p[1]) < 6)) bad = '橋脚 (' + p[0].toFixed(0) + ',' + p[1].toFixed(0) + ') がほかの橋脚の 6m 内'; });
    const PG = new Map(); for (const p of PI) { const k = Math.floor(p[0] / 70) + ',' + Math.floor(p[1] / 70); if (!PG.has(k)) PG.set(k, []); PG.get(k).push(p); }
    for (const R of EL) for (let x = Math.ceil(R.bb2[0] / 10) * 10; x < R.bb2[1] && !bad; x += 10) for (let z = Math.ceil(R.bb2[2] / 10) * 10; z < R.bb2[3] && !bad; z += 10) {
      if (!(polyDist(R.P, x, z) < -2)) continue; const q = X.prjXY(x, z);
      if (q.s > X.DOM.x0 - 120 && q.s < X.DOM.x1 + 120 && Math.abs(q.off) < X.deckHalf(Math.max(X.DOM.x0, Math.min(X.DOM.x1, q.s))) + 40) continue;
      nGrid++; let ok2 = false;
      for (let a = Math.floor(x / 70) - 1; a <= Math.floor(x / 70) + 1 && !ok2; a++) for (let c = Math.floor(z / 70) - 1; c <= Math.floor(z / 70) + 1 && !ok2; c++)
        for (const p of PG.get(a + ',' + c) || []) if (Math.hypot(p[0] - x, p[1] - z) < 70) { ok2 = true; break; }
      if (!ok2) bad = '床版の (' + x + ',' + z + ') から 70m に橋脚が無い'; }
    ok('自動車道の高架は途切れない', bad === null && EL.length >= 10 && RL.length > 200 && PI.length > 100,
      '自動車専用の面の全部が床版・高欄は外周だけ(98% 以上を覆う)・橋脚は床版の中ほど・交差部と互いから離れ 70m 以内に支える',
      bad || '面 ' + EL.length + '・高欄 ' + RL.length + '本(外周 ' + nCov + '/' + nOut + ')・橋脚 ' + PI.length + '基・格子 ' + nGrid + '点'); }
}

/* ---- 4e. 仙川の掘割(利用者指示 2026-10-11)----------------------------------------
   ・地表(groundMesh)は掘割の上に穴があり、擁壁の外は覆う(擁壁の位置は登録簿 STRUCT '擁壁')
   ・地表に敷いた面(道路・緑地・駐車場・水面=userData.flat)の三角形が掘割の中に無い。ただし渡る道路橋の上
     (登録簿 '掘割を渡る床版' の s の範囲)は道路の面が続いてよい
   ・PLATEAU の道路の橋梁(検証側が plateau_land.js から読んだもの)が掘割の中心線の上にある所には、床版がある
   ・幹線の街灯が掘割の中に無い */
{
  const WL = X.STRUCT.filter((q) => q.tag === '擁壁'), DK = X.STRUCT.filter((q) => q.tag === '掘割を渡る床版' || q.tag === '橋上駅舎');
  const s0 = Math.min(...WL.map((q) => q.s0)), s1 = Math.max(...WL.map((q) => q.s1));
  const inner = (s, sg) => { const L = WL.filter((q) => q.s0 <= s + 1e-6 && q.s1 >= s - 1e-6 && sg * (q.o0 + q.o1) > 0);
    return L.length ? Math.max(...L.map((q) => sg > 0 ? q.o0 : -q.o1)) : null; };   // 内面(区間の中で最も外=控えめ)
  const outer = (s, sg) => { const L = WL.filter((q) => q.s0 <= s + 1e-6 && q.s1 >= s - 1e-6 && sg * (q.o0 + q.o1) > 0);
    return L.length ? Math.max(...L.map((q) => sg > 0 ? q.o1 : -q.o0)) : null; };
  const inCut = (s, o, m) => { if (s < s0 + 0.5 || s > s1 - 0.5) return false; const n = inner(s, 1), so = inner(s, -1);
    return n !== null && so !== null && o < n - m && o > -so + m; };
  const underDeck = (s) => DK.some((q) => s > q.s0 - 0.6 && s < q.s1 + 0.6);
  // 地表の三角形
  // 頂点の配列が無い形(箱など)は穴を測れない=NG
  const g = X.groundMesh.geometry, ga = g && g.attributes && g.attributes.position, gi = g && g.index;
  const P = ga && ga.array ? ga.array : [], I = gi && gi.array ? gi.array : [], T = [];
  for (let i = 0; i < I.length; i += 3) T.push([[P[I[i] * 3], P[I[i] * 3 + 2]], [P[I[i + 1] * 3], P[I[i + 1] * 3 + 2]], [P[I[i + 2] * 3], P[I[i + 2] * 3 + 2]]]);
  const cr = (a, b, c) => (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
  const covered = (x, z) => T.some((t) => { const p = [x, z], d1 = cr(t[0], t[1], p), d2 = cr(t[1], t[2], p), d3 = cr(t[2], t[0], p);
    return !((d1 < 0 || d2 < 0 || d3 < 0) && (d1 > 0 || d2 > 0 || d3 > 0)); });
  let bG = null, nG = 0;
  for (let s = s0 + 3; s < s1 - 3; s += 10) {
    if (inner(s, 1) === null) continue; nG++;
    const c = X.frame(s, 0);
    if (covered(c.x, c.z) && !bG) bG = ['s=' + s.toFixed(0), '掘割の中に地表'];
    for (const sg of [-1, 1]) { const f = X.frame(s, sg * (outer(s, sg) + 2.0)); if (!covered(f.x, f.z) && !bG) bG = ['s=' + s.toFixed(0), (sg > 0 ? '北' : '南') + 'の擁壁の外に地表が無い']; }
  }
  ok('地表に掘割の穴', bG === null && nG > 30 && T.length > 0, '掘割の中は穴・擁壁の外 2m は地表', T.length === 0 ? '地表の頂点が測れない' : bG ? bG.join(' ') : nG + '断面');
  // 地表に敷いた面の三角形(掘割の外接矩形の中だけ射影する)
  let bx0 = 1e9, bx1 = -1e9, bz0 = 1e9, bz1 = -1e9;
  for (const q of WL) for (const s of [q.s0, q.s1]) for (const o of [q.o0, q.o1]) { const f = X.frame(s, o); bx0 = Math.min(bx0, f.x); bx1 = Math.max(bx1, f.x); bz0 = Math.min(bz0, f.z); bz1 = Math.max(bz1, f.z); }
  let bF = null, nF = 0, nB = 0;
  X.scene.traverse((o) => {
    if (!o.isMesh || !o.userData || !o.userData.flat || o === X.groundMesh || !o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
    const A = o.geometry.attributes.position.array, J = o.geometry.index ? o.geometry.index.array : null, n = J ? J.length : A.length / 3;
    for (let i = 0; i < n; i += 3) {
      const v = [0, 1, 2].map((k) => (J ? J[i + k] : i + k) * 3), x = (A[v[0]] + A[v[1]] + A[v[2]]) / 3, z = (A[v[0] + 2] + A[v[1] + 2] + A[v[2] + 2]) / 3;
      if (x < bx0 || x > bx1 || z < bz0 || z > bz1) continue;
      const q = X.prjXY(x, z);
      if (!inCut(q.s, q.off, 0.4)) continue;
      if (underDeck(q.s)) { nB++; continue; }
      nF++;
      if (!bF) bF = ['s=' + q.s.toFixed(1), 'off=' + q.off.toFixed(2), 'y=' + ((A[v[0] + 1] + A[v[1] + 1] + A[v[2] + 1]) / 3).toFixed(2)];
    }
  });
  ok('掘割の中に地表の面が無い', bF === null, '道路・緑地の面は擁壁の外(渡る道路橋の上を除く)', bF ? nF + '面 例 ' + bF.join(' ') : '0面(道路橋の上 ' + nB + '面)');
  // PLATEAU の道路の橋梁が掘割の中心線の上にある所には床版
  if (LAND) {
    let bD = null, nD = 0;
    const br = LAND.roads.filter((R) => R.sec === 2 && R.k !== 2);
    for (let s = s0 + 1; s < s1 - 1; s += 0.5) {
      const c = X.frame(s, 0);
      if (!br.some((R) => c.x > R.bb[0] && c.x < R.bb[1] && c.z > R.bb[2] && c.z < R.bb[3] && polyDist(R.P, c.x, c.z) < 0)) continue;
      nD++;
      if (!DK.some((q) => s >= q.s0 - 1e-6 && s <= q.s1 + 1e-6) && !bD) bD = 's=' + s.toFixed(1);
    }
    ok('道路橋の下に床版', bD === null && nD > 0, 'PLATEAU の橋梁が掘割を渡る所は床版がある', bD ? bD + ' に床版が無い' : '橋梁の上 ' + nD + '点');
  }
  // 幹線の街灯は掘割の中・擁壁の上に無い
  const bL = X.ROAD_LAMPS.find((L) => { const q = X.prjXY(L[0], L[1]); if (q.s < s0 || q.s > s1) return false;
    const n = outer(q.s, 1), so = outer(q.s, -1); return n !== null && so !== null && q.off < n + 0.3 && q.off > -so - 0.3; });
  ok('街灯が掘割の中に無い', !bL, '擁壁の外', bL ? '(' + bL[0].toFixed(0) + ',' + bL[1].toFixed(0) + ')' : X.ROAD_LAMPS.length + '基すべて');
}

let L2_ALL = null, P0_ALL = null;          // 4c で読んだ LOD2 の面(建物ごと)と足跡の1点目(4c1 の写真の検査が使う)
/* ---- 4c. LOD2(屋根の形) ----------------------------------------------------
   plateau_bldg.js の LOD2 の面を検証側で独自に読み、近くの形(足跡の押し出しの代わりに面そのもの)を実際に作らせて、
   ・データの面の点がすべて描かれた頂点にある(LOD2 の建物が平らな箱のままになっていない)
   ・描いた三角形の向き(巻き順の法線)が頂点の法線と同じ側(裏返った面が無い)。足跡の押し出しの建物も同じに見る */
{
  const fs = require('fs'), pth = require('path');
  const f = pth.join(pth.dirname(path), 'plateau_bldg.js');
  const html = fs.readFileSync(path, 'utf8');
  const g = {};
  if (html.includes('<script src="plateau_bldg.js">') && fs.existsSync(f)) new Function('globalThis', fs.readFileSync(f, 'utf8'))(g);
  const D = g.PLATEAU_BLDG;
  if (D && D.lod2b64) {
    // 足跡の1点目(LOD2 の点の基準)を PLT1 から
    const b = Buffer.from(D.b64, 'base64'); const N = b.readUInt32LE(4); let o = 8; const P0 = [];
    for (let n = 0; n < N; n++) { const nv = b.readUInt8(o), hh = b.readUInt16LE(o + 1) / 10; o += 4; P0.push([b.readInt32LE(o) / 10, b.readInt32LE(o + 4) / 10, hh]); o += 8 + 4 * (nv - 1); }
    const w = Buffer.from(D.lod2b64, 'base64'); const M = w.readUInt32LE(4); let q = 8; const L2 = [];
    for (let k = 0; k < M; k++) {
      const bi = w.readUInt32LE(q), ns = w.readUInt16LE(q + 4); q += 6; const V = [], SF = []; let roofs = 0;
      for (let j = 0; j < ns; j++) {
        const t = w.readUInt8(q), nv = w.readUInt8(q + 1); q += 2; if (t === 1) roofs++;
        const sv = [];
        for (let i = 0; i < nv; i++) { const v = [P0[bi][0] + w.readInt16LE(q) / 10, w.readUInt16LE(q + 4) / 10, P0[bi][1] + w.readInt16LE(q + 2) / 10]; V.push(v); sv.push(v); q += 6; }
        SF.push(sv);
      }
      L2.push({ p0: P0[bi], V: V, roofs: roofs, bi: bi, SF: SF });
    }
    L2_ALL = L2; P0_ALL = P0;
    // 描かれている(登録簿にある)LOD2 の建物:足跡の1点目で対応を取る。面の点の高さは基部(地形の上。登録簿の base)からなので、
    // 描いた頂点はデータの高さ+基部(基部そのものは 4f で地表と独立の地盤の高さに照合する)
    const key = (x, z) => x.toFixed(1) + ',' + z.toFixed(1);
    const drawn = new Set(B.filter((e) => e.poly).map((e) => key(e.poly[0][0], e.poly[0][1])));
    const baseOf = new Map(B.filter((e) => e.poly).map((e) => [key(e.poly[0][0], e.poly[0][1]) + ',' + e.h.toFixed(1), e.base || 0]));
    const want = L2.filter((e) => drawn.has(key(e.p0[0], e.p0[1])));
    // LOD2 の建物を含むまとまりの近くの形を作る
    const VS = new Set(); let tris = 0, flip = 0, made = 0;
    for (const C of X.CITY_LODS) {
      if (!C.B.some((e) => e.l2)) continue;
      if (!C.m[0]) C.m[0] = C.make(C);
      made++;
      for (const m of [C.m[0]].concat(C.mt || [])) {             // 色の形と写真の形(詰め合わせごと)
      const gg = m.geometry, Pa = gg.attributes.position.array, Na = gg.attributes.normal.array, Ia = gg.index.array;
      for (let i = 0; i < Pa.length; i += 3) VS.add(Pa[i].toFixed(1) + ',' + Pa[i + 1].toFixed(1) + ',' + Pa[i + 2].toFixed(1));
      for (let t = 0; t < Ia.length; t += 3) {
        const a = Ia[t] * 3, c = Ia[t + 1] * 3, d = Ia[t + 2] * 3;
        const ux = Pa[c] - Pa[a], uy = Pa[c + 1] - Pa[a + 1], uz = Pa[c + 2] - Pa[a + 2], vx = Pa[d] - Pa[a], vy = Pa[d + 1] - Pa[a + 1], vz = Pa[d + 2] - Pa[a + 2];
        const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
        if (Math.hypot(nx, ny, nz) < 1e-6) continue;
        tris++;
        if (nx * Na[a] + ny * Na[a + 1] + nz * Na[a + 2] < 0) flip++;
      }
      }
    }
    let miss = 0, tot = 0, ex = null;
    for (const e of want) { const b0 = baseOf.get(key(e.p0[0], e.p0[1]) + ',' + e.p0[2].toFixed(1)) || 0;
      for (const v of e.V) {
        tot++;
        if (!VS.has(v[0].toFixed(1) + ',' + Math.fround(v[1] + b0).toFixed(1) + ',' + v[2].toFixed(1))) { miss++; if (!ex) ex = '(' + [v[0], v[1] + b0, v[2]].map((u) => u.toFixed(1)).join(',') + ')'; }
      } }
    ok('LOD2 の面が描かれる', want.length >= 300 && miss === 0, '300棟以上・面の点がすべて頂点に',
      want.length + '棟(データ' + L2.length + ')・点' + tot + '・欠け' + miss + (ex ? ' 例' + ex : ''));
    ok('建物の面が裏返らない', tris > 0 && flip === 0, '巻き順の法線=頂点の法線の側',
      'まとまり' + made + '・三角形' + tris + '・裏返り' + flip);
  }
}

/* ---- 4c1. 写真テクスチャ(2026-10-25 利用者指示:駅の周りの LOD2 の建物に PLATEAU の写真を貼る) -------------
   plateau_tex.js を検証側で独自に読み(PTX1 の形式。モデルの登録簿ではなくファイルそのもの)、描かれている LOD2 の建物
   (足跡の1点目で対応)のうち写真のある面について:
   ・面の点が写真の形(詰め合わせごとの Mesh)の頂点に、データと同じ位置・同じ u,v で描かれている(面の番号と写真がずれない)
   ・写真の形の材質は写真(map)を sRGB として読み、窓の材質(夜の明かり)で写真の面の印が立つ(昼の暗いガラスは塗らない)。
     シェーダの元の文字列で、写真の面では暗いガラスの式を飛ばす
   ・写真のある建物の中・遠の箱の色(インスタンスの色)は、データの写真の平均色をリニアで REF_PTX_GAIN 倍した色(±1。近くの写真の材質と同じ倍率)
   ・写真の材質の色(リニアの倍率)も REF_PTX_GAIN
   ・数:写真の面のある建物 400 棟以上・面 7,200 以上が描かれる(2026-11 から千歳烏山駅前広場南側地区の既存の建物を描かないので
     8,000→7,500。区域の LOD2 の建物 約40棟・650面が減った。さらに明大前駅前広場と補助第154号線の帯の既存の建物も描かないので 7,200。
     駅の近くの LOD2 の建物 約20棟・約300面が減った) */
{
  const fs = require('fs'), pth = require('path');
  const f = pth.join(pth.dirname(path), 'plateau_tex.js');
  const html = fs.readFileSync(path, 'utf8');
  const g = {};
  if (html.includes('<script src="plateau_tex.js">') && fs.existsSync(f) && L2_ALL) new Function('globalThis', fs.readFileSync(f, 'utf8'))(g);
  const T = g.PLATEAU_TEX;
  const REF_PTX_GAIN = 3.4;                  // 写真の明るさの倍率(リニア)。写真の壁の平均 sRGB 87 → 用途の色の約半分(CLAUDE.md)
  const s2l = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)), l2s = (v) => (v <= 0.0031308 ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055);
  const gainHex = (h) => [16, 8, 0].reduce((a, sh) => a | (Math.max(0, Math.min(255, Math.round(255 * l2s(Math.min(1, s2l(((h >> sh) & 255) / 255) * REF_PTX_GAIN))))) << sh), 0);
  if (T && T.uv64) {
    const w = Buffer.from(T.uv64, 'base64'); let o = 8; const TX = new Map();
    const byBi = new Map(L2_ALL.map((e) => [e.bi, e]));
    let bad = null;
    if (w.toString('latin1', 0, 4) !== 'PTX1') bad = '形式が PTX1 でない';
    const N = bad ? 0 : w.readUInt32LE(4);
    for (let k = 0; k < N && !bad; k++) {
      const bi = w.readUInt32LE(o), ns = w.readUInt16LE(o + 4), rgb = (w[o + 6] << 16) | (w[o + 7] << 8) | w[o + 8]; o += 9;
      const e = byBi.get(bi); if (!e || e.SF.length !== ns) { bad = '建物 ' + bi + ' の面の数が LOD2 と合わない'; break; }
      const S = [];
      for (let j = 0; j < ns; j++) {
        const a = w[o]; o++;
        if (a === 255) continue;
        const uv = [];
        // 描いた頂点は 32bit の浮動小数なので、同じ丸めで比べる(小数4桁の境で食い違わない)
        for (let i = 0; i < e.SF[j].length; i++) { uv.push([Math.fround(w.readUInt16LE(o) / 65535), Math.fround(w.readUInt16LE(o + 2) / 65535)]); o += 4; }
        S.push({ j: j, a: a, uv: uv });
      }
      TX.set(bi, { rgb: rgb, S: S, e: e });
    }
    if (!bad && o !== w.length) bad = 'データの長さが合わない';
    // 写真の形の頂点(位置 0.1m・u,v 1e-4)と材質
    const VT = new Set(); let nMesh = 0, mBad = null;
    for (const C of X.CITY_LODS) {
      if (!C.B.some((e) => e.l2)) continue;
      if (!C.m[0]) C.m[0] = C.make(C);
      for (const m of (C.mt || [])) {
        nMesh++;
        const ma = m.material, at = m.geometry.attributes;
        if (!(ma && ma.map && ma.map.encoding === 3001 && ma.userData && ma.userData.bldWin && ma.userData.bldWinPhoto && at.uv && at.aBld) && !mBad)
          mBad = '詰め合わせ ' + m.userData.ptx + ' の材質(写真の sRGB・窓の材質・写真の印・uv・aBld)';
        if (ma && ma.color && [ma.color.r, ma.color.g, ma.color.b].some((v) => Math.abs(v - REF_PTX_GAIN) > 1e-6) && !mBad)
          mBad = '詰め合わせ ' + m.userData.ptx + ' の材質の色(リニア)が ' + REF_PTX_GAIN + ' 倍でない';
        const Pa = at.position.array, Ua = at.uv ? at.uv.array : [];
        if (Ua.length !== Pa.length / 3 * 2) { if (!mBad) mBad = '詰め合わせ ' + m.userData.ptx + ' の u,v の数が頂点の数と合わない'; continue; }
        for (let i = 0; i < Pa.length / 3; i++)
          if (!(Number.isFinite(Ua[2 * i]) && Number.isFinite(Ua[2 * i + 1]))) { if (!mBad) mBad = '詰め合わせ ' + m.userData.ptx + ' の u,v が数でない(点 ' + i + ')'; break; }
          else VT.add(m.userData.ptx + '|' + Pa[3 * i].toFixed(1) + ',' + Pa[3 * i + 1].toFixed(1) + ',' + Pa[3 * i + 2].toFixed(1) + '|' + Ua[2 * i].toFixed(4) + ',' + Ua[2 * i + 1].toFixed(4));
      }
    }
    const shOK = /\(photo\?'':\s*'  vec3 wc=diffuseColor\.rgb/.test(X.BLD_WIN_SRC);   // 写真の面は昼の外装(窓・壁の模様)を塗らない
    // 描かれている LOD2 の建物で照合(足跡の1点目が同じ別の建物があるので、高さも合わせて対応を取る)
    const key = (x, z, h) => x.toFixed(1) + ',' + z.toFixed(1) + ',' + h.toFixed(1);
    const drawn = new Set(B.filter((e) => e.poly).map((e) => key(e.poly[0][0], e.poly[0][1], e.h)));
    const baseOf = new Map(B.filter((e) => e.poly).map((e) => [key(e.poly[0][0], e.poly[0][1], e.h), e.base || 0]));   // 基部(地形の上)
    let nB = 0, nS = 0, miss = 0, ex = null;
    for (const [bi, t] of TX) {
      if (!drawn.has(key(t.e.p0[0], t.e.p0[1], t.e.p0[2])) || !t.S.length) continue;
      nB++;
      const b0 = baseOf.get(key(t.e.p0[0], t.e.p0[1], t.e.p0[2])) || 0;
      for (const s of t.S) {
        nS++;
        const V = t.e.SF[s.j];
        for (let i = 0; i < V.length; i++) {
          const k = s.a + '|' + V[i][0].toFixed(1) + ',' + Math.fround(V[i][1] + b0).toFixed(1) + ',' + V[i][2].toFixed(1) + '|' + s.uv[i][0].toFixed(4) + ',' + s.uv[i][1].toFixed(4);
          if (!VT.has(k)) { miss++; if (!ex) ex = '建物 ' + bi + ' 面 ' + s.j + ' 点 ' + i + ' (' + k + ')'; break; }
        }
      }
    }
    // 中・遠の箱の色=写真の平均色(足跡の1点目と高さで対応)
    const rgbOf = new Map();
    for (const [bi, t] of TX) rgbOf.set(key(t.e.p0[0], t.e.p0[1], t.e.p0[2]), gainHex(t.rgb));
    let nC = 0, cBad = null;
    for (const C of X.CITY_LODS) {
      const im = C.m[1]; if (!im || !im.cols) continue;
      C.B.forEach((e, j) => {
        const want = e.l2 ? rgbOf.get(key(e.P[0][0], e.P[0][1], e.h)) : undefined;
        if (want === undefined || !TX.size) return;
        const got = im.cols[j]; nC++;
        const d = [16, 8, 0].map((sh) => Math.abs(((got >> sh) & 255) - ((want >> sh) & 255)));
        if (Math.max(...d) > 1 && !cBad) cBad = '(' + e.ox.toFixed(0) + ',' + e.oz.toFixed(0) + ') 箱の色 #' + (got >>> 0).toString(16) + ' ≠ 写真の平均色 #' + want.toString(16);
      });
    }
    ok('写真テクスチャ(LOD2 の面)', !bad && !mBad && shOK && miss === 0 && nB >= 400 && nS >= 7200 && !cBad && nC > 0,
      '面の点が写真の形に同じ u,v で・sRGB・窓の材質・昼のガラスを塗らない・箱の色=写真の平均色・400棟/7,200面以上',
      bad || mBad || cBad || (shOK ? '' : 'シェーダに写真の分岐が無い ') + (ex ? '欠け ' + miss + ' 例 ' + ex :
        nB + '棟・' + nS + '面・写真の形 ' + nMesh + '(詰め合わせ ' + (T.atlases || []).length + '枚)・箱の色 ' + nC + '棟'));
  }
}

/* ---- 4c2. 建物の窓と三角屋根(2026-10-12 利用者指示) -------------------------------------
   ・窓は壁の面にシェーダで描く:建物の全ての形(近く=頂点の aBld、中・遠の箱=インスタンスの iBld)が窓の材質(bldWin)で描かれる
   ・窓は壁の上端より上に出ない:近くの形の壁の三角形で、窓の上端の基準(aBld の2番目)がその三角形の最も高い点を超えない
     (以前は夜だけ外接矩形の殻に窓を貼っていたので、L字や三角屋根の建物では壁の無い所・軒より上に窓が光っていた)
   ・三角屋根(傾いた屋根面)は灰色:上向きで傾いた面(法線の上成分 0.3〜0.97)の色の彩度が低く暗い。戸建ての切妻屋根が十分ある */
{
  let bM = null, nM = 0, bT = null, nW = 0, nR = 0, bR = null; const WG = new Map();
  for (const C of X.CITY_LODS) {
    for (const m of [C.m[1], C.m[2]]) {
      if (!m) continue; nM++;
      if (!(m.material && m.material.userData && m.material.userData.bldWin) || !m.geometry.attributes.iBld) { if (!bM) bM = '箱のインスタンス'; }
    }
    if (!C.m[0]) C.m[0] = C.make(C);
    for (const m of [C.m[0]].concat(C.mt || [])) {               // 写真の形(詰め合わせごと)にも窓の材質(夜の明かり)
    nM++;
    const g = m.geometry, Pa = g.attributes.position.array, Na = g.attributes.normal.array, Ca = g.attributes.color ? g.attributes.color.array : null, A = g.attributes.aBld, Ia = g.index.array;
    if (!(m.material && m.material.userData && m.material.userData.bldWin) || !A || A.array.length / 4 !== Pa.length / 3) { if (!bM) bM = m.userData.ptx !== undefined ? '写真の形' : '近くの形'; continue; }
    for (let t = 0; t < Ia.length; t += 3) {
      const v = [Ia[t], Ia[t + 1], Ia[t + 2]], ny = Na[v[0] * 3 + 1];
      if (Math.abs(ny) < 0.5) {                       // 壁:同じ面(種・向き・上端の基準が同じ三角形)ごとに最も高い点を集める
        nW++;
        const top = A.array[v[0] * 4 + 1], my = Math.max(...v.map((k) => Pa[k * 3 + 1]));     // aBld=(種類,上端,種,基部)
        const kk = A.array[v[0] * 4 + 2] + '|' + top.toFixed(3) + '|' + Na[v[0] * 3].toFixed(2) + ',' + Na[v[0] * 3 + 2].toFixed(2);
        const q = WG.get(kk); if (!q || q.my < my) WG.set(kk, { my: my, top: top, x: Pa[v[0] * 3], z: Pa[v[0] * 3 + 2] });
      } else if (Ca && ny > 0.3 && ny < 0.97) {       // 傾いた屋根面(写真の屋根は写真の色)
        nR++;
        const c = [0, 1, 2].map((k) => Ca[v[0] * 3 + k]), mx = Math.max(...c), mn = Math.min(...c), lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
        if ((mx - mn > 0.25 * mx || lum > 0.25) && !bR) bR = 'rgb(' + c.map((u) => u.toFixed(2)).join(',') + ')';
      }
    }
    }
  }
  for (const q of WG.values()) if (q.top > q.my + 0.001 && !bT) bT = '(' + q.x.toFixed(0) + ',' + q.z.toFixed(0) + ') 窓の上端の基準 ' + q.top.toFixed(2) + ' > 壁 ' + q.my.toFixed(2);
  ok('建物の窓(壁の面に)', bM === null && nM > 0, '近く・中・遠の全ての形が窓の材質', bM ? bM + 'に窓が無い' : nM + '形');
  ok('窓は壁の上端より上に出ない', bT === null && nW > 0, '壁の面の最も高い点以下', bT || '壁の三角形 ' + nW + '・面 ' + WG.size);
  const nG = B.filter((e) => e.roof === '切妻').length;
  /* 窓の数(2026-10-12 利用者指示:多すぎる・北向きの壁は少なく)。シェーダと同じ式 bldFacadeAt(2026-10-29 から。壁ごとの柱間・階)を
     検証側で作った壁(長さ 4〜16m・3階分・種 0〜96)の上で数える。
     検証側の決まり:戸建ての南向きの壁で窓(ガラスと枠)は 10% 以下、北向きは南向きの半分以下。共同住宅・業務も北は南より少ない。
     シェーダが向きで間引いていること(文字列に北の成分の式)も見る */
  if (X.bldFacadeAt) {
    const dens = (wt, fs, nx, nz) => { let a = 0, n = 0; const l = Math.hypot(nx, nz), tx = -nz / l, tz = nx / l;
      for (let L = 4; L <= 16; L += 0.5) for (let sd = 0; sd < 97; sd += 7) for (let u = 0.05; u < L; u += 0.1) for (let y = 0.05; y < 9; y += 0.1) {
        n++; const k = X.bldFacadeAt({ wt: wt, fs: fs, u: u, L: L, yr: y, H: 9, fh: X.BLD_WIN[wt][2], fl: 0, seed: sd, tx: tx, tz: tz, nz: nz / l, far: false }).k; if (k === 1 || k === 2) a++; }
      return a / n; };
    const D = [[0, 0], [1, 3], [2, 3]].map(([t, f]) => ({ s: dens(t, f, 0, 1), n: dens(t, f, 0, -1), e: dens(t, f, 1, 0) }));
    const shOK = /clamp\(-nz,0\.,1\.\)/.test(X.BLD_WIN_SRC) && /hc<pd\) return/.test(X.BLD_WIN_SRC);
    ok('窓は少なめ・北向きはさらに少ない', D[0].s <= 0.10 && D[0].n <= 0.5 * D[0].s && D[1].n < D[1].s && D[2].n < D[2].s && D[0].s > 0.03 && shOK,
      '戸建ての南 ≤10%・北 ≤ 南の半分・共同住宅と業務も 北<南・シェーダが向きで間引く',
      D.map((d, i) => ['戸建て', '共同住宅', '業務'][i] + ' 南' + (d.s * 100).toFixed(1) + '% 北' + (d.n * 100).toFixed(1) + '% 東' + (d.e * 100).toFixed(1) + '%').join(' / ') + (shOK ? '' : ' シェーダに向きの式が無い'));
  }
  ok('三角屋根は灰色', bR === null && nR > 0 && (B.some((e) => e.plateau) ? nG >= 1000 : true), '傾いた屋根面は暗い灰・切妻屋根 1000棟以上', bR || '屋根面 ' + nR + '・切妻 ' + nG + '棟');
}

/* ---- 4c4. 建物の外装(2026-10-29 利用者指示:建物の側面が黒い四角い窓だけ) --------------------------------------------
   検証側の決まり(値はモデルから読まない。データは plateau_bldg.js を検証側で読む):
   (a) 建物構造(str64)と地上階数(PLT1 の階数。9999=不明は 0)が登録簿の建物と一致し、外装は構造に合う
       (耐火=RC・タイル・カーテンウォール/準防火=ALC・サイディング・RC/防火造=サイディング・モルタル/木造=板張り・モルタル/倉庫・工場=金属)。
       外装は5種類以上が 2% 以上ずつ使われる
   (b) 窓の段の数=階数:階数の分かる戸建て・共同住宅で、壁(長さ 10・14・18m・南向き。壁の属性に階数を入れる=印の 128 倍)の窓の段の数が
       階数以下、85% 以上で階数と同じ
   (c) 窓は壁の両端から 0.3m 以上離れる(角で窓が切れない)。1.7m より短い壁に窓は無い
   (d) 1階:戸建て(店舗併用でない)は玄関の扉の壁がちょうど1つ、扉は幅 0.7〜1.0m。道路に面した壁がある家の扉は道路に面した壁(95% 以上。
       道路に面するかは検証側が ROADS_PL の面で、壁の中ほどから外へ 2.5m か 5m)。店の壁は1階の 90% 以上がガラスかシャッターで上に看板
   (e) 付属物:バルコニー・室外機・雨どいは自分の足跡の外 1.3m 以内で、ほかの建物の足跡・道路の面に入らない(0.05m の余裕)。
       バルコニーの印のある壁にはバルコニーの床がある。屋上の室外機は足跡の 0.9m 内。付属物の形は近く(ATT_NEAR)だけ描く
   (f) シェーダ:外装8種の模様・番号の丸め・ガラスの映り込み・店と看板の夜の灯り・パラペットの内側(番号が負)が外装を描かない */
{
  const REF_F = { DOOR_W: [0.7, 1.0], ROWS_OK: 0.85, END: 0.3, WALL_MIN: 1.7, ATT_OUT: 1.3, ATT_GAP: 0.05, ROOF_IN: 0.9, ROAD_DOOR: 0.95, SHOP_FRAC: 0.9,
    STYLE: { 1: [3, 4, 7], 2: [2, 0, 3], 3: [0, 1], 4: [5, 1] }, STYLE_MIN: 5 };
  const fs = require('fs'), pth = require('path'), f = pth.join(pth.dirname(path), 'plateau_bldg.js');
  const FA = X.bldFacadeAt;
  const twAt = (nx, nz) => { const l = Math.hypot(nx, nz) || 1; return { tx: -nz / l, tz: nx / l, nz: nz / l }; };
  // (a)
  if (fs.readFileSync(path, 'utf8').includes('<script src="plateau_bldg.js">') && fs.existsSync(f)) {
    const g = {}; new Function('globalThis', fs.readFileSync(f, 'utf8'))(g); const D = g.PLATEAU_BLDG;
    const b = Buffer.from(D.b64, 'base64'), st = D.str64 ? Buffer.from(D.str64, 'base64') : null, N = b.readUInt32LE(4); let o = 8; const M = new Map();
    for (let n = 0; n < N; n++) { const nv = b.readUInt8(o), h = b.readUInt16LE(o + 1) / 10, sto = b.readUInt8(o + 3); o += 4;
      const kk = (b.readInt32LE(o) / 10).toFixed(1) + ',' + (b.readInt32LE(o + 4) / 10).toFixed(1) + ',' + h.toFixed(1); if (!M.has(kk)) M.set(kk, []); M.get(kk).push([st ? st[n] : -1, sto]); o += 8 + 4 * (nv - 1); }
    let n = 0, bad = null, bs = null; const cnt = new Map();
    for (const e of B) {
      if (!e.plateau || !e.poly) continue; const w = M.get(e.poly[0][0].toFixed(1) + ',' + e.poly[0][1].toFixed(1) + ',' + e.h.toFixed(1)); if (!w) continue; n++;
      if (!w.some((q) => q[0] === e.stc && q[1] === e.st) && !bad) bad = '(' + e.x.toFixed(0) + ',' + e.z.toFixed(0) + ') 構造' + e.stc + '・階数' + e.st + ' ≠ データ ' + w.map((q) => q.join('/')).join(' ');
      const want = e.wt === 3 ? [6] : REF_F.STYLE[e.stc];
      if (want && !e.lod2 && !want.includes(e.fs) && !bs) bs = '(' + e.x.toFixed(0) + ',' + e.z.toFixed(0) + ') 構造' + e.stc + 'に外装' + e.fs;
      cnt.set(e.fs, (cnt.get(e.fs) || 0) + 1);
    }
    const used = [...cnt.entries()].filter(([, c]) => c >= 0.02 * n).length;
    ok('建物の構造・階数・外装', !!st && bad === null && bs === null && n > 10000 && used >= REF_F.STYLE_MIN, 'データと一致・外装は構造に合う・' + REF_F.STYLE_MIN + '種以上が 2% 以上',
      (!st ? 'str64 が無い' : bad || bs || n + '棟・外装 ' + [...cnt.entries()].sort((p, q) => p[0] - q[0]).map(([k, c]) => k + ':' + c).join(' ')));
  }
  if (FA) {
    // (b) 窓の段の数
    let nB = 0, nEq = 0, over = null;
    for (const e of B) {
      if (!e.plateau || !(e.st > 0) || e.wt > 1 || e.lod2) continue;
      const H = e.eave; let rows = new Set();
      for (const L of [10, 14, 18]) for (let u = 0.05; u < L; u += 0.1) for (let y = 0.05; y < H; y += 0.1) {
        const r = FA({ wt: e.wt, fs: e.fs, u: u, L: L, yr: y, H: H, fh: e.fh, fl: 128 * Math.min(e.st, 60), seed: e.seed !== undefined ? e.seed : 0, tx: -1, tz: 0, nz: 1, far: false });
        if (r.k === 1 || r.k === 2) rows.add(r.f); }
      nB++; if (rows.size === e.st) nEq++; if (rows.size > e.st && !over) over = '(' + e.x.toFixed(0) + ',' + e.z.toFixed(0) + ') 階数' + e.st + 'に窓が' + rows.size + '段';
      if (nB >= 600) break;
    }
    ok('窓の段の数=階数', nB >= 300 && over === null && nEq >= REF_F.ROWS_OK * nB, '階数以下・' + (REF_F.ROWS_OK * 100) + '% 以上で同じ', over || nEq + '/' + nB + '棟');
    // (c) 壁の端
    let bE = null, nE = 0;
    for (let wt = 0; wt < 4; wt++) for (const fs2 of [0, 3, 7]) for (let L = 0.6; L <= 20; L += 0.35) for (let sd = 0; sd < 97; sd += 13) for (const [nx, nz] of [[0, 1], [1, 0], [0, -1]]) {
      const T = twAt(nx, nz);
      for (let y = 0.6; y < 12; y += 0.25) for (const u of [0.02, 0.15, 0.29, L - 0.29, L - 0.15, L - 0.02, L * 0.5]) {
        if (u < 0 || u > L) continue; nE++;
        const k = FA({ wt: wt, fs: fs2, u: u, L: L, yr: y, H: 12, fh: X.BLD_WIN[wt][2], fl: 0, seed: sd, tx: T.tx, tz: T.tz, nz: T.nz, far: false }).k;
        if ((k === 1 || k === 2) && (u < REF_F.END || u > L - REF_F.END || L < REF_F.WALL_MIN) && !bE) bE = '種類' + wt + ' 長さ' + L.toFixed(2) + ' u=' + u.toFixed(2); } }
    ok('窓は壁の端に掛からない', bE === null && nE > 1000, '両端から ' + REF_F.END + 'm・' + REF_F.WALL_MIN + 'm 未満の壁に窓なし', bE || nE + '点');
    // (d) 1階:扉・店。道路に面するかは検証側で(ROADS_PL の地表の道路)
    const ground = X.ROADS_PL.filter((R) => !(R.k === 2 && R.sec === 2));
    const inPolyR = (P, x, z) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b2 = P[j]; if ((a[1] > z) !== (b2[1] > z) && x < (b2[0] - a[0]) * (z - a[1]) / (b2[1] - a[1]) + a[0]) c = !c; } return c; };
    const RG = new Map(); for (const R of ground) for (let gx = Math.floor(R.bb[0] / 30); gx <= Math.floor(R.bb[1] / 30); gx++) for (let gz = Math.floor(R.bb[2] / 30); gz <= Math.floor(R.bb[3] / 30); gz++) { const k = gx + ',' + gz; if (!RG.has(k)) RG.set(k, []); RG.get(k).push(R); }
    const onRoad = (x, z) => (RG.get(Math.floor(x / 30) + ',' + Math.floor(z / 30)) || []).some((R) => x >= R.bb[0] && x <= R.bb[1] && z >= R.bb[2] && z <= R.bb[3] && inPolyR(R.P, x, z));
    const roadW = (w) => { const mx = (w.a[0] + w.d[0]) / 2, mz = (w.a[1] + w.d[1]) / 2; return w.L >= 2.2 && [2.5, 5].some((t) => onRoad(mx + w.nx * t, mz + w.nz * t)); };
    let nH = 0, bD = null, nRoadH = 0, nRoadDoor = 0, nS = 0, bS = null, dW = [];
    for (const C of X.CITY_LODS) {
      if (!C.m[0]) C.m[0] = C.make(C);
      for (const e of C.B) {
        if (!e.walls) continue;
        const shop = e.use === 2 || e.use === 5;
        if (e.wt === 0 && !(shop && e.walls.some((w) => w.fl & 2))) {
          if (!e.walls.some((w) => w.L >= 2.2)) continue;
          nH++; const dws = e.walls.filter((w) => w.fl & 1);
          if (dws.length !== 1) { if (!bD) bD = '(' + e.cx.toFixed(0) + ',' + e.cz.toFixed(0) + ') 扉の壁 ' + dws.length; continue; }
          const w = dws[0], T = twAt(w.nx, w.nz), g0 = X.FS_G0[e.fs];
          let run = 0, best = 0; for (let u = 0; u <= w.L; u += 0.01) { const k = FA({ wt: 0, fs: e.fs, u: u, L: w.L, yr: g0 + 1.0, H: e.eave, fh: e.fh, fl: w.fl, seed: e.seed, tx: T.tx, tz: T.tz, nz: T.nz, far: false }).k; if (k === 3) { run += 0.01; best = Math.max(best, run); } else run = 0; }
          dW.push(best); if ((best < REF_F.DOOR_W[0] || best > REF_F.DOOR_W[1]) && !bD) bD = '(' + e.cx.toFixed(0) + ',' + e.cz.toFixed(0) + ') 扉の幅 ' + best.toFixed(2);
          if (e.walls.some(roadW)) { nRoadH++; if (roadW(w)) nRoadDoor++; }
        }
        for (const w of e.walls) if (w.fl & 2) {
          nS++; const T = twAt(w.nx, w.nz); let a = 0, n = 0, sg = 0;
          for (let u = 0.35; u < w.L - 0.35; u += 0.05) { n++; const k = FA({ wt: e.wt, fs: e.fs, u: u, L: w.L, yr: 1.5, H: e.eave, fh: e.fh, fl: w.fl, seed: e.seed, tx: T.tx, tz: T.tz, nz: T.nz, far: false }).k; if (k === 4 || k === 6 || k === 2) a++;
            const gs = Math.min(X.FS_G0[e.fs] + e.fh - 0.5, 2.8); if (FA({ wt: e.wt, fs: e.fs, u: u, L: w.L, yr: gs + 0.3, H: e.eave, fh: e.fh, fl: w.fl, seed: e.seed, tx: T.tx, tz: T.tz, nz: T.nz, far: false }).k === 5) sg++; }
          if ((a < REF_F.SHOP_FRAC * n || sg < 0.9 * n) && !bS) bS = '(' + e.cx.toFixed(0) + ',' + e.cz.toFixed(0) + ') 店の1階 ' + (a / n * 100).toFixed(0) + '%・看板 ' + (sg / n * 100).toFixed(0) + '%';
        }
      }
    }
    dW.sort((p, q) => p - q);
    ok('玄関の扉(戸建て)', nH > 3000 && bD === null && nRoadDoor >= REF_F.ROAD_DOOR * nRoadH, '扉の壁が1つ・幅 ' + REF_F.DOOR_W.join('〜') + 'm・道路に面した壁(' + (REF_F.ROAD_DOOR * 100) + '%)',
      bD || nH + '棟・扉の幅 ' + dW[0].toFixed(2) + '〜' + dW[dW.length - 1].toFixed(2) + 'm・道路側 ' + nRoadDoor + '/' + nRoadH);
    ok('店の1階(ガラス・シャッター・看板)', nS > 100 && bS === null, '1階の ' + (REF_F.SHOP_FRAC * 100) + '% 以上がガラスかシャッター・上に看板', bS || nS + '壁');
    // (e) 付属物
    const BG = new Map(); B.forEach((e, i) => { if (!e.poly) return; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const p of e.poly) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
      e.__bb = [x0, x1, z0, z1]; for (let gx = Math.floor(x0 / 26); gx <= Math.floor(x1 / 26); gx++) for (let gz = Math.floor(z0 / 26); gz <= Math.floor(z1 / 26); gz++) { const k = gx + ',' + gz; if (!BG.has(k)) BG.set(k, []); BG.get(k).push(e); } });
    const ownOf = (C, bi) => { const P = C.B[bi].P; return B.find((e) => e.poly === P); };
    let nA = 0, bA = null, nBal = 0, bW = null; const kinds = new Map();
    for (const C of X.CITY_LODS) {
      const att = X.attBoxes ? X.attBoxes(C) : [];
      const slab = new Set(att.filter((a) => a.kind === 'バルコニー').map((a) => a.bi));
      C.B.forEach((e, bi) => { if (e.walls && e.walls.some((w) => w.fl & 24) && !slab.has(bi) && !bW) bW = '(' + e.cx.toFixed(0) + ',' + e.cz.toFixed(0) + ') バルコニーの印の壁に床が無い'; });
      for (const a of att) {
        nA++; kinds.set(a.kind, (kinds.get(a.kind) || 0) + 1); if (a.kind === 'バルコニー') nBal++;
        const own = ownOf(C, a.bi); if (!own) { bA = bA || '付属物の建物が登録簿に無い'; continue; }
        const pts = []; for (let i = 0; i < 4; i++) { const p = a.c[i], q = a.c[(i + 1) % 4]; for (let t = 0; t < 1; t += 0.25) pts.push([p[0] + (q[0] - p[0]) * t, p[1] + (q[1] - p[1]) * t]); }
        for (const [x, z] of pts) {
          const dOwn = polyDist(own.poly, x, z);
          if (a.kind === '屋上の室外機' || a.kind === '高置水槽' || a.kind === '屋上の看板') { if (dOwn > -REF_F.ROOF_IN + 0.01 && !bA) bA = a.kind + ' (' + x.toFixed(1) + ',' + z.toFixed(1) + ') 足跡の縁から ' + (-dOwn).toFixed(2) + 'm'; continue; }
          if (dOwn > REF_F.ATT_OUT + 0.01 && !bA) bA = a.kind + ' (' + x.toFixed(1) + ',' + z.toFixed(1) + ') 足跡から ' + dOwn.toFixed(2) + 'm';
          for (const o2 of (BG.get(Math.floor(x / 26) + ',' + Math.floor(z / 26)) || [])) if (o2 !== own && (o2.base || 0) + o2.h > a.y0 + 0.01 && x > o2.__bb[0] - 1 && x < o2.__bb[1] + 1 && z > o2.__bb[2] - 1 && z < o2.__bb[3] + 1 && polyDist(o2.poly, x, z) < -REF_F.ATT_GAP && !bA)
            bA = a.kind + ' (' + x.toFixed(1) + ',' + z.toFixed(1) + ') がほかの建物の足跡の中';
          if (dOwn > REF_F.ATT_GAP && onRoad(x, z) && polyDist(own.poly, x, z) > 0 && !bA) {
            // 道路の縁から 0.05m より中か(縁に接するのは許す)
            const near = (RG.get(Math.floor(x / 30) + ',' + Math.floor(z / 30)) || []).some((R) => inPolyR(R.P, x, z) && -polyDist(R.P, x, z) > REF_F.ATT_GAP);
            if (near) bA = a.kind + ' (' + x.toFixed(1) + ',' + z.toFixed(1) + ') が道路の上'; }
        }
      }
    }
    ok('付属物(バルコニー・室外機・雨どい)', nA > 2000 && nBal > 100 && bA === null && bW === null, '足跡の外 ' + REF_F.ATT_OUT + 'm 以内・ほかの建物と道路に入らない・印の壁に床',
      bA || bW || nA + '個(' + [...kinds.entries()].map(([k, c]) => k + c).join('・') + ')');
    // 付属物の形は近くだけ:升(ATT_CELL)ごとに、升の外接球の縁から ATT_NEAR の内で描き、遠くでは描かない。升の外接球は記録を包む。
    // 形の頂点は記録の数どおり(箱 16/20・屋上の室外機 20・四角形 4)・外装は描かない。近くの形の段を離れたら捨てる
    { let bL = null, nL = 0, nC = 0; const cp = X.camera.position.clone(), AD = X.ATT_NEAR * X.LOD_STRUCT;
      for (const C of X.CITY_LODS.slice(0, 40)) { if (!C.attS) continue; nL++;
        if (!C.attC || !C.attC.length) { bL = bL || '升が無い'; continue; }
        const seen = new Set(); for (const a of C.attC) for (const i of a.I) seen.add(i);
        if (seen.size !== C.attS.length / 19) bL = bL || '升に入らない記録がある(' + seen.size + '/' + C.attS.length / 19 + ')';
        for (const a of C.attC.slice(0, 6)) { nC++;
          // 升の外接球が記録の箱の隅を包む
          for (const i of a.I) { const S = C.attS; if (S[i] !== 0) continue; const W = (u, v) => [S[i + 3] + S[i + 5] * u + S[i + 7] * v, S[i + 4] + S[i + 6] * u + S[i + 8] * v];
            for (const [x, z] of [W(S[i + 9], S[i + 11]), W(S[i + 10], S[i + 12])]) for (const y of [S[i + 13], S[i + 14]]) if (Math.hypot(x - a.x, y - a.y, z - a.z) > a.r + 1e-3) { bL = bL || '升の外接球が箱を包まない'; } }
          X.camera.position.set(a.x, a.y + 2, a.z); X.cityLod();
          if (!(a.ma && a.ma.visible) && !bL) bL = '升の中で描かない';
          if (a.ma && !bL) { const n = a.ma.geometry.attributes.position.array.length / 3, ab = a.ma.geometry.attributes.aBld.array;
            let ne = 0; for (const i of a.I) ne += C.attS[i] === 1 ? 4 : (C.attS[i + 18] ? 24 : 20) - (C.attS[i + 1] >= 5 ? 0 : 4);   // 壁の側の面は描かない(屋上の物=室外機・高置水槽・看板は描く)
            if (n !== ne) bL = '形の頂点 ' + n + ' が記録(' + ne + ')と違う'; for (let i = 0; i < ab.length; i += 4) if (ab[i] > -0.5) { bL = bL || '付属物に外装を描く'; break; } }
          X.camera.position.set(a.x + a.r + AD + 20, a.y, a.z); X.cityLod(); if (a.ma && a.ma.visible && !bL) bL = '升から遠くでも描く';
          X.camera.position.set(a.x + a.r + 2 * AD + 20, a.y, a.z); X.cityLod(); if (a.ma && !bL) bL = '升から遠くても捨てない'; }
        X.camera.position.set(C.x, C.y, C.z); X.cityLod();
        X.camera.position.set(C.x + C.r + C.near * X.LOD_STRUCT + 40, C.y, C.z); X.cityLod(); if (C.attC.some((a) => a.ma) && !bL) bL = '近くの形の段を離れても捨てない'; }
      X.camera.position.copy(cp); X.cityLod();
      ok('付属物は近くだけ描く', bL === null && nL > 10 && nC > 50, '升の外接球の縁から ' + X.ATT_NEAR + 'm 以内・その2倍より遠いと捨てる', bL || nL + 'まとまり・' + nC + '升'); }
    // (f) シェーダ
    const SRC = X.BLD_WIN_SRC, need = [['外装8種', /fs<\.5\)\{ float l=fract\(yr\/\.455\)/], ['番号の丸め', /seed=floor\(vBld\.z\+\.5\)/], ['ガラスの映り込み', /reflect\(V,Nn\)/],
      ['店と看板の夜の灯り', /bwK>4\.5&&bwK<5\.5\) totalEmissiveRadiance/], ['番号が負の面は描かない', /vBld\.x>-\.5&&abs\(vBN\.y\)<\.5/], ['箱のバルコニー', /wn\.z>\.35&&wl>=5\./]];
    const miss = need.filter(([, r]) => !r.test(SRC)).map(([n]) => n);
    for (const k of ['fs<1.5', 'fs<2.5', 'fs<3.5', 'fs<4.5', 'fs<5.5', 'fs<6.5']) if (!SRC.includes('else if(' + k + ')')) miss.push('外装 ' + k);
    // パラペットの内側の面(番号が負)が近くの形にある
    let nPar = 0; for (const C of X.CITY_LODS) { const m = C.m[0]; if (!m) continue; const A = m.geometry.attributes.aBld.array, Na = m.geometry.attributes.normal.array; for (let i = 0; i < A.length / 4; i++) if (A[4 * i] < -0.5 && Math.abs(Na[3 * i + 1]) < 0.5) nPar++; }
    ok('外装のシェーダ・パラペット', miss.length === 0 && nPar > 1000, '模様・丸め・映り込み・夜の灯り・負の番号・箱のバルコニー・パラペットの内側', miss.length ? '無い:' + miss.join('・') : 'パラペットの頂点 ' + nPar);
  }
}

/* ---- 4c3. 木の形(2026-10-12 利用者指示:単純すぎて浮いている) ------------------------------------
   まとまりごとの遠くの形と、全部の木で1つの近くの形(CITY.treeNear。2026-11 に木ごとの切り替えへ)。近くは樹冠の塊が3つ以上
   (三角形が遠くの2倍以上)、季節の色(インスタンスの色)は樹冠だけ(幹 aTint=0 は暗い茶のまま)、樹冠は占有半径(sc=1 で 2.3m)の内。
   木ごとの切り替え:カメラを木の脇に置いて treeLod を呼ぶと、カメラから 150m(TREE_NEAR)×LOD_STRUCT 以内の木(検証側で数える)だけが
   近くの形にあり、その木は遠くの形で大きさ 0(位置はそのまま)、それより遠い木は遠くの形で大きさがある */
{
  let bad = null, n = 0;
  const TC = X.CITY.treeChunks, NM = X.CITY.treeNear;
  for (const c of TC.values()) {
    n++;
    if (!c.m || !NM) { bad = '近く/遠くの形が無い'; break; }
    const gN = NM.geometry, gF = c.m.geometry, tN = gN.index.array.length / 3, tF = gF.index.array.length / 3;
    if (!gN.attributes.aTint || !gF.attributes.aTint) { bad = '樹冠の印(aTint)が無い'; break; }
    if (!(tF > 0) || tN < 2 * tF) { bad = '近くの形が粗い ' + tN + '/' + tF; break; }
    const P = gN.attributes.position.array, T = gN.attributes.aTint.array, C = gN.attributes.color.array;
    let rx = 0, trunk = null;
    for (let i = 0; i < T.length; i++) {
      if (T[i] > 0.5) rx = Math.max(rx, Math.hypot(P[i * 3], P[i * 3 + 2]));
      else if (C[i * 3] > 0.3 || C[i * 3] < C[i * 3 + 2]) trunk = 'rgb(' + C[i * 3].toFixed(2) + ',' + C[i * 3 + 1].toFixed(2) + ',' + C[i * 3 + 2].toFixed(2) + ')';
    }
    if (rx > 2.3 + 1e-6) { bad = '樹冠の半径 ' + rx.toFixed(2) + 'm > 2.3'; break; }
    if (trunk) { bad = '幹の色 ' + trunk; break; }
  }
  ok('木の形(近く・遠く・樹冠)', bad === null && n > 0, '近くは遠くの2倍以上・樹冠は半径2.3m 内・幹は茶', bad || n + 'まとまり');
  // 木ごとの近く/遠く
  { let bad2 = null, want = 0; const R = 150 * X.LOD_STRUCT, Tr = X.CITY.trees, t0 = Tr[Math.floor(Tr.length / 2)];
    X.camera.position.set(t0.x + 3, t0.y + 2, t0.z + 3); X.CITY.treeLod();
    const nearP = new Set(); for (let i = 0; i < NM.count; i++) { const q = NM.mats[i]; if (q) nearP.add(q.p.x.toFixed(2) + ',' + q.p.z.toFixed(2)); }
    for (const t of Tr) { const d = Math.hypot(t.x - X.camera.position.x, t.y - X.camera.position.y, t.z - X.camera.position.z), inN = d < R, c = TC.get(t.ci), q = c.m.mats[t.j];
      if (inN) want++;
      if (bad2) continue;
      if (!q || Math.abs(q.p.x - t.x) > 1e-3 || Math.abs(q.p.z - t.z) > 1e-3) bad2 = '遠くの形の木 (' + t.x.toFixed(1) + ',' + t.z.toFixed(1) + ') の位置';
      else if (inN && !(q.s && q.s.x === 0)) bad2 = '近い木 (' + t.x.toFixed(1) + ',' + t.z.toFixed(1) + ') が遠くの形にも残る';
      else if (!inN && !(q.s && q.s.x > 0)) bad2 = '遠い木 (' + t.x.toFixed(1) + ',' + t.z.toFixed(1) + ') が遠くの形で大きさ 0';
      else if (inN !== nearP.has(t.x.toFixed(2) + ',' + t.z.toFixed(2))) bad2 = '木 (' + t.x.toFixed(1) + ',' + t.z.toFixed(1) + ') の近くの形 ' + (inN ? '無し' : '有り'); }
    if (!bad2 && NM.count !== want) bad2 = '近くの形 ' + NM.count + '本・検証側 ' + want + '本';
    X.camera.position.set(0, 0, 0);
    ok('木の近く/遠く(木ごと)', bad2 === null && want > 5, 'カメラから ' + R.toFixed(0) + 'm 以内の木だけ近くの形・その木は遠くの形で大きさ 0', bad2 || '近く ' + want + '本'); }
}

/* ---- 4d. 建物の色は用途で ------------------------------------------------------
   plateau_bldg.js の用途(use64)を検証側で読み、登録簿の建物(足跡の1点目で対応)の用途がデータと一致し、
   住宅・業務・工場倉庫の色の組が互いに重ならない(用途で塗り分けている)ことを見る */
{
  const fs = require('fs'), pth = require('path');
  const f = pth.join(pth.dirname(path), 'plateau_bldg.js');
  const g = {};
  if (fs.readFileSync(path, 'utf8').includes('<script src="plateau_bldg.js">') && fs.existsSync(f)) new Function('globalThis', fs.readFileSync(f, 'utf8'))(g);
  const D = g.PLATEAU_BLDG;
  if (D && D.use64) {
    const b = Buffer.from(D.b64, 'base64'), u = Buffer.from(D.use64, 'base64'); const N = b.readUInt32LE(4); let o = 8; const use = new Map();
    // 足跡の1点目と高さで対応を取る(1点目が同じ別の建物がある)
    for (let n = 0; n < N; n++) { const nv = b.readUInt8(o), h = b.readUInt16LE(o + 1) / 10; o += 4; const kk = (b.readInt32LE(o) / 10).toFixed(1) + ',' + (b.readInt32LE(o + 4) / 10).toFixed(1) + ',' + h.toFixed(1); if (!use.has(kk)) use.set(kk, new Set()); use.get(kk).add(u[n]); o += 8 + 4 * (nv - 1); }
    let mis = 0, n = 0, ex = null; const cols = new Map();
    for (const e of B) {
      if (!e.poly) continue;
      const k = e.poly[0][0].toFixed(1) + ',' + e.poly[0][1].toFixed(1) + ',' + e.h.toFixed(1), want = use.get(k);
      if (want === undefined) continue;
      n++;
      if (!want.has(e.use)) { mis++; if (!ex) ex = k + ' 用途' + e.use + '≠' + [...want].join('/'); }
      let s = cols.get(e.use); if (!s) { s = new Set(); cols.set(e.use, s); } s.add(e.hex);
    }
    const grp = REF.USE_GROUPS.map((G) => { const s = new Set(); for (const k of G) for (const h of (cols.get(k) || [])) s.add(h); return s; });
    let ov = null;
    for (let i = 0; i < grp.length; i++) for (let j = i + 1; j < grp.length; j++) for (const h of grp[i]) if (grp[j].has(h) && !ov) ov = '組' + i + 'と組' + j + 'に同じ色 ' + h;
    ok('建物の色は用途で', mis === 0 && ov === null && grp.every((s) => s.size > 0), '用途がデータと一致・住宅/業務/工場倉庫の色が別',
      ex || ov || n + '棟・色の組 ' + grp.map((s) => s.size).join('/'));
  }
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

/* ---- 6. 交差鉄道の列車と線路 ---------------------------------------------
   線路の位置は RAW.rail の tr(国土地理院のベクトルタイルの軌道の中心線)。検証側の曲線 XC で測る:
   ・敷いたレール(MAT.rail・MAT.railRust の頂点のうち交差鉄道の範囲で低い物)が、最も近い線路の中心線から (軌間+頭部の幅)/2 の所にある
   ・描いた車両の台車の中心(車輪の頂点を車両ごと・台車ごとに平均)が線路の中心線の上にある
   ・左側通行(もう一方の線路が進行方向の右)。世田谷線は渡り線の範囲(REF.SETA_XO_ZONE)より南で(終端の側は折り返すので上下とも使う)
   ・車輪の左右の間隔=軌間、車輪の下端=レール頭頂面、描いた頂点が線路の範囲の上、明大前・下高井戸に停車 */
{
  const railTop = X.XR.RAILY + X.XR.RAILH / 2;    // レール頭頂面(検証側で計算)
  X.stepXRail(3.0);                                // 実際に走らせてから測る
  const inoG = X.inoTrains.map((t) => t.g), setaG = X.setaTrain.g, allG = inoG.concat([setaG]);
  const kind = { 井の頭線: { A: XC.INO, gauge: X.GAUGE_INO, u0: X.XR.U0, u1: X.XR.U1 }, 世田谷線: { A: XC.SETA, gauge: X.GAUGE_SETA, u0: X.XR.SETA_U0, u1: X.XR.SETA_U1 } };
  /* 2026-11 から車両は1両ずつの群(makeXCar。8000系と同じ作り)。描いた位置=群の位置と y 回りの回転(局所 x → (cosθ, −sinθ)、局所 z → (sinθ, cosθ))で
     車輪の形(材質 XM_WHL)の頂点を世界へ写す(検証側で計算。モデルの pose は読まない) */
  const toW = (c, x, y, z) => { const th = c.rotation.y, cs = Math.cos(th), sn = Math.sin(th); return [c.position.x + x * cs + z * sn, c.position.y + y, c.position.z - x * sn + z * cs]; };
  const carsOf = (g) => g.children.filter((c) => c.userData && c.userData.xcar && c.visible);
  const carWheels = (c) => { let w = []; c.traverse((o) => { if (o.isMesh && o.material === X.XM_WHL) { const P = o.geometry.attributes.position.array; for (let i = 0; i < P.length; i += 3) w.push(toW(c, P[i], P[i + 1], P[i + 2])); } }); return w; };
  const carEnds = (c) => { const b = c.userData.body.geometry.attributes.position.array; let x0 = 1e9, x1 = -1e9; for (let i = 0; i < b.length; i += 3) { x0 = Math.min(x0, b[i]); x1 = Math.max(x1, b[i]); } return [toW(c, x0, 0, 0), toW(c, x1, 0, 0)]; };
  // 1両の車輪の頂点を、中心線に沿う u で 0.6m より大きい切れ目ごとの塊(=車軸)に分け、2軸ずつ台車に(300系のA車は端の台車と連接台車の2台、B車は端の台車1台)
  // 車軸は描いた車輪の頂点を車両の局所 x で分ける(曲線の u に写してからでは縮んで見える所がある)
  const carWheelsL = (c) => { let w = []; c.traverse((o) => { if (o.isMesh && o.material === X.XM_WHL) { const P = o.geometry.attributes.position.array; for (let i = 0; i < P.length; i += 3) w.push({ lx: P[i], p: toW(c, P[i], P[i + 1], P[i + 2]) }); } }); return w; };
  const bogiesOf = (c, A) => { const w = carWheelsL(c).map((q) => ({ p: q.p, u: q.lx })).sort((a, b) => a.u - b.u);
    const ax = []; let last = -1e9; for (const q of w) { if (q.u - last > 0.6) ax.push([]); ax[ax.length - 1].push(q.p); last = q.u; }
    const avg = (L) => { const s = [0, 0, 0]; for (const p of L) { s[0] += p[0]; s[1] += p[1]; s[2] += p[2]; } return s.map((v) => v / L.length); };
    const out = []; for (let i = 0; i + 1 < ax.length; i += 2) out.push({ b: avg(ax[i].concat(ax[i + 1])), ax: [ax[i], ax[i + 1]], w: ax[i].concat(ax[i + 1]) });
    return { bogies: out, axles: ax.length, w: w }; };
  // 交差鉄道は専用モデル(8000系の形を共有しない)
  {
    const keio = new Set();
    const walk = (o) => { if (!o || typeof o !== 'object') return; if (o.attributes) { keio.add(o); return; } for (const k in o) walk(o[k]); };
    walk(X.K8GEO);
    let bad = null;
    for (const g of allG) {
      if (!g.userData || !g.userData.xcar) { bad = bad || ['専用モデルでない']; continue; }
      g.traverse((o) => { if (o.geometry && keio.has(o.geometry) && !bad) bad = ['8000系のジオメトリを共有']; });
    }
    ok('交差鉄道は専用モデル', bad === null, '8000系と別', bad ? bad[0] : '井の頭線/世田谷線とも専用');
  }
  // 敷いたレール
  {
    const res = [];
    for (const [nm, K] of Object.entries(kind)) {
      const want = (K.gauge + X.RAIL_W) / 2; let n = 0, bad = null, worst = 0;
      X.scene.traverse((o) => {
        if (!o.isMesh || (o.material !== X.MAT.rail && o.material !== X.MAT.railRust) || !o.geometry || !o.geometry.attributes || !o.geometry.attributes.position) return;
        const P = o.geometry.attributes.position.array;
        if (o.parent !== X.scene && !(o.parent && o.parent.parent === X.scene && o.parent.position.x === 0 && o.parent.position.z === 0 && o.parent.rotation.y === 0)) return;
        for (let i = 0; i < P.length; i += 3) {
          const x = P[i], y = P[i + 1], z = P[i + 2]; if (y < 0 || y > 1.2) continue;
          const p = K.A.uv(x, z); if (Math.abs(p.n) > 8 || p.u < K.u0 + 1 || p.u > K.u1 - 1) continue;
          if (nm === '世田谷線' && p.u > REF.SETA_XO_ZONE[0] && p.u < REF.SETA_XO_ZONE[1]) continue;
          const d = Math.min(K.A.dTrack(0, x, z), K.A.dTrack(1, x, z)), e = Math.abs(d - want); n++;
          if (e > worst) worst = e; if (e > REF.XR_RAIL_TOL && !bad) bad = ['u=' + p.u.toFixed(1), '線路の中心から ' + d.toFixed(3) + 'm'];
        }
      });
      res.push([nm, n, bad, worst]);
    }
    ok('交差鉄道のレールが実際の線路の位置', res.every((r) => r[1] > 1000 && !r[2]), '中心線から(軌間+頭部)/2±' + REF.XR_RAIL_TOL + 'm',
      res.map((r) => r[0] + (r[2] ? ' ' + r[2].join(' ') : (r[1] > 1000 ? ' 最大差' + r[3].toFixed(3) + 'm(' + r[1] + '点)' : ' 頂点' + r[1]))).join('・'));
  }
  /* 走らせて測る:各コマ、描いた車両ごとに台車の中心が線路の上か・左側通行か・車輪の下端・左右の間隔・車体の端が線路の範囲の上。
     停車中(台車が動かない)は、井の頭線=その側のホーム(緯度の実測・110m)に収まる、世田谷線=北の端が終端の近く */
  {
    const plat = REF.INO_PLAT.map((q) => { const u0 = XC.INO.uAtZ(-(q.lat - X.LAT0) * X.MLAT); return { n: q.n, side: q.side, u0: u0, u1: u0 + REF.INO_PLAT_LEN }; });
    const st = { 井の頭線: { badT: null, badL: null, badY: null, badG: null, badOut: null, badStop: null, nObs: 0, dirs: new Set(), worst: 0, gw: 0, nCars: 0, nBog: 0 },
                 世田谷線: { badT: null, badL: null, badY: null, badG: null, badOut: null, badStop: null, nObs: 0, dirs: new Set(), worst: 0, gw: 0, nCars: 0, nBog: 0, xo: 0 } };
    const items = inoG.map((g) => ['井の頭線', g]).concat([['世田谷線', setaG]]);
    const prev = items.map(() => null), stopT = items.map(() => 0), maxStop = items.map(() => 0);
    for (let k = 0; k < REF.SIM[1]; k++) {
      X.stepXRail(REF.SIM[0]);
      items.forEach(([nm, g], i) => {
        const K = kind[nm], S = st[nm];
        const cars = g.visible ? carsOf(g) : [];
        if (!cars.length) { prev[i] = null; stopT[i] = 0; return; }
        const B = cars.map((c) => bogiesOf(c, K.A));
        for (const C of B) if (C.axles % 2 && !S.badG) S.badG = ['車軸 ' + C.axles];
        S.nCars = Math.max(S.nCars, cars.length); S.nBog = Math.max(S.nBog, B.reduce((a, C) => a + C.bogies.length, 0));
        let lo = 1e9, hi = -1e9; for (const c of cars) for (const e of carEnds(c)) { const u = K.A.uv(e[0], e[2]).u; lo = Math.min(lo, u); hi = Math.max(hi, u); }
        if ((lo < K.u0 - 1e-3 || hi > K.u1 + 1e-3) && !S.badOut) S.badOut = [lo.toFixed(1) + '〜' + hi.toFixed(1)];
        const all = [].concat(...B.map((C) => C.bogies.map((q) => q.b))), cx = all.reduce((a, p) => a + p[0], 0) / all.length, cz = all.reduce((a, p) => a + p[2], 0) / all.length;
        const pv = prev[i]; prev[i] = { x: cx, z: cz, n: all.length };
        const mv = pv && pv.n === all.length ? Math.hypot(cx - pv.x, cz - pv.z) : -1;
        for (const C of B) for (const q of C.bogies) {
          const b = q.b, pu = K.A.uv(b[0], b[2]).u, inXO = nm === '世田谷線' && pu > REF.SETA_XO_ZONE[0] && pu < REF.SETA_XO_ZONE[1];
          const d0 = K.A.dTrack(0, b[0], b[2]), d1 = K.A.dTrack(1, b[0], b[2]), d = Math.min(d0, d1);
          if (!inXO) {
            S.worst = Math.max(S.worst, d);
            if (d > REF.XR_ON_TRACK && !S.badT) S.badT = ['u=' + pu.toFixed(1), '線路から ' + d.toFixed(3) + 'm'];
            const term = nm === '世田谷線' && pu >= REF.SETA_XO_ZONE[0];
            if (mv > 1e-4 && mv < 50 && !term) {
              const dx = (cx - pv.x) / mv, dz = (cz - pv.z) / mv, other = d0 < d1 ? 1 : 0;
              const lx = b[0] + dz, lz = b[2] - dx, dl = K.A.dTrack(other, lx, lz), dc = K.A.dTrack(other, b[0], b[2]);
              if (!(dl > dc) && !S.badL) S.badL = ['u=' + pu.toFixed(1), '進行方向の右を走る'];
            }
          } else if (d0 > REF.XR_ON_TRACK && d1 > REF.XR_ON_TRACK) S.xo++;
          // 車輪:下端=レール頭頂面、左右の間隔(線路の横の向きに、台車の中心からの距離の平均)=(軌間+頭部の幅)/2
          let ymin = 1e9; for (const p of q.w) ymin = Math.min(ymin, p[1]);
          if (Math.abs(ymin - railTop) > 1e-4 && !S.badY) S.badY = [ymin.toFixed(4)];
          const a = K.A.uv(b[0], b[2]), t0 = K.A.pos(a.u - 1, a.n), t1 = K.A.pos(a.u + 1, a.n), hx = t1.x - t0.x, hz = t1.z - t0.z, hl = Math.hypot(hx, hz);
          const m = q.w.reduce((s, p) => s + Math.abs(((p[0] - b[0]) * (-hz) + (p[2] - b[2]) * hx) / hl), 0) / q.w.length, want = (K.gauge + X.RAIL_W) / 2;
          if (!inXO) { S.gw = Math.max(S.gw, Math.abs(m - want)); if (Math.abs(m - want) > 0.01 && !S.badG) S.badG = ['左右 ' + m.toFixed(4)]; }
        }
        if (mv > 1e-4 && mv < 50) {
          S.nObs++; const pu0 = K.A.uv(pv.x, pv.z).u, pu1 = K.A.uv(cx, cz).u; S.dirs.add(Math.sign(pu1 - pu0)); stopT[i] = 0;
        } else if (mv >= 0 && mv <= 1e-4) {
          stopT[i] += REF.SIM[0]; maxStop[i] = Math.max(maxStop[i], stopT[i]);
          if (nm === '井の頭線') {
            const side = K.A.dTrack(1, cx, cz) < K.A.dTrack(0, cx, cz) ? 1 : -1, pl = plat.find((q) => q.side === side);
            if ((lo < pl.u0 - 1e-3 || hi > pl.u1 + 1e-3) && !S.badStop) S.badStop = [pl.n + ' ' + pl.u0.toFixed(1) + '〜' + pl.u1.toFixed(1) + ' に ' + lo.toFixed(1) + '〜' + hi.toFixed(1)];
          } else if ((hi > 0.001 || hi < -REF.SETA_END) && !S.badStop) S.badStop = ['北の端 u=' + hi.toFixed(1)];
        }
      });
    }
    const I = st['井の頭線'], Z = st['世田谷線'];
    ok('井の頭線の車両数', I.nCars === REF.INO_CARS && I.nBog === 2 * REF.INO_CARS && !I.badG, REF.INO_CARS + '両(台車 ' + 2 * REF.INO_CARS + ')', I.nCars + '両・台車 ' + I.nBog + (I.badG ? ' ' + I.badG.join(' ') : ''));
    ok('世田谷線の車両数', Z.nCars === X.SETA_CARS && Z.nBog === REF.SETA_BOGIES, X.SETA_CARS + '車体・台車 ' + REF.SETA_BOGIES + '(2車体3台車の連接。公表)', Z.nCars + '車体・台車 ' + Z.nBog);
    for (const [nm, S] of [['井の頭線', I], ['世田谷線', Z]]) {
      ok(nm + 'の台車が線路の上', S.badT === null && S.nObs > 50, '線路の中心線から ' + REF.XR_ON_TRACK + 'm 以内', S.badT ? S.badT.join(' ') : '最大 ' + S.worst.toFixed(3) + 'm(' + S.nObs + 'コマ)');
      ok(nm + 'は左側通行', S.badL === null && S.dirs.size === 2, '上下とも進行方向の左の線', S.badL ? S.badL.join(' ') : (S.dirs.size === 2 ? '上下とも左' : '片方向のみ'));
      ok(nm + 'の車輪', S.badY === null && S.badG === null, '下端=' + railTop.toFixed(3) + '・左右=(軌間+頭部)/2', (S.badY || S.badG || ['一致(左右の差 ' + S.gw.toFixed(4) + 'm)']).join(' '));
      ok(nm + 'の編成が線路内', S.badOut === null, '車体の端が線路の範囲', S.badOut ? S.badOut.join(' ') : '全て');
    }
    ok('世田谷線は渡り線を通る', Z.xo > 0, '渡り線の範囲で2本の線路の間を通る', Z.xo + '台車・コマ');
    const iS = maxStop.slice(0, inoG.length), zS = maxStop[inoG.length];
    ok('井の頭線が明大前に停車', I.badStop === null && iS.every((t) => t >= REF.INO_DWELL_MIN),
      '上下とも' + REF.INO_DWELL_MIN + '秒以上・ホームに収まる', I.badStop ? I.badStop.join(' ') : iS.map((t) => t.toFixed(0) + '秒').join('・'));
    ok('世田谷線が下高井戸の終端に停車', Z.badStop === null && zS >= REF.INO_DWELL_MIN,
      REF.INO_DWELL_MIN + '秒以上・北の端が終端から ' + REF.SETA_END + 'm 以内', Z.badStop ? Z.badStop.join(' ') : zS.toFixed(0) + '秒');
  }
}

/* ---- 4f. 地形(2026-10-25 利用者指示:地形を入れる)------------------------------------------------------------
   検証側の決まり(地形の手順を検証側に別に書き、データのファイルから独立に計算して照合する。値はモデルから読まない):
   (a) 格子の高さ:plateau_dem.js を検証側で復号し、文書(CLAUDE.md)の手順=閉じる(半径2マスの円の最大→最小)→ぼかす(σ1マス)→
       線路の地盤 Gs(s)(中心線と ±20m の中央値を σ60m)→起伏 × 重み(京王線の帯 21m・40m で起伏へ/交差鉄道・千歳烏山駅前広場南側地区
       (区域の多角形=kara_ref.js)は 30m/
       線路から 480〜600m と両端の外 100〜300m で 0)→平らな所に掛かるセルの4隅は 0、で 25m 格子の節点の高さを計算し、
       ビューアの格子(TER.H)と ±2cm で一致。京王線の帯の中(|off|≤21m)の点は 0
   (b) 地表の網:頂点の高さと三角形の重心が検証側の格子の面の上(±1cm)。起伏のあるセル 10,000 以上
   (c) 敷いた面(道路・緑地・水面・計画道路・緑道):起伏の上の頂点は地表+決まった高さ(0.05〜0.16m の7通り)、三角形の重心も
       (格子の1つの面の上=切ってから載せた)
   (d) 建物の基部:足跡の頂点・辺の 2m ごとの点・頂点の重心で測った地表の最も低い所(±1cm)。中・遠の箱の下面も基部
   (e) 実際の建物の地盤(reference/plateau/bldg_ground.json:地形モデルとは別のデータ=LOD1 の立体の最も低い標高)との照合:
       起伏がそのまま残る所(足跡の頂点の重みが全部 1)の建物で、基部 −(地盤 − Gs)の中央値が ±0.5m、中央値から 0.6m 以内が
       80% 以上・1.5m 以内が 95% 以上(10m 格子の平均・閉じる・25m 格子にした分の差)
   (f) 木の根元(幹の中心と 0.3m 外の4点の最も低い所)・地上の街灯(+5.2m)・自動車(前後の端の路面の平均+0.13m、縦の傾き=前後の
       路面の差)・歩く人(+0.27m)・歩道の頂点(+0.12/0.27m)・自動車道の橋脚の足元が地表に合う
   (g) 起伏が効いている:重み 1 の節点の標準偏差 1m 以上・高低差 8m 以上
   地形を描くべきかは検証側がファイルから決める(HTML が plateau_dem.js・plateau_land.js・plateau_bldg.js を読み、3つとも隣にある)。
   モデルの TER.on だけを見ると、地形を切った故障で (a)〜(g) が全部飛んで素通りした */
const TER_DATA = (() => { const fs = require('fs'), pth = require('path'), html = fs.readFileSync(path, 'utf8');
  return ['plateau_dem.js', 'plateau_land.js', 'plateau_bldg.js'].every((f) => html.includes('<script src="' + f + '">') && fs.existsSync(pth.join(pth.dirname(path), f))); })();
const TER_ON = !!(X.TER && X.TER.on && X.TER.H);
if (TER_DATA && !TER_ON) ok('起伏がある', false, '地形・道路・建物のデータが揃っていれば地形を描く', '地形が描かれていない(TER.on=' + !!(X.TER && X.TER.on) + ')');
if (TER_ON) {
  const fs = require('fs'), pth = require('path');
  const TR = { DX: 25, X0: -9100, X1: 1900, Z0: -1950, Z1: 3250, AS: 21, BL: 40, FAR0: 480, FAR1: 600, END0: 100, END1: 300,
    CLOSE: 2, BLUR: 1, GS_SIG: 60, GS_OFF: 20, GS_STEP: 10, GS_EXT: 700, SNAP: 0.003, CORR: [['INO', 17, 'U0', 'U1'], ['SETA', 7, 'SETA_U0', 'SETA_U1']],
    CORR_EXT: 10, CORR_BL: 30, POLY_BL: 30, OFFS: [0.05, 0.06, 0.07, 0.08, 0.10, 0.12, 0.16], CAR_Y: 0.13, PED_Y: 0.27, SW_Y: [0.12, 0.27], LAMP_Y: 5.2 };
  const g = {};
  new Function('globalThis', fs.readFileSync(pth.join(pth.dirname(path), 'plateau_dem.js'), 'utf8'))(g);
  const D = g.PLATEAU_DEM, NX = D.nx, NZ = D.nz;
  // 1) 復号
  const rb = Buffer.from(D.r64, 'base64'), hb = Buffer.from(D.h64, 'base64');
  let A = new Float64Array(NX * NZ).fill(NaN);
  for (let j = 0, o = 0; j < NZ; j++) { const i0 = rb.readUInt16LE(4 * j), n = rb.readUInt16LE(4 * j + 2);
    for (let k = 0; k < n; k++) { const v = hb.readUInt16LE(2 * (o + k)); if (v !== 65535) A[j * NX + i0 + k] = D.h0 + v * D.q; } o += n; }
  // 2) 閉じる(最大→最小)
  const disk = []; for (let dj = -TR.CLOSE; dj <= TR.CLOSE; dj++) for (let di = -TR.CLOSE; di <= TR.CLOSE; di++) if (di * di + dj * dj <= TR.CLOSE * TR.CLOSE) disk.push([di, dj]);
  const mm = (S, f) => { const O = new Float64Array(NX * NZ).fill(NaN);
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { if (Number.isNaN(S[j * NX + i])) continue; let v = S[j * NX + i];
      for (const [di, dj] of disk) { const a = i + di, b = j + dj; if (a >= 0 && b >= 0 && a < NX && b < NZ && !Number.isNaN(S[b * NX + a])) v = f(v, S[b * NX + a]); }
      O[j * NX + i] = v; } return O; };
  A = mm(mm(A, Math.max), Math.min);
  // 3) ぼかす(縦横のガウス。データの無いマスは重みから外す)
  const KR = Math.ceil(2 * TR.BLUR), KW = []; for (let k = -KR; k <= KR; k++) KW.push(Math.exp(-0.5 * (k / TR.BLUR) ** 2));
  const bl = (S, di, dj) => { const O = new Float64Array(NX * NZ).fill(NaN);
    for (let j = 0; j < NZ; j++) for (let i = 0; i < NX; i++) { if (Number.isNaN(S[j * NX + i])) continue; let a = 0, w = 0;
      for (let k = -KR; k <= KR; k++) { const ii = i + k * di, jj = j + k * dj; if (ii < 0 || jj < 0 || ii >= NX || jj >= NZ || Number.isNaN(S[jj * NX + ii])) continue; a += S[jj * NX + ii] * KW[k + KR]; w += KW[k + KR]; }
      O[j * NX + i] = a / w; } return O; };
  A = bl(bl(A, 1, 0), 0, 1);
  const dem = (x, z) => { const fx = (x - D.x0) / D.dx - 0.5, fz = (z - D.z0) / D.dx - 0.5, i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i + 1 >= NX || j + 1 >= NZ) return NaN; const tx = fx - i, tz = fz - j, k = j * NX + i;
    return (A[k] * (1 - tx) + A[k + 1] * tx) * (1 - tz) + (A[k + NX] * (1 - tx) + A[k + NX + 1] * tx) * tz; };
  // 4) 線路の地盤 Gs
  const G0 = X.DOM.x0 - TR.GS_EXT, gv = [];
  for (let s = G0; s <= X.DOM.x1 + TR.GS_EXT + 1e-6; s += TR.GS_STEP) {
    const v = [-TR.GS_OFF, 0, TR.GS_OFF].map((f) => { const p = X.frame(s, f); return dem(p.x, p.z); }).filter((v) => !Number.isNaN(v)).sort((a, b) => a - b);
    gv.push(v.length ? v[(v.length - 1) >> 1] : NaN); }
  const GK = Math.ceil(3 * TR.GS_SIG / TR.GS_STEP);
  const GS = gv.map((_, i) => { let a = 0, w = 0; for (let k = -GK; k <= GK; k++) { const v = gv[i + k]; if (v === undefined || Number.isNaN(v)) continue;
    const ww = Math.exp(-0.5 * (k * TR.GS_STEP / TR.GS_SIG) ** 2); a += v * ww; w += ww; } return w ? a / w : NaN; });
  const gsAt = (s) => { const f = Math.max(0, Math.min(GS.length - 1, (s - G0) / TR.GS_STEP)), i = Math.min(GS.length - 2, Math.floor(f)), t = f - i; return GS[i] * (1 - t) + GS[i + 1] * t; };
  // 線路の座標(端の先は端の接線に沿ってはみ出した分を s に足す)
  const DPn = X.DP.x.length - 1;
  const prj = (x, z) => { const q = X.prjXY(x, z);
    for (const [i, j] of [[0, 1], [DPn, DPn - 1]]) { const sE = X.DP.s[i] - X.S_OFS; if (Math.abs(q.s - sE) > 0.5) continue;
      const L = Math.hypot(X.DP.x[i] - X.DP.x[j], X.DP.z[i] - X.DP.z[j]) || 1, d = ((x - X.DP.x[i]) * (X.DP.x[i] - X.DP.x[j]) + (z - X.DP.z[i]) * (X.DP.z[i] - X.DP.z[j])) / L;
      if (d > 0) return { s: sE + (i === 0 ? -d : d), off: q.off }; }
    return q; };
  const ss = (t) => { t = Math.max(0, Math.min(1, t)); return t * t * (3 - 2 * t); };
  const CR = TR.CORR.map((c) => ({ A: XC[c[0]], hw: c[1], u0: X.XR[c[2]] - TR.CORR_EXT, u1: X.XR[c[3]] + TR.CORR_EXT }));
  const corrD = (C, x, z) => { const p = C.A.uv(x, z); return Math.max(Math.abs(p.n) - C.hw, C.u0 - p.u, p.u - C.u1); };
  const wOf = (x, z) => { const q = prj(x, z), a = Math.abs(q.off);
    let w = ss((a - TR.AS) / TR.BL) * (1 - ss((a - TR.FAR0) / (TR.FAR1 - TR.FAR0))) * (1 - ss((X.DOM.x0 - TR.END0 - q.s) / (TR.END1 - TR.END0))) * (1 - ss((q.s - X.DOM.x1 - TR.END0) / (TR.END1 - TR.END0)));
    for (const C of CR) w *= ss(corrD(C, x, z) / TR.CORR_BL);
    w *= ss(polyDist(KV.D, x, z) / TR.POLY_BL);           // 千歳烏山駅前広場南側地区(検証側の区域 kara_ref.js)
    for (const P of MV.H) w *= ss(polyDist(P, x, z) / TR.POLY_BL);   // 明大前駅前広場と 154 の帯(meida_ref.js。2026-11)
    return { w: w, s: q.s, off: q.off }; };
  // 5) 25m 格子
  const GX = Math.round((TR.X1 - TR.X0) / TR.DX), GZ = Math.round((TR.Z1 - TR.Z0) / TR.DX), W = GX + 1, H = new Float64Array(W * (GZ + 1)), WN = new Float64Array(W * (GZ + 1));
  const inD = (x, z) => x > D.x0 + D.dx && x < D.x0 + (NX - 1) * D.dx && z > D.z0 + D.dx && z < D.z0 + (NZ - 1) * D.dx;
  for (let j = 0; j <= GZ; j++) for (let i = 0; i <= GX; i++) { const x = TR.X0 + i * TR.DX, z = TR.Z0 + j * TR.DX; if (!inD(x, z)) continue;
    const r = wOf(x, z); WN[j * W + i] = r.w; if (r.w <= 0) continue; const h = dem(x, z) - gsAt(r.s); if (Number.isNaN(h)) continue; const v = r.w * h; H[j * W + i] = Math.abs(v) < TR.SNAP ? 0 : v; }
  const hd = TR.DX / Math.SQRT2;
  for (let j = 0; j < GZ; j++) for (let i = 0; i < GX; i++) { const x = TR.X0 + (i + 0.5) * TR.DX, z = TR.Z0 + (j + 0.5) * TR.DX; if (!inD(x, z)) continue;
    const q = prj(x, z); let f = Math.abs(q.off) - hd <= TR.AS; for (const C of CR) if (corrD(C, x, z) - hd <= 0) f = true; if (polyDist(KV.D, x, z) - hd <= 0) f = true; for (const P of MV.H) if (polyDist(P, x, z) - hd <= 0) f = true;
    if (f) for (const [a, b] of [[0, 0], [1, 0], [0, 1], [1, 1]]) H[(j + b) * W + i + a] = 0; }
  const tH = (x, z) => { const fx = (x - TR.X0) / TR.DX, fz = (z - TR.Z0) / TR.DX, i = Math.floor(fx), j = Math.floor(fz);
    if (i < 0 || j < 0 || i >= GX || j >= GZ) return 0; const tx = fx - i, tz = fz - j, k = j * W + i;
    return tx >= tz ? H[k] + (H[k + 1] - H[k]) * tx + (H[k + W + 1] - H[k + 1]) * tz : H[k] + (H[k + W] - H[k]) * tz + (H[k + W + 1] - H[k + W]) * tx; };
  // (a)
  let dMax = 0, nBad = 0, ex = null;
  const VH = X.TER.H;
  if (!VH || VH.length !== H.length) ex = '格子の大きさが違う';
  else for (let k = 0; k < H.length; k++) { const d = Math.abs(VH[k] - H[k]); if (d > dMax) dMax = d; if (d > 0.02) { nBad++; if (!ex) ex = '節点 (' + (k % W) + ',' + Math.floor(k / W) + ') ' + VH[k].toFixed(2) + ' ≠ ' + H[k].toFixed(2); } }
  let bandBad = null;
  for (let s = X.DOM.x0; s <= X.DOM.x1 && !bandBad; s += 7) for (const o of [-21, -14, -7, 0, 7, 14, 21]) { const f = X.frame(s, o); if (Math.abs(X.terH(f.x, f.z)) > 1e-9) { bandBad = 's=' + s + ' off=' + o + ' 地表 ' + X.terH(f.x, f.z).toFixed(3); break; } }
  ok('地形の高さ(格子)', ex === null && bandBad === null, 'plateau_dem.js から検証側で計算した 25m 格子と ±2cm・京王線の帯(±21m)は 0',
    ex ? ex + (nBad ? '(' + nBad + '点)' : '') : bandBad ? bandBad : '節点 ' + H.length + '・最大の差 ' + dMax.toFixed(4) + 'm');
  // (b) 地表の網
  { const ga = X.groundMesh.geometry.attributes.position.array, gi = X.groundMesh.geometry.index.array;
    let bad = null, nT = 0;
    for (let k = 0; k < ga.length && !bad; k += 3) if (Math.abs(ga[k + 1] - tH(ga[k], ga[k + 2])) > 0.01) bad = '頂点 (' + ga[k].toFixed(0) + ',' + ga[k + 2].toFixed(0) + ') ' + ga[k + 1].toFixed(2) + ' ≠ ' + tH(ga[k], ga[k + 2]).toFixed(2);
    for (let t = 0; t < gi.length && !bad; t += 3) { let x = 0, y = 0, z = 0; for (let e = 0; e < 3; e++) { x += ga[gi[t + e] * 3]; y += ga[gi[t + e] * 3 + 1]; z += ga[gi[t + e] * 3 + 2]; }
      if (Math.abs(y / 3 - tH(x / 3, z / 3)) > 0.01) bad = '三角形の重心 (' + (x / 3).toFixed(0) + ',' + (z / 3).toFixed(0) + ') が格子の面から ' + (y / 3 - tH(x / 3, z / 3)).toFixed(2) + 'm'; }
    for (let j = 0; j < GZ; j++) for (let i = 0; i < GX; i++) { const k = j * W + i; if (H[k] || H[k + 1] || H[k + W] || H[k + W + 1]) nT++; }
    ok('地表の網が起伏の面', bad === null && nT >= 10000, '頂点と三角形の重心が格子の面の上(±1cm)・起伏のセル 10,000 以上', bad || '起伏のセル ' + nT + '・三角形 ' + gi.length / 3); }
  // (c) 敷いた面
  { let bad = null, nV = 0, nO = 0; const OK = (d) => TR.OFFS.some((o) => Math.abs(d - o) < 0.002);
    X.scene.traverse((o) => {
      if (bad || !o.isMesh || !o.userData || !o.userData.flat || o === X.groundMesh || o.name === '歩道' || o.name === '駅前広場' || o.material === X.MAT_FENCE || !o.geometry || !o.geometry.index) return;   // 駅前広場(計画)は 4h
      const P = o.geometry.attributes.position.array, I = o.geometry.index.array;
      for (let k = 0; k < P.length && !bad; k += 3) { const t = tH(P[k], P[k + 2]); if (Math.abs(t) < 1e-6) continue; nV++;
        if (!OK(P[k + 1] - t)) bad = (o.name || '面') + ' の頂点 (' + P[k].toFixed(0) + ',' + P[k + 2].toFixed(0) + ') 地表+' + (P[k + 1] - t).toFixed(3) + 'm'; else nO++; }
      for (let t = 0; t < I.length && !bad; t += 3) { let x = 0, y = 0, z = 0, e = 0;
        for (let m = 0; m < 3; m++) { const v = I[t + m] * 3; x += P[v]; y += P[v + 1]; z += P[v + 2]; e += P[v + 1] - tH(P[v], P[v + 2]); }
        if (Math.abs((y / 3 - tH(x / 3, z / 3)) - e / 3) > 0.003) bad = (o.name || '面') + ' の三角形 (' + (x / 3).toFixed(0) + ',' + (z / 3).toFixed(0) + ') が地表の折れ目をまたぐ(' + ((y / 3 - tH(x / 3, z / 3)) - e / 3).toFixed(3) + 'm)'; }
    });
    ok('敷いた面が起伏に沿う', bad === null && nV >= 50000, '道路・緑地・水面・計画道路・緑道の頂点が地表+0.05〜0.16m・三角形が格子の1つの面の上', bad || '起伏の上の頂点 ' + nV); }
  // (d) 建物の基部
  const tMinP = (P) => { let m = 1e9, cx = 0, cz = 0;
    for (let i = 0; i < P.length; i++) { const a = P[i], b = P[(i + 1) % P.length], n = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / 2));
      for (let k = 0; k < n; k++) m = Math.min(m, tH(a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n)); cx += a[0]; cz += a[1]; }
    return Math.min(m, tH(cx / P.length, cz / P.length)); };
  { let bad = null, n = 0, nUp = 0;
    for (const e of B) { if (!e.plateau || !e.poly) continue; n++; const want = tMinP(e.poly); if (Math.abs(want) > 0.5) nUp++;
      if (!(Math.abs((e.base || 0) - want) <= 0.01) && !bad) bad = '(' + e.x.toFixed(0) + ',' + e.z.toFixed(0) + ') 基部 ' + (e.base || 0).toFixed(2) + ' ≠ 地表の最低 ' + want.toFixed(2); }
    for (const C of X.CITY_LODS) { const im = C.m[1]; if (!im || !im.mats) continue;
      C.B.forEach((b, j) => { const q = im.mats[j]; if (!q || bad) return; if (Math.abs(q.p.y - q.s.y / 2 - b.base) > 0.01) bad = '箱の下面 ' + (q.p.y - q.s.y / 2).toFixed(2) + ' ≠ 基部 ' + b.base.toFixed(2); }); }
    ok('建物は地表の最も低い所から建つ', bad === null && n > 9000 && nUp > 2000, '足跡の下の地表の最も低い所(±1cm)・中の箱の下面も・起伏の上の建物 2,000棟以上', bad || n + '棟(起伏 0.5m 超の上 ' + nUp + '棟)'); }
  // (e) 実際の建物の地盤
  { const G = JSON.parse(fs.readFileSync(pth.join(__dirname, '..', 'reference', 'plateau', 'bldg_ground.json'), 'utf8')), zb = Buffer.from(G.b64, 'base64');
    const gB = {}; new Function('globalThis', fs.readFileSync(pth.join(pth.dirname(path), 'plateau_bldg.js'), 'utf8'))(gB);
    const pb = Buffer.from(gB.PLATEAU_BLDG.b64, 'base64'), N = pb.readUInt32LE(4), idx = new Map(); let o = 8;
    for (let n = 0; n < N; n++) { const nv = pb.readUInt8(o), hh = pb.readUInt16LE(o + 1) / 10; o += 4; idx.set((pb.readInt32LE(o) / 10).toFixed(1) + ',' + (pb.readInt32LE(o + 4) / 10).toFixed(1) + ',' + hh.toFixed(1), n); o += 8 + 4 * (nv - 1); }
    const D2 = [];
    let nW = 0;
    for (const e of B) { if (!e.plateau || !e.poly) continue;
      const i = idx.get(e.poly[0][0].toFixed(1) + ',' + e.poly[0][1].toFixed(1) + ',' + e.h.toFixed(1)); if (i === undefined || i >= G.n) continue;
      const v = zb.readUInt16LE(2 * i); if (v === 65535) continue;
      if (!e.poly.every((p) => wOf(p[0], p[1]).w >= 0.999)) continue;
      nW++;
      let cx = 0, cz = 0; for (const p of e.poly) { cx += p[0]; cz += p[1]; } cx /= e.poly.length; cz /= e.poly.length;
      D2.push((e.base || 0) - (G.z0 + v * G.q - gsAt(prj(cx, cz).s)));
    }
    D2.sort((a, b) => a - b); const med = D2.length ? D2[D2.length >> 1] : NaN;
    const f06 = D2.filter((d) => Math.abs(d - med) <= 0.6).length / Math.max(1, D2.length), f15 = D2.filter((d) => Math.abs(d - med) <= 1.5).length / Math.max(1, D2.length);
    ok('地形 ⇄ 実際の建物の地盤', D2.length >= 3000 && Math.abs(med) <= 0.5 && f06 >= 0.8 && f15 >= 0.95,
      '起伏のそのままの所の建物で 基部−(地盤−線路の地盤) の中央値 ±0.5m・0.6m 以内 80%・1.5m 以内 95%(bldg_ground.json)',
      D2.length + '棟・中央値 ' + med.toFixed(2) + 'm・0.6m 以内 ' + (f06 * 100).toFixed(1) + '%・1.5m 以内 ' + (f15 * 100).toFixed(1) + '%'); }
  // (f) 木・街灯・自動車・歩く人・歩道・橋脚
  { let bad = null, nT = 0, nTU = 0;
    for (const t of X.CITY.trees) { nT++; const want = Math.min(tH(t.x, t.z), tH(t.x + 0.3, t.z), tH(t.x - 0.3, t.z), tH(t.x, t.z + 0.3), tH(t.x, t.z - 0.3)); if (Math.abs(want) > 0.5) nTU++;
      if (!(Math.abs((t.y === undefined ? 0 : t.y) - want) <= 0.005) && !bad) bad = '木 (' + t.x.toFixed(0) + ',' + t.z.toFixed(0) + ') 根元 ' + (t.y === undefined ? '無し' : t.y.toFixed(2)) + ' ≠ ' + want.toFixed(2); }
    const yAt = new Map(X.CITY.trees.map((t) => [t.x + ',' + t.z, t.y]));
    for (const m of [...[...X.CITY.treeChunks.values()].map((c) => c.m), X.CITY.treeNear]) if (!bad) m.mats.forEach((q) => { if (bad || !q) return; const y = yAt.get(q.p.x + ',' + q.p.z); if (y === undefined || Math.abs(q.p.y - y) > 1e-6) bad = '木の形の高さ ' + q.p.y.toFixed(2) + ' ≠ 根元 ' + (y === undefined ? '無し' : y.toFixed(2)); });
    ok('木は地表に立つ', bad === null && nTU > 300, '根元=幹の中心と 0.3m 外の4点の地表の最も低い所・起伏の上の木 300本以上', bad || nT + '本(起伏 0.5m 超の上 ' + nTU + '本)'); }
  { let bad = null, nG = 0, nGU = 0;
    const head = X.NIGHT.group.children.find((m) => m.isMesh && m.mats && m.mats.length === X.NIGHT.stat.lamp && m.geometry && m.geometry.type === 'Sph');
    if (!head) bad = '街灯の灯具が見つからない';
    else for (const q of head.mats) { if (!q) continue; const t = tH(q.p.x, q.p.z);
      if (Math.abs(q.p.y - (t + TR.LAMP_Y)) < 0.01) { nG++; if (Math.abs(t) > 0.5) nGU++; }
      else if (q.p.y < t + 6.5 && !bad) bad = '街灯 (' + q.p.x.toFixed(0) + ',' + q.p.z.toFixed(0) + ') の高さ ' + q.p.y.toFixed(2) + '(地表+' + (q.p.y - t).toFixed(2) + 'm。地上は +5.2・高架の灯りは高架の上)'; }
    ok('地上の街灯は地表から 5.2m', bad === null && nG > 200 && nGU >= 20, '灯具=地表+5.2m(高架の上の灯りは除く)・起伏の上 20基以上', bad || '地上 ' + nG + '基(起伏 0.5m 超の上 ' + nGU + '基)'); }
  { let bad = null, nC = 0, nS = 0;
    X.carsDraw(true);
    for (const c of X.RD_CARS) {
      const im = X.RD_CARS.meshes[c.kind], q = im && im.mats && im.mats[c.mi]; if (!q) continue;
      const p = c.lane.pos(c.u), hb2 = tH(p.x - p.fx * c.L / 2, p.z - p.fz * c.L / 2), hf = tH(p.x + p.fx * c.L / 2, p.z + p.fz * c.L / 2);
      const yw = (hf + hb2) / 2 + TR.CAR_Y, sw = Math.sin(Math.atan2(hf - hb2, c.L)); nC++; if (Math.abs(hf - hb2) > 0.05) nS++;
      const Q = q.q, fy = Q ? 2 * (Q.x * Q.y + Q.w * Q.z) : NaN, fxz = Q ? [1 - 2 * (Q.y * Q.y + Q.z * Q.z), 2 * (Q.x * Q.z - Q.w * Q.y)] : [NaN, NaN];
      if (!(Math.abs(q.p.y - yw) <= 0.005) && !bad) bad = '車 (' + p.x.toFixed(0) + ',' + p.z.toFixed(0) + ') の高さ ' + q.p.y.toFixed(3) + ' ≠ 路面+0.13 ' + yw.toFixed(3);
      else if (!(Math.abs(fy - sw) <= 0.002) && !bad) bad = '車 (' + p.x.toFixed(0) + ',' + p.z.toFixed(0) + ') の縦の傾き ' + fy.toFixed(4) + ' ≠ ' + sw.toFixed(4);
      else if (!(Math.abs(fxz[0] * p.fz - fxz[1] * p.fx) <= 0.002 && fxz[0] * p.fx + fxz[1] * p.fz > 0) && !bad) bad = '車の向きが進行方向でない';
    }
    ok('自動車は路面に載る', bad === null && nC >= 40 && nS >= 10, '前後の端の路面の平均+0.13m・縦の傾き=前後の路面の差/車の長さ・向き=進行方向・坂の上の車 10台以上', bad || nC + '台(坂 ' + nS + '台)'); }
  { let bad = null, nP = 0, nPU = 0;
    for (const m of X.PEDS) { const q = X.pedPos(m), t = tH(q.x, q.z); nP++; if (Math.abs(t) > 0.5) nPU++;
      if (!(Math.abs(q.y - (t + TR.PED_Y)) <= 0.003) && !bad) bad = '歩く人 (' + q.x.toFixed(0) + ',' + q.z.toFixed(0) + ') ' + q.y.toFixed(2) + ' ≠ 地表+0.27 ' + (t + TR.PED_Y).toFixed(2); }
    let nSW = 0;
    X.scene.traverse((o) => { if (bad || o.name !== '歩道' || !o.geometry) return; const P = o.geometry.attributes.position.array;
      for (let k = 0; k < P.length && !bad; k += 3) { const t = tH(P[k], P[k + 2]); if (Math.abs(t) < 1e-6) continue; nSW++;
        if (!TR.SW_Y.some((y) => Math.abs(P[k + 1] - t - y) < 0.003)) bad = '歩道の頂点 (' + P[k].toFixed(0) + ',' + P[k + 2].toFixed(0) + ') 地表+' + (P[k + 1] - t).toFixed(3); } });
    ok('歩く人と歩道が地表に載る', bad === null && nPU >= 20 && nSW > 1000, '歩く人=地表+0.27m・歩道の頂点=地表+0.12/0.27m・起伏の上の人 20人以上', bad || nP + '人(起伏の上 ' + nPU + ')・歩道の頂点 ' + nSW); }
  { let bad = null, n = 0;
    const pm = [], cm = []; X.scene.traverse((o) => { if (o.isMesh && o.mats && o.mats.length === X.EXPY.piers.length && o.material === X.MAT.pier) (o.name === '自動車道の橋脚の横梁' ? cm : pm).push(o); });
    if (pm.length !== 1 || cm.length !== 1) bad = '自動車道の橋脚・横梁のインスタンスが見つからない(' + pm.length + '・' + cm.length + ')';
    else pm[0].mats.forEach((q, i) => { if (bad || !q) return; n++; const p = X.EXPY.piers[i], t = tH(q.p.x, q.p.z), bot = q.p.y - q.s.y / 2, top = q.p.y + q.s.y / 2;
      const c = cm[0].mats[i], cb = c && c.p.y - c.s.y / 2, ct = c && c.p.y + c.s.y / 2;
      // 床版の下面(検証側で登録簿の床版のうちこの点の上にある物の下面)
      let db = -1e9; for (const D of X.EXPY.deck) if (polyDist(D.P, q.p.x, q.p.z) < 0) db = Math.max(db, D.bot);
      if (Math.abs(bot - t) > 0.005) bad = '橋脚 (' + q.p.x.toFixed(0) + ',' + q.p.z.toFixed(0) + ') の足元 ' + bot.toFixed(2) + ' ≠ 地表 ' + t.toFixed(2);
      else if (!c || Math.abs(top - cb) > 0.005) bad = '橋脚の上端 ' + top.toFixed(2) + ' ≠ 横梁の下面 ' + (c ? cb.toFixed(2) : 'なし');
      else if (Math.abs(ct - db) > 0.005) bad = '横梁の上端 ' + ct.toFixed(2) + ' ≠ 床版の下面 ' + db.toFixed(2);
      else if (Math.hypot(c.p.x - q.p.x, c.p.z - q.p.z) > 0.01) bad = '横梁が柱の上に無い'; });
    ok('自動車道の橋脚は地表から', bad === null && n > 100, '柱の足元=地表・柱の上端=横梁の下面・横梁の上端=床版の下面', bad || n + '基'); }
  // (g) 起伏が効いている
  { const V = []; for (let k = 0; k < H.length; k++) if (WN[k] >= 0.999) V.push(H[k]);
    const mu = V.reduce((a, v) => a + v, 0) / Math.max(1, V.length), sd = Math.sqrt(V.reduce((a, v) => a + (v - mu) ** 2, 0) / Math.max(1, V.length));
    const lo = Math.min(...V), hi = Math.max(...V);
    ok('起伏がある', V.length > 5000 && sd >= 1.0 && hi - lo >= 8, '起伏のそのままの所の節点:標準偏差 1m 以上・高低差 8m 以上', V.length + '点・標準偏差 ' + sd.toFixed(2) + 'm・' + lo.toFixed(1) + '〜' + hi.toFixed(1) + 'm'); }
}

/* ---- 4g. 航空写真(2026-10-26 利用者指示:国土地理院の航空写真を閲覧時に読み込み、地表と屋根に真上から貼る)-------------------
   検証側の決まり(値はモデルから読まない。使うのは世界座標の定義 LAT0・LON0・MLAT・MLON と構造物の幅 deckHalf・cutHalf だけ):
   (a) 座標:タイルの番号は Web メルカトル(検証側の式)。シェーダの展開 tc=((x−x0)·sx, (z−z0)·sz+(z−z0)²·q)(ORTHO_U の値で計算)が、
       段ごとの窓の中の点で式と 0.25画素以内(遠=地表の全体を1枚にした段は 0.6画素)。枠の原点 uOw は窓の原点の n の剰余
   (b) 枠と書き込み:近・中の枠 (sx,sy) には窓の中で番号が n の剰余で等しいタイル、遠は窓の原点からの番号。その枠への最後の書き込み
       (renderer.copies)がそのタイルの URL(書式は検証側)。画像ごとの最後の書き込みは縮小の段も作り直す(コマの終わりに1回)。
       画像は一辺 256×枚数・近と中は繰り返し・遠は端で止める・上下を反転しない
   (c) 窓の置き場(lodStruct の後):視線が地表に当たる所(当たらなければ近 350m・中 1400m 先)の番号が窓の中心から 1枚以内。
       運転台のカメラ自身も近の窓の中。遠は地表の網の全体を覆う。段は z18・16・14、近と中の窓は 8×8 枚
   (d) 帯の印(画像の値を検証側で GL の双線形に読む。値=128+10×距離・写真の割合=clamp(距離+0.5)):構造物の半幅(掘割は側ごと)
       +3.6m の内は 0.05 以下(高架下と側道は今の色)、+6.7m の外は 0.95 以上、事業区間の端の 3m 外も 0.95 以上、
       井の頭線・世田谷線の建築限界の半幅−1m の内は 0.05 以下。街から外した実際の建物(plateau_bldg.js を検証側で読み、帯の中の
       建物から街にある物を引く)のうち、足跡が構造物の半幅+4.6m に掛かる物の重心は 0.05 以下(写真では屋根が地面に平らに写る)、
       30m 以上離れて外した物は写真のまま、街にある建物の重心は 99.5% 以上で 0.95 以上
   (e) 材質(onBeforeCompile を通した結果):地表の網=全面+帯の灰・地表に敷いた面(道路・緑地)=全面・水面と計画の放射23号線=無し・
       歩道と玉川上水=上面・建物=屋根(PLATEAU の写真の面は無し)。uniform は ORTHO_U そのもの
   (f) 明るさ:昼・夏・晴れで係数 0.65、夜は地表と同じ 0.55 倍、雨は地表の色と同じ比、雪は白へ 0.5 以上寄せる。帯の灰は #8f8d88
   (g) 切替:OFF で uOrthoOn=0・水面を出す/ON で 1・写真が読めていれば水面を隠す
   (h) 読めないタイル:書かない(近の枠は α=0 で塗ったまま=前の窓のタイルが残らない)・待ちに数えない */
const REF_OR = { URL: 'https://cyberjapandata.gsi.go.jp/xyz/seamlessphoto/', Z: [18, 16, 14], N: X.IS_MOBILE ? [0, 4] : [8, 8], AHEAD: [350, 1400],
  TOL_PX: [0.25, 0.25, 0.6], GAIN: 0.65, NIGHT: 0.58, BAND_IN: 3.6, BAND_OUT: 6.7, END_OUT: 3, XR_IN: 1.0, BAND_HEX: 0x8f8d88, SNOW_MIN: 0.5,
  HOLE_OUT: 4.0, HOLE_MISS: 0.03, KEEP_PHOTO: 0.995, FAR_RM: 30 };   // 外した建物の足跡:この距離[m]の内は帯の外の検査から除く(帯の印は 4m/画素で、足跡どうしの狭い隙間では
                                                          // 双線形が距離を小さく読むので1画素)・重心で写真が出てよい割合・街の建物で写真が出る割合
const OM = X.ORTHO_MGR, OU = X.ORTHO_U;
if (!OM || !OU) ok('航空写真', false, '航空写真の読み込み(ORTHO_MGR)と uniform(ORTHO_U)がある', '無い');
else {
  const P2 = (z) => Math.pow(2, z), md = (a, n) => ((a % n) + n) % n;
  const tileOf = (x, z, zm) => { const lon = X.LON0 + x / X.MLON, la = (X.LAT0 - z / X.MLAT) * Math.PI / 180;
    return [(lon + 180) / 360 * P2(zm), (1 - Math.asinh(Math.tan(la)) / Math.PI) / 2 * P2(zm)]; };
  const worldOf = (tx, ty, zm) => { const lon = tx / P2(zm) * 360 - 180, la = Math.atan(Math.sinh(Math.PI * (1 - 2 * ty / P2(zm)))) * 180 / Math.PI;
    return [(lon - X.LON0) * X.MLON, -(la - X.LAT0) * X.MLAT]; };
  const LVS = OM.LV.filter((L) => L.slots), cam = X.camera;
  const aim = (p, y, t, ty) => { cam.position.set(p.x, y, p.z); cam.lookAt(t.x, ty, t.z); };
  // (c) 窓の置き場
  { let bad = null, n = 0;
    const cases = [];
    { const T = X.frame(2000, 0), C = X.frame(2200, 0); cases.push({ n: '俯瞰', C: C, cy: 400, T: T, ty: 0 }); }   // 高架の帯(地表 0)の上 400m から 200m 先
    { const C = X.frame(6000, 0), T = X.frame(6200, 0), y = X.railY(6000) + 3.2; cases.push({ n: '運転台', C: C, cy: y, T: T, ty: y, cab: true }); }   // 水平に線路の先
    { const C = X.frame(3000, 0), T = X.frame(4500, 0); cases.push({ n: '遠望', C: C, cy: 1500, T: T, ty: 0 }); }   // 1500m の高さから 1.5km 先
    for (const K of cases) {
      aim(K.C, K.cy, K.T, K.ty); for (let k = 0; k < 3; k++) X.lodStruct();
      const dx = K.T.x - K.C.x, dy = K.ty - K.cy, dz = K.T.z - K.C.z, fh = Math.hypot(dx, dz), D = dy < 0 ? K.cy * fh / -dy : 1e9;
      for (const L of LVS) { if (L.whole) continue;
        const dist = Math.min(D, REF_OR.AHEAD[L.i]), t = tileOf(K.C.x + dx / fh * dist, K.C.z + dz / fh * dist, L.z); n++;
        if (!(Math.abs(t[0] - (L.ox + L.nx / 2)) <= 1 && Math.abs(t[1] - (L.oy + L.ny / 2)) <= 1) && !bad)
          bad = K.n + ' z' + L.z + ' の窓の中心 (' + (L.ox + L.nx / 2) + ',' + (L.oy + L.ny / 2) + ') ≠ 見る所 (' + t[0].toFixed(2) + ',' + t[1].toFixed(2) + ')';
        if (K.cab && L === LVS[0]) { const c = tileOf(K.C.x, K.C.z, L.z);
          if (!(c[0] >= L.ox + 0.5 && c[0] <= L.ox + L.nx - 0.5 && c[1] >= L.oy + 0.5 && c[1] <= L.oy + L.ny - 0.5) && !bad) bad = '運転台のカメラが近の窓の外'; } }
    }
    const W = LVS.find((L) => L.whole);
    if (!W) bad = bad || '遠の段(地表の全体)が無い';
    else { const ga = X.groundMesh.geometry.attributes.position.array; let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9;
      for (let k = 0; k < ga.length; k += 3) { x0 = Math.min(x0, ga[k]); x1 = Math.max(x1, ga[k]); z0 = Math.min(z0, ga[k + 2]); z1 = Math.max(z1, ga[k + 2]); }
      for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) { const t = tileOf(x, z, W.z);
        if (!(t[0] >= W.ox && t[0] <= W.ox + W.nx && t[1] >= W.oy && t[1] <= W.oy + W.ny) && !bad) bad = '遠の段が地表の隅 (' + x.toFixed(0) + ',' + z.toFixed(0) + ') を覆わない'; } }
    const lvOK = LVS.map((L) => L.z).join(',') === REF_OR.Z.filter((z, i) => i === 2 || REF_OR.N[i] > 0).join(',') && LVS.every((L) => L.whole || L.n === REF_OR.N[L.i]);
    ok('航空写真:窓の置き場', bad === null && lvOK, '視線が地表に当たる所(無ければ近 350m・中 1400m 先)が窓の中心から 1枚以内(lodStruct の後)・運転台は近の窓の中・遠は地表の全体・段 z18/16/14・窓 8×8',
      bad || (lvOK ? n + '件・' + LVS.map((L) => 'z' + L.z + '(' + L.nx + '×' + L.ny + ')').join(' ') : '段の構成が違う ' + LVS.map((L) => 'z' + L.z + ':' + L.n).join(' '))); }
  // (a)(b) 座標・枠と書き込み(今の窓のタイルを全部書かせる)
  OM.update(true);
  { const eMax = [0, 0, 0]; let bad = null, nS = 0, nOk = 0;
    const lastCopy = new Map();
    for (const c of X.renderer.copies) lastCopy.set(c.dst, (lastCopy.get(c.dst) || new Map()).set(c.x + ',' + c.y, c.src));
    for (const L of LVS) { const i = L.i, o = OU['uOr' + i].value, w = OU['uOw' + i].value, q = [OU.uOq.value.x, OU.uOq.value.y, OU.uOq.value.z][i];
      if (L.z !== REF_OR.Z[i] && !bad) bad = '段 ' + i + ' が z' + L.z;
      for (const a of [0.02, 0.25, 0.5, 0.75, 0.98]) for (const b of [0.02, 0.25, 0.5, 0.75, 0.98]) {
        const tx = L.ox + a * L.nx, ty = L.oy + b * L.ny, p = worldOf(tx, ty, L.z), dx = p[0] - o.x, dz = p[1] - o.y;
        eMax[i] = Math.max(eMax[i], Math.max(Math.abs(dx * o.z - (tx - L.ox)), Math.abs(dz * o.w + dz * dz * q - (ty - L.oy))) * 256); }
      const wx = L.whole ? 0 : md(L.ox, L.nx), wy = L.whole ? 0 : md(L.oy, L.ny);
      if (!(w.x === wx && w.y === wy && w.z === L.nx && w.w === L.ny) && !bad) bad = 'z' + L.z + ' の枠の原点 uOw (' + [w.x, w.y, w.z, w.w].join(',') + ') ≠ (' + [wx, wy, L.nx, L.ny].join(',') + ')';
      const T = L.tex;
      if (T !== OU['uOrtho' + i].value && !bad) bad = 'z' + L.z + ' の画像がシェーダの uniform と違う';
      if (!(T.image.width === L.nx * 256 && T.image.height === L.ny * 256 && T.flipY === false && T.wrapS === (L.whole ? 1001 : 1000) && T.wrapT === T.wrapS) && !bad)
        bad = 'z' + L.z + ' の画像 ' + T.image.width + '×' + T.image.height + '・繰り返し ' + T.wrapS + '/' + T.wrapT + '・上下の反転 ' + T.flipY;
      const LC = lastCopy.get(T) || new Map(), lastAny = X.renderer.copies.filter((c) => c.dst === T).pop();
      if (lastAny && !lastAny.mip && !bad) bad = 'z' + L.z + ' の画像の最後の書き込みで縮小の段を作り直していない(遠くの写真が古い段のまま)';
      for (const S of L.slots) { nS++;
        const t = L.whole ? [L.ox + S.sx, L.oy + S.sy] : [L.ox + md(S.sx - L.ox, L.nx), L.oy + md(S.sy - L.oy, L.ny)];
        const url = REF_OR.URL + L.z + '/' + t[0] + '/' + t[1] + '.jpg', got = LC.get(S.sx * 256 + ',' + S.sy * 256);
        if (got === url) nOk++; else if (!bad) bad = 'z' + L.z + ' の枠 (' + S.sx + ',' + S.sy + ') の最後の書き込み ' + got + ' ≠ ' + url; }
    }
    ok('航空写真:座標(Web メルカトル)', eMax.every((e, i) => e <= REF_OR.TOL_PX[i]), 'シェーダの展開が式と 近・中 0.25画素・遠 0.6画素以内', LVS.map((L) => 'z' + L.z + ' ' + eMax[L.i].toFixed(3)).join('・') + '画素');
    ok('航空写真:枠と書き込み', bad === null && nS > 0 && nOk === nS, '枠に入るのは番号が n の剰余で等しいタイル(遠は原点から)・最後の書き込みがその URL で縮小の段も作り直す・画像の大きさと繰り返し', bad || nOk + '/' + nS + '枠'); }
  // (d) 帯の印
  { const MT = OU.uOrthoMask.value, im = MT && MT.image, dat = im && im.data, mw = im && im.width, mh = im && im.height, om = OU.uOm.value;
    const mwt = (x, z) => { const u = (x - om.x) * om.z, v = (z - om.y) * om.w; if (u < 0 || v < 0 || u > 1 || v > 1) return 1;
      const fx = u * mw - 0.5, fy = v * mh - 0.5, i = Math.floor(fx), j = Math.floor(fy), a = fx - i, b = fy - j;
      const g = (ii, jj) => dat[Math.max(0, Math.min(mh - 1, jj)) * mw + Math.max(0, Math.min(mw - 1, ii))];
      return Math.max(0, Math.min(1, ((g(i, j) * (1 - a) + g(i + 1, j) * a) * (1 - b) + (g(i, j + 1) * (1 - a) + g(i + 1, j + 1) * a) * b - 128) * 0.1 + 0.5)); };
    const xr = [[XC.INO, X.XR.U0, X.XR.U1, REF.XRAIL_HALF['井の頭線']], [XC.SETA, X.XR.SETA_U0, X.XR.SETA_U1, REF.XRAIL_HALF['世田谷線']]];
    const nearXR = (x, z) => xr.some(([A, u0, u1, hw]) => { const p = A.uv(x, z); return p.u > u0 - 25 && p.u < u1 + 25 && Math.abs(p.n) < hw + 25; });
    /* 街から外した実際の建物:plateau_bldg.js を検証側で読み、帯の中(重心の s が事業区間・|off|≤DOM.z)の建物のうち街(CITY.buildings)に
       無い物。そのうち足跡(頂点と辺の 2m ごとの点)が構造物の半幅+DECK_CLEAR(4.6m)の内に掛かる物=線路の帯で外した物は、写真では
       屋根が帯の脇の地面に平らに写るので、重心が今の色(写真 0.05 以下)であること。線路から 30m 以上離れて(井の頭線・世田谷線の帯の
       近くも除く)外した物は写真の屋根のまま(0.95 以上が 95% 以上。今の色にすると無地の穴になる)。街にある建物の重心は 99.5% 以上で
       写真(0.95 以上)=外した足跡の印が広がりすぎない(足跡+8m にすると 98.1% になる) */
    const inP = (P, x, z) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[i], b = P[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
    const segD = (P, x, z) => { let d = 1e9; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[j], b = P[i], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
      const u = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)) : 0; d = Math.min(d, Math.hypot(x - a[0] - dx * u, z - a[1] - dz * u)); } return d; };
    const RM = [], KP = [];
    { const fs = require('fs'), pth = require('path'), f = pth.join(pth.dirname(path), 'plateau_bldg.js');
      if (fs.readFileSync(path, 'utf8').includes('<script src="plateau_bldg.js">') && fs.existsSync(f)) {
        const gB = {}; new Function('globalThis', fs.readFileSync(f, 'utf8'))(gB);
        const pb = Buffer.from(gB.PLATEAU_BLDG.b64, 'base64'), N = pb.readUInt32LE(4);
        const kept = new Set(B.filter((e) => e.plateau && e.poly).map((e) => e.poly[0][0].toFixed(1) + ',' + e.poly[0][1].toFixed(1) + ',' + e.h.toFixed(1)));
        for (let n = 0, o = 8; n < N; n++) {
          const nv = pb.readUInt8(o), h = pb.readUInt16LE(o + 1) / 10; o += 4;
          let x = pb.readInt32LE(o), z = pb.readInt32LE(o + 4); o += 8; const P = [[x / 10, z / 10]];
          for (let i = 1; i < nv; i++) { x += pb.readInt16LE(o); z += pb.readInt16LE(o + 2); o += 4; P.push([x / 10, z / 10]); }
          if (P.length < 3 || !(h > 0)) continue;
          let A2 = 0, cx = 0, cz = 0;
          for (let i = 0; i < P.length; i++) { const a = P[i], c = P[(i + 1) % P.length], w = a[0] * c[1] - c[0] * a[1]; A2 += w; cx += (a[0] + c[0]) * w; cz += (a[1] + c[1]) * w; }
          if (Math.abs(A2) < 2) continue; cx /= 3 * A2; cz /= 3 * A2;
          const q = X.prjXY(cx, cz); if (q.s < X.DOM.x0 || q.s > X.DOM.x1 || Math.abs(q.off) > X.DOM.z) continue;
          if (kept.has(P[0][0].toFixed(1) + ',' + P[0][1].toFixed(1) + ',' + h.toFixed(1))) { KP.push({ P: P, cx: cx, cz: cz }); continue; }
          let dmin = 1e9;   // 足跡の点の (|off| − 構造物の半幅) の最小
          for (let i = 0; i < P.length; i++) { const a = P[i], c = P[(i + 1) % P.length], m = Math.max(1, Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1]) / 2));
            for (let k = 0; k < m; k++) { const pq = X.prjXY(a[0] + (c[0] - a[0]) * k / m, a[1] + (c[1] - a[1]) * k / m), sg = pq.off < 0 ? -1 : 1;
              dmin = Math.min(dmin, Math.abs(pq.off) - (pq.s > X.DECK_END ? X.cutHalf(pq.s, sg) : X.deckHalf(pq.s, sg))); } }
          RM.push({ P: P, cx: cx, cz: cz, d: dmin });
        }
      } }
    // 外した足跡の近く(帯の外の検査から除く):格子で引く
    const RG = new Map(), RC = 20; for (const r of RM) { let x0 = 1e9, x1 = -1e9, z0 = 1e9, z1 = -1e9; for (const p of r.P) { x0 = Math.min(x0, p[0]); x1 = Math.max(x1, p[0]); z0 = Math.min(z0, p[1]); z1 = Math.max(z1, p[1]); }
      for (let i = Math.floor((x0 - 5) / RC); i <= Math.floor((x1 + 5) / RC); i++) for (let j = Math.floor((z0 - 5) / RC); j <= Math.floor((z1 + 5) / RC); j++) { const k = i + ',' + j; if (!RG.has(k)) RG.set(k, []); RG.get(k).push(r); } }
    const nearRM = (x, z, d) => (RG.get(Math.floor(x / RC) + ',' + Math.floor(z / RC)) || []).some((r) => inP(r.P, x, z) || segD(r.P, x, z) < d);
    let bad = null, nIn = 0, nOut = 0, nSkip = 0;
    if (!dat || dat.length !== mw * mh || MT.magFilter !== 1006 || MT.minFilter !== 1006) bad = '帯の印の画像が無いか、双線形でない';
    else {
      for (let s = X.DOM.x0 + 1.5; s <= X.DOM.x1 - 1.5 && !bad; s += 5) for (const sg of [-1, 1]) {   // 事業区間の端ちょうどは帯の縁(0.5)
        const hw = s > X.DECK_END ? X.cutHalf(s, sg) : X.deckHalf(s, sg);
        for (const o of [0, sg * hw * 0.5, sg * hw, sg * (hw + REF_OR.BAND_IN)]) { const f = X.frame(s, o), m = mwt(f.x, f.z); nIn++;
          if (m > 0.05 && !bad) bad = '帯の中 s=' + s + ' off=' + o.toFixed(1) + ' の写真の割合 ' + m.toFixed(2); }
        const f = X.frame(s, sg * (hw + REF_OR.BAND_OUT)); if (nearXR(f.x, f.z)) continue;
        if (nearRM(f.x, f.z, REF_OR.HOLE_OUT) || (KARA_DATA && PV.inPlan(f.x, f.z, REF_OR.HOLE_OUT))) { nSkip++; continue; }   // 計画の区域(千歳烏山・明大前)は今の色(4h・4k)
        const m = mwt(f.x, f.z); nOut++;
        if (m < 0.95 && !bad) bad = '帯の外 s=' + s + ' off=' + (sg * (hw + REF_OR.BAND_OUT)).toFixed(1) + ' の写真の割合 ' + m.toFixed(2);
      }
      for (const s of [X.DOM.x0 - REF_OR.END_OUT, X.DOM.x0 - 20, X.DOM.x1 + REF_OR.END_OUT, X.DOM.x1 + 20]) for (const o of [-8, 0, 8]) {
        const f = X.frame(s, o); if (nearRM(f.x, f.z, REF_OR.HOLE_OUT)) continue; const m = mwt(f.x, f.z); nOut++;
        if (m < 0.95 && !bad) bad = '事業区間の外 s=' + s + ' off=' + o + ' の写真の割合 ' + m.toFixed(2); }
      // 井の頭線は実際の線路から REF.INO_CLEAR−1m、世田谷線は中心線から XRAIL_HALF−1m の内(2026-10-27 から曲線の上で。以前の直線の式は
      // 曲線の物に .x/.ax が無く NaN になって素通りしていた。NaN も NG にする)
      for (const [A, u0, u1, hw] of xr) for (let u = u0; u <= u1 && !bad; u += 5) {
        const c = A.pos(u), vs = A === XC.INO ? [-(Math.abs(A.trackV(0, u)) + REF.INO_CLEAR - REF_OR.XR_IN), 0, Math.abs(A.trackV(1, u)) + REF.INO_CLEAR - REF_OR.XR_IN] : [-(REF.XRAIL_HALF['世田谷線'] - REF_OR.XR_IN), 0, REF.XRAIL_HALF['世田谷線'] - REF_OR.XR_IN];
        for (const v of vs) { const m = mwt(c.x + c.nx * v, c.z + c.nz * v); nIn++;
          if (!(m <= 0.05) && !bad) bad = '交差鉄道の帯 u=' + u + ' v=' + v.toFixed(1) + ' の写真の割合 ' + m; } }
    }
    ok('航空写真:線路の帯は今の色', bad === null && nIn > 5000 && nOut > 2000, '構造物の半幅(掘割は側ごと)+3.6m の内・井の頭線と世田谷線の建築限界−1m の内は写真 0.05 以下/+6.7m の外・事業区間の端の 3m 外は 0.95 以上(外した建物の足跡の近くは除く)',
      bad || '内 ' + nIn + '点・外 ' + nOut + '点(外した足跡の近くで除いた ' + nSkip + '点)');
    let rmBad = 0, rmN = 0, rmEx = null, fN = 0, fOK = 0, kOK = 0, kN = 0;
    let kpN = 0, kpOK = 0;
    if (dat) { for (const r of RM) { if (!inP(r.P, r.cx, r.cz)) continue; const m = mwt(r.cx, r.cz);
        if (KARA_DATA && r.P.some((p) => PV.inPlan(p[0], p[1], 2))) { if (PV.planD(r.cx, r.cz) < -0.5) { kpN++; if (m <= 0.05) kpOK++; } continue; }   // 計画の区域と帯で外した物
        if (r.d <= REF.DECK_CLEAR) { rmN++; if (m > 0.05) { rmBad++; if (!rmEx) rmEx = '(' + r.cx.toFixed(0) + ',' + r.cz.toFixed(0) + ') の写真の割合 ' + m.toFixed(2); } }
        else if (r.d >= REF_OR.FAR_RM && !nearXR(r.cx, r.cz)) { fN++; if (m >= 0.95) fOK++; } }
      for (const r of KP) { if (!inP(r.P, r.cx, r.cz)) continue;
        // 高架の南で壁の 1m 付近まで建てた建物(2026-11)のうち、重心が線路の帯(写真を使わない帯)の中の物は今の色でよい
        const pq = X.prjXY(r.cx, r.cz); if (pq.off < 0 && pq.s <= X.DECK_END && pq.s > X.DOM.x0 && -pq.off - X.deckHalf(pq.s, -1) < REF_OR.BAND_OUT) continue;
        kN++; if (mwt(r.cx, r.cz) >= 0.95) kOK++; } }
    ok('航空写真:外した建物の足跡は今の色', rmN >= 100 && rmBad <= rmN * REF_OR.HOLE_MISS && fN >= 50 && fOK >= fN * 0.95 && kN > 9000 && kOK >= kN * REF_OR.KEEP_PHOTO,
      '線路の帯で外した実際の建物(plateau_bldg.js を検証側で読み、足跡が構造物の半幅+4.6m に掛かる物)の重心で写真 0.05 以下(' + (REF_OR.HOLE_MISS * 100) + '% まで)・' +
      REF_OR.FAR_RM + 'm 以上離れて外した建物は写真のまま(95%)・街にある建物の重心は ' + (REF_OR.KEEP_PHOTO * 100) + '% 以上で 0.95 以上',
      '帯で外した ' + rmN + '棟のうち写真が出る ' + rmBad + (rmEx ? '(' + rmEx + ')' : '') + '・離れて外した ' + fN + '棟のうち写真 ' + fOK +
      '・街の ' + kN + '棟のうち写真 ' + kOK + '(' + (kN ? (kOK / kN * 100).toFixed(1) : '-') + '%)');
    if (KARA_DATA) {   // 千歳烏山駅前広場南側地区(計画):区域と 216 の帯の中は今の色(写真は今の建物・道路を写す)
      let bad = null, n = 0;
      for (let x = KV.bb[0]; x <= KV.bb[1]; x += 3) for (let z = KV.bb[2]; z <= KV.bb[3]; z += 3) { if (!(KV.planD(x, z) < -0.6)) continue; n++; const m = mwt(x, z);
        if (m > 0.05 && !bad) bad = '(' + x.toFixed(0) + ',' + z.toFixed(0) + ') の写真の割合 ' + m.toFixed(2); }
      ok('航空写真:計画の区域は今の色', bad === null && n > 1000 && kpN >= 20 && kpOK === kpN, '千歳烏山駅前広場南側地区と補助216号線の帯(kara_ref.js)の縁の 0.6m 内は写真 0.05 以下・そこで外した建物の重心も',
        bad || n + '点・外した建物 ' + kpOK + '/' + kpN);
      // 明大前駅前広場と補助第154号線の帯(meida_ref.js。2026-11)も今の色
      let badM = null, nM = 0;
      for (let x = MV.bb[0]; x <= MV.bb[1]; x += 3) for (let z = MV.bb[2]; z <= MV.bb[3]; z += 3) { if (!(MV.planD(x, z) < -0.6)) continue; nM++; const m = mwt(x, z);
        if (m > 0.05 && !badM) badM = '(' + x.toFixed(0) + ',' + z.toFixed(0) + ') の写真の割合 ' + m.toFixed(2); }
      ok('航空写真:明大前の計画は今の色', badM === null && nM > 300, '明大前駅前広場と補助第154号線の帯(meida_ref.js)の縁の 0.6m 内は写真 0.05 以下', badM || nM + '点');
      // 放射第23号線の帯(h23_ref.js。2026-11)も今の色
      let badH = null, nH = 0;
      for (let x = HV.bb[0]; x <= HV.bb[1]; x += 3) for (let z = HV.bb[2]; z <= HV.bb[3]; z += 3) { if (!(polyDist(HV.O, x, z) < -0.6)) continue; nH++; const m = mwt(x, z);
        if (m > 0.05 && !badH) badH = '(' + x.toFixed(0) + ',' + z.toFixed(0) + ') の写真の割合 ' + m.toFixed(2); }
      ok('航空写真:放射第23号線の計画は今の色', badH === null && nH > 1500, '放射第23号線の帯(h23_ref.js)の縁の 0.6m 内は写真 0.05 以下', badH || nH + '点'); } }
  // (e) 貼る面
  { let bad = null; const cnt = { all: 0, top: 0, roof: 0, none: 0, photo: 0 }, seen = new Set();
    const UN = ['uOrtho0', 'uOrtho1', 'uOrtho2', 'uOrthoMask', 'uOr0', 'uOr1', 'uOr2', 'uOw0', 'uOw1', 'uOw2', 'uOq', 'uOm', 'uOf', 'uOrthoOn', 'uOrthoGain', 'uOrthoSnow', 'uOrthoBand'];
    const comp = (m) => { const sh = { uniforms: {}, vertexShader: 'void main(){\n#include <begin_vertex>\n}', fragmentShader: 'void main(){\n#include <color_fragment>\n#include <emissivemap_fragment>\n}' };
      if (typeof m.onBeforeCompile === 'function') m.onBeforeCompile(sh, X.renderer); return sh; };
    const kind = (o) => { const m = o.material, ud = (m && m.userData) || {};   // [名前, 種類, シェーダの呼び出し]
      if (o === X.groundMesh) return ['地表の網', 'all', 'orthoMix(diffuseColor.rgb,vOrW,1.,1.)'];
      if (ud.bldWin) return ud.bldWinPhoto ? ['PLATEAU の写真の面', 'photo', null] : ['建物', 'roof', 'orthoMix(diffuseColor.rgb,vBW,smoothstep(.5,.7,vBN.y),0.)'];
      if (!o.userData || !o.userData.flat || m === X.MAT_FENCE) return null;
      if (o.name === '水面' || m === X.MAT.roadPlan) return [o.name || '計画の放射23号線', 'none', null];
      if (o.name === '歩道' || m === X.MAT_JOSUI) return [o.name || '玉川上水', 'top', 'orthoMix(diffuseColor.rgb,vOrW,smoothstep(.5,.7,vOrN.y),0.)'];
      return ['地表に敷いた面', 'all', 'orthoMix(diffuseColor.rgb,vOrW,1.,0.)']; };
    X.scene.traverse((o) => {
      if (bad || !o.isMesh || !o.material || Array.isArray(o.material)) return;
      const k = kind(o); if (!k) return;
      cnt[k[1] === 'photo' ? 'none' : k[1]]++; if (k[1] === 'photo') cnt.photo++;
      if (seen.has(o.material)) return; seen.add(o.material);
      const sh = comp(o.material), ud = o.material.userData || {}, fs = sh.fragmentShader, at = fs.indexOf('#include <color_fragment>');
      const tag = k[2] ? k[1] : undefined;
      if (k[2] ? !(fs.indexOf(k[2]) > at && at >= 0 && UN.every((u) => sh.uniforms[u] === OU[u]) && sh.vertexShader.includes(o === X.groundMesh || k[1] !== 'roof' ? 'vOrW=' : 'vBW=')) : fs.includes('orthoMix('))
        bad = k[0] + (o.name ? '(' + o.name + ')' : '') + ' のシェーダ:' + (k[2] || '航空写真なし') + ' でない';
      else if (ud.ortho !== tag || !!ud.orthoBand !== (o === X.groundMesh)) bad = k[0] + ' の材質の印 ortho=' + ud.ortho + '・orthoBand=' + ud.orthoBand;
    });
    ok('航空写真:貼る面', bad === null && cnt.all >= 2 && cnt.top >= 2 && cnt.roof > 0 && cnt.none >= 2,
      '地表の網=全面+帯の灰・道路と緑地=全面・歩道と玉川上水=上面・建物=屋根・水面と計画道路と PLATEAU の写真の面=無し(onBeforeCompile の結果と uniform)',
      bad || '全面 ' + cnt.all + '・上面 ' + cnt.top + '・屋根 ' + cnt.roof + '・無し ' + cnt.none + '(うち写真の面 ' + cnt.photo + ')'); }
  // (f) 明るさ
  { const C = X.CINE, g = () => OU.uOrthoGain.value, gc = () => X.MAT.ground.color.g, s2l = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
    C.setTime('noon'); C.setSeason('summer'); C.setWeather('clear');
    const g0 = g().x, c0 = gc(), bv = OU.uOrthoBand.value, band = [bv.x, bv.y, bv.z, bv.w], sn0 = OU.uOrthoSnow.value.w;
    const bw = [(REF_OR.BAND_HEX >> 16) & 255, (REF_OR.BAND_HEX >> 8) & 255, REF_OR.BAND_HEX & 255].map((v) => s2l(v / 255));
    C.setTime('night'); const gN = g().x, cN = gc();
    C.setTime('noon'); C.setWeather('rain'); const gR = g().x, cR = gc();
    C.setWeather('snow'); const snW = OU.uOrthoSnow.value.w;
    C.setWeather('clear'); const g1 = g().x;
    const okB = band.slice(0, 3).every((v, i) => Math.abs(v - bw[i]) < 1e-4) && band[3] === 1;
    ok('航空写真:明るさ', Math.abs(g0 - REF_OR.GAIN) < 1e-6 && Math.abs(gN / g0 - REF_OR.NIGHT) < 1e-6 && Math.abs(gN / g0 - cN / c0) < 1e-6 && Math.abs(gR / g0 - cR / c0) < 1e-6 && gR < g0 &&
      sn0 === 0 && snW >= REF_OR.SNOW_MIN && Math.abs(g1 - g0) < 1e-9 && g().y === g().x && g().z === g().x && okB,
      '昼・夏・晴れ 0.65・夜は 0.55 倍(地表と同じ比)・雨は地表と同じ比・雪は白へ 0.5 以上・帯の灰 #8f8d88',
      '昼 ' + g0.toFixed(3) + '・夜 ' + (gN / g0).toFixed(3) + '倍(地表 ' + (cN / c0).toFixed(3) + ')・雨 ' + (gR / g0).toFixed(3) + '倍(地表 ' + (cR / c0).toFixed(3) + ')・雪 ' + snW.toFixed(2) +
      '・帯 ' + band.slice(0, 3).map((v) => v.toFixed(4)).join(',') + (okB ? '' : '(期待 ' + bw.map((v) => v.toFixed(4)).join(',') + ')')); }
  // (g) 切替
  { const wm = X.LU.waterMesh, needW = !!(X.LU.water && X.LU.water.length);
    OM.setOn(false); const f0 = [OU.uOrthoOn.value, wm ? wm.visible : null, OM.on];
    OM.setOn(true); const f1 = [OU.uOrthoOn.value, wm ? wm.visible : null, OM.on];
    ok('航空写真:切替', f0[0] === 0 && f0[2] === false && f1[0] === 1 && f1[2] === true && (needW ? !!wm && f0[1] === true && f1[1] === false : true),
      'OFF:uOrthoOn=0・水面を出す/ON:1・写真が読めていれば水面を隠す', 'OFF ' + f0.join(',') + '/ON ' + f1.join(',') + (needW && !wm ? '(水面の Mesh が登録されていない)' : '')); }
  // (h) 読めないタイル(画像の読み込みを全部失敗させて、これまでの窓から離れた所を見る)
  { const RealImage = global.Image, failed = new Set();
    global.Image = class { constructor() { this.onload = null; this.onerror = null; this._src = ''; } set src(v) { this._src = v; failed.add(v); if (this.onerror) this.onerror(); } get src() { return this._src; } };
    const st0 = OM.stat(), nc0 = X.renderer.copies.length, sF = X.DOM.x1 - 200;
    aim(X.frame(sF - 150, 0), 300, X.frame(sF, 0), 0); X.lodStruct(); OM.update(true);
    const st1 = OM.stat(), L0 = LVS[0], stray = X.renderer.copies.slice(nc0).filter((c) => failed.has(c.src)).length;
    const last = new Map(); for (const c of X.renderer.copies) if (c.dst === L0.tex) last.set(c.x + ',' + c.y, c.src);
    const kept = L0.slots.filter((S) => S.ok || last.get(S.sx * 256 + ',' + S.sy * 256) !== 'data').length;
    global.Image = RealImage;
    ok('航空写真:読めないタイル', stray === 0 && kept === 0 && st1.pending === 0 && st1.fails - st0.fails >= L0.slots.length && !OM.dead,
      '書かない(近の枠は α=0 で塗ったまま=前の窓のタイルが残らない)・待ちに数えない・前に読めていれば止めない',
      '新たな失敗 ' + (st1.fails - st0.fails) + '枚・塗っていない近の枠 ' + kept + '・読めなかったタイルの書き込み ' + stray + '・待ち ' + st1.pending + (OM.dead ? '・止めた' : '')); }
}

/* ---- 出力 ---------------------------------------------------------------- */
/* ---- 自動車と歩く人(利用者指示)。検証側の決まり:2分間、描いたインスタンスの位置がいつも道路の面(PLATEAU の道路区域。
   自動車専用の橋梁は除く)の上・高架の柱から2.5m 以上・自動車道の橋脚から2m 以上、2車線の道では進行方向の左を走る(左側通行)。
   2026-10-12 利用者指示:車と人は線路から 50m 以内だけ(同日の指示で 100m に)・トラックやバスも・環七・環八・甲州街道・井の頭通りは渋滞
   (同日の指示で密度を半分に)・ほかの道の車は1.5倍に・歩道を人が歩く。
   ・線路から 100m(REF_RD.NEAR)以内。車種はトラック・バスとも 5台以上
   ・渋滞の道(環七・環八の交わる所 ±40m と、線路に並ぶ幹線):車線の長さあたり 15〜26m に1台(以前の約9m の半分の密度)、平均の速さが 4m/s 未満。
     ほかの道は 5m/s 以上で、2車線の道は 60m に1台以上(以前の 80m の1.5倍)。同じ車線の車どうしが重ならない(車の長さの半分の和+1m 以上)
   ・歩く人は歩道(登録簿 SIDEWALKS の帯の幅の内)の上・線路から 50m 以内で、歩いている(脚を振る量1・2分で位置が変わる) ---- */
if (X.ROADS_PL.length) {
  const REF_RD = { HEAD_DEG: 6, YAW_DEG_M: 2.5, NEAR: 100, MIN_TRUCK: 5, MIN_BUS: 5, HEAVY_SP_MAX: 26, FREE_SP: 60, HEAVY_SP: 15, HEAVY_V: 4, FREE_V: 5, GAP: 1.0, HEAVY_X: [X.KAN7_X, X.KANPACHI_X, X.KYU_INOKA_X] };   // 環七・環八・井の頭通り
  const C = X.RD_CARS, M = C.meshes || {};
  ok('自動車の台数', C.length >= 40 && X.RD_LANES.length >= 20, '40台以上・20車線以上', C.length + '台・' + X.RD_LANES.length + '車線');
  const nk = (k) => C.filter((c) => c.kind === k).length;
  ok('トラック・バスも走る', nk('truck') >= REF_RD.MIN_TRUCK && nk('bus') >= REF_RD.MIN_BUS, 'トラック・バス各 5台以上', 'トラック' + nk('truck') + '・バス' + nk('bus') + '・乗用車' + nk('car') + '・軽バン' + nk('van'));
  const inPoly = (P, x, z) => { let c = false; for (let i = 0, j = P.length - 1; i < P.length; j = i++) {
    const a = P[i], b = P[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; };
  const ground = X.ROADS_PL.filter((R) => !(R.k === 2 && R.sec === 2));
  // 隣り合う道路区域の多角形の継ぎ目(データの 0.1m ほどのすき間)は道路の上とみなす:多角形の内か、縁から 0.2m 以内
  const SEAM = 0.2;
  const edgeD = (P, x, z) => { let d = 1e9; for (let i = 0, j = P.length - 1; i < P.length; j = i++) { const a = P[j], b = P[i], dx = b[0] - a[0], dz = b[1] - a[1], L2 = dx * dx + dz * dz;
    const u = L2 ? Math.max(0, Math.min(1, ((x - a[0]) * dx + (z - a[1]) * dz) / L2)) : 0; d = Math.min(d, Math.hypot(x - a[0] - dx * u, z - a[1] - dz * u)); } return d; };
  const onRoad = (x, z) => ground.some((R) => x >= R.bb[0] - SEAM && x <= R.bb[1] + SEAM && z >= R.bb[2] - SEAM && z <= R.bb[3] + SEAM && (inPoly(R.P, x, z) || edgeD(R.P, x, z) < SEAM));
  const cols = []; for (const c of X.VIA_COLS) for (const o of c.offs) { const f = X.frame(c.s, o); cols.push([f.x, f.z]); }
  // 描くのは近い車だけ(carsDraw)。検証では全台を書かせて測る。遠い車を描かないことも見る
  { const cp = X.camera.position; cp.set(-9000, 50, 3000); X.carsDraw(); const nDraw = Object.values(M).reduce((a, m) => a + m.count, 0);
    ok('遠い車は描かない', nDraw < C.length, 'カメラから遠い車はインスタンスに書かない', nDraw + '/' + C.length + '台'); }
  X.carsDraw(true);
  const posOf = (c) => { const q = M[c.kind] && M[c.kind].mats && M[c.kind].mats[c.mi]; if (!q) return null; const Q = q.q;   // 向き=インスタンスの回転の +x
    return { x: q.p.x, z: q.p.z, hx: Q ? 1 - 2 * (Q.y * Q.y + Q.z * Q.z) : NaN, hz: Q ? 2 * (Q.x * Q.z - Q.w * Q.y) : NaN }; };
  let bad = null, left = 0, right = 0, moved = 0, far = 0, ovl = null, hd = { n: 0, worst: 0, at: null, yaw: 0, yat: null }, h23n = 0, h23bad = null;
  const prev = C.map(posOf);
  const vs = { h: [0, 0], f: [0, 0] };
  for (let k = 0; k < 240 && !bad; k++) {
    X.stepRoadCars(0.5); X.carsDraw(true);
    C.forEach((c, i) => {
      if (bad) return;
      const q = posOf(c); if (!q) { bad = '位置が無い ' + i; return; }
      const x = q.x, z = q.z;
      if (!onRoad(x, z)) bad = '道路の外 x=' + x.toFixed(0) + ' z=' + z.toFixed(0);
      else if (cols.some((p) => Math.hypot(p[0] - x, p[1] - z) < 2.5)) bad = '高架の柱に近い x=' + x.toFixed(0);
      else if (X.EXPY.piers.some((p) => Math.hypot(p[0] - x, p[1] - z) < 2.0)) bad = '自動車道の橋脚に近い';
      if (Math.abs(X.prjXY(x, z).off) > REF_RD.NEAR + 0.5 && c.lane.kind !== '放23') far++;   // 放射第23号線は全区間を走る(2026-11 利用者指示)
      if (c.lane.kind === '放23') { h23n++; if (!HV.inPlan(x, z, 0.3) && !h23bad) h23bad = '放射第23号線の帯の外 x=' + x.toFixed(0) + ' z=' + z.toFixed(0); }
      const pv = prev[i], dx = x - pv.x, dz = z - pv.z, d = Math.hypot(dx, dz);
      const heavyRoad = c.lane.kind === '並' || REF_RD.HEAVY_X.some((h) => Math.abs(X.prjXY(c.lane.cx || x, c.lane.cz || z).s - h) < 40);
      if (d < 20) { const g = heavyRoad ? vs.h : vs.f; g[0] += d / 0.5; g[1]++; }
      if (d > 0.5 && d < 20) {                                       // 向き=進んだ向き(0.5秒の弦)・向きの変わり方(1m あたり)
        const hl = Math.hypot(q.hx, q.hz), pl = Math.hypot(pv.hx, pv.hz), a = Math.acos(Math.max(-1, Math.min(1, (dx * q.hx + dz * q.hz) / d / hl))) * 180 / Math.PI;
        const y = Math.acos(Math.max(-1, Math.min(1, (q.hx * pv.hx + q.hz * pv.hz) / hl / pl))) * 180 / Math.PI / d; hd.n++;
        if (!(a <= hd.worst)) { hd.worst = a; hd.at = c.lane.kind + ' s=' + X.prjXY(x, z).s.toFixed(0); }
        if (!(y <= hd.yaw)) { hd.yaw = y; hd.yat = c.lane.kind + ' s=' + X.prjXY(x, z).s.toFixed(0); } }
      if (d > 0.3 && d < 20 && c.lane.off > 0) {                     // 端での入り直し(大きく跳ぶ)は除く
        moved++;
        // 車の位置から道路の中心線への横の向き。中心線:横切る道は (cx,cz)+(dx,dz)t、並ぶ道は線路の s での中心 oc(s)
        let px, pz;
        if (c.lane.kind === '並') { const s = X.prjXY(x, z).s, f = X.frame(s, c.lane.oc(s)); px = x - f.x; pz = z - f.z; }
        else if (c.lane.kind === '放23') { let bd = 1e9; for (let i = 0; i + 1 < HV.C.length; i++) { const a = HV.C[i], b = HV.C[i + 1], ex = b[0] - a[0], ez = b[1] - a[1], L2 = ex * ex + ez * ez, u = Math.max(0, Math.min(1, ((x - a[0]) * ex + (z - a[1]) * ez) / L2)), qx = a[0] + ex * u, qz = a[1] + ez * u, dd = Math.hypot(x - qx, z - qz); if (dd < bd) { bd = dd; px = x - qx; pz = z - qz; } } }   // 検証側の中心線(h23_ref.js)
        else { const L = c.lane, t = (x - L.cx) * L.dx + (z - L.cz) * L.dz; px = x - (L.cx + L.dx * t); pz = z - (L.cz + L.dz * t); }
        if (px * (dz / d) + pz * (-dx / d) > 0) left++; else right++;
      }
      prev[i] = q;
    });
    // 同じ車線で重ならない
    if (!ovl) for (const L of X.RD_LANES) {
      const A = C.filter((c) => c.lane === L).map((c) => ({ c: c, p: posOf(c) })).filter((q) => q.p);
      for (let i = 0; i < A.length && !ovl; i++) for (let j = i + 1; j < A.length; j++) {
        const d = Math.hypot(A[i].p.x - A[j].p.x, A[i].p.z - A[j].p.z);
        if (d < (A[i].c.L + A[j].c.L) / 2 + REF_RD.GAP - 0.01 && d > 0.01) { ovl = '重なり ' + d.toFixed(1) + 'm'; break; }
      }
    }
  }
  ok('自動車は道路の上を走る', bad === null, '2分間:道路の面の上・柱から2.5m・橋脚から2m', bad || C.length + '台×240回');
  ok('自動車は左側通行', left > 0 && right === 0 && moved > 1000, '2車線の道で進行方向の左', '左' + left + '・右' + right);
  ok('自動車の向きが進む向き', hd.n > 10000 && hd.worst <= REF_RD.HEAD_DEG && hd.yaw <= REF_RD.YAW_DEG_M,
    '進んだ向きとの差 ' + REF_RD.HEAD_DEG + '° 以内・向きの変わり方 ' + REF_RD.YAW_DEG_M + '°/m 以内(2026-10-27 曲がるときに斜めに進んでいた)',
    '最大 ' + hd.worst.toFixed(1) + '°(' + hd.at + ')・' + hd.yaw.toFixed(2) + '°/m(' + hd.yat + ')・' + hd.n + '標本');
  ok('自動車は線路から100m 以内', far === 0, '|off|≦' + REF_RD.NEAR + 'm', far + '回はみ出し');
  { const nL = X.RD_LANES.filter((L) => L.kind === '放23').length, pd = (X.PEDS || []).filter((m) => m.sw && m.sw.h23);
    const pOut = pd.filter((m) => { const q = X.pedPos(m); return !HV.inPlan(q.x, q.z, 0.5); }).length;
    ok('放射第23号線に車と人(2026-11 利用者指示)', nL === 2 && h23n >= 240 * 20 && h23bad === null && pd.length >= 20 && pOut === 0,
      '上下の車線・車 20台以上が帯の上を走る・歩く人 20人以上が帯の上(検証側の h23_ref.js の帯)',
      nL + '車線・' + (h23n / 240).toFixed(0) + '台・人 ' + pd.length + (h23bad ? '・' + h23bad : '') + (pOut ? '・帯の外の人 ' + pOut : '')); }
  // 渋滞:幹線(環七・環八・線路に並ぶ幹線)の車線の密度と速さ
  const hl = X.RD_LANES.filter((L) => L.kind === '並' || REF_RD.HEAVY_X.some((h) => Math.abs(X.prjXY(L.cx, L.cz).s - h) < 40));
  const hlen = hl.reduce((a, L) => a + (L.L1 - L.L0), 0), hn = C.filter((c) => hl.indexOf(c.lane) >= 0).length;
  const hv = vs.h[1] ? vs.h[0] / vs.h[1] : 99, fv = vs.f[1] ? vs.f[0] / vs.f[1] : 0;
  const fl = X.RD_LANES.filter((L) => hl.indexOf(L) < 0 && L.off > 0), flen = fl.reduce((a, L) => a + (L.L1 - L.L0), 0), fn = C.filter((c) => fl.indexOf(c.lane) >= 0).length;
  ok('ほかの道の車(以前の1.5倍)', fn * REF_RD.FREE_SP >= flen && fl.length >= 10, '2車線の道で ' + REF_RD.FREE_SP + 'm に1台以上', fl.length + '車線・' + (flen / Math.max(1, fn)).toFixed(1) + 'm に1台');
  ok('幹線は渋滞', hl.length >= 4 && hn * REF_RD.HEAVY_SP <= hlen && hn * REF_RD.HEAVY_SP_MAX >= hlen && hv < REF_RD.HEAVY_V && fv >= REF_RD.FREE_V && ovl === null,
    '幹線の車線 4本以上・' + REF_RD.HEAVY_SP + '〜' + REF_RD.HEAVY_SP_MAX + 'm に1台(以前の半分)・平均 ' + REF_RD.HEAVY_V + 'm/s 未満(ほかは ' + REF_RD.FREE_V + '以上)・重ならない',
    hl.length + '車線・' + (hlen / Math.max(1, hn)).toFixed(1) + 'm に1台・幹線 ' + hv.toFixed(2) + 'm/s・ほか ' + fv.toFixed(1) + 'm/s' + (ovl ? '・' + ovl : ''));
  // 歩く人
  const PD = X.PEDS || [];
  let bP = null, mv = 0;
  const p0 = PD.map((m) => X.pedPos(m));
  for (let k = 0; k < 120 && !bP; k++) {
    X.stepPeds(1.0);
    for (const m of PD) {
      const q = X.pedPos(m), W = m.sw, f = W.f(m.u), lat = (q.x - f.x) * f.fz - (q.z - f.z) * f.fx;
      if (Math.abs(lat) > W.w / 2 + 1e-3 || !(m.u >= W.a && m.u <= W.b) || !(W.seg || []).some((s) => m.u >= s[0] - 0.01 && m.u <= s[1] + 0.01)) { bP = '歩道の外 u=' + m.u.toFixed(1); break; }
      if (Math.abs(X.prjXY(q.x, q.z).off) > REF_RD.NEAR + 3.5 && !W.h23) { bP = '線路から ' + X.prjXY(q.x, q.z).off.toFixed(0) + 'm'; break; }
    }
  }
  PD.forEach((m, i) => { const q = X.pedPos(m); if (Math.hypot(q.x - p0[i].x, q.z - p0[i].z) > 1) mv++; });
  const swSeg = (X.SIDEWALKS || []).reduce((a, W) => a + (W.seg || []).length, 0);
  ok('歩道を人が歩く', PD.length >= 80 && swSeg > 40 && bP === null && mv >= 0.9 * PD.length, '歩道の帯 40区間以上・80人以上・歩道の上・線路から' + REF_RD.NEAR + 'm・歩いている',
    'の帯 ' + swSeg + '区間・' + PD.length + '人' + (bP ? '・' + bP : '') + '・動いた ' + mv);
}
/* ---- 4h. 千歳烏山駅前広場南側地区(再開発の計画。2026-11 利用者指示)------------------------------------------------
   検証側の基準 tools/kara_ref.js(資料の図を読んだ値。reference/karasuyama/README.md)で:
   ・区域と 216 の帯に既存の建物(PLATEAU)が掛からない・区域の外の木の樹冠が掛からない・帯の中に木が無い
   ・区域の中に道路の面(登録簿 ROADS_PL・描いた平らな面)が無い(駅前広場の Mesh を除く)・216 の帯は道路の面(幹線)で1重に覆われる
   ・216 を横切る所の高架の柱は道路の縁から 1m 以上(帯は検証側の中心線と幅から)
   ・区域の地形は 0
   ・計画のビル(区域の中の PLATEAU でない建物)3棟:高層棟=屋上 140m・基部 21m(免震層の上)・31層・大きさ 41.7m×70.5m・資料の四隅の矩形に収まる、
     低層部=屋根 16m・3階・塔の足跡を含む、ピロティの棟=屋根 16m・基部 0 より上。屋上の機械室の上端=屋上+8.6m
   ・駅前広場の面:頂点が計画の範囲(区域+線路沿いの帯−216 の帯)の中・高さが地表+0/0.12(車道)/0.27(舗装)/0.29(植え込み)
   ・p.20 の再現(2026-11 利用者指示「p.20 の再現度が低い。やり直し」):kara_ref.js の基準点(p.20 の元の画素の色から取った車道 352点・
     舗装 169点)で、描いた面の最も上の面が同じ分類(車道=+0.12/舗装=+0.27 か植え込み +0.29)・p.20 と p.21 の木の記号 66本の 0.5m 内に木
   ・車の出入口:範囲の縁で車道が出るのは補助216号線の西の縁の口(z 560〜594・10m 以上)と桁の縁だけ。駅前通り・バス通りの側へは出ない。
     216 の歩道が口をふさがない(今は 216 の西の歩道が口より北で終わるので起こらないが、歩道の作り方を変えたときの備え)
   ・区域の中の木 55本以上 */
if (KARA_DATA) {
  const inD = (x, z) => polyDist(KV.D, x, z) < 0;
  // 既存の建物・木
  { let bad = null, nIn = 0;
    for (const e of B) { if (!e.plateau || !e.poly) continue; for (const q of pts(e)) if (KV.planD(q.x, q.z) < -0.01 && !bad) bad = '既存の建物 (' + q.x.toFixed(1) + ',' + q.z.toFixed(1) + ') が区域か帯の中'; }
    for (const tr of T) { if (inD(tr.x, tr.z)) { nIn++; if (KV.rowD(tr.x, tr.z) < tr.r - 0.01 && !bad) bad = '区域の木 (' + tr.x.toFixed(1) + ',' + tr.z.toFixed(1) + ') が帯に掛かる'; continue; }
      if (KV.planD(tr.x, tr.z) < tr.r - 0.01 && !bad) bad = '木 (' + tr.x.toFixed(1) + ',' + tr.z.toFixed(1) + ') の樹冠が区域か帯に掛かる'; }
    ok('計画の区域:既存の建物・木が無い', bad === null && nIn >= KR.MIN_TREES, '区域と 216 の帯(kara_ref.js)に既存の建物・木が掛からない・区域の中の木(植栽)' + KR.MIN_TREES + '本以上',
      bad || '区域の中の木 ' + nIn + '本'); }
  // 道路の面
  { let bad = null, nD = 0, nR = 0;
    const RP = X.ROADS_PL.filter((R) => R.bb[1] > KV.bb[0] - 5 && R.bb[0] < KV.bb[1] + 5 && R.bb[3] > KV.bb[2] - 5 && R.bb[2] < KV.bb[3] + 5);
    for (let x = KV.bb[0]; x <= KV.bb[1]; x += 2.7) for (let z = KV.bb[2]; z <= KV.bb[3]; z += 2.7) {
      if (KV.aD(x, z) < -0.5) { nD++; if (RP.some((R) => polyDist(R.P, x, z) < 0) && !bad) bad = '計画の範囲 (' + x.toFixed(0) + ',' + z.toFixed(0) + ') に道路の面(登録簿)'; }
      else if (KV.rowD(x, z) < -0.5) { nR++; const c = RP.filter((R) => polyDist(R.P, x, z) < 0); if ((c.length !== 1 || c[0].k !== 1) && !bad) bad = '216 の帯 (' + x.toFixed(0) + ',' + z.toFixed(0) + ') の道路の面 ' + c.length + '枚' + (c[0] ? '(種別 ' + c[0].k + ')' : ''); } }
    let nTri = 0;
    X.scene.traverse((o) => { if (bad || !o.isMesh || !o.userData || !o.userData.flat || o === X.groundMesh || o.name === '駅前広場' || !o.geometry || !o.geometry.index) return;
      const P = o.geometry.attributes.position.array, I = o.geometry.index.array;
      for (let k = 0; k < I.length && !bad; k += 3) { const a = 3 * I[k], b = 3 * I[k + 1], c = 3 * I[k + 2], x = (P[a] + P[b] + P[c]) / 3, z = (P[a + 2] + P[b + 2] + P[c + 2]) / 3;
        if (x < KV.bb[0] || x > KV.bb[1] || z < KV.bb[2] || z > KV.bb[3]) continue; nTri++;
        if (KV.aD(x, z) < -0.3) bad = (o.name || '面') + ' の三角形 (' + x.toFixed(0) + ',' + z.toFixed(0) + ') が計画の範囲の中'; } });
    ok('計画の区域:道路の面', bad === null && nD > 1500 && nR > 500, '計画の範囲(区域+線路沿いの帯)に既存の道路の面(登録簿・描いた面)が無い・216 の帯は幹線の面で1重に覆われる', bad || '範囲 ' + nD + '点・帯 ' + nR + '点・近くの三角形 ' + nTri); }
  // 柱
  { let bad = null, n = 0, worst = 1e9;
    for (const c of X.VIA_COLS) for (const o of c.offs) { const f = X.frame(c.s, o); if (!KV.near(f.x, f.z, 60)) continue; n++; const d = KV.rowD(f.x, f.z); worst = Math.min(worst, d);
      if (d < REF.XING_COL_CLEAR && !bad) bad = '柱 s=' + c.s.toFixed(0) + ' off=' + o.toFixed(1) + ' が 216 の縁から ' + d.toFixed(2) + 'm'; }
    ok('計画の区域:216 に柱が無い', bad === null && n > 10, '補助216号線(中心線と幅 ' + KR.W216 + 'm)の縁から柱の中心まで ' + REF.XING_COL_CLEAR + 'm 以上', bad || n + '本・最も近い ' + worst.toFixed(2) + 'm'); }
  // 地形
  { let bad = null, n = 0;
    for (let x = KV.bb[0]; x <= KV.bb[1]; x += 5) for (let z = KV.bb[2]; z <= KV.bb[3]; z += 5) { if (!inD(x, z)) continue; n++; const h = X.terH(x, z); if (Math.abs(h) > 1e-6 && !bad) bad = '(' + x.toFixed(0) + ',' + z.toFixed(0) + ') 地表 ' + h.toFixed(3); }
    ok('計画の区域:地形は平ら', bad === null && n > 400, '区域の中の地表 0', bad || n + '点'); }
  // ビル
  { let bad = null; const P = B.filter((e) => !e.plateau && e.poly && (() => { let cx = 0, cz = 0; for (const p of e.poly) { cx += p[0]; cz += p[1]; } return inD(cx / e.poly.length, cz / e.poly.length); })());
    const top = (e) => (e.base || 0) + e.h, H = KR.H;
    const tw = P.slice().sort((a, b) => top(b) - top(a))[0], pod = P.find((e) => (e.base || 0) === 0), wg = P.find((e) => e !== tw && e !== pod);
    if (P.length !== 3 || !tw || !pod || !wg) bad = '区域の中の計画のビルが ' + P.length + '棟';
    else {
      const tx = KV.T.map((p) => p[0]), tz = KV.T.map((p) => p[1]), bx = tw.poly.map((p) => p[0]), bz = tw.poly.map((p) => p[1]);
      const chk = (c, m) => { if (!c && !bad) bad = m; };
      chk(Math.abs(top(tw) - H.top) <= 0.3, '高層棟の屋上 ' + top(tw).toFixed(2) + ' ≠ ' + H.top);
      chk(Math.abs(tw.base - H.iso) <= 0.3, '高層棟の基部 ' + tw.base.toFixed(2) + ' ≠ 免震層の上 ' + H.iso);
      chk(tw.st === H.floors, '高層棟の階数 ' + tw.st + ' ≠ ' + H.floors);
      chk(Math.abs(Math.min(tw.w, tw.d) - KR.TOWER_WD[0]) <= 0.5 && Math.abs(Math.max(tw.w, tw.d) - KR.TOWER_WD[1]) <= 0.5, '高層棟の大きさ ' + tw.w.toFixed(1) + '×' + tw.d.toFixed(1));
      chk(Math.abs(Math.min(...bx) - Math.min(...tx)) <= 0.3 && Math.abs(Math.max(...bx) - Math.max(...tx)) <= 0.3 && Math.abs(Math.min(...bz) - Math.min(...tz)) <= 0.3 && Math.abs(Math.max(...bz) - Math.max(...tz)) <= 0.3, '高層棟が資料の四隅の矩形に合わない');
      chk(Math.abs(top(pod) - H.podium) <= 0.3 && pod.st === H.podFloors, '低層部の屋根 ' + top(pod).toFixed(2) + '・' + pod.st + '階');
      chk(tw.poly.every((p) => polyDist(pod.poly, p[0], p[1]) <= 0.05), '低層部が高層棟の足跡を含まない');
      chk(Math.abs(top(wg) - H.podium) <= 0.3 && wg.base > 0.5, 'ピロティの棟 基部 ' + wg.base + '・屋根 ' + top(wg).toFixed(2));
      let ym = -1e9; X.scene.traverse((o) => { if (o.isMesh && o.name === '再開発ビルの付属') { const a = o.geometry.attributes.position.array; for (let k = 1; k < a.length; k += 3) ym = Math.max(ym, a[k]); } });
      chk(Math.abs(ym - (H.top + H.room)) <= 0.3, '屋上の機械室の上端 ' + ym.toFixed(2) + ' ≠ ' + (H.top + H.room));
    }
    ok('計画の区域:再開発ビル', bad === null, '高層棟 屋上' + KR.H.top + 'm・基部' + KR.H.iso + 'm・' + KR.H.floors + '層・' + KR.TOWER_WD.join('×') + 'm/低層部 ' + KR.H.podium + 'm・' + KR.H.podFloors + '階/機械室 +' + KR.H.room + 'm',
      bad || P.map((e) => (e.base || 0).toFixed(1) + '〜' + top(e).toFixed(1) + 'm・' + e.st + '階').join('/')); }
  // 駅前広場の面
  { let bad = null, n = 0; const ys = new Set(); let mesh = null; X.scene.traverse((o) => { if (o.isMesh && o.name === '駅前広場') mesh = o; });
    if (!mesh) bad = '駅前広場の面が無い';
    else { const a = mesh.geometry.attributes.position.array;
      for (let k = 0; k < a.length; k += 3) { n++; const x = a[k], z = a[k + 2], d = a[k + 1] - X.terH(x, z);
        if (KV.aD(x, z) > 0.01 && !bad) bad = '頂点 (' + x.toFixed(1) + ',' + z.toFixed(1) + ') が計画の範囲の外';
        const y = [0, 0.12, 0.27, 0.29].find((v) => Math.abs(d - v) < 0.002); if (y === undefined && !bad) bad = '頂点 (' + x.toFixed(1) + ',' + z.toFixed(1) + ') 地表+' + d.toFixed(3); else ys.add(y); } }
    ok('計画の区域:駅前広場の面', bad === null && n > 300 && ys.size === 4, '頂点が計画の範囲の中・地表+0(縁石の下)/0.12(車道)/0.27(舗装)/0.29(芝)', bad || n + '頂点・高さ ' + [...ys].sort().join('/')); }
  /* p.20 の再現と車の出入口。描いた '駅前広場' の上向きの面のうち、点の真上で最も高い面の高さ(地表から)を「その点の面」とする */
  { let mesh = null; X.scene.traverse((o) => { if (o.isMesh && o.name === '駅前広場') mesh = o; });
    const TG = new Map(), TC = 4;
    if (mesh) { const a = mesh.geometry.attributes.position.array, nm = mesh.geometry.attributes.normal.array, I = mesh.geometry.index.array;
      for (let k = 0; k < I.length; k += 3) { const v = [I[k], I[k + 1], I[k + 2]]; if (nm[3 * v[0] + 1] < 0.9) continue;
        const T3 = v.map((i) => [a[3 * i], a[3 * i + 1], a[3 * i + 2]]);
        for (let gx = Math.floor(Math.min(...T3.map((p) => p[0])) / TC); gx <= Math.floor(Math.max(...T3.map((p) => p[0])) / TC); gx++)
          for (let gz = Math.floor(Math.min(...T3.map((p) => p[2])) / TC); gz <= Math.floor(Math.max(...T3.map((p) => p[2])) / TC); gz++) {
            const kk = gx + ',' + gz; if (!TG.has(kk)) TG.set(kk, []); TG.get(kk).push(T3); } } }
    const topAt = (x, z) => { let y = null;
      for (const T3 of TG.get(Math.floor(x / TC) + ',' + Math.floor(z / TC)) || []) {
        const [p, q, r] = T3, d = (q[0] - p[0]) * (r[2] - p[2]) - (q[2] - p[2]) * (r[0] - p[0]); if (Math.abs(d) < 1e-12) continue;
        const u = ((x - p[0]) * (r[2] - p[2]) - (z - p[2]) * (r[0] - p[0])) / d, w = ((q[0] - p[0]) * (z - p[2]) - (q[2] - p[2]) * (x - p[0])) / d;
        if (u < -1e-7 || w < -1e-7 || u + w > 1 + 1e-7) continue; const h = p[1] + u * (q[1] - p[1]) + w * (r[1] - p[1]) - X.terH(x, z); if (y === null || h > y) y = h; }
      return y; };
    const cls = (h) => h === null ? '無' : Math.abs(h - 0.12) < 0.01 ? '車' : (Math.abs(h - 0.27) < 0.01 || Math.abs(h - 0.29) < 0.01) ? '舗' : '?' + h.toFixed(2);
    // 基準点
    { let nR = 0, nP = 0; const bad = [], W = (p) => KR.toXY(X, p);
      for (const p of KR.REF_ROAD) { const [x, z] = W(p), c = cls(topAt(x, z)); if (c === '車') nR++; else bad.push('車道の点 (' + x.toFixed(1) + ',' + z.toFixed(1) + ')=' + c); }
      for (const p of KR.REF_PAVE) { const [x, z] = W(p), c = cls(topAt(x, z)); if (c === '舗') nP++; else bad.push('舗装の点 (' + x.toFixed(1) + ',' + z.toFixed(1) + ')=' + c); }
      ok('計画の区域:p.20 の車道と舗装', mesh !== null && bad.length === 0 && KR.REF_ROAD.length > 300 && KR.REF_PAVE.length > 150,
        'p.20 の元の画素から取った基準点(kara_ref.js)の真上の面が同じ分類(車道 +0.12/舗装 +0.27・植え込み +0.29)', bad.length ? bad.slice(0, 3).join(' ') + ' ほか 計' + bad.length + '点' : '車道 ' + nR + '点・舗装 ' + nP + '点'); }
    // 木
    { const T2 = T.filter((t) => t.kind === '広場'); let n = 0, worst = 0;
      for (const p of KR.REF_TREES) { const [x, z] = KR.toXY(X, p); let d = 1e9; for (const t of T2) d = Math.min(d, Math.hypot(t.x - x, t.z - z)); worst = Math.max(worst, d); if (d <= 0.5) n++; }
      ok('計画の区域:p.20・p.21 の木', n === KR.REF_TREES.length, 'p.20・p.21 の木の記号(kara_ref.js)' + KR.REF_TREES.length + '本の 0.5m 内に計画の木', n + '本(最も遠い ' + worst.toFixed(2) + 'm)'); }
    /* 車の出入口(2026-11 利用者指摘「道路の繋がる方向が逆」):区域の縁の 0.3m 内を 0.5m ごとに見て、車道の所は補助216号線の西の縁
       (z が MOUTH の範囲)か桁の縁(線路沿いの帯に接する所)だけ。西の駅前通り・南のバス通りの側には出ない。216 の歩道は口で切れる */
    { let bad = null, mouth = 0; const M = KR.MOUTH;
      const ccwD = ((P) => { let A = 0; for (let i = 0; i < P.length; i++) A += P[i][0] * P[(i + 1) % P.length][1] - P[(i + 1) % P.length][0] * P[i][1]; return A > 0 ? P : P.slice().reverse(); })(KV.D);
      for (let i = 0; i < ccwD.length; i++) { const a = ccwD[i], b = ccwD[(i + 1) % ccwD.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(L / 0.5);
        const nx = (b[1] - a[1]) / L, nz = -(b[0] - a[0]) / L;            // 反時計回りの右=外
        for (let k = 0; k <= n; k++) { const x = a[0] + (b[0] - a[0]) * k / n, z = a[1] + (b[1] - a[1]) * k / n, xi = x - nx * 0.3, zi = z - nz * 0.3;
          if (KV.aD(xi, zi) > -0.2 || cls(topAt(xi, zi)) !== '車') continue;
          if (KV.rowD(x, z) <= 0.3) { if (z >= M.within[0] && z <= M.within[1]) mouth += L / n; else if (!bad) bad = '216 の縁の口の外 (' + x.toFixed(1) + ',' + z.toFixed(1) + ') が車道'; }
          else if (KV.stripD(x, z) > 0.3 && !bad) bad = '区域の縁 (' + x.toFixed(1) + ',' + z.toFixed(1) + ') で車道が外へ出る(216 でも桁の縁でもない)'; } }
      let swBad = null;
      for (const W of X.SIDEWALKS || []) for (const [u0, u1] of W.seg || []) for (const u of [u0, (u0 + u1) / 2, u1]) { const q = W.f(u);
        if (!KV.near(q.x, q.z, 5)) continue;
        for (const sd of [1, -1]) { const xx = q.x + sd * q.fz * (W.w / 2 + 0.6), zz = q.z - sd * q.fx * (W.w / 2 + 0.6);
          if (KV.aD(xx, zz) < -0.2 && cls(topAt(xx, zz)) === '車' && !swBad) swBad = '216 の歩道 (' + q.x.toFixed(1) + ',' + q.z.toFixed(1) + ') が車道の口をふさぐ'; } }
      ok('計画の区域:ロータリーの出入口は東の216へ', mesh !== null && bad === null && swBad === null && mouth >= M.minLen, '車道が区域の縁に出るのは補助216号線の西の縁の口(z ' + M.within.join('〜') + '・' + M.minLen + 'm 以上)と桁の縁だけ・216 の歩道は口で切れる',
        bad || swBad || '口 ' + mouth.toFixed(1) + 'm'); }
    /* 駅前広場の人と車(2026-11 利用者指示「更なるクオリティアップ」。推定):バス 1台・タクシー 2台以上が車道の面(+0.12)の上(車の外形の
       縁と中の 0.5m ごとの点)で互いに重ならない・人 30人以上(立つ人の足元と往復する人の道の 0.5m ごとの点が舗装(+0.27)の上)・
       往復する人が動く・街灯の柱 10本以上が舗装の上で、8b章の灯り(ROAD_LAMPS)に入っている */
    if (X.KPZ) { let bad = null; const Z = X.KPZ;
      for (const v of Z.veh) { const L = v.L, wv = 1.9;
        for (let u = -L / 2; u <= L / 2 + 1e-6 && !bad; u += 0.5) for (const s of [-wv / 2, 0, wv / 2]) { const x = v.x + v.fx * u - v.fz * s, z = v.z + v.fz * u + v.fx * s, c = cls(topAt(x, z));
          if (c !== '車') { bad = v.kind + ' (' + v.x.toFixed(1) + ',' + v.z.toFixed(1) + ') の点 (' + x.toFixed(1) + ',' + z.toFixed(1) + ')=' + c; break; } }
        for (const w of Z.veh) if (w !== v && Math.hypot(w.x - v.x, w.z - v.z) < (w.L + v.L) / 2 * 0.9 && Math.abs(w.fx * v.fx + w.fz * v.fz) > 0.9 && Math.abs((w.x - v.x) * -v.fz + (w.z - v.z) * v.fx) < 2.0 && !bad) bad = '車が重なる (' + v.x.toFixed(1) + ',' + v.z.toFixed(1) + ')'; }
      const nBus = Z.veh.filter((v) => v.kind === 'bus').length, nTx = Z.veh.filter((v) => v.kind === 'car').length;
      for (const p of Z.people) { const c = cls(topAt(p.x, p.z)); if (c !== '舗' && !bad) bad = '人 (' + p.x.toFixed(1) + ',' + p.z.toFixed(1) + ')=' + c; if (Math.abs(p.y - X.terH(p.x, p.z) - 0.27) > 0.01 && !bad) bad = '人 (' + p.x.toFixed(1) + ',' + p.z.toFixed(1) + ') の高さ'; }
      for (const w of Z.walk) for (let u = 0; u <= w.L; u += 0.5) { const x = w.ax + w.dx * u, z = w.az + w.dz * u, c = cls(topAt(x, z)); if (c !== '舗' && !bad) bad = '往復する人の道 (' + x.toFixed(1) + ',' + z.toFixed(1) + ')=' + c; }
      const path = Z.walk.map(() => 0); for (let k = 0; k < 20; k++) { const u0 = Z.walk.map((w) => w.u); X.plazaStep(0.1); Z.walk.forEach((w, i) => { path[i] += Math.abs(w.u - u0[i]); }); }
      const moved = path.filter((d) => d > 1).length;   // 2秒に歩いた道のり 1m 以上(端で折り返しても)
      const LP = X.KARA_LAMPS || [], inRL = LP.filter((q) => X.ROAD_LAMPS.some((r) => r[0] === q[0] && r[1] === q[1])).length;
      for (const q of LP) { const c = cls(topAt(q[0], q[1])); if (c !== '舗' && !bad) bad = '街灯 (' + q[0].toFixed(1) + ',' + q[1].toFixed(1) + ')=' + c; }
      const nP = Z.people.length + Z.walk.length;
      ok('計画の区域:駅前広場の人と車', bad === null && nBus === 1 && nTx >= 2 && nP >= 30 && moved === Z.walk.length && LP.length >= 10 && inRL === LP.length,
        'バス 1・タクシー 2以上が車道の上で重ならない・人 30以上が舗装の上・往復する人が動く・街灯 10本以上が舗装の上で夜の灯りに入る',
        bad || 'バス ' + nBus + '・タクシー ' + nTx + '・人 ' + nP + '(往復 ' + Z.walk.length + '・動いた ' + moved + ')・街灯 ' + LP.length); }
    else ok('計画の区域:駅前広場の人と車', false, 'KPZ がある', '無い'); }
} else ok('計画の区域', !KARA_DATA, '実データが無いときは描かない', '-');

/* ---- 4k. 明大前駅前広場と補助第154号線(都市計画。2026-11 利用者指示「明大前駅の駅前広場の計画を盛り込んで」)----------------
   検証側の形 MV(tools/meida_ref.js。区の事業案内図の赤い線と公表の値)で:
   (a) 広場の面積が公表(交通広場 約2,700m²+区画街路 幅21m・延長12m)の範囲・154 の中心線が公表の 206m の ±5%
   (b) 広場と帯の中に既存の建物(PLATEAU)・木が無い(樹冠も)/広場の木(推定の位置)が広場の中・帯の外に MIN_TREES 本以上
   (c) 広場に道路の面(登録簿・描いた面)が無い・154 の帯は幹線の面1枚で覆われる
   (d) 京王線の高架の柱が 154 の縁から XING_COL_CLEAR 以上(154 は京王線の下を斜めに横切る)
   (e) 広場と帯の中の地表が 0
   (f) 広場の面 '明大前駅前広場':頂点が広場の中・高さは 地表+0/0.12(車道)/0.27(舗装)/0.29(島の植え込み)・広場の中の点の真上の面が車道か舗装で、
       車道が広場の 30〜75%・車道が広場の縁に出るのは東の辺(154)の 10〜16m だけ(取付道路の車道。区画街路の幅 21m の中)・154 の西の歩道は口で切れる
   (g) バス・タクシーが車道の上(中心と前後の端)・人が舗装の上(MIN_PEOPLE 人以上)・街灯が舗装の上(MIN_LAMPS 本以上)
   (h) 航空写真:広場と帯の中は今の色(帯の印 0.05 以下) */
if (KARA_DATA) {
  const inD = (x, z) => polyDist(MV.D, x, z) < 0;
  { const okA = MV.area >= MR.AREA[0] && MV.area <= MR.AREA[1], okL = Math.abs(MV.len - MR.LEN154) <= MR.LEN154 * 0.05;
    ok('明大前:広場と 154 の大きさ', okA && okL, '広場 ' + MR.AREA.join('〜') + 'm²・154 の中心線 公表 ' + MR.LEN154 + 'm の ±5%', '広場 ' + MV.area.toFixed(0) + 'm²・154 ' + MV.len.toFixed(1) + 'm'); }
  { let bad = null, nT = 0;
    for (const e of B) { if (!e.plateau || !e.poly) continue; for (const q of pts(e)) if (MV.planD(q.x, q.z) < -0.01 && !bad) bad = '既存の建物 (' + q.x.toFixed(1) + ',' + q.z.toFixed(1) + ') が広場か 154 の帯の中'; }
    for (const tr of T) { if (tr.kind === '明大前広場') { if (inD(tr.x, tr.z) && MV.rowD(tr.x, tr.z) >= tr.r - 0.01) nT++; else if (!bad) bad = '広場の木 (' + tr.x.toFixed(1) + ',' + tr.z.toFixed(1) + ') が広場の外か帯に掛かる'; continue; }
      if (MV.planD(tr.x, tr.z) < tr.r - 0.01 && !bad) bad = '木 (' + tr.x.toFixed(1) + ',' + tr.z.toFixed(1) + ') の樹冠が広場か 154 の帯に掛かる'; }
    ok('明大前:既存の建物と木が無い・広場の木', bad === null && nT >= MR.MIN_TREES, '広場と帯に既存の建物・木が無い・広場の木 ' + MR.MIN_TREES + '本以上', bad || '広場の木 ' + nT + '本'); }
  { let bad = null, nD = 0, nR = 0;
    const RP = X.ROADS_PL.filter((R) => R.bb[1] > MV.bb[0] - 5 && R.bb[0] < MV.bb[1] + 5 && R.bb[3] > MV.bb[2] - 5 && R.bb[2] < MV.bb[3] + 5);
    for (let x = MV.bb[0]; x <= MV.bb[1]; x += 2.3) for (let z = MV.bb[2]; z <= MV.bb[3]; z += 2.3) {
      if (polyDist(MV.D, x, z) < -0.5) { nD++; if (RP.some((R) => polyDist(R.P, x, z) < 0) && !bad) bad = '広場 (' + x.toFixed(0) + ',' + z.toFixed(0) + ') に道路の面(登録簿)'; }
      else if (MV.rowD(x, z) < -0.5) { nR++; const c = RP.filter((R) => polyDist(R.P, x, z) < 0); if ((c.length !== 1 || c[0].k !== 1) && !bad) bad = '154 の帯 (' + x.toFixed(0) + ',' + z.toFixed(0) + ') の道路の面 ' + c.length + '枚' + (c[0] ? '(種別 ' + c[0].k + ')' : ''); } }
    let nTri = 0;
    X.scene.traverse((o) => { if (bad || !o.isMesh || !o.userData || !o.userData.flat || o === X.groundMesh || o.name === '明大前駅前広場' || !o.geometry || !o.geometry.index) return;
      const P = o.geometry.attributes.position.array, I = o.geometry.index.array;
      for (let k = 0; k < I.length && !bad; k += 3) { const a = 3 * I[k], b = 3 * I[k + 1], c = 3 * I[k + 2], x = (P[a] + P[b] + P[c]) / 3, z = (P[a + 2] + P[b + 2] + P[c + 2]) / 3;
        if (!MV.near(x, z, 1)) continue; nTri++;
        if (polyDist(MV.D, x, z) < -0.3) bad = (o.name || '面') + ' の三角形 (' + x.toFixed(0) + ',' + z.toFixed(0) + ') が広場の中'; } });
    ok('明大前:道路の面', bad === null && nD > 300 && nR > 300, '広場に既存の道路の面(登録簿・描いた面)が無い・154 の帯は幹線の面で1重に覆われる', bad || '広場 ' + nD + '点・帯 ' + nR + '点・近くの三角形 ' + nTri); }
  { let bad = null, n = 0, worst = 1e9;
    for (const c of X.VIA_COLS) for (const o of c.offs) { const f = X.frame(c.s, o); if (!MV.near(f.x, f.z, 60)) continue; n++; const d = MV.rowD(f.x, f.z); worst = Math.min(worst, d);
      if (d < REF.XING_COL_CLEAR && !bad) bad = '柱 s=' + c.s.toFixed(0) + ' off=' + o.toFixed(1) + ' が 154 の縁から ' + d.toFixed(2) + 'm'; }
    ok('明大前:154 に柱が無い', bad === null && n > 10, '補助第154号線(中心線と幅 ' + MR.W154 + 'm)の縁から柱の中心まで ' + REF.XING_COL_CLEAR + 'm 以上', bad || n + '本・最も近い ' + worst.toFixed(2) + 'm'); }
  { let bad = null, n = 0;
    for (let x = MV.bb[0]; x <= MV.bb[1]; x += 4) for (let z = MV.bb[2]; z <= MV.bb[3]; z += 4) { if (!(MV.planD(x, z) < 0)) continue; n++; const h = X.terH(x, z); if (Math.abs(h) > 1e-6 && !bad) bad = '(' + x.toFixed(0) + ',' + z.toFixed(0) + ') 地表 ' + h.toFixed(3); }
    ok('明大前:地形は平ら', bad === null && n > 300, '広場と帯の中の地表 0', bad || n + '点'); }
  // 広場の面
  { let mesh = null; X.scene.traverse((o) => { if (o.isMesh && o.name === '明大前駅前広場') mesh = o; });
    let bad = mesh ? null : '明大前駅前広場の面が無い', nV = 0; const ys = new Set();
    const TG = new Map(), TC = 4;
    if (mesh) { const a = mesh.geometry.attributes.position.array, nm = mesh.geometry.attributes.normal.array, I = mesh.geometry.index.array;
      for (let k = 0; k < a.length; k += 3) { nV++; const x = a[k], z = a[k + 2], d = a[k + 1] - X.terH(x, z);
        if (polyDist(MV.D, x, z) > 0.05 && !bad) bad = '頂点 (' + x.toFixed(1) + ',' + z.toFixed(1) + ') が広場の外';
        const y = [0, 0.12, 0.27, 0.29].find((v) => Math.abs(d - v) < 0.002); if (y === undefined) { if (!bad) bad = '頂点 (' + x.toFixed(1) + ',' + z.toFixed(1) + ') 地表+' + d.toFixed(3); } else ys.add(y); }
      for (let k = 0; k < I.length; k += 3) { const v = [I[k], I[k + 1], I[k + 2]]; if (nm[3 * v[0] + 1] < 0.9) continue;
        const T3 = v.map((i) => [a[3 * i], a[3 * i + 1], a[3 * i + 2]]);
        for (let gx = Math.floor(Math.min(...T3.map((q) => q[0])) / TC); gx <= Math.floor(Math.max(...T3.map((q) => q[0])) / TC); gx++)
          for (let gz = Math.floor(Math.min(...T3.map((q) => q[2])) / TC); gz <= Math.floor(Math.max(...T3.map((q) => q[2])) / TC); gz++) { const kk = gx + ',' + gz; if (!TG.has(kk)) TG.set(kk, []); TG.get(kk).push(T3); } } }
    const topAt = (x, z) => { let y = null;
      for (const T3 of TG.get(Math.floor(x / TC) + ',' + Math.floor(z / TC)) || []) { const [p, q, r] = T3, d = (q[0] - p[0]) * (r[2] - p[2]) - (q[2] - p[2]) * (r[0] - p[0]); if (Math.abs(d) < 1e-12) continue;
        const u = ((x - p[0]) * (r[2] - p[2]) - (z - p[2]) * (r[0] - p[0])) / d, w = ((q[0] - p[0]) * (z - p[2]) - (q[2] - p[2]) * (x - p[0])) / d;
        if (u < -1e-7 || w < -1e-7 || u + w > 1 + 1e-7) continue; const h = p[1] + u * (q[1] - p[1]) + w * (r[1] - p[1]) - X.terH(x, z); if (y === null || h > y) y = h; }
      return y; };
    const cls = (h) => h === null ? '無' : Math.abs(h - 0.12) < 0.01 ? '車' : (Math.abs(h - 0.27) < 0.01 || Math.abs(h - 0.29) < 0.01) ? '舗' : '?' + h.toFixed(2);
    let nP = 0, nC = 0, mouth = 0;
    if (!bad) for (let x = MV.bb[0]; x <= MV.bb[1]; x += 1) for (let z = MV.bb[2]; z <= MV.bb[3]; z += 1) { if (!(polyDist(MV.D, x, z) < -0.3)) continue; nP++; const c = cls(topAt(x, z));
      if (c === '車') nC++; else if (c !== '舗' && !bad) bad = '広場の (' + x + ',' + z + ') の面が ' + c; }
    // 広場の縁:0.25m 内の点が車道なのは東の辺(154 の西の縁)だけ。東の辺の車道の長さ=取付道路の車道
    const D = MV.D;
    if (!bad) for (let k = 0; k < 4; k++) { const a = D[k], b = D[(k + 1) % 4], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.ceil(L / 0.25), c = [(D[0][0] + D[2][0]) / 2, (D[0][1] + D[2][1]) / 2];
      let nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L; if (nx * (c[0] - a[0]) + nz * (c[1] - a[1]) < 0) { nx = -nx; nz = -nz; }
      for (let i = 1; i < n; i++) { const x = a[0] + (b[0] - a[0]) * i / n + nx * 0.25, z = a[1] + (b[1] - a[1]) * i / n + nz * 0.25; if (cls(topAt(x, z)) !== '車') continue;
        if (k === 1) mouth += L / n; else if (!bad) bad = '辺 ' + k + ' の (' + x.toFixed(1) + ',' + z.toFixed(1) + ') で車道が広場の外へ出る'; } }
    if (!bad && !(mouth >= 10 && mouth <= 16)) bad = '東の辺(154)の車道の口 ' + mouth.toFixed(1) + 'm';
    // 154 の西の歩道が口で切れる:口の東 1.5m(歩道の中)の点に歩道の頂点の面が無い
    let swBad = null;
    if (!bad && X.SIDEWALKS) { const a = D[1], b = D[2], L = Math.hypot(b[0] - a[0], b[1] - a[1]); let ex = -(b[1] - a[1]) / L, ez = (b[0] - a[0]) / L; const c = [(D[0][0] + D[2][0]) / 2, (D[0][1] + D[2][1]) / 2];
      if (ex * (c[0] - a[0]) + ez * (c[1] - a[1]) > 0) { ex = -ex; ez = -ez; }   // 外(東)向き
      for (let i = 1; i < 40; i++) { const x = a[0] + (b[0] - a[0]) * i / 40, z = a[1] + (b[1] - a[1]) * i / 40; if (cls(topAt(x - ex * 0.25, z - ez * 0.25)) !== '車') continue;
        const qx = x + ex * 1.5, qz = z + ez * 1.5;
        for (const W of X.SIDEWALKS) for (const s of W.seg || []) for (let u = s[0]; u <= s[1]; u += 0.5) { const q = W.f(u), hx = q.x - qx, hz = q.z - qz; if (Math.hypot(hx, hz) < W.w / 2 - 0.1 && !swBad) swBad = '154 の歩道 (' + qx.toFixed(1) + ',' + qz.toFixed(1) + ') が取付道路の口をふさぐ'; } } }
    ok('明大前:広場の面', bad === null && swBad === null && nV > 100 && ys.size === 4 && nC >= nP * 0.3 && nC <= nP * 0.75,
      '頂点が広場の中・地表+0/0.12/0.27/0.29・中の点の真上は車道か舗装・車道が 30〜75%・車道が縁に出るのは東の辺(154)の 10〜16m だけ・154 の歩道は口で切れる',
      bad || swBad || nV + '頂点・車道 ' + (100 * nC / Math.max(1, nP)).toFixed(0) + '%(' + nC + '/' + nP + '点)・口 ' + mouth.toFixed(1) + 'm'); }
  // 車・人・街灯
  { let bad = null; const Z = X.MPZ, mesh = (() => { let m = null; X.scene.traverse((o) => { if (o.isMesh && o.name === '明大前駅前広場') m = o; }); return m; })();
    const V = Z ? Z.veh : [], bus = V.filter((v) => v.kind === 'bus').length, taxi = V.filter((v) => v.kind === 'car').length;
    // 車道か:広場の中で、島(舗装)でも歩道でもない=検証側では「広場の車道の面の上」を面で見る(topAt は上の塊の中なのでここで作り直す)
    const TG = new Map(), TC = 4;
    if (mesh) { const a = mesh.geometry.attributes.position.array, nm = mesh.geometry.attributes.normal.array, I = mesh.geometry.index.array;
      for (let k = 0; k < I.length; k += 3) { const v = [I[k], I[k + 1], I[k + 2]]; if (nm[3 * v[0] + 1] < 0.9) continue; const T3 = v.map((i) => [a[3 * i], a[3 * i + 1], a[3 * i + 2]]);
        for (let gx = Math.floor(Math.min(...T3.map((q) => q[0])) / TC); gx <= Math.floor(Math.max(...T3.map((q) => q[0])) / TC); gx++)
          for (let gz = Math.floor(Math.min(...T3.map((q) => q[2])) / TC); gz <= Math.floor(Math.max(...T3.map((q) => q[2])) / TC); gz++) { const kk = gx + ',' + gz; if (!TG.has(kk)) TG.set(kk, []); TG.get(kk).push(T3); } } }
    const top = (x, z) => { let y = null; for (const [p, q, r] of TG.get(Math.floor(x / TC) + ',' + Math.floor(z / TC)) || []) { const d = (q[0] - p[0]) * (r[2] - p[2]) - (q[2] - p[2]) * (r[0] - p[0]); if (Math.abs(d) < 1e-12) continue;
        const u = ((x - p[0]) * (r[2] - p[2]) - (z - p[2]) * (r[0] - p[0])) / d, w = ((q[0] - p[0]) * (z - p[2]) - (q[2] - p[2]) * (x - p[0])) / d; if (u < -1e-7 || w < -1e-7 || u + w > 1 + 1e-7) continue;
        const h = p[1] + u * (q[1] - p[1]) + w * (r[1] - p[1]) - X.terH(x, z); if (y === null || h > y) y = h; } return y; };
    const isRoad = (x, z) => { const h = top(x, z); return h !== null && Math.abs(h - 0.12) < 0.01; }, isPave = (x, z) => { const h = top(x, z); return h !== null && Math.abs(h - 0.27) < 0.01; };
    for (const v of V) { const hl = v.L / 2 - 0.3; for (const u of [-hl, 0, hl]) for (const w of [-0.8, 0, 0.8]) { const x = v.x + v.fx * u - v.fz * w, z = v.z + v.fz * u + v.fx * w;
      if (!isRoad(x, z) && !bad) bad = (v.kind === 'bus' ? 'バス' : 'タクシー') + ' (' + v.x.toFixed(1) + ',' + v.z.toFixed(1) + ') が車道の外'; } }
    let nPp = 0; if (Z) for (const q of Z.people) { nPp++; if (!isPave(q.x, q.z) && !bad) bad = '人 (' + q.x.toFixed(1) + ',' + q.z.toFixed(1) + ') が舗装の外'; }
    let nW = 0; if (Z) for (const w of Z.walk) { nW++; for (let u = 0; u <= w.L; u += 1) { const x = w.ax + w.dx * u, z = w.az + w.dz * u; if (!isPave(x, z) && !bad) bad = '往復する人の道 (' + x.toFixed(1) + ',' + z.toFixed(1) + ') が舗装の外'; } }
    const LM = X.MEIDA_LAMPS || []; for (const q of LM) if (!isPave(q[0], q[1]) && !bad) bad = '街灯 (' + q[0].toFixed(1) + ',' + q[1].toFixed(1) + ') が舗装の外';
    ok('明大前:車・人・街灯', bad === null && bus === MR.BUS && taxi >= MR.TAXI && nPp + nW >= MR.MIN_PEOPLE && LM.length >= MR.MIN_LAMPS,
      'バス ' + MR.BUS + '・タクシー ' + MR.TAXI + '台以上が車道の上(中心と前後の端・両脇 0.8m)・人 ' + MR.MIN_PEOPLE + '人以上が舗装の上・街灯 ' + MR.MIN_LAMPS + '本以上が舗装の上',
      bad || 'バス ' + bus + '・タクシー ' + taxi + '・人 ' + nPp + '+往復 ' + nW + '・街灯 ' + LM.length); }
}
/* ---- 4l. 放射第23号線(都市計画。2026-11 利用者指示「明大前駅の東側にある放射第23号線が直線の帯のみになっているので、計画に従った幅や曲線を
   描くようにして」)--------------------------------------------------------------------------------------------------------------
   検証側の基準 tools/h23_ref.js(HV)で:基準の中心線の長さが公表の延長の ±5%・幅が公表の範囲/帯の中(縁から 0.6m 内)の点がモデルの幹線の面
   (ROADS_PL の k=1)の上で、既存の道路の面の上でない/帯に既存の建物の足跡(0.3m 内)と木が無い/高架の柱が帯の縁から 1m 以上/帯の縁に公表の幅
   4.25m の歩道/以前の模式の帯(MAT.roadPlan の面)が無い */
if (KARA_DATA) {
  const RP = X.ROADS_PL || [], RG = new Map(), RC = 30;
  for (const R of RP) { if (!R.bb) continue; for (let a = Math.floor(R.bb[0] / RC); a <= Math.floor(R.bb[1] / RC); a++) for (let c = Math.floor(R.bb[2] / RC); c <= Math.floor(R.bb[3] / RC); c++) { const k = a + ',' + c; if (!RG.has(k)) RG.set(k, []); RG.get(k).push(R); } }
  // 面の縁から 0.05m 内も面の上(区間の継ぎ目の上の点)
  const at = (x, z) => (RG.get(Math.floor(x / RC) + ',' + Math.floor(z / RC)) || []).filter((R) => R.k !== 2 && x > R.bb[0] - 0.05 && x < R.bb[1] + 0.05 && z > R.bb[2] - 0.05 && z < R.bb[3] + 0.05 && polyDist(R.P, x, z) < 0.05);
  let bad = null, n = 0;
  for (let i = 0; i + 1 < HV.C.length && !bad; i++) { const a = HV.C[i], b = HV.C[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]), nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L;
    for (let t = i === 0 ? 0.6 : 0; t < L - (i + 2 === HV.C.length ? 0.6 : 0); t += 2) { const h = (HR.w[i] + (HR.w[i + 1] - HR.w[i]) * t / L) / 2 - 0.6;   // 幅の変わる区間は区間の中で補間
    for (const v of [-h, -h / 2, 0, h / 2, h]) {   // 帯の両端は 0.6m 内から
      const x = a[0] + (b[0] - a[0]) * t / L + nx * v, z = a[1] + (b[1] - a[1]) * t / L + nz * v; n++;
      const l = at(x, z); if (!l.some((R) => R.k === 1) && !bad) bad = '(' + x.toFixed(1) + ',' + z.toFixed(1) + ') に幹線の面が無い';
      else if (l.some((R) => R.k !== 1) && !bad) bad = '(' + x.toFixed(1) + ',' + z.toFixed(1) + ') に既存の道路の面が残る'; } } }
  const wOK = HR.w.every((v) => v >= HR.W[0] && v <= HR.W[1]);
  ok('放射第23号線:計画の幅と曲線の道路', bad === null && n > 1500 && Math.abs(HV.len - HR.LEN) <= 0.05 * HR.LEN && wOK,
    '基準の中心線の長さが公表の ' + HR.LEN + 'm の ±5%・幅 ' + HR.W.join('〜') + 'm/帯の中の点が幹線の面の上(既存の道路の面は無い)', bad || n + '点・長さ ' + HV.len.toFixed(0) + 'm');
  let bB = null, nb = 0;
  for (const e of ALL) { const o = e.o, qs = POLY(o) ? o.poly.map((p) => ({ x: p[0], z: p[1], r: 0 })) : [{ x: o.x, z: o.z, r: o.r || 0 }];
    if (POLY(o)) { const P = o.poly; for (let i = 0; i < P.length; i++) { const a = P[i], c = P[(i + 1) % P.length], m = Math.max(1, Math.ceil(Math.hypot(c[0] - a[0], c[1] - a[1]))); for (let k = 1; k < m; k++) qs.push({ x: a[0] + (c[0] - a[0]) * k / m, z: a[1] + (c[1] - a[1]) * k / m, r: 0 }); } }
    for (const q of qs) { if (!HV.near(q.x, q.z, 3)) continue; nb++; if (polyDist(HV.O, q.x, q.z) < -(e.kind === '建物' ? 0.3 : 0) - q.r && !bB) bB = e.kind + ' (' + q.x.toFixed(1) + ',' + q.z.toFixed(1) + ') が帯の中'; } }
  let bC = null; for (const c of X.VIA_COLS) for (const o of c.offs) { const f = X.frame(c.s, o); if (polyDist(HV.O, f.x, f.z) < 1.0 && !bC) bC = '柱 s=' + c.s.toFixed(0) + ' off=' + o.toFixed(1) + ' が帯の縁から ' + polyDist(HV.O, f.x, f.z).toFixed(2) + 'm'; }
  let nSW = 0; for (const W of X.SIDEWALKS || []) if (Math.abs(W.w - HR.SW) < 0.01) for (const [u0, u1] of W.seg || []) { const q = W.f((u0 + u1) / 2), d = polyDist(HV.O, q.x, q.z); if (d < -HR.SW / 2 + 0.3 && d > -HR.SW / 2 - 0.3) nSW++; }
  let plan = 0; X.scene.traverse((o) => { if (o.isMesh && o.material === X.MAT.roadPlan) plan++; });
  ok('放射第23号線:帯の中の建物・木・柱・歩道', bB === null && bC === null && nSW >= 60 && plan === 0 && nb > 0,
    '帯に建物の足跡(0.3m 内)・木が無い・柱は帯の縁から 1m 以上・縁に幅 ' + HR.SW + 'm の歩道の片 60以上(歩道は線路から 100m の内だけ)・模式の帯(MAT.roadPlan)が無い',
    bB || bC || ('近くの点 ' + nb + '・歩道の片 ' + nSW + '・模式の帯 ' + plan)); }

/* ---- 4i. 路面標示と交差点の設備(2026-11 利用者指示「更なるクオリティアップ」)------------------------------------------
   検証側で plateau_land.js を自前で読んだ道路(LAND。交差部 sec 4 も)と照合する(モデルの ROADS_PL は使わない):
   ・路面標示(白線・中央線・横断歩道・停止線・路面の文字)の頂点がどれも道路の面の上(縁から 0.05m 以内)・高さが地表+道路の高さ+0.02(±0.01)
   ・横断歩道の縞は交差部の外で、交差部から 6m 以内(口に置く)
   ・中央線の点は、線と直角に道路の縁まで測った左右の距離がそろう(差が 0.8m か幅の 15% 以内。点の 90% 以上)
   ・信号の柱は道路の面の上(縁から 0.05m 以内)・建物の足跡の外・交差部から 8m 以内。灯器は1つの時刻に3灯のうち1灯だけ点き、60秒で青・黄・赤が回る
   ・防護柵の支柱は歩道の帯の上で、交差部から 2.5m 以上離れる
   ・数:横断歩道の縞 1,000以上・中央線 300本以上・停止線 300以上・信号 100以上・防護柵の支柱 300以上 */
if (LAND && X.ROAD_MARKS) {
  const M = X.ROAD_MARKS, IG = new Map(), C4 = 20;
  for (const R of LAND.roads) if (R.sec === 4 && R.k !== 2 && !(KARA_DATA && R.P.every((p) => PV.planD(p[0], p[1]) < 0.5)))   // 計画の範囲(千歳烏山・明大前)で消えた交差部は除く
    for (let a = Math.floor(R.bb[0] / C4); a <= Math.floor(R.bb[1] / C4); a++) for (let c = Math.floor(R.bb[2] / C4); c <= Math.floor(R.bb[3] / C4); c++) { const k = a + ',' + c; if (!IG.has(k)) IG.set(k, []); IG.get(k).push(R); }
  const intD = (x, z) => { let d = 1e9; for (let a = Math.floor(x / C4) - 1; a <= Math.floor(x / C4) + 1; a++) for (let c = Math.floor(z / C4) - 1; c <= Math.floor(z / C4) + 1; c++)
    for (const R of IG.get(a + ',' + c) || []) d = Math.min(d, polyDist(R.P, x, z)); return d; };   // 交差部までの距離(中は負。20m より遠くは 20m 以上)
  // 計画の範囲に一部が掛かる交差部は、範囲の外に残る部分までの距離(範囲の中は 216 の帯と広場に置き換わった。0.25m ごとの点で見る)
  const partK = (R) => KARA_DATA && R.P.some((p) => PV.planD(p[0], p[1]) < 0.5);
  const intDout = (x, z, rr) => { let d = 1e9; for (let a = Math.floor(x / C4) - 1; a <= Math.floor(x / C4) + 1; a++) for (let c = Math.floor(z / C4) - 1; c <= Math.floor(z / C4) + 1; c++)
    for (const R of IG.get(a + ',' + c) || []) { const d0 = polyDist(R.P, x, z); if (!partK(R) || d0 >= rr) { d = Math.min(d, d0); continue; }
      for (let i = -rr; i <= rr; i += 0.25) for (let j = -rr; j <= rr; j += 0.25) { const qx = x + i, qz = z + j, dq = Math.hypot(i, j); if (dq >= d || polyDist(R.P, qx, qz) > 0 || PV.planD(qx, qz) < 0) continue; d = dq; } }
    return d; };
  // 路面の頂点
  { let bad = null, n = 0;
    X.scene.traverse((o) => { if (bad || !o.isMesh || !/^路面標示/.test(o.name)) return; const a = o.geometry.attributes.position.array;
      for (let k = 0; k < a.length; k += 3) { const x = a[k], z = a[k + 2], h = a[k + 1] - X.terH(x, z); n++;
        if (LAND.depth(x, z) > 0.05 && !bad) bad = o.name + ' の頂点 (' + x.toFixed(1) + ',' + z.toFixed(1) + ') が道路の外(' + LAND.depth(x, z).toFixed(2) + 'm)';
        if ((h < 0.10 + 0.01 || h > 0.12 + 0.035) && !bad) bad = o.name + ' の頂点 (' + x.toFixed(1) + ',' + z.toFixed(1) + ') 地表+' + h.toFixed(3); } });
    ok('路面標示:道路の上', bad === null && n > 20000, '白線・中央線・横断歩道・停止線・路面の文字の頂点が道路の面の上(縁から 0.05m・検証側の plateau_land.js)・地表+道路の高さ+0.02', bad || n + '頂点'); }
  // 横断歩道
  { let bad = null; for (const b of M.bars) { const d = intD(b.x, b.z); if ((d <= 0 || d > 6) && !bad) bad = '縞 (' + b.x.toFixed(1) + ',' + b.z.toFixed(1) + ') 交差部まで ' + d.toFixed(2) + 'm'; }
    ok('路面標示:横断歩道は交差部の口', bad === null && M.bars.length >= 1000 && M.stop.length >= 300, '縞の中心が交差部(sec 4)の外で 6m 以内・縞 1,000以上・停止線 300以上', bad || '縞 ' + M.bars.length + '・停止線 ' + M.stop.length); }
  // 中央線
  { let n = 0, good = 0; const worst = [];
    const reach = (x, z, dx, dz) => { let t = 0; while (t < 25 && LAND.depth(x + dx * t, z + dz * t) <= 0) t += 0.1; return t; };
    for (const c of M.center) for (let i = 1; i + 1 < c.pts.length; i += 3) { const a = c.pts[i - 1], b = c.pts[i + 1], p = c.pts[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 1e-6) continue;
      const nx = -(b[1] - a[1]) / L, nz = (b[0] - a[0]) / L, dl = reach(p[0], p[1], nx, nz), dr = reach(p[0], p[1], -nx, -nz); n++;
      if (Math.abs(dl - dr) <= Math.max(0.8, 0.15 * (dl + dr))) good++; else if (worst.length < 2) worst.push('(' + p[0].toFixed(1) + ',' + p[1].toFixed(1) + ') 左 ' + dl.toFixed(1) + '・右 ' + dr.toFixed(1)); }
    ok('路面標示:中央線は道路の中ほど', M.center.length >= 300 && n > 500 && good >= 0.9 * n, '中央線の点から線と直角に道路の縁まで(検証側の道路)の左右の差 0.8m か幅の 15% 以内が 90% 以上・300本以上',
      M.center.length + '本・' + good + '/' + n + '点' + (worst.length ? '(外れの例 ' + worst.join(' ') + ')' : '')); }
  // 信号
  { let bad = null; const BG = new Map(); for (const e of B) if (e.poly) { const k = Math.floor(e.x / 30) + ',' + Math.floor(e.z / 30); if (!BG.has(k)) BG.set(k, []); BG.get(k).push(e); }
    const inB = (x, z) => { for (let a = Math.floor(x / 30) - 1; a <= Math.floor(x / 30) + 1; a++) for (let c = Math.floor(z / 30) - 1; c <= Math.floor(z / 30) + 1; c++) for (const e of BG.get(a + ',' + c) || []) if (polyDist(e.poly, x, z) < 0.1) return true; return false; };
    for (const s of M.signals) { const d = intD(s.x, s.z);
      if (LAND.depth(s.x, s.z) > 0.05 && !bad) bad = '信号の柱 (' + s.x.toFixed(1) + ',' + s.z.toFixed(1) + ') が道路の外';
      else if (d > 8 && !bad) bad = '信号の柱 (' + s.x.toFixed(1) + ',' + s.z.toFixed(1) + ') が交差部から ' + d.toFixed(1) + 'm';
      else if (inB(s.x, s.z) && !bad) bad = '信号の柱 (' + s.x.toFixed(1) + ',' + s.z.toFixed(1) + ') が建物の中'; }
    // 灯:3灯で1組(G・Y・R の順に並ぶ)。1つの時刻に1灯・60秒で3色とも点く
    const L = X.SIGNAL.lamps; let heads = 0;
    for (let i = 0; i + 2 < L.length; i++) { if (L[i].kind !== 'G' || L[i + 1].kind !== 'Y' || L[i + 2].kind !== 'R') continue; heads++; const seen = new Set();
      for (let t = 0; t < 60; t += 0.5) { const lit = [0, 1, 2].filter((j) => X.signalLit(L[i + j], t)); if (lit.length !== 1 && !bad) bad = '灯器 ' + i + ' の時刻 ' + t + ' に点く灯 ' + lit.length; seen.add(lit[0]); }
      if (seen.size !== 3 && !bad) bad = '灯器 ' + i + ' の色が回らない'; }
    const pzVeh = (M.plaza || []).reduce((a, r) => a + r.poles.filter((q) => q.k === '車').length, 0);   // 駅前広場の口の車両用(下の検査)
    ok('交差点:信号', bad === null && M.signals.length >= 100 && heads === M.signals.length + pzVeh, '柱は道路の面の上・建物の外・交差部から 8m 以内/灯器は1灯ずつ点き 60秒で3色が回る・100基以上(灯器の数=交差部の柱+駅前広場の口の車両用)',
      bad || M.signals.length + '基+広場の口 ' + pzVeh + '・灯器 ' + heads); }
  /* 駅前広場の口(2026-11 利用者指示「明大前・千歳烏山駅の駅前広場にも横断歩道や自動車用信号を設置して(必要最低限)」):検証側の計画の形(kara_ref.js・
     meida_ref.js から組んだ KV・MV)で、広場ごとに
     ・口を渡る横断歩道の縞 8本以上:中心が計画の道路の帯の中で、広場の縁から 3.5m 以内(計画の道路の広場の側の歩道の帯)
     ・計画の道路を渡る横断歩道の縞 6本以上:中心が帯の中
     ・停止線 3本:計画の道路の両方向は帯の中、広場から出る車線は広場の中
     ・信号:車両用 3基(計画の道路の2基は帯の中・広場から出る車の1基は広場の中か帯の中)と歩行者用 4基。どの柱も停止線か縞の 12m 以内 */
  if (KARA_DATA) { let bad = null; const got = [];
    for (const [nm, V, inA] of [['明大前', MV, (x, z) => polyDist(MV.D, x, z)], ['千歳烏山', KV, (x, z) => KV.aD(x, z)]]) {
      const r = (M.plaza || []).find((q) => q.n === nm); if (!r) { bad = bad || nm + ' の口が無い'; continue; }
      const nb = r.bars.filter((b) => V.rowD(b.x, b.z) < 0 && inA(b.x, b.z) <= 3.5).length, nx = r.xbars.filter((b) => V.rowD(b.x, b.z) < 0).length;
      const sR = r.stops.filter((s) => V.rowD(s.x, s.z) < 0).length, sP = r.stops.filter((s) => inA(s.x, s.z) < 0).length;
      const vp = r.poles.filter((q) => q.k === '車'), pp = r.poles.filter((q) => q.k === '歩');
      const marks = r.stops.concat(r.bars, r.xbars), near = (q) => marks.some((m) => Math.hypot(m.x - q.x, m.z - q.z) < 12);
      const vIn = vp.filter((q) => V.rowD(q.x, q.z) < 0.05 || inA(q.x, q.z) < 0).length;
      got.push(nm + ' 縞 ' + nb + '/' + r.bars.length + '+' + nx + '・停止線 ' + sR + '+' + sP + '・信号 ' + vp.length + '+' + pp.length);
      if (nb < 8 || nb !== r.bars.length) bad = bad || nm + ':口の縞 ' + nb + '/' + r.bars.length;
      else if (nx < 6 || nx !== r.xbars.length) bad = bad || nm + ':計画の道路を渡る縞 ' + nx + '/' + r.xbars.length;
      else if (r.stops.length !== 3 || sR !== 2 || sP !== 1) bad = bad || nm + ':停止線 帯 ' + sR + '・広場 ' + sP;
      else if (vp.length !== 3 || pp.length !== 4 || vIn !== 3) bad = bad || nm + ':信号 車両 ' + vp.length + '(計画の中 ' + vIn + ')・歩行者 ' + pp.length;
      else if (!r.poles.every(near)) bad = bad || nm + ':停止線・縞から 12m より遠い柱'; }
    ok('駅前広場の口:横断歩道と信号', bad === null, '口を渡る縞 8本以上(帯の中・広場の縁から 3.5m)・計画の道路を渡る縞 6本以上・停止線 3本・車両用 3基と歩行者用 4基', bad || got.join(' / ')); }
  // 防護柵
  { let bad = null; const onSW = (x, z) => (X.SIDEWALKS || []).some((W) => (W.seg || []).some(([u0, u1]) => { const p = W.f((u0 + u1) / 2); if (Math.hypot(p.x - x, p.z - z) > 3 + (u1 - u0) / 2) return false;   // 片の中ほどから(片の半分+3m)より遠ければ見ない(放射第23号線の片は 8m)
      const q = W.f(u0), r = W.f(u1), L = Math.hypot(r.x - q.x, r.z - q.z) || 1, tx = (r.x - q.x) / L, tz = (r.z - q.z) / L, u = (x - q.x) * tx + (z - q.z) * tz, v = -(x - q.x) * tz + (z - q.z) * tx;
      return u >= -0.1 && u <= L + 0.1 && Math.abs(v) <= W.w / 2 + 0.05; }));
    for (const g of M.guards) { if (!onSW(g.x, g.z) && !bad) bad = '支柱 (' + g.x.toFixed(1) + ',' + g.z.toFixed(1) + ') が歩道の外'; const d = intDout(g.x, g.z, 2.5); if (d < 2.5 && !bad) bad = '支柱 (' + g.x.toFixed(1) + ',' + g.z.toFixed(1) + ') が交差部から ' + d.toFixed(2) + 'm'; }
    ok('交差点:防護柵', bad === null && M.guards.length >= 300, '支柱は幹線の歩道の帯の上・交差部(千歳烏山の計画の範囲に掛かる物は範囲の外の部分)から 2.5m 以上・300本以上', bad || M.guards.length + '本'); }
} else ok('路面標示と交差点の設備', !LAND, '実データの道路が無いときは描かない', '-');

/* ---- 4j. 航空写真の木(2026-11 利用者指示「更なるクオリティアップ」。電柱・電線は 2026-11 利用者指示「クオリティが低く失敗」で撤去)----------
   gsi_trees.js を HTML が読み、隣にあれば、検証側で復号した写真の木の 0.06m 以内に '写真' の木があり、半径は 1m 以上で
   min(5m, 写真の半径×1.25) 以下・3,000本以上・公園の格子の木('公園')は無い。ファイルがあるのに '写真' の木が無ければ NG。
   電柱・電線は無い(登録簿 DENCHU が無く、'電柱'・'電線' の Mesh も無い) */
{ let bad = null; if (X.DENCHU) bad = '登録簿 DENCHU が残る'; X.scene.traverse((o) => { if (!bad && (o.name === '電柱' || o.name === '電線')) bad = o.name + ' が残る'; });
  ok('電柱・電線は描かない', bad === null, '電柱・電線・引込線が無い', bad || '無い'); }
{
  const fs = require('fs'), pth = require('path'), f = pth.join(pth.dirname(path), 'gsi_trees.js'), html = fs.readFileSync(path, 'utf8');
  if (LAND && html.includes('<script src="gsi_trees.js">') && fs.existsSync(f)) {
    const g = {}; new Function('globalThis', fs.readFileSync(f, 'utf8'))(g); const GT = g.GSI_TREES;
    const d = GT.d.split(',').map(Number), ox = (GT.o[1] - X.LON0) * X.MLON, oz = -(GT.o[0] - X.LAT0) * X.MLAT, TG = new Map(); let x = 0, z = 0, n = 0;
    for (let k = 0; k + 2 < d.length; k += 3) { x += d[k]; z += d[k + 1]; const t = [ox + x / 10, oz + z / 10, d[k + 2] / 10], key = Math.floor(t[0] / 10) + ',' + Math.floor(t[1] / 10); if (!TG.has(key)) TG.set(key, []); TG.get(key).push(t); n++; }
    let bad = null, nP = 0;
    for (const t of T) { if (t.kind === '公園' && !bad) bad = '公園の格子の木 (' + t.x.toFixed(1) + ',' + t.z.toFixed(1) + ') が残る'; if (t.kind !== '写真') continue; nP++;
      let m = null; for (let a = -1; a <= 1; a++) for (let c = -1; c <= 1; c++) for (const q of TG.get((Math.floor(t.x / 10) + a) + ',' + (Math.floor(t.z / 10) + c)) || []) if (Math.hypot(q[0] - t.x, q[1] - t.z) < 0.06) m = q;
      if (!m) { if (!bad) bad = '写真の木 (' + t.x.toFixed(1) + ',' + t.z.toFixed(1) + ') が gsi_trees.js に無い'; continue; }
      if ((t.r < 0.99 || t.r > Math.min(5, m[2] * 1.25) + 0.01) && !bad) bad = '写真の木 (' + t.x.toFixed(1) + ',' + t.z.toFixed(1) + ') の半径 ' + t.r.toFixed(2) + '(写真 ' + m[2].toFixed(1) + ')'; }
    ok('航空写真の木', bad === null && nP >= 3000, '検証側で復号した gsi_trees.js の位置(0.06m)・半径 1m〜min(5, 写真×1.25)・3,000本以上・公園の格子の木は無い', bad || nP + '本(ファイル ' + n + '本)');
  }
}
console.log('=== 街並みと交差鉄道の検証 ===');
console.log('(置かれた1件ずつの世界座標を測り、道路・河川・鉄道・高架下と突き合わせ)\n');
const w = [0, 0, 0].map((_, i) => Math.max.apply(null, rows.map((r) => [...r[i]].length).concat([8])));
const pad = (s, n) => s + ' '.repeat(Math.max(1, n - [...s].length + 2));
console.log(pad('項目', 30) + pad('期待', 24) + pad('実測', 30) + '判定');
for (const r of rows) console.log(pad(r[0], 30) + pad(r[1], 24) + pad(r[2], 30) + r[3]);
console.log('\n建物 ' + B.length + '棟 / 樹木 ' + T.length + '本');
console.log(ng ? 'RESULT: FAIL(' + ng + '項目NG)' : 'RESULT: PASS');
process.exit(ng ? 1 : 0);
