// 시내 도로: 정적 도색은 색별 병합, 차량은 부품별 인스턴싱(가까운 40대).
// Hallmark · pre-emit critique: P4 H4 E4 S5 R4 V4 · 기존 붕붕이 색/차량 시스템 계승.
const PP_RROAD = (function ppRoadRender() {
  const K = { asphalt: 0x383f47, ground: 0x75836f, white: 0xf2f0ea, yellow: 0xf2c230, blue: 0x327dda,
    steel: 0x707b83, dark: 0x20262d, red: 0xff3737, green: 0x36ed95, off: 0x303a3c,
    building: 0xc9b9a0, glass: 0x425869, tree: 0x527c45, trunk: 0x736450, skin: 0xe3b88d, pink: 0xf07aa8, guideGreen: 0x2fb36b };
  const CHUNK = 300; // 도색 병합 조각(m): 긴 고속도로도 frustum culling되도록
  // opts.highway: 시내 건물 대신 render-highway.js가 구조물을 놓는다. 바닥은 시야(600m)까지 넓힌다.
  function load(r, net, opts = {}) {
    PP_RENDER.clearMap(r);
    const H = PP_RENDER.assets, res = r.mapRes = H.makeRes(), g = r.mapGroup = new THREE.Group();
    r.scene.add(g); r.roadMode = true;
    r.map = { floors: [], ramps: [] };
    r.scene.background = new THREE.Color(H.COL.sky); r.scene.fog = new THREE.Fog(H.COL.sky, 140, 420);
    const state = { net, res, g, signals: [], obstacles: [], batches: [], visibleCars: [], matrix: new THREE.Matrix4(), pose: new THREE.Object3D(), color: new THREE.Color() };
    const box = (x, y, z, l, w, h, a, color) => {
      const m = new THREE.Mesh(H.unitBox(res), H.lam(res, color));
      m.position.set(x, z + h / 2, -y); m.scale.set(l, h, w); m.rotation.y = a; g.add(m); return m;
    };
    const points = net.areas.flatMap(a => a.pts), xs = points.map(p => p[0]), ys = points.map(p => p[1]), pad = opts.highway ? 600 : 100;
    const x0 = Math.min(...xs) - pad, x1 = Math.max(...xs) + pad, y0 = Math.min(...ys) - pad, y1 = Math.max(...ys) + pad;
    box((x0+x1)/2, (y0+y1)/2, -0.15, x1-x0, y1-y0, 0.1, 0, K.ground);
    for (const area of net.areas) {
      const s = new THREE.Shape(); area.pts.forEach(([x,y], i) => i ? s.lineTo(x,y) : s.moveTo(x,y)); s.closePath();
      const geo = new THREE.ShapeGeometry(s); geo.rotateX(-Math.PI/2); res.geo.set('area'+res.geo.size, geo);
      const m = new THREE.Mesh(geo, H.lam(res, K.asphalt)); g.add(m);
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
      const mat = new THREE.MeshBasicMaterial({ map:tex, transparent:true, side:THREE.DoubleSide }); res.mat.set('tex'+res.mat.size,mat);
      const m = new THREE.Mesh(H.unitPlane(res),mat); m.scale.set(width,height,1); return m;
    }
    const css = c => '#'+c.toString(16).padStart(6,'0');
    for (const mark of net.marks) {
      if (mark.kind === 'gap-check') continue; // render-highway.js
      const tex = texture('mark'+(mark.arrow || mark.text), ctx => {
        ctx.fillStyle=css(K.white); ctx.strokeStyle=css(K.white); ctx.lineWidth=18; ctx.lineJoin='miter';
        if (mark.kind==='text') { ctx.font='bold 56px sans-serif';ctx.textAlign='center';ctx.fillText(mark.text,128,150);return; }
        ctx.beginPath();ctx.moveTo(128,235);ctx.lineTo(128,110);ctx.stroke();
        const arrow = (x,y) => {ctx.beginPath();ctx.moveTo(128,150);ctx.lineTo(x,y);ctx.stroke();const a=Math.atan2(y-150,x-128);ctx.beginPath();ctx.moveTo(x,y);ctx.lineTo(x-42*Math.cos(a-.6),y-42*Math.sin(a-.6));ctx.lineTo(x-42*Math.cos(a+.6),y-42*Math.sin(a+.6));ctx.fill();};
        if(mark.arrow.includes('straight')) arrow(128,25);
        if(mark.arrow.includes('left') || mark.arrow==='uturn') arrow(35,110);
        if(mark.arrow.includes('right')) arrow(221,110);
      });
      const m=plane(tex,2,4); m.rotation.set(-Math.PI/2,0,mark.a-Math.PI/2);m.position.set(mark.x,.035,-mark.y);g.add(m);
    }
    for (const sign of net.signs) {
      if (sign.kind === 'overhead') continue; // 차로 위 문형 안내판: render-highway.js (기둥은 노면 밖, 차로에 충돌 상자 없음)
      const tex=texture('sign'+sign.kind+sign.limit,ctx=>{
        ctx.fillStyle=css(K.white);ctx.fillRect(0,0,256,256);ctx.textAlign='center';ctx.textBaseline='middle';
        if(sign.kind==='limit') {ctx.strokeStyle=css(K.red);ctx.lineWidth=22;ctx.beginPath();ctx.arc(128,128,108,0,Math.PI*2);ctx.stroke();ctx.fillStyle=css(K.dark);ctx.font='bold 100px sans-serif';ctx.fillText(sign.limit,128,133);}
        else if(sign.kind==='min-speed') {ctx.fillStyle=css(K.blue);ctx.beginPath();ctx.arc(128,128,118,0,Math.PI*2);ctx.fill();ctx.fillStyle=css(K.white);ctx.font='bold 96px sans-serif';ctx.fillText(sign.limit,128,118);ctx.fillRect(68,178,120,12);}
        else {ctx.fillStyle=css(K.blue);ctx.fillRect(6,6,244,244);ctx.fillStyle=css(K.white);ctx.font='bold 40px sans-serif';ctx.fillText(sign.kind==='camera'?'과속 단속':sign.kind==='bus-lane'?'버스전용':'비보호',128,128);}
      });
      box(sign.x,sign.y,0,.1,.1,2.8,0,K.steel);
      const m=plane(tex,1.1,1.1);m.position.set(sign.x,2.8,-sign.y);m.rotation.y=sign.a-Math.PI/2;g.add(m);
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
    // 도로에서 충분히 떨어진 블록만 생성: 교차로·다른 도로 위 건물 방지.
    if(!opts.highway) for(let x=x0+35;x<x1-25;x+=38) for(let y=y0+35;y<y1-25;y+=38) {
      const p=PP_ROADS.project(net,x,y); if(p.dist<22 || p.dist>65) continue;
      const h=8+Math.abs(Math.sin(x*3+y))*16;
      box(x,y,0,16,20,h,0,K.building);box(x,y,3,16.1,20.1,h-5,0,K.glass);
      state.obstacles.push({x,y,l:16,w:20,a:0});
      box(x+12,y,0,.5,.5,3,0,K.trunk);box(x+12,y,2.5,3.5,3.5,3.5,0,K.tree);
    }
    const parts=H.carParts(res,{L:4.5,W:1.8,H:1.55,ra:-1.3,fa:1.35,tw:.77,cowl:.75}).parts;
    for(const part of parts) {
      const m=new THREE.InstancedMesh(part.geo,H.carPartMat(res,part.k,K.white),40);m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);m.frustumCulled=false;m.count=0;g.add(m);state.batches.push({part,m});
    }
    const lamps = new THREE.InstancedMesh(H.unitBox(res),H.basic(res,K.white),160);lamps.instanceMatrix.setUsage(THREE.DynamicDrawUsage);lamps.frustumCulled=false;g.add(lamps);state.lamps=lamps;
    const ped = new THREE.InstancedMesh(H.unitBox(res),H.lam(res,K.blue),80);ped.frustumCulled=false;g.add(ped);state.ped=ped;
    r.road=state;return state;
  }
  function update(r, cars, peds, t, player) {
    const s=r.road, {pose,matrix,color}=s;
    s.visibleCars.length=0;
    const rad=s.carRadius||180;
    for(const c of cars) if(Math.hypot(c.x-player.x,c.y-player.y)<rad) s.visibleCars.push(c);
    s.visibleCars.sort((a,b)=>(a.x-player.x)**2+(a.y-player.y)**2-(b.x-player.x)**2-(b.y-player.y)**2);
    s.visibleCars.length=Math.min(40,s.visibleCars.length);
    const on=Math.floor(t*2)%2===0;
    for(const {part,m} of s.batches) {
      m.count=s.visibleCars.length;
      s.visibleCars.forEach((c,i)=>{pose.position.set(c.x,0,-c.y);pose.rotation.set(0,c.th,0);pose.scale.set(1,1,1);pose.updateMatrix();matrix.multiplyMatrices(pose.matrix,part.m);m.setMatrixAt(i,matrix);});m.instanceMatrix.needsUpdate=true;
    }
    let li=0;
    for(const c of s.visibleCars) for(const end of [-1,1]) for(const side of [-1,1]) {
      const blink=(c.blink===side||c.hazard)&&on, brake=end===-1&&c.braking; // hazard = 비상등: 좌우 동시
      pose.position.set(c.x+Math.cos(c.th)*end*2.26+Math.sin(c.th)*side*.65,.78,-(c.y+Math.sin(c.th)*end*2.26-Math.cos(c.th)*side*.65));
      pose.rotation.set(0,c.th,0);pose.scale.set(.05,.14,.18);pose.updateMatrix();s.lamps.setMatrixAt(li,pose.matrix);
      color.setHex(blink?K.yellow:brake?K.red:K.off);s.lamps.setColorAt(li++,color);
    }
    s.lamps.count=li;s.lamps.instanceMatrix.needsUpdate=true;if(s.lamps.instanceColor)s.lamps.instanceColor.needsUpdate=true;
    s.ped.count=Math.min(peds.length,80);
    for(let i=0;i<s.ped.count;i++){const p=peds[i];pose.position.set(p.x,.85,-p.y);pose.rotation.set(0,p.th,0);pose.scale.set(.4,1.7,.4);pose.updateMatrix();s.ped.setMatrixAt(i,pose.matrix);}s.ped.instanceMatrix.needsUpdate=true;
    for(const {sig,post,bulbs} of s.signals) {
      const states=post.lanes.map(id=>PP_ROADS.signalState(s.net,t,sig.id,id));
      const st=states.includes('LG')?'LG':states.includes('G')?'G':states.includes('Y')?'Y':'R';
      bulbs.forEach((b,i)=>b.material.color.setHex(i===0&&(st==='R'||st==='LG')?K.red:i===1&&st==='Y'?K.yellow:i===bulbs.length-1&&st==='G'?K.green:bulbs.length===4&&i===2&&st==='LG'?K.green:K.off));
    }
  }
  return { load, update };
})();
