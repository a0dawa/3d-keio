// ⑱ 交差鉄道の車両(井の頭線 京王1000系 1751F・世田谷線 東急300系 304F)の形と編成 ⇄ 公表値と写真の実測。
//
//   2026-11 利用者指示「井の頭線は1751編成を、世田谷線は304編成をモデルに再度リアルに。京王8000・9000系に指示してきた内容・流れを
//   漏らさず適用」。8000系の④・9000系の⑭と同じく、基準値は検証側が持つ(reference/xtrains/measured_1000.md・measured_300.md から写す)。
//   モデルの諸元表(K10・K30)は読まない。出来た形(頂点)・車体の材質の開口の一覧(uniform)・登録簿(編成の車両)を測る。
//
//   使い方: node tools/verify_xcar.js [keio_elevated_3d.html]
const path = process.argv[2] || 'keio_elevated_3d.html';
const X = require('./stub_three')(path,
  'inoTrains:inoTrains,setaTrain:setaTrain,stepXRail:stepXRail,XR:XR,INO:INO,SETA:SETA,scene:scene,GAUGE_INO:GAUGE_INO,GAUGE_SETA:GAUGE_SETA,RAIL_W:RAIL_W,' +
  'K10GEO:K10GEO,K30GEO:K30GEO,XM_WHL:XM_WHL,M_HL:M_HL,M_TL:M_TL,wireMat:wireMat');

/* ---- 基準(measured_1000.md・measured_300.md から写す) ---- */
const R10 = {
  HWB: 1.405, CROWN: 3.66, LEN: 19.5, BOT: 0.98, FLR: 1.15,          // 公表(車体基準幅2,810・屋根3,660・床1,150)と写真(すそ)
  SUSO_HW_MAX: 1.38,                                                 // 裾絞り:すそ(z<1.05)の半幅はこれより狭い(公表「裾絞り」)
  DOORX: [-7.05, -2.35, 2.35, 7.05], DWIN: [0.16, 0.49], DWZ: [1.97, 2.86],   // 扉の中心(写真の実測を20m4扉の並びに)・扉の窓
  WIN_C: [-4.70, 0, 4.70], WIN_HW: 0.90, WZ: [1.984, 2.886],          // 扉間の窓
  F_HL: [1.00, 1.47], F_MARK: [0.995, 3.365], F_LED_W: 0.84, F_LOGO: [0.15, 0.78], F_NUM: [0.80, 1.21],   // 前面(写真の実測)
  FORM: { '1751F': ['1751', '1101', '1551', '1001', '1701'] }, PANTO: [2, 3, 4],   // 公表の編成表(渋谷方から)・パンタ(写真:2〜4両目)
  GAUGE: 1.067, WHEEL_R: 0.43,
};
const R30 = {
  HWB: 1.25, HW_TOP: 1.225, GAUGE: 1.372, WHEEL_R: 0.33, WB: 1.60, SET_LEN: 23.98,   // 公表(全幅2,500・屋根へ50絞る・軌間1,372・車輪径660・軸距1,600・編成長23,980)
  DOORX: [4.22, -2.47], DOOR_HW: 0.625, BOGIES: 3, CARS: ['304-A', '304-B'],          // 写真の扉・公表の開口1,250・2車体3台車
};
let nOk = 0, nNg = 0;
function ok(name, pass, want, got) {
  const pad = (s, n) => { s = String(s); let w = 0; for (const ch of s) w += ch.charCodeAt(0) > 255 ? 2 : 1; return s + ' '.repeat(Math.max(1, n - w)); };
  console.log(pad(name, 34) + pad(want, 46) + pad(got, 40) + (pass ? 'OK' : 'NG')); pass ? nOk++ : nNg++;
}
console.log('=== 交差鉄道の車両(1000系 1751F・300系 304F)⇄ 公表値と写真の実測 ===');
// 三.js の局所(x 前後・y 上・z = −v4 の y)。頂点の範囲
const verts = (g) => { const P = g.attributes.position.array, o = []; for (let i = 0; i < P.length; i += 3) o.push([P[i], P[i + 1], P[i + 2]]); return o; };
const bb = (g) => { const v = verts(g); const b = [1e9, -1e9, 1e9, -1e9, 1e9, -1e9]; for (const p of v) { b[0] = Math.min(b[0], p[0]); b[1] = Math.max(b[1], p[0]); b[2] = Math.min(b[2], p[1]); b[3] = Math.max(b[3], p[1]); b[4] = Math.min(b[4], p[2]); b[5] = Math.max(b[5], p[2]); } return b; };

/* ---- 1000系 ---- */
{
  const G = X.K10GEO, sh = bb(G.shellCab), shm = bb(G.shell);
  const hw = Math.max(Math.abs(sh[4]), sh[5]);
  ok('1000系:車体の幅・屋根・すそ', Math.abs(hw - R10.HWB) < 0.006 && Math.abs(sh[3] - R10.CROWN) < 0.01 && Math.abs(sh[2] - R10.BOT) < 0.02,
    '半幅 ' + R10.HWB + '・屋根 ' + R10.CROWN + '・すそ ' + R10.BOT, '半幅 ' + hw.toFixed(3) + '・屋根 ' + sh[3].toFixed(3) + '・すそ ' + sh[2].toFixed(3));
  ok('1000系:車体の長さ', Math.abs((shm[1] - shm[0]) - R10.LEN) < 0.02 && Math.abs((sh[1] - sh[0]) - R10.LEN) < 0.02, R10.LEN + 'm(中間車・先頭車)', (shm[1] - shm[0]).toFixed(3) + '・' + (sh[1] - sh[0]).toFixed(3));
  let suso = 0; for (const p of verts(G.shell)) if (p[1] < 1.05) suso = Math.max(suso, Math.abs(p[2]));
  ok('1000系:裾絞り', suso > 1.2 && suso < R10.SUSO_HW_MAX, 'すその半幅 < ' + R10.SUSO_HW_MAX + '(公表「裾絞り」)', suso.toFixed(3));
  // 開口の一覧(車体の材質の uniform)
  const car = X.inoTrains[1].cars[1], U = car.userData.bodyMat.userData.k8.uni, W = U.uWin.value.slice(0, U.uNWin.value), WR = U.uWinR.value;
  const dw = W.filter((w, i) => Math.abs(WR[i].z - 2) < 0.1), sw = W.filter((w, i) => WR[i].z < 0.5 && w.y - w.x > 1.2);
  let bd = null;
  for (const d of R10.DOORX) for (const s of [-1, 1]) { const a = d + s * R10.DWIN[0], b = d + s * R10.DWIN[1];
    if (!dw.some((w) => Math.abs(Math.min(w.x, w.y) - Math.min(a, b)) < 0.01 && Math.abs(Math.max(w.x, w.y) - Math.max(a, b)) < 0.01 && Math.abs(w.z - R10.DWZ[0]) < 0.01 && Math.abs(w.w - R10.DWZ[1]) < 0.01) && !bd) bd = '扉 ' + d + ' の窓が無い'; }
  for (const c of R10.WIN_C) if (!sw.some((w) => Math.abs((w.x + w.y) / 2 - c) < 0.01 && Math.abs((w.y - w.x) / 2 - R10.WIN_HW) < 0.01 && Math.abs(w.z - R10.WZ[0]) < 0.01) && !bd) bd = '扉間の窓 ' + c + ' が無い';
  ok('1000系:扉と窓の並び', bd === null && dw.length === 8, '扉 ±2.35・±7.05(扉の窓 0.16〜0.49=戸の中央)・扉間の窓 ±0.90', bd || '扉の窓 ' + dw.length + '・扉間の窓 ' + sw.length);
  // 前面の部品(写真の実測):v4 の y = −(三.js の z)
  const F = G.front, c = (g) => { const b = bb(g); return { y: (-b[5] - b[4]) / 2, ay: Math.max(Math.abs(b[4]), Math.abs(b[5])), z: (b[2] + b[3]) / 2, w: b[5] - b[4], b: b }; };
  const hl = c(F.hl), mk = c(F.tl), led = c(F.dest), lg = bb(F.logo), nm = bb(F.num);
  const fr = Math.abs(hl.ay - 0.055 - R10.F_HL[0]) < 0.08 && Math.abs(hl.z - R10.F_HL[1]) < 0.03 && Math.abs(mk.z - R10.F_MARK[1]) < 0.03 && Math.abs(led.w - R10.F_LED_W) < 0.03 &&
    Math.abs(-lg[5] - R10.F_LOGO[0]) < 0.02 && Math.abs(-lg[4] - R10.F_LOGO[1]) < 0.02 && Math.abs(-nm[5] - R10.F_NUM[0]) < 0.02 && Math.abs(-nm[4] - R10.F_NUM[1]) < 0.02;
  ok('1000系:前面の部品の位置', fr, '前照灯 z' + R10.F_HL[1] + '・標識灯 z' + R10.F_MARK[1] + '・LED 幅' + R10.F_LED_W + '・ロゴ y' + R10.F_LOGO.join('〜') + '・車号 y' + R10.F_NUM.join('〜'),
    '前照灯 z' + hl.z.toFixed(2) + '・標識灯 z' + mk.z.toFixed(2) + '・LED ' + led.w.toFixed(2) + '・ロゴ ' + (-lg[5]).toFixed(2) + '〜' + (-lg[4]).toFixed(2) + '・車号 ' + (-nm[5]).toFixed(2) + '〜' + (-nm[4]).toFixed(2));
  // 編成:1751F(上り=渋谷行)。先頭は 1751(前照灯)・最後尾は 1701(尾灯)。パンタは 2〜4両目の渋谷方の端
  const t = X.inoTrains.find((q) => q.form === '1751F'), nums = t ? t.cars.map((q) => q.userData.k8.num) : [];
  const pant = t ? t.cars.map((q, j) => q.userData.panto ? j + 1 : 0).filter((v) => v) : [];
  const pside = t ? t.cars.filter((q) => q.userData.panto).every((q) => Math.sign(q.userData.panto.position.x) === Math.sign(t.dir < 0 ? 1 : -1)) : false;   // 局所 +x=進行方向。上り(−u=渋谷へ)は +x が渋谷方
  const lamps = t ? [t.cars[0].userData.lamp.hl.material === X.M_HL, t.cars[4].userData.lamp.tl.material === X.M_TL] : [];
  ok('1000系:編成(1751F)', t && nums.join() === R10.FORM['1751F'].join() && pant.join() === R10.PANTO.join() && pside && lamps.every((v) => v),
    '渋谷方から ' + R10.FORM['1751F'].join('・') + '・パンタ ' + R10.PANTO.join('・') + '両目の渋谷方・先頭は前照灯・最後尾は尾灯',
    nums.join('・') + '・パンタ ' + pant.join('・') + (pside ? '' : '(向き違い)') + '・灯火 ' + lamps.join('/'));
  // 車輪(軌間)とパンタのすり板=トロリ線(描いた架線の低い方)
  const wv = verts(G.wheelM), ys = wv.map((p) => Math.abs(p[2])), gw = (Math.min(...ys) + Math.max(...ys)) / 2;
  const wr = Math.max(...wv.map((p) => p[1])) / 2;
  ok('1000系:車輪', Math.abs(gw - (R10.GAUGE + X.RAIL_W) / 2) < 0.002 && Math.abs(wr - R10.WHEEL_R) < 0.01, '左右=(軌間 1,067+頭部)/2・半径 ' + R10.WHEEL_R, gw.toFixed(4) + '・' + wr.toFixed(3));
}
/* 井の頭線:明大前に停車中はホームの側(もう一方の線路と反対=外側)の扉だけが開く */
{
  let opened = 0, bad = null;
  for (let k = 0; k < 1600; k++) {
    X.stepXRail(0.25);
    for (const t of X.inoTrains) for (const c of t.cars) {
      if (!c.visible) continue;
      const o = c.userData.bodyMat.userData.k8.uni.uOpen.value; if (!(o.x > 0.5 || o.y > 0.5)) continue;
      opened++; const th = c.rotation.y, sideZ = (o.x > 0.5 ? -1 : 1) * (c.userData.tail ? -1 : 1), nz = [Math.sin(th) * sideZ, Math.cos(th) * sideZ];
      const q = X.INO.uv(c.position.x, c.position.z), me = X.INO.pos(q.u, X.INO.trk(t.k, q.u)), other = X.INO.pos(q.u, X.INO.trk(1 - t.k, q.u));
      if ((other.x - me.x) * nz[0] + (other.z - me.z) * nz[1] > 0 && !bad) bad = t.form + ' もう一方の線路の側の扉が開いた';
    }
  }
  ok('1000系:明大前でホームの側の扉が開く', opened > 100 && bad === null, '停車中に外側(ホーム)だけ開く', bad || opened + '両・コマ開いた');
}
/* ---- 300系 ---- */
{
  const G = X.K30GEO, sh = bb(G.shellCab);
  let top = 0, mid = 0; for (const p of verts(G.shell)) { if (p[1] > 2.70 && p[1] < 2.80) top = Math.max(top, Math.abs(p[2])); if (p[1] > 1.4 && p[1] < 1.6) mid = Math.max(mid, Math.abs(p[2])); }
  ok('300系:車体の幅と屋根への絞り', Math.abs(mid - R30.HWB) < 0.006 && Math.abs(top - R30.HW_TOP) < 0.008, '半幅 ' + R30.HWB + '→屋根の手前 ' + R30.HW_TOP + '(公表:屋根へ 50mm 絞る)', mid.toFixed(3) + '→' + top.toFixed(3));
  const U = X.setaTrain.cars[0].userData.bodyMat.userData.k8.uni, W = U.uWin.value.slice(0, U.uNWin.value), WR = U.uWinR.value;
  const dw = W.filter((w, i) => Math.abs(WR[i].z - 2) < 0.1);
  const dc = []; for (let i = 0; i + 1 < dw.length; i += 2) dc.push((Math.min(dw[i].x, dw[i].y) + Math.max(dw[i + 1].x, dw[i + 1].y)) / 2);
  ok('300系:扉の位置', R30.DOORX.every((d) => dc.some((c) => Math.abs(c - d) < 0.02)), '扉の中心 ' + R30.DOORX.join('・') + '(写真)', dc.map((v) => v.toFixed(2)).join('・'));
  // 編成:2車体3台車・車番・連接台車を共有(A車の台車2・B車の台車1)
  const cars = X.setaTrain.cars, nb = cars.map((c) => { const v = verts(c.userData.wheel.geometry).map((p) => p[0]).sort((a, b) => a - b); let n = 1; for (let i = 1; i < v.length; i++) if (v[i] - v[i - 1] > 0.6) n++; return n / 2; });
  ok('300系:編成(304F)', cars.map((c) => c.userData.k8.num).join() === R30.CARS.join() && nb[0] + nb[1] === R30.BOGIES, R30.CARS.join('・') + '・2車体3台車(公表)', cars.map((c) => c.userData.k8.num).join('・') + '・台車 ' + nb.join('+'));
  const wv = verts(G.wheelA), xs = [...new Set(wv.map((p) => Math.round(p[0] * 100) / 100))].sort((a, b) => a - b);
  const ys = wv.map((p) => Math.abs(p[2])), gw = (Math.min(...ys) + Math.max(...ys)) / 2, wr = Math.max(...wv.map((p) => p[1])) / 2;
  const axl = []; for (const x of xs) if (!axl.length || x - axl[axl.length - 1][axl[axl.length - 1].length - 1] > 0.6) axl.push([x]); else axl[axl.length - 1].push(x);
  const ac = axl.map((a) => (a[0] + a[a.length - 1]) / 2), wb = ac.length >= 2 ? ac[1] - ac[0] : 0;
  ok('300系:車輪と軸距', Math.abs(gw - (R30.GAUGE + X.RAIL_W) / 2) < 0.002 && Math.abs(wr - R30.WHEEL_R) < 0.01 && Math.abs(wb - R30.WB) < 0.01, '軌間 1,372・車輪径 660・軸距 1,600(公表)', gw.toFixed(4) + '・半径 ' + wr.toFixed(3) + '・軸距 ' + wb.toFixed(3));
  // 編成の長さ:北行きで両方の車体が線路の上にいる時、A車の前端〜B車の前端
  let len = 0, rev = null, sideBad = null, opened = 0;
  for (let k = 0; k < 2400; k++) {
    X.stepXRail(0.25);
    const [A, B] = cars;
    if (A.visible && B.visible) {
      const ends = (c) => { const b = c.userData.body.geometry.attributes.position.array; let x0 = 1e9, x1 = -1e9; for (let i = 0; i < b.length; i += 3) { x0 = Math.min(x0, b[i]); x1 = Math.max(x1, b[i]); }
        const th = c.rotation.y; return [x0, x1].map((x) => [c.position.x + x * Math.cos(th), c.position.z - x * Math.sin(th)]); };
      const a = ends(A), b = ends(B), dd = Math.max(...a.map((p) => Math.max(...b.map((q) => Math.hypot(p[0] - q[0], p[1] - q[1])))));
      len = Math.max(len, dd);
      // 折り返し:南行き(B車が前)は B の前照灯・A の尾灯・行先は三軒茶屋
      if (X.setaTrain.dir < 0 && rev === null) rev = A.userData.lamp.tl.material === X.M_TL && B.userData.lamp.hl.material === X.M_HL && A.userData.k8.sign.dest === '三軒茶屋';
      // 開いた扉の面はホーム(西の線の西)の側=もう一方の線路(東)と反対
      const o = A.userData.bodyMat.userData.k8.uni.uOpen.value;
      if (o.x > 0.5 || o.y > 0.5) { opened++; const th = A.rotation.y, sideZ = (o.x > 0.5 ? -1 : 1) * (A.userData.tail ? -1 : 1);   // シェルの ±y 面 → 局所 z
        const nz = [Math.sin(th) * sideZ, Math.cos(th) * sideZ], q = X.SETA.uv(A.position.x, A.position.z), e = X.SETA.pos(q.u, X.SETA.trk(1, q.u)), w = X.SETA.pos(q.u, X.SETA.trk(0, q.u));
        if ((e.x - w.x) * nz[0] + (e.z - w.z) * nz[1] > 0 && !sideBad) sideBad = '東(線路の側)の扉が開いた'; }
    }
  }
  ok('300系:編成の長さ', Math.abs(len - R30.SET_LEN) < 0.35, '公表の編成長 ' + R30.SET_LEN + 'm(連結器を除く車体の端どうし ±0.35)', len.toFixed(2) + 'm');
  ok('300系:折り返しで灯火と行先を入れ替える', rev === true, '南行きは B車が前照灯・A車が尾灯・三軒茶屋行', String(rev));
  ok('300系:下高井戸でホームの側の扉が開く', opened > 20 && sideBad === null, '停車中にホーム(西)の側だけ開く', sideBad || opened + 'コマ開いた');
}
console.log('\nRESULT: ' + (nNg ? 'FAIL(' + nNg + '項目NG)' : 'PASS') + '  (' + nOk + ' OK)');
process.exit(nNg ? 1 : 0);
