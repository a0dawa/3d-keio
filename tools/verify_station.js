// 駅の構造を検査する(⑪)。
//
//   駅は結合ジオメトリ(3b章)で細かく作り込んだので、見た目では確かめきれない
//   「列車に当たらないか」「階段やエレベーターがホームに収まっているか」
//   「駅名標の左右の駅名が見る向きと合っているか」「公表デザインの要点が形になっているか」
//   「細かくしても描画の呼び出しが増えていないか」を数値で確かめる。
//
//   ・列車との干渉は、登録簿 STRUCT(部品の s/off/高さの範囲)と、実際に出来た頂点の
//     両方で測る。建築限界の寸法は検証側が独立に持つ(HTMLからは読まない)。
//   ・公表デザインの要点(2019.5.30 京王電鉄の発表文)も検証側が持つ。
//   使い方: node tools/verify_station.js [keio_elevated_3d.html]
const path = process.argv[2] || 'keio_elevated_3d.html';
const X = require('./stub_three')(path,
  'STA:STA,STG:STG,STRUCT:STRUCT,TRACKS:TRACKS,railY:railY,frame:frame,PLATS:PLATS,' +
  'STAIRS:(typeof STAIRS!=="undefined"?STAIRS:[]),SIGNS:(typeof SIGNS!=="undefined"?SIGNS:[]),' +
  'MAT:MAT,MAT_BRICK:MAT_BRICK,MAT_BOOK:MAT_BOOK,platRange:platRange,deckHalf:deckHalf,' +
  'PSD:PSD,K8:K8,DECK_END:DECK_END,LODS:LODS,POLE_S:POLE_S,WIRE_CAT:WIRE_CAT');

/* ---- 検証側が独立に持つ寸法 -------------------------------------------- */
const REF = {
  BODY_HW: 1.385 + 0.06,   // 車体の半幅(8000系 2.770m)+ゆれの余裕[m]
  BODY_Y: [0.30, 4.30],    // 車体が占める高さ(レール面から。冷房装置の上端4.055+余裕)
  PANTO_HW: 1.10,          // パンタグラフ・架線の占める半幅[m]
  PANTO_Y: [4.30, 6.40],   // その高さ(トロリ線4.95・ちょう架線5.90+余裕)
  ROOF_MIN: 7.00,          // 線路の上に架かる屋根・梁の下端の最小値(架線柱の頂部と同じ)
  TACTILE_KEEP: 0.80,      // 階段・エレベーターは線路側の縁からこれ以上離す[m]
  SIGN_PER_PLAT: 3,        // 1面あたりの駅名標(両面で1組)の最小数
  CALLS_PER_STA: 16,       // 1駅あたりの Mesh(=描画の呼び出し)の上限
  // 公表デザイン(京王電鉄 2019.5.30)の要点 → その駅に無ければならない外装の部品
  DESIGN: {
    '代田橋': ['外装:レンガ調', '外装:流れのルーバー'],
    '明大前': ['外装:リズムの板 c', '外装:リズムの板 f', '外装:リズムの板 s'],
    '下高井戸': ['大庇', '大庇の柱', '外装:暖色の帯'],
    '桜上水': ['外装:木のルーバー'],
    '上北沢': ['外装:落ち着いた色', '外装:透明の帯'],
    '芦花公園': ['外装:書架の棚', '外装:本の背'],
    '千歳烏山': ['外装:格子(縦)', '外装:格子(横)'],
  },
  LATTICE: 1.6,            // 千歳烏山の格子の目(粗目=1.5m以上)
};

const rows = [];
let ng = 0;
function ok(name, cond, expect, got) { if (!cond) ng++; rows.push([name, expect, got, cond ? 'OK' : 'NG']); }

// その s にある線路の横位置の一覧。end>0 なら線路の終端からその長さを除く
// (行き止まりの線路の終端には車止めが立つ。そこは列車が入らない所なので測らない)
function tracksAt(s, end) {
  const out = [], e = end || 0;
  for (const t of X.TRACKS) if (s >= t.x0 - 0.5 + e && s <= t.x1 + 0.5 - e) out.push(t.zf(s));
  return out;
}
const STA_TAGS = new Set(['ホーム', '点字ブロック', 'ホーム端の柵', 'ホームドア', '階段の囲い', 'エレベーター',
  'ベンチ', '自動販売機', '乗務員モニター', 'ホームの柱', '吊りレール', '屋根の梁', '大屋根', '上屋',
  '駅舎', '駅舎の庇', '大庇', '大庇の柱']);

/* ---- 1. 建築限界:駅の部品が列車・パンタグラフの通る空間に入らない ---------- */
{
  let bad = null, n = 0;
  for (const q of X.STRUCT) {
    if (!STA_TAGS.has(q.tag) && q.tag.indexOf('外装') !== 0) continue;
    n++;
    for (const s of [q.s0, (q.s0 + q.s1) / 2, q.s1]) {
      const y = X.railY(s);
      for (const t of tracksAt(s)) {
        const hit = (hw, ya, yb) => q.y1 > y + ya && q.y0 < y + yb && q.o1 > t - hw && q.o0 < t + hw;
        if ((hit(REF.BODY_HW, REF.BODY_Y[0], REF.BODY_Y[1]) || hit(REF.PANTO_HW, REF.PANTO_Y[0], REF.PANTO_Y[1])) && !bad)
          bad = [q.tag, 's=' + s.toFixed(1), 'off ' + q.o0.toFixed(2) + '〜' + q.o1.toFixed(2), '線路 ' + t.toFixed(2)];
      }
    }
  }
  ok('部品が車両の通る空間に入らない', bad === null, '0件(' + n + '部品)', bad ? bad.join(' ') : '0件(' + n + '部品)');
}
// 1b. 実際の頂点でも測る(登録簿に載らない部品の取りこぼし対策)
{
  let bad = null, nv = 0;
  // 線路の座標へ戻す:駅の中心付近の frame を 0.5m 刻みで表にして、最も近い点を探す
  for (const S of X.STG) {
    const c0 = S.st.x, tab = [];
    for (let s = c0 - 400; s <= c0 + 400; s += 0.5) { const f = X.frame(s, 0); tab.push([s, f.x, f.z, f.a]); }
    const meshes = [];
    const walk = (o) => { if (o.isMesh && o.geometry && o.geometry.attributes && o.geometry.attributes.position) meshes.push(o); for (const c of o.children || []) walk(c); };
    walk(S.g);
    for (const m of meshes) {
      if (m.material === X.MAT.glass || m.material === X.MAT.sign) continue;  // ガラス・看板は登録簿で見る
      const P = m.geometry.attributes.position.array;
      for (let i = 0; i < P.length; i += 9) {          // 3頂点に1つを標本にする
        const x = P[i], yv = P[i + 1], z = P[i + 2];
        let best = null, bd = 1e18;
        for (const r of tab) { const d = (r[1] - x) ** 2 + (r[2] - z) ** 2; if (d < bd) { bd = d; best = r; } }
        if (!best || bd > 60 * 60) continue;
        const s = best[0], a = best[3];
        const off = -(x - best[1]) * Math.sin(a) + (z - best[2]) * Math.cos(a);
        const ds = (x - best[1]) * Math.cos(a) + (z - best[2]) * Math.sin(a);
        const ry = X.railY(s + ds);
        nv++;
        for (const t of tracksAt(s + ds, 2.0)) {
          const d = Math.abs(off - t);
          const inBody = yv > ry + REF.BODY_Y[0] + 0.02 && yv < ry + REF.BODY_Y[1] && d < REF.BODY_HW - 0.02;
          const inPanto = yv > ry + REF.PANTO_Y[0] && yv < ry + REF.PANTO_Y[1] && d < REF.PANTO_HW - 0.02;
          if ((inBody || inPanto) && !bad) bad = [S.st.n, 's=' + (s + ds).toFixed(1), 'off=' + off.toFixed(2), 'h=' + (yv - ry).toFixed(2)];
        }
      }
    }
  }
  ok('頂点が車両の通る空間に入らない', bad === null, '0点', bad ? bad.join(' ') : '0点(標本' + nv + '点)');
}
// 1c. 線路の上に架かる屋根・梁は架線設備より上
{
  let bad = null;
  for (const q of X.STRUCT) {
    if (q.tag !== '大屋根' && q.tag !== '屋根の梁') continue;
    const s = (q.s0 + q.s1) / 2, y = X.railY(s);
    if (q.y0 < y + REF.ROOF_MIN - 1e-6 && !bad) bad = [q.tag, 's=' + s.toFixed(0), (q.y0 - y).toFixed(2) + 'm'];
  }
  ok('大屋根の梁は架線柱より上', bad === null, '下端≥' + REF.ROOF_MIN + 'm', bad ? bad.join(' ') : '全て');
}

/* ---- 2. 階段・エレベーター --------------------------------------------- */
{
  let bad = null, nS = 0, nE = 0;
  for (const w of X.STAIRS) {
    if (w.kind === '階段') nS++; else nE++;
    // そのホーム(同じ駅で off の範囲が重なるもの)を探す
    const pl = X.PLATS.find((p) => w.o0 >= p.off - p.hw - 1e-6 && w.o1 <= p.off + p.hw + 1e-6 &&
      w.s0 >= p.x0 && w.s1 <= p.x1);
    if (!pl) { if (!bad) bad = [w.st.n, w.kind, 'ホームからはみ出す']; continue; }
    // 線路側の縁からの距離(点字ブロックより内側=縁から0.8m以上)
    for (const sg of [-1, 1]) {
      const edge = pl.off + sg * pl.hw;
      const hasTrack = tracksAt((w.s0 + w.s1) / 2).some((t) => sg * (t - edge) > 0 && sg * (t - edge) < 2.6);
      if (!hasTrack) continue;
      const d = sg > 0 ? edge - w.o1 : w.o0 - edge;
      if (d < REF.TACTILE_KEEP && !bad) bad = [w.st.n, w.kind, '縁から' + d.toFixed(2) + 'm'];
    }
  }
  ok('階段・EVがホームに収まる', bad === null, '縁から' + REF.TACTILE_KEEP + 'm以上', bad ? bad.join(' ') : '階段' + nS + '・EV' + nE);
  // 島式・相対式の各ホームに1組以上(仙川の単式=幅3.4mは除く)
  let miss = null;
  for (const p of X.PLATS) {
    if (p.hw < 2.0) continue;
    const has = X.STAIRS.some((w) => w.kind === '階段' && w.o0 >= p.off - p.hw && w.o1 <= p.off + p.hw && w.s0 >= p.x0 && w.s1 <= p.x1);
    if (!has && !miss) miss = 'off=' + p.off.toFixed(2) + ' s=' + p.x0.toFixed(0);
  }
  ok('各ホームに階段がある', miss === null, '幅4m以上の全ホーム', miss || '全て');
}
// 2b. ホームの柱は井戸・EVの中に立たない
{
  let bad = null, n = 0;
  for (const q of X.STRUCT) {
    if (q.tag !== 'ホームの柱') continue;
    n++;
    for (const w of X.STAIRS)
      if (q.s1 > w.s0 && q.s0 < w.s1 && q.o1 > w.o0 && q.o0 < w.o1 && !bad) bad = [w.st.n, w.kind, 's=' + q.s0.toFixed(1)];
  }
  ok('柱が井戸・EVに立たない', bad === null, '0本', bad ? bad.join(' ') : '0本(柱' + n + '本)');
}

/* ---- 3. 駅名標:駅ごとの数と、見る向きに対する左右の駅名 ---------------------- */
{
  // 看板のこま k → 駅 i と種類(0:左に新宿方 / 1:左に八王子方 / 2:駅舎)
  let badN = null, badLR = null, badSt = null, n = 0;
  const perSta = X.STA.map(() => 0);
  for (const g of X.SIGNS) {
    if (g.k >= 3 * X.STA.length) continue;                // 共通(出口など)
    const i = Math.floor(g.k / 3), v = g.k % 3;
    // その看板がどの駅にあるか(位置から独立に決める)
    let near = 0, bd = 1e9;
    X.STA.forEach((st, j) => { const d = Math.abs(st.x - g.s); if (d < bd) { bd = d; near = j; } });
    if (near !== i && !badSt) badSt = [X.STA[near].n + 'に' + X.STA[i].n + 'の看板', 's=' + g.s.toFixed(0)];
    if (v === 2) continue;
    perSta[i]++; n++;
    if (g.face !== 1 && g.face !== -1) { if (!badLR) badLR = ['駅名標が線路を向いていない']; continue; }
    // 見る人は看板の正面に立ち、看板と逆向き(-face の off 方向)を向く。
    // その人の左手側にあるのが新宿方(s が小さい側)か八王子方かを座標から求める
    const f = X.frame(g.s, g.off), fe = X.frame(g.s - 10, g.off), fn = X.frame(g.s, g.off + g.face);
    const look = [-(fn.x - f.x), -(fn.z - f.z)];               // 見る向き(水平)
    const left = [look[1], -look[0]];                           // 上=(0,1,0) × look の水平成分
    // 右手系 X=東, Z=南, Y=上:上×前 = 左。(0,1,0)×(lx,0,lz) = (lz,0,-lx)
    const toEast = [fe.x - f.x, fe.z - f.z];
    const eastIsLeft = (left[0] * toEast[0] + left[1] * toEast[1]) > 0;
    const want = eastIsLeft ? 0 : 1;
    if (v !== want && !badLR) badLR = [X.STA[i].n, 's=' + g.s.toFixed(0), 'face=' + g.face];
  }
  X.STA.forEach((st, i) => {
    const plats = X.PLATS.filter((p) => p.x0 < st.x + 160 && p.x1 > st.x - 160).length;
    if (perSta[i] < REF.SIGN_PER_PLAT * 2 * Math.max(1, plats) && !badN) badN = [st.n, perSta[i] + '面'];
  });
  ok('駅名標の数', badN === null, '1ホーム' + REF.SIGN_PER_PLAT + '組以上', badN ? badN.join(' ') : n + '面');
  ok('駅名標の左右の駅名が見る向きと合う', badLR === null, '全て', badLR ? badLR.join(' ') : '全て');
  ok('看板の駅名がその駅', badSt === null, '全て', badSt ? badSt.join(' ') : '全て');
}

/* ---- 4. 公表デザインの要点が形になっている ----------------------------------- */
{
  let bad = null;
  const got = [];
  for (const name of Object.keys(REF.DESIGN)) {
    const st = X.STA.find((s) => s.n === name);
    if (!st) { bad = bad || [name, '駅が無い']; continue; }
    const tags = new Set(X.STRUCT.filter((q) => (q.s0 + q.s1) / 2 > st.x - 140 && (q.s0 + q.s1) / 2 < st.x + 140).map((q) => q.tag));
    const miss = REF.DESIGN[name].filter((t) => !tags.has(t));
    if (miss.length && !bad) bad = [name, miss.join('・') + 'が無い'];
    got.push(name + ' ' + REF.DESIGN[name].length);
  }
  ok('公表デザインの要点', bad === null, '7駅すべて', bad ? bad.join(' ') : '7駅すべて');
  // 千歳烏山の格子は"粗目"(縦材の間隔)
  const st = X.STA.find((s) => s.n === '千歳烏山');
  const v = X.STRUCT.filter((q) => q.tag === '外装:格子(縦)' && q.o0 > 0).map((q) => (q.s0 + q.s1) / 2).sort((a, b) => a - b);
  const pitch = v.length > 1 ? (v[v.length - 1] - v[0]) / (v.length - 1) : 0;
  ok('千歳烏山の格子の目', pitch >= 1.5 && pitch <= 2.5, '1.5〜2.5m', pitch.toFixed(2) + 'm(' + v.length + '本)');
  // 代田橋・芦花公園は模様を画像で持つ(レンガ・本の背)。その材質が駅の群にあること
  const mats = (name) => {
    const S = X.STG.find((q) => q.st.n === name), out = new Set();
    const walk = (o) => { if (o.isMesh) out.add(o.material); for (const c of o.children || []) walk(c); };
    if (S) walk(S.g);
    return out;
  };
  ok('代田橋にレンガ調', mats('代田橋').has(X.MAT_BRICK), 'レンガの材質', mats('代田橋').has(X.MAT_BRICK) ? 'あり' : 'なし');
  ok('芦花公園に書架', mats('芦花公園').has(X.MAT_BOOK), '本の背の材質', mats('芦花公園').has(X.MAT_BOOK) ? 'あり' : 'なし');
  ok('明大前に半透明の板', mats('明大前').has(X.MAT.frost), '半透明の材質', mats('明大前').has(X.MAT.frost) ? 'あり' : 'なし');
}

/* ---- 5. 軽さ:駅ごとの Mesh の数と、細部が LOD に載っていること --------------- */
{
  let worst = null, total = 0;
  for (const S of X.STG) {
    let n = 0;
    const walk = (o) => { if (o.isMesh) n++; for (const c of o.children || []) walk(c); };
    walk(S.g);
    total += n;
    if (!worst || n > worst[1]) worst = [S.st.n, n];
  }
  ok('駅あたりの描画の呼び出し', worst[1] <= REF.CALLS_PER_STA, '≤' + REF.CALLS_PER_STA + '回', worst.join(' ') + '回(全駅 ' + total + ')');
  const lod = X.STG.filter((S) => X.LODS.some((L) => L.o === S.d)).length;
  ok('駅の細部が LOD に載る', lod === X.STG.length, X.STG.length + '駅', lod + '駅');
}

/* ---- 出力 ---- */
const w = (s, n) => String(s) + ' '.repeat(Math.max(0, n -
  [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0)));
console.log('=== 駅の構造の検証 ===');
console.log('');
console.log(w('項目', 34) + w('要件', 24) + w('実測', 40) + '判定');
for (const r of rows) console.log(w(r[0], 34) + w(r[1], 24) + w(r[2], 40) + r[3]);
console.log('');
console.log('RESULT: ' + (ng ? 'FAIL(' + ng + '項目NG)' : 'PASS'));
process.exit(ng ? 1 : 0);
