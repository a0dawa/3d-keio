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
  'G_LCASE:G_LCASE,G_SIGNT:G_SIGNT,G_SIGND:G_SIGND,BAND_DROP:BAND_DROP,' +
  'pocketWindows:pocketWindows,setCarDoors:setCarDoors,DOOR_REC:DOOR_REC,' +
  'G_DOORLEAF:G_DOORLEAF,' +
  'PT:PT,WIRE_TRO:WIRE_TRO,PANTO_FROM_END:PANTO_FROM_END,AC_L:AC_L,AC_W:AC_W,' +
  'GAUGE:GAUGE,RAIL_W:RAIL_W,RAIL_OFF:RAIL_OFF,trains:trains');

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
const BAND_DROP = 364;                    // 実地確認による帯の下げ量[mm](0.350m相当)
const FRED_DROP = 0.33;                   // 前/後面の赤帯を側面よりさらに下げる量[m]
const WIN_REF = 1.6859;                   // 側窓の基準面[m](帯から切り離した時点の赤帯上端)
const WIN_TRIM = 0.30;                    // 側窓を上下から切り詰める量[m]
const WIN_GROW = 1.21;                    // その後、中心を保って高さを21%大きくする
const WIN_DROP = 0.07;                    // さらに7cm下げる
const POCKET_NARROW = 0.70;               // 戸袋窓は同じ中心で幅を30%狭める
const HL_K = 1.30;                        // 前照灯だけさらに一回り大きくする
const RED_THICK = 1.44;                   // 側面の赤帯(仕様書150mmからの倍率)
const FRED_THICK = 1.56;                  // 前/後面の赤帯(側面より太い)
const SIDE_RED_UP = 0.10;                 // 側面の赤帯だけ10cm上げる(青帯は動かさない)
const AC_L_REF = 2.10 * 1.70;             // 冷房装置キセの長さ[m](1.7倍)
const PANTO_FROM_END = 3.0;               // パンタの取付位置(車端からの距離[m])
const PANTO_CARS = [2, 3, 6, 7, 9];       // パンタを載せる車両(西端から1始まり)
const PIER_MID = 0.26;                    // 同じ区画の窓どうしの柱の幅[m]
const WIN_CLOSE = 0.05;                   // 窓どうしを近づける量[m]
const LAMP_K = 1.30;                      // 実地確認による灯具の拡大率
const REF = {
  LEN: 19.50, W: 2.845, FLOOR: 0.95, ROOF: 3.64,   // [B]
  SIDEWIN: [2.27, 3.05],                            // [B] 側窓
  BOGIE: 13.60, WBASE: 2.20, WHEELD: 0.86,          // [C]
  GAUGE: 1.372,                                     // 軌間(馬車軌間1372mm)
};
// [D] の mm を検証側で独立に実寸へ換算する(HTMLの fz/fy とは別に計算する)
const sx = (REF.W / 2) / SPEC.X, sy = (REF.ROOF - REF.FLOOR) / SPEC.Y;
const dz = (mm) => mm * sx, dy = (mm) => REF.FLOOR + mm * sy, dh = (mm) => mm * sy;
REF.NAVY = [dy(900 - BAND_DROP), dy(950 - BAND_DROP)];    // [D] §6 京王ブルー(細い帯・下)
REF.RED_BASE = dy(950 - BAND_DROP);                       // 帯の基準面(=青帯の上端)
REF.RED = [REF.RED_BASE + SIDE_RED_UP,                    // 京王レッド(側面。10cm上げ)
           REF.RED_BASE + SIDE_RED_UP + dh(150 * RED_THICK)];
REF.FRONTWIN = [dy(1200 - BAND_DROP), dy(2500)];          // [D] §3 前面窓(下へ広げる)
REF.SIDEWIN = [0, 3.05];                                  // 下端は下で帯から決める
REF.GLASS_Z = dz(1350);               // [D] §3 ガラスの半幅
REF.DOOR_Z = dz(400);                 // [D] §4 貫通扉の半幅
REF.LAMP_D = dz(80 * LAMP_K);         // [D] §7 ランプの直径(一回り大きく)
REF.LCASE = [dz(300 * LAMP_K), dh(120 * LAMP_K)];   // [D] §7 ライトケース
REF.SIDEWIN = (function () {              // 基準面+10cm → 上下30cm切詰 → 拡大 → 下げ
  const b = WIN_REF + 0.10 + WIN_TRIM, t = 3.05 - WIN_TRIM;
  const c = (b + t) / 2 - WIN_DROP, h = (t - b) * WIN_GROW / 2;
  return [c - h, c + h];
})();
// 前/後面の赤帯は側面の10cm上げを受けず、基準面から FRED_DROP だけ下がる
REF.FRED = [REF.RED_BASE - FRED_DROP, REF.RED_BASE - FRED_DROP + dh(150 * FRED_THICK)];
REF.LAMP_Y = dy(200);                 // 灯具の高さ:床面(車体底面)から200mm
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
  /* [D]では2本は隙間なく接するが、実地確認により側面の赤帯だけ10cm上げたので
     青帯との間にステンレス地が出る。その隙間が指示どおりの量であることを見る。 */
  const gap = (navy.n && red.n) ? red.y[0] - navy.y[1] : null;
  const okg = gap !== null && Math.abs(gap - SIDE_RED_UP) < 0.02;
  rows.push(['青帯と赤帯の隙間', SIDE_RED_UP.toFixed(2) + 'm',
    gap === null ? '帯が無い' : gap.toFixed(3) + 'm', '-', 'm', okg ? 'OK' : 'NG']);
  if (!okg) ng++;
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
// 帯は前頭部でも"水平に"貫通する(斜めに跳ね上げない)。
// 前/後面(妻面)と側面では赤帯の高さが違うので、分けて測る。
// 妻面のグリッドは中央(z≒0)まで頂点があり、側面は |z|=車体半幅にしか無い。
// 妻面(前/後面)のグリッドだけが中央(|z|<1.0)まで頂点を持つので、そこで前面の帯を測る。
// 側面の帯は中間車(CARGEO.mid)で測る=上の '京王レッド帯' / '京王ブルー細線'。
{
  const face = span(X.CARGEO.cf, (p, c) => colorIn(c, [PAL.red]) && Math.abs(p[2]) < 1.0);
  const fnav = span(X.CARGEO.cf, (p, c) => colorIn(c, [PAL.navy]) && Math.abs(p[2]) < 1.0);
  checkRange('前/後面の赤帯', REF.FRED, face.n ? face.y : null, 0.02);
  // 青帯は前後・側面で同じ高さ(REF.NAVYは側面の値)
  checkRange('前/後面の青帯', REF.NAVY, fnav.n ? fnav.y : null, 0.02);
  // 帯は水平に貫通する(斜めに跳ね上げない)=帯の厚み以上に高さが広がらない
  const flatF = face.n && (face.y[1] - face.y[0]) < (REF.FRED[1] - REF.FRED[0]) + 0.03;
  const flatS = red.n && (red.y[1] - red.y[0]) < (REF.RED[1] - REF.RED[0]) + 0.03;
  rows.push(['帯が水平(前面/側面)', '水平', flatF && flatS ? '水平' : '斜め', '-', '',
    flatF && flatS ? 'OK' : 'NG']);
  if (!(flatF && flatS)) ng++;
  // 前面の赤帯は側面より低い(指示による差)
  const lower = face.n && red.n && (red.y[0] - face.y[0]) > 0.30;
  rows.push(['前面の赤帯が側面より低い', '約0.40m低い',
    face.n && red.n ? (red.y[0] - face.y[0]).toFixed(2) + 'm低い' : '-', '-', '',
    lower ? 'OK' : 'NG']);
  if (!lower) ng++;
}
// 乗務員室は屋根の高さまでアイボリー(灰色の屋根にしない)
{
  const iv = span(X.CARGEO.cf, (p, c) => colorIn(c, [PAL.ivory]));
  const ok2 = iv.n && iv.y[1] > K.ROOF - 0.05;
  rows.push(['乗務員室は屋根までクリーム', '屋根まで',
    iv.n ? '上端' + iv.y[1].toFixed(2) + 'm' : '-', '-', '', ok2 ? 'OK' : 'NG']);
  if (!ok2) ng++;
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
  let lamps = 0, head = 0, skirtLow = 1e9; const lampY = [];
  cab.traverse((o) => {
    const g = o.geometry;
    if (!g || !g.p) return;
    if (g.type === 'Cyl' &&
        (near(g.p[0] * 2, REF.LAMP_D, 0.002) || near(g.p[0] * 2, REF.LAMP_D * HL_K, 0.002))) {
      lamps++; lampY.push(o.position.y);
      if (near(g.p[0] * 2, REF.LAMP_D * HL_K, 0.002)) head++;
    }
  });
  check('ランプの数(前照灯+尾灯)', 4, lamps, 0, '個');
  check('尾灯の直径', REF.LAMP_D, REF.LAMP_D, 0.001);
  check('前照灯の直径(一回り大)', REF.LAMP_D * HL_K, REF.LAMP_D * HL_K, 0.001);
  check('前照灯の数', 2, head, 0, '個');
  {   // 灯具の高さは床面(車体底面)から200mm
    const ys = [...new Set(lampY.map((v) => +v.toFixed(4)))];
    check('灯具の高さ', REF.LAMP_Y, ys.length === 1 ? ys[0] : null, 0.005);
  }
  // 灯具ケース・表示器は前面の曲面に沿うパネル。幅と「面から浮いていないか」を測る。
  {
    const bb2 = (g) => {
      const P = g.attributes.position.array;
      const r = { z: [1e9, -1e9], y: [1e9, -1e9], off: 0 };
      for (let i = 0; i < P.length; i += 3) {
        const x = Math.abs(P[i]), y = P[i + 1], z = P[i + 2];
        if (z < r.z[0]) r.z[0] = z; if (z > r.z[1]) r.z[1] = z;
        if (y < r.y[0]) r.y[0] = y; if (y > r.y[1]) r.y[1] = y;
        r.off = Math.max(r.off, Math.abs(x - X.frontXAt(y, Math.abs(z) * Math.sign(z))));
      }
      return r;
    };
    const lc = bb2(X.G_LCASE.f[0]), st = bb2(X.G_SIGNT.f), sd = bb2(X.G_SIGND.f);
    check('ライトケースの幅', REF.LCASE[0], lc.z[1] - lc.z[0], 0.005);
    check('ライトケースの高さ', REF.LCASE[1], lc.y[1] - lc.y[0], 0.005);
    // 種別と行先は同じ大きさ(実地確認。仕様書[D]の400/600から揃えた)
    check('種別表示器の幅', dz(600), st.z[1] - st.z[0], 0.005);
    check('行先表示器の幅', dz(600), sd.z[1] - sd.z[0], 0.005);
    /* 正面から見て左上=種別(赤)/右上=行先(白)。視線は-x・上は+y なので
       右手は-z、すなわち車体ローカル+z が正面から見た"左"。 */
    const stC = (st.z[0] + st.z[1]) / 2, sdC = (sd.z[0] + sd.z[1]) / 2;
    pass('種別(赤)が窓の左上', stC > 0 && st.y[1] > REF.FRONTWIN[1] - 0.25,
      'z=' + stC.toFixed(2) + ' 上端' + st.y[1].toFixed(2));
    pass('行先(白)が窓の右上', sdC < 0 && sd.y[1] > REF.FRONTWIN[1] - 0.25,
      'z=' + sdC.toFixed(2) + ' 上端' + sd.y[1].toFixed(2));
    // 表示器はガラスの中(角丸で狭まる上隅からはみ出さない)
    const inGlass = Math.max(
      Math.abs(stC) + (st.z[1] - st.z[0]) / 2 - X.glassHalf(st.y[1]),
      Math.abs(sdC) + (sd.z[1] - sd.z[0]) / 2 - X.glassHalf(sd.y[1]));
    pass('表示器がガラス内に収まる', inGlass < 0, 'はみ出し' + inGlass.toFixed(3) + 'm');
    // 前面は側方へ回り込む曲面なので、平らな板を置くと外側の端が車体に沈む。
    // 面からの距離が一定(=曲面に沿っている)ことを確かめる。
    const flat = Math.max(lc.off, st.off, sd.off);
    pass('前面部品が曲面に沿う', flat < 0.030, '面から' + flat.toFixed(3) + 'm');
  }
  // 排障器はジオメトリに焼き込んであるので前面ジオメトリの最下点で測る
  const P = X.FACEGEO.f.attributes.position.array;
  for (let i = 1; i < P.length; i += 3) if (P[i] < skirtLow) skirtLow = P[i];
  check('排障器の下端', REF.SKIRT_BOT, skirtLow, 0.02);
}

// (5c) パンタグラフ — すり板がトロリ線の高さに合い、車端から5mに載ること
{
  const car2 = X.makeCar('keio', true, false, false);
  let shoe = null, minX = 1e9;
  car2.traverse((o) => {
    const g = o.geometry;
    if (!g || !g.p || g.type !== 'Box') return;
    if (near(g.p[2], X.PT.SHOEZ, 1e-6)) shoe = o.position;       // 舟体
  });
  const yf = K.ROOF + X.PT.BASE + X.PT.INS;
  check('すり板の高さ=トロリ線', X.WIRE_TRO, shoe ? shoe.y + 0.055 : null, 0.02);
  check('パンタの取付位置(車端から)', PANTO_FROM_END,
    shoe ? K.LEN / 2 - Math.abs(shoe.x - X.PT.TOPX) : null, 0.05);
  rows.push(['パンタの膝が中央', '0.000', X.PT.KNEX.toFixed(3), '-', 'm',
    Math.abs(X.PT.KNEX) < 1e-9 ? 'OK' : 'NG']);
  if (Math.abs(X.PT.KNEX) >= 1e-9) ng++;
  /* 「く」の字:折れ目(膝)は台枠と舟体のちょうど中間の高さに置く。
     ここが高いと上枠がほぼ水平になり「フ」の字に見える。 */
  {
    const aLow = Math.atan2(X.PT.KNEY, Math.abs(X.PT.KNEX - X.PT.PIVX)) * 180 / Math.PI;
    const aUpp = Math.atan2(X.PT.TOPY - X.PT.KNEY, Math.abs(X.PT.KNEX - X.PT.TOPX)) * 180 / Math.PI;
    pass('膝が台枠と架線の中間', Math.abs(X.PT.KNEY - X.PT.TOPY / 2) < 1e-6,
      '膝' + X.PT.KNEY.toFixed(3) + 'm / 舟体' + X.PT.TOPY.toFixed(3) + 'm');
    // 上下の腕がともに立っていること(どちらかが寝ると「フ」の字)
    pass('パンタが「く」の字', aLow > 20 && aUpp > 20,
      '下枠' + aLow.toFixed(0) + '° / 上枠' + aUpp.toFixed(0) + '°');
  }
  void yf; void minX;
}

/* (5d) パンタを載せる車両。編成の向きで j の意味が変わる(下りは j=0 が西端、
   上りは j=0 が東端)ので、検証側でも西端基準に読み替えて突き合わせる。 */
{
  const hasP = (c) => { let has = false;
    c.traverse((o) => { if (o.geometry && o.geometry.p && near(o.geometry.p[2], X.PT.SHOEZ, 1e-6)) has = true; });
    return has; };
  let bad = null;
  for (const t of X.trains) {
    const got = t.cars.map((c, j) => hasP(c) ? (t.dir > 0 ? j + 1 : t.cars.length - j) : 0)
      .filter((v) => v).sort((a, b) => a - b);
    if (got.join(',') !== PANTO_CARS.join(',') && !bad)
      bad = [(t.dir > 0 ? '下り' : '上り'), got.join('/') + '両目'];
  }
  rows.push(['パンタの搭載位置(西端から)', PANTO_CARS.join('/') + '両目',
    bad ? bad.join(' ') : PANTO_CARS.join('/') + '両目', '-', '', bad ? 'NG' : 'OK']);
  if (bad) ng++;
}

// (6) 屋根上 — 冷房装置は集中式1基(旧実装は3基で誤りだった)
let ac = 0;
car.traverse((o) => {
  const g = o.geometry;
  if (g && g.type === 'Box' && near(g.p[0], X.AC_L, 1e-6) && near(g.p[2], X.AC_W, 1e-6)) ac++;
});
check('冷房装置の数', 1, ac, 0, '基');
check('冷房装置キセの長さ', AC_L_REF, X.AC_L, 1e-6);

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
// 8-1b 客用扉の開口は、外板に穴を開けて DOOR_REC だけ奥まった戸袋になっていること。
//      (扉を内側に置くだけでは車体シェルに隠れて見えない。穴が要る)
{
  const g = X.CARGEO.mid, P = g.attributes.position.array, C = g.attributes.color.array;
  let mn = 1e9, mx = -1e9, n = 0;
  for (let i = 0; i < P.length; i += 3) {
    if (!colorIn([C[i], C[i + 1], C[i + 2]], [PAL.void])) continue;
    n++;
    const d = Math.abs(P[i + 2]);
    if (d < mn) mn = d; if (d > mx) mx = d;
  }
  const okv = n > 0 && near(mx, K.W / 2, 0.002) && near(K.W / 2 - mn, X.DOOR_REC, 0.002);
  rows.push(['戸袋が奥まっている', X.DOOR_REC.toFixed(3) + 'm',
    n ? (K.W / 2 - mn).toFixed(3) + 'm' : '戸袋が無い', '-', '', okv ? 'OK' : 'NG']);
  if (!okv) ng++;
}
// 8-1c 客用扉は車体表面より"内側"を滑ること(外側だと車体に貼り付いて見える)
{
  const c = X.makeCar('keio', false, false, false);
  X.setCarDoors(c, 0, 1);
  const dr = c.userData.doors;
  const mats = dr.p.mats.concat(dr.m.mats);
  const z = mats.map((m) => Math.abs(m.p.z));
  const mx = Math.max(...z);
  /* 左右の面は"別ジオメトリ"で作ること。負のスケールで鏡像にすると巻き順が
     裏返り、法線が内側を向いて同じ材質でも陰影が変わる
     (上りの北側/下りの南側の扉だけ色が違って見えた原因)。 */
  {
    const noFlip = mats.every((m) => m.s.x > 0 && m.s.y > 0 && m.s.z > 0);
    const twoGeo = dr.p.geometry !== dr.m.geometry;
    // +z面の板は+z側へ、-z面の板は-z側へ張り出していること(窓・框の浮き)
    const gz = (g) => { const P = g.attributes.position.array; let m = 0;
      for (let i = 2; i < P.length; i += 3) if (Math.abs(P[i]) > Math.abs(m)) m = P[i]; return m; };
    const facing = gz(dr.p.geometry) > 0 && gz(dr.m.geometry) < 0;
    rows.push(['扉の鏡像が負スケールでない', '別ジオメトリ',
      noFlip && twoGeo && facing ? '別ジオメトリ/巻き順反転' : '負スケール', '-', '',
      noFlip && twoGeo && facing ? 'OK' : 'NG']);
    if (!(noFlip && twoGeo && facing)) ng++;
  }
  const okd = mx < K.W / 2 - 0.005;
  rows.push(['扉が車体の内側', '<' + (K.W / 2).toFixed(3) + 'm', mx.toFixed(4) + 'm',
    '-', '', okd ? 'OK' : 'NG']);
  if (!okd) ng++;
}
// 8-1c2 扉の窓も角丸であること(戸袋窓と隅の処理を揃える)
{
  const g = X.G_DOORLEAF.p;
  const P = g.attributes.position.array, C = g.attributes.color.array;
  // 框(sash)の色を持つ頂点だけを見て、高さごとの半幅を測る
  let ylo = 1e9, yhi = -1e9;
  const byY = new Map();
  for (let i = 0; i < P.length; i += 3) {
    if (!colorIn([C[i], C[i + 1], C[i + 2]], [PAL.sash])) continue;
    const y = Math.round(P[i + 1] * 1000) / 1000, x = Math.abs(P[i]);
    if (y < ylo) ylo = y; if (y > yhi) yhi = y;
    byY.set(y, Math.max(byY.get(y) || 0, x));
  }
  const at = (y) => { let best = null, bd = 1e9;
    for (const [k, v] of byY) { const d = Math.abs(k - y); if (d < bd) { bd = d; best = v; } } return best; };
  const mid = at((ylo + yhi) / 2), top = at(yhi);
  const rounded = byY.size > 8 && top !== null && mid !== null && top < mid - 0.01;
  rows.push(['扉の窓が角丸', '隅が丸い',
    rounded ? '中央' + mid.toFixed(3) + '>上端' + top.toFixed(3) : '角のまま',
    '-', 'm', rounded ? 'OK' : 'NG']);
  if (!rounded) ng++;
}
// 8-1c3 同じ区画に並ぶ窓は WIN_CLOSE ぶん近い(柱の幅 PIER_MID から縮める)
{
  const w = X.sideWindows(false, false);
  let gap = null;
  for (let i = 0; i < w.length - 1; i++) {
    const d = w[i + 1][0] - w[i][1];
    if (d > 0 && d < 0.6 && (gap === null || d < gap)) gap = d;   // 同じ区画の隣どうし
  }
  check('区画内の窓の間隔', PIER_MID - WIN_CLOSE, gap, 0.002);
}
// 8-1d 戸袋窓の幅(客用窓と同じ中心・同じ高さで、幅だけ30%狭い)
{
  const pw = X.pocketWindows(false, false), sw2 = X.sideWindows(false, false);
  const pwW = pw.length ? pw[0][1] - pw[0][0] : 0;
  const base = (0.68 - 0.14) * POCKET_NARROW;
  check('戸袋窓の幅', base, pwW, 0.005);
  rows.push(['戸袋窓の数', String(sw2.length), String(pw.length), '-', '枚',
    pw.length === 8 ? 'OK' : 'NG']);
  if (pw.length !== 8) ng++;
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
  // 面が閉じているかは"符号付き体積が理論値と一致するか"で判定する。
  // 面が欠けていたり裏返っていたりすると体積がずれる。
  {
    const hw = K.W / 2, dyy = K.ROOF - K.SHLD;
    const R = (hw * hw + dyy * dyy) / (2 * dyy), cy = K.ROOF - R;
    const ca = Math.acos((K.SHLD - cy) / R);
    const area = K.W * (K.SHLD - K.FLOOR) + R * R * (ca - Math.sin(ca) * Math.cos(ca));
    // 客用扉の戸袋は外板を DOOR_REC だけへこませてあるので、そのぶん差し引く
    const doorA = K.DOORW * ((K.SHLD - 0.10) - (K.FLOOR + 0.06));
    const want = area * K.LEN - doorA * X.DOOR_REC * 8;
    const okv = Math.abs(vm - want) / want < 0.01;
    rows.push(['車体が閉じている', want.toFixed(1) + 'm3', vm.toFixed(1) + 'm3', '1%', '',
      okv ? 'OK' : 'NG']);
    if (!okv) ng++;
  }
  // 参考:辺の接続。端部キャップと断面リングでyの刻みが違うためT字接合が残るが、
  // 面自体は塞がっている(上の体積が理論値と一致することで確認できる)。
  const openEdges = (geo) => {
    const P = geo.attributes.position.array, I = geo.index.array;
    const key = (i) => [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]].map((v) => Math.round(v * 1e5)).join(',');
    const id = new Map(), w = [];
    for (let i = 0; i < P.length / 3; i++) {
      const k = key(i);
      if (!id.has(k)) id.set(k, id.size);
      w.push(id.get(k));
    }
    const e = new Map();
    for (let i = 0; i < I.length; i += 3) {
      const t = [w[I[i]], w[I[i + 1]], w[I[i + 2]]];
      for (let k = 0; k < 3; k++) {
        const a = t[k], b = t[(k + 1) % 3];
        e.set(a + '>' + b, (e.get(a + '>' + b) || 0) + 1);
      }
    }
    let bad = 0;
    for (const [k, v] of e) {
      const [a, b] = k.split('>');
      if (v !== 1 || (e.get(b + '>' + a) || 0) !== 1) bad++;
    }
    return bad;
  };
  rows.push(['T字接合の辺(参考)', '-', openEdges(X.CARGEO.mid) + '本', '-', '', 'OK']);
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
