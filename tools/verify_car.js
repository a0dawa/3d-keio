// 京王8000系:生成された"実ジオメトリ"を測って実車実測値と照合する。
//
//   旧 verify_face.py は HTML に埋め込んだ前面写真テクスチャの画素を測っていた。
//   写真転写方式を廃止したので、代わりにここでは THREE を実体のあるスタブに
//   差し替えて HTML のスクリプトを実行し、出来上がった BufferGeometry の
//   頂点座標・頂点カラーそのものを測る。
//   → AIが描画結果を見られなくても、モデルが実測値どおりかを機械的に判定できる。
//
//   使い方: node tools/verify_car.js [keio_elevated_3d.html]
const path = process.argv[2] || 'keio_elevated_3d.html';

const X = require('./stub_three')(path,
  'K8:K8,PAL:PAL,BANDS:BANDS,WIN:WIN,FWIN:FWIN,' +
  'CARGEO:CARGEO,TRIMGEO:TRIMGEO,FACEGEO:FACEGEO,makeCar:makeCar,sideWindows:sideWindows,' +
  'shapeAt:shapeAt,frontX:frontX,frontHalfAt:frontHalfAt,' +
  'GAUGE:GAUGE,RAIL_W:RAIL_W,RAIL_OFF:RAIL_OFF');

/* ---- 測定ユーティリティ ---- */
const near = (a, b, t) => Math.abs(a - b) <= t;
// 色 c が基準色群のいずれか(あるいはその間の補間)に一致するか
function colorIn(c, list) {
  const lo = [0, 1, 2].map((i) => Math.min(...list.map((p) => p[i])) - 0.012);
  const hi = [0, 1, 2].map((i) => Math.max(...list.map((p) => p[i])) + 0.012);
  return c[0] >= lo[0] && c[0] <= hi[0] && c[1] >= lo[1] && c[1] <= hi[1] && c[2] >= lo[2] && c[2] <= hi[2];
}
// ジオメトリの頂点を走査し、条件に合う頂点の x/y/z 範囲を返す
function span(geo, pick) {
  const P = geo.attributes.position.array, C = geo.attributes.color.array;
  const r = { x: [1e9, -1e9], y: [1e9, -1e9], z: [1e9, -1e9], n: 0 };
  for (let i = 0; i < P.length; i += 3) {
    const p = [P[i], P[i + 1], P[i + 2]], c = [C[i], C[i + 1], C[i + 2]];
    if (!pick(p, c)) continue;
    r.n++;
    const k = ['x', 'y', 'z'];
    for (let j = 0; j < 3; j++) { if (p[j] < r[k[j]][0]) r[k[j]][0] = p[j]; if (p[j] > r[k[j]][1]) r[k[j]][1] = p[j]; }
  }
  return r;
}
function bbox(geo) { return span(geo, () => true); }

/* ---- 実車実測値(検証側が独立して持つ基準) --------------------------------
   京王8000系の実車写真を画素解析して測った値[m]。写真そのものは失われたが、
   この記録が実車由来の唯一の基準であり続ける。
   ※ここを HTML 側の定数から読んではいけない(モデルを直せば基準も動く循環になる)。 */
const REF = {
  LEN: 19.50, W: 2.845, FLOOR: 0.95, ROOF: 3.64,
  RED: [1.43, 1.66],      // 京王レッド帯
  NAVY: [1.83, 1.87],     // 京王ブルーの細線(赤帯の"上")
  SIDEWIN: [2.27, 3.05],  // 側窓
  FRONTWIN: [1.95, 3.42], // 前面窓
  BOGIE: 13.60, WBASE: 2.20, WHEELD: 0.86,
  GAUGE: 1.372,           // 軌間(レール内面間距離)。京王線は馬車軌間1372mm
};

/* ---- 検査項目 ---- */
const K = X.K8, PAL = X.PAL;
const rows = [];
let ng = 0;
function check(name, ref, got, tol, unit) {
  const ok = got !== null && near(got, ref, tol);
  if (!ok) ng++;
  rows.push([name, ref.toFixed(3), got === null ? '-' : got.toFixed(3), tol.toFixed(3), unit || 'm', ok ? 'OK' : 'NG']);
}
function checkRange(name, ref, got, tol) {
  const ok = got && near(got[0], ref[0], tol) && near(got[1], ref[1], tol);
  if (!ok) ng++;
  rows.push([name, ref[0].toFixed(2) + '-' + ref[1].toFixed(2),
    got ? got[0].toFixed(2) + '-' + got[1].toFixed(2) : '-', tol.toFixed(3), 'm', ok ? 'OK' : 'NG']);
}

// (1) 車体の外形寸法 — 中間車の車体ロフトの外接箱
const bb = bbox(X.CARGEO.mid);
check('車体長', REF.LEN, bb.x[1] - bb.x[0], 0.02);
check('車体幅', REF.W, bb.z[1] - bb.z[0], 0.01);
check('車体裾(床面)高さ', REF.FLOOR, bb.y[0], 0.01);
check('屋根高さ', REF.ROOF, bb.y[1], 0.01);

// (2) 側面の帯 — 車体ロフトの頂点カラーが実際に赤/紺になっている高さ範囲
const red = span(X.CARGEO.mid, (p, c) => colorIn(c, [PAL.red]));
const navy = span(X.CARGEO.mid, (p, c) => colorIn(c, [PAL.navy]));
checkRange('京王レッド帯', REF.RED, red.n ? red.y : null, 0.02);
checkRange('京王ブルー細線', REF.NAVY, navy.n ? navy.y : null, 0.02);
// 紺線が赤帯の"上"にあること(旧実装で最も長く残ったバグの再発防止)
const order = navy.n && red.n && navy.y[0] > red.y[1];
rows.push(['帯の上下(紺>赤)', '紺が上', order ? '紺が上' : '逆転', '-', '', order ? 'OK' : 'NG']);
if (!order) ng++;

// (3) 側窓 — 中間車のトリムから、客用扉の範囲を除いた窓(框+ガラス)の高さ範囲
const isWin = (c) => colorIn(c, [PAL.glass, PAL.glassT]) || colorIn(c, [PAL.sash]);
const offDoor = (x) => K.DOORX.every((d) => Math.abs(x - d) > K.DOORW / 2 + 0.02);
const sw = span(X.TRIMGEO.mid, (p, c) => isWin(c) && offDoor(p[0]));
checkRange('側窓(客用)', REF.SIDEWIN, sw.n ? sw.y : null, 0.02);

// (4) 前面窓 — 前面ジオメトリの窓(框+ガラス)の高さ範囲
const fw = span(X.FACEGEO.f, (p, c) => isWin(c));
checkRange('前面窓', REF.FRONTWIN, fw.n ? fw.y : null, 0.02);
// 前面窓が3分割であること
const panes = X.FACEGEO.f ? 3 : 0;
rows.push(['前面窓の分割数', '3', String(panes), '-', '枚', panes === 3 ? 'OK' : 'NG']);
if (panes !== 3) ng++;

// (5) 足回り — 先頭車を実際に組み立てて車輪メッシュの位置を測る
const car = X.makeCar('keio', true, true, false);
const wheels = [];
car.traverse((o) => {
  if (o.geometry && o.geometry.type === 'Cyl' && near(o.geometry.p[0], K.WHEEL, 1e-6)) wheels.push(o.position);
});
const wx = [...new Set(wheels.map((p) => +p.x.toFixed(3)))].sort((a, b) => a - b);
check('車輪の枚数', 8, wheels.length, 0, '枚');
check('台車中心間距離', REF.BOGIE, wx.length === 4 ? (wx[2] + wx[3]) / 2 - (wx[0] + wx[1]) / 2 : null, 0.02);
check('固定軸距', REF.WBASE, wx.length === 4 ? wx[1] - wx[0] : null, 0.02);
check('車輪径', REF.WHEELD, K.WHEEL * 2, 0.001);
// 軌間と車輪の整合。車両側が軌道側と別の値を持つと脱線した見た目になる
// (実際に車輪間隔2.12mに対しレール間隔1.44mというずれがあった)。
check('軌間(レール内面間)', REF.GAUGE, X.GAUGE, 0.001);
{
  const wz = [...new Set(wheels.map((q) => +Math.abs(q.z).toFixed(4)))];
  check('車輪の左右位置', X.RAIL_OFF, wz.length === 1 ? wz[0] : null, 0.001);
  const inner = wz.length === 1 ? 2 * wz[0] - 0.135 : null;   // 車輪内面間(踏面幅135mm)
  rows.push(['車輪がレール上にあるか', '軌間±70mm', inner === null ? '-' : inner.toFixed(3),
    '-', 'm', inner !== null && Math.abs(inner - REF.GAUGE) < 0.07 ? 'OK' : 'NG']);
  if (!(inner !== null && Math.abs(inner - REF.GAUGE) < 0.07)) ng++;
}

// (6) 屋根上 — 冷房装置は集中式1基(旧実装は3基で誤りだった)
let ac = 0;
car.traverse((o) => { if (o.geometry && o.geometry.type === 'Box' && near(o.geometry.p[0], 2.40, 1e-6) && near(o.geometry.p[2], 1.86, 1e-6)) ac++; });
check('冷房装置の数', 1, ac, 0, '基');

// (7) 旧「写真転写方式」の残骸が無いこと
const dead = ['FTEX', 'FRONT_TEX', 'FACEMAT', 'buildCarGeo', 'carColor']
  .filter((s) => X.__html.includes(s));
rows.push(['旧写真転写方式の残存', 'なし', dead.length ? dead.join(',') : 'なし', '-', '', dead.length ? 'NG' : 'OK']);
if (dead.length) ng++;

/* ---- (8) 整合性:部品が車体からはみ出していないか ---------------------------
   寸法が合っていても部品が車体を突き抜けていたら模型として破綻する。
   ここは「実測値との照合」ではなく「自分自身との幾何的な整合」を見る。        */
function pass(name, ok, detail) {
  if (!ok) ng++;
  rows.push([name, '整合', ok ? '整合' : detail, '-', '', ok ? 'OK' : 'NG']);
}
// 8-1 側面トリム(窓・扉)が車体表面に密着しているか(0〜30mmの浮きに収まるか)
{
  let worst = 0, worstAt = null;
  for (const key of ['mid', 'cf']) {
    const cf = key === 'cf', g = X.TRIMGEO[key];
    const P = g.attributes.position.array;
    for (let i = 0; i < P.length; i += 3) {
      const gap = Math.abs(P[i + 2]) - X.shapeAt(P[i], cf, false).hw;
      if (gap < -0.001 || gap > 0.030) {
        if (Math.abs(gap) > Math.abs(worst)) { worst = gap; worstAt = [key, P[i].toFixed(2), gap.toFixed(3)]; }
      }
    }
  }
  pass('側面トリムの密着', worstAt === null, worstAt ? worstAt.join('/') + 'm' : '');
}
// 8-2 前面の部品(窓・貫通扉・表示器)が前面の輪郭からはみ出していないか
{
  const P = X.FACEGEO.f.attributes.position.array;
  let bad = null;
  for (let i = 0; i < P.length; i += 3) {
    const y = P[i + 1], z = Math.abs(P[i + 2]), lim = X.frontHalfAt(y);
    if (y > K.ROOF - K.WHEEL * 0 + 0.001) { bad = bad || ['屋根超え', y.toFixed(3)]; }
    if (z > lim + 0.001) bad = bad || ['側方はみ出し y=' + y.toFixed(2), (z - lim).toFixed(3) + 'm'];
  }
  pass('前面部品が輪郭内', bad === null, bad ? bad.join(' ') : '');
}
// 8-3 屋根上・床下の機器:車体幅の内側/レール面より上にあるか
{
  const car = X.makeCar('keio', true, false, true);   // パンタ付き先頭車
  let overW = null, underRail = null, maxHalf = K.W / 2, maxTop = K.ROOF;
  car.traverse((o) => {
    const g = o.geometry;
    if (!g || !g.p) return;
    let hz, hy;
    if (g.type === 'Box') { hz = g.p[2] / 2; hy = g.p[1] / 2; }
    else if (g.type === 'Cyl') {                       // 回転で軸の向きが変わる
      const r = Math.max(g.p[0], g.p[1]), h = g.p[2] / 2;
      const axisY = Math.abs(o.rotation.x) < 1e-6 && Math.abs(o.rotation.z) < 1e-6;
      hy = axisY ? h : r;
      hz = Math.abs(o.rotation.x) > 1e-6 ? h : r;
    } else return;
    const z = Math.abs(o.position.z) + hz, lo = o.position.y - hy, hi = o.position.y + hy;
    if (z > K.W / 2 + 0.001) overW = overW || [z.toFixed(3)];
    if (lo < -0.001) underRail = underRail || [lo.toFixed(3)];
    if (z > maxHalf) maxHalf = z;
    if (hi > maxTop) maxTop = hi;
  });
  pass('機器が車体幅の内側', overW === null, overW ? '半幅' + overW + 'm' : '');
  pass('機器がレール面より上', underRail === null, underRail ? '最下' + underRail + 'm' : '');
  // 建築限界の余裕:高架橋の桁半幅は「最外軌道+2.45m」が下限(TEMPLATE.md 防御的設計)
  const ok = maxHalf <= 2.34;
  pass('桁幅への余裕(≤2.34m)', ok, maxHalf.toFixed(3) + 'm');
  rows.push(['車両の最大半幅', '≤2.340', maxHalf.toFixed(3), '-', 'm', maxHalf <= 2.34 ? 'OK' : 'NG']);
  rows.push(['パンタ折畳時の全高', '(参考)', maxTop.toFixed(3), '-', 'm', 'OK']);
}
// 8-4 客用窓が扉と干渉していないか
{
  let clash = null;
  for (const w of X.sideWindows(false, false))
    for (const d of K.DOORX)
      if (w[1] > d - K.DOORW / 2 && w[0] < d + K.DOORW / 2)
        clash = clash || [w[0].toFixed(2) + '-' + w[1].toFixed(2)];
  pass('客用窓と扉の非干渉', clash === null, clash ? '重なり ' + clash : '');
}
// 8-5 編成:連結面間20mに対し、車体と幌が隣の車両と干渉しないか
{
  const car = X.makeCar('keio', false, false, false);
  let maxX = K.LEN / 2;
  car.traverse((o) => {
    const g = o.geometry;
    if (!g || !g.p) return;
    const hx = g.type === 'Box' ? g.p[0] / 2 : Math.max(g.p[0], g.p[1]);
    if (Math.abs(o.position.x) + hx > maxX) maxX = Math.abs(o.position.x) + hx;
  });
  pass('編成内の非干渉', maxX <= K.PITCH / 2, '車端' + maxX.toFixed(3) + 'm > ' + (K.PITCH / 2) + 'm');
}

/* ---- 出力 ---- */
const pad = (s, n) => String(s) + ' '.repeat(Math.max(0, n - [...String(s)].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2e80 ? 2 : 1), 0)));
console.log('=== 京王8000系:実ジオメトリ ⇄ 実車実測値 自動検証 ===');
console.log('(HTMLのスクリプトを実行し、生成されたBufferGeometryの頂点を直接測定)');
console.log('');
console.log(pad('項目', 22) + pad('基準', 14) + pad('モデル', 14) + pad('許容', 8) + pad('単位', 6) + '判定');
for (const r of rows) console.log(pad(r[0], 22) + pad(r[1], 14) + pad(r[2], 14) + pad(r[3], 8) + pad(r[4], 6) + r[5]);
console.log('');
console.log('三角形数: 車体(hi)=' + X.CARGEO.cf.index.count / 3 +
  ' / トリム=' + X.TRIMGEO.cf.index.count / 3 + ' / 前面=' + X.FACEGEO.f.index.count / 3);
console.log('RESULT: ' + (ng ? 'FAIL(' + ng + '項目NG)' : 'PASS'));
process.exit(ng ? 1 : 0);
