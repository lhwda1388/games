// 시내 도로: 정적 도색은 색별 병합, 차량은 부품별 인스턴싱(가까운 40대).
// Hallmark · pre-emit critique: P4 H4 E4 S5 R4 V4 · 기존 붕붕이 색/차량 시스템 계승. C2 빗길·경고 표지(노랑 바탕·빨강 테 삼각형)·드럼통도 같은 K 색표.
const PP_RROAD = (function ppRoadRender() {
  const K = { asphalt: 0x383f47, ground: 0x75836f, white: 0xf2f0ea, yellow: 0xf2c230, blue: 0x327dda,
    steel: 0x707b83, dark: 0x20262d, red: 0xff3737, green: 0x36ed95, off: 0x303a3c,
    building: 0xc9b9a0, glass: 0x425869, tree: 0x527c45, trunk: 0x736450, skin: 0xe3b88d, pink: 0xf07aa8, guideGreen: 0x2fb36b,
    drum: 0xe8692a, warn: 0xf5c518 };
  // 야간(mission.timeOfDay === 'night'): 남색 하늘·안개, 빛 세기 배율, 가로등·전조등 색
  const NIGHT = { sky: 0x0d1626, fog: [50, 230], light: [0.22, 0.6, 0.12], dim: 0.8, lampHead: 0xffe2a8, lampI: 1.1, pool: 0xffc870, window: 0xc9a45a, headlight: 0xfff3cf, tail: 0x8a1a1a, gap: 32 };
  // 빗길(mission.weather === 'rain'): 회청색 하늘·가까운 안개(시내/고속도로), 빛 세기 배율, 톤, 젖은 아스팔트, 빗줄기(개수·상자 폭×높이·길이·투명도·낙하 m/s)
  const RAIN = { sky: 0x7d8792, fog: [45, 200], fogHw: [120, 380], light: [0.7, 0.9, 0.35], dim: 0.85, asphalt: 0x2b3138,
    streak: 0xc4d0dc, n: 1400, box: [50, 24], len: 0.9, opacity: 0.35, fall: 14 };
  const R = typeof PP_ROADS !== 'undefined' ? PP_ROADS : require('./roads.js'); // Node 테스트용(순수 함수만)
  const CHUNK = 300; // 도색 병합 조각(m): 긴 고속도로도 frustum culling되도록
  // opts.highway: 시내 건물 대신 render-highway.js가 구조물을 놓는다. 바닥은 시야(600m)까지 넓힌다.
  function load(r, net, opts = {}) {
    PP_RENDER.clearMap(r);
    const H = PP_RENDER.assets, res = r.mapRes = H.makeRes(), g = r.mapGroup = new THREE.Group();
    r.scene.add(g); r.roadMode = true;
    r.map = { floors: [], ramps: [] };
    const night = !!opts.night, rain = !night && opts.weather === 'rain', mood = night ? NIGHT : rain ? RAIN : null;
    r.scene.background = new THREE.Color(mood ? mood.sky : H.COL.sky); r.scene.fog = mood ? new THREE.Fog(mood.sky, mood.fog[0], mood.fog[1]) : new THREE.Fog(H.COL.sky, 140, 420);
    if (mood) r.lights.forEach(([light, day], i) => { light.intensity = day * mood.light[i]; }); // clearMap이 주간 세기로 되돌린다
    const tone = c => mood ? new THREE.Color(c).multiplyScalar(mood.dim).getHex() : c;
    // 노면은 Lambert(꼭짓점 조명)라 큰 삼각형에 빛이 맺히지 않는다 → 가로등 빛 웅덩이·전조등 빔은 가산 혼합 바닥 판으로 그린다(Phong보다 훨씬 싸다)
    const surface = c => H.lam(res, tone(c));
    const state = { night, rain, net, res, g, signals: [], obstacles: [], batches: [], visibleCars: [], matrix: new THREE.Matrix4(), pose: new THREE.Object3D(), color: new THREE.Color() };
    const box = (x, y, z, l, w, h, a, color) => {
      const m = new THREE.Mesh(H.unitBox(res), H.lam(res, color));
      m.position.set(x, z + h / 2, -y); m.scale.set(l, h, w); m.rotation.y = a; g.add(m); return m;
    };
    // 루프로 범위: 꼭짓점이 많으면 Math.min(...xs)가 인자 한도(iOS 약 65k)를 넘는다
    const pad = opts.highway ? 600 : 100;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    for (const a of net.areas) for (const [x, y] of a.pts) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
    x0 -= pad; x1 += pad; y0 -= pad; y1 += pad;
    box((x0+x1)/2, (y0+y1)/2, -0.15, x1-x0, y1-y0, 0.1, 0, K.ground).material = surface(K.ground);
    // 노면 면: CHUNK 칸별로 한 지오메트리에 병합(draw call 절약, culling 유지)
    const areaChunks = new Map();
    for (const area of net.areas) {
      const s = new THREE.Shape(); area.pts.forEach(([x,y], i) => i ? s.lineTo(x,y) : s.moveTo(x,y)); s.closePath();
      const geo = new THREE.ShapeGeometry(s), key = Math.floor(area.pts[0][0] / CHUNK) + ',' + Math.floor(area.pts[0][1] / CHUNK);
      if (!areaChunks.has(key)) areaChunks.set(key, { pos: [], idx: [] });
      const c = areaChunks.get(key), n = c.pos.length / 3, P = geo.attributes.position.array, I = geo.index.array;
      for (let i = 0; i < P.length; i += 3) c.pos.push(P[i], 0, -P[i+1]); // rotateX(-π/2): (x,y,0) → (x,0,-y)
      for (let i = 0; i < I.length; i++) c.idx.push(I[i] + n);
      geo.dispose();
    }
    for (const [key, c] of areaChunks) {
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(c.pos, 3)); geo.setIndex(c.idx);
      const nor = new Float32Array(c.pos.length); for (let i = 1; i < nor.length; i += 3) nor[i] = 1;
      geo.setAttribute('normal', new THREE.BufferAttribute(nor, 3));
      res.geo.set('area'+key, geo); g.add(new THREE.Mesh(geo, rain ? H.lam(res, RAIN.asphalt) : surface(K.asphalt))); // 비: 젖어 어두운 노면
    }
    const stripes = new Map();
    function strip(x, y, a, len, width, color) {
      const key = color + '|' + Math.floor(x / CHUNK) + ',' + Math.floor(y / CHUNK);
      if (!stripes.has(key)) stripes.set(key, { color, vs: [] });
      const vs = stripes.get(key).vs, c = Math.cos(a), s = Math.sin(a);
      const p = [[-len/2,-width/2],[len/2,-width/2],[len/2,width/2],[-len/2,width/2]].map(([u,v]) => [x+c*u-s*v,0.025,-(y+s*u+c*v)]);
      for (const i of [0,1,2,0,2,3]) vs.push(...p[i]);
    }
    for (const line of net.lines) {
      const guide = line.type.startsWith('guide-');
      const color = line.type.startsWith('yellow') ? K.yellow : line.type.startsWith('blue') ? K.blue : line.type === 'guide-pink' ? K.pink : line.type === 'guide-green' ? K.guideGreen : K.white;
      let total = 0;
      for (let i=1;i<line.pts.length;i++) {
        const [x,y] = line.pts[i-1], [ex,ey] = line.pts[i], a = Math.atan2(ey-y,ex-x), len = Math.hypot(ex-x,ey-y);
        const cross = line.type === 'crosswalk', dashed = line.type.endsWith('dashed');
        const period = cross ? 1.2 : dashed ? 8 : Infinity, ink = cross ? 0.6 : dashed ? 3 : len;
        let pos = 0;
        while (pos < len - 1e-6) {
          const phase = Number.isFinite(period) ? (total + pos) % period : 0;
          const n = Math.min(len-pos, Number.isFinite(period) ? (phase < ink ? ink-phase : period-phase) : len);
          if (phase < ink) for (const off of line.type === 'yellow-double' ? [-0.16,0.16] : [0]) {
            strip(x+Math.cos(a)*(pos+n/2)-Math.sin(a)*off, y+Math.sin(a)*(pos+n/2)+Math.cos(a)*off, a, n, cross ? line.width || 4 : line.type === 'stop' ? 0.5 : guide ? 0.6 : 0.12, color);
          }
          pos += Math.max(n, 1e-5);
        }
        total += len;
      }
    }
    for (const [key, {color, vs: values}] of stripes) {
      const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.Float32BufferAttribute(values,3));
      res.geo.set('paint'+key,geo); g.add(new THREE.Mesh(geo,H.basic(res,color)));
    }
    function texture(key, draw) { return H.canvasTex(res,key,256,256,draw); }
    function plane(tex, width, height) {
      const mat = H.cached(res.mat, 'tex'+tex.uuid, () => new THREE.MeshBasicMaterial({ map:tex, transparent:true, side:THREE.DoubleSide })); // 같은 텍스처는 재질 공유
      const m = new THREE.Mesh(H.unitPlane(res),mat); m.scale.set(width,height,1); return m;
    }
    const css = c => '#'+c.toString(16).padStart(6,'0');
    for (const mark of net.marks) {
      if (mark.kind === 'gap-check') continue; // render-highway.js
      if (mark.kind === 'drum') { // 차로 끝 드럼통: 주황 몸통 + 흰 띠, 충돌 상자
        box(mark.x, mark.y, 0, .6, .6, .95, 0, K.drum); box(mark.x, mark.y, .45, .62, .62, .16, 0, K.white);
        state.obstacles.push({ x: mark.x, y: mark.y, l: .6, w: .6, a: 0 }); continue;
      }
      const tex = texture('mark'+(mark.arrow || mark.text), ctx => {
        ctx.fillStyle=css(K.white); ctx.strokeStyle=css(K.white); ctx.lineWidth=18; ctx.lineJoin='miter';
        if (mark.kind==='text') { ctx.font='bold 56px sans-serif';ctx.textAlign='center';ctx.fillText(mark.text,128,150);return; }
        ctx.beginPath();ctx.moveTo(128,235);ctx.lineTo(128,110);ctx.stroke();
        const arrow = (x,y,y0=150) => {ctx.beginPath();ctx.moveTo(128,y0);ctx.lineTo(x,y);ctx.stroke();const a=Math.atan2(y-y0,x-128);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-42*Math.cos(a-.6),y-42*Math.sin(a-.6));ctx.lineTo(x-42*Math.cos(a+.6),y-42*Math.sin(a+.6));ctx.fill();};
        if(mark.arrow==='merge-left') { ctx.beginPath();ctx.moveTo(128,235);ctx.lineTo(128,160);ctx.lineTo(60,60);ctx.stroke();const a=Math.atan2(60-160,60-128);ctx.beginPath();ctx.moveTo(48,42);ctx.lineTo(48-58*Math.cos(a-.5)+0,42-58*Math.sin(a-.5));ctx.lineTo(48-58*Math.cos(a+.5),42-58*Math.sin(a+.5));ctx.fill();return; } // 진로 변경 유도: 줄기에서 왼쪽 앞으로 비스듬히
        if(mark.arrow.includes('straight')) arrow(128,25);
        const uturn = mark.arrow.includes('uturn');
        if(mark.arrow.includes('left')) uturn ? arrow(36,172,206) : arrow(35,110); // 유턴과 함께면 좌회전 가지를 아래로 내려 두 촉이 붙지 않게
        if(uturn) { // 줄기 맨 위에서 왼쪽으로 꺾여 내려오는 갈고리, 촉은 아래(진행 반대) 방향
          ctx.beginPath();ctx.moveTo(128,112);ctx.lineTo(128,58);ctx.arc(88,58,40,0,Math.PI,true);ctx.lineTo(48,90);ctx.stroke();
          ctx.beginPath();ctx.moveTo(48,128);ctx.lineTo(24,88);ctx.lineTo(72,88);ctx.fill();
        }
        if(mark.arrow.includes('right')) arrow(221,110);
      });
      const m=plane(tex,2,4); m.rotation.set(-Math.PI/2,0,mark.a-Math.PI/2);m.position.set(mark.x,.035,-mark.y);g.add(m);
    }
    for (const sign of net.signs) {
      if (sign.kind === 'overhead') continue; // 차로 위 문형 안내판: render-highway.js (기둥은 노면 밖, 차로에 충돌 상자 없음)
      const tex=texture('sign'+sign.kind+sign.limit,ctx=>{
        ctx.fillStyle=css(K.white);ctx.fillRect(0,0,256,256);ctx.textAlign='center';ctx.textBaseline='middle';
        if(sign.kind==='slippery'||sign.kind==='lane-end') { // 경고 표지: 흰 테두리 안 노랑 삼각형 + 빨강 테, 검은 그림
          ctx.clearRect(0,0,256,256);const tri=(p,fill,stroke,w)=>{ctx.beginPath();ctx.moveTo(128,p);ctx.lineTo(256-p*0.9,232-p*0.4);ctx.lineTo(p*0.9,232-p*0.4);ctx.closePath();if(fill){ctx.fillStyle=fill;ctx.fill();}if(stroke){ctx.strokeStyle=stroke;ctx.lineWidth=w;ctx.lineJoin='round';ctx.stroke();}};
          tri(10,css(K.white));tri(28,css(K.warn),css(K.red),18);ctx.strokeStyle=css(K.dark);ctx.fillStyle=css(K.dark);ctx.lineWidth=12;ctx.lineCap='round';
          if(sign.kind==='lane-end'){ctx.beginPath();ctx.moveTo(104,200);ctx.lineTo(104,92);ctx.stroke();ctx.beginPath();ctx.moveTo(156,200);ctx.lineTo(156,150);ctx.lineTo(122,104);ctx.lineTo(122,92);ctx.stroke();} // 왼쪽 차로는 곧게, 오른쪽 차로가 좁아져 붙는다
          else{ctx.fillRect(98,92,60,40);ctx.lineWidth=9;for(const x of[100,156]){ctx.beginPath();ctx.moveTo(x,140);ctx.bezierCurveTo(x-22,160,x+22,176,x,198);ctx.stroke();}} // 차와 미끄러진 바퀴 자국
          return;
        }
        if(sign.kind==='limit') {ctx.strokeStyle=css(K.red);ctx.lineWidth=22;ctx.beginPath();ctx.arc(128,128,108,0,Math.PI*2);ctx.stroke();ctx.fillStyle=css(K.dark);ctx.font='bold 100px sans-serif';ctx.fillText(sign.limit,128,133);}
        else if(sign.kind==='min-speed') {ctx.fillStyle=css(K.blue);ctx.beginPath();ctx.arc(128,128,118,0,Math.PI*2);ctx.fill();ctx.fillStyle=css(K.white);ctx.font='bold 96px sans-serif';ctx.fillText(sign.limit,128,118);ctx.fillRect(68,178,120,12);}
        else {ctx.fillStyle=css(K.blue);ctx.fillRect(6,6,244,244);ctx.fillStyle=css(K.white);if(sign.kind==='school'){ctx.font='bold 68px sans-serif';ctx.fillText('어린이',128,88);ctx.fillText('보호',128,170);}else if(sign.kind==='unprotected-left'){ctx.font='bold 72px sans-serif';ctx.fillText('비보호',128,132);}else if(sign.kind==='uturn'){ctx.strokeStyle=css(K.white);ctx.lineWidth=20;ctx.beginPath();ctx.moveTo(160,150);ctx.lineTo(160,90);ctx.arc(122,90,38,0,Math.PI,true);ctx.lineTo(84,110);ctx.stroke();ctx.beginPath();ctx.moveTo(84,142);ctx.lineTo(60,106);ctx.lineTo(108,106);ctx.fill();ctx.font='bold 52px sans-serif';ctx.fillText('유턴',128,204);}else{ctx.font='bold 40px sans-serif';ctx.fillText(sign.kind==='camera'?'과속 단속':'버스전용',128,128);}}
      });
      box(sign.x,sign.y,0,.1,.1,2.8,0,K.steel);
      const m=plane(tex,1.1,1.1),ry=sign.a-Math.PI/2;m.position.set(sign.x+Math.sin(ry)*.07,2.8,-sign.y+Math.cos(ry)*.07);m.rotation.y=ry;g.add(m); // 판을 기둥 앞으로(기둥이 글자를 가리지 않게)
      state.obstacles.push({x:sign.x,y:sign.y,l:.15,w:.15,a:0});
    }
    for (const sig of net.signals) for (const post of sig.posts) {
      const head=new THREE.Group();head.position.set(post.x,5,-post.y);head.rotation.y=post.a+Math.PI/2;g.add(head);
      const n=sig.heads==='four'?4:3;
      head.scale.setScalar(1.3);
      const casing=new THREE.Mesh(H.unitBox(res),H.lam(res,K.dark));casing.scale.set(n*.48+.2,.58,.3);head.add(casing);
      const bulbs=[];
      for(let i=0;i<n;i++) {
        const geo = new THREE.CircleGeometry(.17,16); res.geo.set('bulb'+res.geo.size,geo);
        const material=new THREE.MeshBasicMaterial({color:K.off});res.mat.set('bulb'+res.mat.size,material);
        const m=new THREE.Mesh(geo,material); m.position.set((i-(n-1)/2)*.48,0,.16);head.add(m);bulbs.push(m);
        if(n===4 && i===2) { const arrow=plane(texture('left-arrow',ctx=>{ctx.fillStyle=css(K.dark);ctx.fillRect(0,0,256,256);ctx.clearRect(40,108,170,40);ctx.globalCompositeOperation='destination-out';ctx.beginPath();ctx.moveTo(30,128);ctx.lineTo(110,48);ctx.lineTo(110,208);ctx.fill();}),.34,.34);arrow.position.copy(m.position);arrow.position.z+=.002;head.add(arrow); }
      }
      // 옆 인도에서 뻗어 오는 신호등 지지대. 차로 위에 기둥을 세우지 않는다.
      const side=7, px=post.x-Math.sin(post.a)*side, py=post.y+Math.cos(post.a)*side;
      box(px,py,0,.16,.16,5.5,0,K.steel);box((px+post.x)/2,(py+post.y)/2,5.2,side,.12,.12,post.a+Math.PI/2,K.steel);
      state.obstacles.push({x:px,y:py,l:.2,w:.2,a:0});state.signals.push({sig,post,bulbs});
    }
    const winMat = () => H.cached(res.mat, 'nightWin', () => { // 밤 창문: 4×4 격자 중 일부만 노란 불(나머지 어두운 유리)
      const t = H.canvasTex(res, 'nightWin', 64, 64, ctx => {
        ctx.fillStyle = css(K.dark); ctx.fillRect(0, 0, 64, 64);
        for (let i = 0; i < 16; i++) { ctx.fillStyle = (i * 7) % 5 < 2 ? css(NIGHT.window) : '#1a2230'; ctx.fillRect((i % 4) * 16 + 3, Math.floor(i / 4) * 16 + 4, 10, 9); }
      });
      t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(3, 2);
      return new THREE.MeshBasicMaterial({ map: t });
    });
    // 도로에서 충분히 떨어진 블록만 생성: 교차로·다른 도로 위 건물 방지.
    if(!opts.highway) for(let x=x0+35;x<x1-25;x+=38) for(let y=y0+35;y<y1-25;y+=38) {
      const p=PP_ROADS.project(net,x,y); if(p.dist<22 || p.dist>65) continue;
      const h=8+Math.abs(Math.sin(x*3+y))*16;
      box(x,y,0,16,20,h,0,tone(K.building));const glass=box(x,y,3,16.1,20.1,h-5,0,K.glass);if(night)glass.material=winMat(); // 밤: 군데군데 불 켜진 창
      state.obstacles.push({x,y,l:16,w:20,a:0});
      box(x+12,y,0,.5,.5,3,0,tone(K.trunk));box(x+12,y,2.5,3.5,3.5,3.5,0,tone(K.tree));
    }
    const parts=H.carParts(res,{L:4.5,W:1.8,H:1.55,ra:-1.3,fa:1.35,tw:.77,cowl:.75}).parts;
    for(const part of parts) {
      const m=new THREE.InstancedMesh(part.geo,H.carPartMat(res,part.k,K.white),40);m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);m.frustumCulled=false;m.count=0;g.add(m);state.batches.push({part,m});
    }
    const lamps = new THREE.InstancedMesh(H.unitBox(res),H.basic(res,K.white),160);lamps.instanceMatrix.setUsage(THREE.DynamicDrawUsage);lamps.frustumCulled=false;g.add(lamps);state.lamps=lamps;
    // 밤: 보행자 옷에 약한 자체 발광(반사 소재처럼) — 가로등 사이 어두운 곳에서도 형체가 보이게
    const pedMat = night ? H.cached(res.mat,'pedNight',()=>new THREE.MeshLambertMaterial({color:K.blue,emissive:0x2a4f8a})) : H.lam(res,K.blue);
    const ped = new THREE.InstancedMesh(H.unitBox(res),pedMat,80);ped.frustumCulled=false;g.add(ped);state.ped=ped;
    if (night) streetLamps(state, H, res, g, net);
    if (rain) rainFall(state, res, g);
    r.road=state;return state;
  }
  // 가로등: 각 도로 바깥 차로(오른쪽 이웃 없음) 오른쪽 인도에 NIGHT.gap 간격. 기둥·머리·빛 웅덩이는 인스턴싱(3 draw call),
  // 실제 PointLight는 2개만 두고 매 프레임 플레이어에 가장 가까운 가로등 2곳으로 옮긴다(빛 하나마다 모든 Lambert 꼭짓점 셰이더 비용이 붙어 4개에서 줄임).
  // 나머지 가로등은 빛 웅덩이 판이 밝기를 대신한다. 전조등 SpotLight 1개.
  function lampPoints(net, gap = NIGHT.gap) {
    const pts = [];
    for (const ln of Object.values(net.lanes)) {
      if (ln.right || ln.id.includes('>') || ln.kind !== 'normal') continue;
      const len = ln.cum[ln.cum.length-1];
      for (let d = 10; d < len - 6; d += gap) {
        const p = R.pointAt(ln, d), off = ln.width/2 + 1.8; // 바깥 차로 가장자리 1.8m 바깥(인도)
        pts.push({ x: p.x + Math.sin(p.a)*off, y: p.y - Math.cos(p.a)*off, th: p.a });
      }
    }
    return pts;
  }
  function streetLamps(s, H, res, g, net) {
    const pts = lampPoints(net);
    const n = pts.length; s.lampPts = pts;
    const pole = new THREE.InstancedMesh(H.unitBox(res), H.lam(res, K.steel), n), head = new THREE.InstancedMesh(H.unitBox(res), H.basic(res, NIGHT.lampHead), n);
    const poolGeo = new THREE.CircleGeometry(1, 20); res.geo.set('lampPool', poolGeo);
    const poolMat = H.cached(res.mat, 'lampPool', () => new THREE.MeshBasicMaterial({ color: NIGHT.pool, transparent: true, opacity: 0.16, depthWrite: false, blending: THREE.AdditiveBlending }));
    const pool = new THREE.InstancedMesh(poolGeo, poolMat, n);
    const o = new THREE.Object3D();
    pts.forEach((p, i) => {
      const ix = -Math.sin(p.th)*1.6, iy = Math.cos(p.th)*1.6; // 머리는 도로 쪽으로 1.6m 내밀기
      o.rotation.set(0, p.th, 0); o.position.set(p.x, 3.5, -p.y); o.scale.set(.18, 7, .18); o.updateMatrix(); pole.setMatrixAt(i, o.matrix);
      o.position.set(p.x+ix, 7, -(p.y+iy)); o.scale.set(.9, .18, .45); o.updateMatrix(); head.setMatrixAt(i, o.matrix);
      o.rotation.set(-Math.PI/2, 0, 0); o.position.set(p.x+ix, .03, -(p.y+iy)); o.scale.set(6, 6, 1); o.updateMatrix(); pool.setMatrixAt(i, o.matrix);
      s.obstacles.push({ x: p.x, y: p.y, l: .25, w: .25, a: 0 });
    });
    g.add(pole, head, pool);
    s.lampLights = [0,1].map(() => { const l = new THREE.PointLight(NIGHT.lampHead, NIGHT.lampI, 26, 1.2); g.add(l); return l; });
    const spot = new THREE.SpotLight(NIGHT.headlight, 1.8, 60, 0.42, 0.55, 1); g.add(spot, spot.target); s.headlight = spot; // 앞차·보행자를 비춤
    const beamTex = H.canvasTex(res, 'beam', 64, 128, ctx => { // 위 = 먼 쪽: 가운데가 밝고 멀수록·옆으로 갈수록 어두운 부채꼴
      for (let y = 0; y < 128; y++) { const t = 1 - y / 127, w = 10 + 54 * (1 - t), a = 0.55 * Math.min(1, t * 3) * (1 - t) ** 0.6;
        const gr = ctx.createLinearGradient(32 - w / 2, 0, 32 + w / 2, 0); gr.addColorStop(0, 'rgba(255,240,205,0)'); gr.addColorStop(0.5, `rgba(255,240,205,${a})`); gr.addColorStop(1, 'rgba(255,240,205,0)');
        ctx.fillStyle = gr; ctx.fillRect(0, y, 64, 1); }
    });
    const beam = new THREE.Mesh(H.unitPlane(res), H.cached(res.mat, 'beam', () => new THREE.MeshBasicMaterial({ map: beamTex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })));
    beam.scale.set(9, 30, 1); g.add(beam); s.beam = beam;
  }
  // 빗줄기 꼭짓점(선분 n개 = 꼭짓점 2n, xyz): 상자 x·z ∈ [-w/2, w/2], y ∈ [0, h], 길이 len, 아래로 살짝 기울어짐. seed 결정론
  function rainStreaks(n, w, h, len, seed = 1) {
    let r = seed >>> 0 || 1;
    const rnd = () => ((r = (Math.imul(r, 1664525) + 1013904223) >>> 0) / 4294967296);
    const out = new Float32Array(n * 6), dx = 0.12 * len, dy = -Math.sqrt(len * len - dx * dx);
    for (let i = 0; i < n; i++) {
      const x = (rnd() - .5) * w, z = (rnd() - .5) * w, y = -dy + rnd() * (h + dy);
      out.set([x, y, z, x + dx, y + dy, z], i * 6);
    }
    return out;
  }
  // 빗줄기 상자 2장을 위아래로 이어 두고, 매 프레임 위치만 옮긴다(꼭짓점 갱신 없음). 플레이어를 따라간다
  function rainFall(s, res, g) {
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(rainStreaks(RAIN.n, RAIN.box[0], RAIN.box[1], RAIN.len, 7), 3));
    res.geo.set('rain', geo);
    const mat = PP_RENDER.assets.cached(res.mat, 'rain', () => new THREE.LineBasicMaterial({ color: RAIN.streak, transparent: true, opacity: RAIN.opacity, depthWrite: false }));
    s.rainMeshes = [0, 1].map(() => { const m = new THREE.LineSegments(geo, mat); m.frustumCulled = false; g.add(m); return m; });
  }
  function rainUpdate(s, t, player) {
    const h = RAIN.box[1], off = (t * RAIN.fall) % h;
    s.rainMeshes.forEach((m, i) => m.position.set(player.x, i * h - off, -player.y));
  }
  // 차 등 색: 깜빡이·비상등(좌우 동시) > 브레이크(뒤) > 밤 전조등(앞)·미등(뒤) > 꺼짐. side 1 = 오른쪽(blink 1과 같은 부호)
  function lampColor(c, end, side, on, night) {
    if ((c.blink === side || c.hazard) && on) return K.yellow;
    if (end === -1 && c.braking) return K.red;
    return night ? (end === 1 ? NIGHT.headlight : NIGHT.tail) : K.off;
  }
  // 차마다 뒤·앞(end -1·1) × 왼쪽·오른쪽(side -1·1) 4등을 emit(i, car, end, side, color)로 넘기고 등 개수를 돌려준다
  function carLamps(cars, on, night, emit) {
    let li = 0;
    for (const c of cars) for (const end of [-1, 1]) for (const side of [-1, 1]) emit(li++, c, end, side, lampColor(c, end, side, on, night));
    return li;
  }
  function update(r, cars, peds, t, player) {
    const s=r.road, {pose,matrix,color}=s;
    s.visibleCars.length=0;
    const rad=s.carRadius||180;
    for(const c of cars) if(Math.hypot(c.x-player.x,c.y-player.y)<rad) s.visibleCars.push(c);
    s.visibleCars.sort((a,b)=>(a.x-player.x)**2+(a.y-player.y)**2-(b.x-player.x)**2-(b.y-player.y)**2);
    s.visibleCars.length=Math.min(40,s.visibleCars.length);
    const on=Math.floor(t*2)%2===0;
    if(s.night) nightUpdate(s,player);
    if(s.rainMeshes) rainUpdate(s,t,player);
    for(const {part,m} of s.batches) {
      m.count=s.visibleCars.length;
      s.visibleCars.forEach((c,i)=>{pose.position.set(c.x,0,-c.y);pose.rotation.set(0,c.th,0);pose.scale.set(1,1,1);pose.updateMatrix();matrix.multiplyMatrices(pose.matrix,part.m);m.setMatrixAt(i,matrix);});m.instanceMatrix.needsUpdate=true;
    }
    s.lamps.count=carLamps(s.visibleCars,on,s.night,(li,c,end,side,hex)=>{
      pose.position.set(c.x+Math.cos(c.th)*end*2.26+Math.sin(c.th)*side*.65,.78,-(c.y+Math.sin(c.th)*end*2.26-Math.cos(c.th)*side*.65));
      pose.rotation.set(0,c.th,0);pose.scale.set(.05,.14,.18);pose.updateMatrix();s.lamps.setMatrixAt(li,pose.matrix);
      color.setHex(hex);s.lamps.setColorAt(li,color);
    });s.lamps.instanceMatrix.needsUpdate=true;if(s.lamps.instanceColor)s.lamps.instanceColor.needsUpdate=true;
    s.ped.count=Math.min(peds.length,80);
    for(let i=0;i<s.ped.count;i++){const p=peds[i];pose.position.set(p.x,.85,-p.y);pose.rotation.set(0,p.th,0);pose.scale.set(.4,1.7,.4);pose.updateMatrix();s.ped.setMatrixAt(i,pose.matrix);}s.ped.instanceMatrix.needsUpdate=true;
    for(const {sig,post,bulbs} of s.signals) {
      const states=post.lanes.map(id=>PP_ROADS.signalState(s.net,t,sig.id,id));
      const st=states.includes('LG')?'LG':states.includes('G')?'G':states.includes('Y')?'Y':'R';
      bulbs.forEach((b,i)=>b.material.color.setHex(i===0&&(st==='R'||st==='LG')?K.red:i===1&&st==='Y'?K.yellow:i===bulbs.length-1&&st==='G'?K.green:bulbs.length===4&&i===2&&st==='LG'?K.green:K.off));
    }
  }
  function nightUpdate(s, player) {
    const pts = s.lampPts, near = s.lampNear || (s.lampNear = []);
    near.length = 0;
    const N = s.lampLights.length;
    for (const p of pts) { // 가장 가까운 N곳(작은 삽입 정렬)
      const d = (p.x-player.x)**2 + (p.y-player.y)**2;
      if (near.length === N && d >= near[N-1].d) continue;
      let i = Math.min(near.length, N-1); near[i] = { p, d };
      while (i > 0 && near[i-1].d > d) { [near[i-1], near[i]] = [near[i], near[i-1]]; i--; }
    }
    s.lampLights.forEach((l, i) => {
      const q = near[i]; l.intensity = q ? NIGHT.lampI : 0; if (!q) return; // visible을 바꾸면 빛 개수가 바뀌어 셰이더를 다시 컴파일한다
      l.position.set(q.p.x - Math.sin(q.p.th)*1.6, 6.6, -(q.p.y + Math.cos(q.p.th)*1.6));
    });
    const c = Math.cos(player.th), si = Math.sin(player.th), h = s.headlight;
    h.position.set(player.x + c*2.3, .75, -(player.y + si*2.3));
    h.target.position.set(player.x + c*40, 0, -(player.y + si*40));
    s.beam.position.set(player.x + c*17, .05, -(player.y + si*17)); s.beam.rotation.set(-Math.PI/2, 0, player.th - Math.PI/2); // 판의 +y(먼 쪽)가 진행 방향
  }
  return { load, update, lampColor, carLamps, lampPoints, rainStreaks, K, NIGHT, RAIN };
})();
if (typeof module !== 'undefined') module.exports = PP_RROAD;
