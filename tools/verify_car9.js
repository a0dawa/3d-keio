// 京王9000系:生成された"実ジオメトリ"を測って公表諸元と照合する。⑭
//
//   9000系は 8000系(v4)と同じ作り(諸元表 K9 → 断面・前面の平面形・開口の一覧 → 幾何と塗り分け)。
//   ここでは出来上がった頂点・部品の位置を、公表諸元と公表の説明に照らす:
//     車体長19,500・車体幅2,768・床面高さ1,130・屋根高さ3,620・冷房装置上面4,017・天井高さ2,270・
//     前面は上から見て半径10,000mm の曲面・中央に幅610mm の非常扉・扉間に窓2枚(戸袋窓なし)・
//     行先表示器は中央扉の上・車号は向かって右の窓の上・前照灯と尾灯は前面の下部
//   塗り分け(帯・窓・前面の黒)はシェーダなので頂点には現れない。それは⑮で見る。
//   基準値はすべて下の REF で持つ(reference/keio9000/measured_9000.md)。HTML から読まない。
//   使い方: node tools/verify_car9.js [keio_elevated_3d.html]
const path = process.argv[2] || 'keio_elevated_3d.html';
const X = require('./stub_three')(path,
  'K9GEO:K9GEO,K9_WIN:K9_WIN,K9_FORMATIONS:K9_FORMATIONS,trains:trains,WIRE_TRO:WIRE_TRO');

const REF = {
  LEN: 19.5, HWB: 2.768 / 2,                 // 車体長・車体半幅(公表)
  Z_FLR: 1.130, ROOF: 3.620,                 // 床面高さ・屋根高さ(公表)
  AC_TOP: 4.017, CEIL_H: 2.270,              // 冷房装置上面・天井高さ(公表)
  NOSE_R: 10.0, NOSE_R_TOL: 1.0,             // 前面の平面の半径(公表10,000mm)・許容
  FDOOR_W: 0.610,                            // 中央の非常扉の幅(公表)
  DOORX: [-7.05, -2.35, 2.35, 7.05], DOOR_W: 1.30,   // 客用扉の中心と幅(ホームドアの開口と揃う)
  WIN_PER_GAP: 2,                            // 扉間の窓の数(公表の説明:扉間に窓2枚)
  LIGHT_TOP: 1.6,                            // 前照灯・尾灯の上端の上限(前面窓の下=公表の説明)
  TOL: 0.005,
};

const rows = [];
let ng = 0;
function ok(name, cond, expect, got) { if (!cond) ng++; rows.push([name, String(expect), String(got), cond ? 'OK' : 'NG']); }
const near = (a, b, t) => Math.abs(a - b) <= (t === undefined ? REF.TOL : t);
function v4pts(geo) {                         // Three.js(x,上,左右)→ v4(x, y=−z, z=上)
  const P = geo.attributes.position.array, out = [];
  for (let i = 0; i < P.length; i += 3) out.push([P[i], -P[i + 2], P[i + 1]]);
  return out;
}
const range = (pts, k) => { let lo = 1e9, hi = -1e9; for (const p of pts) { if (p[k] < lo) lo = p[k]; if (p[k] > hi) hi = p[k]; } return [lo, hi]; };
const G = X.K9GEO;

/* ---- 1. 車体(公表諸元) ---- */
{
  const mid = v4pts(G.shell), cab = v4pts(G.shellCab);
  const xr = range(mid, 0), yr = range(mid, 1), zr = range(mid, 2);
  ok('車体長', near(xr[1] - xr[0], REF.LEN), REF.LEN + 'm', (xr[1] - xr[0]).toFixed(3) + 'm');
  ok('車体幅', near(yr[1], REF.HWB, 6e-4) && near(-yr[0], REF.HWB, 6e-4), (2 * REF.HWB).toFixed(3) + 'm(公表 1mm 単位)', (yr[1] - yr[0]).toFixed(3) + 'm');
  ok('屋根高さ', near(zr[1], REF.ROOF), REF.ROOF + 'm', zr[1].toFixed(3) + 'm');
  // 床面:垂直な側面(|y|=半幅)の下端=扉の下端の線
  const hwm = Math.max(yr[1], -yr[0]), side = mid.filter((p) => Math.abs(Math.abs(p[1]) - hwm) < 1e-4);
  ok('床面高さ(側面の下端)', near(range(side, 2)[0], REF.Z_FLR), REF.Z_FLR + 'm', range(side, 2)[0].toFixed(3) + 'm');
  ok('先頭車の後端', near(range(cab, 0)[0], -REF.LEN / 2), -REF.LEN / 2, range(cab, 0)[0].toFixed(3));
  // 前面の平面の半径:前面の垂直な部分(z=2.44 の断面)で、中心と |y|≤0.7 の点から y²/(2Δx)
  const row = cab.filter((p) => Math.abs(p[2] - 2.44) < 1e-4 && p[0] > 9);
  const x0 = row.filter((p) => Math.abs(p[1]) < 1e-6).map((p) => p[0])[0];
  const Rs = row.filter((p) => Math.abs(p[1]) > 0.3 && Math.abs(p[1]) <= 0.7).map((p) => p[1] * p[1] / (2 * (x0 - p[0])));
  const R = Rs.length ? Rs.reduce((a, b) => a + b, 0) / Rs.length : 0;
  ok('前面の平面の半径', Math.abs(R - REF.NOSE_R) <= REF.NOSE_R_TOL, REF.NOSE_R + '±' + REF.NOSE_R_TOL + 'm(公表10,000mm)', R.toFixed(2) + 'm(' + Rs.length + '点)');
  ok('冷房装置の上端', near(range(v4pts(G.ac), 2)[1], REF.AC_TOP), REF.AC_TOP + 'm(公表)', range(v4pts(G.ac), 2)[1].toFixed(3) + 'm');
  // 天井の下面=床面+天井高さ(車内の幾何に、その高さの頂点がある)
  const room = v4pts(G.room), ceil = REF.Z_FLR + REF.CEIL_H;
  ok('天井高さ', room.some((p) => near(p[2], ceil, 1e-3)), '床面+' + REF.CEIL_H + 'm', room.some((p) => near(p[2], ceil, 1e-3)) ? '頂点あり' : '無い');
}

/* ---- 2. 側面の開口:扉間に窓2枚・戸袋窓なし ---- */
{
  for (const [nm, W] of [['中間車', X.K9_WIN.mid], ['先頭車', X.K9_WIN.cab]]) {
    let bad = null;
    if (W.some((w) => w[6] === 1)) bad = '戸袋窓がある';
    // 戸袋=開いた戸が滑り込む外板の内側(開口の外 DOOR_W/2)。そこに窓があれば戸が透けて見える
    for (const d of REF.DOORX) for (const sg of [-1, 1]) {
      const a = d + sg * REF.DOOR_W / 2, b = d + sg * REF.DOOR_W, lo = Math.min(a, b), hi = Math.max(a, b);
      if (W.some((w) => w[6] === 0 && w[1] > lo + 1e-6 && w[0] < hi - 1e-6) && !bad) bad = '扉 ' + d + ' の戸袋に窓';
    }
    ok('戸袋窓なし(' + nm + ')', bad === null, '戸袋の位置に窓が無い', bad || '無い');
    let badN = null;
    for (let i = 0; i < REF.DOORX.length - 1; i++) {
      const a = REF.DOORX[i] + REF.DOOR_W / 2, b = REF.DOORX[i + 1] - REF.DOOR_W / 2;
      const n = W.filter((w) => w[6] === 0 && w[0] >= a && w[1] <= b).length;
      if (n !== REF.WIN_PER_GAP && !badN) badN = '扉 ' + REF.DOORX[i] + '〜' + REF.DOORX[i + 1] + ' に ' + n + '枚';
    }
    ok('扉間の窓(' + nm + ')', badN === null, REF.WIN_PER_GAP + '枚ずつ', badN || '全て' + REF.WIN_PER_GAP + '枚');
    // 扉窓は扉の中心の左右(扉の位置がホームドアと揃う)
    const dw = W.filter((w) => w[6] === 2);
    const badD = REF.DOORX.some((d) => dw.filter((w) => Math.abs((w[0] + w[1]) / 2 - d) < REF.DOOR_W / 2).length !== 2);
    ok('扉の位置(' + nm + ')', !badD && dw.length === 8, '4扉×2枚の扉窓', dw.length + '枚');
  }
}

/* ---- 3. 前頭部:中央の非常扉・表示器・車号・灯火 ---- */
{
  const F = G.front;
  // 非常扉の縁(ガラス域の中の縦の枠):前面の部品のうち高さ1m を超える細長い三角形が縦の枠
  const all = v4pts(F.vc), vc = [];
  for (let i = 0; i + 2 < all.length; i += 3) {
    const t = [all[i], all[i + 1], all[i + 2]], zz = t.map((p) => p[2]);
    if (Math.max(...zz) - Math.min(...zz) > 1.0 && t.every((p) => p[0] > 9 && p[2] > 1.5)) vc.push(...t);
  }
  const ys = [...new Set(vc.map((p) => Math.abs(p[1]).toFixed(4)))].map(Number);
  const c = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0;
  ok('中央の非常扉の幅', near(2 * c, REF.FDOOR_W, 0.01), REF.FDOOR_W + 'm(公表610mm)', (2 * c).toFixed(3) + 'm');
  const dest = v4pts(F.dest), num = v4pts(F.num);
  const dy = range(dest, 1), dz = range(dest, 2), ny = range(num, 1), nz = range(num, 2);
  ok('行先表示器は中央扉の上', dy[0] >= -REF.FDOOR_W / 2 && dy[1] <= REF.FDOOR_W / 2 && dz[0] >= 3.0,
    '|y|≤' + REF.FDOOR_W / 2 + '・z≥3.0', 'y ' + dy[0].toFixed(2) + '〜' + dy[1].toFixed(2) + '・z ' + dz[0].toFixed(2));
  ok('車号は向かって右の窓の上', ny[0] > REF.FDOOR_W / 2 && nz[0] >= 3.0,
    'y>' + REF.FDOOR_W / 2 + '(向かって右=+y)・z≥3.0', 'y ' + ny[0].toFixed(2) + '〜' + ny[1].toFixed(2) + '・z ' + nz[0].toFixed(2));
  const hl = v4pts(F.hl), tl = v4pts(F.tl);
  ok('前照灯・尾灯は前面の下部', range(hl, 2)[1] < REF.LIGHT_TOP && range(tl, 2)[1] < REF.LIGHT_TOP && range(hl, 0)[0] > 9,
    '上端<' + REF.LIGHT_TOP + 'm・前面', range(hl, 2)[1].toFixed(2) + ' / ' + range(tl, 2)[1].toFixed(2) + 'm');
  // 灯火は内=前照灯・外=尾灯(8000系と同じ並び)
  ok('前照灯が内・尾灯が外', range(hl.map((p) => [Math.abs(p[1])]), 0)[1] <= range(tl.map((p) => [Math.abs(p[1])]), 0)[0] + 1e-6,
    '前照灯の外端≤尾灯の内端', range(hl.map((p) => [Math.abs(p[1])]), 0)[1].toFixed(2) + ' ≤ ' + range(tl.map((p) => [Math.abs(p[1])]), 0)[0].toFixed(2));
}

/* ---- 4. パンタグラフ(PT-7110):屋根の上に載り、すり板がトロリ線に接する ---- */
{
  const base = v4pts(G.panto.base), shoe = v4pts(G.panto.shoe);
  ok('パンタの台が屋根の上', range(base, 2)[0] >= REF.ROOF - 0.1 && range(base, 2)[0] <= REF.ROOF + 0.05,
    REF.ROOF + 'm 付近', range(base, 2)[0].toFixed(3) + 'm');
  const top = range(shoe.filter((p) => Math.abs(p[1]) <= 0.62 + 1e-6), 2)[1];
  ok('すり板が架線に接する', near(top, X.WIRE_TRO, 0.005), X.WIRE_TRO + 'm(トロリ線)', top.toFixed(3) + 'm');
}

/* ---- 5. 走行列車の9000系は 9000系の幾何で組まれている ---- */
{
  const t9 = X.trains.find((t) => t.cars.every((c) => c.userData.k8.series === '9000'));
  let bad = t9 ? null : '9000系の列車が無い';
  if (t9) for (const c of t9.cars) {
    const geos = new Set(); c.traverse((o) => { if (o.geometry) geos.add(o.geometry); });
    const body = c.userData.body.geometry;
    if (body !== G.shell && body !== G.shellCab && !bad) bad = c.userData.k8.num + ' の車体が 9000系でない';
    if (c.userData.bodyMat.userData.k8.series !== '9000' && !bad) bad = c.userData.k8.num + ' の塗り分けが 9000系でない';
  }
  ok('9000系の車体と塗り分け', bad === null, '10両とも', bad || '10両とも');
}

console.log('=== 京王9000系:実ジオメトリ ⇄ 公表諸元 ===');
const pad = (s, n) => s + ' '.repeat(Math.max(1, n - [...s].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2000 ? 2 : 1), 0)));
console.log(pad('項目', 30) + pad('期待', 34) + pad('実測', 36) + '判定');
for (const r of rows) console.log(pad(r[0], 30) + pad(r[1], 34) + pad(r[2], 36) + r[3]);
console.log(ng ? '\nRESULT: FAIL(' + ng + '項目NG)' : '\nRESULT: PASS');
process.exit(ng ? 1 : 0);
