// 照明と影の装置を検査する。
//
//   影は「見た目」の話なので目視でしか確かめられないと思われがちだが、
//   壊れ方の多くは数値で捕まえられる:
//     ・視点を動かすと影が回る(光の向きを一緒に動かしてしまう)
//     ・影が視界の一部にしか出ない(写す範囲が注視点から外れる)
//     ・影の縁がちらつく(テクセルの格子に載せていない)
//     ・影が切れる/出ない(影カメラの near/far が対象を挟んでいない)
//   ここではそれらを、実際に sunFollow() を呼んで測る。
//
//   ※ 期待値(向き・テクセルの上限・確保すべき高さ)は検証側が独立に持つ。
//
//   使い方: node tools/verify_light.js [keio_elevated_3d.html]
const path = process.argv[2] || 'keio_elevated_3d.html';
const X = require('./stub_three')(path,
  'sun:sun,sunFollow:sunFollow,shadowRadius:shadowRadius,' +
  'SUN_V:SUN_V,SUN_N:SUN_N,SUN_F:SUN_F,SUN_RT:SUN_RT,SUN_UP:SUN_UP,' +
  'SH_MAP:SH_MAP,SH_MIN:SH_MIN,SH_MAX:SH_MAX,SUN_DIST:SUN_DIST,' +
  'groundMesh:groundMesh,SHADOW_STAT:SHADOW_STAT,DOM:DOM');

/* ---- 期待値(検証側が独立して持つ) ---------------------------------------- */
const REF = {
  SUN: { x: 2400, y: 3200, z: 1600 },  // 太陽の方向(4章の光源設定と同じ意図)
  TEXEL_NEAR: 0.25,   // 寄ったときの影テクセルの上限[m](車両の細部が潰れない)
  TEXEL_FAR: 0.60,    // 引いたときの上限[m]
  OBJ_TOP: 40,        // 影を落としうる最も高い物[m](建物26m+高架12m を包む)
  MIN_ELEV: 25,       // 太陽高度の下限[°](低すぎると影が伸びて破綻する)
  MAX_ELEV: 70,
};

const rows = [];
let ng = 0;
function ok(name, cond, expect, got) {
  if (!cond) ng++;
  rows.push([name, String(expect), String(got), cond ? 'OK' : 'NG']);
}
const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z });
const len = (v) => Math.hypot(v.x, v.y, v.z);

/* ---- 1. 影が有効になっているか(ソースを読む) ------------------------------ */
{
  const src = X.__html;
  for (const [label, pat] of [
    ['影を描く', /renderer\.shadowMap\.enabled\s*=\s*true/],
    ['影の種類', /renderer\.shadowMap\.type\s*=\s*THREE\.PCFSoftShadowMap/],
    ['太陽が影を落とす', /sun\.castShadow\s*=\s*true/],
    ['影を毎フレーム追従', /sunFollow\(cam\.tx,cam\.tz/],
  ]) ok(label, pat.test(src), 'あり', pat.test(src) ? 'あり' : 'なし');
  // スマホでは影を切る(1パス増えるため)
  ok('スマホでは影を切る', /renderer\.shadowMap\.enabled=false;sun\.castShadow=false/.test(src),
    'あり', /renderer\.shadowMap\.enabled=false;sun\.castShadow=false/.test(src) ? 'あり' : 'なし');
}

/* ---- 2. 太陽の高度(影の長さが破綻しない範囲か) ---------------------------- */
{
  const n = REF.SUN, l = len(n);
  const elev = Math.asin(n.y / l) * 180 / Math.PI;
  ok('太陽高度', elev > REF.MIN_ELEV && elev < REF.MAX_ELEV,
    REF.MIN_ELEV + '〜' + REF.MAX_ELEV + '°', elev.toFixed(1) + '°');
  // モデルの向きが検証側の意図と一致するか
  const m = X.SUN_N, d = Math.hypot(m.x - n.x / l, m.y - n.y / l, m.z - n.z / l);
  ok('太陽の方向', d < 1e-6, '(' + [n.x, n.y, n.z].join(',') + ')の向き', d.toFixed(6) + ' 差');
}

/* ---- 3. 視点を動かしても太陽の向きが変わらないこと -------------------------
   ここを間違えると、視点を動かすたびに影が回るという最も目立つ不具合になる。 */
{
  const F = [];
  for (let s = X.DOM.x0 + 100; s < X.DOM.x1; s += 900)
    for (const off of [-400, 0, 400]) for (const d of [50, 300, 1200, 4000]) F.push([s, off, d]);
  let bad = null, worstSnap = 0, outside = null, offGrid = null;
  for (const [fx, fz, dist] of F) {
    X.sunFollow(fx, fz, dist);
    const t = X.sun.target.position, l = X.sun.position;
    // (a) 向きが常に同じ
    const v = sub(l, t), n = len(v);
    const dev = Math.hypot(v.x / n - X.SUN_N.x, v.y / n - X.SUN_N.y, v.z / n - X.SUN_N.z);
    if (dev > 1e-9 && !bad) bad = ['向きが変わった', dev.toExponential(1)];
    // (b) 光源までの距離が一定
    if (Math.abs(n - X.SUN_DIST) > 1e-6 && !bad) bad = ['距離が変わった', n.toFixed(3)];
    /* (c) 影の中心が影テクセルの格子"上"に載っていること。
       残差が小さいことだけを見ると「吸着していない(残差0)」も通ってしまうので、
       格子座標が整数であることを直接確かめる。 */
    const R = X.shadowRadius(dist), texel = 2 * R / X.SH_MAP;
    const p = { x: fx, y: 0, z: fz };
    for (const ax of [X.SUN_RT, X.SUN_UP]) {
      const g = dot(t, ax) / texel;
      const frac = Math.abs(g - Math.round(g));
      if (frac > 1e-6 && !offGrid) offGrid = ['s=' + fx.toFixed(0), '格子から' + frac.toFixed(4) + 'テクセル'];
    }
    // 中心は注視点から半テクセル以内(吸着で遠くへ飛んでいないこと)
    const ea = Math.abs(dot(p, X.SUN_RT) - dot(t, X.SUN_RT));
    const eb = Math.abs(dot(p, X.SUN_UP) - dot(t, X.SUN_UP));
    const snap = Math.max(ea, eb) / texel;
    if (snap > worstSnap) worstSnap = snap;
    // (d) 注視点が影の写る範囲の中にある
    if ((ea > R || eb > R) && !outside) outside = [fx.toFixed(0), (ea / R).toFixed(2)];
  }
  ok('視点を動かしても影が回らない', bad === null, F.length + '点すべて同じ向き',
    bad ? bad.join(' ') : F.length + '点すべて同じ向き');
  ok('影の中心が格子上にある', offGrid === null, '整数テクセル',
    offGrid ? offGrid.join(' ') : F.length + '点すべて格子上');
  ok('影の中心が注視点の近く', worstSnap <= 0.5 + 1e-9, 'ずれ≤0.5テクセル',
    'ずれ ' + worstSnap.toFixed(3) + 'テクセル');
  ok('注視点が影の範囲内', outside === null, '範囲内', outside ? outside.join(' ') : '全点範囲内');
}

/* ---- 4. 影の解像度(テクセルの実寸) ---------------------------------------- */
{
  const near = 2 * X.shadowRadius(0) / X.SH_MAP;        // 最も寄ったとき
  const far = 2 * X.shadowRadius(1e9) / X.SH_MAP;       // 最も引いたとき
  ok('影テクセル(近景)', near <= REF.TEXEL_NEAR, '≤' + REF.TEXEL_NEAR + 'm', near.toFixed(3) + 'm');
  ok('影テクセル(遠景)', far <= REF.TEXEL_FAR, '≤' + REF.TEXEL_FAR + 'm', far.toFixed(3) + 'm');
  ok('範囲が視点距離で広がる', X.shadowRadius(4000) > X.shadowRadius(200),
    '引くほど広い', X.shadowRadius(200).toFixed(0) + 'm → ' + X.shadowRadius(4000).toFixed(0) + 'm');
}

/* ---- 5. 影カメラの near/far が対象を挟んでいるか ---------------------------
   挟めていないと、影が途中で切れる/そもそも出ない。
   影カメラは光源から SUN_F 方向を見る平行投影なので、対象の"奥行き"は
   (点 - 光源)・SUN_F で決まる。範囲いっぱいと高さ0〜OBJ_TOP で走査する。 */
{
  X.sunFollow(0, 0, 1e9);                                // 最も広い範囲で確かめる
  const R = X.shadowRadius(1e9), L = X.sun.position, c = X.sun.shadow.camera;
  let lo = 1e9, hi = -1e9;
  for (const a of [-R, 0, R]) for (const b of [-R, 0, R]) for (const h of [0, REF.OBJ_TOP]) {
    const t = X.sun.target.position;
    const q = {
      x: t.x + X.SUN_RT.x * a + X.SUN_UP.x * b, y: h,
      z: t.z + X.SUN_RT.z * a + X.SUN_UP.z * b,
    };
    const d = dot(sub(q, L), X.SUN_F);
    if (d < lo) lo = d; if (d > hi) hi = d;
  }
  ok('影カメラのnear', c.near < lo, '<' + lo.toFixed(0) + 'm', c.near.toFixed(0) + 'm');
  ok('影カメラのfar', c.far > hi, '>' + hi.toFixed(0) + 'm', c.far.toFixed(0) + 'm');
}

/* ---- 6. 落とす/受けるの割当 ------------------------------------------------ */
{
  const g = X.groundMesh;
  ok('地表は影を受ける', g.receiveShadow === true, 'true', String(g.receiveShadow));
  ok('地表は影を落とさない', g.castShadow === false, 'false', String(g.castShadow));
  ok('影を落とす物がある', X.SHADOW_STAT.cast > 0, '>0', X.SHADOW_STAT.cast + '件');
  ok('受ける物は落とす物以上', X.SHADOW_STAT.recv >= X.SHADOW_STAT.cast,
    '受≧落', X.SHADOW_STAT.recv + ' / ' + X.SHADOW_STAT.cast);
}

/* ---- 出力 ---------------------------------------------------------------- */
console.log('=== 照明と影の検証 ===');
console.log('(sunFollow を実際に呼び、光の向き・写す範囲・テクセル吸着を測定)\n');
const pad = (s, n) => s + ' '.repeat(Math.max(1, n - [...s].length + 2));
console.log(pad('項目', 28) + pad('期待', 24) + pad('実測', 28) + '判定');
for (const r of rows) console.log(pad(r[0], 28) + pad(r[1], 24) + pad(r[2], 28) + r[3]);
console.log('\n影マップ ' + X.SH_MAP + 'px / 半径 ' + X.SH_MIN + '〜' + X.SH_MAX + 'm');
console.log(ng ? 'RESULT: FAIL(' + ng + '項目NG)' : 'RESULT: PASS');
process.exit(ng ? 1 : 0);
