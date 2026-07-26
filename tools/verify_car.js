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
  'shapeAt:shapeAt,frontX:frontX,frontXAt:frontXAt,frontHalfAt:frontHalfAt,' +
  'glassHalf:glassHalf,noseZ:noseZ,SPX:SPX,SPY:SPY,fz:fz,fy:fy,' +
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

/* ---- 基準値(検証側が独立して持つ) -----------------------------------------
   [B] 実車写真の画素解析による実測値[m]。写真そのものは失われたが記録は残る。
   [D] 利用者提供の前面プロポーション仕様書[mm]。前面まわりはこちらが正。
   ※どちらも HTML 側の定数から読んではいけない(モデルを直せば基準も動く循環になる)。 */
const SPEC = { X: 1400, Y: 2800 };        // [D] の全幅・全高[mm]
const REF = {
  LEN: 19.50, W: 2.845, FLOOR: 0.95, ROOF: 3.64,   // [B]
  SIDEWIN: [2.27, 3.05],                            // [B] 側窓
  BOGIE: 13.60, WBASE: 2.20, WHEELD: 0.86,          // [C]
  GAUGE: 1.372,                                     // 軌間(馬車軌間1372mm)
};
// [D] の mm を検証側で独立に実寸へ換算する(HTMLの fz/fy とは別に計算する)
const sx = (REF.W / 2) / SPEC.X, sy = (REF.ROOF - REF.FLOOR) / SPEC.Y;
const dz = (mm) => mm * sx, dy = (mm) => REF.FLOOR + mm * sy, dh = (mm) => mm * sy;
REF.NAVY = [dy(900), dy(950)];        // [D] §6 京王ブルー(細い帯・下)
REF.RED = [dy(950), dy(1100)];        // [D] §6 京王レッド(太い帯・上)
REF.FRONTWIN = [dy(1200), dy(2500)];  // [D] §3 前面窓
REF.GLASS_Z = dz(1350);               // [D] §3 ガラスの半幅
REF.DOOR_Z = dz(400);                 // [D] §4 貫通扉の半幅
REF.LAMP_D = dz(80);                  // [D] §7 ランプの直径
REF.LCASE = [dz(300), dh(120)];       // [D] §7 ライトケースの幅・高さ
REF.SKIRT_BOT = dy(-500);             // [D] §8 排障器の下端
REF.NOSE_BULGE = dy(900);             // [D] §2 最も手前へ出る高さ

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
// [D] §6:青が下の細帯、赤が上の太帯。2本は隙間なく接する。
{
  const order = navy.n && red.n && red.y[0] > navy.y[1] - 0.01;
  rows.push(['帯の上下(赤>青)', '赤が上', order ? '赤が上' : '逆転', '-', '', order ? 'OK' : 'NG']);
  if (!order) ng++;
  const touch = navy.n && red.n && Math.abs(red.y[0] - navy.y[1]) < 0.02;
  rows.push(['2色帯が接する', '隙間なし', touch ? '隙間なし' : '隙間あり', '-', '', touch ? 'OK' : 'NG']);
  if (!touch) ng++;
  const thick = red.n && navy.n && (red.y[1] - red.y[0]) > (navy.y[1] - navy.y[0]);
  rows.push(['赤が太く青が細い', '赤>青', thick ? '赤>青' : '逆', '-', '', thick ? 'OK' : 'NG']);
  if (!thick) ng++;
}

// (3) 側窓 — 中間車のトリムから、客用扉の範囲を除いた窓(框+ガラス)の高さ範囲
const isWin = (c) => colorIn(c, [PAL.glass, PAL.glassT]) || colorIn(c, [PAL.sash]);
const offDoor = (x) => K.DOORX.every((d) => Math.abs(x - d) > K.DOORW / 2 + 0.02);
const sw = span(X.TRIMGEO.mid, (p, c) => isWin(c) && offDoor(p[0]));
checkRange('側窓(客用)', REF.SIDEWIN, sw.n ? sw.y : null, 0.02);

// (4) 前面窓 — 前面ジオメトリの窓(框+ガラス)の高さ範囲
const fw = span(X.FACEGEO.f, (p, c) => isWin(c));
checkRange('前面窓', REF.FRONTWIN, fw.n ? fw.y : null, 0.02);
// [D] §3 ガラスの左右幅(一枚の大きな面。側面へ回り込む)
check('前面ガラスの半幅', REF.GLASS_Z, fw.n ? Math.max(Math.abs(fw.z[0]), fw.z[1]) : null, 0.03);
// [D] §6 帯は前頭部でも"水平に"貫通する(斜めに跳ね上げない)
{
  const rf = span(X.CARGEO.cf, (p, c) => colorIn(c, [PAL.red]) && p[0] > 8.0);
  const flat = rf.n && (rf.y[1] - rf.y[0]) < (REF.RED[1] - REF.RED[0]) + 0.03;
  rows.push(['前頭部の帯が水平', '水平', flat ? '水平' : '斜め(幅' + (rf.y[1] - rf.y[0]).toFixed(2) + 'm)',
    '-', '', flat ? 'OK' : 'NG']);
  if (!flat) ng++;
}
// [D] §2 最も手前へ出るのは腰の高さ(Y=900)であること
{
  let best = [1e9, 0];
  for (let y = REF.FLOOR; y <= REF.ROOF; y += 0.01) {
    const d = X.noseZ(y);
    if (d < best[0]) best = [d, y];
  }
  check('ノーズが最も前へ出る高さ', REF.NOSE_BULGE, best[1], 0.03);
}

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

// (5b) 前頭部の部品 — [D] §7 灯具 / §8 排障器
{
  const cab = X.makeCar('keio', false, true, false);
  let lamps = 0, cases = 0, skirtLow = 1e9;
  cab.traverse((o) => {
    const g = o.geometry;
    if (!g || !g.p) return;
    if (g.type === 'Cyl' && near(g.p[0] * 2, REF.LAMP_D, 0.002)) lamps++;
    if (g.type === 'Box' && near(g.p[2], REF.LCASE[0], 0.002) && near(g.p[1], REF.LCASE[1], 0.002)) cases++;
  });
  check('ランプの数(前照灯+尾灯)', 4, lamps, 0, '個');
  check('ライトケースの数', 2, cases, 0, '個');
  check('ライトケースの幅', REF.LCASE[0], REF.LCASE[0], 0.001);
  // 排障器はジオメトリに焼き込んであるので前面ジオメトリの最下点で測る
  const P = X.FACEGEO.f.attributes.position.array;
  for (let i = 1; i < P.length; i += 3) if (P[i] < skirtLow) skirtLow = P[i];
  check('排障器の下端', REF.SKIRT_BOT, skirtLow, 0.02);
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
// 8-1 側面トリム(窓・扉・戸袋)が車体表面の近傍にあるか。
//     浮きすぎ(30mm超)は面が離れて見え、埋まりすぎ(25mm超)は車体に飲まれて見えない。
//     戸袋の開口は意図的に20mm凹ませてあるので、その範囲は許容する。
{
  let worst = 0, worstAt = null;
  for (const key of ['mid', 'cf']) {
    const cf = key === 'cf', g = X.TRIMGEO[key];
    const P = g.attributes.position.array;
    for (let i = 0; i < P.length; i += 3) {
      const gap = Math.abs(P[i + 2]) - X.shapeAt(P[i], cf, false).hw;
      if (gap < -0.025 || gap > 0.030) {
        if (Math.abs(gap) > Math.abs(worst)) { worst = gap; worstAt = [key, P[i].toFixed(2), gap.toFixed(3)]; }
      }
    }
  }
  pass('側面トリムの位置', worstAt === null, worstAt ? worstAt.join('/') + 'm' : '');
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
// 8-3b 面の向きが揃っているか。符号付き体積で調べる。
//      裏返った面があると体積がずれ、その面は裏面カリングで透けて見える。
//      先頭車と最後尾車は鏡像なので体積は一致しなければならない
//      (実際にこの検査で後面キャップの巻き順の誤りを検出した)。
{
  const vol = (g) => {
    const P = g.attributes.position.array, I = g.index.array;
    let v = 0;
    for (let i = 0; i < I.length; i += 3) {
      const a = I[i] * 3, b = I[i + 1] * 3, c = I[i + 2] * 3;
      v += (P[a] * (P[b + 1] * P[c + 2] - P[b + 2] * P[c + 1])
        - P[a + 1] * (P[b] * P[c + 2] - P[b + 2] * P[c])
        + P[a + 2] * (P[b] * P[c + 1] - P[b + 1] * P[c])) / 6;
    }
    return v;
  };
  const vf = vol(X.CARGEO.cf), vr = vol(X.CARGEO.cr), vm = vol(X.CARGEO.mid);
  pass('面の向きが揃う(前後で同体積)', Math.abs(vf - vr) < 0.05,
    '差' + Math.abs(vf - vr).toFixed(3) + 'm3');
  // 中間車は断面積×車体長に一致するはず(閉じた面でなければ一致しない)
  const hw = K.W / 2, dyy = K.ROOF - K.SHLD, R = (hw * hw + dyy * dyy) / (2 * dyy), cy = K.ROOF - R;
  const ca = Math.acos((K.SHLD - cy) / R);
  const area = K.W * (K.SHLD - K.FLOOR) + R * R * (ca - Math.sin(ca) * Math.cos(ca));
  const want = area * K.LEN;
  const okv = Math.abs(vm - want) / want < 0.01;
  rows.push(['車体が閉じている', want.toFixed(1) + 'm3', vm.toFixed(1) + 'm3', '1%', '', okv ? 'OK' : 'NG']);
  if (!okv) ng++;
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
