// 주행 안내·진행 방향 기준 미니맵·음성·감점 알림. 기존 HUD와 색 토큰 공유.
const PP_NAVUI = (function ppNavUI() {
  const ARROW = { left:'↰', right:'↱', uturn:'↶', 'lane-left':'↖', 'lane-right':'↗', arrive:'⚑', exit:'↗', rest:'↗', 'jc-left':'↖', 'jc-right':'↗', toll:'⇧' };
  const NAME = { left:'좌회전', right:'우회전', uturn:'유턴', 'lane-left':'왼쪽 차로', 'lane-right':'오른쪽 차로', arrive:'목적지', exit:'출구', rest:'휴게소', 'jc-left':'분기 왼쪽', 'jc-right':'분기 오른쪽', toll:'톨게이트' };
  // 최신 안내 하나만 대기: 오래된 거리 안내가 쌓여 뒤늦게 발화하지 않는다.
  function voiceQueue(engine, Utterance) {
    let enabled=true, unlocked=false, pending=null;
    function cancel() { try { if(engine) engine.cancel(); } catch(e) { /* 화면 안내 유지 */ } }
    function flush() {
      if(!enabled || !unlocked || !pending || !engine || !Utterance) return;
      const text=pending; pending=null;
      try { cancel(); const u=new Utterance(text);u.lang='ko-KR';u.rate=1.05;
        const v=engine.getVoices && engine.getVoices().find(x=>x.lang.startsWith('ko'));if(v)u.voice=v;engine.speak(u);
      } catch(e) { /* 지원되지 않거나 차단된 환경 */ }
    }
    return { say(text){if(!text || !enabled)return;pending=text;flush();}, unlock(){unlocked=true;flush();},
      stop(){pending=null;cancel();}, enable(value){enabled=value;if(!value){pending=null;cancel();}} };
  }
  // ponytail: 시내 1.25px/m, 고속도로는 진행 방향 약 500m가 보이도록 0.28px/m
  const MAP_SCALE_CITY=1.25,MAP_SCALE_HIGHWAY=0.28;
  const text = (el,value) => { if(el.textContent!==String(value))el.textContent=value; };
  function create(root) {
    const ids=['nav-arrow','nav-distance','nav-turn','nav-lanes','nav-camera','nav-map','nav-limit','drive-toast','blink-left','blink-right','hazard'];
    const ui={root,els:{},laneKey:'',route:null,net:null,lastMap:-Infinity,toastUntil:0,toastQueue:[],lastTick:null,lastWarning:-Infinity};
    for(const id of ids)ui.els[id]=root.getElementById(id);
    ui.ctx=ui.els['nav-map'].getContext('2d');
    ui.voice=voiceQueue(window.speechSynthesis,window.SpeechSynthesisUtterance);
    const style=getComputedStyle(document.documentElement);
    ui.colors={};for(const [key,token] of Object.entries({bg:'--color-panel-solid',road:'--color-faint',route:'--color-accent',car:'--color-ink',goal:'--color-ok'}))ui.colors[key]=style.getPropertyValue(token).trim();
    return ui;
  }
  function reset(ui,d) {
    ui.voice.stop();ui.toastQueue=[];ui.toastUntil=0;ui.els['drive-toast'].hidden=true;ui.laneKey='';ui.route=null;ui.lastMap=-Infinity;ui.lastTick=null;ui.lastWarning=-Infinity;
    ui.net=d.net;ui.roadPath=new Path2D();
    for(const area of d.net.areas) {area.pts.forEach(([x,y],i)=>i?ui.roadPath.lineTo(x,-y):ui.roadPath.moveTo(x,-y));ui.roadPath.closePath();}
    ui.voice.say(d.guide && d.guide.say);
  }
  function consume(ui,d,events) {
    for(const event of events)ui.toastQueue.push(event);
    for(const say of d.speech.splice(0))ui.voice.say(say);
  }
  function map(ui,d) {
    const c=ui.ctx,w=c.canvas.width,h=c.canvas.height,p=d.player,mapScale=d.mission.highway?MAP_SCALE_HIGHWAY:MAP_SCALE_CITY,lw=MAP_SCALE_CITY/mapScale;
    c.clearRect(0,0,w,h);c.fillStyle=ui.colors.bg;c.fillRect(0,0,w,h);
    if(ui.route!==d.route) {
      ui.route=d.route;ui.routePath=new Path2D();
      if(d.route) for(const step of d.route.steps) {
        const lane=d.net.lanes[step.laneId], start=PP_ROADS.pointAt(lane,step.s0);
        ui.routePath.moveTo(start.x,-start.y);
        for(let s=step.s0+4;s<step.s1;s+=4){const q=PP_ROADS.pointAt(lane,s);ui.routePath.lineTo(q.x,-q.y);}
        const end=PP_ROADS.pointAt(lane,step.s1);ui.routePath.lineTo(end.x,-end.y);
      }
    }
    c.save();c.translate(w/2,h*.72);c.rotate(p.th-Math.PI/2);c.scale(mapScale,mapScale);c.translate(-p.x,p.y);
    c.fillStyle=ui.colors.road;c.fill(ui.roadPath);c.strokeStyle=ui.colors.route;c.lineWidth=3*lw;c.lineJoin='round';c.stroke(ui.routePath);
    const goal=PP_ROADS.pointAt(d.net.lanes[d.mission.goal.laneId],d.mission.goal.s);
    c.beginPath();c.arc(goal.x,-goal.y,5*lw,0,Math.PI*2);c.fillStyle=ui.colors.goal;c.fill();c.restore();
    c.fillStyle=ui.colors.car;c.strokeStyle=ui.colors.bg;c.lineWidth=2;c.beginPath();c.moveTo(w/2,h*.72-9);c.lineTo(w/2-7,h*.72+7);c.lineTo(w/2,h*.72+3);c.lineTo(w/2+7,h*.72+7);c.closePath();c.fill();c.stroke();
  }
  function update(ui,d,audio) {
    const g=d.guide,n=g && g.next,els=ui.els;
    text(els['nav-arrow'],n?ARROW[n.kind]:'↑');text(els['nav-distance'],n?(n.dist>=1000?(n.dist/1000).toFixed(1)+'km':Math.round(n.dist)+'m'):'경로 확인');
    text(els['nav-turn'],n?(n.name?n.name+' ':'')+NAME[n.kind]:d.route?'안내 차로로 이동하세요':'안내 가능한 도로로 돌아가세요');
    const hint=n && n.laneHint,key=JSON.stringify(hint);
    if(key!==ui.laneKey) {
      ui.laneKey=key;els['nav-lanes'].textContent='';
      if(hint)for(let i=0;i<hint.count;i++){const e=document.createElement('span');e.textContent='↑';e.className=hint.ok.includes(i)?'is-ok':'';e.setAttribute('aria-label',(i+1)+'차로'+(hint.ok.includes(i)?' 이용':''));els['nav-lanes'].append(e);}
    }
    const limit=g && g.limit || d.net.lanes[d.player.laneId].limit;
    text(els['nav-limit'],limit || '—');els['nav-limit'].classList.toggle('is-over',Math.abs(d.car.v)*3.6>limit*1.1);
    text(els['nav-camera'],g && g.camera?'단속 '+Math.round(g.camera.dist)+'m':'');els['nav-camera'].hidden=!(g && g.camera);
    const on=Math.floor(d.t*2)%2===0;
    for(const [id,dir] of [['blink-left',-1],['blink-right',1]]) {els[id].classList.toggle('is-lit',d.blink===dir&&on);els[id].setAttribute('aria-pressed',String(d.blink===dir));}
    els.hazard.setAttribute('aria-pressed',String(!!d.hazard));
    const tick=d.blink?Math.floor(d.t*2):null;
    if(tick!==null && tick!==ui.lastTick)PP_AUDIO.tick(audio);ui.lastTick=tick;
    if(Math.abs(d.car.v)*3.6>limit*1.1 && d.t-ui.lastWarning>3){PP_AUDIO.warning(audio);ui.lastWarning=d.t;}
    if(d.t>=ui.toastUntil && ui.toastQueue.length) {const e=ui.toastQueue.shift();text(els['drive-toast'],e.text);ui.toastUntil=d.t+4;els['drive-toast'].hidden=false;}
    else if(d.t>=ui.toastUntil)els['drive-toast'].hidden=true;
    if(d.t-ui.lastMap>=.1 || ui.lastMap===-Infinity){map(ui,d);ui.lastMap=d.t;}
  }
  function mirrors(ui,r,active) {
    const driver=active && r.view==='driver';
    for(const [i,side] of ['left','right'].entries()) {
      const el=ui.root.getElementById('mirror-'+side);el.hidden=!driver;if(!driver)continue;
      const m=r.mirrors[i].glass,w=m.scale.x,h=m.scale.y,x=m.position.x-w/2,y=r.h-m.position.y-h/2;
      el.style.left=Math.max(0,Math.min(r.w-48,x))+'px';el.style.top=Math.max(0,Math.min(r.h-48,y))+'px';el.style.width=Math.max(48,Math.min(w,r.w-x))+'px';el.style.height=Math.max(48,h)+'px';
    }
  }
  return { voiceQueue, create, reset, consume, update, mirrors };
})();
if(typeof module!=='undefined')module.exports=PP_NAVUI;
