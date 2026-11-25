import * as THREE from 'three';

export function createStickyNote(lid,renderer){
 const group=new THREE.Group();group.position.set(1.7,-.075,3.55);group.rotation.set(Math.PI/2,0,-.055);lid.add(group);
 const canvas=document.createElement('canvas');canvas.width=768;canvas.height=720;
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=renderer.capabilities.getMaxAnisotropy();
 const geometry=new THREE.PlaneGeometry(4.5,4.25,24,24),pos=geometry.attributes.position;
 for(let i=0;i<pos.count;i++){const u=(pos.getX(i)+2.25)/4.5,v=(pos.getY(i)+2.125)/4.25;pos.setZ(i,.035*Math.pow(u,3)*Math.pow(1-v,3));}
 geometry.computeVertexNormals();
 const back=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0xe7cf8c,roughness:1,side:THREE.DoubleSide}));back.position.z=-.014;group.add(back);
 const paper=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({map:texture,roughness:.96,side:THREE.FrontSide}));paper.castShadow=true;group.add(paper);
 const shadow=new THREE.Mesh(geometry,new THREE.MeshBasicMaterial({color:0x665133,transparent:true,opacity:.14,depthWrite:false,side:THREE.DoubleSide}));shadow.position.set(.035,-.035,-.026);group.add(shadow);
 const tapeMat=new THREE.MeshStandardMaterial({color:0xeeb7af,roughness:.85,transparent:true,opacity:.85,side:THREE.DoubleSide});
 for(const x of [-1.35,1.35]){const tape=new THREE.Mesh(new THREE.PlaneGeometry(1.15,.38),tapeMat);tape.position.set(x,2.02,.022);tape.rotation.z=x<0?-.18:.16;group.add(tape);}
 let last='',entries=[],pulse=0;
 function paint(list){
  const key=JSON.stringify(list);if(key===last)return;last=key;entries=list.map(m=>({...m}));pulse=1;
  const c=canvas.getContext('2d'),gradient=c.createLinearGradient(0,0,60,720);gradient.addColorStop(0,'#fff3bb');gradient.addColorStop(.8,'#ffe8a2');gradient.addColorStop(1,'#f6d986');c.fillStyle=gradient;c.fillRect(0,0,768,720);
  let seed=81;for(let i=0;i<2000;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;const x=seed%768;seed=(Math.imul(seed,1664525)+1013904223)>>>0;c.fillStyle=i%2?'#fff8d622':'#a07d2c12';c.fillRect(x,seed%720,1+(i%3),1);}
  c.fillStyle='#644d3a';c.font='600 76px "Kaiti SC", "STKaiti", "PingFang SC", sans-serif';c.fillText('我的药品',52,112);
  // A small bear sticker is drawn as part of the paper, not a floating icon.
  c.fillStyle='#bf8e65';for(const x of [627,704]){c.beginPath();c.arc(x,60,23,0,Math.PI*2);c.fill();}
  c.fillStyle='#f1d1a4';c.beginPath();c.ellipse(666,94,59,51,0,0,Math.PI*2);c.fill();
  c.fillStyle='#644d3a';for(const x of [648,685]){c.beginPath();c.arc(x,88,5,0,Math.PI*2);c.fill();}c.beginPath();c.ellipse(666,103,7,5,0,0,Math.PI*2);c.fill();c.strokeStyle='#644d3a';c.lineWidth=3;c.beginPath();c.arc(666,109,12,0,Math.PI);c.stroke();
  c.fillStyle='#e7a096';for(const x of [628,703]){c.beginPath();c.ellipse(x,106,11,6,0,0,Math.PI*2);c.fill();}
  c.fillStyle='#705c40';c.font='500 46px "PingFang SC", sans-serif';c.fillText(entries.length?'已录入 '+entries.length+' 种':'还没有录入',56,184);
  function fit(text,width,font){c.font=font;let out='';for(const ch of text){if(c.measureText(out+ch).width>width)return out+'…';out+=ch;}return out;}
  const visible=entries.slice(0,3);
  visible.forEach((entry,i)=>{
   const y=entries.length<3?305+i*178:270+i*136;c.strokeStyle='#d5bb7b';c.lineWidth=2;c.beginPath();c.moveTo(54,y+76);c.lineTo(716,y+76);c.stroke();
   c.fillStyle='#573e31';const font='600 '+(entries.length<3?88:76)+'px "PingFang SC", sans-serif';const title=fit(entry.name,650,font);c.fillText(title,56,y);
   if(entry.status!=='confirmed'){c.font='500 44px "PingFang SC", sans-serif';c.fillStyle='#8a593e';c.fillText(entry.status==='pending'?'待核对':'已核对 · 待制卡',58,y+55);}
  });
  if(entries.length>3){c.fillStyle='#705c40';c.font='600 48px "PingFang SC", sans-serif';c.fillText('还有 '+(entries.length-3)+' 种',56,666);}
  texture.needsUpdate=true;
 }
 paint([]);
 return {group,paper,paint,getEntries:()=>entries,
  tick(dt,reduced){pulse=reduced?0:pulse*Math.exp(-dt/.28);group.rotation.z=-.055+pulse*.018;return pulse>.001;},
  project(camera,width,height){
   group.updateWorldMatrix(true,false);
   const points=[[-2.25,-2.125],[2.25,-2.125],[2.25,2.125],[-2.25,2.125]].map(([x,y])=>group.localToWorld(new THREE.Vector3(x,y,0)).project(camera));
   const center=group.getWorldPosition(new THREE.Vector3()),normal=new THREE.Vector3(0,0,1).transformDirection(group.matrixWorld);
   const visible=normal.dot(camera.position.clone().sub(center))>0&&points.every(p=>p.z>-1&&p.z<1);
   return {visible,left:Math.min(...points.map(p=>(p.x+1)*width/2)),right:Math.max(...points.map(p=>(p.x+1)*width/2)),top:Math.min(...points.map(p=>(1-p.y)*height/2)),bottom:Math.max(...points.map(p=>(1-p.y)*height/2))};
  }};
}

export function createPillLibrary(){
 const white=new THREE.MeshStandardMaterial({color:0xfff8e9,roughness:.42});
 const shades=[0xe9b39c,0xa7c7b3,0xd3b4c9,0xe4cc8d].map(color=>new THREE.MeshStandardMaterial({color,roughness:.32}));
 const grooveMat=new THREE.MeshStandardMaterial({color:0xd6ccb9,roughness:.7});
 const capsule=new THREE.CapsuleGeometry(.1,.20,5,12).toNonIndexed();capsule.clearGroups();
 const positions=capsule.attributes.position;for(let i=0;i<positions.count;i+=3){capsule.addGroup(i,3,(positions.getY(i)+positions.getY(i+1)+positions.getY(i+2))>=0?0:1);}
 const tablet=new THREE.CylinderGeometry(.14,.14,.10,28,1),round=new THREE.SphereGeometry(.11,16,12),oval=new THREE.SphereGeometry(.115,20,12),score=new THREE.BoxGeometry(.21,.002,.012);
 const shape=new THREE.Shape();shape.absarc(0,0,.135,0,Math.PI,false);shape.lineTo(.135,0);
 const half=new THREE.ExtrudeGeometry(shape,{depth:.08,bevelEnabled:true,bevelThickness:.008,bevelSize:.008,bevelSegments:2,steps:1,curveSegments:14});half.rotateX(-Math.PI/2);half.translate(0,0,.06);
 const hash=name=>Array.from(name).reduce((n,ch)=>(Math.imul(n,31)+ch.codePointAt(0))>>>0,7);
 return {create(token,index,count){
  const seed=hash(token.name),group=new THREE.Group();let x,z;
  if(count===1){x=0;z=0;}else if(count<=4){x=(index%2-.5)*.48;z=(Math.floor(index/2)-(Math.ceil(count/2)-1)/2)*.62;}else{x=(index%3-1)*.35;z=(Math.floor(index/3)-1)*.5;}
  group.position.set(x,0,z);group.rotation.y=((seed+index)%5-2)*.075;
  let mesh,restY;
  if(token.type==='capsule'){mesh=new THREE.Mesh(capsule,[shades[seed%shades.length],white]);mesh.rotation.x=Math.PI/2;restY=.27;}
  else if(token.type==='tablet'){mesh=new THREE.Mesh(tablet,white);restY=.22;const line=new THREE.Mesh(score,grooveMat);line.position.y=.051;group.add(line);}
  else if(token.type==='half-tablet'){mesh=new THREE.Mesh(half,white);restY=.178;}
  else if(token.type==='round'){mesh=new THREE.Mesh(round,shades[seed%shades.length]);restY=.28;}
  else{mesh=new THREE.Mesh(oval,white);mesh.scale.set(.9,.65,1.45);restY=.245;}
  mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);group.userData={...token,restY,arriving:1};group.position.y=restY+.08;
  return group;
 }};
}
