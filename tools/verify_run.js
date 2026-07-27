// 自動運転を実際に走らせて、停止位置・停車時間・走行線を検査する。
//
//   「停止位置がずれている」「八幡山で外側の通過線を走ってしまう」といった不具合は
//   見た目では気づきにくく、AIは描画を見られない。そこで運転ロジックをそのまま
//   時間発展させ、どこにどれだけ停まったかを数値で確かめる。
//
//   使い方: node tools/verify_run.js [keio_elevated_3d.html]
const path = process.argv[2] || 'keio_elevated_3d.html';
const X = require('./stub_three')(path,
  'STA:STA,platRange:platRange,stopPosOf:stopPosOf,nextStopFor:nextStopFor,' +
  'driveTrain:driveTrain,DRIVE:DRIVE,DWELL_OF:DWELL_OF,CAR_HALF:CAR_HALF,K8:K8,' +
  'mainOff:mainOff,runOff:runOff,DOM:DOM,STOP_BACK:STOP_BACK,' +
  'PSD:PSD,stepPSD:stepPSD,trains:trains,stepCarDoors:stepCarDoors,setCarDoors:setCarDoors,' +
  'sideWindows:sideWindows,DOOR_HW:DOOR_HW,DOOR_SLIDE:DOOR_SLIDE,frame:frame');

/* ---- 期待値(検証側が独立して持つ) ---------------------------------------- */
const REF = {
  TRAIN_CARS: 10,          // 10両編成
  DWELL_DEFAULT: 25,       // 標準の停車時間[秒]
  DWELL_HACHI: 60,         // 八幡山だけ60秒(指示)
  VMAX_KMH: 60,            // 上限速度
  STOP_BACK: 3,            // ホーム先端から手前に置く距離[m]
  HACHI_STOP_OFF: 4.55,    // 八幡山の停車線(ホーム横=内側)のオフセット[m]
  HACHI_PASS_OFF: 8.35,    // 八幡山の通過線(ホーム無し=外側)のオフセット[m]
  TOL: 1.0,                // 停止位置の許容誤差[m]
};

const rows = [];
let ng = 0;
function ok(name, cond, expect, got) {
  if (!cond) ng++;
  rows.push([name, String(expect), String(got), cond ? 'OK' : 'NG']);
}

const TRAIN_LEN = (REF.TRAIN_CARS - 1) * X.K8.PITCH + X.K8.LEN;   // 編成長[m]=199.5

/* ---- 1. 停止位置:編成がホームに収まるか ---------------------------------- */
for (const dir of [1, -1]) {
  let worst = null;
  for (const st of X.STA) {
    const r = X.platRange(st);
    const center = X.stopPosOf(st, dir) - dir * X.CAR_HALF;   // 先頭車の中心
    // 先頭(運転台)と最後尾の位置
    const head = center + dir * X.K8.LEN / 2;
    const tail = center - dir * (TRAIN_LEN - X.K8.LEN / 2);
    const lo = Math.min(head, tail), hi = Math.max(head, tail);
    const over = Math.max(r[0] - lo, hi - r[1]);               // ホームからのはみ出し[m]
    if (over > 0.5 && (worst === null || over > worst[1])) worst = [st.n, over];
  }
  ok('編成がホーム内に収まる(' + (dir > 0 ? '下り' : '上り') + ')',
    worst === null, 'はみ出しなし', worst ? worst[0] + ' ' + worst[1].toFixed(1) + 'm' : 'はみ出しなし');
}
// 先頭がホーム先端の3m手前に着くか
{
  let bad = null;
  for (const st of X.STA) {
    const r = X.platRange(st);
    const head = X.stopPosOf(st, 1);
    const gap = r[1] - head;                                   // 先端までの残り[m]
    if (Math.abs(gap - REF.STOP_BACK) > 5 && !bad) bad = [st.n, gap.toFixed(1)];
  }
  ok('先頭がホーム先端の手前', bad === null, REF.STOP_BACK + 'm前後', bad ? bad.join(' ') + 'm' : '全駅OK');
}

/* ---- 2. 実際に走らせる(下り1本を全線) ------------------------------------ */
const t = { dir: 1, x: X.DOM.x0 + 40, x0: X.DOM.x0 + 40, v: 0, st: 'run', dwell: 0, target: null, atSt: null };
const log = [];       // {駅名, 停止位置, 停車時間}
let vmax = 0, prevSt = null, dwellStart = 0, tsec = 0;
const dt = 0.05;
for (let i = 0; i < 200000 && log.length < 40; i++) {
  X.driveTrain(t, dt);
  tsec += dt;
  if (t.v * 3.6 > vmax) vmax = t.v * 3.6;
  if (t.st === 'dwell' && prevSt !== 'dwell') { dwellStart = tsec; }
  if (prevSt === 'dwell' && t.st !== 'dwell') {
    log.push({ n: t.atSt ? t.atSt.n : '?', x: t.x, dwell: tsec - dwellStart });
  }
  prevSt = t.st;
}
ok('自動運転が全駅に停車', log.length >= X.STA.length, X.STA.length + '駅以上', log.length + '回停車');
ok('上限速度を超えない', vmax <= REF.VMAX_KMH + 0.5, '≤' + REF.VMAX_KMH + 'km/h', vmax.toFixed(1) + 'km/h');

/* ---- 3. 停止位置の正着(シミュレーション結果 ⇄ 期待値) --------------------- */
{
  let bad = null;
  for (const e of log.slice(0, X.STA.length)) {
    const st = X.STA.find((s) => s.n === e.n);
    if (!st) { bad = bad || [e.n, '駅不明']; continue; }
    const want = X.stopPosOf(st, 1) - X.CAR_HALF;
    if (Math.abs(e.x - want) > REF.TOL && !bad) bad = [e.n, (e.x - want).toFixed(2) + 'm'];
  }
  ok('停止位置の正着', bad === null, '±' + REF.TOL + 'm', bad ? bad.join(' ') : '全駅OK');
}

/* ---- 4. 停車時間(八幡山だけ60秒) ----------------------------------------- */
{
  const h = log.find((e) => e.n === '八幡山');
  const o = log.find((e) => e.n !== '八幡山');
  ok('八幡山の停車時間', h && Math.abs(h.dwell - REF.DWELL_HACHI) < 1.5,
    REF.DWELL_HACHI + '秒', h ? h.dwell.toFixed(1) + '秒' : '停車せず');
  ok('その他の駅の停車時間', o && Math.abs(o.dwell - REF.DWELL_DEFAULT) < 1.5,
    REF.DWELL_DEFAULT + '秒', o ? o.n + ' ' + o.dwell.toFixed(1) + '秒' : '-');
}

/* ---- 5. 八幡山:停車列車はホーム横の停車線(内側)を走るか ------------------- */
{
  const hx = X.STA[6].x;
  const run = X.runOff(hx), main = X.mainOff(hx);
  ok('八幡山で内側の停車線を走る', Math.abs(run - REF.HACHI_STOP_OFF) < 0.15,
    '±' + REF.HACHI_STOP_OFF + 'm', '±' + run.toFixed(2) + 'm');
  ok('通過線(外側)は本線のまま', Math.abs(main - REF.HACHI_PASS_OFF) < 0.15,
    '±' + REF.HACHI_PASS_OFF + 'm', '±' + main.toFixed(2) + 'm');
  // 駅から離れれば本線に戻る(乗り移りが局所的であること)
  const far = Math.abs(X.runOff(hx + 400) - X.mainOff(hx + 400));
  ok('駅を離れると本線へ戻る', far < 0.01, '一致', far.toFixed(3) + 'm差');
}

/* ---- 6. ホームドア ------------------------------------------------------- */
{
  const perCar = 4, cars = REF.TRAIN_CARS;
  // 6-1 開口数=1両4箇所×10両
  {
    const bad = X.PSD.filter((p) => p.open.length !== perCar * cars);
    ok('ホームドアの開口数', bad.length === 0, perCar * cars + '箇所/列',
      bad.length ? bad[0].st.n + ' ' + bad[0].open.length + '箇所' : '全て' + perCar * cars + '箇所');
    ok('ホームドアの列数', X.PSD.length === X.STA.length * 2, X.STA.length * 2 + '列(全駅×上下)',
      X.PSD.length + '列');
  }
  // 6-2 開口がホームの範囲に収まる
  {
    let bad = null;
    for (const p of X.PSD) {
      const r = X.platRange(p.st);
      for (const c of p.open) {
        if ((c < r[0] - 1 || c > r[1] + 1) && !bad) bad = [p.st.n, c.toFixed(1)];
      }
    }
    ok('開口がホーム内にある', bad === null, 'はみ出しなし', bad ? bad.join(' @s=') : 'はみ出しなし');
  }
  // 6-3 停車した列車の扉位置と開口が一致するか(シミュレーションで実際に停めて確かめる)
  {
    let bad = null, checked = 0;
    for (const dir of [1, -1]) {
      for (const st of X.STA) {
        const p = X.PSD.find((q) => q.st === st && q.dir === dir);
        if (!p) continue;
        const center = X.stopPosOf(st, dir) - dir * X.CAR_HALF;   // 先頭車の中心
        for (let j = 0; j < cars; j++) {
          const cs = center - dir * j * X.K8.PITCH;               // placeTrain と同じ式
          for (const dx of X.K8.DOORX) {
            const doorS = cs + dir * dx;
            const hit = p.open.some((c) => Math.abs(c - doorS) < 0.05);
            checked++;
            if (!hit && !bad) bad = [st.n, (dir > 0 ? '下り' : '上り'), doorS.toFixed(2)];
          }
        }
      }
    }
    ok('車両の扉と開口が一致', bad === null, checked + '箇所すべて',
      bad ? bad.join(' ') : checked + '箇所一致');
  }
  // 6-4 停車中は開き、走行中は閉じる
  {
    const p = X.PSD.find((q) => q.dir === 1);
    const tr = X.trains[0];
    const save = { st: tr.st, dwell: tr.dwell, atSt: tr.atSt, dir: tr.dir };
    // 停車させる
    tr.dir = 1; tr.st = 'dwell'; tr.dwell = 20; tr.atSt = p.st;
    for (let i = 0; i < 120; i++) X.stepPSD(0.05);
    const opened = p.r;
    // 発車直前(残り2秒)にする
    tr.dwell = 2;
    for (let i = 0; i < 120; i++) X.stepPSD(0.05);
    const closing = p.r;
    // 走行に戻す
    tr.st = 'run'; tr.atSt = null;
    for (let i = 0; i < 120; i++) X.stepPSD(0.05);
    const closed = p.r;
    Object.assign(tr, save);
    ok('停車中に開く', opened > 0.95, '開度>0.95', opened.toFixed(3));
    ok('発車前に閉じ始める', closing < 0.05, '開度<0.05', closing.toFixed(3));
    ok('走行中は閉じている', closed < 0.01, '開度<0.01', closed.toFixed(3));
  }
}

/* ---- 7. 客用扉(車両側) --------------------------------------------------- */
{
  const tr = X.trains[0];
  const p = X.PSD.find((q) => q.dir === tr.dir);
  const save = { st: tr.st, dwell: tr.dwell, atSt: tr.atSt, dr: tr.dr };
  // 7-1 停車中にホーム側だけ開く
  tr.st = 'dwell'; tr.dwell = 20; tr.atSt = p.st;
  for (let i = 0; i < 150; i++) X.stepCarDoors(tr, 0.05);
  const opened = tr.dr, side = tr.dside;
  tr.st = 'run'; tr.atSt = null;
  for (let i = 0; i < 150; i++) X.stepCarDoors(tr, 0.05);
  const closed = tr.dr;
  Object.assign(tr, save);
  ok('停車中に客用扉が開く', opened > 0.98, '開度>0.98', opened.toFixed(3));
  ok('走行中は客用扉が閉じる', closed < 0.01, '開度<0.01', closed.toFixed(3));
  ok('開くのはホーム側だけ', side === p.side, 'ホーム側(' + p.side + ')', String(side));
  // 7-2 ホーム側の判定を検証側で"独立に"計算して突き合わせる。
  //     モデルが持つ p.side と比べるだけでは、p.side 自体が間違っていても素通りする
  //     (実際に左右が逆のまま素通りしていた)。seatCar と同じ式 R = F × UP から、
  //     車体ローカル+z がワールドの ±off どちらを向くかを検証側で求める。
  {
    let bad = null;
    for (const q of X.PSD) {
      const s = q.st.x;
      const pA = X.frame(s - 1, 0), pB = X.frame(s + 1, 0);
      const pO = X.frame(s, 0), pN = X.frame(s, 1);
      let fx = pB.x - pA.x, fz = pB.z - pA.z;
      if (q.dir < 0) { fx = -fx; fz = -fz; }
      const rx = -fz, rz = fx;                       // R = F × (0,1,0)
      const lz = (rx * (pN.x - pO.x) + rz * (pN.z - pO.z)) > 0 ? 1 : -1;
      const ro = X.runOff(s), trackOff = q.dir > 0 ? -ro : ro;
      const want = (q.off > trackOff ? 1 : -1) * lz;
      if (want !== q.side && !bad) bad = [q.st.n, q.dir > 0 ? '下り' : '上り',
        'モデル' + (q.side > 0 ? '+z' : '-z') + '/正解' + (want > 0 ? '+z' : '-z')];
    }
    ok('開く面がホーム側と一致', bad === null, '20列すべて', bad ? bad.join(' ') : '20列すべて一致');
  }
  // 7-3 全ての駅・方向でホーム側の判定が付いているか
  {
    const bad = X.PSD.filter((q) => q.side !== 1 && q.side !== -1);
    ok('全扉列でホーム側が定まる', bad.length === 0, '20列すべて',
      bad.length ? bad[0].st.n + ' 未定' : '20列すべて');
  }
  // 7-4 各車両に16枚(4箇所×2枚×左右)の扉があるか
  {
    const c = X.trains[0].cars[0];
    const n = c.userData.doors ? c.userData.doors.inst.count : 0;
    ok('1両あたりの扉の枚数', n === 16, '16枚(4箇所×2枚×左右)', n + '枚');
  }
  // 7-5 開いたとき、ホーム側の扉だけが実際に動いているか(配置行列を測る)
  {
    const c = X.trains[0].cars[0];
    X.setCarDoors(c, 0, 1);
    const closed = c.userData.doors.inst.mats.map((m) => m.p.x);
    X.setCarDoors(c, 1, 1);
    const open = c.userData.doors.inst.mats.map((m) => m.p.x);
    const move = open.map((v, i) => Math.abs(v - closed[i]));
    const nearSide = move.slice(0, 8), farSide = move.slice(8);
    const slid = nearSide.every((v) => v > 0.3), still = farSide.every((v) => v < 1e-9);
    ok('ホーム側の扉が動く', slid, '8枚とも移動', nearSide.filter((v) => v > 0.3).length + '/8枚');
    ok('反対側の扉は動かない', still, '8枚とも静止', farSide.filter((v) => v < 1e-9).length + '/8枚');
    X.setCarDoors(c, 0, 1);
  }
  // 7-6 扉が全開したとき、隣の客用窓に被らないか(戸袋の幅が足りているか)
  {
    const win = X.sideWindows(false, false);
    let over = 0, minGap = 9;
    for (const dx of X.K8.DOORX) {
      for (const sg of [-1, 1]) {
        const c = dx + sg * (X.DOOR_HW + X.DOOR_SLIDE);
        const a = c - X.DOOR_HW, b = c + X.DOOR_HW;
        for (const q of win) {
          const ov = Math.min(b, q[1]) - Math.max(a, q[0]);
          if (ov > 0) over++;
          const gap = a > q[1] ? a - q[1] : b < q[0] ? q[0] - b : -ov;
          if (gap < minGap) minGap = gap;
        }
      }
    }
    ok('全開の扉が窓に被らない', over === 0, '重なり0枚',
      over ? over + '枚 重なる' : 'すき間' + minGap.toFixed(3) + 'm');
    ok('扉が全開できる', Math.abs(X.DOOR_SLIDE - X.K8.DOORW / 2) < 1e-9,
      '片開き1枚ぶん', X.DOOR_SLIDE.toFixed(3) + 'm');
  }
}

/* ---- 出力 ---- */
const w = (s, n) => String(s) + ' '.repeat(Math.max(0, n -
  [...String(s)].reduce((a, c) => a + (c.charCodeAt(0) > 0x2e80 ? 2 : 1), 0)));
console.log('=== 自動運転:停止位置・停車時間・走行線の検証 ===');
console.log('(運転ロジックを実時間で走らせ、停車の実績を測定)');
console.log('');
console.log(w('項目', 30) + w('期待', 16) + w('実測', 22) + '判定');
for (const r of rows) console.log(w(r[0], 30) + w(r[1], 16) + w(r[2], 22) + r[3]);
console.log('');
console.log('停車実績: ' + log.slice(0, X.STA.length)
  .map((e) => e.n + '(' + e.dwell.toFixed(0) + 's)').join(' → '));
console.log('RESULT: ' + (ng ? 'FAIL(' + ng + '項目NG)' : 'PASS'));
process.exit(ng ? 1 : 0);
