import * as THREE from 'three';
import {RoundedBoxGeometry} from './vendor/RoundedBoxGeometry.js';
import {RoomEnvironment} from './vendor/RoomEnvironment.js';
import {createStickyNote,createPillLibrary} from './organizer-objects.js?v=sticky-pills-6';

// This model is procedural geometry. No reference image is used as a flat 3D substitute.
export async function initScene(){
  const host=document.getElementById('scene');
  const motion=matchMedia('(prefers-reduced-motion: reduce)');
  const renderer=new THREE.WebGLRenderer({antialias:true,alpha:true,powerPreference:'low-power'});
  renderer.setPixelRatio(Math.min(devicePixelRatio,1.6));
  renderer.setClearColor(0x000000,0);
  renderer.outputColorSpace=THREE.SRGBColorSpace;
  renderer.toneMapping=THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure=.88;
  renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
  host.append(renderer.domElement);renderer.domElement.setAttribute('aria-hidden','true');
  const scene=new THREE.Scene(),camera=new THREE.PerspectiveCamera(34,1,.1,150);
  const pmrem=new THREE.PMREMGenerator(renderer),room=new RoomEnvironment();
  scene.environment=pmrem.fromScene(room,.04).texture;room.dispose();pmrem.dispose();
  const ambient=new THREE.HemisphereLight(0xffffff,0xb1c7d7,.85);scene.add(ambient);
  const key=new THREE.DirectionalLight(0xfffaf0,2.3);key.position.set(-7,12,7);key.castShadow=true;
  key.shadow.mapSize.set(1024,1024);Object.assign(key.shadow.camera,{left:-9,right:9,top:10,bottom:-10,near:.5,far:40});key.shadow.bias=-.001;key.shadow.normalBias=.035;key.shadow.radius=4;scene.add(key);
  const fill=new THREE.DirectionalLight(0xc3dffc,.85);fill.position.set(6,7,-6);scene.add(fill);
  const organizer=new THREE.Group();scene.add(organizer);
  const colors=[0xa9ca81,0x92bbd8,0xe69d8b,0xe9c64d,0x8dc7a5,0x80b2d9,0xd3a0b8];
  const schedule=window.AnbanSchedule;
  let currentWeek=schedule.getSnapshot().week;
  const plastic=(color,opacity=.46)=>new THREE.MeshPhysicalMaterial({color,roughness:.19,metalness:0,transparent:true,opacity,depthWrite:false,clearcoat:1,clearcoatRoughness:.13,envMapIntensity:.65,side:THREE.FrontSide});
  const frosted=color=>new THREE.MeshPhysicalMaterial({color,roughness:.3,metalness:0,clearcoat:.8,clearcoatRoughness:.2,envMapIntensity:.55});
  const clear=plastic(0xe7f5ff,.21),edge=frosted(0xe1edf2),bottomMat=frosted(0xc7dce7);
  const shadowMat=new THREE.ShadowMaterial({opacity:.12});
  const ground=new THREE.Mesh(new THREE.PlaneGeometry(80,80),shadowMat);ground.rotation.x=-Math.PI/2;ground.position.y=-.095;ground.receiveShadow=true;scene.add(ground);
  const pillLibrary=createPillLibrary();
  const geometryCache=new Map();
  function rounded(w,h,d,r=.16){const k=[w,h,d,r].join(',');if(!geometryCache.has(k))geometryCache.set(k,new RoundedBoxGeometry(w,h,d,3,r));return geometryCache.get(k);}
  function block(parent,w,h,d,mat,x=0,y=0,z=0,r=.1){const o=new THREE.Mesh(rounded(w,h,d,r),mat);o.position.set(x,y,z);parent.add(o);return o;}
  function rect(path,w,d,r){const x=-w/2,z=-d/2;path.moveTo(x+r,z);path.lineTo(x+w-r,z);path.quadraticCurveTo(x+w,z,x+w,z+r);path.lineTo(x+w,z+d-r);path.quadraticCurveTo(x+w,z+d,x+w-r,z+d);path.lineTo(x+r,z+d);path.quadraticCurveTo(x,z+d,x,z+d-r);path.lineTo(x,z+r);path.quadraticCurveTo(x,z,x+r,z);return path;}
  function ring(w,d,h,r,t,material){const cacheKey='ring:'+ [w,d,h,r,t].join(',');if(geometryCache.has(cacheKey))return new THREE.Mesh(geometryCache.get(cacheKey),material);const shape=rect(new THREE.Shape(),w,d,r);shape.holes.push(rect(new THREE.Path(),w-2*t,d-2*t,Math.max(.02,r-t)));const geo=new THREE.ExtrudeGeometry(shape,{depth:h,bevelEnabled:true,bevelSize:.025,bevelThickness:.025,bevelSegments:2,curveSegments:8,steps:1});geo.rotateX(-Math.PI/2);geometryCache.set(cacheKey,geo);return new THREE.Mesh(geo,material);}
  const tray=block(organizer,10.7,.19,6.7,bottomMat,0,.04,0,.18);tray.receiveShadow=true;
  const outside=ring(10.7,6.7,.78,.5,.12,clear);outside.position.y=.13;organizer.add(outside);
  const outerRim=ring(10.74,6.74,.065,.5,.12,edge);outerRim.position.y=.94;organizer.add(outerRim);
  // Lid rotates about an actual hinge along the back edge of the carry case.
  const largeHinge=new THREE.Group();largeHinge.position.set(0,1.10,-3.37);organizer.add(largeHinge);
  const largeLid=block(largeHinge,10.7,.08,6.7,plastic(0xe2f1fc,.11),0,0,3.35,.2);largeLid.receiveShadow=true;
  const largeRim=ring(10.7,6.7,.09,.5,.115,edge);largeRim.position.set(0,0,3.35);largeHinge.add(largeRim);
  for(const x of [-3.8,3.8]){const h=new THREE.Mesh(new THREE.CylinderGeometry(.12,.12,.7,16),edge);h.rotation.z=Math.PI/2;h.position.set(x,1.10,-3.37);organizer.add(h);}
  block(largeHinge,1.15,.17,.26,edge,0,-.03,6.72,.07);
  block(organizer,1.15,.26,.16,edge,0,.82,3.43,.06);
  const sticky=createStickyNote(largeHinge,renderer),noteAccess=document.getElementById('medicineNoteAccess');
  const groups=[],hinges=[],targets=[],pickables=[],labels=[],contents=[];
  function labelTexture(day,meal){
    const cv=document.createElement('canvas');cv.width=256;cv.height=320;const c=cv.getContext('2d');
    c.strokeStyle='#344f60';c.fillStyle='#344f60';c.lineWidth=4;c.lineCap='round';
    const cx=128,cy=61;
    if(meal<2){c.beginPath();c.arc(cx,cy,20,0,Math.PI*2);c.stroke();for(let j=0;j<8;j++){const a=j*Math.PI/4;c.beginPath();c.moveTo(cx+29*Math.cos(a),cy+29*Math.sin(a));c.lineTo(cx+39*Math.cos(a),cy+39*Math.sin(a));c.stroke();}}
    else{c.beginPath();c.arc(122,82,29,.45,Math.PI*1.7);c.quadraticCurveTo(113,90,148,100);c.stroke();c.beginPath();c.arc(163,62,3,0,Math.PI*2);c.fill();}
    const d=currentWeek.days[day],slot=d.slots[meal];
    c.textAlign='center';c.font='600 42px sans-serif';c.fillText(d.shortDate,128,151);
    c.font='500 38px sans-serif';c.fillText(d.label+' · '+slot.label,128,207);
    c.font='500 36px sans-serif';c.fillText(slot.meds.length?slot.meds.length+'种药':'空',128,263);
    const t=new THREE.CanvasTexture(cv);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=renderer.capabilities.getMaxAnisotropy();return t;
  }
  for(let d=0;d<7;d++){
    const column=new THREE.Group();column.position.set((d-3)*1.46,.13,0);organizer.add(column);groups.push(column);
    const tinted=frosted(colors[d]),lidMat=plastic(colors[d],.14);
    for(let m=0;m<3;m++){
      const cell=new THREE.Group();cell.position.z=(m-1)*2.05;column.add(cell);
      const base=block(cell,1.34,.12,1.78,tinted,0,.09,0,.19);base.receiveShadow=true;
      const wall=ring(1.34,1.78,.5,.24,.075,tinted);wall.position.y=.1;cell.add(wall);
      const rim=ring(1.38,1.82,.06,.24,.075,edge);rim.position.y=.59;cell.add(rim);
      const medicineGroup=new THREE.Group();cell.add(medicineGroup);
      contents.push({day:d,meal:m,group:medicineGroup,markers:[],signature:''});
      const hinge=new THREE.Group();hinge.position.set(0,.73,-.88);cell.add(hinge);
      const cover=block(hinge,1.39,.085,1.83,lidMat,0,0,.88,.2);
      const rim2=ring(1.39,1.83,.045,.25,.065,edge);rim2.position.set(0,0,.88);hinge.add(rim2);
      const label=new THREE.Mesh(new THREE.PlaneGeometry(1.08,1.38),new THREE.MeshBasicMaterial({map:labelTexture(d,m),transparent:true,depthWrite:false,alphaTest:.02,side:THREE.FrontSide,opacity:.95}));label.rotation.x=-Math.PI/2;label.position.set(0,.055,.84);hinge.add(label);labels.push({label,day:d,meal:m});
      block(hinge,.38,.12,.14,edge,0,-.012,1.82,.04);
      for(const hx of [-.42,.42]){const h=new THREE.Mesh(new THREE.CylinderGeometry(.07,.07,.19,12),edge);h.rotation.z=Math.PI/2;h.position.set(hx,.70,-.9);cell.add(h);}
      const hit=new THREE.Mesh(new THREE.BoxGeometry(1.39,.7,1.83),new THREE.MeshBasicMaterial({visible:false}));hit.position.y=.4;hit.userData={day:d,meal:m};cell.add(hit);pickables.push(hit);hinges.push({object:hinge,day:d,meal:m});
      targets.push({cell,day:d,meal:m});
    }
  }
  // A soft contact shadow keeps the transparent case grounded without a heavy black slab.
  const sc=document.createElement('canvas');sc.width=512;sc.height=512;const ctx=sc.getContext('2d'),grad=ctx.createRadialGradient(256,256,45,256,256,248);grad.addColorStop(0,'rgba(47,82,109,.24)');grad.addColorStop(.55,'rgba(47,82,109,.13)');grad.addColorStop(1,'rgba(47,82,109,0)');ctx.fillStyle=grad;ctx.fillRect(0,0,512,512);
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(14,11),new THREE.MeshBasicMaterial({map:new THREE.CanvasTexture(sc),transparent:true,depthWrite:false}));shadow.rotation.x=-Math.PI/2;shadow.position.y=-.08;scene.add(shadow);
  let selected=-1,selectedMeal=-1,coverOpen=true,workspace=false;
  let yaw=-.44,targetYaw=-.44,tilt=.77,targetTilt=.77,zoom=1,targetZoom=1;
  let lidAngle=0,targetLid=-1.5,intro=motion.matches?1:0,frame=0,last=0,alive=true;
  let focus=new THREE.Vector3(0,1.4,-.45),targetFocus=focus.clone();
  let width=innerWidth,height=innerHeight,expanded=false,spread=0;
  let viewport={x:0,y:0,w:innerWidth,h:innerHeight};
  const lidButton=document.getElementById('lidToggle');

  function resize(){width=host.clientWidth;height=host.clientHeight;camera.clearViewOffset();renderer.setSize(width,height);wake();}
  function wake(){if(!frame&&alive&&!document.hidden)frame=requestAnimationFrame(tick);}
  function tick(now){
    frame=0;const dt=Math.min(.25,last?(now-last)/1000:.016);last=now;
    const ease=motion.matches?1:1-Math.exp(-dt/ .22),slow=motion.matches?1:1-Math.exp(-dt/.36);
    yaw+=(targetYaw-yaw)*slow;tilt+=(targetTilt-tilt)*slow;zoom+=(targetZoom-zoom)*slow;
    lidAngle+=(targetLid-lidAngle)*slow;intro+=(1-intro)*slow;focus.lerp(targetFocus,slow);
    spread+=((expanded?1:0)-spread)*slow;
    const stage=document.getElementById('organizerStage').getBoundingClientRect(),origin=host.getBoundingClientRect();
    viewport={x:(stage.left-origin.left)*spread,y:(stage.top-origin.top)*spread,w:width+(stage.width-width)*spread,h:height+(stage.height-height)*spread};
    camera.aspect=viewport.w/viewport.h;camera.updateProjectionMatrix();
    renderer.setViewport(viewport.x,height-viewport.y-viewport.h,viewport.w,viewport.h);
    largeHinge.rotation.x=lidAngle;
    organizer.rotation.y=yaw;organizer.position.y=-.2+(1-intro)*.7;
    const margin=width<600? .9: .78;
    const horizontalFit=12.7/(2*Math.tan(THREE.MathUtils.degToRad(17))*camera.aspect*margin);
    const verticalFit=(11.8-3*spread)/(2*Math.tan(THREE.MathUtils.degToRad(17))*((height<600?.69:.64)+.22*spread));
    const dist=Math.max(horizontalFit,verticalFit)/zoom;
    camera.position.set(focus.x,focus.y+dist*Math.sin(tilt),focus.z+dist*Math.cos(tilt));camera.lookAt(focus);
    let moving=Math.abs(targetYaw-yaw)+Math.abs(targetTilt-tilt)+Math.abs(targetZoom-zoom)+Math.abs(targetLid-lidAngle)+(1-intro)+focus.distanceTo(targetFocus)+Math.abs((expanded?1:0)-spread)>.001;
    // Individual compartments remain seated and closed at every view angle.
    for(const h of hinges)h.object.rotation.x=0;
    for(const entry of contents)for(const pill of entry.markers){
      const u=pill.userData;u.arriving=motion.matches?0:u.arriving*Math.exp(-dt/.2);
      pill.position.y=u.restY+.08*u.arriving;pill.scale.setScalar(1-.3*u.arriving);
      if(u.arriving>.001)moving=true;
    }
    if(sticky.tick(dt,motion.matches))moving=true;
    renderer.render(scene,camera);
    const noteBounds=sticky.project(camera,width,height);
    noteAccess.hidden=!noteBounds.visible||lidAngle>-.35;
    if(!noteAccess.hidden){
      Object.assign(noteAccess.style,{left:noteBounds.left+'px',top:noteBounds.top+'px',width:(noteBounds.right-noteBounds.left)+'px',height:(noteBounds.bottom-noteBounds.top)+'px'});
    }
    if(moving)wake();else last=0;
  }
  function select(day,meal=-1){
    schedule.select(currentWeek.days[day].date,meal<0?null:schedule.periods[meal].id);
    window.dispatchEvent(new CustomEvent('anban:open-day',{detail:{...schedule.getSnapshot().selection}}));
  }

  function syncSchedule({week,selection,inventory=[]}){
    if(!alive)return;
    currentWeek=week;sticky.paint(inventory);noteAccess.setAttribute('aria-label','查看药品便利贴，已录入 '+inventory.length+' 种');
    if(syncSchedule.lastWeek!==week){
      for(const entry of labels){entry.label.material.map.dispose();entry.label.material.map=labelTexture(entry.day,entry.meal);}
      for(const entry of contents){
        const visual=window.AnbanVisuals.pills(week.days[entry.day].slots[entry.meal].meds),signature=JSON.stringify(visual.items);
        if(signature!==entry.signature){
          entry.signature=signature;entry.group.clear();
          entry.markers=visual.items.map((token,i)=>{const pill=pillLibrary.create(token,i,visual.items.length);entry.group.add(pill);return pill;});
        }
      }
      syncSchedule.lastWeek=week;
    }
    const day=week.days.findIndex(d=>d.date===selection.date),meal=schedule.periods.findIndex(p=>p.id===selection.period);
    selected=day;selectedMeal=meal;wake();
  }
  function reset(){
    window.AnbanDayPanel.close(false);expanded=false;document.body.classList.remove('scene-focused');
    targetYaw=-.44;targetTilt=.77;targetZoom=1;targetFocus.set(0,1.4,-.45);wake();
  }
  window.addEventListener('anban:day-panel',e=>{
    expanded=e.detail.open;
    if(expanded){targetYaw=0;targetTilt=1.35;targetZoom=1;targetFocus.set(0,.8,0);
      coverOpen=true;targetLid=-1.72;lidButton.textContent='合上盒盖';lidButton.setAttribute('aria-pressed','true');wake();
    }else reset();
  });
  document.getElementById('resetView').onclick=reset;
  lidButton.onclick=()=>{coverOpen=!coverOpen;targetLid=coverOpen?-1.5:0;lidButton.textContent=coverOpen?'合上盒盖':'打开盒盖';lidButton.setAttribute('aria-pressed',String(coverOpen));wake();};
  const ray=new THREE.Raycaster(),pointer=new THREE.Vector2();
  function hit(x,y){const r=host.getBoundingClientRect();pointer.set((x-r.left-viewport.x)/viewport.w*2-1,-(y-r.top-viewport.y)/viewport.h*2+1);ray.setFromCamera(pointer,camera);return ray.intersectObjects(pickables,false)[0]?.object.userData;}
  let drag=null;
  host.addEventListener('pointerdown',e=>{if(e.button!==0)return;drag={id:e.pointerId,x:e.clientX,y:e.clientY,lastX:e.clientX,lastY:e.clientY,moved:false};host.setPointerCapture(e.pointerId);});
  host.addEventListener('pointermove',e=>{if(!drag){host.style.cursor=hit(e.clientX,e.clientY)?'pointer':'grab';return;}if(e.pointerId!==drag.id)return;
    if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)>6)drag.moved=true;
    if(drag.moved&&!expanded){targetYaw+=(e.clientX-drag.lastX)*.006;targetTilt=THREE.MathUtils.clamp(targetTilt+(e.clientY-drag.lastY)*.0035,.45,1.22);wake();}
    drag.lastX=e.clientX;drag.lastY=e.clientY;
  });
  host.addEventListener('pointerup',e=>{if(!drag||e.pointerId!==drag.id)return;const wasDrag=drag.moved;drag=null;if(!wasDrag){const h=hit(e.clientX,e.clientY);if(h)select(h.day,h.meal);else reset();}});
  host.addEventListener('pointercancel',()=>{drag=null;});
  host.addEventListener('wheel',e=>{if(expanded)return;e.preventDefault();targetYaw+=e.deltaY*.0015;wake();},{passive:false});
  window.addEventListener('keydown',e=>{if(workspace||document.getElementById('organizerDay').open||document.getElementById('modal').open||e.target.matches('input,textarea,select'))return;if(e.key==='ArrowRight'||e.key==='ArrowLeft'){e.preventDefault();select((selected+(e.key==='ArrowRight'?1:6)+7)%7);}if(e.key==='Escape')reset();});
  window.addEventListener('anban:workspace',e=>{workspace=e.detail.open;if(!workspace)wake();});
  window.addEventListener('resize',resize);
  document.getElementById('world').addEventListener('scroll',wake,{passive:true});
  motion.addEventListener('change',wake);
  document.addEventListener('visibilitychange',()=>{if(document.hidden){cancelAnimationFrame(frame);frame=0;last=0;}else wake();});
  renderer.domElement.addEventListener('webglcontextlost',e=>{e.preventDefault();alive=false;cancelAnimationFrame(frame);frame=0;window.dispatchEvent(new CustomEvent('anban:gl-lost'));});
  function geometryState(){
    scene.updateMatrixWorld(true);
    const inverse=organizer.matrixWorld.clone().invert();
    function bounds(object,frameInverse=inverse){
      const result=new THREE.Box3();
      object.traverse(mesh=>{
        if(!mesh.isMesh||mesh.material.visible===false)return;
        if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
        result.union(mesh.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(frameInverse,mesh.matrixWorld)));
      });
      return {min:result.min.toArray(),max:result.max.toArray()};
    }
    return {cells:targets.map(t=>({day:t.day,meal:t.meal,...bounds(t.cell)})),
      pills:contents.map(c=>({day:c.day,meal:c.meal,bounds:c.markers.map(p=>bounds(p,c.group.parent.matrixWorld.clone().invert()))})),
      lid:bounds(largeHinge),columns:groups.map(g=>g.position.toArray()),smallLidAngles:hinges.map(h=>h.object.rotation.x)};
  }
  // Public read-only diagnostics make visual and interaction regressions testable.
  window.anbanScene={getNoteState:()=>({entries:sticky.getEntries(),bounds:sticky.project(camera,width,height),pillTypes:contents.map(c=>c.markers.map(m=>m.userData.type))}),getGeometryState:geometryState,getState:()=>({selected,selectedMeal,coverOpen,yaw,targetYaw,tilt,expanded,spread,viewport,lidAngle,zoom,drawCalls:renderer.info.render.calls,geometries:renderer.info.memory.geometries,dates:currentWeek.days.map(d=>d.date),cellCounts:currentWeek.days.map(d=>d.slots.map(s=>s.meds.length)),visibleMarkers:contents.map(c=>c.markers.filter(p=>p.visible).length)}),projectCell:(day,meal)=>{scene.updateMatrixWorld(true);const v=targets.find(t=>t.day===day&&t.meal===meal).cell.localToWorld(new THREE.Vector3(0,.7,0)).project(camera);return {x:viewport.x+(v.x+1)*viewport.w/2,y:viewport.y+(1-v.y)*viewport.h/2};}};
  await document.fonts.ready;
  schedule.subscribe(syncSchedule);
  resize();renderer.compile(scene,camera);document.getElementById('sceneLoading').hidden=true;
  document.body.classList.add('scene-ready');
}
