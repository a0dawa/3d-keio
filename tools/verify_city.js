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
  'stepXRail:stepXRail,inoTrains:inoTrains,setaCars:setaCars,LAT0:LAT0,MLAT:MLAT,' +
  'SETA_LO:SETA_LO,SETA_HI:SETA_HI,SETA_CARS:SETA_CARS,SETA_PITCH:SETA_PITCH,' +
  'XCAR:XCAR,K8GEO:K8GEO,XM_WHL:XM_WHL,' +
  'GAUGE_INO:GAUGE_INO,GAUGE_SETA:GAUGE_SETA,RAIL_W:RAIL_W');

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
