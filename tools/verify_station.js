// 駅の構造を検査する(⑪)。
//
//   駅は結合ジオメトリ(3b章)で細かく作り込んだので、見た目では確かめきれない
//   「列車に当たらないか」「階段やエレベーターがホームに収まっているか」
//   「駅名標の左右の駅名が見る向きと合っているか」「公表デザインの要点が形になっているか」
//   「細かくしても描画の呼び出しが増えていないか」を数値で確かめる。
//
//   ・列車との干渉は、登録簿 STRUCT(部品の s/off/高さの範囲)と、実際に出来た頂点の
//     両方で測る。建築限界の寸法は検証側が独立に持つ(HTMLからは読まない)。
//   ・公表デザインの要点も検証側が持つ。出典は京王電鉄 2019.5.30 の発表の「イメージパース」
//     (利用者提供の画像。寸法はパースの人物 約1.7m と比べて読んだ)と「デザインのポイント」の文。
//   使い方: node tools/verify_station.js [keio_elevated_3d.html]
const path = process.argv[2] || 'keio_elevated_3d.html';
const X = require('./stub_three')(path,
  'STA:STA,STG:STG,STRUCT:STRUCT,TRACKS:TRACKS,railY:railY,frame:frame,PLATS:PLATS,' +
  'STAIRS:(typeof STAIRS!=="undefined"?STAIRS:[]),SIGNS:(typeof SIGNS!=="undefined"?SIGNS:[]),' +
  'WEAVE:(typeof WEAVE!=="undefined"?WEAVE:[]),MAT:MAT,MAT_BRICK:MAT_BRICK,MAT_STONE:MAT_STONE,MAT_LOUVER:MAT_LOUVER,MAT_RIB:MAT_RIB,' +
  'platRange:platRange,deckHalf:deckHalf,' +
  'PSD:PSD,K8:K8,DECK_END:DECK_END,LODS:LODS,POLE_S:POLE_S,WIRE_CAT:WIRE_CAT');

/* ---- 検証側が独立に持つ寸法 -------------------------------------------- */
const REF = {
  BODY_HW: 1.385 + 0.06,   // 車体の半幅(8000系 2.770m)+ゆれの余裕[m]
  BODY_Y: [0.30, 4.30],    // 車体が占める高さ(レール面から。冷房装置の上端4.055+余裕)
  PANTO_HW: 1.10,          // パンタグラフ・架線の占める半幅[m]
  PANTO_Y: [4.30, 6.15],   // その高さ(トロリ線4.95・き電ちょう架線5.90+余裕0.25)。
                           // 架線の支持物(可動ブラケット)は駅の部品ではないので、ここでは測らない(⑥で見る)
  ROOF_MIN: 7.00,          // 線路の上に架かる屋根・梁の下端の最小値(可動ブラケットを吊る余裕)
  TACTILE_KEEP: 0.80,      // 階段・エレベーターは線路側の縁からこれ以上離す[m]
  SIGN_PER_PLAT: 3,        // 1面あたりの駅名標(両面で1組)の最小数
  CALLS_PER_STA: 16,       // 1駅あたりの Mesh(=描画の呼び出し)の上限
  // 公表パース(京王電鉄 2019.5.30)に写っているもの → その駅に無ければならない部品
  DESIGN: {
    '代田橋': ['外装:透明のスクリーン', '外装:縦材', '外装:流れのルーバー', '駅舎:レンガ', '駅舎:格子の庇'],
    '明大前': ['外装:横ルーバー', '外装:紫のアクセント', '外装:灰の板', '外装:透明', '駅舎:半透明の壁'],
    '下高井戸': ['外装:白い腰壁', '外装:ガラスの帯', '外装:ガラリの板', '大庇', '大庇の柱'],
    '桜上水': ['外装:縦リブの板', '外装:細長い窓', '外装:暗い帯', '駅舎:木の縦ルーバー'],
    '上北沢': ['外装:ベージュの帯', '外装:透明の帯', '外装:白い弓形の柱', '駅舎:石積み', '駅舎:低い庇'],
    '芦花公園': ['外装:木の縦格子', '外装:深い軒', '外装:石積み', '駅舎:石積み'],
    '千歳烏山': ['外装:格子(縦)', '外装:格子(横)', '外装:高架の側面', '駅舎:木の柱'],
  },
  // パースから読んだ寸法(人物 約1.7m との比)
  LATTICE: [0.7, 1.2],     // 千歳烏山の格子の目[m](ホーム階の高さに約9段)
  LATTICE_ROWS: 6,         // 同 段の数の最小
  WEAVE_SEP: [0.06, 0.30], // 同 平織り:交点で表の帯と裏の帯の層の差(帯が貫き合わない・浮きすぎない)[m]
  STAIRS_PER_PLAT: 2,      // 1つのホームの階段の数(利用者指示:1ホームに2か所)
  STAIR_GAP: 10,           // 2か所の階段の離れの最小[m](同じ場所に並べたものは1か所と数える)
  FIN_PITCH: [0.4, 0.65],  // 芦花公園の縦格子の間隔[m]
  FIN_DEPTH: 0.40,         // 同 見込みの最小[m](奥行きのある厚い縦格子)
  EAVE_OVER: 1.2,          // 同 屋根の張り出し(縦格子より外へ)の最小[m]
  POST_PITCH: [1.2, 2.2],  // 代田橋の細い縦材の間隔[m]
  FLOW_SPAN: 2.5,          // 代田橋の流れの帯が上下に動く幅の最小[m](下に寄る所と上に寄る所がある)
  PURPLE_MIN: 20,          // 明大前の紫の横帯の数(片側)の最小
  SWEEP: 1.0,              // 下高井戸の大庇の縁の高さの変化(反り上がり)の最小[m]
  BOW_PITCH: [10, 20],     // 上北沢の白い弓形の柱の間隔[m]
  BOW_TOP: 6.5,            // 同 上端(レール面から)の最小[m]:屋根の軒より上へ伸びる
};

const rows = [];
let ng = 0;
function ok(name, cond, expect, got) { if (!cond) ng++; rows.push([name, expect, got, cond ? 'OK' : 'NG']); }

// その s にある線路の横位置の一覧。end>0 なら線路の終端からその長さを除く
// (行き止まりの線路の終端には車止めが立つ。そこは列車が入らない所なので測らない)
/* 線分 p→q(断面の [off,高さ])が矩形 [ox0,ox1]×[yy0,yy1] と交わるか(Liang–Barsky) */
function segHits(p, q, ox0, ox1, yy0, yy1) {
  let t0 = 0, t1 = 1;
  const dx = q[0] - p[0], dy = q[1] - p[1];
  for (const [pp, qq] of [[-dx, p[0] - ox0], [dx, ox1 - p[0]], [-dy, p[1] - yy0], [dy, yy1 - p[1]]]) {
    if (Math.abs(pp) < 1e-12) { if (qq < 0) return false; continue; }
    const r = qq / pp;
    if (pp < 0) { if (r > t1) return false; if (r > t0) t0 = r; } else { if (r < t0) return false; if (r < t1) t1 = r; }
  }
  return t0 <= t1;
}
// 線分の、off が [ox0,ox1] にある部分の最も低い高さ(その範囲に無ければ null)
function segMinY(p, q, ox0, ox1) {
  const a = Math.max(Math.min(p[0], q[0]), ox0), b = Math.min(Math.max(p[0], q[0]), ox1);
  if (a > b) return null;
  const at = (o) => (Math.abs(q[0] - p[0]) < 1e-12) ? Math.min(p[1], q[1]) : p[1] + (q[1] - p[1]) * (o - p[0]) / (q[0] - p[0]);
  return Math.min(at(a), at(b));
}
function tracksAt(s, end) {
  const out = [], e = end || 0;
  for (const t of X.TRACKS) if (s >= t.x0 - 0.5 + e && s <= t.x1 + 0.5 - e) out.push(t.zf(s));
  return out;
}
const STA_TAGS = new Set(['ホーム', '点字ブロック', 'ホーム端の柵', 'ホームドア', '階段の囲い', 'エレベーター',
  'ベンチ', '自動販売機', '乗務員モニター', 'ホームの柱', '吊りレール', '屋根の梁', '大屋根', '上屋',
  '駅舎', '駅舎の庇', '大庇', '大庇の柱', '大庇の縁', '橋上駅舎', '橋上駅舎の柱']);

/* ---- 1. 建築限界:駅の部品が列車・パンタグラフの通る空間に入らない ---------- */
{
  let bad = null, n = 0;
  for (const q of X.STRUCT) {
    if (!STA_TAGS.has(q.tag) && q.tag.indexOf('外装') !== 0) continue;
    n++;
    for (const s of [q.s0, (q.s0 + q.s1) / 2, q.s1]) {
      const y = X.railY(s);
      for (const t of tracksAt(s)) {
        const hit = (hw, ya, yb) => q.line ? segHits(q.line[0], q.line[1], t - hw, t + hw, y + ya, y + yb)
          : (q.y1 > y + ya && q.y0 < y + yb && q.o1 > t - hw && q.o0 < t + hw);
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
// 1c. 線路の上(パンタグラフの幅の範囲)に架かる屋根・梁は架線設備より上。
//     軒を下げた屋根(上北沢)は線路の上だけ高ければよいので、傾いた面は線分で測る
{
  let bad = null, n = 0;
  for (const q of X.STRUCT) {
    if (q.tag !== '大屋根' && q.tag !== '屋根の梁' && q.tag !== '橋上駅舎') continue;
    const s = (q.s0 + q.s1) / 2, y = X.railY(s);
    for (const t of tracksAt(s)) {
      const ox0 = t - REF.PANTO_HW, ox1 = t + REF.PANTO_HW;
      const low = q.line ? segMinY(q.line[0], q.line[1], ox0, ox1) : ((q.o1 > ox0 && q.o0 < ox1) ? q.y0 : null);
      if (low === null) continue;
      n++;
      if (low < y + REF.ROOF_MIN - 1e-6 && !bad) bad = [q.tag, 's=' + s.toFixed(0), '線路 ' + t.toFixed(2), (low - y).toFixed(2) + 'm'];
    }
  }
  ok('線路の上の屋根は架線柱より上', bad === null, '下端≥' + REF.ROOF_MIN + 'm', bad ? bad.join(' ') : '全て(' + n + '箇所)');
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
  // 島式・相対式の各ホームに2か所(仙川の単式=幅3.4mは除く)。離れた場所にあるものだけ数える
  let miss = null, nP = 0;
  for (const p of X.PLATS) {
    if (p.hw < 2.0) continue;
    nP++;
    const W = X.STAIRS.filter((w) => w.kind === '階段' && w.o0 >= p.off - p.hw && w.o1 <= p.off + p.hw &&
      w.s0 >= p.x0 && w.s1 <= p.x1).sort((a, b) => a.s0 - b.s0);
    let k = 0, last = -1e9;
    for (const w of W) if (w.s0 >= last + REF.STAIR_GAP) { k++; last = w.s1; }
    if (k < REF.STAIRS_PER_PLAT && !miss) miss = 'off=' + p.off.toFixed(2) + ' s=' + p.x0.toFixed(0) + ' ' + k + 'か所';
  }
  ok('各ホームに階段が' + REF.STAIRS_PER_PLAT + 'か所', miss === null, '幅4m以上の全ホーム(' + nP + '面)', miss || '全て');
  // 地上駅(線路が地平)の階段は上の橋上駅舎へ上がる(利用者指示:仙川)。高架駅は高架下へ降りる。
  // 地上か高架かは検証側がレール面の高さで決める(3m 未満=地上)
  let badUp = null, nUp = 0;
  for (const w of X.STAIRS) {
    if (w.kind !== '階段') continue;
    const ground = X.railY((w.s0 + w.s1) / 2) < 3;
    if (ground) nUp++;
    if (!!w.up !== ground && !badUp) badUp = [w.st.n, ground ? '地上駅なのに下りる' : '高架駅なのに上がる'];
    if (ground && !X.STRUCT.some((q) => q.tag === '橋上駅舎' && q.s0 <= Math.max(w.s0, w.s1) + 0.5 && q.s1 >= Math.min(w.s0, w.s1) - 0.5 &&
      q.o0 <= w.o0 && q.o1 >= w.o1) && !badUp) badUp = [w.st.n, '上った先に橋上駅舎が無い'];
  }
  ok('地上駅の階段は橋上駅舎へ上がる', badUp === null && nUp > 0, '地上駅=上り・高架駅=下り', badUp ? badUp.join(' ') : '上り' + nUp + 'か所');
}
// 2b. ホームの柱・ベンチ・自動販売機は井戸・EVの中に立たない(階段を増やしたので位置がぶつかりうる)
{
  let bad = null, n = 0;
  const FLOOR = new Set(['ホームの柱', 'ベンチ', '自動販売機', '乗務員モニター']);
  for (const q of X.STRUCT) {
    if (!FLOOR.has(q.tag)) continue;
    n++;
    for (const w of X.STAIRS)
      if (q.s1 > w.s0 && q.s0 < w.s1 && q.o1 > w.o0 && q.o0 < w.o1 && !bad) bad = [w.st.n, w.kind, q.tag, 's=' + q.s0.toFixed(1)];
  }
  ok('柱・ベンチ等が井戸・EVに立たない', bad === null, '0件', bad ? bad.join(' ') : '0件(' + n + '個)');
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
  // パースから読んだ寸法(北面で測る)
  const north = (tag) => X.STRUCT.filter((q) => q.tag === tag && q.o0 > 0);
  const pitchOf = (list) => {
    const v = list.map((q) => (q.s0 + q.s1) / 2).sort((a, b) => a - b);
    return v.length > 1 ? (v[v.length - 1] - v[0]) / (v.length - 1) : 0;
  };
  const inR = (v, r) => v >= r[0] && v <= r[1];
  // 千歳烏山の格子は平織り:縦の帯が格子の目の間隔で揃って並び、交点ごとに横と縦の帯の表裏が
  // 上下・左右で交互に入れ替わる(利用者指示。2026-10 小口積みから訂正)
  { const byC = new Map();
    for (const q of north('外装:格子(縦)')) {
      const k = Math.round(q.y0 * 50);
      if (!byC.has(k)) byC.set(k, []);
      byC.get(k).push((q.s0 + q.s1) / 2);
    }
    const C = [...byC.keys()].sort((a, b) => a - b).map((k) => byC.get(k).sort((a, b) => a - b));
    let pmin = 1e9, pmax = 0, bad = null;
    for (const c of C) for (let i = 1; i < c.length; i++) { const d = c[i] - c[i - 1]; pmin = Math.min(pmin, d); pmax = Math.max(pmax, d); }
    for (let r = 1; r < C.length; r++)                // 縦の帯は段ごとにずれず、同じ位置に揃う
      if ((C[r].length !== C[0].length || C[r].some((v, i) => Math.abs(v - C[0][i]) > 0.01)) && !bad) bad = (r + 1) + '段目で縦の帯がずれる';
    ok('千歳烏山の格子の目', C.length >= REF.LATTICE_ROWS && pmin >= REF.LATTICE[0] && pmax <= REF.LATTICE[1],
      REF.LATTICE.join('〜') + 'm・' + REF.LATTICE_ROWS + '段以上',
      C.length ? pmin.toFixed(2) + '〜' + pmax.toFixed(2) + 'm・' + C.length + '段' : '無し');
    // 平織り:交点ごとに表(外側)の帯が横と縦で入れ替わる。右隣・上の交点とは表裏が逆
    const key = (q) => q.sg + ',' + q.r + ',' + q.c, W = new Map(X.WEAVE.map((q) => [key(q), q]));
    const outerH = (q) => Math.abs(q.hor) > Math.abs(q.ver);
    let n = 0;
    for (const q of X.WEAVE) {
      n++;
      const sep = Math.abs(Math.abs(q.hor) - Math.abs(q.ver));
      if ((sep < REF.WEAVE_SEP[0] || sep > REF.WEAVE_SEP[1]) && !bad) bad = '交点の層の差 ' + sep.toFixed(3) + 'm';
      for (const nb of [W.get(q.sg + ',' + q.r + ',' + (q.c + 1)), W.get(q.sg + ',' + (q.r + 1) + ',' + q.c)])
        if (nb && outerH(nb) === outerH(q) && !bad) bad = '段' + q.r + '・列' + q.c + 'の隣と表裏が同じ';
    }
    ok('千歳烏山の格子が平織り(交点ごとに表裏が交互)', bad === null && n > 100, '上下・左右で交互・層の差' + REF.WEAVE_SEP.join('〜') + 'm',
      bad || n + '交点'); }
  { const L = north('外装:木の縦格子'), pt = pitchOf(L);
    const dep = L.length ? Math.min.apply(null, L.map((q) => q.o1 - q.o0)) : 0;
    ok('芦花公園の縦格子(間隔・見込み)', inR(pt, REF.FIN_PITCH) && dep >= REF.FIN_DEPTH - 1e-6,
      REF.FIN_PITCH.join('〜') + 'm・見込み≥' + REF.FIN_DEPTH, pt.toFixed(2) + 'm・' + dep.toFixed(2) + 'm');
    const eave = north('外装:深い軒'), fo = L.length ? Math.max.apply(null, L.map((q) => q.o1)) : 0;
    const eo = eave.length ? Math.max.apply(null, eave.map((q) => q.o1)) : 0;
    ok('芦花公園の深い軒', eo - fo >= REF.EAVE_OVER, '縦格子より' + REF.EAVE_OVER + 'm以上外', (eo - fo).toFixed(2) + 'm'); }
  { const pt = pitchOf(north('外装:縦材'));
    ok('代田橋の細い縦材の間隔', inR(pt, REF.POST_PITCH), REF.POST_PITCH.join('〜') + 'm', pt.toFixed(2) + 'm');
    const F = north('外装:流れのルーバー').map((q) => (q.y0 + q.y1) / 2 - X.railY((q.s0 + q.s1) / 2));
    const lo = F.length ? Math.min.apply(null, F) : 0, hi = F.length ? Math.max.apply(null, F) : 0;
    ok('代田橋の流れ(帯が上下に動く)', hi - lo >= REF.FLOW_SPAN, '≥' + REF.FLOW_SPAN + 'm',
      (hi - lo).toFixed(2) + 'm(' + lo.toFixed(1) + '〜' + hi.toFixed(1) + ')'); }
  { const n = north('外装:紫のアクセント').length;
    ok('明大前の紫の横帯', n >= REF.PURPLE_MIN, '片側' + REF.PURPLE_MIN + '本以上', n + '本'); }
  { const E = X.STRUCT.filter((q) => q.tag === '大庇の縁').map((q) => q.y0);
    const sw = E.length ? Math.max.apply(null, E) - Math.min.apply(null, E) : 0;
    ok('下高井戸の大庇の反り', sw >= REF.SWEEP, '縁の高さの差≥' + REF.SWEEP + 'm', sw.toFixed(2) + 'm'); }
  { const B = north('外装:白い弓形の柱'), pt = pitchOf(B);
    const top = B.length ? Math.min.apply(null, B.map((q) => q.y1 - X.railY((q.s0 + q.s1) / 2))) : 0;
    ok('上北沢の白い弓形の柱', inR(pt, REF.BOW_PITCH) && top >= REF.BOW_TOP,
      REF.BOW_PITCH.join('〜') + 'm・上端≥' + REF.BOW_TOP, pt.toFixed(1) + 'm・' + top.toFixed(2) + 'm'); }
  // 模様を画像で持つ外装(レンガ・横ルーバー・石積み・縦リブ)。その材質が駅の群にあること
  const mats = (name) => {
    const S = X.STG.find((q) => q.st.n === name), out = new Set();
    const walk = (o) => { if (o.isMesh) out.add(o.material); for (const c of o.children || []) walk(c); };
    if (S) walk(S.g);
    return out;
  };
  for (const [n, m, lab] of [['代田橋', X.MAT_BRICK, 'レンガ'], ['明大前', X.MAT_LOUVER, '横ルーバー'],
    ['明大前', X.MAT.frost, '半透明の壁'], ['芦花公園', X.MAT_STONE, '石積み'], ['上北沢', X.MAT_STONE, '石積み'],
    ['桜上水', X.MAT_RIB, '縦リブ']])
    ok(n + 'の' + lab, mats(n).has(m), lab + 'の材質', mats(n).has(m) ? 'あり' : 'なし');
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
