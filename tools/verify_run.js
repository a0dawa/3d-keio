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
  'sideWindows:sideWindows,DOOR_HW:DOOR_HW,DOOR_SLIDE:DOOR_SLIDE,frame:frame,PLATS:PLATS,' +
  'TRACKS:TRACKS,' +
  'atcLimit:atcLimit,stepRide:stepRide,ATC:ATC,NOTCHES:NOTCHES,NIDX_B7:NIDX_B7,' +
  'setRideState:setRideState,getRideState:getRideState,setNotch:setNotch,NIDX_N:NIDX_N,' +
  'NOTCH_LAG:NOTCH_LAG,ATC_DISP_STEP:ATC_DISP_STEP,ATC_UP_LAG:ATC_UP_LAG,' +
  'ridePSDFor:ridePSDFor,mainOff:mainOff,' +
  'DOOR_LAMP_SEC:DOOR_LAMP_SEC,DOOR_STOP_TOL:DOOR_STOP_TOL,stopPosOf:stopPosOf');

/* ---- 期待値(検証側が独立して持つ) ---------------------------------------- */
const REF = {
  TRAIN_CARS: 10,          // 10両編成
  DWELL_DEFAULT: 25,       // 標準の停車時間[秒]
  DWELL_LONG: 60,          // 待避線に入る駅の停車時間[秒](指示)
  DWELL_LONG_STA: ['八幡山', '明大前', '桜上水', '千歳烏山'],
  VMAX_KMH: 60,            // 上限速度
  STOP_BACK: 3,            // ホーム先端から手前に置く距離[m]
  HACHI_STOP_OFF: 4.55,    // 八幡山の停車線(ホーム横=内側)のオフセット[m]
  HACHI_PASS_OFF: 8.35,    // 八幡山の通過線(ホーム無し=外側)のオフセット[m]
  QUAD_STA: ['明大前', '桜上水', '千歳烏山'],
  QUAD_LOOP_OFF: 10.1,     // 2面4線の待避線(外側)のオフセット[m]
  QUAD_MAIN_OFF: 2.0,      // 同駅の本線(内側)のオフセット[m]
  // ホームドアを2列(上下)ではなく4列持つ駅=島式2面4線。
  // 停車列車の来ない側(笹塚の留置線側/待避線に入らない側)は開かない扉列。
  PSD4_STA: ['笹塚', '明大前', '桜上水', '千歳烏山'],
  TACTILE_IN: 0.45,        // 点字ブロックの中心をホーム縁から何m内側に置くか
  TACTILE_REACH: 3.0,      // ホーム縁の外側これだけ以内に線路があれば「線路側の縁」
  TOL: 1.0,                // 停止位置の許容誤差[m]
  // 保安装置(指示):600m先=120km/h まで / 20m先=0km/h まで、間はなめらか
  ATC_FAR: 600, ATC_NEAR: 20, ATC_VFAR: 120,
  ATC_BRAKE: 'B7',         // 介入時に使う制動段
  ATC_DISP_STEP: 5,        // ATCの表示は5km/h刻み
  ATC_UP_LAG: 10,          // 現示アップ(制限が緩む)は10秒遅れ。ダウンは即時
  NOTCH_LAG: 1.0,          // 力行・制動の応答遅れ[秒]
  DOOR_LAMP_SEC: 25,       // 戸閉灯の点灯時間[秒]
  DOOR_STOP_TOL: 1.0,      // 停車と見なす停止位置からのずれ[m]
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

/* ---- 4. 停車時間(待避線に入る4駅は60秒・他は25秒) ------------------------- */
{
  let bad = null, seen = 0;
  for (const n of REF.DWELL_LONG_STA) {
    const e = log.find((q) => q.n === n);
    if (!e) { bad = bad || [n, '停車せず']; continue; }
    seen++;
    if (Math.abs(e.dwell - REF.DWELL_LONG) > 1.5 && !bad) bad = [n, e.dwell.toFixed(1) + '秒'];
  }
  ok('待避線に入る駅の停車時間', bad === null && seen === REF.DWELL_LONG_STA.length,
    REF.DWELL_LONG + '秒×' + REF.DWELL_LONG_STA.length + '駅',
    bad ? bad.join(' ') : seen + '駅とも' + REF.DWELL_LONG + '秒');
  const o = log.find((e) => REF.DWELL_LONG_STA.indexOf(e.n) < 0);
  ok('その他の駅の停車時間', o && Math.abs(o.dwell - REF.DWELL_DEFAULT) < 1.5,
    REF.DWELL_DEFAULT + '秒', o ? o.n + ' ' + o.dwell.toFixed(1) + '秒' : '-');
}

/* ---- 4b. 2面4線の駅:自動運転は待避線(外側)へ入るか ----------------------- */
{
  let bad = null;
  for (const n of REF.QUAD_STA) {
    const st = X.STA.find((s) => s.n === n);
    const run = X.runOff(st.x), main = X.mainOff(st.x);
    if (Math.abs(run - REF.QUAD_LOOP_OFF) > 0.15 && !bad) bad = [n + ' 走行線±' + run.toFixed(2)];
    if (Math.abs(main - REF.QUAD_MAIN_OFF) > 0.15 && !bad) bad = [n + ' 本線±' + main.toFixed(2)];
    // 駅を離れれば本線に戻る(振り分けが局所的であること)
    for (const d of [-450, 450]) {
      const f = Math.abs(X.runOff(st.x + d) - X.mainOff(st.x + d));
      if (f > 0.01 && !bad) bad = [n + ' 復帰せず' + f.toFixed(2) + 'm'];
    }
  }
  ok('2面4線で待避線に入る', bad === null,
    '±' + REF.QUAD_LOOP_OFF + 'm', bad ? bad.join(' ') : REF.QUAD_STA.length + '駅とも±' + REF.QUAD_LOOP_OFF + 'm');
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
    const openable = X.PSD.filter((p) => p.openable);
    ok('開くホームドアの列数', openable.length === X.STA.length * 2,
      X.STA.length * 2 + '列(全駅×上下)', openable.length + '列');
    // 停車列車が来ない線(笹塚の内側=留置線側/2面4線の内側=本線)にもホームドアを置く
    let bad4 = null;
    for (const n of REF.PSD4_STA) {
      const st = X.STA.find((s) => s.n === n);
      const all = X.PSD.filter((p) => p.st === st);
      const fixed = all.filter((p) => !p.openable);
      if ((all.length !== 4 || fixed.length !== 2) && !bad4)
        bad4 = [n, all.length + '列(うち開かない' + fixed.length + '列)'];
    }
    ok('待避線側にもホームドア', bad4 === null,
      REF.PSD4_STA.length + '駅×4列(開2/固定2)', bad4 ? bad4.join(' ') : REF.PSD4_STA.join('/') + ' 各4列');
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
    for (const p of X.PSD) {              // 開かない扉列も、開口は停止位置に合わせる
      const st = p.st, dir = p.dir;
      const center = X.stopPosOf(st, dir) - dir * X.CAR_HALF;     // 先頭車の中心
      for (let j = 0; j < cars; j++) {
        const cs = center - dir * j * X.K8.PITCH;                 // placeTrain と同じ式
        for (const dx of X.K8.DOORX) {
          const doorS = cs + dir * dx;
          const hit = p.open.some((c) => Math.abs(c - doorS) < 0.05);
          checked++;
          if (!hit && !bad) bad = [st.n, (dir > 0 ? '下り' : '上り'), doorS.toFixed(2)];
        }
      }
    }
    ok('車両の扉と開口が一致', bad === null, checked + '箇所すべて',
      bad ? bad.join(' ') : checked + '箇所一致');
  }
  // 6-4 停車中は開き、走行中は閉じる
  {
    const p = X.PSD.find((q) => q.dir === 1 && q.openable);
    // 同じ駅・同じ方向で「開かない」扉列(待避線に入らない側)
    const fx = X.PSD.find((q) => q.st === p.st && q.dir === 1 && !q.openable);
    const tr = X.trains[0];
    const save = { st: tr.st, dwell: tr.dwell, atSt: tr.atSt, dir: tr.dir };
    // 停車させる
    tr.dir = 1; tr.st = 'dwell'; tr.dwell = 20; tr.atSt = p.st;
    for (let i = 0; i < 120; i++) X.stepPSD(0.05);
    const opened = p.r, fixed = fx ? fx.r : 0;
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
    ok('列車の来ない列は開かない', fx && fixed < 0.01, '開度<0.01',
      fx ? fixed.toFixed(3) : '固定の扉列が無い');
    ok('発車前に閉じ始める', closing < 0.05, '開度<0.05', closing.toFixed(3));
    ok('走行中は閉じている', closed < 0.01, '開度<0.01', closed.toFixed(3));
  }
}

/* ---- 6b. ホームの付帯物:点字ブロックとホーム端の柵 ------------------------ */
{
  ok('ホームの登録数', X.PLATS.length >= X.STA.length, X.STA.length + '面以上',
    X.PLATS.length + '面');
  let bt = null, bf = null, bl = null;
  /* その縁の"外側"に線路があるか。検証側が TRACKS を独立に走査して決める
     (相対式ホームの外側や単式ホームの背面には線路が無いので敷かない)。 */
  const facesTrack = (s, edge, sg) => X.TRACKS.some((t) => {
    if (s < t.x0 - 1 || s > t.x1 + 1) return false;
    const d = sg * (t.zf(s) - edge);
    return d >= -0.01 && d <= REF.TACTILE_REACH;
  });
  let nTac = 0;
  for (const q of X.PLATS) {
    const mid = (q.x0 + q.x1) / 2;
    // 点字ブロックは「線路のある縁」から45cm内側にだけ敷く
    for (const sg of [-1, 1]) {
      const edge = q.off + sg * q.hw;
      const want = q.off + sg * (q.hw - REF.TACTILE_IN);
      const has = q.tactile.some((o) => Math.abs(o - want) < 1e-6);
      const need = facesTrack(mid, edge, sg);
      if (need) nTac++;
      if (has !== need && !bt)
        bt = ['off=' + q.off.toFixed(2), (sg > 0 ? '外' : '内') + '縁',
        need ? '線路側なのに無い' : '線路が無いのに敷いてある'];
    }
    // ホーム端の柵は短辺2箇所、ホームの内側にあること
    if (q.fence.length !== 2 && !bf) bf = ['off=' + q.off.toFixed(2), q.fence.length + '箇所'];
    for (const e of q.fence) {
      if ((e < q.x0 || e > q.x1) && !bf) bf = ['off=' + q.off.toFixed(2), 's=' + e.toFixed(1)];
    }
    // 点字ブロックがホームの長さに収まっていること
    if (q.x1 - q.x0 < 200 && !bl) bl = [(q.x1 - q.x0).toFixed(0) + 'm'];
  }
  ok('点字ブロックは線路側の縁だけ', bt === null,
    '線路のある縁から' + REF.TACTILE_IN + 'm内側',
    bt ? bt.join(' ') : nTac + '本すべて一致');
  ok('ホーム端に柵がある', bf === null, '各面2箇所', bf ? bf.join(' ') : X.PLATS.length + '面すべて');
  ok('ホーム長', bl === null, '210m級', bl ? bl.join('') : '全面210m');
}

/* ---- 7. 客用扉(車両側) --------------------------------------------------- */
{
  const tr = X.trains[0];
  const p = X.PSD.find((q) => q.dir === tr.dir && q.openable);
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
    ok('開く面がホーム側と一致', bad === null, X.PSD.length + '列すべて',
      bad ? bad.join(' ') : X.PSD.length + '列すべて一致');
  }
  // 7-3 全ての駅・方向でホーム側の判定が付いているか
  {
    const bad = X.PSD.filter((q) => q.side !== 1 && q.side !== -1);
    ok('全扉列でホーム側が定まる', bad.length === 0, X.PSD.length + '列すべて',
      bad.length ? bad[0].st.n + ' 未定' : X.PSD.length + '列すべて');
  }
  // 7-4 各車両に16枚(4箇所×2枚×左右)の扉があるか
  {
    const c = X.trains[0].cars[0];
    const d = c.userData.doors;
    const n = d ? d.p.count + d.m.count : 0;
    ok('1両あたりの扉の枚数', n === 16, '16枚(4箇所×2枚×左右)', n + '枚');
  }
  // 7-5 開いたとき、ホーム側の扉だけが実際に動いているか(配置行列を測る)
  {
    const c = X.trains[0].cars[0];
    X.setCarDoors(c, 0, 1);
    const dm = (q) => q.p.mats.concat(q.m.mats).map((m) => m.p.x);
    const closed = dm(c.userData.doors);
    X.setCarDoors(c, 1, 1);
    const open = dm(c.userData.doors);
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

/* ---- 8. 運転モードの保安装置(前方の列車で自動的に減速する) ---------------- */
{
  const T = X.trains;
  const save = T.map((t) => ({ x: t.x, dir: t.dir, st: t.st, atSt: t.atSt }));
  // 全編成をいったん遠くへ退ける(意図した1本だけを前方に置く)
  for (const t of T) { t.dir = 1; t.x = X.DOM.x1 - 5; t.st = 'run'; t.atSt = null; }
  const lead = T[0];
  const rearOf = (t) => t.x - (t.cars.length - 1) * X.K8.PITCH - X.K8.LEN / 2;
  // 先行列車の最後尾が s から d[m] 先に来るように置く
  const place = (s, d) => { lead.x = s + d + (lead.x - rearOf(lead)); };

  // 待避線への振り分け区間から外れた本線上の地点(明大前と桜上水の間)。
  // 振り分け区間に先行列車が入ると「別の線路」とみなされ、試験にならない。
  const s0 = 2000;
  // 8-1 距離ごとの許容速度(600m=120 / 20m=0 / 間は√で滑らか)
  {
    let bad = null;
    const want = (d) => (d <= REF.ATC_NEAR) ? 0
      : REF.ATC_VFAR * Math.sqrt((d - REF.ATC_NEAR) / (REF.ATC_FAR - REF.ATC_NEAR));
    for (const d of [20, 50, 100, 200, 310, 450, 600]) {
      place(s0, d);
      const got = X.atcLimit(s0);
      if (got === null || Math.abs(got - want(d)) > 0.5) {
        if (!bad) bad = [d + 'm', '期待' + want(d).toFixed(1), '実測' + (got === null ? '制限なし' : got.toFixed(1))];
      }
    }
    ok('許容速度の距離特性', bad === null,
      REF.ATC_FAR + 'm=' + REF.ATC_VFAR + ' / ' + REF.ATC_NEAR + 'm=0',
      bad ? bad.join(' ') : '7点すべて一致');
    // 単調増加(近いほど遅い)であること
    let mono = true, prev = -1;
    for (let d = 20; d <= 600; d += 10) { place(s0, d); const v = X.atcLimit(s0); if (v < prev - 1e-9) mono = false; prev = v; }
    ok('距離が近いほど遅い', mono, '単調', mono ? '単調' : '逆転あり');
  }
  // 8-2 解除条件:600mより先 / 待避線に入った / エリア外
  {
    place(s0, 601);
    ok('600mより先は制限しない', X.atcLimit(s0) === null, '制限なし',
      X.atcLimit(s0) === null ? '制限なし' : X.atcLimit(s0).toFixed(1) + 'km/h');
    // 待避線(2面4線の外側)に入っている列車は対象外
    const q = X.STA.find((z) => z.n === '桜上水');
    place(q.x - 100, 100); lead.x = q.x;            // 先行列車を待避線の一定区間へ
    ok('待避線の列車は対象外', X.atcLimit(q.x - 300) === null, '制限なし',
      X.atcLimit(q.x - 300) === null ? '制限なし' : '制限あり');
    // エリア外
    lead.x = X.DOM.x1 + 500;
    ok('エリア外の列車は対象外', X.atcLimit(s0) === null, '制限なし',
      X.atcLimit(s0) === null ? '制限なし' : '制限あり');
  }
  // 8-3 実際に走らせる:力行のままでも自動的にB7で減速し、追突しない
  {
    place(s0, REF.ATC_FAR);                          // 600m先=パターンの起点に置く
    const leadRear = rearOf(lead);
    X.setRideState({ s: s0, v: REF.ATC_VFAR, notch: X.NOTCHES.length - 1, acc: 0 });  // P4 全開のまま
    let braked = false, minGap = 1e9, over = 0, vEnd = 0, gapEnd = 0;
    for (let i = 0; i < 20000; i++) {
      X.stepRide(0.05);
      const st = X.getRideState();
      if (st.atc) braked = true;
      const gap = leadRear - st.s;
      if (gap < minGap) minGap = gap;
      if (st.lim !== null && st.v - st.lim > over) over = st.v - st.lim;
      vEnd = st.v; gapEnd = gap;
      if (gap <= REF.ATC_NEAR + 5 || st.v < 0.05) break;
    }
    ok('力行中でも自動でB7が入る', braked, '介入する', braked ? '介入した' : '介入しない');
    ok('先行列車に追突しない', minGap > REF.ATC_NEAR - 5, '最後尾の手前',
      '最接近 ' + minGap.toFixed(1) + 'm');
    ok('接近時は徐行になる', vEnd < 20, '<20km/h',
      gapEnd.toFixed(0) + 'm手前で ' + vEnd.toFixed(1) + 'km/h');
    ok('パターンに追従する', over < 12, '超過<12km/h', '最大超過 ' + over.toFixed(1) + 'km/h');
  }
  /* 8-3b すでにパターンを大きく超えた状態(前方に列車が突然現れた等)。
     120km/h から B7(4.2km/h/s)で止まるには約475m必要なので、300m地点からでは
     物理的に止まりきれない。ここで見るのは「力行に戻らず、B7を掛け続けて
     減速し続ける」こと。指示どおり制動は B7 までとし、非常制動は使わない。 */
  {
    place(s0, 300);                                  // 300m先(パターンは83km/h)に
    const leadRear = rearOf(lead);
    X.setRideState({ s: s0, v: 120, notch: X.NOTCHES.length - 1, acc: 0 });  // P4 全開のまま
    let steps = 0, held = 0, rose = 0, v0 = 120;
    for (let i = 0; i < 6000; i++) {
      X.stepRide(0.05);
      const st = X.getRideState();
      steps++; if (st.atc) held++;
      if (st.v > v0 + 1e-6) rose++;
      v0 = st.v;
      if (st.v < 0.05 || leadRear - st.s <= 0) break;   // 停止 or 追いついた時点で終了
    }
    ok('超過状態でも制動を掛け続ける', held === steps && rose === 0,
      '全区間で介入・増速なし',
      held + '/' + steps + 'ステップ介入・増速' + rose + '回');
  }
  // 8-4 介入に使う段が B7 であること
  {
    const nb = X.NOTCHES[X.NIDX_B7];
    ok('介入に使う制動段', nb && nb.s === REF.ATC_BRAKE, REF.ATC_BRAKE, nb ? nb.s : '不明');
  }
  for (let i = 0; i < T.length; i++) Object.assign(T[i], save[i]);
}

/* ---- 9. 運転モードの表示と戸閉灯 ------------------------------------------ */
{
  ok('マスコンの応答遅れ', Math.abs(X.NOTCH_LAG - REF.NOTCH_LAG) < 1e-9,
    REF.NOTCH_LAG + '秒', X.NOTCH_LAG + '秒');
  ok('ATC表示の刻み', X.ATC_DISP_STEP === REF.ATC_DISP_STEP,
    REF.ATC_DISP_STEP + 'km/h刻み', X.ATC_DISP_STEP + 'km/h刻み');

  const T = X.trains;
  const save = T.map((t) => ({ x: t.x, dir: t.dir, st: t.st, atSt: t.atSt }));
  for (const t of T) { t.dir = 1; t.x = X.DOM.x1 - 5; t.st = 'run'; t.atSt = null; }
  const lead = T[0];
  const rearOf = (t) => t.x - (t.cars.length - 1) * X.K8.PITCH - X.K8.LEN / 2;

  /* 9-1 現示ダウンは即時・現示アップは10秒遅れ。
     遅らせるのは表示だけでなく実際の速度制限も同じ(実機の現示アップと同じ扱い)。
     ※「null なら未取得」で判定すると、null が続く間ずっと上書きしてしまうので、
       取得済みかどうかは別のフラグで持つ。 */
  {
    const s0 = 2000;
    X.setRideState({ on: true, s: s0, v: 0, notch: X.NIDX_N, acc: 0, reset: true });
    for (let i = 0; i < 40; i++) X.stepRide(0.05);           // 2秒:前方に列車なし
    const before = X.getRideState();
    ok('前方が空なら制限なし', before.lim === null, '—',
      before.lim === null ? '—' : before.lim.toFixed(0));

    // (a) 現示ダウン:300m先に列車を出した直後から効く
    lead.x = s0 + 300 + (lead.x - rearOf(lead));
    X.stepRide(0.05);
    const down = X.getRideState();
    ok('現示ダウンは即時', down.lim !== null && Math.abs(down.lim - down.raw) < 1e-9,
      '即座に制限', down.lim === null ? '制限なし' : down.lim.toFixed(1) + 'km/h');
    const held0 = down.lim;

    // (b) 現示アップ:列車を遠ざけても10秒間は前の(厳しい)制限のまま
    const held = held0;
    lead.x = s0 + 560 + (lead.x - rearOf(lead));             // 560m先=緩い現示へ
    let up5 = null, up12 = null, g5 = false, g12 = false, t = 0;
    for (let i = 0; i < 300; i++) {
      X.stepRide(0.05); t += 0.05;
      if (!g5 && t >= 5) { up5 = X.getRideState(); g5 = true; }
      if (!g12 && t >= 12) { up12 = X.getRideState(); g12 = true; }
    }
    const kmh = (v) => (v === null || v === undefined) ? '—' : v.toFixed(1);
    ok('現示アップは10秒遅れる',
      up5.lim !== null && Math.abs(up5.lim - held) < 1e-9 && up12.lim !== null && up12.lim > held + 1,
      REF.ATC_UP_LAG + '秒後に上がる',
      '5秒後=' + kmh(up5.lim) + ' / 12秒後=' + kmh(up12.lim) + 'km/h');
    ok('現示アップ前も瞬時値は上がっている', up5.raw !== null && up5.raw > held + 1, '瞬時値は上昇',
      kmh(up5.raw) + 'km/h');

    // (c) 解除(制限なしへ)も10秒待つ
    lead.x = X.DOM.x1 - 5;
    let rel5 = null, rel12 = null, h5 = false, h12 = false; t = 0;
    for (let i = 0; i < 300; i++) {
      X.stepRide(0.05); t += 0.05;
      if (!h5 && t >= 5) { rel5 = X.getRideState(); h5 = true; }
      if (!h12 && t >= 12) { rel12 = X.getRideState(); h12 = true; }
    }
    const km = (v) => (v === null || v === undefined) ? '—' : v.toFixed(1);
    ok('解除も10秒遅れる', rel5.lim !== null && rel12.lim === null,
      REF.ATC_UP_LAG + '秒後に解除', '5秒後=' + km(rel5.lim) + ' / 12秒後=' + km(rel12.lim));
  }
  for (const t of T) { t.x = X.DOM.x1 - 5; }

  // 9-2 戸閉灯:停止位置の前後1m以内で停止したら25秒点灯し、ホームドアが開く
  {
    const st = X.STA.find((z) => z.n === '代田橋');
    const sp = X.stopPosOf(st, 1);
    X.setRideState({ on: true, s: sp, v: 0, notch: X.NIDX_N, acc: 0, reset: true });
    X.stepRide(0.05);
    const a = X.getRideState();
    // 自列車は本線(八幡山では通過線)を走る。開くのは本線側の扉列であること
    {
      const want = X.ridePSDFor(st), trackOff = -X.mainOff(st.x);
      ok('開くのは自列車側の扉列', a.psd === want && want &&
        Math.abs(want.off - trackOff) < 2.5, '本線側(off≈' + trackOff.toFixed(2) + ')',
        a.psd ? 'off=' + a.psd.off.toFixed(2) : 'なし');
    }
    ok('停車で戸閉灯が点く', a.lamp > 0 && a.lampSt === st, REF.DOOR_LAMP_SEC + '秒点灯',
      a.lamp > 0 ? a.lamp.toFixed(1) + '秒 @' + (a.lampSt ? a.lampSt.n : '?') : '点かない');
    // 点灯中は力行に入れられない
    X.setNotch(X.NOTCHES.length - 1);
    ok('点灯中は力行できない', X.getRideState().notch <= X.NIDX_N, 'N以下',
      X.NOTCHES[X.getRideState().notch].s);
    // ホームドアが開く(下り側)
    const psd = X.ridePSDFor(st);
    for (let i = 0; i < 120; i++) X.stepPSD(0.05);
    ok('自列車でホームドアが開く', psd.r > 0.95, '開度>0.95', psd.r.toFixed(3));
    // 25秒で消灯し、ホームドアも閉じる
    for (let i = 0; i < Math.ceil(REF.DOOR_LAMP_SEC / 0.05) + 40; i++) X.stepRide(0.05);
    for (let i = 0; i < 120; i++) X.stepPSD(0.05);
    const b = X.getRideState();
    ok('25秒で消灯する', b.lamp === 0, '消灯', b.lamp.toFixed(1) + '秒');
    ok('消灯でホームドアも閉じる', psd.r < 0.05, '開度<0.05', psd.r.toFixed(3));
    X.setNotch(X.NIDX_N);
    ok('消灯後は力行できる', (X.setNotch(X.NOTCHES.length - 1),
      X.getRideState().notch === X.NOTCHES.length - 1), 'P4',
      X.NOTCHES[X.getRideState().notch].s);
  }
  /* 9-2b 2面4線の駅:自列車は本線(内側)にいるので、待避線側ではなく
     本線側の扉列が開くこと(以前は待避線の方が開いていた)。 */
  {
    let bad = null;
    for (const n of REF.QUAD_STA.concat(['笹塚'])) {
      const st = X.STA.find((z) => z.n === n);
      const q = X.ridePSDFor(st), trackOff = -X.mainOff(st.x);
      if (!q || Math.abs(q.off - trackOff) > 2.5) { bad = bad || [n, '見つからない']; continue; }
      // 待避線側(より外側)の列を掴んでいないこと
      const outer = X.PSD.filter((z) => z.st === st && z.off < 0)
        .sort((a2, b2) => a2.off - b2.off)[0];
      if (q === outer && Math.abs(outer.off - trackOff) > 2.5 && !bad) bad = [n, '待避線側'];
    }
    ok('2面4線で本線側が開く', bad === null, '本線側の扉列',
      bad ? bad.join(' ') : REF.QUAD_STA.concat(['笹塚']).join('/') + ' すべて本線側');
    // 八幡山は通過線にホームが無いので開かない
    const h = X.STA.find((z) => z.n === '八幡山');
    ok('ホームの無い通過線では開かない', X.ridePSDFor(h) === null, '扉列なし',
      X.ridePSDFor(h) === null ? '扉列なし' : 'off=' + X.ridePSDFor(h).off.toFixed(2));
  }
  // 9-3 停止位置から1mより離れていれば点かない
  {
    const st = X.STA.find((z) => z.n === '上北沢');
    X.setRideState({ on: true, s: X.stopPosOf(st, 1) + REF.DOOR_STOP_TOL + 0.5,
      v: 0, notch: X.NIDX_N, acc: 0, reset: true });
    X.stepRide(0.05);
    ok('停止位置から外れれば点かない', X.getRideState().lamp === 0, '消灯',
      X.getRideState().lamp.toFixed(1) + '秒');
    // 停止位置に居ても速度が完全に0でなければ点かない
    X.setRideState({ on: true, s: X.stopPosOf(st, 1), v: 0.3, notch: X.NIDX_N, acc: 0, reset: true });
    X.stepRide(0.05);
    ok('0km/hでなければ点かない', X.getRideState().lamp === 0, '消灯',
      X.getRideState().v.toFixed(2) + 'km/hで ' + X.getRideState().lamp.toFixed(1) + '秒');
  }
  X.setRideState({ on: false, reset: true });
  for (let i = 0; i < T.length; i++) Object.assign(T[i], save[i]);
  for (const p of X.PSD) X.stepPSD(1);
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
