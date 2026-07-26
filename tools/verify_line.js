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
  'WIRE_CAT:WIRE_CAT,WIRE_TRO:WIRE_TRO,BEAM_LOW:BEAM_LOW,POLE_TOP:POLE_TOP');

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
  // 2-5 架線の高さの順序:トロリ線 < ちょう架線 < ビーム下弦(部材と干渉しない)
  {
    const good = X.WIRE_TRO < X.WIRE_CAT && X.WIRE_CAT < X.BEAM_LOW && X.BEAM_LOW < X.POLE_TOP;
    ok('架線とビームの高さ関係', good, 'トロリ<ちょう架<下弦<上弦',
      [X.WIRE_TRO, X.WIRE_CAT, X.BEAM_LOW, X.POLE_TOP].map((v) => v.toFixed(2)).join(' < '));
  }
  rows.push(['架線柱の本数', '-', X.POLE_S.length + '本', 'OK']);
  rows.push(['敷設した線路', '-', X.TRACKS.length + '本', 'OK']);
} else {
  rows.push(['架線の検査', 'TRACKS/WIRES', '未登録(スキップ)', '--']);
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
