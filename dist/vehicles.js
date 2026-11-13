import * as T from './three.module.js';
import {buildDetailedCar} from './cars.js';
import {makeHuman, ridePose} from './engine/human.js';
const materials=new Map();function material(c,metal=0,rough=.6){const key=c+metal+rough;if(!materials.has(key)){const tire=c==='#202421';materials.set(key,new T.MeshPhysicalMaterial({color:c,metalness:metal,roughness:tire?.92:rough,clearcoat:tire?0:metal>.3?1:.15,clearcoatRoughness:.18,envMapIntensity:tire?.3:1}));}return materials.get(key);}
// Lamp materials are shared so the world can brighten every head/tail light at night in one place.
export const lampMaterials={};
const windscreenGlass=new T.MeshPhysicalMaterial({color:'#b9d3d6',metalness:0,roughness:.04,transparent:true,opacity:.28,side:T.DoubleSide,clearcoat:1,envMapIntensity:1.4});
const cabinGlass=new T.MeshPhysicalMaterial({color:'#141b1f',metalness:.1,roughness:.06,clearcoat:1,clearcoatRoughness:.05,envMapIntensity:1.6});
function part(g,geo,c,x=0,y=0,z=0,metal=0,rough=.6){const m=new T.Mesh(geo,material(c,metal,rough));m.position.set(x,y,z);m.castShadow=true;m.receiveShadow=true;g.add(m);return m;}
function block(g,x,y,z,w,h,d,c,metal=0){return part(g,new T.BoxGeometry(w,h,d),c,x,y,z,metal);}
function oval(g,x,y,z,rx,ry,rz,c,metal=0){const m=part(g,new T.SphereGeometry(1,16,10),c,x,y,z,metal);m.scale.set(rx,ry,rz);return m;}
function rod(g,a,b,r,c,metal=0){const p=new T.Vector3(...a),q=new T.Vector3(...b),m=part(g,new T.CylinderGeometry(r,r,p.distanceTo(q),10),c,0,0,0,metal,metal>.5?.28:.6);m.position.copy(p.clone().add(q).multiplyScalar(.5));m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),q.sub(p).normalize());return m;}
function glow(g,x,y,z,w,h,c){const m=block(g,x,y,z,w,h,.025,c);if(!lampMaterials[c])lampMaterials[c]=new T.MeshStandardMaterial({color:c,emissive:c,emissiveIntensity:1.6,roughness:.25});m.material=lampMaterials[c];return m;}
function person(g,x,y,z,bike=false,helmet=false){const human=new T.Group();human.position.set(x,y,z);g.add(human);oval(human,0,.34,0,.24,.34,.16,'#405c61');oval(human,0,.69,-.01,.075,.09,.07,'#ca9776');oval(human,0,.91,-.025,.175,.215,.18,'#ca9776');oval(human,0,1.05,.015,.18,.11,.18,'#302e28');oval(human,0,.91,-.19,.045,.045,.04,'#ca9776');if(helmet){oval(human,0,.96,0,.225,.255,.22,'#ded7c3');oval(human,0,.98,-.2,.18,.09,.025,'#263f44',.5);}for(const side of [-1,1]){oval(human,side*.24,.49,0,.08,.1,.1,'#405c61');rod(human,[side*.23,.48,0],[side*.31,.22,-.24],.065,'#405c61');rod(human,[side*.31,.22,-.24],[side*.29,.25,-.49],.055,'#ca9776');oval(human,side*.29,.25,-.49,.065,.07,.07,'#ca9776');}if(bike)human.rotation.x=-.18;return human;}
export function createVehicle(type='car',color='#bc5c39',driver=true,options={}){const g=new T.Group();g.userData={type,wheels:[],pedal:0};
if(type==='car'&&options.compact){ // detailed WebGL car; the compatibility renderer keeps the simple one below
  if(!lampMaterials['#fff1c4'])lampMaterials['#fff1c4']=new T.MeshStandardMaterial({color:'#fff1c4',emissive:'#fff1c4',emissiveIntensity:1.6,roughness:.25});
  if(!lampMaterials['#f05b3e'])lampMaterials['#f05b3e']=new T.MeshStandardMaterial({color:'#f05b3e',emissive:'#f05b3e',emissiveIntensity:1.6,roughness:.25});
  buildDetailedCar(g,options.style||'roadster',color,driver,{mat:material,glass:windscreenGlass,glassDark:cabinGlass,lamp:c=>lampMaterials[c],
    person:(grp,x,y,z)=>person(grp,x,y,z),addWheel:(steer,pivot,r,front)=>g.userData.wheels.push({pivot,steer,r,front})});
  compact(g);return g;}
function wheel(x,y,z,r,width,cycle=false){const steer=new T.Group(),pivot=new T.Group();steer.position.set(x,y,z);g.add(steer);steer.add(pivot);const tire=part(pivot,new T.CylinderGeometry(r,r,width,24),'#202421');tire.rotation.z=Math.PI/2;for(const side of [-1,1]){const hub=part(pivot,new T.CylinderGeometry(r*.71,r*.71,.025,20),cycle?'#687574':'#343d3d',side*(width/2+.008),0,0,.75);hub.rotation.z=Math.PI/2;for(let j=0;j<(cycle?12:5);j++){const a=j*Math.PI*2/(cycle?12:5),end=[side*(width/2+.03),Math.cos(a)*r*.65,Math.sin(a)*r*.65];rod(pivot,[end[0],0,0],end,cycle?.009:.026,'#c7cccb',.95);}const center=part(pivot,new T.CylinderGeometry(r*.16,r*.16,.04,12),'#d7d8c9',side*(width/2+.04),0,0,.8);center.rotation.z=Math.PI/2;}g.userData.wheels.push({pivot,steer,r,front:z<0});}
if(type==='car'){
// Sculpted open roadster: a curved cross section extruded along the chassis.
const shape=new T.Shape();shape.moveTo(-.91,.48);shape.quadraticCurveTo(-1.02,.52,-1.01,.78);shape.lineTo(-.95,1.02);shape.quadraticCurveTo(0,1.19,.95,1.02);shape.lineTo(1.01,.78);shape.quadraticCurveTo(1.02,.52,.91,.48);shape.closePath();const geo=new T.ExtrudeGeometry(shape,{depth:3.65,bevelEnabled:true,bevelSegments:3,steps:1,bevelSize:.1,bevelThickness:.12,curveSegments:8});geo.translate(0,0,-1.82);part(g,geo,color,0,0,0,.62,.27);
// Dark cabin inset, tan seats, curved hood and fenders.
block(g,0,1.11,.26,1.54,.12,1.53,'#28302b');for(const x of [-.43,.43]){oval(g,x,1.17,.47,.32,.13,.38,'#a6845c');const seat=block(g,x,1.4,.8,.59,.6,.18,'#a6845c');seat.rotation.x=-.13;oval(g,x,1.71,.84,.18,.16,.09,'#a6845c');}oval(g,0,1.07,-1.04,.96,.15,.85,color,.6);block(g,0,1.08,1.42,1.7,.11,.66,color,.6);
const windshield=block(g,0,1.54,-.47,1.63,.58,.035,'#a6c9cb');windshield.rotation.x=.23;windshield.material=new T.MeshPhysicalMaterial({color:'#a6c9cb',metalness:.1,roughness:.07,transparent:true,opacity:.42,side:T.DoubleSide});for(const side of [-1,1]){rod(g,[side*.84,1.25,-.39],[side*.84,1.87,-.57],.027,'#d0d2c8',.9);oval(g,side*1.03,1.28,-.5,.16,.085,.1,color,.65);block(g,side*1.018,.95,.45,.018,.025,.2,'#d2d7cc',.8);for(const z of [-1.18,1.2]){wheel(side*.98,.43,z,.43,.25);oval(g,side*.88,.75,z,.23,.28,.58,color,.6);}}
rod(g,[-.84,1.87,-.57],[.84,1.87,-.57],.028,'#d0d2c8');block(g,0,.64,-1.97,1.5,.18,.04,'#283330');for(let i=-3;i<=3;i++)block(g,i*.19,.64,-1.997,.025,.12,.025,'#adb9b4',.8);for(const side of [-1,1]){glow(g,side*.73,.9,-1.95,.42,.09,'#fff1c4');glow(g,side*.7,.86,1.97,.46,.065,'#f05b3e');block(g,side*.76,.45,1.95,.21,.09,.08,'#adb9b4',.9);}block(g,0,.67,1.985,.48,.13,.015,'#e0dcc7');if(driver){person(g,-.43,1.1,.34);const steering=part(g,new T.TorusGeometry(.19,.025,8,24),'#25332e',-.43,1.42,-.12);steering.rotation.x=-.65;}block(g,0,.91,-.29,1.5,.2,.2,'#3f4940');
}else twoWheeler(g,type,color,driver,{part,rod,oval,block,glow});
if(options.compact)compact(g);return g;}
// Merge the static parts of each group that share a material: a car drops from ~110 draw calls to ~15.
function compact(root){const groups=[];root.traverse(o=>{if(o===root||o.isGroup)groups.push(o);});for(const grp of groups){const byMat=new Map();for(const c of grp.children){if(!c.isMesh||c.userData.keep||c.children.length)continue;if(!byMat.has(c.material))byMat.set(c.material,[]);byMat.get(c.material).push(c);}for(const [mat,list] of byMat){if(list.length<2)continue;const pos=[],nor=[];for(const c of list){c.updateMatrix();const geo=(c.geometry.index?c.geometry.toNonIndexed():c.geometry.clone()).applyMatrix4(c.matrix);pos.push(geo.attributes.position.array);nor.push(geo.attributes.normal.array);geo.dispose();c.geometry.dispose();grp.remove(c);}const join=arrs=>{const out=new Float32Array(arrs.reduce((a,b)=>a+b.length,0));let o=0;for(const a of arrs){out.set(a,o);o+=a.length;}return out;};const geo=new T.BufferGeometry();geo.setAttribute('position',new T.BufferAttribute(join(pos),3));geo.setAttribute('normal',new T.BufferAttribute(join(nor),3));const m=new T.Mesh(geo,mat);m.castShadow=m.receiveShadow=true;grp.add(m);}}}
const p=new T.Vector3(),q=new T.Vector3(),axis=new T.Vector3(0,1,0);function positionLimb(m,a,b){p.set(...a);q.set(...b);m.position.copy(p).add(q).multiplyScalar(.5);m.scale.y=p.distanceTo(q);m.quaternion.setFromUnitVectors(axis,q.sub(p).normalize());}
export function animateVehicle(g,speed,dt,steering=0,active=true){for(const wheel of g.userData.wheels){if(active)wheel.pivot.rotation.x-=speed*dt/wheel.r;wheel.steer.rotation.y=wheel.front?steering*.6:0;}if(!g.userData.legs)return;if(active)g.userData.pedal+=speed*dt/(g.userData.type==='cycle'?1.1:1.3);
  const L=g.userData.legCfg;if(!L)return;
  for(const {side,thigh,shin,foot} of g.userData.legs){
    const a=g.userData.pedal+(side===1?0:Math.PI),pedalling=L.cycle&&speed>.3;
    const f=L.cycle?[side*L.px,L.bb[0]+Math.cos(a)*(pedalling?L.crank:.12),L.bb[1]+Math.sin(a)*(pedalling?L.crank:.1)]:[side*L.peg[0],L.peg[1],L.peg[2]];
    const h=[side*L.hip[0],L.hip[1],L.hip[2]];
    // knee: where thigh and shin of fixed length meet, pushed forwards (towards -z)
    const dx=f[0]-h[0],dy=f[1]-h[1],dz=f[2]-h[2],d=Math.min(Math.hypot(dx,dy,dz),L.L1+L.L2-.001),t1=(L.L1*L.L1-L.L2*L.L2+d*d)/(2*d),hgt=Math.sqrt(Math.max(0,L.L1*L.L1-t1*t1));
    const ux=dx/d,uy=dy/d,uz=dz/d,px=0,py=-uz,pz=uy,pl=Math.hypot(py,pz)||1,sgn=pz/pl>0?-1:1;
    const k=[h[0]+ux*t1,h[1]+uy*t1+sgn*py/pl*hgt,h[2]+uz*t1+sgn*pz/pl*hgt];void px;
    positionLimb(thigh,h,k);positionLimb(shin,k,f);foot.position.set(f[0],f[1]-.02,f[2]-.04);}}

/* ------------------------------------------------------------ motorbikes and bicycles */
// Real proportions: a bicycle about 1.7 m long on 700c wheels with a diamond frame, chainset and drop of
// the saddle to the bars; a motorbike about 2.1 m long with a fuel tank, finned engine, exhaust,
// telescopic forks and alloy wheels. The rider is a proper figure; the legs pedal (or rest on the pegs).
function twoWheeler(g,type,color,driver,{part,rod,oval,block,glow}){
  const cycle=type==='cycle',metal='#c7cccb',dark='#22282a',rubber='#1c1f1e';
  const tyre=(r,w)=>{const m=new T.Mesh(new T.TorusGeometry(r-w*.5,w*.5,10,36),material(rubber));m.rotation.y=Math.PI/2;m.castShadow=true;return m;};
  function wheel2(z,r,w,front){
    const steer=new T.Group(),pivot=new T.Group();steer.position.set(0,r,z);g.add(steer);steer.add(pivot);
    pivot.add(tyre(r,w));
    const rim=new T.Mesh(new T.TorusGeometry(r-w*.95,cycle?.012:.025,8,36),material(cycle?'#9aa3a6':'#3a4042',.9,.3));rim.rotation.y=Math.PI/2;pivot.add(rim);
    if(cycle){ // laced spokes, crossing from each side of the hub
      for(let k=0;k<24;k++){const a=k/24*Math.PI*2,sd=k%2?1:-1,end=[0,Math.cos(a)*(r-w),Math.sin(a)*(r-w)];rod(pivot,[sd*.025,Math.cos(a+.3)*.02,Math.sin(a+.3)*.02],end,.0035,'#c9cfd0',.9);}
      const hub=part(pivot,new T.CylinderGeometry(.022,.022,.07,10),'#b8bfc0',0,0,0,.9);hub.rotation.z=Math.PI/2;
    }else{ // five-spoke alloy wheel and a brake disc
      for(let k=0;k<5;k++){const a=k/5*Math.PI*2;rod(pivot,[0,0,0],[0,Math.cos(a)*(r-w*.9),Math.sin(a)*(r-w*.9)],.022,'#3a4042',.9);}
      const hub=part(pivot,new T.CylinderGeometry(.05,.05,.12,12),'#5a6264',0,0,0,.9);hub.rotation.z=Math.PI/2;
      const disc=part(pivot,new T.CylinderGeometry(r*.55,r*.55,.008,28),'#b9bfc0',.06,0,0,.95,.25);disc.rotation.z=Math.PI/2;
    }
    g.userData.wheels.push({pivot,steer,r,front});
  }
  const L={};   // the rider's leg layout, used by animateVehicle
  if(cycle){
    const r=.35,zf=-.52,zr=.5,bb=[.29,.02],seat=[.95,.2],head=[.86,-.4],headLo=[.7,-.43],c=color;
    wheel2(zf,r,.034,true);wheel2(zr,r,.034,false);
    const T2=(a,b,w,col=c)=>rod(g,a,b,w,col,.6);
    T2([0,bb[0],bb[1]],[0,seat[0]-.08,seat[1]-.02],.017);                      // seat tube
    T2([0,head[0],head[1]],[0,seat[0]-.1,seat[1]-.03],.015);                    // top tube
    T2([0,headLo[0],headLo[1]],[0,bb[0],bb[1]],.019);                           // down tube
    T2([0,head[0]+.02,head[1]+.01],[0,headLo[0],headLo[1]],.02);                // head tube
    for(const sd of [-1,1]){T2([sd*.02,bb[0],bb[1]],[sd*.05,r,zr],.009);T2([sd*.02,seat[0]-.12,seat[1]-.02],[sd*.05,r,zr],.008);   // chain and seat stays
      T2([sd*.01,headLo[0],headLo[1]],[sd*.045,r,zf+.03],.011,c);}             // fork blades
    rod(g,[0,seat[0]-.08,seat[1]-.02],[0,seat[0],seat[1]+.01],.012,metal,.9);   // seatpost
    oval(g,0,seat[0]+.02,seat[1]+.02,.07,.03,.14,'#24292a');                   // saddle
    rod(g,[0,head[0]+.02,head[1]+.01],[0,head[0]+.1,head[1]-.06],.013,metal,.9);// stem
    rod(g,[-.22,head[0]+.1,head[1]-.07],[.22,head[0]+.1,head[1]-.07],.012,metal,.9);  // bars
    for(const sd of [-1,1])oval(g,sd*.22,head[0]+.1,head[1]-.07,.02,.02,.05,'#2a2f30');
    const ring=new T.Mesh(new T.TorusGeometry(.1,.008,6,28),material('#b9bfc0',.9,.3));ring.rotation.y=Math.PI/2;ring.position.set(.06,bb[0],bb[1]);g.add(ring);
    rod(g,[.06,bb[0]+.09,bb[1]],[.06,r+.04,zr],.004,'#55595a',.6);rod(g,[.06,bb[0]-.09,bb[1]],[.06,r-.04,zr],.004,'#55595a',.6);   // chain
    Object.assign(L,{cycle:true,hip:[.09,seat[0]+.03,seat[1]+.03],bb,crank:.17,L1:.45,L2:.45,px:.12});
    if(driver){const h=makeHuman({legs:false,helmet:Math.random()<.6?'#e8e6df':null,seed:(color.charCodeAt(1)||1)+3,top:color==='#2f6db5'?'#f2c14e':undefined});
      h.position.set(0,seat[0]-.92,seat[1]+.05);ridePose(h,.62,.43,.45);g.add(h);}
  }else{
    const r=.32,zf=-.72,zr=.72,c=color;
    wheel2(zf,r,.13,true);wheel2(zr,r,.16,false);
    // engine: crankcase, finned cylinder, and a radiator in front
    block(g,0,.42,.02,.26,.26,.42,'#3a3f41',.7);
    const cyl=block(g,0,.66,-.12,.2,.26,.2,'#565c5e',.8);cyl.rotation.x=-.35;
    for(let k=0;k<6;k++){const f=block(g,0,.56+k*.035,-.08-k*.012,.26,.012,.25,'#6b7173',.8);f.rotation.x=-.35;}
    block(g,0,.62,-.34,.3,.24,.04,'#1f2426',.4);
    // frame, tank, seat, tail
    rod(g,[0,.92,-.44],[0,.5,.0],.03,dark,.6);rod(g,[0,.92,-.44],[0,.8,.38],.028,dark,.6);rod(g,[0,.8,.38],[0,.45,.2],.025,dark,.6);
    oval(g,0,.9,-.16,.17,.13,.3,c,.6);                                          // fuel tank
    oval(g,0,.97,-.16,.1,.03,.16,c,.6);
    oval(g,0,.85,.3,.15,.05,.32,'#1d2022',0);                                    // seat
    const tail=oval(g,0,.86,.62,.12,.08,.22,c,.6);tail.rotation.x=.25;
    // forks, bars, lamp, mirrors
    for(const sd of [-1,1]){rod(g,[sd*.085,.98,-.47],[sd*.085,r+.02,zf],.028,metal,.95);rod(g,[sd*.085,.98,-.47],[sd*.085,.72,-.55],.034,'#2c3133',.6);}
    rod(g,[-.36,1.04,-.43],[.36,1.04,-.43],.016,dark,.6);
    for(const sd of [-1,1]){oval(g,sd*.35,1.04,-.43,.025,.025,.06,'#202425');rod(g,[sd*.28,1.05,-.44],[sd*.33,1.23,-.46],.008,dark,.6);oval(g,sd*.34,1.25,-.47,.045,.03,.012,'#2c3133',.6);}
    oval(g,0,.95,-.62,.09,.09,.06,'#2c3133',.6);glow(g,0,.95,-.665,.13,.13,'#fff0ba');
    block(g,0,1.06,-.5,.14,.06,.05,'#15191a');                                   // dials
    const ff=oval(g,0,r+.2,zf,.08,.04,.28,c,.6);ff.rotation.x=.15;               // front mudguard
    // swingarm, chain, exhaust, rear lamp and number plate
    for(const sd of [-1,1])rod(g,[sd*.1,.42,.1],[sd*.1,r,zr],.025,'#2c3133',.6);
    rod(g,[.15,.32,0],[.18,.36,.45],.035,'#b8bec0',.95);const muf=rod(g,[.18,.36,.45],[.19,.5,.95],.055,'#b8bec0',.95);
    glow(g,0,.86,.84,.12,.04,'#ed6042');block(g,0,.72,.86,.18,.12,.01,'#e8e4d2');
    Object.assign(L,{cycle:false,hip:[.11,.9,.26],peg:[.17,.42,.12],L1:.45,L2:.45});
    if(driver){const h=makeHuman({legs:false,helmet:['#e8e6df','#1d2124','#b4392e','#2f5d86'][Math.floor(Math.random()*4)],seed:(color.charCodeAt(2)||2)+11,sleeves:'long',top:Math.random()<.5?'#2a2a2a':'#5c4532'});
      h.position.set(0,.9-.92,.3);ridePose(h,.45,.51,.34);g.add(h);}
  }
  // the rider's legs: thigh, shin and shoe, posed every frame
  if(driver){g.userData.legs=[];g.userData.legCfg=L;const legC=cycle?'#344858':'#2c3440';
    for(const side of [-1,1]){const thigh=rod(g,[0,0,0],[0,1,0],1,legC);thigh.geometry=new T.CylinderGeometry(.055,.072,1,10);
      const shin=rod(g,[0,0,0],[0,1,0],1,legC);shin.geometry=new T.CylinderGeometry(.04,.052,1,10);
      const foot=oval(g,0,0,0,.045,.04,.11,cycle?'#e9e5da':'#1d1f20');
      thigh.userData.keep=shin.userData.keep=foot.userData.keep=true;g.userData.legs.push({side,thigh,shin,foot});}}
}
