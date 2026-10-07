// 撮影モード(13章 CINE)を検査する。
//
//   動画は「駅のフォーカス → 次の駅までの前面展望・俯瞰 → 次の駅のフォーカス」の
//   繰り返しを、時刻(朝/昼/夕/夜)と季節(春夏秋冬)を替えながら撮る。
//   出来上がった映像は人が見るしかないが、壊れ方のほとんどは数値で捕まえられる:
//     ・時刻を替えても太陽の向きが変わらない(setSunDir が基底を作り直していない)
//     ・時刻を替えたら影がちらつく(新しい向きで格子吸着が崩れた)
//     ・空を描き直していない(キャンバスだけ更新して環境マップが古いまま)
//     ・季節の着色が一部の樹木にしか届かない(登録簿とインスタンスの順がずれた)
//     ・前面展望が反対側の線路に乗る(+zの向きの取り違え)
//     ・俯瞰が後ろを向く/地面に潜る
//     ・撮影中も実時間のループが走り、コマごとに時間が二重に進む
//
//   ※ 期待値(眼高・俯瞰高さ・太陽高度の許容範囲・季節の色の性質)は検証側が独立に
//     持つ。HTML の TIME/SEASON 表を読み込んで突き合わせると、表を間違えたときに
//     検証も一緒に間違うので読まない。
//
//   使い方: node tools/verify_cine.js [keio_elevated_3d.html]
const path = process.argv[2] || 'keio_elevated_3d.html';
const X = require('./stub_three')(path,
  'CINE:CINE, cineOn:()=>cineOn, stepWorld:stepWorld,' +
  'SUN_N:()=>SUN_N, SUN_RT:()=>SUN_RT, SUN_UP:()=>SUN_UP, SUN_F:()=>SUN_F,' +
  'sun:sun, hemi:hemi, scene:scene, camera:camera, cam:cam, renderer:renderer,' +
  'MAT:MAT, CITY:CITY, STA:STA, frame:frame, railY:railY, mainOff:mainOff,' +
  'SKY:()=>SKY, SKY_TEX:SKY_TEX, skyDome:skyDome, env:()=>scene.environment,' +
  'sunFollow:sunFollow, SH_MAP:SH_MAP, DOM:DOM, srgb:srgb, zRunDown:zRunDown,' +
  'NIGHT:NIGHT, NIGHT_STAT:NIGHT_STAT, PLATS:PLATS');

/* ---- 期待値(検証側が独立して持つ) ---------------------------------------- */
const REF = {
  EYE_MIN: 2.5, EYE_MAX: 4.5,       // 前面展望の眼高(レール面から)[m]
  OFF_MIN: 1.8, OFF_MAX: 12.0,      // 走行線の線路中心(線形中心からの距離)[m]
                                    // 複線の標準は中心から2.0m。待避・通過線で広がる
  STA_D_MIN: 120, STA_D_MAX: 400,   // 駅フォーカスの距離[m]
  STA_EL_MIN: 20, STA_EL_MAX: 60,   // 駅フォーカスの見下ろし角[°]
  AIR_H_MIN: 60, AIR_H_MAX: 140,    // 俯瞰の高さ(レール面から)[m]
  AIR_SIDE_MIN: 80, AIR_SIDE_MAX: 240,
  SUN_EL_MIN: 8, SUN_EL_MAX: 75,    // 太陽高度[°](低すぎると影が破綻、高すぎると影が消える)
  SUN_SEP: 15,                      // 時刻どうしの太陽方向の差[°]
  FOG_NEAR_MIN: 800, FOG_FAR_MAX: 20000,
  N_TIME: 4, N_SEASON: 4,
  CLIP: 252,                        // 画面上の値がこれ以上なら白飛び
};

const rows = [];
let ng = 0;
function ok(name, cond, expect, got) {
  if (!cond) ng++;
  rows.push([name, String(expect), String(got), cond ? 'OK' : 'NG']);
}
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const len = (v) => Math.hypot(v.x, v.y, v.z);
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const unit = (v) => { const l = len(v) || 1; return { x: v.x / l, y: v.y / l, z: v.z / l }; };
const ang = (a, b) => Math.acos(Math.max(-1, Math.min(1, dot(unit(a), unit(b))))) * 180 / Math.PI;

/* 検証側が独自に持つ ACESトーンマッピング(r128のシェーダと同じ式)。
   「著作した空の色が画面上で白飛びしていないか」を、HTMLの逆算を使わずに測る。 */
const s2l = (v) => (v <= 0.04045) ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
const l2s = (v) => (v <= 0.0031308) ? v * 12.92 : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
const AIN = [[0.59719, 0.07600, 0.02840], [0.35458, 0.90834, 0.13383], [0.04823, 0.01566, 0.83777]];
const AOUT = [[1.60475, -0.10208, -0.00327], [-0.53108, 1.10813, -0.07276], [-0.07367, -0.00605, 1.07602]];
const mmul = (M, c) => [0, 1, 2].map((i) => M[0][i] * c[0] + M[1][i] * c[1] + M[2][i] * c[2]);
const rrt = (v) => (v * (v + 0.0245786) - 0.000090537) / (v * (0.983729 * v + 0.432951) + 0.238081);
function shown(hex, expo) {                    // 著作値(sRGB 16進) → 画面上の0〜255
  const lin = [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255].map(s2l);
  const e = expo / 0.6;
  const x = mmul(AIN, lin.map((v) => v * e)).map(rrt);
  return mmul(AOUT, x).map((v) => Math.round(l2s(Math.min(1, Math.max(0, v))) * 255));
}
const lum = (c) => 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b;   // リニア輝度

const C = X.CINE;

/* ---- 1. 撮影モードの装置が揃っているか ------------------------------------ */
{
  for (const k of ['begin', 'setTime', 'setSeason', 'step', 'render',
                   'shotStation', 'shotFront', 'shotAerial', 'setSize', 'label', 'stats', 'caption'])
    ok('API ' + k, typeof C[k] === 'function', '関数', typeof C[k]);
  ok('時刻の数', C.times.length >= REF.N_TIME, '≥' + REF.N_TIME + '種', C.times.length + '種');
  ok('季節の数', C.seasons.length >= REF.N_SEASON, '≥' + REF.N_SEASON + '種', C.seasons.length + '種');
  // 駅の一覧(撮影の骨格)。実在する駅を全部渡していること
  const nSta = X.STA.filter((s) => s.t !== 'ctx' && s.t !== 'gnd').length;
  ok('駅の一覧', C.stations.length >= nSta, '≥' + nSta + '駅', C.stations.length + '駅');
  ok('駅に営業距離', C.stations.every((s) => typeof s.x === 'number' && isFinite(s.x)),
    '全駅に数値のs', C.stations.filter((s) => typeof s.x === 'number').length + '駅');
}

/* ---- 2. 撮影中は実時間のループを止めること --------------------------------
   止めないと「コマを描く前に dt を進める」のと「ループが勝手に進める」のが
   二重になり、何度流しても同じ動画にならない(再現しない)。 */
{
  const src = X.__html;
  ok('ループを止める', /if\(cineOn\)\{[^}]*return;\}/.test(src), 'cineOnでreturn',
    /if\(cineOn\)\{[^}]*return;\}/.test(src) ? 'あり' : 'なし');
  ok('世界の更新が独立', typeof X.stepWorld === 'function', 'stepWorld()あり', typeof X.stepWorld);
  ok('撮影前はOFF', X.cineOn() === false, 'false', String(X.cineOn()));
  C.begin();
  ok('beginでON', X.cineOn() === true, 'true', String(X.cineOn()));
  // 1コマ進めても例外が出ないこと(列車・ホームドア・交差鉄道まで一式動く)
  let err = null;
  try { for (let i = 0; i < 30; i++) C.step(1 / 12); } catch (e) { err = e.message; }
  ok('コマ送り', err === null, '例外なし', err === null ? '30コマOK' : err);
}

/* ---- 3. 時刻 ---------------------------------------------------------------
   太陽の向き・光の色と強さ・空・フォグがまとめて切り替わること。
   影の基底(SUN_RT/UP/F)を作り直し忘れると、向きだけ変わって影が合わなくなる。 */
const TPROP = {};
{
  const dirs = {};
  let envPrev = X.env(), envChanged = 0, domeOK = true;
  for (const k of C.times) {
    C.setTime(k);
    const n = X.SUN_N(), rt = X.SUN_RT(), up = X.SUN_UP(), f = X.SUN_F();
    dirs[k] = { x: n.x, y: n.y, z: n.z };
    const el = Math.asin(n.y / (len(n) || 1)) * 180 / Math.PI;
    TPROP[k] = {
      el: el, si: X.sun.intensity, hi: X.hemi.intensity,
      fog: lum(X.scene.fog.color), near: X.scene.fog.near, far: X.scene.fog.far,
      sky: Object.assign({}, X.SKY()), expo: X.renderer.toneMappingExposure,
      sunL: lum(X.sun.color), hemiL: lum(X.hemi.color),
    };
    ok('太陽高度(' + k + ')', el > REF.SUN_EL_MIN && el < REF.SUN_EL_MAX,
      REF.SUN_EL_MIN + '〜' + REF.SUN_EL_MAX + '°', el.toFixed(1) + '°');
    // 基底が「新しい向き」に対して正規直交であること
    const e1 = Math.abs(len(rt) - 1), e2 = Math.abs(len(up) - 1), e3 = Math.abs(len(f) - 1);
    const o1 = Math.abs(dot(rt, up)), o2 = Math.abs(dot(rt, f)), o3 = Math.abs(dot(up, f));
    ok('影の基底(' + k + ')', Math.max(e1, e2, e3, o1, o2, o3) < 1e-9, '正規直交',
      '誤差 ' + Math.max(e1, e2, e3, o1, o2, o3).toExponential(1));
    // 向きを変えたのに基底を作り直していないと、格子が光源座標系から外れて
    // 影の縁がちらつく。RT/UP が新しい光の向きと直交していることで捕まえる。
    const pn = Math.max(Math.abs(dot(rt, n)), Math.abs(dot(up, n)));
    ok('基底が光の向き(' + k + ')', Math.abs(dot(f, n) + 1) < 1e-9 && pn < 1e-9, 'F=-N かつ RT・UP⊥N',
      'F・N=' + dot(f, n).toFixed(9) + ' / ⊥誤差 ' + pn.toExponential(1));
    // 新しい向きでも影の中心が格子に載ること(時刻を変えた途端にちらつく不具合)
    let offGrid = null;
    for (let s = X.DOM.x0 + 200; s < X.DOM.x1 && offGrid === null; s += 1300)
      for (const d of [60, 400, 1500]) {
        X.sunFollow(s, 0, d);
        const t = X.sun.target.position, texel = 2 * Math.min(Math.max(d * 0.55, 180), 600) / X.SH_MAP;
        for (const [nm, b] of [['RT', rt], ['UP', up]]) {
          const g = dot(t, b) / texel;
          if (Math.abs(g - Math.round(g)) > 1e-6) { offGrid = nm + ' ' + g.toFixed(4); break; }
        }
        if (offGrid !== null) break;
      }
    ok('影の格子吸着(' + k + ')', offGrid === null, '整数テクセル',
      offGrid === null ? '全点格子上' : offGrid);
    // 空が描き直されたか(キャンバスのテクスチャは据え置き・環境マップは作り直し)
    if (X.env() !== envPrev) envChanged++;
    envPrev = X.env();
    if (X.skyDome.material.map !== X.SKY_TEX) domeOK = false;
    ok('空の更新(' + k + ')', X.SKY_TEX.needsUpdate === true, 'needsUpdate', String(X.SKY_TEX.needsUpdate));
    X.SKY_TEX.needsUpdate = false;
    // フォグは地平と同じ色・近≪遠
    const fg = X.scene.fog.color, hor = X.srgb(X.SKY().HOR);
    ok('フォグ=地平(' + k + ')', Math.abs(fg.r - hor.r) + Math.abs(fg.g - hor.g) + Math.abs(fg.b - hor.b) < 1e-9,
      'SKY.HORと一致', (Math.abs(fg.r - hor.r) + Math.abs(fg.g - hor.g) + Math.abs(fg.b - hor.b)).toExponential(1));
    ok('フォグの範囲(' + k + ')',
      X.scene.fog.near >= REF.FOG_NEAR_MIN && X.scene.fog.near < X.scene.fog.far
      && X.scene.fog.far <= REF.FOG_FAR_MAX,
      REF.FOG_NEAR_MIN + '≤近<遠≤' + REF.FOG_FAR_MAX, X.scene.fog.near + '〜' + X.scene.fog.far);
    // 空が白飛びしないこと(著作値をそのまま書くと起こる、最初に潰した不具合)
    const S = X.SKY();
    let worst = 0, worstK = '';
    for (const [nm, h] of [['天頂', S.TOP], ['地平', S.HOR], ['地平下', S.BOT], ['輝き', S.SUN]]) {
      const v = Math.max.apply(null, shown(h, X.renderer.toneMappingExposure));
      if (v > worst) { worst = v; worstK = nm; }
    }
    ok('空が白飛びしない(' + k + ')', worst < REF.CLIP, '<' + REF.CLIP, worstK + ' ' + worst);
  }
  ok('空を毎回作り直す', envChanged === C.times.length, C.times.length + '回',
    envChanged + '回');
  ok('空ドームの貼り替え漏れなし', domeOK, 'mapはSKY_TEXのまま', domeOK ? '一致' : '不一致');
  ok('環境マップがPMREM', X.env().mapping === 306, 'CubeUV(306)', X.env().mapping);
  // 時刻どうしが十分に違うこと(表を書いたつもりで値が同じ、を防ぐ)
  let minSep = 1e9, pair = '';
  const ks = C.times;
  for (let i = 0; i < ks.length; i++) for (let j = i + 1; j < ks.length; j++) {
    const a = ang(dirs[ks[i]], dirs[ks[j]]);
    if (a < minSep) { minSep = a; pair = ks[i] + '/' + ks[j]; }
  }
  ok('時刻で太陽が動く', minSep > REF.SUN_SEP, '>' + REF.SUN_SEP + '°',
    pair + ' ' + minSep.toFixed(1) + '°');
}

/* ---- 3b. 夜の灯り ----------------------------------------------------------
   夜は太陽を弱めるだけだと何も見えない。窓・街灯・ホームの灯りが自発光で
   足されていること、**昼には完全に消えている**ことを見る。
   消し忘れると昼の建物に窓の格子が浮いて、絵が一気に安っぽくなる。 */
{
  const N = X.NIGHT, S = X.NIGHT_STAT;
  ok('夜の灯りの装置', !!(N && N.group && typeof N.set === 'function'), 'NIGHT あり',
    N ? 'あり' : 'なし');
  // 窓明かりは全建物に行き渡っていること(高層/低層で分けているので合計で見る)
  ok('窓明かりの数', S.win === X.CITY.buildings.length,
    X.CITY.buildings.length + '棟', S.win + '棟');
  ok('街灯の数', S.lamp > 200, '>200基', S.lamp + '基');
  ok('ホーム照明の数', S.plat > 20 * X.PLATS.length / 2, 'ホーム1面あたり十数基',
    S.plat + '基 / ' + X.PLATS.length + '面');
  // 昼夜で表示と emissive が切り替わること
  C.setTime(C.times.find((k) => k !== 'night') || 'noon');
  const dayVis = N.group.visible, dayEmi = lum(X.MAT.plat.emissive);
  C.setTime('night');
  const ngtVis = N.group.visible, ngtEmi = lum(X.MAT.plat.emissive);
  ok('夜に灯りが点く', ngtVis === true && ngtEmi > 0, '表示ON・emissive>0',
    ngtVis + ' / ' + ngtEmi.toFixed(4));
  ok('昼に灯りが消える', dayVis === false && dayEmi === 0, '表示OFF・emissive=0',
    dayVis + ' / ' + dayEmi.toFixed(4));
  /* 夜は地表と緑も暗くなること。灯りを足しても、地面が昼のままの鮮やかな緑だと
     夜に見えない。**時刻と季節はどちらを先に指定しても同じ結果**になること
     (片方でしか塗り直さないと、後から変えたほうで上書きされて明るいままになる) */
  {
    let bright = null, order = null;
    for (const se of C.seasons) {
      C.setTime('noon'); C.setSeason(se);
      const day = lum(X.MAT.ground.color);
      C.setTime('night');                       // 時刻をあとから変える
      const n1 = lum(X.MAT.ground.color);
      C.setSeason(se);                          // 季節をあとから変える
      const n2 = lum(X.MAT.ground.color);
      if (!(n1 < day * 0.6)) bright = bright || se + ' 夜 ' + n1.toFixed(3) + ' / 昼 ' + day.toFixed(3);
      if (Math.abs(n1 - n2) > 1e-9) order = order || se + ' ' + n1.toFixed(3) + ' ≠ ' + n2.toFixed(3);
    }
    ok('夜は地表が暗い', bright === null, '昼の6割未満', bright === null ? '全季節OK' : bright);
    ok('時刻と季節の指定順に依らない', order === null, '同じ色',
      order === null ? '全季節で一致' : order);
    // 樹木も暗くなること
    C.setTime('noon'); C.setSeason('summer');
    const dayT = X.CITY.crown.cols.slice();
    C.setTime('night'); C.setSeason('summer');
    const ngtT = X.CITY.crown.cols;
    let dark = 0;
    for (let i = 0; i < dayT.length; i++) if ((ngtT[i] & 255) < (dayT[i] & 255)) dark++;
    ok('夜は樹木が暗い', dark === dayT.length, dayT.length + '本すべて', dark + '本');
  }
  /* 灯りの強さ(利用者指示:2.5倍)。発光色は1を超えるリニア値になっているはず。
     灯具(街灯・ホーム照明)の色と、窓明かりの最も明るい建物で見る */
  {
    const GAIN = 2.5;                    // 検証側が独立に持つ倍率
    // 灯具=不透明の発光体(暈けや窓明かりは加算合成なので transparent:true)
    const heads = N.group.children.filter((m) => m.material && m.material.color
      && typeof m.material.color.r === 'number' && m.material.transparent !== true);
    const minHead = heads.length ? Math.min.apply(null, heads.map((m) => lum(m.material.color))) : 0;
    ok('灯具が2.5倍の明るさ', heads.length >= 2 && minHead > 0.75 * GAIN,
      '輝度>' + (0.75 * GAIN).toFixed(2) + '(リニア)', heads.length + '種 最小 ' + minHead.toFixed(2));
  }
  /* 地上の街灯が建物・樹木に埋まっていないこと。夜の灯りは街並みの登録簿に
     載らないので、街を増やすと灯具が家の中に入りうる(建物を倍増したときの罠) */
  {
    const LAMP_CLEAR = 1.0;   // 灯具の周りに確保する離れ[m](検証側の値)
    const items = X.CITY.buildings.concat(X.CITY.trees);
    let inside = 0, n = 0, first = null;
    for (const m of N.group.children) {
      if (!m.mats || !m.material || m.material.transparent === true) continue;
      for (const t of m.mats) {
        if (!t || Math.abs(t.p.y - 5.2) > 0.01) continue;      // 地上の街灯だけ
        n++;
        for (const it of items) {
          if (Math.hypot(t.p.x - it.x, t.p.z - it.z) < it.r + LAMP_CLEAR) {
            inside++; if (!first) first = '(' + t.p.x.toFixed(0) + ',' + t.p.z.toFixed(0) + ')'; break;
          }
        }
      }
    }
    ok('街灯が建物・樹木に埋まらない', n > 0 && inside === 0, '離れ1m未満が0基',
      inside === 0 ? n + '基すべて外' : inside + '基 例' + first);
  }
  // 灯りは影を落とさない(落とすと光るものが黒い塊になる)
  let bad = null, n = 0;
  for (const m of N.group.children) {
    n++;
    if (m.castShadow === true) bad = bad || '影を落とす設定になっている';
    if (m.material && m.material.fog === true && m.material.blending === undefined)
      bad = bad || '灯りにフォグが掛かっている';
  }
  ok('灯りが影を落とさない', bad === null && n > 0, n + '件すべてOK',
    bad === null ? n + '件' : bad);
}

/* ---- 4. 夜は昼より暗いこと ------------------------------------------------
   「夜の表を書いたのに昼と同じ明るさ」は見た目にしか出ないが、
   光の強さと空の輝度の大小関係なら数値で確かめられる。 */
{
  const day = TPROP[C.times.find((k) => TPROP[k].el === Math.max.apply(null, C.times.map((t) => TPROP[t].el)))];
  // 最も暗い時刻を夜とみなす(名前に依存しない)
  let night = null, nk = '';
  for (const k of C.times) if (night === null || TPROP[k].fog < night.fog) { night = TPROP[k]; nk = k; }
  ok('夜の直射光が弱い', night.si < day.si * 0.5, '昼の半分未満',
    nk + ' ' + night.si.toFixed(2) + ' / 昼 ' + day.si.toFixed(2));
  ok('夜の環境光が弱い', night.hi < day.hi * 0.6, '昼の6割未満',
    night.hi.toFixed(2) + ' / ' + day.hi.toFixed(2));
  ok('夜の空が暗い', night.fog < day.fog * 0.25, '昼の1/4未満',
    night.fog.toFixed(3) + ' / ' + day.fog.toFixed(3));
  ok('夜も真っ暗ではない', night.fog > 0.002, '>0.002', night.fog.toFixed(4));
}

/* ---- 5. 季節 --------------------------------------------------------------
   樹木のインスタンスは登録簿 CITY.trees と同じ順。全数に色が行き渡ること、
   桜が別扱いになっていること、季節ごとに色の性質が違うことを見る。 */
{
  const crown = X.CITY.crown;
  ok('樹冠の実体', crown && crown.cols !== undefined, 'InstancedMesh', crown ? 'あり' : 'なし');
  const nTree = X.CITY.trees.length;
  ok('樹木の登録簿', nTree > 300, '>300本', nTree + '本');
  const nSakura = X.CITY.trees.filter((t) => t.kind === '桜').length;
  ok('桜の区別', nSakura > 0, '>0本', nSakura + '本');
  const grounds = {}, sakuraCol = {}, warm = {};
  for (const k of C.seasons) {
    crown.cols = [];
    C.setSeason(k);
    const filled = crown.cols.filter((c) => c !== null && c !== undefined).length;
    ok('全樹木を着色(' + k + ')', filled === nTree, nTree + '本', filled + '本');
    grounds[k] = X.MAT.ground.color.getHex();
    // 桜と一般樹で色が違うこと
    const si = X.CITY.trees.findIndex((t) => t.kind === '桜');
    const gen = new Set(crown.cols.filter((h, i) => X.CITY.trees[i].kind !== '桜'));
    sakuraCol[k] = crown.cols[si];
    // 桜の色が一般樹の色のどれとも一致しないこと(一致すると並木が見えなくなる)
    ok('桜が別の色(' + k + ')', !gen.has(crown.cols[si]), '一般樹のどの色とも異なる',
      '#' + crown.cols[si].toString(16) + ' / 一般樹'
      + [...gen].map((h) => '#' + h.toString(16)).join(' '));
    // 赤成分 > 緑成分 の割合(紅葉なら高く、夏なら低い)
    let w = 0;
    for (const h of crown.cols) if (((h >> 16) & 255) > ((h >> 8) & 255)) w++;
    warm[k] = w / nTree;
    // 一般樹に複数の色味を混ぜていること(全部同じ色だと板のように見える)
    const uniq = new Set(crown.cols.filter((h, i) => X.CITY.trees[i].kind !== '桜'));
    ok('樹木に色の幅(' + k + ')', uniq.size >= 2, '≥2色', uniq.size + '色');
  }
  const gUniq = new Set(Object.values(grounds));
  ok('季節で地表が変わる', gUniq.size === C.seasons.length, C.seasons.length + '色',
    gUniq.size + '色');
  const greenest = C.seasons.reduce((a, b) => (warm[a] < warm[b] ? a : b));
  const reddest = C.seasons.reduce((a, b) => (warm[a] > warm[b] ? a : b));
  ok('緑の季節と紅の季節', warm[reddest] > 0.5 && warm[greenest] < 0.2,
    '紅>0.5 / 緑<0.2',
    reddest + ' ' + warm[reddest].toFixed(2) + ' / ' + greenest + ' ' + warm[greenest].toFixed(2));
}

/* ---- 6. 駅のフォーカス ---------------------------------------------------- */
{
  let bad = null, moved = 0, sameR = true;
  for (const st of C.stations) {
    const p = X.frame(st.x, 0), y = X.railY(st.x);
    let prev = null, r0 = null;
    for (const u of [0, 0.25, 0.5, 0.75, 1]) {
      C.shotStation(st, u);
      const c = X.camera.position, L = X.camera.look;
      const d = Math.hypot(c.x - p.x, c.z - p.z), r = Math.hypot(c.x - p.x, c.y - y, c.z - p.z);
      const el = Math.atan2(c.y - y, d) * 180 / Math.PI;
      if (!(r > REF.STA_D_MIN && r < REF.STA_D_MAX)) bad = bad || st.n + ' 距離 ' + r.toFixed(0) + 'm';
      if (!(el > REF.STA_EL_MIN && el < REF.STA_EL_MAX)) bad = bad || st.n + ' 俯角 ' + el.toFixed(0) + '°';
      // 駅を見ていること
      const dl = Math.hypot(L.x - p.x, L.z - p.z);
      if (dl > 25) bad = bad || st.n + ' 注視点が駅から ' + dl.toFixed(0) + 'm';
      // 影の追従が注視点を見るので、cam.tx/tz がカメラ位置と一致していること
      if (Math.abs(X.cam.tx - c.x) > 1e-6 || Math.abs(X.cam.tz - c.z) > 1e-6)
        bad = bad || st.n + ' cam.tx未更新';
      if (prev && Math.hypot(c.x - prev.x, c.z - prev.z) > 1) moved++;
      if (r0 === null) r0 = r; else if (Math.abs(r - r0) > 1) sameR = false;
      prev = { x: c.x, z: c.z };
    }
  }
  ok('駅フォーカスの画角', bad === null, '距離/俯角/注視点が範囲内', bad === null ? '全駅OK' : bad);
  ok('駅フォーカスが回り込む', moved >= C.stations.length * 4, '各駅4区間で移動', moved + '区間');
  ok('回り込みで距離一定', sameR, '半径が一定', sameR ? '一定' : '変動');
}

/* ---- 7. 前面展望 ----------------------------------------------------------
   走行線(下り)の線路の上に眼を置き、進行方向を向くこと。
   「+zは南」と決め打つと左右が逆になるので、線形中心からの距離と符号を見る。 */
{
  let bad = null, signs = new Set(), nTan = 0, N = 0;
  const x0 = X.DOM.x0 + 60, x1 = X.DOM.x1 - 60;
  for (let s = x0; s < x1; s += 140) {
    C.shotFront(s);
    const c = X.camera.position, L = X.camera.look;
    const mid = X.frame(s, 0), y = X.railY(s);
    N++;
    // 眼高
    const eye = c.y - y;
    if (!(eye > REF.EYE_MIN && eye < REF.EYE_MAX)) bad = bad || 's=' + s.toFixed(0) + ' 眼高 ' + eye.toFixed(2) + 'm';
    // 線形中心からの距離(走行線の上に乗っているか)
    const lat = Math.hypot(c.x - mid.x, c.z - mid.z);
    if (!(lat > REF.OFF_MIN && lat < REF.OFF_MAX)) bad = bad || 's=' + s.toFixed(0) + ' 横 ' + lat.toFixed(2) + 'm';
    // 左右どちら側か(線形の接線に対する外積の符号)。全区間で同じでなければ反転している
    const a = X.frame(s - 10, 0), b = X.frame(s + 10, 0);
    const tx = b.x - a.x, tz = b.z - a.z;
    const cr = tx * (c.z - mid.z) - tz * (c.x - mid.x);
    signs.add(Math.sign(cr));
    // 自動運転の下り列車が走る線と同じ側か(反対側に置くと「対向列車の運転台」になる)
    const dn = X.frame(s, X.zRunDown(s));
    const crD = tx * (dn.z - mid.z) - tz * (dn.x - mid.x);
    if (Math.sign(cr) !== Math.sign(crD)) bad = bad || 's=' + s.toFixed(0) + ' 下り線と逆側';
    // 進行方向を向いているか(注視点への向きが接線とそろう)
    const d = unit(sub(L, c)), t = unit({ x: tx, y: 0, z: tz });
    if (dot(d, t) > 0.95) nTan++;
  }
  ok('前面展望の眼高と線路', bad === null, '眼高' + REF.EYE_MIN + '〜' + REF.EYE_MAX
    + 'm / 横' + REF.OFF_MIN + '〜' + REF.OFF_MAX + 'm', bad === null ? N + '点すべてOK' : bad);
  ok('前面展望が片側に固定', signs.size === 1, '全区間で同じ側', signs.size + '通り');
  ok('前面展望が前を向く', nTan === N, N + '点すべて接線方向', nTan + '点');
}

/* ---- 8. 俯瞰展望 ---------------------------------------------------------- */
{
  let bad = null, N = 0, ahead = 0;
  for (let s = X.DOM.x0 + 200; s < X.DOM.x1 - 200; s += 320) {
    for (const u of [0, 0.5, 1]) {
      C.shotAerial(s, u);
      const c = X.camera.position, L = X.camera.look;
      const mid = X.frame(s, 0), y = X.railY(s);
      N++;
      const h = c.y - y;
      if (!(h > REF.AIR_H_MIN && h < REF.AIR_H_MAX)) bad = bad || 's=' + s.toFixed(0) + ' 高さ ' + h.toFixed(0) + 'm';
      const lat = Math.hypot(c.x - mid.x, c.z - mid.z);
      if (!(lat > REF.AIR_SIDE_MIN && lat < REF.AIR_SIDE_MAX))
        bad = bad || 's=' + s.toFixed(0) + ' 離れ ' + lat.toFixed(0) + 'm';
      // 注視点はカメラより進行方向の前にあること(後ろを向いていない)
      const a = X.frame(s - 40, 0), b = X.frame(s + 40, 0);
      const t = unit({ x: b.x - a.x, y: 0, z: b.z - a.z });
      if (dot(unit(sub(L, c)), t) > 0.3) ahead++;
      // 見下ろしていること
      if (L.y >= c.y) bad = bad || 's=' + s.toFixed(0) + ' 見下ろしていない';
    }
  }
  ok('俯瞰の高さと離れ', bad === null, '高さ' + REF.AIR_H_MIN + '〜' + REF.AIR_H_MAX + 'm',
    bad === null ? N + '点すべてOK' : bad);
  ok('俯瞰が前を向く', ahead === N, N + '点すべて前方', ahead + '点');
}

/* ---- 9. 1枚描くところまで通るか ------------------------------------------ */
{
  const before = X.renderer.frames;
  let err = null;
  try { C.setSize(320, 180); C.render(); } catch (e) { err = e.message; }
  ok('描画が通る', err === null && X.renderer.frames === before + 1, '1枚描く',
    err === null ? (X.renderer.frames - before) + '枚' : err);
  ok('解像度の指定', X.camera.aspect > 1.7 && X.camera.aspect < 1.8, '16:9',
    X.camera.aspect.toFixed(3));
  ok('時刻と季節の表示名', typeof C.label() === 'string' && C.label().length > 0,
    '非空の文字列', '"' + C.label() + '"');
  const st = C.stats();
  ok('描画量の取得', typeof st.calls === 'number' && typeof st.tri === 'number',
    'calls/tri', st.calls + ' / ' + st.tri);
}

/* ---- 表示 ---------------------------------------------------------------- */
const W = [0, 1, 2].map((i) => Math.max.apply(null,
  rows.map((r) => [...r[i]].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2000 ? 2 : 1), 0))));
const pad = (s, w) => s + ' '.repeat(Math.max(0,
  w - [...s].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2000 ? 2 : 1), 0)));
console.log(pad('項目', W[0]) + '  ' + pad('期待', W[1]) + '  ' + pad('実測', W[2]) + '  判定');
for (const r of rows) console.log(pad(r[0], W[0]) + '  ' + pad(r[1], W[1]) + '  ' + pad(r[2], W[2]) + '  ' + r[3]);
console.log('');
console.log('時刻 ' + C.times.join('/') + ' / 季節 ' + C.seasons.join('/') + ' / 駅 ' + C.stations.length);
console.log(ng === 0 ? 'RESULT: PASS' : 'RESULT: FAIL (' + ng + '件)');
process.exit(ng === 0 ? 0 : 1);
