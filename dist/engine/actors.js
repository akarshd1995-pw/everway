import {carById} from './garage.js';
import * as T from '../three.module.js';
import {createVehicle} from '../vehicles.js';
import {buildCoach,buildTractor,addCaravan,buildLorry,buildBus} from './coach.js';
import {scene,ASSETS} from './render.js';
import {canvasTexture,flakeTex,glowTex} from './textures.js';
import {G, state} from './state.js';
/* ------------------------------------------------------- lights & effects */

const hemi=new T.HemisphereLight(0xd7eafb,0x5d6240,1.6),sun=new T.DirectionalLight(0xffe4b0,3);

scene.add(hemi,sun,sun.target);

sun.castShadow=true;

Object.assign(sun.shadow.camera,{left:-55,right:55,top:55,bottom:-55,near:1,far:400});

sun.shadow.bias=-.0004;

sun.shadow.normalBias=.03;

sun.shadow.radius=3.5;

const shadowTexture=canvasTexture(64,64,(c,w,h)=>{const gr=c.createRadialGradient(32,32,0,32,32,32);gr.addColorStop(0,'#000a');gr.addColorStop(1,'#0000');c.fillStyle=gr;c.fillRect(0,0,w,h);});

const carShadow=new T.Mesh(new T.PlaneGeometry(3.4,5.3),new T.MeshBasicMaterial({map:shadowTexture,transparent:true,depthWrite:false,opacity:.8}));

carShadow.rotation.x=-Math.PI/2;

carShadow.position.y=.06;

scene.add(carShadow);

const headlights=[];

for(const x of [-.65,.65]){const l=new T.SpotLight('#fff0ce',0,110,.42,.55,1);l.position.set(x,1.1,-1.7);l.target.position.set(x,.1,-65);scene.add(l,l.target);headlights.push(l);}

const headGlow=new T.SpriteMaterial({map:glowTex,color:'#fff4dc',transparent:true,depthWrite:false,blending:T.AdditiveBlending,opacity:0}),tailGlow=new T.SpriteMaterial({map:glowTex,color:'#ff4a2e',transparent:true,depthWrite:false,blending:T.AdditiveBlending,opacity:0});

function addGlows(v){for(const sp of v.userData.glows||[])sp.removeFromParent();const car=v.userData.type==='car',lp=v.userData.lampPos,heads=lp?lp.head:car?[[-.73,.9,-2.02],[.73,.9,-2.02]]:[[0,1.3,-1.13]],tails=lp?lp.tail:car?[[-.7,.86,2.01],[.7,.86,2.01]]:[[0,1.05,1.14]];v.userData.glows=[];
  for(const p of heads){const s=new T.Sprite(headGlow);s.position.set(...p);s.scale.setScalar(car?1.05:.9);v.add(s);v.userData.glows.push(s);}
  for(const p of tails){const s=new T.Sprite(tailGlow);s.position.set(...p);s.scale.setScalar(.75);v.add(s);v.userData.glows.push(s);}}

const makeVehicle=(type,color,driver,style)=>{const v=type==='coach'?buildCoach():createVehicle(type,color,driver,{compact:true,style});addGlows(v);return v;};

// the player's car: a modern coupé with tinted glass (other rides use their own models)
const makePlayer=ride=>{if(ride!=='car')return makeVehicle(ride);const c=carById(state.car);return makeVehicle('car',state.paint||c.color,false,c.style);};
G.player=makePlayer('car');

scene.add(G.player);

const traffic=[];G.trafficList=traffic;const colors=['#d9dcdc','#1d2226','#8f979b','#7d1f1a','#24364f','#e8e6df','#4a5a4c','#6b6f72','#b8a68a'],styles=['sedan','hatch','suv','sedan','hatch','ev','sedan','hatch','gt'];

/** A traffic car from a model kit you added: scaled to a real car's length, facing the way it drives. */
function kitCar(mdl){const g=new T.Group(),k=4.4/mdl.size,body=new T.Group();
  for(const p of mdl.parts){const m=new T.Mesh(p.geometry,p.material);m.castShadow=true;m.receiveShadow=true;body.add(m);}
  body.scale.setScalar(k);body.rotation.y=Math.PI;   // glTF models face +z; ours drive towards -z
  g.add(body);const W=mdl.width*k/2,H=mdl.height*k;
  g.userData={type:'car',wheels:[],pedal:0,lampPos:{head:[[-W*.65,H*.38,-2.15],[W*.65,H*.38,-2.15]],tail:[[-W*.65,H*.42,2.15],[W*.65,H*.42,2.15]]}};
  addGlows(g);return g;}
// a mix of cars, vans, a tractor and a car towing a caravan; lengths are used for following and collisions
const KINDS=['car','car','van','car','tractor','motorbike','car','lorry','caravan','car','bus','classic','van','car','motorbike','car','lorry'];
const CLASSIC=[['roadster','#7a1e1e'],['muscle','#2c4a3a'],['roadster','#d8cfb4'],['muscle','#3a4f6e']],BIKES=['#b8302a','#1d2226','#2f6db5','#e8e6df'];
for(let i=0;i<KINDS.length;i++){const kind=KINDS[i];let car;
  if(kind==='lorry'){car=buildLorry(['#c9cfd2','#2f4f6f','#7d1f1a','#e9e9e4'][i%4],['#e9e9e4','#d8d2c4','#e9e9e4','#3e5a4a'][i%4]);addGlows(car);}
  else if(kind==='bus'){car=buildBus(['#b8302a','#2f6f4f','#1f4f8f'][i%3]);addGlows(car);}
  else if(kind==='motorbike'){car=createVehicle('bike',BIKES[i%BIKES.length],true,{compact:true});car.userData.lampPos={head:[[0,1.05,-1.05]],tail:[[0,.85,1.05]]};addGlows(car);}
  else if(kind==='classic'){const [st,c]=CLASSIC[i%CLASSIC.length];car=makeVehicle('car',c,false,st);}
  else if(kind==='van'){car=buildCoach(['#e9e9e4','#c9d2d6','#2f4f6f','#7d1f1a'][i%4],{L:5.3,W:2.05,H:2.15,base:.45,van:true});addGlows(car);}
  else if(kind==='tractor'){car=buildTractor(i%2?'#2f7d3a':'#b4322a');addGlows(car);}
  else{const kit=ASSETS?.models?.car;car=kit&&kit.length&&kind==='car'?kitCar(kit[i%kit.length]):makeVehicle('car',colors[i%colors.length],false,styles[i%styles.length]);if(kind==='caravan')addCaravan(car);}
  const u=car.userData;u.kind=kind;u.len=kind==='van'?5.3:kind==='tractor'?3.8:kind==='caravan'?4.4+5.9:kind==='lorry'?11:kind==='bus'?10.6:kind==='motorbike'?2.2:4.4;
  u.s=i*75+70;u.direction=i%3===0?-1:1;u.speed=kind==='tractor'?7+i%3:kind==='caravan'?14:kind==='lorry'?(u.direction===1?16:19):kind==='bus'?13:kind==='motorbike'?(u.direction===1?27:23):kind==='classic'?(u.direction===1?13:17):u.direction===1?10+(i%5)*2.5:19+(i%4)*2;
  if(kind==='bus'||kind==='motorbike'&&i===5)u.direction=1;if(kind==='motorbike'&&u.direction===1)u.s=-60-i*20;scene.add(car);traffic.push(car);}
// two cyclists at the edge of the road (cars overtake them)
// and a club ride: three cyclists riding together, one behind the other
for(let i=0;i<5;i++){const grp=i>=2,c=createVehicle('cycle',['#2f6db5','#c0392b','#e6b84a','#e6b84a','#e6b84a'][i],true,{compact:true});const u=c.userData;u.kind='cycle';u.len=1.9;u.s=grp?900+(i-2)*2.6:260+i*480;u.direction=1;u.speed=grp?6.4:5.2+i*.9;if(grp){u.group=true;u.gi=i-2;}scene.add(c);traffic.push(c);}
// Rain streaks and snowflakes

const RAIN=1800,rainHead=new Float32Array(RAIN*3),rainPos=new Float32Array(RAIN*6);

for(let i=0;i<RAIN;i++){rainHead[i*3]=(Math.random()-.5)*90;rainHead[i*3+1]=Math.random()*30;rainHead[i*3+2]=12-Math.random()*95;}

const rainGeo=new T.BufferGeometry();

rainGeo.setAttribute('position',new T.BufferAttribute(rainPos,3));

const rainMat=new T.LineBasicMaterial({color:'#cdd9df',transparent:true,opacity:0,depthWrite:false});

const rain=new T.LineSegments(rainGeo,rainMat);

rain.frustumCulled=false;

scene.add(rain);

const FLAKES=2600,flakePos=new Float32Array(FLAKES*3);

for(let i=0;i<FLAKES;i++){flakePos[i*3]=(Math.random()-.5)*120;flakePos[i*3+1]=Math.random()*40;flakePos[i*3+2]=15-Math.random()*130;}

const flakeGeo=new T.BufferGeometry();

flakeGeo.setAttribute('position',new T.BufferAttribute(flakePos,3));

const flakeMat=new T.PointsMaterial({map:flakeTex,size:.32,transparent:true,depthWrite:false,opacity:0,color:'#ffffff'});

const snowfall=new T.Points(flakeGeo,flakeMat);

snowfall.frustumCulled=false;

scene.add(snowfall);

export {makePlayer,hemi,sun,shadowTexture,carShadow,headlights,headGlow,tailGlow,addGlows,makeVehicle,traffic,colors,styles,RAIN,rainHead,rainPos,rainGeo,rainMat,rain,FLAKES,flakePos,flakeGeo,flakeMat,snowfall};
