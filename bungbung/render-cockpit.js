// 운전석 전용 레이어 3: 대시보드·계기판 덮개·핸들·A필러·천장 끝. 미러는 2D 창(render.js).
// 좌표는 차 기준(x 앞, y 왼쪽, z 위) → three (x, z, -y). 치수는 셀토스 실내 근사치.
const PP_COCKPIT = (function ppCockpit() {
  function build(r,spec) {
    const H=PP_RENDER.assets,res=r.carRes,g=new THREE.Group(),d=spec.driver;
    r.carGroup.add(g);r.cockpit=g;
    const v=(x,y,z)=>new THREE.Vector3(x,z,-y), Z=new THREE.Vector3(0,0,1);
    const box=(x,y,z,l,w,h,color,parent=g)=>{const m=new THREE.Mesh(H.unitBox(res),H.lam(res,color));m.position.copy(v(x,y,z));m.scale.set(l,h,w);parent.add(m);return m;};
    // a→b 막대(필러)
    const bar=(a,b,t,color)=>{const A=v(...a),B=v(...b),m=new THREE.Mesh(H.unitBox(res),H.lam(res,color));
      m.position.copy(A).add(B).multiplyScalar(.5);m.quaternion.setFromUnitVectors(Z,B.clone().sub(A).normalize());m.scale.set(t,t,A.distanceTo(B));g.add(m);};
    const dashX=d.x+.75, dashL=.5, top=1.04;                                    // 대시보드 앞끝 ≈ 시선 16° 아래
    box(dashX+dashL/2-.15,0,top-.3,dashL+.3,1.62,.6,H.COL.dash);                // 아래로 길게: 바깥 차체가 비치지 않게
    box(dashX+dashL/2,0,top-.01,dashL,1.62,.03,H.COL.trim);                    // 윗면 밝은 패드: 앞유리 경계가 보이게
    box(dashX+.15,d.y,top+.04,.25,.36,.08,H.COL.dash);                          // 계기판 덮개: 핸들 테 바로 위로 보임
    for(const side of [-1,1]) {
      bar([dashX+dashL,side*.8,top],[d.x+.7,side*.72,1.62],.05,H.COL.aPillar);  // A필러
      box(d.x+.1,side*.84,top-.14,2.4,.14,.24,H.COL.dash);                    // 도어 윗선: 바깥 차체 윗면을 가림
    }
    box(d.x+.22,0,1.62,.96,1.5,.04,H.COL.headliner);                          // 천장 앞끝: 화면 위 얇은 띠
    // 핸들: 가슴 쪽을 바라보도록 기울임. 바깥 그룹 = 기울기, r.steering = 회전.
    const mount=new THREE.Group(),c=v(d.x+.67,d.y,.93);mount.position.copy(c);
    mount.quaternion.setFromRotationMatrix(new THREE.Matrix4().lookAt(v(d.x,d.y,1.25),c,new THREE.Vector3(0,1,0)));g.add(mount); // 12시가 위로
    const steering=new THREE.Group();mount.add(steering);r.steering=steering;
    const ring=new THREE.Mesh(H.cached(res.geo,'steering',()=>new THREE.TorusGeometry(.19,.028,10,40)),H.lam(res,H.COL.dark));steering.add(ring);
    const hub=new THREE.Mesh(H.unitBox(res),H.lam(res,H.COL.trim));hub.scale.set(.12,.09,.05);steering.add(hub);
    for(const a of [0,Math.PI,-Math.PI/2]) {const s=new THREE.Mesh(H.unitBox(res),H.lam(res,H.COL.dark));
      s.scale.set(.17,.035,.025);s.position.set(Math.cos(a)*.1,Math.sin(a)*.1,0);s.rotation.z=a;steering.add(s);}
    const mark=new THREE.Mesh(H.unitBox(res),H.basic(res,H.COL.yellow));mark.scale.set(.03,.03,.035);mark.position.set(0,.19,0);steering.add(mark); // 12시 표시
    r.blinkLights=[];
    for(const end of [-spec.rearOverhang-.02, spec.length-spec.rearOverhang+.02]) for(const side of [-1,1]) {
      const lamp=new THREE.Mesh(H.unitBox(res),H.basic(res,H.COL.yellow));
      lamp.position.set(end,.77,side*spec.width*.4);lamp.scale.set(.05,.15,.2);
      lamp.userData.side=side;lamp.visible=false;r.carGroup.add(lamp);r.blinkLights.push(lamp);
    }
    g.traverse(o=>o.layers.set(3));r.camDriver.layers.enable(3);
  }
  return { build };
})();
