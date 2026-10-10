// 京王9000系の描画(塗り分け)の照合。⑮
//
//   ⑩(8000系)と同じ条件:正射影・白い一様な光(環境光1.0・トーンマッピングなし)で先頭車と2両目を描き、
//   画素の色で「帯・窓・幕板・前面のアイボリーと黒・中央扉の縁・灯火・表示器」の位置を確かめる。
//   このとき画素の値は材質の色(sRGB)そのものになる。
//     側面 2400×300・60px/m(レール面=下端、先頭車の前端 x=+9.75 が px 75、画像の右が −x)
//     前面 480×630・150px/m(中心列=y0、画像の右が v4 の +y=向かって右、z=4.2−(行+0.5)/150)
//   基準は REF(公表の説明と reference/keio9000/measured_9000.md の推定値)。HTML からは読まない。
//   依存:--playwright <node_modules> --three <three.min.js>(環境変数 K8_PW / K8_THREE でも可)
//   使い方: node tools/verify_k9render.js [--html keio_elevated_3d.html] [--out 出力フォルダ]
const fs = require('fs');
const path = require('path');
const A = process.argv.slice(2);
const opt = (k, d) => { const i = A.indexOf('--' + k); return i < 0 ? d : A[i + 1]; };
const HTML = opt('html', 'keio_elevated_3d.html');
const PW = opt('playwright', process.env.K8_PW || '');
const THREEJS = opt('three', process.env.K8_THREE || '');
const OUT = path.resolve(opt('out', path.join(require('os').tmpdir(), 'k9render')));
if (!PW || !THREEJS) { console.log('SKIP: Playwright / three.min.js の場所が渡されていない(--playwright --three か K8_PW K8_THREE)'); process.exit(0); }

const REF = {
  RED: [1.78, 1.92], BLUE: [1.555, 1.715],     // 腰部の帯(前面写真の実測 reference/keio9000/ftex9.png)
  WIN: [1.975, 2.905],                          // 側窓の下端・上端(推定)
  GAPS: [-4.70, 0, 4.70], WIN_OFF: 0.505,       // 扉間の中心と、2枚の窓の中心の離れ(推定)
  MAKU_Z: 3.20,                                 // 幕板(窓の上)。8000系の赤帯は無い(公表の説明)
  IVORY_X: 8.39,                                // 先頭車の前頭部(乗務員扉まで)はアイボリー(公表の説明)
  FDOOR_HW: 0.305,                              // 中央の非常扉の半幅(公表610mm)
  // 以下は前面写真の実測(ftex9.png。扉の枠の中心 ±0.305 と屋根の頂部 3.62 で目盛りを決めた)
  WIN_IN: 0.35, WIN_BOTTOM: [2.08, 2.16],       // 左右の前面窓の内縁 |y|・下端(実測 2.12)
  DOOR_EDGE: [0.26, 0.35],                      // 扉の戸の縁と枠の外縁(縦の暗い線)
  HL: [0.695, 1.64], TL: [0.91, 1.64],          // 前照灯・尾灯の中心 [|y|, z](青帯の中)
  DEST: [-0.20, 0.20, 3.21, 3.35],              // 行先表示器(扉の上)の範囲 [y0,y1,z0,z1]
  KIND: [-0.88, -0.52, 3.15, 3.33],             // 種別表示器(向かって左の窓の上部)
  NUM: [0.60, 0.90, 3.11, 3.22],                // 車号(向かって右の窓の上部)
  LOGO: [0.72, 0.99, 1.81, 1.92],               // KEIO ロゴ(向かって右の赤帯の上に白)
};

fs.mkdirSync(OUT, { recursive: true });
const page_html = path.join(OUT, 'page.html');
{
  let src = fs.readFileSync(HTML, 'utf8');
  src = src.replace(/<script src="https?:\/\/[^"]*three[^"]*"><\/script>/, '<script src="three.min.js"></script>');
  fs.writeFileSync(page_html, src);
  fs.copyFileSync(THREEJS, path.join(OUT, 'three.min.js'));
  // 沿線の建物データ(別ファイル)。HTML の隣にあれば写す(無いと読み込みのエラーが出る)
  for (const nm of ['plateau_bldg.js', 'plateau_land.js']) {   // 沿線の建物・道路(PLATEAU。あれば)
    const pl = path.join(path.dirname(HTML), nm);
    if (fs.existsSync(pl)) fs.copyFileSync(pl, path.join(OUT, nm));
  }
}
function findChromium() {
  if (opt('chromium')) return opt('chromium');
  for (const base of ['/opt/pw-browsers', process.env.PLAYWRIGHT_BROWSERS_PATH].filter(Boolean)) {
    if (!fs.existsSync(base)) continue;
    for (const d of fs.readdirSync(base)) {
      const p = path.join(base, d, 'chrome-linux', 'chrome');
      if (d.startsWith('chromium') && fs.existsSync(p)) return p;
    }
  }
  return undefined;
}

(async () => {
  const { chromium } = require(path.resolve(PW, 'playwright-core'));
  const b = await chromium.launch({ executablePath: findChromium(),
    args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--disable-dev-shm-usage', '--no-sandbox'] });
  const p = await b.newPage({ viewport: { width: 2400, height: 630 } });
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto('file://' + page_html, { timeout: 180000 });
  await p.waitForFunction('window.K8API!==undefined', { timeout: 180000 });
  const res = await p.evaluate(() => {
    CINE.begin();
    const { makeCar, renderer } = K8API, T = THREE;
    const sc = new T.Scene(); sc.background = new T.Color(1, 1, 1);
    sc.add(new T.AmbientLight(0xffffff, 1.0));
    const lead = makeCar({ cabF: true, panto: false, motor: false, hachi: 1, num: '9781', series: '9000',
      lights: 'head', sign: { kind: '各停', dest: '京王八王子' }, crowd: 0 });
    const second = makeCar({ panto: true, motor: true, hachi: 1, num: '9281', series: '9000',
      sign: { kind: '各停', dest: '京王八王子' }, crowd: 1 });
    for (const c of [lead, second]) { c.parent.remove(c); sc.add(c); }
    second.position.x = -20;
    const save = { tm: renderer.toneMapping, sh: renderer.shadowMap.enabled, pr: renderer.getPixelRatio() };
    renderer.toneMapping = T.NoToneMapping; renderer.shadowMap.enabled = false; renderer.setPixelRatio(1);
    const cv = renderer.domElement;
    const grab = (w, h) => { const c2 = document.createElement('canvas'); c2.width = w; c2.height = h;
      const x = c2.getContext('2d'); x.drawImage(cv, 0, 0); return { url: c2.toDataURL('image/png'), d: Array.from(x.getImageData(0, 0, w, h).data) }; };
    renderer.setSize(2400, 300, false);
    let cam = new T.OrthographicCamera(-20, 20, 2.5, -2.5, 0.3, 200);
    cam.position.set(-9, 2.5, -30); cam.up.set(0, 1, 0); cam.lookAt(-9, 2.5, 0);
    renderer.render(sc, cam); const side = grab(2400, 300);
    renderer.setSize(480, 630, false);
    cam = new T.OrthographicCamera(-1.6, 1.6, 2.1, -2.1, 0.3, 200);
    cam.position.set(30, 2.1, 0); cam.up.set(0, 1, 0); cam.lookAt(0, 2.1, 0);
    renderer.render(sc, cam); const front = grab(480, 630);
    renderer.toneMapping = save.tm; renderer.shadowMap.enabled = save.sh; renderer.setPixelRatio(save.pr);
    return { side: side, front: front };
  });
  await b.close();
  for (const k of ['side', 'front']) fs.writeFileSync(path.join(OUT, k + '.png'), Buffer.from(res[k].url.split(',')[1], 'base64'));
  if (errs.length) console.log('ページのエラー:\n  ' + errs.slice(0, 5).join('\n  '));

  const rows = []; let ng = errs.length ? 1 : 0;
  const ok = (name, cond, expect, got) => { if (!cond) ng++; rows.push([name, String(expect), String(got), cond ? 'OK' : 'NG']); };
  const px = (img, w, i, j) => { const k = 4 * (j * w + i); return [img.d[k], img.d[k + 1], img.d[k + 2]]; };
  const S = (x, z) => px(res.side, 2400, Math.round(1200 + (-9 - x) * 60), Math.round(150 + (2.5 - z) * 60));
  const F = (y, z) => px(res.front, 480, Math.round((y + 1.6) * 150), Math.round((4.2 - z) * 150));
  const isRed = (c) => c[0] > 150 && c[1] < 60 && c[2] > 60 && c[2] < 170;
  const isBlue = (c) => c[2] > 70 && c[0] < 70 && c[1] < 90 && c[2] > c[0] + 40;
  const isSteel = (c) => Math.abs(c[0] - 184) < 25 && Math.abs(c[1] - 186) < 25 && Math.abs(c[2] - 189) < 25 && Math.max(...c) - Math.min(...c) < 18;
  const isIvory = (c) => c[0] > 205 && c[1] > 198 && c[2] > 170 && c[0] - c[2] > 12;
  const isBlack = (c) => c[0] + c[1] + c[2] < 60;
  const fmt = (c) => '(' + c.join(',') + ')';
  const zr = (a) => (a[0] + a[1]) / 2;
  // ---- 側面 ----
  {
    const xs = [-8.0, -4.7, 0, 4.7, 7.6];
    const badR = xs.map((x) => S(x, zr(REF.RED))).find((c) => !isRed(c));
    ok('側面:腰部の赤帯', !badR, '京王レッド(z ' + REF.RED.join('〜') + ')', badR ? fmt(badR) : xs.length + '点');
    const badB = xs.map((x) => S(x, zr(REF.BLUE))).find((c) => !isBlue(c));
    ok('側面:京王ブルーの帯', !badB, '京王ブルー(z ' + REF.BLUE.join('〜') + ')', badB ? fmt(badB) : xs.length + '点');
    const mk = [-2.5, -1.2, 2.0, 3.0].map((x) => S(x, REF.MAKU_Z)), badM = mk.find((c) => !isSteel(c));
    ok('側面:幕板に赤帯が無い', !badM, 'ステンレス(z ' + REF.MAKU_Z + ')', badM ? fmt(badM) : '4点');
    let badW = null;
    for (const g of REF.GAPS) for (const sg of [-1, 1]) {
      const c = S(g + sg * REF.WIN_OFF, zr(REF.WIN)); if (isSteel(c) && !badW) badW = [g + sg * REF.WIN_OFF, fmt(c)];
    }
    ok('側面:扉間の窓が透ける', !badW, '6枚(ステンレスでない)', badW ? badW.join(' ') : '6枚');
    const iv = S(REF.IVORY_X + 0.06, 2.5), mid = S(-20 + REF.IVORY_X + 0.06, 2.5);
    ok('側面:前頭部はアイボリー', isIvory(iv) && isSteel(mid), '先頭車=アイボリー/中間車=ステンレス', fmt(iv) + ' / ' + fmt(mid));
    ok('側面:帯はアイボリーの上も通る', isRed(S(REF.IVORY_X + 0.06, zr(REF.RED))), '京王レッド', fmt(S(REF.IVORY_X + 0.06, zr(REF.RED))));
  }
  // ---- 前面 ----
  {
    // 窓は3つ(左右の前面窓と扉の窓)が暗く、その間(扉の戸・枠)はアイボリー。1枚の黒いガラス域ではない(写真)
    const isDark = (c) => c[0] + c[1] + c[2] < 180;
    const gl = [F(-1.0, 2.6), F(0, 2.6), F(1.0, 2.6)], badG = gl.find((c) => !isDark(c));
    const between = [F(-0.225, 2.6), F(0.225, 2.6), F(-0.305, 2.6), F(0.305, 2.6)], badI = between.find((c) => !isIvory(c));
    ok('前面:窓は3つ(間はアイボリー)', !badG && !badI, '窓=暗い・扉の戸と枠=アイボリー', badG ? '窓 ' + fmt(badG) : (badI ? '間 ' + fmt(badI) : '7点'));
    // 前面窓の下端:y=±1.0 で z=2.6 から下へ暗さが切れる所(左右とも)
    let zb = null;
    for (const y of [-1.0, 1.0]) for (let z = 2.6; z > 1.5; z -= 1 / 150) if (!isDark(F(y, z))) { zb = zb === null ? z : Math.max(zb, z); break; }
    ok('前面:窓の下端', zb !== null && zb >= REF.WIN_BOTTOM[0] && zb <= REF.WIN_BOTTOM[1],
      REF.WIN_BOTTOM.join('〜') + 'm', zb === null ? '無い' : zb.toFixed(3) + 'm');
    const st = [F(-0.45, zr(REF.RED)), F(0.45, zr(REF.RED))], sb = [F(-0.45, zr(REF.BLUE)), F(0.45, zr(REF.BLUE))];
    ok('前面:腰部の帯が正面へ回る', st.every(isRed) && sb.every(isBlue), '赤と青(左右)', st.map(fmt).join(' ') + ' / ' + sb.map(fmt).join(' '));
    const iv = [F(-0.45, 1.40), F(0.45, 1.40), F(-0.45, 2.02)];
    ok('前面:アイボリー', iv.every(isIvory), '帯の上下', iv.map(fmt).join(' '));
    // 中央の非常扉の縁(幅610mm):y=±0.305 の付近に暗い線
    const line = (y) => { let m = 999; for (let d = -3; d <= 3; d++) { const c = px(res.front, 480, Math.round((y + 1.6) * 150) + d, Math.round((4.2 - 1.47) * 150)); m = Math.min(m, c[0] + c[1] + c[2]); } return m; };
    const E = REF.DOOR_EDGE, lines = [-E[1], -E[0], E[0], E[1]].map(line);
    ok('前面:中央の非常扉の縁', lines.every((v) => v < 200) && line(0) > 500 && line(REF.FDOOR_HW) > 500,
      'y=±' + E.join('・±') + ' に線・中央と枠(±' + REF.FDOOR_HW + ')は無地', lines.join('/') + ' / ' + line(0) + '/' + line(REF.FDOOR_HW));
    // 帯は扉の枠(±0.26〜0.35)のアイボリーで切れる
    const gap = [F(-REF.FDOOR_HW, zr(REF.RED)), F(REF.FDOOR_HW, zr(REF.BLUE))];
    ok('前面:帯は扉の枠で切れる', gap.every(isIvory), 'アイボリー', gap.map(fmt).join(' '));
    const hl = [F(-REF.HL[0], REF.HL[1]), F(REF.HL[0], REF.HL[1])];
    ok('前面:前照灯が点く(青帯の中)', hl.every((c) => c[0] + c[1] + c[2] > 600) && zb !== null && zb > REF.HL[1] && REF.HL[1] > REF.BLUE[0] && REF.HL[1] < REF.BLUE[1],
      '明るい・窓より下', hl.map(fmt).join(' '));
    const tl = [F(-REF.TL[0], REF.TL[1]), F(REF.TL[0], REF.TL[1])];
    ok('前面:尾灯は消えている(先頭)', tl.every((c) => c[0] < 150 && c[0] > c[1]), '暗い赤', tl.map(fmt).join(' '));
    const count = (r, test) => { let n = 0; for (let y = r[0]; y <= r[1]; y += 1 / 150) for (let z = r[2]; z <= r[3]; z += 1 / 150) if (test(F(y, z))) n++; return n; };
    const nd = count(REF.DEST, (c) => c[0] > 150 && c[0] > c[2] + 60);
    ok('前面:行先表示器は扉の上', nd > 30, '橙の文字>30画素', nd + '画素');
    // 種別は黒地に明るい文字(各停は白)。黒地が半分以上で、明るい文字が30画素以上
    const nk = count(REF.KIND, (c) => Math.max(...c) > 150), nkD = count(REF.KIND, (c) => c[0] + c[1] + c[2] < 40);
    ok('前面:種別表示器は向かって左の窓の上部', nk > 30 && nkD > nk, '黒地に明るい文字>30画素', nk + '画素(黒地' + nkD + ')');
    // 種別「各  停」(2文字の間を空ける。利用者指示):外接矩形の幅/高さ 2.2〜3.4、中央の2割に文字が無い(字間)。
    // 画像と面の縦横比が違うと縦長になる(以前は約1.1)
    { const bb = (R, th) => { let y0 = 1e9, y1 = -1e9, z0 = 1e9, z1 = -1e9;
        for (let y = R[0]; y <= R[1]; y += 1 / 150) for (let z = R[2]; z <= R[3]; z += 1 / 150)
          if (th(F(y, z))) { y0 = Math.min(y0, y); y1 = Math.max(y1, y); z0 = Math.min(z0, z); z1 = Math.max(z1, z); }
        return [y0, y1, z0, z1]; };
      const k = bb(REF.KIND, (c) => Math.max(...c) > 150), ar = (k[1] - k[0]) / Math.max(1e-6, k[3] - k[2]);
      const cm = (k[0] + k[1]) / 2, gap = count([cm - 0.1 * (k[1] - k[0]), cm + 0.1 * (k[1] - k[0]), k[2], k[3]], (c) => Math.max(...c) > 150);
      ok('前面:種別の文字の縦横比と字間', ar >= 2.2 && ar <= 3.4 && gap === 0, '幅/高さ 2.2〜3.4・中央の2割は空き', ar.toFixed(2) + '・中央' + gap + '画素(高さ' + (k[3] - k[2]).toFixed(3) + 'm)');
      // 車号「9781」:字形のまま(Arial 太字の4桁で 幅/高さ ≈3)。枠いっぱいに引き伸ばすと約2.6 の縦長になる
      const n = bb(REF.NUM, (c) => c[0] > 200 && c[1] > 200 && c[2] > 200), an = (n[1] - n[0]) / Math.max(1e-6, n[3] - n[2]);
      ok('前面:車号の縦横比', an >= 2.8 && an <= 3.6, '幅/高さ 2.8〜3.6', an.toFixed(2)); }
    const lgW = count(REF.LOGO, (c) => c[0] > 200 && c[1] > 200 && c[2] > 190), lgL = count([-REF.LOGO[1], -REF.LOGO[0], REF.LOGO[2], REF.LOGO[3]], (c) => c[0] > 200 && c[1] > 200 && c[2] > 190);
    ok('前面:KEIO ロゴは向かって右の赤帯', lgW > 20 && lgL < 3, '右に白>20画素・左に無し', lgW + '/' + lgL + '画素');
    const nn = count(REF.NUM, (c) => c[0] > 200 && c[1] > 200 && c[2] > 200);
    ok('前面:車号は向かって右の窓の上部', nn > 10, '白い文字>10画素', nn + '画素');
    // 向かって左の窓の上部には種別表示器があるので、その下(車号と同じ高さの、表示器の外)に白い数字が無いこと
    const nl = count([-REF.NUM[1], -REF.NUM[0], REF.NUM[2], REF.KIND[2] - 0.02], (c) => c[0] > 200 && c[1] > 200 && c[2] > 200);
    ok('前面:向かって左には車号が無い', nl < 3, '0画素', nl + '画素');
  }
  console.log('=== 京王9000系の描画(塗り分け) ⇄ 公表の説明・推定値 ===\n描画: ' + OUT + '/side.png front.png');
  const pad = (s, n) => s + ' '.repeat(Math.max(1, n - [...s].reduce((a, ch) => a + (ch.charCodeAt(0) > 0x2000 ? 2 : 1), 0)));
  for (const r of rows) console.log(pad(r[0], 34) + pad(r[1], 34) + pad(r[2], 40) + r[3]);
  console.log(ng ? '\nRESULT: FAIL(' + ng + '項目NG)' : '\nRESULT: PASS');
  process.exit(ng ? 1 : 0);
})();
