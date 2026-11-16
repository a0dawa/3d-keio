// ビューアの一部(視点の周り)を GLB に書き出す(検証ではない。Blender(Cycles)との比較用)
// node export_glb.js <html> <outdir> — 視点は VIEW に固定
const fs=require('fs'), path=require('path'), os=require('os');
const HTML=path.resolve(process.argv[2]), OUTD=process.argv[3], PW='/opt/node-tools/node_modules', THREEJS=process.env.K8_THREE;
const EXPORTER=path.join(__dirname,'GLTFExporter.js');
const OUT=fs.mkdtempSync(path.join(os.tmpdir(),'kglb-')), PAGE=path.join(OUT,'page.html');
let src=fs.readFileSync(HTML,'utf8');
src=src.replace(/<script src="https?:\/\/[^"]*three[^"]*"><\/script>/,'<script src="three.min.js"></script>\n<script src="GLTFExporter.js"></script>');
fs.writeFileSync(PAGE,src); fs.copyFileSync(THREEJS,path.join(OUT,'three.min.js')); fs.copyFileSync(EXPORTER,path.join(OUT,'GLTFExporter.js'));
for(const nm of ['plateau_bldg.js','plateau_land.js','plateau_tex.js','plateau_dem.js','gsi_trees.js']){const pl=path.join(path.dirname(HTML),nm); if(fs.existsSync(pl)) fs.copyFileSync(pl,path.join(OUT,nm));}
(async()=>{
  const {chromium}=require(path.resolve(PW,'playwright-core'));
  const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage','--no-sandbox']});
  const W=1280,H=720, p=await b.newPage({viewport:{width:W,height:H}});
  const errs=[]; p.on('pageerror',e=>errs.push(e.message)); p.on('console',m=>{if(m.type()==='error') errs.push(m.text());});
  await p.addInitScript(`(()=>{try{localStorage.setItem('keio3d.photo','0');}catch(e){}})()`);   // 航空写真 OFF(書き出しに乗らないので条件を揃える)
  await p.addInitScript(`(()=>{let a=20260701>>>0;Math.random=()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};})()`);
  await p.goto('file://'+PAGE,{timeout:300000});
  await p.waitForFunction('window.CINE!==undefined',{timeout:300000});
  await p.waitForFunction('window.KEIO_READY!==false&&!document.getElementById("loading")',{timeout:300000});
  await p.waitForFunction('typeof PTX_READY==="undefined"||PTX_READY.all',{timeout:300000});
  const meta=await p.evaluate(async([W,H])=>{
    CINE.begin(); renderer.setPixelRatio(1); renderer.setSize(W,H,false); camera.aspect=W/H; camera.updateProjectionMatrix();
    // 視点:明大前の駅前の街路から駅と高架を望む(静止物が主役。列車・人は含めない)
    const st=STA[2], q=frame(st.x+95,-33), l=frame(st.x+5,-2);
    const VIEW={pos:[q.x,3.2,q.z], look:[l.x,7.5,l.z]};
    camera.position.set(...VIEW.pos); camera.lookAt(...VIEW.look); cam.tx=VIEW.look[0]; cam.tz=VIEW.look[2];
    for(let i=0;i<3;i++) CINE.render();                                     // 近くの形(LOD)を作らせる
    const T=new THREE.Vector3(l.x,0,l.z), R=240;
    const group=new THREE.Group(); let nMesh=0,nInst=0,nBakedV=0, skip={people:0,train:0,far:0,pts:0,zero:0};
    const inR=o=>{ const g=o.geometry; if(!g.boundingSphere) g.computeBoundingSphere(); if(!g.boundingSphere) return false;
      const c=g.boundingSphere.center.clone().applyMatrix4(o.matrixWorld); c.y=0; return c.distanceTo(T)<R+Math.min(g.boundingSphere.radius,600); };
    const underTrain=o=>{ for(let q2=o;q2;q2=q2.parent){ const ud=q2.userData||{}; if(ud.series||ud.xcar||ud.xtrain||ud.body) return true; } return false; };
    const m4=new THREE.Matrix4(), n3=new THREE.Matrix3();
    scene.updateMatrixWorld(true);
    scene.traverse(o=>{
      if(!o.visible) return; let vp=o.parent; while(vp){ if(!vp.visible) return; vp=vp.parent; }
      if(o.isPoints){skip.pts++; return;}
      if(o===skyDome) return;
      if(o.isInstancedMesh){
        const g=o.geometry;
        if(g.attributes.aPK||g.attributes.iMW){skip.people++; return;}      // 人(部品を属性で選ぶ)は焼けない
        // 外接球では見ない(近くの木 CITY.treeNear などは形の外接球が原点のままで、半径の判定が誤って落とす)。個々のインスタンスの位置で選ぶ
        // 焼き込み:行列を掛けた頂点・法線・色(樹冠はインスタンス色を aTint で混ぜる)
        const pos=g.attributes.position, nor=g.attributes.normal, col=g.attributes.color, tint=g.attributes.aTint;
        const P=[],N=[],C=[],I=[]; const v=new THREE.Vector3(), nv=new THREE.Vector3(), ic=new THREE.Color();
        for(let i=0;i<o.count&&nBakedV<2.6e6;i++){
          o.getMatrixAt(i,m4);
          const sc=Math.hypot(m4.elements[0],m4.elements[1],m4.elements[2]); if(sc<1e-4){skip.zero++; continue;}
          m4.premultiply(o.matrixWorld); n3.getNormalMatrix(m4);
          { const dx=m4.elements[12]-T.x, dz=m4.elements[14]-T.z; if(Math.hypot(dx,dz)>R+30){skip.far++; continue;} }
          if(o.instanceColor) ic.fromBufferAttribute(o.instanceColor,i); else ic.setRGB(1,1,1);
          const v0=P.length/3;
          for(let k=0;k<pos.count;k++){
            v.fromBufferAttribute(pos,k).applyMatrix4(m4); P.push(v.x,v.y,v.z);
            if(nor){ nv.fromBufferAttribute(nor,k).applyMatrix3(n3).normalize(); N.push(nv.x,nv.y,nv.z); } else N.push(0,1,0);
            let r=1,g2=1,b2=1; if(col){ r=col.getX(k); g2=col.getY(k); b2=col.getZ(k); }
            const t=tint?tint.getX(k):(o.instanceColor?1:0);
            C.push(r*(1+(ic.r-1)*t), g2*(1+(ic.g-1)*t), b2*(1+(ic.b-1)*t));
          }
          if(g.index) for(let k=0;k<g.index.count;k++) I.push(v0+g.index.array[k]); else for(let k=0;k<pos.count;k++) I.push(v0+k);
          nBakedV+=pos.count;
        }
        if(!P.length) return;
        const ng=new THREE.BufferGeometry();
        ng.setAttribute('position',new THREE.Float32BufferAttribute(P,3));
        ng.setAttribute('normal',new THREE.Float32BufferAttribute(N,3));
        ng.setAttribute('color',new THREE.Float32BufferAttribute(C,3));
        ng.setIndex(I);
        const mat=(Array.isArray(o.material)?o.material[0]:o.material).clone(); mat.vertexColors=true; mat.map=null;
        const nm=new THREE.Mesh(ng,mat); nm.name=(o.name||'inst')+'_baked'; group.add(nm); nInst++;
        return;
      }
      if(!(o.isMesh||o.isLine)) return;
      if(underTrain(o)){skip.train++; return;}
      if(!inR(o)){skip.far++; return;}
      { const g=o.geometry, pc=g.attributes.position?g.attributes.position.count:0;   // 頂点数の合わない属性は外す(MG の uv は一部の面だけ。glTF の取り込みが落ちる)
        for(const k of Object.keys(g.attributes)) if(k!=='position'&&g.attributes[k].count!==pc) delete g.attributes[k]; }
      const c=o.clone(); c.children.length=0; c.matrix.copy(o.matrixWorld); c.matrixAutoUpdate=false;
      c.position.set(0,0,0); c.quaternion.identity(); c.scale.set(1,1,1); c.matrix.decompose(c.position,c.quaternion,c.scale);
      group.add(c); nMesh++;
    });
    // Three.js 側の絵(比較用)
    const png=(()=>{ for(let i=0;i<2;i++) CINE.render(); return renderer.domElement.toDataURL('image/png'); })();
    const glb=await new Promise(res=>{ new THREE.GLTFExporter().parse(group,res,{binary:true,onlyVisible:false,maxTextureSize:1024}); });
    const bytes=new Uint8Array(glb); let s=''; const CH=0x8000;
    for(let i=0;i<bytes.length;i+=CH) s+=String.fromCharCode.apply(null,bytes.subarray(i,i+CH));
    window.__glb=btoa(s);
    return {view:VIEW, fov:camera.fov, nMesh:nMesh, nInst:nInst, bakedV:nBakedV, skip:skip, bytes:bytes.length, png:png,
            sun:[2400,3200,1600], calls:renderer.info.render.calls};
  },[W,H]);
  const n=await p.evaluate(()=>window.__glb.length);
  let b64=''; for(let i=0;i<n;i+=8_000_000) b64+=await p.evaluate(([a,b2])=>window.__glb.slice(a,b2),[i,Math.min(n,i+8_000_000)]);
  fs.writeFileSync(path.join(OUTD,'scene.glb'),Buffer.from(b64,'base64'));
  fs.writeFileSync(path.join(OUTD,'three_ref.png'),Buffer.from(meta.png.split(',')[1],'base64'));
  delete meta.png;
  fs.writeFileSync(path.join(OUTD,'meta.json'),JSON.stringify(meta,null,1));
  console.log(JSON.stringify({...meta,errs:errs.slice(0,4)}).slice(0,1200));
  await b.close();
})().catch(e=>{console.error(e);process.exit(1);});
