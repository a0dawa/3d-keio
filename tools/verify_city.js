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
  'KAN7_X:KAN7_X,HOSHA23_X:HOSHA23_X,KYU_INOKA_X:KYU_INOKA_X,H154_X:H154_X,H128_X:H128_X,' +
  'H133_X:H133_X,H215_X:H215_X,KANPACHI_X:KANPACHI_X,H216_X:H216_X,H217_X:H217_X,' +
  'JOSUI_X:JOSUI_X,BRIDGE:BRIDGE,XINGS:XINGS,WADA_S:WADA_S,WADA_OFF:WADA_OFF,' +
  'PLAZA_S:PLAZA_S,PLAZA_OFF:PLAZA_OFF,SUBK:SUBK,SUBC:SUBC,' +
  'stepXRail:stepXRail,inoCars:inoCars,setaCars:setaCars,INO_LIM:INO_LIM,INO_CARS:INO_CARS,INO_PITCH:INO_PITCH,' +
  'INO_TRK:INO_TRK,SETA_LO:SETA_LO,SETA_HI:SETA_HI,SETA_CARS:SETA_CARS,SETA_PITCH:SETA_PITCH,' +
  'XCAR:XCAR,CARGEO:CARGEO,CARGEO_LO:CARGEO_LO,TRIMGEO:TRIMGEO,FACEGEO:FACEGEO,' +
  'GAUGE_INO:GAUGE_INO,GAUGE_SETA:GAUGE_SETA,RAIL_W:RAIL_W');

/* ---- 期待値(検証側が独立して持つ) ----------------------------------------
   道路の幅は4章の描画寸法(box の第1引数)。ここでは"路面の半幅"だけを持ち、
   モデル側が持つ余裕(路肩)は足さない ⇒ 路面に載っていれば必ずNGになる。 */
const REF = {
  MIN_BUILDINGS: 3200,      // 増量後の下限(旧実装は約2400棟)
  MIN_TREES: 600,
  DECK_CLEAR: 4.6,          // 高架下+側道の外縁(桁半幅からの距離[m])
  // 交差鉄道の建築限界の半幅[m]。井の頭線=複線+掘割擁壁(±9.4)、世田谷線=単線+ホーム
  XRAIL_HALF: { 井の頭線: 11.0, 世田谷線: 7.5 },
  GAP: 0.0,                 // 物同士は外接円が重ならなければよい(接触=NG)
  // [s位置, 路面の半幅[m], offの半長([m]。省略=全幅)]
  CROSS: [['環七', 'KAN7_X', 15], ['放射23', 'HOSHA23_X', 9], ['旧井の頭', 'KYU_INOKA_X', 7],
  ['補助154', 'H154_X', 8], ['補助128', 'H128_X', 7.5], ['補助133', 'H133_X', 7.5],
  ['補助215', 'H215_X', 7.5], ['環八', 'KANPACHI_X', 17], ['補助216', 'H216_X', 8],
  ['補助217', 'H217_X', 8], ['玉川上水', 'JOSUI_X', 7.5, 230]],
  RIVER_HALF: 4.5,          // 仙川(河川)の半幅[m]
  RIVER_OFF: 75,
  POND: [[-105, 22, 19], [115, -24, 21]],   // 和田堀給水所の池 [WADA_Sからのs, off, 半径]
  // 並行道路 [名称, offの中心, 路面の半幅, s範囲]
  PARA: [['甲州街道', 158, 13, -1e9, 1e9], ['旧甲州街道', 93, 5, 4200, 1e9],
  ['首都高4号', 300, 8, 2000, 6100]],
};

const rows = [];
let ng = 0;
function ok(name, cond, expect, got) {
  if (!cond) ng++;
  rows.push([name, String(expect), String(got), cond ? 'OK' : 'NG']);
}

const B = X.CITY.buildings, T = X.CITY.trees;
const ALL = B.map((o) => ({ o: o, kind: '建物' })).concat(T.map((o) => ({ o: o, kind: '樹木' })));

/* ---- 1. 数 ---------------------------------------------------------------- */
ok('建物の数', B.length >= REF.MIN_BUILDINGS, '≥' + REF.MIN_BUILDINGS + '棟', B.length + '棟');
ok('樹木の数', T.length >= REF.MIN_TREES, '≥' + REF.MIN_TREES + '本', T.length + '本');

/* ---- 2. 高架下・側道に入らない ------------------------------------------- */
{
  let bad = null;
  for (const e of ALL) {
    const lim = X.deckHalf(e.o.s) + REF.DECK_CLEAR;
    if (Math.abs(e.o.off) - e.o.r < lim && !bad)
      bad = [e.kind, 's=' + e.o.s.toFixed(0), 'off=' + e.o.off.toFixed(1), '限界' + lim.toFixed(1)];
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
    for (const e of ALL) {
      const dx = e.o.x - A.x, dz = e.o.z - A.z;
      const du = dx * A.ax + dz * A.az, dn = Math.abs(dx * A.nx + dz * A.nz);
      if (du < u0 - e.o.r || du > u1 + e.o.r) continue;      // 線路の延長の外
      const clear = dn - e.o.r;
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
    const cs = X[c[1]], hw = c[2], oh = c[3] === undefined ? 1e9 : c[3];
    for (const e of ALL) {
      if (Math.abs(e.o.off) > oh) continue;
      if (Math.abs(e.o.s - cs) + e.o.r < hw && !bad)
        bad = [c[0], e.kind, 's=' + e.o.s.toFixed(0), 'off=' + e.o.off.toFixed(0)];
    }
  }
  ok('交差道路の上に無い', bad === null, REF.CROSS.length + '路線すべて',
    bad ? bad.join(' ') : ALL.length + '件すべて');

  let bp = null;
  for (const c of REF.PARA) {
    for (const e of ALL) {
      if (e.o.s < c[3] || e.o.s > c[4]) continue;
      if (Math.abs(e.o.off - c[1]) + e.o.r < c[2] && !bp)
        bp = [c[0], e.kind, 's=' + e.o.s.toFixed(0), 'off=' + e.o.off.toFixed(1)];
    }
  }
  ok('並行道路の上に無い', bp === null, REF.PARA.length + '路線すべて',
    bp ? bp.join(' ') : ALL.length + '件すべて');

  let br = null;
  for (const e of ALL) {
    if (Math.abs(e.o.off) < REF.RIVER_OFF &&
      Math.abs(e.o.s - X.BRIDGE.s) + e.o.r < REF.RIVER_HALF && !br)
      br = ['仙川', e.kind, 's=' + e.o.s.toFixed(0)];
    for (const q of REF.POND) {
      if (Math.hypot(e.o.s - (X.WADA_S + q[0]), e.o.off - (X.WADA_OFF + q[1])) - e.o.r < q[2] && !br)
        br = ['和田堀の池', e.kind, 's=' + e.o.s.toFixed(0)];
    }
  }
  ok('河川・池の上に無い', br === null, '仙川+池2面', br ? br.join(' ') : ALL.length + '件すべて');
}

/* ---- 5. 建物・樹木どうしが重ならない ------------------------------------- */
{
  const CELL = 26, grid = new Map();
  const key = (a, b) => a + ',' + b;
  let bad = null, worst = 1e9, pairs = 0;
  for (const e of ALL) {
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
  ok('井の頭線の車両数', X.inoCars.length === X.INO_CARS, X.INO_CARS + '両', X.inoCars.length + '両');
  // 車体の原点はレール面。道床に載っていなければ車輪が沈む/浮く
  let by = null;
  for (const c of X.inoCars.concat(X.setaCars))
    if (Math.abs(c.position.y - railTop) > 1e-6 && !by) by = [c.position.y.toFixed(3)];
  ok('レール面に載っている', by === null, railTop.toFixed(3) + 'm', by ? by[0] + 'm' : railTop.toFixed(3) + 'm');
  // 折り返しても編成の最後尾が線路からはみ出さない
  /* 交差鉄道は京王線とは別形式。8000系のジオメトリを使い回していないこと
     (使い回すと井の頭線・世田谷線にまで京王8000系の前面が付く)。 */
  {
    const keio = new Set();
    for (const src of [X.CARGEO, X.CARGEO_LO, X.TRIMGEO, X.FACEGEO])
      for (const k in src) keio.add(src[k]);
    let bad = null;
    for (const c of X.inoCars.concat(X.setaCars)) {
      if (!c.userData || !c.userData.xcar) { bad = bad || ['専用モデルでない']; continue; }
      c.traverse((o) => { if (o.geometry && keio.has(o.geometry) && !bad) bad = ['8000系のジオメトリを共有']; });
    }
    ok('交差鉄道は専用モデル', bad === null, '8000系と別', bad ? bad[0] : '井の頭線/世田谷線とも専用');
    // 軌間は線区ごと(井の頭線1067mm / 世田谷線1372mm)。車輪の左右位置で測る。
    const wheelZ = (c) => { let m = 0; c.traverse((o) => {
      const g = o.geometry; if (g && g.type === 'Cyl' && Math.abs(o.position.z) > m) m = Math.abs(o.position.z); }); return m; };
    const wantI = (X.GAUGE_INO + X.RAIL_W) / 2, wantS = (X.GAUGE_SETA + X.RAIL_W) / 2;
    const gotI = wheelZ(X.inoCars[0]), gotS = wheelZ(X.setaCars[0]);
    ok('交差鉄道の軌間', Math.abs(gotI - wantI) < 1e-6 && Math.abs(gotS - wantS) < 1e-6,
      wantI.toFixed(3) + ' / ' + wantS.toFixed(3) + 'm',
      gotI.toFixed(3) + ' / ' + gotS.toFixed(3) + 'm');
  }
  const inoTail = X.INO_LIM + (X.INO_CARS - 1) * X.INO_PITCH + X.XCAR.ino.L / 2;
  ok('井の頭線の編成が線路内', inoTail <= Math.min(-X.XR.U0, X.XR.U1) + 1e-6,
    '≤' + X.XR.U1 + 'm', inoTail.toFixed(1) + 'm');
  const sHalf = X.XCAR.seta.L / 2;
  const sLo = X.SETA_LO - (X.SETA_CARS - 1) * X.SETA_PITCH - sHalf, sHi = X.SETA_HI + sHalf;
  ok('世田谷線の編成が線路内',
    sLo >= X.XR.SETA_U0 - 1e-6 && sHi <= X.XR.SETA_U1 + 1e-6,
    X.XR.SETA_U0 + '〜' + X.XR.SETA_U1 + 'm',
    sLo.toFixed(1) + '〜' + sHi.toFixed(1) + 'm');
  ok('折り返し範囲が正の長さ', X.INO_LIM > 50 && X.SETA_HI > X.SETA_LO, '走行する',
    'INO±' + X.INO_LIM.toFixed(0) + ' / SETA' + X.SETA_LO.toFixed(0) + '〜' + X.SETA_HI.toFixed(0));
  // 走る線(掘割の南側)が敷設した軌道中心と一致するか
  ok('走る線が軌道中心と一致', X.XR.TRK.indexOf(X.INO_TRK) >= 0,
    '[' + X.XR.TRK.join(',') + ']のいずれか', String(X.INO_TRK));
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
