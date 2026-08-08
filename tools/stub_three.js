// HTML内の<script>を Node で実行するための共通スタブ。
//
//   THREE を「あとから測定できる実体」に差し替え、ブラウザ専用APIは Proxy で潰す。
//   これにより、描画を目視できなくてもモデルや運転ロジックを機械的に検査できる。
//   verify_car.js(ジオメトリ検証)と verify_run.js(運転検証)が共用する。
//
//   使い方:
//     const X = require('./stub_three')('keio_elevated_3d.html', 'K8:K8,STA:STA');
//     // X.K8 / X.STA が取り出せる
const fs = require('fs');

/* ---- 何でも受け止めるProxy(測定に関係しないブラウザ/描画APIはこれで潰す) ---- */
const anything = new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'length' ? 0 : anything),
  apply: () => anything, construct: () => anything, set: () => true,
});
// 実体クラスに「知らないプロパティは anything」を足す薄いラッパ
const soft = (o) => new Proxy(o, {
  get: (t, k) => (typeof k === 'symbol' || k in t ? t[k] : anything),
  set: (t, k, v) => { t[k] = v; return true; },
});

/* ---- 測定に必要なぶんだけ本物として実装した THREE ---- */
class V3 {
  constructor(x, y, z) { this.x = x || 0; this.y = y || 0; this.z = z || 0; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  clone() { return new V3(this.x, this.y, this.z); }
  add(v) { this.x += v.x; this.y += v.y; this.z += v.z; return this; }
  sub(v) { this.x -= v.x; this.y -= v.y; this.z -= v.z; return this; }
  multiplyScalar(s) { this.x *= s; this.y *= s; this.z *= s; return this; }
  length() { return Math.hypot(this.x, this.y, this.z); }
  normalize() { const l = this.length() || 1; return this.multiplyScalar(1 / l); }
  distanceTo(v) { return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z); }
  crossVectors(a, b) {
    return this.set(a.y * b.z - a.z * b.y, a.z * b.x - a.x * b.z, a.x * b.y - a.y * b.x);
  }
  applyQuaternion() { return this; }
  applyMatrix4() { return this; }
}
class Obj3D {
  constructor() {
    this.children = []; this.position = new V3(); this.rotation = new V3();
    this.scale = new V3(1, 1, 1); this.quaternion = soft({ setFromRotationMatrix() {} });
    this.userData = {}; this.visible = true;
    return soft(this);
  }
  add(...o) { for (const c of o) this.children.push(c); return this; }
  remove() { return this; }
  traverse(f) { f(this); for (const c of this.children) if (c && c.traverse) c.traverse(f); }
}
class Group extends Obj3D {}
class Scene extends Obj3D {}   // traverse を効かせて場面全体を走査できるようにする
// 透視投影カメラ。near/far を実値で持ち、空ドームが遠方面の内側にあるか等を測れる
class PerspCam extends Obj3D {
  constructor(fov, aspect, near, far) {
    super();
    this.fov = fov; this.aspect = aspect; this.near = near; this.far = far;
    this.up = new V3(0, 1, 0);
    return soft(this);
  }
}
/* テクスチャ。色空間(encoding)と写像(mapping)を実値で持つ。
   ここを実体にしないと「色テクスチャをsRGBとして読んでいるか」
   「環境マップを正距円筒として読ませているか」を検査できない。 */
class Tex {
  constructor() {
    this.encoding = 3000;   // LinearEncoding
    this.mapping = 300;     // UVMapping
    this.wrapS = 1001; this.wrapT = 1001;
    this.repeat = soft({ x: 1, y: 1, set(a, b) { this.x = a; this.y = b; return this; } });
    this.needsUpdate = false;
    return soft(this);
  }
}
/* 平行光。影の追従(光の向き・写す範囲・テクセルへの吸着)を検査できるように、
   position / target.position / shadow.camera を実体として持つ。 */
class DirLight extends Obj3D {
  constructor() {
    super();
    this.target = new Obj3D();
    this.castShadow = false;
    this.shadow = soft({
      mapSize: soft({ x: 512, y: 512, set(a, b) { this.x = a; this.y = b; return this; } }),
      camera: soft({
        left: -5, right: 5, top: 5, bottom: -5, near: 0.5, far: 500,
        updateProjectionMatrix() {},
      }),
      bias: 0, normalBias: 0,
    });
    return soft(this);
  }
}
class Mesh extends Obj3D { constructor(g, mat) { super(); this.geometry = g; this.material = mat; } }
// 位置と拡大率だけを記録する Matrix4。インスタンスの配置を後から測れるようにする。
class M4 {
  constructor() { this.p = null; this.s = null; return soft(this); }
  compose(pos, q, sc) {
    this.p = { x: pos.x, y: pos.y, z: pos.z };
    this.s = { x: sc.x, y: sc.y, z: sc.z };
    return this;
  }
  makeBasis() { return this; }
  identity() { return this; }
}
// InstancedMesh:setMatrixAt で渡された配置を配列 mats に保持する
class Inst extends Mesh {
  constructor(g, mat, n) {
    super(g, mat);
    this.count = n; this.mats = [];
    this.instanceMatrix = soft({ needsUpdate: false });
    return soft(this);
  }
  setMatrixAt(i, m) {
    this.mats[i] = (m && m.p) ? { p: { x: m.p.x, y: m.p.y, z: m.p.z },
                                  s: m.s ? { x: m.s.x, y: m.s.y, z: m.s.z } : null } : null;
  }
  getMatrixAt() {}
}
class Attr {
  constructor(a, is) { this.array = a; this.itemSize = is; this.count = a.length / is; return soft(this); }
}
class BufGeo {
  constructor() { this.attributes = {}; this.index = null; return soft(this); }
  setAttribute(n, a) { this.attributes[n] = a; return this; }
  setIndex(a) { this.index = soft({ array: a, count: a.length }); return this; }
  computeVertexNormals() {} dispose() {}
  translate() { return this; } rotateX() { return this; } rotateY() { return this; } scale() { return this; }
}
const param = (type) => class extends BufGeo {
  constructor(...a) { super(); this.type = type; this.p = a; return soft(this); }
};
const Mat = (type) => class {
  constructor(o) { Object.assign(this, o || {}); this.type = type; return soft(this); }
};
const REAL = {
  Vector3: V3, Object3D: Obj3D, Group, Scene, Mesh, BufferGeometry: BufGeo, DirectionalLight: DirLight,
  PerspectiveCamera: PerspCam, CanvasTexture: Tex, Texture: Tex,
  Matrix4: M4, InstancedMesh: Inst,
  Float32BufferAttribute: Attr, BufferAttribute: Attr,
  BoxGeometry: param('Box'), CylinderGeometry: param('Cyl'), PlaneGeometry: param('Plane'),
  SphereGeometry: param('Sph'), ConeGeometry: param('Cone'), CircleGeometry: param('Cir'),
  MeshLambertMaterial: Mat('lambert'), MeshBasicMaterial: Mat('basic'),
  MeshPhongMaterial: Mat('phong'), LineBasicMaterial: Mat('line'),
  DoubleSide: 2, FrontSide: 0, BackSide: 1,
  // three.js の定数(実値)。スタブが Proxy を返すと材質の設定を数値で検査できない
  LinearEncoding: 3000, sRGBEncoding: 3001,
  UVMapping: 300, EquirectangularReflectionMapping: 303,
  MultiplyOperation: 0, MixOperation: 1, AddOperation: 2,
  NoToneMapping: 0, ACESFilmicToneMapping: 4,
  BasicShadowMap: 0, PCFShadowMap: 1, PCFSoftShadowMap: 2,
  RepeatWrapping: 1000, ClampToEdgeWrapping: 1001,
};

function install() {
  global.THREE = new Proxy(REAL, { get: (t, k) => (k in t ? t[k] : anything) });
  global.Image = class { constructor() { this.onload = null; } set src(v) { if (this.onload) this.onload(); } };
  global.document = new Proxy({}, {
    get: (t, k) => {
      if (k === 'getElementById' || k === 'querySelector') return () => anything;
      if (k === 'createElement') return () => ({
        getContext: () => anything, appendChild: () => {}, style: {},
        classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {}, width: 0, height: 0,
      });
      if (k === 'addEventListener') return () => {};
      return anything;
    },
  });
  global.window = global;
  global.navigator = { userAgent: 'node', maxTouchPoints: 0 };
  global.screen = { width: 1920, height: 1080, orientation: { lock: () => Promise.resolve() } };
  global.performance = { now: () => 0 };
  global.devicePixelRatio = 1; global.innerWidth = 1920; global.innerHeight = 1080;
  global.requestAnimationFrame = () => 0; global.addEventListener = () => {};
  global.localStorage = anything;
}

/**
 * HTMLのスクリプトをスタブ環境で実行し、指定した識別子を取り出す。
 *   htmlPath   … HTMLのパス
 *   exportExpr … "K8:K8,STA:STA" のようなオブジェクトリテラルの中身
 * 実行に失敗したらメッセージを出してプロセスを終了する。
 */
module.exports = function runHtml(htmlPath, exportExpr) {
  const html = fs.readFileSync(htmlPath, 'utf8');
  const m = html.match(/<script>([\s\S]*?)<\/script>/);
  if (!m) { console.error('NO_SCRIPT'); process.exit(1); }
  install();
  try {
    // eval に export 文を継ぎ足す:同一スコープなので const/let で宣言された値も取り出せる
    eval(m[1] + '\n;globalThis.__X={' + exportExpr + '};');
  } catch (e) {
    console.error('RUNTIME_ERROR: ' + e.constructor.name + ' ' + e.message);
    console.error(e.stack.split('\n').slice(0, 5).join('\n'));
    process.exit(1);
  }
  const X = globalThis.__X;
  X.__html = html;
  return X;
};
