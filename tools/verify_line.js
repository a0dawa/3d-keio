// 高架橋の桁幅と架線を、全線10m刻みでスキャンして検査する。
//
//   桁幅は「広すぎても狭すぎても」まずい。狭ければ車両が桁からはみ出し(防御的設計の
//   違反)、広ければ現実には有り得ない構造物になる。どちらも見た目では判断しづらいので
//   線路とホームの実態から必要幅を独立に計算し、その通りかを数値で確かめる。
//   架線は「線路の上に必ずあること」「吊り点が架線柱の真下にあること」を見る。
//
//   使い方: node tools/verify_line.js [keio_elevated_3d.html]
const path = process.argv[2] || 'keio_elevated_3d.html';
const X = require('./stub_three')(path,
  'deckHalf:deckHalf,outerOff:outerOff,platOuter:platOuter,mainOff:mainOff,' +
  'poleXs:poleXs,poleOff:poleOff,poleStep:poleStep,STA:STA,DOM:DOM,DECK_END:DECK_END,' +
  'DECK_MIN:DECK_MIN,railY:railY,platRange:platRange,PLAT_EDGE:PLAT_EDGE,' +
  'TRACKS:(typeof TRACKS!=="undefined"?TRACKS:null),' +
  'WIRES:(typeof WIRES!=="undefined"?WIRES:null),' +
  'POLE_S:(typeof POLE_S!=="undefined"?POLE_S:[]),' +
  'PIERS:(typeof PIERS!=="undefined"?PIERS:[]),' +
  'parkedCars:parkedCars,YARD_A:YARD_A,YARD_B:YARD_B,YARD_E:YARD_E,YARD_W:YARD_W,K8:K8,' +
  'INOKASHIRA_X:INOKASHIRA_X,SETAGAYA_X:SETAGAYA_X,BRIDGE:BRIDGE,KAN7_X:KAN7_X,' +
  'KANPACHI_X:KANPACHI_X,XINGS:XINGS,' +
  'WIRE_CAT:WIRE_CAT,WIRE_TRO:WIRE_TRO,BEAM_LOW:BEAM_LOW,POLE_TOP:POLE_TOP,' +
  'VIA_COLS:(typeof VIA_COLS!=="undefined"?VIA_COLS:[]),STRUCT:(typeof STRUCT!=="undefined"?STRUCT:[]),' +
  'ROAD_SKIP:ROAD_SKIP,PS0:PS0');

/* ---- 設計上の要件(検証側が独立して持つ) ---------------------------------- */
const REQ = {
  CLEAR: 2.45,       // 最外軌道から桁端までの最小距離[m](建築限界+柱)
  PLAT_MARGIN: 0.6,  // ホーム外縁から桁端までの最小距離[m]
  DECK_MIN: 4.45,    // 複線区間の標準半幅[m]
  SLACK: 0.05,       // 必要幅に対して許容する余剰[m]
  GRAD: 1.30,        // 桁幅の変化率の上限[m / 5m]
  STEP: 5,
};

const rows = [];
let ng = 0;
function ok(name, cond, expect, got) { if (!cond) ng++; rows.push([name, expect, got, cond ? 'OK' : 'NG']); }

/* ---- 1. 桁幅 ------------------------------------------------------------- */
const need = (s) => Math.max(REQ.DECK_MIN, X.outerOff(s) + REQ.CLEAR, X.platOuter(s) + REQ.PLAT_MARGIN);
{
  let narrow = null, wide = null, steep = null, prev = null, sum = 0, n = 0;
  for (let s = X.DOM.x0; s < X.DECK_END; s += REQ.STEP) {
    const h = X.deckHalf(s), w = need(s);
    if (h < X.outerOff(s) + REQ.CLEAR - 1e-9 && !narrow) narrow = [s, (h - X.outerOff(s)).toFixed(2)];
    if (h < X.platOuter(s) + REQ.PLAT_MARGIN - 1e-9 && !narrow) narrow = [s, 'ホーム外'];
    if (h - w > REQ.SLACK && (!wide || h - w > wide[1])) wide = [s, h - w];
    if (prev !== null && Math.abs(h - prev) > REQ.GRAD && !steep) steep = [s, (h - prev).toFixed(2)];
    prev = h; sum += h - w; n++;
  }
  ok('桁が最外軌道から2.45m以上', narrow === null, '違反なし', narrow ? 's=' + narrow[0] + ' ' + narrow[1] + 'm' : '違反なし');
  ok('桁に無駄な幅がない', wide === null, '余剰≤' + REQ.SLACK + 'm',
    wide ? 's=' + wide[0].toFixed(0) + ' +' + wide[1].toFixed(2) + 'm' : '余剰 0.00m');
  ok('桁幅が急変しない', steep === null, '≤' + REQ.GRAD + 'm/' + REQ.STEP + 'm',
    steep ? 's=' + steep[0] + ' ' + steep[1] + 'm' : '滑らか');
  rows.push(['平均余剰', '0.00m', (sum / n).toFixed(3) + 'm', 'OK']);
}
// 駅ごとに必要幅が確保されているか(ホームが桁からはみ出さない)
{
  let bad = null;
  for (const st of X.STA) {
    if (st.x > X.DECK_END) continue;                    // 仙川は地上区間
    const h = X.deckHalf(st.x), e = X.PLAT_EDGE[st.t] || 0;
    if (h < e + REQ.PLAT_MARGIN - 1e-9 && !bad) bad = [st.n, (h - e).toFixed(2)];
  }
  ok('全駅でホームが桁に載る', bad === null, '違反なし', bad ? bad.join(' ') + 'm' : '違反なし');
}

/* ---- 2. 架線:線路の上にあるか / 吊り点が柱の真下か ------------------------ */
if (X.TRACKS && X.WIRES) {
  // 2-1 架線の無い線路が無いこと
  const uncovered = X.TRACKS.filter((t) => !X.WIRES.some((w) => w.id === t.id));
  ok('全ての線路に架線がある', uncovered.length === 0, '0本',
    uncovered.length ? uncovered.map((t) => t.id).join(',') : '0本');
  // 2-2 架線の横位置が線路の中心と一致すること
  {
    let bad = null;
    for (const w of X.WIRES) {
      const t = X.TRACKS.find((q) => q.id === w.id);
      if (!t) continue;
      for (let s = w.x0; s <= w.x1; s += 25) {
        const d = Math.abs(w.zf(s) - t.zf(s));
        if (d > 0.01 && (!bad || d > bad[1])) bad = [w.id, d];
      }
    }
    ok('架線が線路の真上にある', bad === null, 'ずれ≤0.01m', bad ? bad[0] + ' ' + bad[1].toFixed(3) + 'm' : 'ずれ 0.000m');
  }
  // 2-3 吊り点(垂れ0の点)が架線柱の位置と一致すること
  {
    let bad = null;
    for (const w of X.WIRES) {
      for (const h of w.hangers) {
        if (!X.POLE_S.some((p) => Math.abs(p - h) < 0.01)) { bad = bad || [w.id, h.toFixed(1)]; }
      }
    }
    ok('吊り点が架線柱の真下', bad === null, '全て一致', bad ? bad.join(' @s=') : '全て一致');
  }
  // 2-4 架線が線路の全長をカバーすること
  {
    let bad = null;
    for (const t of X.TRACKS) {
      const w = X.WIRES.find((q) => q.id === t.id);
      if (!w) continue;
      const gap = Math.max(w.x0 - t.x0, t.x1 - w.x1);
      if (gap > 1 && (!bad || gap > bad[1])) bad = [t.id, gap];
    }
    ok('架線が線路の全長を覆う', bad === null, '未架設≤1m', bad ? bad[0] + ' ' + bad[1].toFixed(0) + 'm' : '全長を覆う');
  }
  // 2-4b 架線は架線柱の間で直線であること
  //      線路のように滑らかな曲線にしてはいけない(実物は吊り点を結んだ折れ線)。
  {
    const poleSet = new Set(X.POLE_S.map((v) => v.toFixed(3)));
    let bad = null, spans = 0;
    for (const w of X.WIRES) {
      if (!w.nodes) { bad = bad || [w.id, '節点の記録が無い']; continue; }
      // 節点は「両端」と「架線柱の真下」だけ
      for (let i = 1; i < w.nodes.length - 1; i++)
        if (!poleSet.has(w.nodes[i].toFixed(3)) && !bad)
          bad = [w.id, 's=' + w.nodes[i].toFixed(1) + ' は柱の位置でない'];
      // トロリ線は節点だけで構成される=柱間に中間点が無い=直線
      if (w.troN !== w.nodes.length && !bad)
        bad = [w.id, 'トロリ線に中間点 ' + (w.troN - w.nodes.length) + '点'];
      // ちょう架線は垂れのぶんだけ中間点を持つ(平面では弦のまま)
      const want = (w.nodes.length - 1) * w.sagN + 1;
      if (w.catN !== want && !bad) bad = [w.id, 'ちょう架線の点数 ' + w.catN + '≠' + want];
      spans += w.nodes.length - 1;
    }
    ok('架線柱間が直線', bad === null, '節点=柱の真下のみ',
      bad ? bad.join(' ') : spans + 'スパンすべて');
  }
  /* 2-4c 高架下に構造物がある位置に橋脚を立てないこと。
     横断する道路・鉄道・河川の上には立てない。高架下駅舎の範囲では柱の列は通してよいが、
     柱は駅舎の壁より内側に収まること(壁を貫いて見えない)。駅舎の壁の位置は登録簿 STRUCT の
     '駅舎' から、柱の太さは検証側の値で測る。期待値(横断部の幅)は検証側が独立に持つ。 */
  {
    const BLDG_HALF = 23;          // 高架下駅舎のs方向の半長[m]
    // 高架下を横切るもの [名称, s, 柱を立てない半幅[m]]
    const CROSS = [['井の頭線', X.INOKASHIRA_X, 12], ['世田谷線', X.SETAGAYA_X, 8],
    ['仙川', X.BRIDGE.s, 12], ['環七', X.KAN7_X, 16], ['環八', X.KANPACHI_X, 18]];
    for (const g of X.XINGS) CROSS.push(['踏切道 ' + g[0], g[1], 6]);
    let bad = null;
    const COL_HALF = 0.48;                                   // 柱の半幅(面取りした角柱の外接)
    for (const x of X.PIERS) {
      for (const st of X.STA) {
        if (st.t === 'ctx' || st.t === 'gnd') continue;      // 高架下駅舎を持たない駅
        if (Math.abs(x - st.x) >= BLDG_HALF + 1) continue;
        const b = X.STRUCT.find((q) => q.tag === '駅舎' && x >= q.s0 - 1 && x <= q.s1 + 1);
        const c = X.VIA_COLS.find((q) => Math.abs(q.s - x) < 0.01);
        if (!b || !c) { if (!bad) bad = [st.n + 'の駅舎', b ? '柱の登録なし' : '駅舎の登録なし']; continue; }
        for (const o of c.offs)
          if ((o - COL_HALF < b.o0 || o + COL_HALF > b.o1) && !bad)
            bad = [st.n + 'の駅舎の壁を柱が貫く', 's=' + x.toFixed(0), 'off=' + o.toFixed(2)];
      }
      for (const c of CROSS)
        if (Math.abs(x - c[1]) < c[2] && !bad) bad = [c[0] + 'の直上', 's=' + x.toFixed(0)];
    }
    ok('構造物の上に橋脚が無い', bad === null, '横断部に0本・駅舎の壁の内側',
      bad ? bad.join(' ') : X.PIERS.length + '本すべて');
  }
  /* 2-4d 桜上水の留置線:2本とも東端から西端まで通しで敷かれていること。
     内側は待避線(副本線北)と同じ位置なので、その一定区間は副本線が受け持つ。
     区間の継ぎ目に隙間があると「線路が途切れて見える」。 */
  {
    const PARK_CARS = 10;                                     // 滞泊は上下方とも10両(指示)
    const LEN = (PARK_CARS - 1) * X.K8.PITCH + X.K8.LEN;      // 編成長[m]
    /* そのオフセットに線路がある区間を2m刻みで塗り、途切れ(隙間)を探す。
       内側は待避線(副本線北)が中央を受け持つので、区間の合成ではなく被覆で見る。 */
    const cover = (off) => {
      const seg = []; let run = null;
      for (let s = X.YARD_E; s <= X.YARD_W + 1e-6; s += 2) {
        const on = X.TRACKS.some((t) => s >= t.x0 - 1 && s <= t.x1 + 1 && Math.abs(t.zf(s) - off) < 0.15);
        if (on) { if (!run) { run = [s, s]; seg.push(run); } else run[1] = s; }
        else run = null;
      }
      return seg;
    };
    const inner = cover(X.YARD_A), outer = cover(X.YARD_B);
    const spans = (list) => list.some((q) => q[0] <= X.YARD_E + 2 && q[1] >= X.YARD_W - 2);
    const show = (list) => list.map((q) => q[0].toFixed(0) + '〜' + q[1].toFixed(0)).join(' / ') || 'なし';
    ok('留置線(外側)が通しで敷かれる', spans(outer),
      X.YARD_E.toFixed(0) + '〜' + X.YARD_W.toFixed(0) + 'm', show(outer));
    ok('留置線(内側)が通しで敷かれる', spans(inner),
      X.YARD_E.toFixed(0) + '〜' + X.YARD_W.toFixed(0) + 'm', show(inner));
    ok('滞泊編成の両数', X.parkedCars.length === PARK_CARS * 2,
      PARK_CARS + '両×2本', X.parkedCars.length + '両');
    // 編成が収まる長さがあるか(内側は副本線の一定区間より東/西の区間に停める)
    const fitI = inner.some((q) => q[1] - q[0] >= LEN), fitO = outer.some((q) => q[1] - q[0] >= LEN);
    ok('留置線に10両が収まる', fitI && fitO, '≥' + LEN.toFixed(0) + 'm',
      (fitI ? '内側OK' : '内側不足') + ' / ' + (fitO ? '外側OK' : '外側不足'));
  }
  // 2-5 架線の高さの順序:トロリ線 < ちょう架線 < ビーム下弦(部材と干渉しない)
  {
    const good = X.WIRE_TRO < X.WIRE_CAT && X.WIRE_CAT < X.BEAM_LOW && X.BEAM_LOW < X.POLE_TOP;
    ok('架線とビームの高さ関係', good, 'トロリ<ちょう架<下弦<上弦',
      [X.WIRE_TRO, X.WIRE_CAT, X.BEAM_LOW, X.POLE_TOP].map((v) => v.toFixed(2)).join(' < '));
  }
  // 2-6 同じ場所に線路(と架線)が二重に敷かれていないこと
  //     副本線や留置線を分岐の終わりより先まで伸ばすと、本線と同じ位置に架線が重なり
  //     「不要な線」として見える。実際にこの検査で12組の重複を検出・除去した。
  {
    const T = X.TRACKS;
    let worst = null, pairs = 0;
    for (let i = 0; i < T.length; i++) {
      for (let j = i + 1; j < T.length; j++) {
        const a = T[i], b = T[j];
        const lo = Math.max(a.x0, b.x0), hi = Math.min(a.x1, b.x1);
        if (hi - lo < 20) continue;
        let run = 0, best = 0;
        for (let s = lo; s <= hi; s += 5) {
          if (Math.abs(a.zf(s) - b.zf(s)) < 0.15) { run += 5; if (run > best) best = run; }
          else run = 0;
        }
        if (best >= 20) { pairs++; if (!worst || best > worst[2]) worst = [a.id, b.id, best]; }
      }
    }
    // ※分岐の見え方を優先し、副本線・留置線は本線と重なる範囲まで敷設する方針に
    //   戻したため、ここは合否ではなく参考値として出す。
    rows.push(['線路の重複(参考)', '-',
      pairs ? pairs + '組 最長' + worst[2] + 'm' : '0組', 'OK']);
  }
  rows.push(['架線柱の本数', '-', X.POLE_S.length + '本', 'OK']);
  rows.push(['敷設した線路', '-', X.TRACKS.length + '本', 'OK']);
} else {
  rows.push(['架線の検査', 'TRACKS/WIRES', '未登録(スキップ)', '--']);
}

/* ---- 3. 高架橋の構造(RCラーメン) -------------------------------------------
   柱・梁・床版・高欄は結合ジオメトリで作るので、登録簿(VIA_COLS・STRUCT)で測る。
   構造上の目安は検証側が持つ(HTMLからは読まない)。 */
{
  const V = {
    COL_IN: 1.0,       // 柱の中心は桁端から1.0m以上内側(側道に出ない)
    COL_GAP: 9.6,      // 1列の柱の間隔の上限[m](横梁の支間)
    SPAN_MAX: 45,      // 柱の列の間隔の上限[m](道路・鉄道を跨ぐ桁の支間)
    PAR_H: 2.1,        // 高欄の上端(レール面から)[m]=従来の防音壁と同じ
    BODY_HW: 1.385 + 0.06, BODY_Y: [0.3, 4.3],
  };
  const C = X.VIA_COLS;
  ok('柱の列がある', C.length > 300, '300列以上', C.length + '列');
  let bIn = null, bGap = null, bSpan = null, bTop = null;
  for (let i = 0; i < C.length; i++) {
    const c = C[i], h = X.deckHalf(c.s);
    if (c.offs.length < 2 && !bIn) bIn = ['s=' + c.s.toFixed(0), c.offs.length + '本'];
    for (const o of c.offs) if (Math.abs(o) > h - V.COL_IN + 1e-6 && !bIn) bIn = ['s=' + c.s.toFixed(0), 'off=' + o.toFixed(2), '桁端' + h.toFixed(2)];
    for (let k = 1; k < c.offs.length; k++) {
      const g = c.offs[k] - c.offs[k - 1];
      if (g > V.COL_GAP && !bGap) bGap = ['s=' + c.s.toFixed(0), g.toFixed(2) + 'm'];
    }
    if (Math.abs(c.top - (X.railY(c.s) - 2.4)) > 0.01 && !bTop) bTop = ['s=' + c.s.toFixed(0), c.top.toFixed(2)];
    if (i > 0) {
      const d = c.s - C[i - 1].s;
      if (d > V.SPAN_MAX && !bSpan) bSpan = [C[i - 1].s.toFixed(0) + '〜' + c.s.toFixed(0), d.toFixed(0) + 'm'];
    }
  }
  ok('柱が桁の下に収まる', bIn === null, '桁端から' + V.COL_IN + 'm以上内側・2本以上', bIn ? bIn.join(' ') : '全て');
  ok('1列の柱の間隔', bGap === null, '≤' + V.COL_GAP + 'm', bGap ? bGap.join(' ') : '全て');
  ok('柱の列の間隔(支間)', bSpan === null, '≤' + V.SPAN_MAX + 'm', bSpan ? bSpan.join(' ') : '全て');
  ok('柱の上端=横梁の下端', bTop === null, 'レール面-2.4m', bTop ? bTop.join(' ') : '全て');
  // 床版と高欄が全線に途切れなく続く(登録簿の区間を合成して隙間を探す)
  const cover = (tag, pred) => {
    const seg = X.STRUCT.filter((q) => q.tag === tag && pred(q)).map((q) => [q.s0, q.s1]).sort((a, b) => a[0] - b[0]);
    let end = X.DOM.x0, gap = null;
    for (const g of seg) { if (g[0] > end + 0.05 && !gap) gap = [end.toFixed(1), g[0].toFixed(1)]; end = Math.max(end, g[1]); }
    if (end < X.DECK_END - 0.05 && !gap) gap = [end.toFixed(1), X.DECK_END.toFixed(1)];
    return gap;
  };
  const gS = cover('床版', () => true), gN = cover('高欄', (q) => q.o0 > 0), gSo = cover('高欄', (q) => q.o1 < 0);
  ok('床版が途切れない', gS === null, X.DOM.x0.toFixed(0) + '〜' + X.DECK_END, gS ? '隙間 ' + gS.join('〜') : '連続');
  ok('高欄が両側で途切れない', gN === null && gSo === null, '北・南とも連続',
    gN ? '北 ' + gN.join('〜') : gSo ? '南 ' + gSo.join('〜') : '連続');
  // 高欄の高さと位置(桁端に立つ)
  let bP = null;
  for (const q of X.STRUCT) {
    if (q.tag !== '高欄') continue;
    const s = (q.s0 + q.s1) / 2, top = q.y1 - Math.max(X.railY(q.s0), X.railY(q.s1));
    const h = Math.max(X.deckHalf(q.s0), X.deckHalf(q.s1)) + 0.06;   // 笠木は外へ6cm張り出す
    if (Math.abs(top - V.PAR_H) > 0.05 && !bP) bP = ['s=' + s.toFixed(0), '高さ' + top.toFixed(2)];
    const outer = Math.max(Math.abs(q.o0), Math.abs(q.o1));
    // 掃引は2m標本・誤差2cmで間引くので、標本の間の曲がり(幅のなめらかな変化)ぶんを5cmまで許す
    if (Math.abs(outer - h) > 0.05 && !bP) bP = ['s=' + s.toFixed(0), '外面' + outer.toFixed(2) + '≠桁端+笠木' + h.toFixed(2)];
  }
  ok('高欄の高さ・位置', bP === null, 'レール面+' + V.PAR_H + 'm・桁端', bP ? bP.join(' ') : '全て');
  // 高架の部品(高欄・ケーブルトラフ・柱・梁)が車両の通る空間に入らない
  let bC = null, n = 0;
  for (const q of X.STRUCT) {
    if (['高欄', 'ケーブルトラフ', '柱', '横梁', '縦梁'].indexOf(q.tag) < 0) continue;
    n++;
    for (const s of [q.s0, (q.s0 + q.s1) / 2, q.s1]) {
      const y = X.railY(s);
      for (const t of X.TRACKS) {
        if (s < t.x0 || s > t.x1) continue;
        const o = t.zf(s);
        if (q.y1 > y + V.BODY_Y[0] && q.y0 < y + V.BODY_Y[1] && q.o1 > o - V.BODY_HW && q.o0 < o + V.BODY_HW && !bC)
          bC = [q.tag, 's=' + s.toFixed(0), t.id];
      }
    }
  }
  ok('高架の部品が車両に当たらない', bC === null, '0件(' + n + '部品)', bC ? bC.join(' ') : '0件(' + n + '部品)');
}

/* ---- 出力 ---- */
const w = (s, n) => String(s) + ' '.repeat(Math.max(0, n -
  [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0)));
console.log('=== 高架橋の桁幅・架線の検証(全線 ' + REQ.STEP + 'm刻み) ===');
console.log('');
console.log(w('項目', 28) + w('要件', 18) + w('実測', 24) + '判定');
for (const r of rows) console.log(w(r[0], 28) + w(r[1], 18) + w(r[2], 24) + r[3]);
console.log('');
console.log('駅の桁半幅: ' + X.STA.filter((s) => s.x <= X.DECK_END)
  .map((s) => s.n + ' ' + X.deckHalf(s.x).toFixed(1)).join(' / '));
console.log('RESULT: ' + (ng ? 'FAIL(' + ng + '項目NG)' : 'PASS'));
process.exit(ng ? 1 : 0);
