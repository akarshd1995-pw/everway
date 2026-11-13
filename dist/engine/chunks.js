import * as T from '../three.module.js';
import {MODEL_LIMITS} from '../assets.js';
import {C,fbm,hash2,lerp,rand,smooth,vnoise} from './core.js';
import {ASSETS,scene} from './render.js';
import {ROAD_TILE,RW,signUV} from './textures.js';
import {MAT,bladeGeo,wind} from './materials.js';
import {Batch,M,Mt,blobT,boxT,coneT,cylT,gambrelT,prismT,quadT,rockT,sphT,tpl} from './templates.js';
// a square pyramid with a unit half-width base (a hipped roof, a spire cap)
const pyrT=()=>tpl('pyr4',()=>{const g=new T.ConeGeometry(1,1,4);g.rotateY(Math.PI/4);g.scale(Math.SQRT2,1,Math.SQRT2);return g;});
import {BIOMES,CH,CROPS,LXS,SNOW,biomeAt,heightAt,terrainParams} from './biomes.js';
import {roadSeed,ROAD,roadBank,roadCos,roadGrade,roadHeight,roadSurface,roadX,roadYaw,sideX} from './road.js';
import {groundHeight,groundAtX,groundColor,coastSide,SEA_LEVEL,structureAt,structHalf,riverAt} from './terrain.js';
import {release,acquire,fitBounds,pooledGeometry,fillGeometry,recycle,poolStats} from './pool.js';
import {Scheduler} from './scheduler.js';
import {setObstacles,clearObstacles} from './obstacles.js';
import {G,state} from './state.js';
import {season,seasonal,leafColor,seasonName} from './season.js';
import {roadCurvature} from './road.js';
import {REFL} from './reflect.js';
/* ---------------------------------------------------------------- scenery */

// Terrain and road strips have a fixed number of rows and columns, so their geometry is recycled
// from the pool and rewritten in place (no new buffers while driving).
const T_ROWS=Math.floor(CH/5)+1,T_COLS=LXS.length,R_ROWS=Math.floor(CH/3)+1;
function gridIndex(rows,cols){const idx=new Uint16Array((rows-1)*(cols-1)*6);let k=0;for(let r=0;r<rows-1;r++)for(let i=0;i<cols-1;i++){const a=r*cols+i,b=a+1,d=a+cols,e=d+1;idx[k++]=a;idx[k++]=b;idx[k++]=d;idx[k++]=b;idx[k++]=e;idx[k++]=d;}return new T.BufferAttribute(idx,1);}
function gridGeometry(key,rows,cols,layout){return acquire(key,()=>{const g=new T.BufferGeometry(),n=rows*cols;for(const [name,size] of Object.entries(layout))g.setAttribute(name,new T.BufferAttribute(new Float32Array(n*size),size));g.setIndex(gridIndex(rows,cols));return g;});}
const touch=g=>{for(const k in g.attributes)g.attributes[k].needsUpdate=true;fitBounds(g,g.attributes.position.count);return g;};

function buildTerrain(start,ox){const gen=buildTerrainGen(start,ox);let st;while(!(st=gen.next()).done);return st.value;}

function* buildTerrainGen(start,ox){
  const g=gridGeometry('terrain',T_ROWS,T_COLS,{position:3,normal:3,color:3,uv:2,splat:4}),A=g.attributes;
  const pos=A.position.array,nor=A.normal.array,col=A.color.array,uv=A.uv.array,spl=A.splat.array,c=_tc,v0=((start%840)+840)%840;
  let v=0;
  for(let row=0;row<T_ROWS;row++){if(row%2===1)yield;const s=start+row*5,P=terrainParams(s),rx=roadX(s),ry=roadHeight(s);
    for(const lx of LXS){const xw=rx+sideX(s,lx),h=groundHeight(s,lx,P,xw);
      const hx=(groundAtX(s,xw+1.5,P)-groundAtX(s,xw-1.5,P))/3,hs=(groundAtX(s+1.5,xw,P)-groundAtX(s-1.5,xw,P))/3;
      const nl=Math.hypot(hx,1,hs),slope=Math.hypot(hx,hs),ax=Math.abs(lx);
      pos[v*3]=xw-ox;pos[v*3+1]=h;pos[v*3+2]=-(s-start);nor[v*3]=-hx/nl;nor[v*3+1]=1/nl;nor[v*3+2]=hs/nl;uv[v*2]=xw/7;uv[v*2+1]=(v0+s-start)/7;
      groundColor(s,lx,h,h-ry,slope,P,c,spl,v*4);col[v*3]=c.r;col[v*3+1]=c.g;col[v*3+2]=c.b;v++;}}
  const m=new T.Mesh(touch(g),MAT.terrain);m.receiveShadow=true;return m;}
const _tc=new T.Color(),_rt=new T.Color(),_white=new T.Color('#ffffff');

function buildRoad(start,ox){
  const H=ROAD.half,E=H+1.5,cols=[[-E,1],[-H,1],[-H,0],[0,0],[H,0],[H,1],[E,1]];
  const g=gridGeometry('road7',R_ROWS,cols.length,{position:3,normal:3,color:3,uv:2}),A=g.attributes;
  const pos=A.position.array,nor=A.normal.array,col=A.color.array,uv=A.uv.array,tint=_rt;let v=0;
  const TE=G.trip?G.trip.end:Infinity;
  for(let row=0;row<R_ROWS;row++){const s=start+row*3,P=terrainParams(s),rx=roadX(s),tb=Math.tan(roadBank(s)),gr=roadGrade(s),nl=Math.hypot(tb,1,gr),gone=s>TE+5?-80:0;tint.copy(P.verge).multiplyScalar(1.15);
    for(const [lx,shoulder] of cols){pos[v*3]=rx+sideX(s,lx)-ox;pos[v*3+1]=roadSurface(s,lx)+(Math.abs(lx)>H+.5?-.02:.02)+gone;pos[v*3+2]=-(s-start);
      nor[v*3]=-tb/nl;nor[v*3+1]=1/nl;nor[v*3+2]=gr/nl;
      uv[v*2]=(lx+E)/(E*2);uv[v*2+1]=s/ROAD_TILE;/* continuous along the journey: no repeat per section */const c=shoulder?tint:_white;col[v*3]=c.r;col[v*3+1]=c.g;col[v*3+2]=c.b;v++;}}
  const m=new T.Mesh(touch(g),MAT.road);m.receiveShadow=true;return m;}
// Scanned models can be extremely detailed (some Poly Haven trees are 600k triangles), so each kind has a
// triangle limit and only a few are placed per road section; the rest use the light built-in models.

const USABLE_MODELS=ASSETS&&Object.keys(ASSETS.models).length?ASSETS.models:null;

function makeChunk(index){const gen=chunkBuilder(index);let step;while(!(step=gen.next()).done);return step.value;}
// Builds a road section in small steps so new sections never cause a stutter (see the frame loop).

function* chunkBuilder(index){
  const start=index*CH,g=new T.Group(),r=rand(index+989+roadSeed()*7919),b=biomeAt(start),bio=BIOMES[b],ox=roadX(start);
  g.userData={index,b,ox,start};
  const OBS=[],obs=(s,side,rad)=>{OBS.push(s,side,rad);},LIGHTS=[],CHIM=[],SPIN=[];   // lamp heads, for their reflections in a wet road
  const P0=terrainParams(start+60);
  const L=(s,lx)=>[roadX(s)+sideX(s,lx)-ox,-(s-start)];
  const near={solid:new Batch(),foliage:new Batch({sway:true})},far={solid:new Batch(),foliage:new Batch({sway:true})};
  const lamps=new Batch(),windows=new Batch(),pools=new Batch({uv:true}),signs=new Batch({uv:true}),wires=[];
  const HQ=USABLE_MODELS,perChunk={},lod={solid:new Batch(),foliage:new Batch({sway:true})},inst=new Map();let forced=null;
  // the ground as it is drawn: exact near the road; further out, between the terrain mesh's points (its
  // columns there are tens of metres apart, so on a rounded hill the drawn ground is lower than the exact one)
  const gridH=new Map(),gridAt=(row,ci)=>{const k=row*64+ci;let h=gridH.get(k);if(h===undefined){const ss=start+row*5;h=groundHeight(ss,LXS[ci],terrainParams(ss));gridH.set(k,h);}return h;};
  const meshY=(s,lx)=>{const f=(s-start)/5,r0=Math.floor(f),tr=f-r0;let ci=0;while(ci<LXS.length-2&&LXS[ci+1]<lx)ci++;
    const tc=Math.min(1,Math.max(0,(lx-LXS[ci])/(LXS[ci+1]-LXS[ci])));
    return (gridAt(r0,ci)*(1-tc)+gridAt(r0,ci+1)*tc)*(1-tr)+(gridAt(r0+1,ci)*(1-tc)+gridAt(r0+1,ci+1)*tc)*tr;};
  const set=lx=>forced||(Math.abs(lx)<75?near:far), groundY=(s,lx)=>Math.abs(lx)<12.5?groundHeight(s,lx,P0):Math.min(groundHeight(s,lx,P0),meshY(s,lx));
  const TE=G.trip?G.trip.end:Infinity;
  const inRiver=(s,lx)=>{const rv=riverAt(s);return rv&&rv.amp>.2&&Math.abs(lx-rv.lat)<rv.w*.5+3;};
  const riverHere=[start,start+40,start+80,start+CH].some(s=>riverAt(s));
  if(riverHere)for(const B of [near.solid,near.foliage,far.solid,far.foliage,lamps,windows,pools,signs,lod.solid,lod.foliage]){const add=B.add.bind(B);
    B.add=(t,m,c,o)=>{const e=m.elements,s=start-e[14],lx=(e[12]-(roadX(s)-ox))*roadCos(s);if(inRiver(s,lx))return;add(t,m,c,o);};}
  if(TE<start+CH+40)for(const B of [near.solid,near.foliage,far.solid,far.foliage,lamps,windows,pools,signs,lod.solid,lod.foliage]){const add=B.add.bind(B);
    B.add=(t,m,c,o)=>{const e=m.elements,s=start-e[14];if(s>TE+8){const lx=(e[12]-(roadX(s)-ox))*roadCos(s);if(Math.abs(lx)<45||s>TE+60)return;}add(t,m,c,o);};}
  function place(role,s,lx,size,rot){const list=HQ?.[role],lim=MODEL_LIMITS[role];if(!list||Math.abs(lx)>90||(perChunk[role]||0)>=lim.perChunk)return false;
    const mdl=list[Math.floor(r()*list.length)];let k=size/mdl.size;const room=Math.abs(lx)-8.6,half=mdl.width*k/2;
    if(half>room){k=room*2/mdl.width;if(k*mdl.height<size*.45)return false;} // too wide for this spot: keep the low-poly version
    perChunk[role]=(perChunk[role]||0)+1;const [x,z]=L(s,lx);
    if(!inst.has(mdl))inst.set(mdl,[]);inst.get(mdl).push(M(x,groundY(s,lx)-.08,z,k,k,k,rot??r()*6.283));return true;}
  // A real model near the camera, the low-poly version (in 'lod') when far away.
  const withModel=(role,size,fn)=>(s,lx,...a)=>{const hq=place(role,s,lx,size()*(a[0]||1));if(hq)forced=lod;fn(s,lx,...a);forced=null;};
  const SZS=start+CH/2,SZ=seasonName(SZS),snowy=b==='snow',winter=!!season(SZS).snow&&seasonal(b)>0,alien=b==='planet',SZN=season(SZS);
  const leaves=base=>leafColor(base,r,b,SZS);
  // bare branches for leafless trees in winter
  function branches(B,x,y0,z,h,scale){for(let i=0;i<5;i++){const a=i*1.26+r(),l=h*(.22+r()*.12),tilt=.55+r()*.35;
    B.solid.add(cylT(.5,5),M(x+Math.sin(a)*l*.35*Math.sin(tilt),y0+h*(.55+r()*.15)+l*.4*Math.cos(tilt),z+Math.cos(a)*l*.35*Math.sin(tilt),.07*scale,l,.07*scale,a,tilt,0),'#5d4c3c',{ao:.6});}}

  // broadleaf trees with layered crowns in three shapes: wide and round (oak), tall and oval (ash),
  // and a rounded cone (lime). Near trees get limbs and more clumps; far ones fewer.
  // broadleaf tree: a full rounded crown (a core with clumps of leaves around its surface, brighter on
  // top and darker underneath) on a trunk that reaches up into it. Three shapes: round, upright oval, spreading.
  let deciduous=function(s,lx,scale=1,tint){obs(s,lx,.35*scale);const B=set(lx),nr=B===near,[x,z]=L(s,lx),y0=groundY(s,lx)-.15;
    const kind=r(),h=(kind<.45?7+r()*4:kind<.75?8+r()*5:7+r()*4)*scale,R=h*(kind<.45?.36:kind<.75?.27:.37),
      sx=kind<.75?1:1.2,sy=kind<.45?.86:kind<.75?1.32:.7,lean=(r()-.5)*.05;
    const cy=y0+h-R*sy*.95,lc=leaves(tint?C(tint):bio.treeC);
    B.solid.add(cylT(.6,6),M(x,y0+(cy-y0)*.5,z,.24*scale,cy-y0,.24*scale,r()*6,lean,lean),'#5f4e3d',{ao:.45});
    if(!lc){branches(B,x,y0,z,h,scale);return;}
    const tc=lc.offsetHSL((r()-.5)*.03,(r()-.5)*.08,(r()-.5)*.06),sw={sway:1,swayBase:y0+h*.35,swayH:h*.7};
    if(nr)for(let k=0;k<3;k++){const a=k*2.1+r();B.solid.add(cylT(.5,5),M(x+Math.sin(a)*R*.3,cy-R*sy*.15,z+Math.cos(a)*R*.3,.08*scale,R*.9,.08*scale,a,.85,0),'#5f4e3d',{ao:.55});}
    // the core fills the crown so no gaps show through
    B.foliage.add(blobT(r,nr),M(x,cy,z,R*sx*.86,R*sy*.86,R*sx*.86,r()*6),tc.clone().multiplyScalar(.8),{ao:.5,top:.25,vary:.1,...sw});
    // clumps around the surface: evenly spread (golden angle), from the sides up to the top
    const n=nr?11:5,a0=r()*6.283;
    for(let i=0;i<n;i++){const th=a0+i*2.39996,el=-.6+(i+.5)/n*1.75,ce=Math.cos(el),k=.58+r()*.08,cr=R*(.48+r()*.1)*(1-.15*Math.max(0,el));
      const px=x+Math.sin(th)*ce*R*sx*k,py=cy+Math.sin(el)*R*sy*k,pz=z+Math.cos(th)*ce*R*sx*k;
      const shade=.82+.3*(Math.sin(el)*.5+.5);   // lit tops, shaded undersides
      B.foliage.add(blobT(r,nr),M(px,py,pz,cr*1.08,cr*.92,cr*1.05,r()*6),tc.clone().multiplyScalar(shade).offsetHSL(0,0,(r()-.5)*.04),{ao:.6,top:.22,vary:.12,...sw});}}
  let poplar=function(s,lx){obs(s,lx,.3);const B=set(lx),nr=B===near,[x,z]=L(s,lx),y0=groundY(s,lx)-.15,h=10+r()*5,lc=leaves(bio.treeC);
    if(!lc){B.solid.add(cylT(.6,6),M(x,y0+h*.4,z,.2,h*.8,.2),'#5f4f3f',{ao:.5});branches(B,x,y0+h*.1,z,h*.8,.7);return;}
    const tc=lc.offsetHSL(.02,0,-.03),sw={sway:1,swayBase:y0+h*.3,swayH:h*.7};
    B.solid.add(cylT(.6,6),M(x,y0+h*.3,z,.2,h*.6,.2),'#6b5a45',{ao:.5});
    // a column of clumps, widest a third of the way up, narrowing to the tip
    const n=nr?7:4;
    for(let i=0;i<n;i++){const f=i/(n-1),y=y0+h*(.2+f*.72),w=h*.11*(1-f*.65)*(f<.3?.85+f*.5:1),a=r()*6.28,o=w*.25;
      B.foliage.add(blobT(r,nr),M(x+Math.sin(a)*o,y,z+Math.cos(a)*o,w,h*.13,w,r()*6),tc.clone().multiplyScalar(.82+f*.3),{ao:.55,top:.2,vary:.12,...sw});}}
  let pine=function(s,lx,scale=1){obs(s,lx,.3*scale);const B=set(lx),[x,z]=L(s,lx),y0=groundY(s,lx)-.2,h=(6+r()*8)*scale,tc=bio.treeC.clone().offsetHSL((r()-.5)*.03,0,(r()-.5)*.06);
    B.solid.add(cylT(.5,6),M(x,y0+h*.15,z,.22*scale,h*.3,.22*scale),'#5b4a3a',{ao:.5});
    const tiers=B===near?5:3;for(let i=0;i<tiers;i++){const f=i/tiers,rad=h*(.34-f*.26),y=y0+h*(.25+f*.62),th=h*(.42-f*.12),ry=r()*6;
      B.foliage.add(coneT(B===near?9:6),M(x,y+th/2,z,rad,th,rad,ry),tc.clone().multiplyScalar(.8+f*.35),{ao:.45,vary:.12,sway:.6,swayBase:y0+h*.3,swayH:h*.7});
      if(snowy||winter||(b==='mountain'&&y0>30))B.foliage.add(coneT(B===near?9:6),M(x,y+th*.62,z,rad*.8,th*.55,rad*.8,ry),SNOW,{ao:.85,sway:.6,swayBase:y0+h*.3,swayH:h*.7});}}
  // birch: slender white trunk with dark marks, small light crown
  function birch(s,lx){obs(s,lx,.22);const B=set(lx),[x,z]=L(s,lx),y0=groundY(s,lx)-.1,h=8+r()*5,lc=leaves(C('#8fae55'));
    B.solid.add(cylT(.6,6),M(x,y0+h*.4,z,.17,h*.8,.17,r()*6),'#e6e2d6',{ao:.7,vary:.25});
    for(let k=0;k<3;k++)B.solid.add(boxT(),M(x,y0+h*(.15+k*.2),z,.19,.12,.19,r()*6),'#3d3a35');
    if(!lc){branches(B,x,y0,z,h,.6);return;}
    for(let i=0;i<3;i++){const a=i*2.1+r(),rad=h*(.13+r()*.06);B.foliage.add(blobT(r,B===near),M(x+Math.sin(a)*h*.07,y0+h*(.62+i*.1),z+Math.cos(a)*h*.07,rad,rad*1.25,rad,r()*6),lc.clone().offsetHSL(0,0,(r()-.5)*.06),{ao:.55,top:.25,vary:.14,sway:1.2,swayBase:y0+h*.4,swayH:h*.6});}}
  // spruce: tall narrow dark cone in many tiers
  function spruce(s,lx,scale=1){obs(s,lx,.3*scale);const B=set(lx),[x,z]=L(s,lx),y0=groundY(s,lx)-.2,h=(9+r()*9)*scale,tc=bio.treeC.clone().offsetHSL(-.01,-.05,-.05-r()*.04),tiers=B===near?7:4;
    B.solid.add(cylT(.5,6),M(x,y0+h*.1,z,.2*scale,h*.2,.2*scale),'#4e3f32',{ao:.5});
    for(let i=0;i<tiers;i++){const f=i/tiers,rad=h*(.2-f*.16),y=y0+h*(.12+f*.78),th=h*(.26-f*.08),ry=r()*6;
      B.foliage.add(coneT(B===near?8:6),M(x,y+th/2,z,rad,th,rad,ry),tc.clone().multiplyScalar(.85+f*.25),{ao:.45,vary:.1,sway:.5,swayBase:y0+h*.3,swayH:h*.7});
      if(snowy||winter)B.foliage.add(coneT(6),M(x,y+th*.6,z,rad*.78,th*.5,rad*.78,ry),SNOW,{ao:.85,sway:.5,swayBase:y0+h*.3,swayH:h*.7});}}
  // a tall eroded rock spire (the alien world)
  function spire(s,lx){const B=set(lx),[x,z]=L(s,lx),y0=groundY(s,lx)-.5,h=14+r()*30,w=5+r()*7;obs(s,lx,w*.45);
    for(let k=0;k<4;k++){const f=k/4;B.solid.add(rockT(r),M(x+(r()-.5)*w*.3,y0+h*(f+.13),z+(r()-.5)*w*.3,w*(1-f*.55),h*.3,w*(1-f*.5)*(.8+r()*.4),r()*6),bio.rockC.clone().offsetHSL(0,0,(f-.5)*.08),{ao:.6,top:.2,vary:.2});}}
  function rock(s,lx,size,col){if(size>=.5)obs(s,lx,size*.55);if(size<5&&place('rock',s,lx,size*1.5))return;const B=set(lx),[x,z]=L(s,lx),h=size*.6;
    // settle into the slope: sit at the lowest of the ground around it, tilted with the hillside
    const ga=groundY(s-h,lx),gb=groundY(s+h,lx),gc=groundY(s,lx-h),gd=groundY(s,lx+h),y0=Math.min(ga,gb,gc,gd,groundY(s,lx));
    B.solid.add(rockT(r),M(x,y0+size*.12,z,size*(1+r()*.5),size*(.45+r()*.35),size*(1+r()*.4),r()*6,Math.atan2(ga-gb,2*h)*.8,Math.atan2(gd-gc,2*h)*.8),col,{ao:.6,top:.15,vary:.2});
    // a few small stones scattered around it
    if(B===near&&size>.6)for(let k=0;k<3;k++){const a2=r()*6.28,dd=size*(.7+r()*.8),ps=s+Math.cos(a2)*dd,pl=lx+Math.sin(a2)*dd,[px,pz]=L(ps,pl),pe=size*(.08+r()*.12);
      B.solid.add(rockT(r),M(px,groundY(ps,pl)+pe*.2,pz,pe,pe*.6,pe,r()*6),col,{ao:.6,top:.15,vary:.25});}}
  function tufts(s,lx,col,flowers){const B=set(lx),[x,z]=L(s,lx),y0=groundY(s,lx);for(let k=0;k<3;k++){const h=.35+r()*.4;B.foliage.add(coneT(4),M(x+(r()-.5)*.6,y0+h/2,z+(r()-.5)*.6,.09+r()*.06,h,.09+r()*.06,r()*6,(r()-.5)*.5,(r()-.5)*.5),col,{ao:.5,sway:.4,swayBase:y0,swayH:h});}
    if(flowers&&r()<SZN.flowers){const fc=['#f2d36b','#f4f1e6','#a98ad3','#df6a52'][Math.floor(r()*4)];B.foliage.add(boxT(),M(x,y0+.55,z,.12,.08,.12),fc,{sway:.4,swayBase:y0,swayH:.6});}}
  deciduous=withModel('tree',()=>9+r()*6,deciduous);poplar=withModel('tree',()=>11+r()*5,poplar);pine=withModel('pine',()=>11+r()*8,pine);
  let cactus=function(s,lx){obs(s,lx,.3);const B=set(lx),[x,z]=L(s,lx),y0=groundY(s,lx)-.1,h=2.6+r()*2.4,c='#5f7d4b';
    B.solid.add(cylT(1,8),M(x,y0+h/2,z,.28,h,.28),c,{ao:.55,vary:.1});B.solid.add(sphT(),M(x,y0+h,z,.28,.3,.28),c);
    for(const sd of [-1,1]){if(r()<.75){const ay=y0+h*(.38+r()*.25),al=.5+r()*.3,ah=.7+r()*.9,ry=r()*Math.PI;const dx=Math.cos(ry)*sd,dz=Math.sin(ry)*sd;
      B.solid.add(cylT(1,7),M(x+dx*al/2,ay,z+dz*al/2,.18,al,.18,-ry,0,Math.PI/2),c,{vary:.1});B.solid.add(cylT(1,7),M(x+dx*al,ay+ah/2,z+dz*al,.18,ah,.18),c,{ao:.7});B.solid.add(sphT(),M(x+dx*al,ay+ah,z+dz*al,.18,.2,.18),c);}}}
  cactus=withModel('desert',()=>4.5+r()*3,cactus);
  // houses from a model kit you added: facing the road (or their street); the built-in house stays for far away
  if(HQ?.house){const own=house;house=(s,lx,o={})=>{if(!o.barn&&r()<.7){const ry=o.ry!==undefined?roadYaw(s)+o.ry:lx>0?-Math.PI/2:Math.PI/2;if(place('house',s,lx,9+r()*3,ry))forced=lod;}own(s,lx,o);forced=null;};}
  // Build from parts in a local frame facing the road (x along the road, z towards it, y up).
  function parts(B,s,lx,list,yOff=0,turn=null){const [x,z]=L(s,lx),y0=groundY(s,lx)+yOff,ry=turn??(roadYaw(s)+(lx>0?-Math.PI/2:Math.PI/2)),base=M(x,y0,z,1,1,1,ry);
    for(const [t,col,px,py,pz,sx,sy,sz,rx=0,rry=0,rz=0,o={}] of list)(o.batch||B).add(t,base.clone().multiply(M(px,py,pz,sx,sy,sz,rry,rx,rz)),col,o);}
  // villages: every few kilometres, a cluster of houses with a church and a petrol station
  const VSEG=2600,vn=Math.floor((start+CH/2)/VSEG),vc=vn*VSEG+600+hash2(vn,77)*1400,hasVillage=hash2(vn,78)<.75&&['fields','coast','mountain','snow'].includes(b)&&!structureAt(vc)&&!structureAt(vc+90);
  const inVillage=s=>hasVillage&&Math.abs(s-vc)<150,vSide=hash2(vn,79)<.5?-1:1;
  // side streets: two in each village, one every 240 m in a town (houses along them face the street)
  const STREETS=[];if(hasVillage)STREETS.push({sc:vc-70,side:vSide},{sc:vc+42,side:-vSide});
  if(b==='town')for(let k=Math.floor((start-40)/240);k<=Math.floor((start+CH+40)/240);k++)STREETS.push({sc:k*240+120,side:hash2(k,515)<.5?-1:1});
  for(let i=STREETS.length-1;i>=0;i--)if(structureAt(STREETS[i].sc)||structureAt(STREETS[i].sc+20)||structureAt(STREETS[i].sc-20))STREETS.splice(i,1);
  const nearStreet=(s,side)=>STREETS.some(t=>t.side===side&&Math.abs(s-t.sc)<16);
  function church(s,lx){const B=set(lx).solid,stone='#d9d3c5',slate='#5b5e63';obs(s,lx,8);{const [cx,cz]=L(s,lx);g.userData.church=[cx,groundY(s,lx)+14,cz,s];}
    parts(B,s,lx,[[boxT(),stone,0,3,0,12,6,7],[prismT(),slate,0,6,0,12.6,3.4,7.8],[boxT(),stone,-7.6,6,0,3.8,12,3.8],[coneT(4),slate,-7.6,16,0,3,8,3,0,Math.PI/4],
      [boxT(),'#3b2d24',-7.6,1.3,1.95,1.3,2.6,.1],[boxT(),'#c9c2b0',0,.2,0,13,.4,7.6]]);
    parts(windows,s,lx,[[boxT(),'#ffffff',-3,3.4,3.55,.8,2.2,.08],[boxT(),'#ffffff',0,3.4,3.55,.8,2.2,.08],[boxT(),'#ffffff',3,3.4,3.55,.8,2.2,.08]]);}
  function petrol(s,lx){const B=set(lx).solid,white='#ecebe6',amber='#f4b33d';obs(s,lx,7.5);
    parts(B,s,lx,[[boxT(),white,0,5,2.5,12,.5,7],[boxT(),amber,0,4.7,2.5,12.1,.25,7.1],[boxT(),white,0,1.8,-4.5,8,3.6,6],[boxT(),'#566064',0,3.75,-4.5,8.2,.3,6.2],
      [boxT(),'#e9e9e9',-2.2,.8,2.5,.8,1.6,.5],[boxT(),'#2f8f6a',2.2,.8,2.5,.8,1.6,.5],[cylT(1,8),'#7a8084',7.5,3.5,4.5,.12,7,.12],[boxT(),amber,7.5,6.6,4.5,2.4,1.7,.3],
      ...[[-5,0],[5,0],[-5,5],[5,5]].map(([px,pz])=>[cylT(1,8),white,px,2.5,pz,.18,5,.18])]);
    parts(windows,s,lx,[[boxT(),'#ffffff',0,1.8,-1.45,6,1.5,.08]]);}
  // animals: sheep and cows grazing in the fields, deer near the woods at dawn and dusk
  const deerB=new Batch();
  function sheep(s,lx,grazing){obs(s,lx,.9);parts(set(lx).solid,s,lx,[[boxT(),'#ebe7dc',0,.78,0,1.15,.72,.7,0,0,0,{vary:.12,top:.15}],[boxT(),'#2d2a27',.68,grazing?.45:.9,0,.4,.36,.32,0,0,grazing?-.6:0],
    ...[[-.36,-.2],[-.36,.2],[.36,-.2],[.36,.2]].map(([px,pz])=>[boxT(),'#2d2a27',px,.25,pz,.12,.5,.12])],0,r()*6.28);}
  function cow(s,lx,grazing){obs(s,lx,1.3);const col=['#3a2e27','#f1eee8','#7a4a2c','#1f1d1c'][Math.floor(r()*4)];
    parts(set(lx).solid,s,lx,[[boxT(),col,0,1.2,0,1.9,1,.85,0,0,0,{vary:.15}],[boxT(),r()<.5?'#f1eee8':col,.35,1.32,.01,.7,.6,.88],[boxT(),col,1.12,grazing?.65:1.25,0,.55,.5,.45,0,0,grazing?-.7:0],
      ...[[-.65,-.28],[-.65,.28],[.65,-.28],[.65,.28]].map(([px,pz])=>[boxT(),'#2a2420',px,.45,pz,.16,.9,.16])],0,r()*6.28);}
  function deer(s,lx){const ry=r()*6.28,col='#8a5a3a';parts(deerB,s,lx,[[boxT(),col,0,1.05,0,1.15,.55,.4],[boxT(),col,.62,1.45,0,.18,.6,.18,0,0,-.4],[boxT(),'#6d452c',.82,1.75,0,.38,.22,.2],
    ...[[-.42,-.13],[-.42,.13],[.42,-.13],[.42,.13]].map(([px,pz])=>[boxT(),'#5c3b26',px,.42,pz,.08,.85,.08])],0,ry);}
  // A weeping willow: a leaning trunk and long curtains of pale leaves hanging almost to the ground.
  function willow(s,lx){obs(s,lx,.5);const B=set(lx),[x,z]=L(s,lx),y0=groundY(s,lx)-.1,lean=(r()-.5)*.25,col=C('#9db35a').offsetHSL((r()-.5)*.03,0,(r()-.5)*.06);
    B.solid.add(cylT(.7,7),M(x,y0+2,z,.38,4,.38,0,lean),'#5e5040',{ao:.6,vary:.15});const tx=x+Math.sin(lean)*-3.5,ty=y0+4.6;
    B.foliage.add(blobT(r,true),M(tx,ty+.6,z,2.6,1.5,2.6,r()*6),col.clone().multiplyScalar(.95),{ao:.5,top:.25,vary:.15,sway:.25,swayBase:y0+2,swayH:4});
    for(let k=0;k<11;k++){const a=k/11*6.283+r()*.3,d=1.6+r()*1.2,hh=2.2+r()*1.2;
      B.foliage.add(blobT(r,true),M(tx+Math.cos(a)*d,ty-hh/2+.4,z+Math.sin(a)*d,.75+r()*.3,hh,.75+r()*.3,r()*6),col.clone().multiplyScalar(.85+r()*.25),{ao:.55,top:.15,vary:.15,sway:.45,swayBase:ty+.6,swayH:-hh});}}
  // A gravel farm lane from the road to a house: two wheel tracks with grass between, following the ground.
  function lane(s,lx,stop){const sg=Math.sign(lx),a0=ROAD.shoulder+.4,a1=Math.abs(lx)-stop;if(a1-a0<3)return;const B=set(lx),n=Math.ceil((a1-a0)/3);let p=null;
    for(let i=0;i<=n;i++){const lp=a0+(a1-a0)*i/n,[x,z]=L(s,sg*lp),q={x,z,y:groundY(s,sg*lp)+.05};
      if(p){const len=Math.hypot(q.x-p.x,q.z-p.z),ry=Math.atan2(p.x-q.x,p.z-q.z),rx=-Math.atan2(p.y-q.y,len),mx=(p.x+q.x)/2,my=(p.y+q.y)/2,mz=(p.z+q.z)/2;
        B.solid.add(boxT(),M(mx,my-.02,mz,2.8,.1,len+.25,ry,rx),'#9e9482',{vary:.2,ao:.8,top:.1});
        B.solid.add(boxT(),M(mx,my+.035,mz,.55,.06,len+.25,ry,rx),P0.ground.clone().multiplyScalar(.95),{vary:.2,ao:.8});}
      p=q;}}
  // Houses face the road. Local frame: x along the front, z out of the front (towards the road), y up.
  function house(s,lx,o={}){obs(s,lx,o.barn?5.5:4.5);
    const B=set(lx),[x,z]=L(s,lx),y0=groundY(s,lx),base=M(x,y0,z,1,1,1,o.ry!==undefined?roadYaw(s)+o.ry:lx>0?-Math.PI/2:Math.PI/2),I=new T.Matrix4();
    const pick=a=>C(a[Math.floor(r()*a.length)]);
    const put=(t,col,F,p,sz,rot=[0,0,0],opt={})=>B.solid.add(t,base.clone().multiply(F).multiply(M(p[0],p[1],p[2],sz[0],sz[1],sz[2],rot[0],rot[1],rot[2])),col,opt);
    const pane=(F,p,sz,lit)=>{const m=base.clone().multiply(F).multiply(M(p[0],p[1],p[2],sz[0],sz[1],sz[2]));if(lit)windows.add(boxT(),m,C('#ffffff').multiplyScalar(.7+r()*.3));else B.solid.add(boxT(),m,C('#2b383c'));};
    const trim=C('#efece4'),stone=C('#8b877f'),FOUND=.45;
    const kind=o.barn?'barn':o.town?(r()<.55?'shop':'townhouse'):(snowy||b==='mountain')?'cabin':(()=>{const q=r();return q<.35?'cottage':q<.65?'farmhouse':q<.85?'bungalow':'modern';})();
    const modern=kind==='modern',bung=kind==='bungalow';if(modern)trim.set('#2e3133');

    if(kind==='barn'){barn();lane(s,lx,7.3);return;}
    const shop=kind==='shop',cabin=kind==='cabin';
    const w=shop?8+r()*3:bung?10+r()*2:modern?9+r()*2:kind==='farmhouse'?9+r()*2:kind==='townhouse'?6.5+r()*1.5:7+r()*2;
    const d=shop?9:kind==='townhouse'?8:bung||modern?7.5:6+r()*1.5;
    const floors=shop?2:kind==='farmhouse'||modern?2:kind==='townhouse'?2+(r()<.4?1:0):1;
    const fh0=shop?3.4:2.8,fh=2.8,h=fh0+(floors-1)*fh;
    const wall=shop?pick(['#8d4b3b','#7d4a3c','#9a5a45','#6e4436']):cabin?C('#6b4e36'):kind==='townhouse'?pick(['#e8dcc6','#d9c3a5','#cfd5d0','#e6d2c3','#c9b7a0']):pick(['#e9e6dc','#e3d6b8','#b9c7cc','#a9b59b','#d7d3c8','#e2c98a','#c4b29a','#f0e3c8','#d8b49c','#b8c4b0','#d4a59a','#9fb2c0','#efe9e1']);
    const stoneWall=kind==='cottage'&&!snowy&&r()<.3;if(stoneWall)wall.set(pick(['#9d968a','#a89c86','#8f8a80']));if(modern)wall.set(pick(['#ecebe6','#d9d9d4','#3c4044','#f2efe8','#5b5148']));
    const roofC=snowy?C('#e7eef1'):pick(['#4a4d4f','#3a3c3e','#5d4536','#7a4a38','#4f5f52','#8c4a32','#9a5a3c','#3f4a57','#6a3b2e','#7d6a4a']);
    const shutterC=pick(['#2f4a3e','#3b4b5c','#5a2f2a','#2b2f31']),doorC=pick(['#5b2e28','#2f4a3e','#2d3e52','#7a5a3a']);
    const front=M(0,0,d/2),hasShutters=!shop&&!cabin&&!modern&&r()<.6;

    // foundation and walls
    put(boxT(),stone,I,[0,FOUND/2,0],[w+.24,FOUND,d+.24],[0,0,0],{vary:.12});
    put(boxT(),wall,I,[0,FOUND+h/2,0],[w,h,d],[0,0,0],{ao:.8,vary:.04});
    if(stoneWall){ // rubble stone with dressed corner stones
      for(let i=0;i*.45<h-.2;i++)for(const sx of [-1,1])for(const sz of [-1,1])put(boxT(),C('#c9c1b0'),I,[sx*w/2,FOUND+(i+.5)*.45,sz*d/2],[i%2?.62:.34,.38,i%2?.34:.62],[0,0,0],{vary:.1});
      for(let i=0;i<18;i++)put(boxT(),wall.clone().multiplyScalar(.85+r()*.25),I,[(r()-.5)*(w-.8),FOUND+.3+r()*(h-.6),(d/2+.03)*(r()<.5?1:-1)],[.4+r()*.4,.22+r()*.12,.06]);
    }else if(!shop&&!modern){ // lap siding or logs: slightly proud boards that catch the light
      const band=cabin?.3:.26,n=Math.floor(h/band);
      for(let i=0;i<n;i+=2)put(boxT(),wall.clone().multiplyScalar(cabin?.82:.96),I,[0,FOUND+(i+.5)*band,0],[w+.04,band*.55,d+.04],[0,0,0],{vary:cabin?.12:.03});
      if(!cabin)for(const sx of [-1,1])for(const sz of [-1,1])put(boxT(),trim,I,[sx*w/2,FOUND+h/2,sz*d/2],[.16,h,.16]);
      else for(const sx of [-1,1])for(const sz of [-1,1])for(let i=0;i<n;i+=2)put(cylT(1,6),wall.clone().multiplyScalar(.7),I,[sx*(w/2+.08),FOUND+(i+.5)*band,sz*(d/2+.08)],[.15,.4,.15],[0,0,Math.PI/2]);
    }else{ // brick: stone bands at each floor and a cornice with parapet on top
      put(boxT(),stone,I,[0,FOUND+fh0,0],[w+.12,.18,d+.12]);
      put(boxT(),trim,I,[0,FOUND+h+.15,0],[w+.4,.3,d+.4],[0,0,0],{ao:.9});
      put(boxT(),wall,I,[0,FOUND+h+.55,0],[w,.5,d]);
      put(boxT(),stone,I,[0,FOUND+h+.83,0],[w+.14,.1,d+.14]);
    }

    // roof
    if(!shop&&!modern){
      const ov=.45,rh=cabin?d*.62:d*(.42+r()*.12)*(bung?.75:1),a=Math.atan2(rh,d/2),rb=FOUND+h,ridge=rb+rh,W=w+2*ov,D=d+2*ov,eave=ridge-(D/2)*Math.tan(a),Ls=(D/2)/Math.cos(a);
      if(!bung){put(prismT(),wall,I,[0,rb-.01,0],[w,rh,d],[0,0,0],{end:wall,ao:.85});
      const K=Math.max(5,Math.round(Ls/.42));
      for(const sd of [-1,1])for(let k=0;k<K;k++){const t=(k+.5)/K,zc=sd*(D/2)*(1-t),yc=ridge-Math.abs(zc)*Math.tan(a)+.05;
        put(boxT(),roofC.clone().multiplyScalar(.86+(k%2)*.12+r()*.05),I,[0,yc,zc],[W,.07,Ls/K*1.18],[0,sd*a,0],{vary:.06});}
      put(boxT(),roofC.clone().multiplyScalar(.78),I,[0,ridge+.06,0],[W+.02,.15,.32]);
      for(const sd of [-1,1]){put(boxT(),trim,I,[0,eave-.06,sd*D/2],[W,.2,.07]);
        for(const sz of [-1,1])put(boxT(),trim,I,[sd*W/2,(eave+ridge)/2,sz*D/4],[.07,.22,Ls+.05],[0,sz*a,0]);}
      }else{ // a hipped roof: four slopes up to a point, with a deep fascia
        put(pyrT(),roofC,I,[0,rb+rh/2-.02,0],[W/2,rh,D/2],[0,0,0],{vary:.06,ao:.8,top:.1});put(boxT(),trim,I,[0,rb+.04,0],[W+.04,.22,D+.04]);}
      // chimney
      const nCh=r()<.8?(kind==='farmhouse'&&r()<.5?2:1):0,chSide=r()<.5?-1:1,chCol=cabin||stoneWall?stone:pick(['#7d4b3d','#8a5643','#6b4a3e','#9b9488']);
      for(let ci=0;ci<nCh;ci++){const cx=(cabin?w/2+.2:w*(.24+r()*.1))*chSide*(ci?-1:1),cz=cabin?0:-d*(.05+r()*.15),ch=rh+1.1+r()*.7,col=chCol;
        put(boxT(),col,I,[cx,rb+ch/2-.6,cz],[.75,ch+.6,.75],[0,0,0],{vary:.1,ao:.7});put(boxT(),stone,I,[cx,rb+ch-.25,cz],[.9,.12,.9]);
        for(const k of [-.15,.15])put(cylT(.8,8),C('#9a5a40'),I,[cx+k,rb+ch-.05,cz],[.09,.35,.09]);
        if(r()<.65){const cp=new T.Vector3(cx,rb+ch+.25,cz).applyMatrix4(base);CHIM.push(cp.x,cp.y,cp.z,s);}}
      // a washing line in the back garden, now and then (not in a town or in the rain)
      if(!shop&&!cabin&&kind!=='townhouse'&&r()<.28&&G.weatherNow!=='rainy'&&G.weatherNow!=='snowy'){const lz=-d/2-3.2-r()*1.5,lw=4+r()*2,post=C('#7a6a55');
        for(const sx of [-lw/2,lw/2])put(boxT(),post,I,[sx,FOUND+1.05,lz],[.09,2.1,.09]);put(boxT(),C("#d8d6cf"),I,[0,FOUND+2.02,lz],[lw,.015,.015]);
        const cloths=['#e9e6dd','#c64b3c','#3f6e9e','#f0d36a','#7aa36b','#ffffff','#d89bb0','#5b5f66'];let x=-lw/2+.35;
        while(x<lw/2-.5){const cw=.45+r()*.55,chh=.5+r()*.45;put(boxT(),C(pick(cloths)),I,[x+cw/2,FOUND+2.02-chh/2,lz],[cw,chh,.02],[(r()-.5)*.25,0,(r()-.5)*.06]);x+=cw+.12+r()*.25;}}
    }else if(modern){ // a flat roof with a deep overhang, timber cladding and a dark band
      const rb=FOUND+h;put(boxT(),C('#4a4e52'),I,[0,rb+.18,0],[w+1.2,.36,d+1.2],[0,0,0],{ao:.8});
      const wood=C(pick(['#9a6b45','#8a5d3b','#a57a52'])),cw=w*.38;for(let k=0;k<Math.floor(cw/.22);k++)put(boxT(),wood.clone().multiplyScalar(.9+r()*.2),front,[-w/2+.11+k*.22,FOUND+h/2,.04],[.16,h,.06]);
      put(boxT(),C('#2e3133'),I,[0,FOUND+fh0+.05,0],[w+.06,.14,d+.06]);
    }

    // windows: frame, glass (lit at night), glazing bars, sill, head trim, optional shutters
    const win=(F,cx,cy,ww,wh,shut)=>{put(boxT(),trim,F,[cx,cy,.02],[ww+.18,wh+.18,.08]);pane(F,[cx,cy,.05],[ww,wh,.04],shop&&cy<FOUND+fh0?true:r()<.6);
      if(!shop||cy>FOUND+fh0){put(boxT(),trim,F,[cx,cy,.08],[.05,wh,.03]);put(boxT(),trim,F,[cx,cy+wh*.1,.08],[ww,.05,.03]);}
      put(boxT(),trim,F,[cx,cy-wh/2-.1,.1],[ww+.32,.07,.22]);put(boxT(),shop?stone:trim,F,[cx,cy+wh/2+.13,.05],[ww+.34,shop?.22:.12,.12]);
      if(shut)for(const sd of [-1,1])put(boxT(),shutterC,F,[cx+sd*(ww/2+.33),cy,.06],[.45,wh+.12,.05],[0,0,0],{vary:.05});};
    const cols=Math.max(2,Math.floor(w/2.4)),doorX=shop?0:(kind==='townhouse'?w*.25:0);
    for(let f=0;f<floors;f++){const cy=FOUND+(f===0?(shop?1.7:1.45):fh0+(f-1)*fh+1.45);
      if(f===0&&shop){ // shop front: two big display windows, kick plates, awning and sign
        for(const sd of [-1,1]){const cx=sd*w*.27,ww=w*.33;put(boxT(),C('#22292b'),front,[cx,FOUND+1.55,.03],[ww+.2,2.3,.1]);pane(front,[cx,FOUND+1.7,.08],[ww,1.85,.04],true);put(boxT(),stone,front,[cx,FOUND+.32,.08],[ww+.2,.5,.1]);}
        const ac=pick(['#b8483a','#2f5c58','#c39a3a','#3b4b6c']);for(let i=0;i<8;i++)put(boxT(),i%2?trim:ac,front,[(i+.5)/8*w*.92-w*.46,FOUND+3.05,.75],[w*.92/8,.06,1.5],[0,.33,0]);
        put(boxT(),C('#1f2a29'),front,[0,FOUND+fh0-.1,.06],[w*.7,.55,.08]);put(boxT(),C('#c9a24a'),front,[0,FOUND+fh0-.1,.1],[w*.62,.08,.04]);
        continue;}
      for(let i=0;i<cols;i++){const cx=(i+.5)/cols*w-w/2;if(f===0&&Math.abs(cx-doorX)<1.2)continue;win(front,cx,cy,shop?1.1:modern?1.8:1.0,shop?1.6:modern?1.7:1.3,hasShutters);}
      for(const sd of [-1,1]){const F=M(sd*w/2,0,0,1,1,1,sd*Math.PI/2);win(F,0,cy,1.0,1.3,false);}}

    // door with frame, glazed transom, knob and steps
    const dy=FOUND+1.12;
    put(boxT(),trim,front,[doorX,dy,.03],[1.3,2.4,.1]);put(boxT(),doorC,front,[doorX,dy-.05,.07],[1.02,2.18,.08],[0,0,0],{vary:.04});
    for(const py of [-.5,.45])put(boxT(),doorC.clone().multiplyScalar(.8),front,[doorX,dy+py,.12],[.7,.75,.03]);
    put(sphT(),C('#c9a24a'),front,[doorX+.38,dy-.05,.14],[.05,.05,.05]);
    if(!shop)pane(front,[doorX,dy+1.32,.06],[1.0,.3,.04],r()<.5);
    for(let k=0;k<2;k++)put(boxT(),stone,front,[doorX,FOUND*(1-k)-FOUND/4,.45+k*.35],[1.8-k*.0,FOUND/2,.7]);
    if(kind==='townhouse'||kind==='cottage')put(prismT(),roofC,front,[doorX,dy+1.55,.45],[1.9,.5,1.0]);

    // porch on farmhouses
    if(kind==='farmhouse'&&r()<.75){const pw=w*.8,pd=2.3;put(boxT(),C('#9c8f7c'),front,[0,FOUND-.06,pd/2],[pw,.14,pd]);
      for(const sx of [-.5,-.17,.17,.5])put(cylT(1,8),trim,front,[sx*pw*.96,FOUND+1.3,pd-.15],[.09,2.6,.09]);
      put(boxT(),roofC,front,[0,FOUND+2.7,pd/2],[pw+.3,.12,pd+.35],[0,.16,0]);put(boxT(),trim,front,[0,FOUND+2.55,pd],[pw+.3,.18,.08]);
      for(const sd of [-1,1]){put(boxT(),trim,front,[sd*pw*.32,FOUND+.95,pd-.15],[pw*.34,.07,.07]);for(let k=0;k<9;k++)put(boxT(),trim,front,[sd*(pw*.17+k*pw*.035),FOUND+.5,pd-.15],[.04,.9,.04]);}}

    // front garden: picket fence with a gate gap, path, mailbox and shrubs
    if(!shop&&!cabin&&Math.abs(lx)-d/2>12){const fz=d/2+4.5,half=w/2+2,gk=r(),segs=[[(doorX+.75+half)/2,half-doorX-.75],[(doorX-.75-half)/2,half+doorX-.75]];
      if(gk<.42){for(let px=-half;px<=half;px+=.24)if(Math.abs(px-doorX)>.75)put(boxT(),trim,I,[px,.5,fz],[.07,1,.04],[0,0,0],{ao:.7});
        for(const py of [.35,.75])for(const [mx,ln] of segs)put(boxT(),trim,I,[mx,py,fz-.03],[ln,.06,.04]);}
      else if(gk<.74){const hc=bio.treeC.clone().multiplyScalar(.8+r()*.15);for(let px=-half;px<=half;px+=.85)if(Math.abs(px-doorX)>1)B.foliage.add(blobT(r,true),base.clone().multiply(M(px,.6,fz,.62,.75,.55,r()*6)),hc,{ao:.45,top:.15,vary:.12});}
      else for(const [mx,ln] of segs){put(boxT(),stone,I,[mx,.35,fz],[ln,.7,.45],[0,0,0],{vary:.2,ao:.6});put(boxT(),C('#a7a093'),I,[mx,.74,fz],[ln+.05,.1,.52],[0,0,0],{vary:.1});}
      // a washing line beside the house, the washing moving in the wind
      if(!modern&&r()<.35){const wx=(r()<.5?-1:1)*(w/2+2.8),z0=-d/2+.4,z1=d/2-.2,pc=C('#7a6a55');
        for(const zz of [z0,z1])put(boxT(),pc,I,[wx,1.1,zz],[.08,2.2,.08]);put(boxT(),C('#d8d8d2'),I,[wx,2.1,(z0+z1)/2],[.02,.02,z1-z0]);
        const n=4+Math.floor(r()*3);for(let k=0;k<n;k++){const zc=z0+(k+.5)/n*(z1-z0),hh=.5+r()*.3;
          B.foliage.add(boxT(),base.clone().multiply(M(wx,2.08-hh/2,zc,.03,hh,.5+r()*.15)),pick(['#f4f2ec','#e6d7a8','#a8c4d8','#d98a8a','#9cb48c','#f0f0f0','#c4a5cf']),{sway:.35,swayBase:y0+2.1,swayH:-.8});}}
      // flower beds under the front windows
      if(r()<.75){const fcs=[pick(['#d9435a','#f2c94c','#e88bb0','#f4f1e8','#9b6fd1','#e8773a']),pick(['#f4f1e8','#f2c94c','#c94a7a'])];
        for(const sd of [-1,1]){put(boxT(),C('#5a4632'),I,[sd*w*.3,.08,d/2+.55],[w*.32,.16,.7]);for(let k=0;k<7;k++)put(sphT(),fcs[k%2],I,[sd*w*.3+(k/6-.5)*w*.28,.28+r()*.08,d/2+.45+r()*.3],[.17,.15,.17]);}}
      put(boxT(),C('#b9b2a4'),I,[doorX,.03,d/2+2.6],[1.1,.06,3.6],[0,0,0],{vary:.15});
      put(boxT(),C('#6b5a46'),I,[doorX+1.1,.55,fz+.3],[.08,1.1,.08]);put(boxT(),pick(['#2f4a3e','#7d1f1a','#2d3e52']),I,[doorX+1.1,1.15,fz+.3],[.28,.25,.45]);
      for(const sd of [-1,1])for(let k=0;k<2;k++){const bx=sd*(w*.22+k*1.3);B.foliage.add(blobT(r,true),base.clone().multiply(M(bx,.45,d/2+.8,.8+r()*.3,.6+r()*.2,.6,r()*6)),bio.treeC.clone().multiplyScalar(1.05+r()*.2),{ao:.5,top:.2,vary:.15,sway:.2,swayBase:y0,swayH:1.2});}
    if(!shop&&!o.town&&(b==='fields'||b==='coast'||b==='town')&&r()<.6)deciduous(s+(r()<.5?-1:1)*(w/2+3+r()*3),lx+Math.sign(lx)*r()*3,.8+r()*.4);
    if(!o.town&&!shop&&o.ry===undefined)lane(s,lx,d/2+.2);}

    function barn(){
      const w=11,d=14,h=5.2,red=C('#8f2f24'),roofB=snowy?C('#e7eef1'):C('#4b4844'),rh=5.2;
      put(boxT(),stone,I,[0,.3,0],[w+.2,.6,d+.2],[0,0,0],{vary:.12});
      put(boxT(),red,I,[0,.6+h/2,0],[w,h,d],[0,0,0],{ao:.75,vary:.05});
      for(const fz of [-1,1])for(let px=-w/2+.25;px<w/2;px+=.5)put(boxT(),red.clone().multiplyScalar(.84),I,[px,.6+h/2,fz*(d/2+.02)],[.07,h,.04]);
      for(const sx of [-1,1])for(let pz=-d/2+.25;pz<d/2;pz+=.5)put(boxT(),red.clone().multiplyScalar(.84),I,[sx*(w/2+.02),.6+h/2,pz],[.04,h,.07]);
      put(gambrelT(),red,I,[0,.6+h,0],[w+.02,rh,d+.02],[0,0,0],{end:red,ao:.85});
      put(gambrelT(),roofB,I,[0,.6+h+.04,0],[w+.9,rh+.1,d+1.0],[0,0,0],{end:red,vary:.05});
      // big doors with white X bracing, hayloft door and hay hood
      const F=M(0,0,d/2+.03);put(boxT(),C('#7a281f'),F,[0,.6+2.1,0],[4.2,4.2,.06]);
      for(const sd of [-1,1]){const dx=4.2,dy=4.2,len=Math.hypot(dx,dy);put(boxT(),trim,F,[0,.6+2.1,.05],[len,.2,.05],[0,0,sd*Math.atan2(dy,dx)]);}
      for(const [px,py,pw,ph] of [[0,.6+4.25,4.5,.2],[-2.2,.6+2.1,.2,4.4],[2.2,.6+2.1,.2,4.4]])put(boxT(),trim,F,[px,py,.06],[pw,ph,.06]);
      put(boxT(),C('#7a281f'),F,[0,.6+h+1.3,.02],[1.8,1.6,.06]);put(boxT(),trim,F,[0,.6+h+1.3,.05],[2,1.8,.03]);put(prismT(),roofB,F,[0,.6+h+2.3,.6],[2,.6,1.4]);
      // cupola on the ridge
      put(boxT(),trim,I,[0,.6+h+rh+.5,0],[1.2,1.0,1.2]);put(coneT(4),roofB,I,[0,.6+h+rh+1.45,0],[1.15,.9,1.15],[Math.PI/4,0,0]);
      put(cylT(1,6),C('#3a3c3e'),I,[0,.6+h+rh+2.2,0],[.02,.8,.02]);
      // silo with bands and a dome
      const sx=-w/2-3.4;put(cylT(1,16),C('#b8bcb6'),I,[sx,6.6,0],[2.3,13.2,2.3],[0,0,0],{ao:.7,vary:.05});
      for(let k=1;k<8;k++)put(cylT(1,16),C('#9da29d'),I,[sx,k*1.6,0],[2.34,.08,2.34]);
      put(sphT(),C('#9aa19c'),I,[sx,13.2,0],[2.3,1.5,2.3]);
    }
  }
  function lampPost(s,side){obs(s,side*9,.18);const lx=side*9,[x,z]=L(s,lx),y0=groundY(s,lx),[ax,az]=L(s,side*7.6);
    near.solid.add(cylT(.7,6),M(x,y0+3.1,z,.09,6.2,.09),'#4c5550',{vary:.05});near.solid.add(boxT(),M((x+ax)/2,y0+6.15,(z+az)/2,Math.abs(ax-x)+.1,.1,.1),'#4c5550');
    near.solid.add(boxT(),M(ax,y0+6.08,az,.55,.18,.34),'#3d4541');lamps.add(boxT(),M(ax,y0+5.97,az,.42,.05,.24),C('#ffe2a6'));LIGHTS.push(ax,y0+5.9,az,s);
    const [px,pz]=L(s,side*5.6);pools.add(quadT(),M(px,roadSurface(s,side*5.6)+.07,pz,10,10,1,0,-Math.PI/2),C('#ffd08a'));}
  function pole(s){if(s>TE-6)return;obs(s,-11.5,.2);const lx=-11.5,[x,z]=L(s,lx),y0=groundY(s,lx);near.solid.add(cylT(.75,6),M(x,y0+4.6,z,.14,9.2,.14),'#6e5e4b',{ao:.6,vary:.08});
    near.solid.add(boxT(),M(x,y0+8.5,z,2.6,.14,.14,roadYaw(s)),'#5d4f40');for(const k of [-1.15,1.15])near.solid.add(cylT(.6,5),M(x+k*Math.cos(roadYaw(s)),y0+8.7,z-k*Math.sin(roadYaw(s)),.06,.22,.06),'#d9d6c8');return [x,y0+8.6,z];}

  // --- road furniture and scenery, one row every 12 m (as before)
  yield;
  for(let j=0;j<10;j++){yield;const s=start+j*12;
    for(const side of [-1,1]){if(side>0)yield;
      if(j%2===0&&!alien&&!structureAt(s)){const [x,z]=L(s,side*8);const py=groundY(s,side*8);near.solid.add(boxT(),M(x,py+.5,z,.14,1,.14),'#e6dfcc',{ao:.7});lamps.add(boxT(),M(x,py+.86,z+.075,.1,.16,.02),C(side>0?'#ff7a4a':'#ffb26a'));}
      if(alien){
        // glowing crystal plants: tall thin spikes that light up at night
        if(r()<.55){const cs=s+r()*10,cl=side*(10+r()*45),[cx,cz]=L(cs,cl),cy=groundY(cs,cl),gc=C(r()<.5?'#6fe6ff':'#c98bff');
          for(let k=0;k<3+Math.floor(r()*4);k++){const hh=.6+r()*1.8,tilt=(r()-.5)*.5;lamps.add(coneT(4),M(cx+(r()-.5)*1.2,cy+hh/2,cz+(r()-.5)*1.2,.12+r()*.08,hh,.12+r()*.08,r()*6,tilt,(r()-.5)*.5),gc);}
          obs(cs,cl,.6);}
        if(r()<.5)rock(s+r()*10,side*(12+r()*80),1+r()*4,bio.rockC);
        if(r()<.35)spire(s+r()*10,side*(40+r()*260));
        if(r()<.5)rock(s+r()*10,side*(60+r()*300),4+r()*10,bio.rockC);
      }else if(b!=='desert'){
        const coastal=b==='coast',conifer=b==='mountain'||snowy,tree=(s,lx,k)=>conifer?(r()<.35?spruce(s,lx,k):pine(s,lx,k)):(b==='fields'||coastal)&&r()<.18?birch(s,lx):(b==='fields'&&r()<.2)?poplar(s,lx):deciduous(s,lx,k,b==='town'&&r()<.14?'#d8a6b4':b==='fields'&&r()<.12?'#8ea64b':null);
        // trees grow in groves and copses with open meadow between, not dotted evenly: a slow noise says
        // where the woods are; a grove is a few trees of different sizes close together, with bushes under them
        const wood=(ss,lx)=>vnoise(ss*.0052+side*7.3,lx*.0061+side*3.1)*.7+vnoise(ss*.019,lx*.021)*.3;
        const grove=(ss,lx,n,k)=>{for(let q=0;q<n;q++){const ts=ss+(r()-.5)*(6+n*2.2),tl=lx+(r()-.5)*(6+n*2.2);if(Math.abs(tl)<11)continue;tree(ts,tl,k*(.75+r()*.5));}
          if(!snowy&&!winter&&Math.abs(lx)<75)for(let q=0;q<Math.min(4,n+1);q++){const bs=ss+(r()-.5)*8,bl=lx+(r()-.5)*8;if(Math.abs(bl)<11)continue;const [bx,bz]=L(bs,bl),by=groundY(bs,bl);set(bl).foliage.add(blobT(r,true),M(bx,by+.35,bz,.9+r()*.7,.6+r()*.4,.9+r()*.7,r()*6),bio.treeC.clone().multiplyScalar(.8+r()*.25),{ao:.5,top:.2,vary:.15,sway:.3,swayBase:by,swayH:1});}};
        {const ss=s+r()*10,lx=side*(13+r()*55),w=wood(ss,lx);if(w>.55&&r()<(coastal?.35:.8))grove(ss,lx,w>.66?3+Math.floor(r()*3):1+Math.floor(r()*2),1);else if(r()<(coastal?.04:.08))tree(ss,lx,1.1);}
        {const ss=s+r()*6,lx=side*(70+r()*300),w=wood(ss,lx);if(w>.5&&r()<(coastal?.4:.85)){const big=(conifer||(b==='town'&&r()<.3));if(big)for(let q=0;q<2+Math.floor(r()*4);q++){const tl=lx+(r()-.5)*16;r()<.3?spruce(ss+(r()-.5)*14,tl,1.2):pine(ss+(r()-.5)*14,tl,1.2);}else grove(ss,lx,2+Math.floor(r()*4),1.25);}}
        {const ss=s+6,lx=side*(75+r()*120),w=wood(ss,lx);if(w>.6&&r()<(coastal?.3:.6))conifer?pine(ss,lx,1.1):deciduous(ss,lx,1.2);}
        // wildflowers in drifts beside the road, in spring and summer
        if((SZ==='spring'||SZ==='summer')&&!snowy&&(b==='fields'||b==='mountain'||coastal)&&r()<(SZ==='spring'?.75:.55)){
          const FL=['#f4f1e8','#f2d14c','#f2d14c','#9b7bd1','#e89ab8','#d8433a','#ffffff'],fc=C(FL[Math.floor(r()*FL.length)]),cs=s+r()*12,cl=side*(9+r()*24);
          for(let q=0;q<14;q++){const a=r()*6.28,rr=Math.sqrt(r())*3.2,fs=cs+Math.cos(a)*rr,fl=cl+Math.sin(a)*rr;if(Math.abs(fl)<8.6)continue;const [fx,fz]=L(fs,fl),fy=groundY(fs,fl)+.32+r()*.18;
            near.solid.add(sphT(),M(fx,fy,fz,.09+r()*.05,.07,.09+r()*.05),fc.clone().offsetHSL(0,0,(r()-.5)*.08),{ao:.9});}}
        if(!snowy&&!winter)for(let k=0;k<3;k++)tufts(s+r()*12,side*(8.4+r()*6),P0.ground.clone().multiplyScalar(.85+r()*.3),b!=='town');
        if(r()<.3&&!place('shrub',s+r()*10,side*(10+r()*6),1.2+r()*1.2)){const [x,z]=L(s+r()*10,side*(10+r()*5));const y0=groundY(s,side*11);near.foliage.add(blobT(r,true),M(x,y0+.3,z,.6+r()*.4,.45+r()*.25,.6+r()*.4,r()*6),bio.treeC.clone().multiplyScalar(1.15),{ao:.5,top:.2,vary:.15,sway:.3,swayBase:y0,swayH:1.2});}
      }else{
        if(r()<.4)cactus(s+r()*10,side*(14+r()*60));
        if(r()<.6){const [x,z]=L(s+r()*10,side*(10+r()*40));const y0=groundY(s,side*20);set(20).foliage.add(blobT(r,true),M(x,y0+.25,z,.6+r()*.5,.35+r()*.2,.6+r()*.5),C('#8a8b57'),{ao:.5,vary:.2,sway:.2,swayBase:y0,swayH:.6});}
        if(r()<.35)rock(s+r()*10,side*(30+r()*200),2+r()*6,bio.rockC);
      }
      if(j%3===0)rock(s+r()*8,side*(10+r()*7),.4+r()*.7,snowy?'#dfe6e8':b==='desert'?'#b98a63':'#9a988a');
      if(b==='fields'){if(j===2){house(s,side*52,{barn:r()<.5});const [fx]=L(s,side*15);for(let f=0;f<8;f++){const [px,pz]=L(s-f*4,side*15);near.solid.add(boxT(),M(px,groundY(s-f*4,side*15)+.7,pz,.15,1.4,.15),'#a89772',{ao:.6});}
          for(const y of [.55,1.05]){const [ax,az]=L(s,side*15),[bx,bz]=L(s-28,side*15);const ya=groundY(s,side*15),yb=groundY(s-28,side*15),len=Math.hypot(bx-ax,bz-az);near.solid.add(boxT(),M((ax+bx)/2,(ya+yb)/2+y,(az+bz)/2,.08,.1,Math.hypot(len,yb-ya),Math.atan2(bx-ax,bz-az),-Math.atan2(yb-ya,len)),'#b7a985');}}
        if(r()<.25){const [x,z]=L(s+r()*10,side*(20+r()*30));near.solid.add(cylT(1,12),M(x,groundAtX(s,x+ox,P0)+.68,z,.7,1.3,.7,r()*3,0,Math.PI/2),'#d2b66a',{vary:.1,top:.15});}}
      if(b==='town'&&j%3===0&&!nearStreet(s,side)){house(s,side*(19+r()*8),{town:true});lampPost(s+6,side);}
      if((b==='mountain'||snowy)&&j%4===0&&r()<.5)house(s,side*35,{});
      if(b==='coast'&&j%5===1&&r()<.45)house(s,side*(30+r()*20),{});
      if(inVillage(s)&&j%2===1&&r()<.8&&!nearStreet(s,side)&&!(side===vSide&&Math.abs(s-vc)<16)&&!(side===-vSide&&Math.abs(s-vc-90)<14))house(s,side*(18+r()*8),{town:r()<.4});
    }}
  if(b==='desert'||(b==='town'&&index%3===0)){const s=start+55,lx=b==='desert'?14:-16,[x,z]=L(s,lx),y0=groundY(s,lx),ry=b==='desert'?-.35:.35,which=b==='desert'?[1,2,3][index%3]:0;
    obs(s,lx,2.6);for(const k of [-2.2,2.2])near.solid.add(boxT(),M(x+k*Math.cos(ry),y0+2.4,z-k*Math.sin(ry),.18,4.8,.18),'#6f6656',{ao:.6});
    near.solid.add(boxT(),M(x,y0+4.5,z-.08,6.3,2.9,.14,ry),'#4a4a42');signs.add(quadT(),M(x+Math.sin(ry)*.01,y0+4.5,z+Math.cos(ry)*.01,6,2.7,1,ry),C('#ffffff'),{uv:signUV(which)});}
  yield;
  // bridges and tunnels
  {const H=structHalf(),VS=3.2,VR=4.1,STEP=4,stoneC='#8e897d',deckC='#9a9a94',steel='#b8bdbf',water=[];
    const yaw=s=>roadYaw(s),pitch=s=>Math.atan(roadGrade(s)*roadCos(s));
    let prevK=structureAt(start-STEP);
    for(let s=start;s<start+CH;s+=STEP){const k=structureAt(s),sm=s+STEP/2,y=roadSurface(sm,0),ry=yaw(sm),rx=pitch(sm),[cx,cz]=L(sm,0);
      if(k===1){
        // deck, edge beams and railings
        near.solid.add(boxT(),M(cx,y-.75,cz,2*H+.6,1.3,STEP+.05,ry,rx),deckC,{ao:.6,top:.1,vary:.05});
        for(const sd of [-1,1]){const [px,pz]=L(sm,sd*(H-.15));
          near.solid.add(boxT(),M(px,y+.42,pz,.32,.84,STEP-.06,ry,rx),stoneC,{ao:.55,vary:.2,top:.2});near.solid.add(boxT(),M(px,y+.9,pz,.42,.12,STEP-.02,ry,rx),'#aaa497',{ao:.6,vary:.08});
          if(b!=='fields'&&b!=='mountain'&&b!=='snow'&&b!=='coast')near.solid.add(boxT(),M(px,y+1.05,pz,.08,.12,STEP+.05,ry,rx),steel);}
        // a pier every 24 m, down to the valley floor
        if(((Math.round(s)%24)+24)%24<STEP){const floor=groundY(sm,0),hgt=y-1.4-floor;
          if(hgt>1)for(const sd of [-1,1]){const [px,pz]=L(sm,sd*(H-2.4));near.solid.add(cylT(1,10),M(px,floor+hgt/2,pz,1.1,hgt,1.1,ry),stoneC,{ao:.5,vary:.12});}}
        let low=Infinity;for(let lp=-60;lp<=60;lp+=10)low=Math.min(low,groundY(sm,lp));water.push([sm,low]);
      }else if(k===2){
        // tunnel: side walls, a ceiling and lights along it
        for(const sd of [-1,1]){const [px,pz]=L(sm,sd*(H+.45));near.solid.add(boxT(),M(px,y+3.8,pz,.9,8.2,STEP+.05,ry,rx),'#7d7a72',{ao:.45,vary:.08});}
        for(let i=0;i<10;i++){const t0=i/10*Math.PI,t1=(i+1)/10*Math.PI,tm=(t0+t1)/2,x0=H*Math.cos(t0),y0=VS+VR*Math.sin(t0),x1=H*Math.cos(t1),y1=VS+VR*Math.sin(t1);
          const len=Math.hypot(x1-x0,y1-y0),xm=(x0+x1)/2+Math.cos(tm)*.35,ym=(y0+y1)/2+Math.sin(tm)*.35,[px,pz]=L(sm,xm);
          near.solid.add(boxT(),M(px,y+ym,pz,len+.12,.7,STEP+.05,ry,rx,Math.atan2(y1-y0,x1-x0)),'#76736b',{ao:.4,vary:.06});}
        // the hill over the tunnel: rock up to the surrounding ground, topped with turf
        // (not right at the mouths: the arched face covers those, and the cover would show in front of it)
        if(structureAt(s-STEP)===2&&structureAt(s+STEP)===2){const top=Math.max(y+8.4,(groundY(sm,-(H+4))+groundY(sm,H+4))/2+.3),hh=top-(y+7.85);
          near.solid.add(boxT(),M(cx,y+7.85+hh/2,cz,2*H+3.4,hh,STEP+.08,ry),P0.ground.clone().offsetHSL(0,-.12,-.04).multiplyScalar(.75),{ao:.6,vary:.12});
          near.solid.add(boxT(),M(cx,top+.05,cz,2*H+3.6,.25,STEP+.1,ry),P0.ground.clone().multiplyScalar(.9),{ao:.7,vary:.15});}
        if(((Math.round(s)%12)+12)%12<STEP)for(const sd of [-1,1]){const [px,pz]=L(sm,sd*1.6);lamps.add(boxT(),M(px,y+VS+VR*Math.sqrt(1-(1.6/H)**2)-.08,pz,.25,.08,1.4,ry,rx),C('#ffd89a'));}
      }
      // ends: a stone abutment where a bridge meets the land, a portal where a tunnel begins or ends
      if(k!==prevK){const kk=k||prevK,ry0=yaw(s),[ex,ez]=L(s,0),y0=roadSurface(s,0);
        if(kk===1){const floor=Math.min(groundY(s,-H),groundY(s,H));near.solid.add(boxT(),M(ex,(y0-1.4+floor)/2,ez,2*H+3,Math.max(1,y0-1.4-floor),3,ry0),stoneC,{ao:.5,vary:.18});}
        else if(kk===2){
          // an arched stone face set into the hill: courses of stone around an elliptical arch,
          // a ring of dressed voussoirs with a keystone, and wing walls stepping down into the slope
          const so=s+(prevK===2?-6:6),crown=y0+VS+VR,top=Math.max(crown+2.2,roadSurface(so,0)+8.4,(groundY(so,-(H+4))+groundY(so,H+4))/2+.6);  // high enough to hide the hill cover behind it
          for(let yb=y0-1.6,row=0;yb<top-.05;yb+=.62,row++){const hh=Math.min(.62,top-yb),ym=yb+hh/2,u=(ym-y0-VS)/VR;
            const inner=ym<y0+VS?H:u<1?H*Math.sqrt(1-u*u):0,outer=Math.max(H+2.3,H+9-Math.max(0,ym-(y0+VS))*1.15-(row%2)*.3);
            if(outer-inner<.2)continue;const shade=C(row%3===0?'#8e887b':row%3===1?'#837d71':'#898376');
            for(const sd of [-1,1]){const xm=sd*(inner+outer)/2,[px,pz]=L(s,xm);near.solid.add(boxT(),M(px,ym,pz,outer-inner+.08,hh-.04,2.4,ry0),shade,{ao:.5,vary:.06,top:.1});}
}
          // fill under the wing walls down to the ground, so they never float
          for(const sd of [-1,1]){const xm=sd*(H+5),[px,pz]=L(s,xm),gy=Math.min(groundY(s,xm),y0)-4;near.solid.add(boxT(),M(px,(gy+y0-1.6)/2,pz,8,y0-1.6-gy,2.4,ry0),'#837d71',{ao:.5});}
          for(let i=0;i<15;i++){const t=(i+.5)/15*Math.PI,key=i===7,ex2=Math.cos(t),ey=Math.sin(t),nx=VR*ex2,ny=H*ey,nl=Math.hypot(nx,ny),rad=key?.55:.45;
            const xm=H*ex2+nx/nl*rad,ym=VS+VR*ey+ny/nl*rad,[px,pz]=L(s,xm),phi=Math.atan2(VR*ex2,-H*ey);
            near.solid.add(boxT(),M(px,y0+ym+(key?.12:0),pz,Math.PI*(H+VR)/2/15*.94,key?1.25:.95,2.75,ry0,0,phi),'#b1aa9b',{ao:.6,vary:.08});}
          for(const sd of [-1,1]){const [px,pz]=L(s,sd*(H+.35));near.solid.add(boxT(),M(px,y0+VS,pz,1.2,.38,2.8,ry0),'#b1aa9b',{ao:.6});}
          near.solid.add(boxT(),M(ex,top+.2,ez,2*H+5,.4,2.9,ry0),'#a39d8f',{ao:.6,vary:.08});}}
      prevK=k;}
    // a lake or river in the valley under a bridge
    if(water.length){const lvl=Math.min(...water.map(w=>w[1]))+1.2,a0=water[0][0]-6,a1=water[water.length-1][0]+6,pos=[],idx=[];
      for(let i=0,s=a0;s<=a1+.01;s+=6,i++){for(const lp of [-90,90]){const [x,z]=L(s,lp);pos.push(x,lvl,z);}if(i>0){const q=(i-1)*2;idx.push(q,q+2,q+1,q+1,q+2,q+3);}}
      const wg=new T.BufferGeometry();wg.setAttribute('position',new T.Float32BufferAttribute(pos,3));wg.setIndex(idx);wg.computeVertexNormals();const lm=new T.Mesh(wg,LAKE);lm.userData.level=lvl;g.userData.lake=lm;g.add(lm);
      // weeping willows on the banks
      if(b!=='desert'&&!snowy)for(let k=0;k<7;k++){const ss=a0+r()*(a1-a0),lp=(r()<.5?-1:1)*(16+r()*60),gy=groundY(ss,lp);if(gy>lvl+.2&&gy<lvl+4)willow(ss,lp);}}}
  // barriers where the road runs along a drop: stone walls in the countryside, steel rails elsewhere
  {const stone=b==='fields'||b==='mountain'||b==='snow'||b==='coast',bx=ROAD.half+1.05,STEP=4;
    for(const side of [-1,1]){let prev=null;
      for(let s=start;s<=start+CH+.01;s+=STEP){
        if(structureAt(s)){prev=null;continue;}
        const top=roadSurface(s,side*bx),drop=top-Math.min(groundY(s,side*(bx+4)),groundY(s,side*(bx+8)));
        const [x,z]=L(s,side*bx),cur=drop>4.5||(prev&&drop>3)?{x,z,y:top}:null;  // a little hysteresis keeps runs unbroken
        if(cur&&prev){const len=Math.hypot(cur.x-prev.x,cur.z-prev.z),ry=Math.atan2(prev.x-cur.x,prev.z-cur.z),rx=-Math.atan2(prev.y-cur.y,len),mx=(cur.x+prev.x)/2,mz=(cur.z+prev.z)/2,my=(cur.y+prev.y)/2;
          if(alien){near.solid.add(cylT(.6,6),M(prev.x,prev.y+.45,prev.z,.16,.9,.16),'#3b2722',{ao:.6});lamps.add(sphT(),M(prev.x,prev.y+.95,prev.z,.13,.13,.13),C('#6fe6ff'));}
          else if(stone){
            // a low dry-stone wall: a rough course of stones with an uneven top, and a gap now and then
            const gap=hash2(Math.floor(s/4),side*13+5)<.12;
            if(!gap){near.solid.add(boxT(),M(mx,my+.25,mz,.36,.5,len*.98,ry,rx),'#5f5b52',{ao:.4,vary:.1});
              // two courses of irregular stones and a row of capstones, in weathered greys with a little moss
              const STN=['#8f897b','#7d786c','#9a9383','#6f6b60','#7b7d66'];
              for(const [cy,ch,nk] of [[.16,.3,6],[.44,.26,7]])for(let k=0;k<nk;k++){const t=(k+.5+(r()-.5)*.3)/nk,px=lerp(prev.x,cur.x,t),pz=lerp(prev.z,cur.z,t),py=lerp(prev.y,cur.y,t);
                near.solid.add(rockT(r),M(px,py+cy,pz,.5+r()*.12,ch*(.8+r()*.4),len/nk*1.25,ry+(r()-.5)*.25,rx),C(STN[Math.floor(r()*5)]),{ao:.5,top:.25,vary:.2});}
              for(let k=0;k<9;k++){const t=(k+.5)/9,px=lerp(prev.x,cur.x,t),pz=lerp(prev.z,cur.z,t),py=lerp(prev.y,cur.y,t);
                near.solid.add(rockT(r),M(px,py+.66+r()*.05,pz,.42,.2+r()*.1,len/9*.9,ry,rx,(r()-.5)*.4),C(STN[Math.floor(r()*5)]).multiplyScalar(1.08),{ao:.55,top:.3,vary:.2});}}}
          else{
            // wooden posts and two rails
            const n=Math.max(1,Math.round(len/2));
            for(let k=0;k<n;k++){const t=k/n,px=lerp(prev.x,cur.x,t),pz=lerp(prev.z,cur.z,t),py=lerp(prev.y,cur.y,t);near.solid.add(boxT(),M(px,py+.5,pz,.14,1,.14,ry),'#6f5b45',{ao:.6,vary:.15});}
            for(const yy of [.45,.85])near.solid.add(boxT(),M(mx,my+yy,mz,.07,.12,len+.02,ry,rx),'#8a7259',{vary:.12,top:.2});}}
        prev=cur;}}}

  // ---- landmarks: every few kilometres something to remember the journey by
  {const s0=start+60,lh=hash2(index*3+11,roadSeed()%977);
   if(!alien&&lh<.045&&!inVillage(s0)&&!structureAt(s0-30)&&!structureAt(s0+30)){
    const stoneL=['#9a9488','#8f897d','#a39d90'],sc=()=>C(stoneL[Math.floor(r()*3)]);
    if(b==='coast'&&lh>.012){ // a lighthouse on the cliff top, with the keeper's cottage
      const sd=coastSide(s0);let lx=sd*95;if(groundY(s0,lx)<SEA_LEVEL+6)lx=sd*70;
      const B=set(lx).solid,[x,z]=L(s0,lx),y=groundY(s0,lx)-.3;obs(s0,lx,2.6);
      B.add(cylT(1,16),M(x,y+.4,z,3.2,1.6,3.2),'#8e897d',{ao:.6,vary:.1});
      for(let k=0;k<6;k++){const r0=2.3-k*.12;B.add(cylT((r0-.12)/r0,16),M(x,y+2.7+k*3,z,r0,3,r0),k%2?'#b8322c':'#f2efe8',{ao:.85,vary:.03});}
      B.add(cylT(1,16),M(x,y+19.35,z,2.1,.3,2.1),'#2e3133');
      for(let k=0;k<16;k++){const a=k/16*6.283;B.add(boxT(),M(x+Math.cos(a)*2,y+19.9,z+Math.sin(a)*2,.06,.9,.06),'#2e3133');}
      B.add(cylT(1,12),M(x,y+20.5,z,1.25,1.9,1.25),'#33414a');lamps.add(sphT(),M(x,y+20.5,z,.75,.75,.75),C('#fff1c0'));
      B.add(coneT(16),M(x,y+22,z,1.5,1.2,1.5),'#b8322c');B.add(sphT(),M(x,y+22.7,z,.25,.25,.25),'#2e3133');
      const beam=new T.Mesh(beamGeo(),BEAM);beam.position.set(x,y+20.5,z);beam.visible=false;g.add(beam);SPIN.push({obj:beam,axis:'y',speed:.7,night:true});
      if(Math.abs(lx)>30)house(s0+16,sd*(Math.abs(lx)-14),{});
      g.userData.landmark={s:s0,name:'A lighthouse on the cliffs'};}
    else if(b==='coast'||b==='mountain'||b==='snow'?(b==='coast'||lh>.022):false){ // a viewpoint: a lay-by, benches, a telescope and a sign
      const sd=groundY(s0,40)<groundY(s0,-40)?1:-1,sh=ROAD.shoulder,B=near.solid;
      for(let q=-25;q<25;q+=5){const ss=s0+q+2.5,top=roadSurface(ss,sd*ROAD.half)+.02,[px,pz]=L(ss,sd*(sh+2.8));
        B.add(boxT(),M(px,top-1.5,pz,5.6,3,5.1,roadYaw(ss)),'#a39a88',{ao:.6,vary:.15,top:.1});
        const [wx,wz]=L(ss,sd*(sh+5.75));B.add(boxT(),M(wx,top-1.15,wz,.45,3.7,5.05,roadYaw(ss)),sc(),{ao:.5,vary:.2});obs(ss,sd*(sh+5.75),.5);}
      for(const q of [-8,6]){const ss=s0+q,top=roadSurface(ss,sd*ROAD.half),ry=roadYaw(ss),[bx,bz]=L(ss,sd*(sh+4.2));
        B.add(boxT(),M(bx,top+.45,bz,.45,.06,1.8,ry),'#7a5a3e');B.add(boxT(),M(bx+sd*.2,top+.75,bz,.06,.5,1.8,ry),'#7a5a3e');
        for(const e of [-.75,.75]){const [lx2,lz2]=L(ss+e,sd*(sh+4.2));B.add(boxT(),M(lx2,top+.22,lz2,.4,.44,.08,ry),'#3d3a36');}}
      {const ss=s0-1,top=roadSurface(ss,sd*ROAD.half),[tx,tz]=L(ss,sd*(sh+4.9));B.add(cylT(1,8),M(tx,top+.6,tz,.07,1.2,.07),'#3d4246');B.add(boxT(),M(tx,top+1.3,tz,.5,.22,.22,roadYaw(ss)+Math.PI/2*sd),'#3f6b5a');}
      {const ss=s0-24,top=roadSurface(ss,sd*ROAD.half),[px,pz]=L(ss,sd*(sh+.6));obs(ss,sd*(sh+.6),.2);
        B.add(boxT(),M(px,top+1.1,pz,.1,2.2,.1),'#5b3a26');B.add(boxT(),M(px,top+2.1,pz,.08,.8,1.6,roadYaw(ss)),'#5b3a26');B.add(boxT(),M(px+sd*-.05,top+2.1,pz,.02,.5,1.3,roadYaw(ss)),'#efe9da');}
      g.userData.landmark={s:s0,name:b==='coast'?'A viewpoint over the sea':'A viewpoint over the valley'};}
    else if(b==='mountain'||b==='snow'){ // a waterfall tumbling down the hillside
      let sd=1,best=-1e9;for(const q of [-1,1]){const dr=groundY(s0,q*68)-groundY(s0,q*24);if(dr>best){best=dr;sd=q;}}
      if(best>10){const pos=[],uv=[],idx=[],N=8;
        for(let i=0;i<=N;i++){const lp=24+i/N*44;for(const e of [-2.4,2.4]){const ss=s0+e*(1+i/N*.4),[px,pz]=L(ss,sd*lp);pos.push(px,groundY(ss,sd*lp)+.55,pz);uv.push(e<0?0:1,(N-i)/N*6);}
          if(i){const q=(i-1)*2;idx.push(q,q+1,q+2,q+1,q+3,q+2);}}
        const wg=new T.BufferGeometry();wg.setAttribute('position',new T.Float32BufferAttribute(pos,3));wg.setAttribute('uv',new T.Float32BufferAttribute(uv,2));wg.setIndex(idx);wg.computeVertexNormals();
        g.add(new T.Mesh(wg,fallMat()));
        const B=set(sd*40).solid;for(let i=0;i<14;i++){const lp=24+r()*44,e=(r()<.5?-1:1)*(3+r()*1.8),ss=s0+e,[px,pz]=L(ss,sd*lp);B.add(rockT(r),M(px,groundY(ss,sd*lp)+.3,pz,1+r()*1.4,.8+r()*1,1+r()*1.4,r()*6),'#7d7a72',{ao:.5,top:.2,vary:.2});}
        const [fx,fz]=L(s0,sd*21);const lm=new T.Mesh(poolGeo(),LAKE);lm.position.set(fx,groundY(s0,sd*21)+.25,fz);g.add(lm);
        g.userData.spray=[fx,groundY(s0,sd*22)+.8,fz,s0];
        g.userData.landmark={s:s0,name:'A waterfall'};}}
    else if(b==='fields'&&lh<.02){ // a ruined castle on the highest ground near the road
      let sd=1,lx=110,best=-1e9;for(const q of [-1,1])for(const d of [100,130,160,190])if(groundY(s0,q*d)>best){best=groundY(s0,q*d);sd=q;lx=d;}
      lx*=sd;const B=set(lx).solid,[cx,cz]=L(s0,lx),cy=groundY(s0,lx),ry=r()*1.57,F=M(cx,cy,cz,1,1,1,ry);
      const put=(t,col,p,sz,rot=0)=>B.add(t,F.clone().multiply(M(p[0],p[1],p[2],sz[0],sz[1],sz[2],rot)),col,{ao:.5,vary:.22,top:.1});
      const S=11,hts=[11+r()*4,6+r()*3,12+r()*4,9+r()*3];
      [[-S,-S],[S,-S],[S,S],[-S,S]].forEach(([px,pz],k)=>{const h=hts[k];put(cylT(.9,12),sc(),[px,h/2-3,pz],[3,h+3,3]);
        for(let c=0;c<8;c++){if(k===1&&c%3===0)continue;const a=c/8*6.283;put(boxT(),sc(),[px+Math.cos(a)*2.6,h+.4,pz+Math.sin(a)*2.6],[.9,.9,.9],a);}});
      for(let k=0;k<4;k++){const a=[[-S,-S],[S,-S],[S,S],[-S,S]][k],b2=[[-S,-S],[S,-S],[S,S],[-S,S]][(k+1)%4],mx=(a[0]+b2[0])/2,mz=(a[1]+b2[1])/2,rot=k%2?Math.PI/2:0;
        if(k===2){put(boxT(),sc(),[mx-(k%2?0:7),.5,mz-(k%2?7:0)],[k%2?1.6:8,7,k%2?8:1.6],0);put(boxT(),sc(),[mx+(k%2?0:6),-.5,mz+(k%2?6:0)],[k%2?1.6:6,5,k%2?6:1.6],0);continue;}
        put(boxT(),sc(),[mx,1.5,mz],[2*S-4,9,1.6],rot);
        for(let c=-S+2.5;c<S-2;c+=1.4)put(boxT(),sc(),[mx+(rot?0:c),6.4,mz+(rot?c:0)],[.8,.8,1.7],rot);}
      put(boxT(),sc(),[0,4.5,-3],[8,15,8]);put(boxT(),sc(),[-2,13,-3],[4,2.2,8]);
      for(let k=0;k<5;k++)put(boxT(),C('#2b2a28'),[-1.5+k*.8,6+(k%2)*3,1.02],[.25,1.2,.05]);
      for(let k=0;k<16;k++){const a=r()*6.283,d=8+r()*10;B.add(rockT(r),F.clone().multiply(M(Math.cos(a)*d,.2,Math.sin(a)*d,.6+r()*.9,.4+r()*.5,.6+r()*.9,r()*6)),sc(),{ao:.5,top:.2,vary:.2});}
      g.userData.landmark={s:s0,name:'A ruined castle on the hill'};}
    else if(b==='fields'){ // a windmill, its sails turning
      const sd=lh<.032?1:-1,lx=sd*(70+r()*40),B=set(lx).solid,[x,z]=L(s0,lx),y=groundY(s0,lx)-.3;
      B.add(cylT(.62,12),M(x,y+5.5,z,3.2,11,3.2),'#ece6d6',{ao:.8,vary:.04});B.add(coneT(12),M(x,y+12.4,z,2.6,2.8,2.6),'#5a3f2e',{vary:.08});
      B.add(boxT(),M(x,y+1.2,z,1.2,2.4,.1,roadYaw(s0)+(sd>0?-Math.PI/2:Math.PI/2)),'#5a3f2e');
      const hub=new T.Group(),[hx,hz]=L(s0,lx-sd*2.4);hub.position.set(hx,y+10.8,hz);hub.rotation.y=roadYaw(s0)+(sd>0?Math.PI/2:-Math.PI/2);g.add(hub);
      const spinner=new T.Group();hub.add(spinner);spinner.rotation.z=r()*6;
      for(let k=0;k<4;k++){const arm=new T.Group();arm.rotation.z=k*Math.PI/2;spinner.add(arm);
        const fr=new T.Mesh(sailGeo(),SAILW);fr.scale.set(.32,8.6,.18);fr.position.y=4.5;arm.add(fr);
        const cl=new T.Mesh(sailGeo(),SAILC);cl.scale.set(1.5,6.6,.05);cl.position.set(.95,5.2,.08);arm.add(cl);fr.castShadow=cl.castShadow=true;}
      SPIN.push({obj:spinner,axis:'z',speed:.55});obs(s0,lx,3.3);
      g.userData.landmark={s:s0,name:'A windmill'};}
    else if(b==='desert'){ // a natural stone arch
      const sd=lh<.022?1:-1,lx=sd*(80+r()*50),B=set(lx).solid,[x,z]=L(s0,lx),y=groundY(s0,lx),col='#b86f45';
      for(const e of [-8,8]){const [px,pz]=L(s0+e,lx);B.add(rockT(r),M(px,y+6,pz,4.5,14,4.5,r()*6),col,{ao:.5,top:.15,vary:.2});}
      {const [px,pz]=L(s0,lx);B.add(rockT(r),M(px,y+14,pz,4,3.2,11,roadYaw(s0)),col,{ao:.6,top:.2,vary:.2});}
      g.userData.landmark={s:s0,name:'A stone arch in the desert'};}
   }}
  // the end of a side road: a turning circle, a sign, and the place it leads to
  if(TE>=start&&TE<start+CH){const T0=G.trip,e=TE,ry=roadYaw(e),y=roadSurface(e,0),[ex,ez]=L(e+5,0),B=near.solid;
    B.add(cylT(1,24),M(ex,y-.12,ez,11,.3,11,ry),'#a39a87',{ao:.8,vary:.2,top:.1});
    for(let k=0;k<11;k++){const a=-1.25+k*.25,[px,pz]=L(e+5+Math.cos(a)*11.6,Math.sin(a)*11.6);B.add(boxT(),M(px,y+.45,pz,.18,.9,.18,ry),'#6f5844',{ao:.6,vary:.15});obs(e+5+Math.cos(a)*11.6,Math.sin(a)*11.6,.2);}
    {const [px,pz]=L(e-4,T0.side*(ROAD.half+2));B.add(boxT(),M(px,y+1.1,pz,.1,2.2,.1),'#5b3a26');B.add(boxT(),M(px,y+2,pz,.08,.7,1.4,ry),'#6b3d23');}
    if(T0.kind==='beach'){ // beach huts in a row above the sand, a lifebuoy post and a bench
      const hut=['#d9534a','#3f88b5','#f2c94c','#5fae7a','#f4f1e8'];
      for(let k=0;k<6;k++){const lx=(k<3?-1:1)*(15+(k%3)*6.5),ss=e+2+(k%3)*1.5,yy=groundY(ss,lx),[hx,hz]=L(ss,lx);B.add(boxT(),M(hx,yy+1.2,hz,2.6,2.4,2.6,ry),hut[k],{ao:.7,vary:.05});B.add(prismT(),M(hx,yy+2.4,hz,2.9,1.1,2.9,ry+Math.PI/2),'#f4f1e8',{ao:.8});obs(ss,lx,1.6);}
      {const [px,pz]=L(e+8,-9);B.add(boxT(),M(px,y+1,pz,.12,2,.12),'#d9534a');B.add(cylT(1,12),M(px,y+1.6,pz,.35,.12,.35,0,Math.PI/2),'#ef6a3a');}
      for(const lx of [-5,5]){const [px,pz]=L(e+15,lx);B.add(boxT(),M(px,y+.42,pz,1.8,.06,.45,ry),'#8a6a4a');}}
    else if(T0.kind==='farm'){house(e+34,16,{});house(e+30,-20,{barn:true});
      for(let k=0;k<6;k++){r()<.5?sheep(e+40+r()*40,(r()-.5)*50,r()<.5):cow(e+45+r()*40,(r()-.5)*50,r()<.5);}}
    else{ // a viewpoint: benches, a telescope and a low wall at the edge
      for(let k=-3;k<=3;k++){const [px,pz]=L(e+17,k*3.2);B.add(boxT(),M(px,y+.5,pz,3.3,1,.6,ry),'#9a9488',{ao:.6,vary:.2,top:.1});obs(e+17,k*3.2,1);}
      for(const lx of [-5,4]){const [px,pz]=L(e+13,lx);B.add(boxT(),M(px,y+.45,pz,1.9,.06,.48,ry),'#7a5a3e');B.add(boxT(),M(px,y+.75,pz-.2,1.9,.5,.06,ry),'#7a5a3e');}
      {const [px,pz]=L(e+14,0);B.add(cylT(1,8),M(px,y+.6,pz,.07,1.2,.07),'#3d4246');B.add(boxT(),M(px,y+1.3,pz,.22,.22,.5,ry),'#3f6b5a');}}
    g.userData.tripEnd=e;}
  for(const t of STREETS)if(t.sc>=start&&t.sc<start+CH)street(t.sc,t.side);
  if(riverHere){const pos=[],idx=[];let rows=0,lvl=null;
    for(let s=start;s<=start+CH+.01;s+=5){const rv=riverAt(s);if(!rv||rv.amp<.25){rows=0;continue;}lvl=rv.level;const hw=rv.w*.5+1.5;
      for(const e of [-hw,hw]){const [x,z]=L(s,rv.lat+e);pos.push(x,rv.level,z);}
      if(rows>0){const q=pos.length/3-4;idx.push(q,q+2,q+1,q+1,q+2,q+3);}rows++;}
    if(idx.length){const wg=new T.BufferGeometry();wg.setAttribute('position',new T.Float32BufferAttribute(pos,3));wg.setIndex(idx);wg.computeVertexNormals();
      const wm=new T.Mesh(wg,LAKE);wm.userData.level=lvl;g.add(wm);if(!g.userData.lake)g.userData.lake=wm;}}
  function street(sc,side){
    // the surface: a narrow road leaving the main road square to it, following the ground
    const W=3.1,pos=[],uv=[],col=[],idx=[],y0=roadSurface(sc,side*ROAD.half);let rows=0;
    const rvS=riverAt(sc),streetEnd=rvS&&Math.sign(rvS.lat)===side?Math.max(30,Math.abs(rvS.lat)-rvS.w*.5-6):150;   // a street stops short of a river
    for(let a=ROAD.half-.4;a<=streetEnd;a+=4){const lat=side*a,nb=smooth(a,ROAD.half,ROAD.half+6);
      for(const e of [-W,W]){const ss=sc+e,[x,z]=L(ss,lat),yy=(1-nb)*(roadSurface(ss,side*Math.min(a,ROAD.half))+.03)+nb*(groundY(ss,lat)+.09);pos.push(x,yy,z);uv.push(e<0?.12:.88,a/ROAD_TILE*1.6);col.push(1,1,1);}
      if(rows>0){const p=(rows-1)*2,q=rows*2;if(side>0)idx.push(p,p+1,q,p+1,q+1,q);else idx.push(p,q,p+1,p+1,q,q+1);}rows++;}
    const sg=new T.BufferGeometry();sg.setAttribute('position',new T.Float32BufferAttribute(pos,3));sg.setAttribute('uv',new T.Float32BufferAttribute(uv,2));sg.setAttribute('color',new T.Float32BufferAttribute(col,3));
    sg.setIndex(idx);sg.computeVertexNormals();const nrm=sg.attributes.normal;let up=0;for(let i=0;i<nrm.count;i++)up+=nrm.getY(i);if(up<0){idx.reverse();sg.setIndex(idx);sg.computeVertexNormals();}
    const m=new T.Mesh(sg,STREET);m.receiveShadow=true;g.add(m);g.userData.streets=(g.userData.streets||[]).concat(m);
    // houses on both sides, facing the street, with a lamp now and then
    for(let i=0;i<4;i++){const a=26+i*24+r()*5;for(const e of [-1,1]){if(r()<.15)continue;const ss=sc+e*(13+r()*3);house(ss,side*a,{town:b==='town'||r()<.4,ry:e>0?0:Math.PI});}
      if(i%2===0){const [px,pz]=L(sc-W-1,side*(a+10)),yy=groundY(sc-W-1,side*(a+10));near.solid.add(cylT(.7,6),M(px,yy+2.6,pz,.08,5.2,.08),'#4c5550');lamps.add(boxT(),M(px,yy+5.2,pz,.3,.12,.3),C('#ffe2a6'));}}}
  if(hasVillage&&vc>=start&&vc<start+CH)church(vc,vSide*30);
  if(hasVillage&&vc+90>=start&&vc+90<start+CH)petrol(vc+90,-vSide*24);
  if(!alien&&(b==='fields'||b==='coast'||b==='mountain')&&!winter){
    for(let k=0;k<2;k++)if(r()<(b==='mountain'?.3:.55)){const cs=start+10+r()*(CH-20),side=r()<.5?-1:1,cl=side*(26+r()*70),isCow=b!=='coast'&&r()<.38,n=isCow?3+Math.floor(r()*4):5+Math.floor(r()*7);
      if(inVillage(cs))continue;
      for(let i=0;i<n;i++){const ss=cs+(r()-.5)*24,ll=cl+(r()-.5)*24;(isCow?cow:sheep)(ss,ll,r()<.6);}}}
  // small woods: a cluster of trees away from the road
  if(!alien&&b!=='desert'&&b!=='town'&&r()<(b==='coast'?.15:.4)){const cs=start+r()*CH,side=r()<.5?-1:1,cl=side*(40+r()*120),rad=16+r()*22,n=10+Math.floor(r()*14);
    if(!inVillage(cs))for(let i=0;i<n;i++){const a=r()*6.283,d=Math.sqrt(r())*rad,ts=cs+Math.cos(a)*d,tl=cl+Math.sin(a)*d*1.4;if(Math.abs(tl)<20)continue;
      (b==='mountain'||b==='snow')?(r()<.4?spruce(ts,tl,1+r()*.3):pine(ts,tl,1+r()*.3)):(r()<.2?birch(ts,tl):deciduous(ts,tl,.9+r()*.5));}}
  if(!alien&&(b==='mountain'||b==='snow'||b==='fields')&&r()<.4){const cs=start+r()*CH,side=r()<.5?-1:1;for(let i=0;i<2+Math.floor(r()*3);i++)deer(cs+(r()-.5)*16,side*(45+r()*60));}
  // field boundaries: dry stone walls, hedges or fences beside the road and between fields
  if(!alien&&(b==='fields'||b==='coast'||b==='mountain'||b==='town')){const W=13.5,STEP=4;
    const hedgeC=winter?C('#6a5f4e'):SZN.leaves?C('#7b7a3c'):C('#4d7140');
    const kindAt=(s,side)=>{const h=hash2(Math.floor(s/160),side*7+3+(b==='town'?50:0));return b==='town'?(h<.6?'hedge':null):b==='mountain'?(h<.6?'wall':null):h<.42?'wall':h<.72?'hedge':h<.86?'fence':null;};
    const seg=(kind,a,c)=>{const len=Math.hypot(c.x-a.x,c.z-a.z),ry=Math.atan2(a.x-c.x,a.z-c.z),rx=-Math.atan2(a.y-c.y,len),mx=(a.x+c.x)/2,my=(a.y+c.y)/2,mz=(a.z+c.z)/2;
      if(kind==='wall'){
        // dry stone: a low core, two courses of uneven stones and a row of upright capstones
        near.solid.add(boxT(),M(mx,my+.3,mz,.5,.62,len+.05,ry,rx),'#8b8577',{ao:.45,vary:.2});
        const n=Math.max(2,Math.round(len/.7)),dxs=(c.x-a.x)/n,dzs=(c.z-a.z)/n,dys=(c.y-a.y)/n;
        for(let i=0;i<n;i++){const px=a.x+dxs*(i+.5),pz=a.z+dzs*(i+.5),py=a.y+dys*(i+.5),sc=.82+r()*.3;
          for(const [yy,hh] of [[.22,.3],[.52,.26]])near.solid.add(yy<.3?boxT():rockT(r),M(px+(r()-.5)*.08,py+yy,pz+(r()-.5)*.08,.6*sc,hh,(len/n)*.9,ry+(r()-.5)*.3,rx),C(['#a29b8b','#8f8a7e','#b0aa9a','#857f72'][Math.floor(r()*4)]),{ao:.5,top:.15,vary:.2});
          near.solid.add(boxT(),M(px,py+.8,pz,.5,.2+r()*.1,(len/n)*.5,ry+(r()-.5)*.25,rx,(r()-.5)*.3),'#9d9787',{ao:.6,top:.2,vary:.25});}}
      else if(kind==='hedge'){
        // a hedge: a dense core with rounded clumps along the top and sides
        near.foliage.add(boxT(),M(mx,my+.6,mz,.95,1.2,len+.1,ry,rx),hedgeC.clone().multiplyScalar(.82),{ao:.5,vary:.2,sway:.05,swayBase:my,swayH:1.4});
        const n=Math.max(2,Math.round(len/1.1));
        for(let i=0;i<n;i++){const t=(i+.5)/n,px=lerp(a.x,c.x,t),pz=lerp(a.z,c.z,t),py=lerp(a.y,c.y,t),rad=.55+r()*.3;
          near.foliage.add(blobT(r,true),M(px+(r()-.5)*.25,py+1.05+r()*.35,pz+(r()-.5)*.25,rad*1.1,rad*.85,rad*1.2,r()*6),hedgeC.clone().offsetHSL((r()-.5)*.03,0,(r()-.5)*.08),{ao:.55,top:.25,vary:.15,sway:.25,swayBase:py,swayH:1.8});}}
      else{near.solid.add(boxT(),M(a.x,a.y+.6,a.z,.12,1.2,.12,ry),'#7d6a52',{ao:.6});for(const y of [.45,.95])near.solid.add(boxT(),M(mx,my+y,mz,.06,.1,len,ry,rx),'#8a7556');}};
    for(const side of [-1,1]){let prev=null,pk=null;
      for(let s=start;s<=start+CH+.01;s+=STEP){
        const kind=kindAt(s,side),gate=hash2(Math.floor(s/52),side+11)<.2&&(((s%52)+52)%52)<5;
        const [x,z]=L(s,side*W),cur=kind&&!gate?{x,z,y:groundY(s,side*W)}:null;
        if(cur)obs(s,side*W,kind==='hedge'?.6:.4);if(cur&&prev&&pk===kind){seg(kind,prev,cur);obs(s-2,side*W,kind==='hedge'?.6:.4);}prev=cur;pk=kind;}
      // boundaries running away from the road between fields
      for(let cell=Math.floor(start/85);cell*85<start+CH;cell++){const sc=cell*85+20+hash2(cell,side*3+1)*45;if(sc<start||sc>=start+CH)continue;
        const kind=kindAt(sc,side);if(!kind||hash2(cell,side*9+2)>.6)continue;
        const far=W+40+hash2(cell,side+17)*90;let p=null;
        const lineTrees=kind!=='fence'&&r()<.6;for(let lp=W;lp<=far;lp+=6){const [x,z]=L(sc,side*lp),q={x,z,y:groundY(sc,side*lp)};if(p){seg(kind,p,q);obs(sc,side*(lp-3),.6);}obs(sc,side*lp,.6);p=q;if(lineTrees&&lp>W+8&&r()<.3)deciduous(sc+1.6,side*lp,.9+r()*.4);}}}}
  // the Wild Coast: boulders at the foot of the cliffs and surf where the waves meet the rocks
  if(P0.coast>.5){const fpos=[],fedge=[];
    for(let s=start;s<=start+CH+.01;s+=6){const sd=coastSide(s);let lc=null;
      for(let lp=96;lp<=170;lp+=2)if(groundY(s,sd*lp)<SEA_LEVEL+.3){lc=lp;break;}
      if(lc===null)continue;
      if(r()<.8)rock(s+r()*6,sd*(lc-3+r()*9),1.2+r()*3.2,bio.rockC.clone().offsetHSL(0,0,(r()-.5)*.1));
      if(r()<.5)rock(s+r()*6,sd*(lc+2+r()*12),.8+r()*2,bio.rockC);
      for(const [lp,e] of [[lc-3,0],[lc+3,.5],[lc+12,1]]){const [x,z]=L(s,sd*lp);fpos.push(x,SEA_LEVEL+.06,z);fedge.push(e);}}
    // stitch the rows into a strip (three vertices across, rows 6 m apart)
    const rows=fedge.length/3|0;if(rows>1){const idx=[];for(let i=0;i<rows-1;i++)for(let k=0;k<2;k++){const a=i*3+k,b2=a+1,d=a+3,e=d+1;idx.push(a,d,b2,b2,d,e);}
      const fg=new T.BufferGeometry();fg.setAttribute('position',new T.Float32BufferAttribute(fpos,3));fg.setAttribute('edge',new T.Float32BufferAttribute(fedge,1));fg.setIndex(idx);
      const fm=new T.Mesh(fg,FOAM);fm.renderOrder=2;g.add(fm);}}
  // bend warning signs before sharper bends
  if(!alien)for(let s=start;s<start+CH;s+=10){const k=roadCurvature(s+70);
    if(Math.abs(k)>1/240&&Math.abs(roadCurvature(s+20))<Math.abs(k)*.55&&Math.abs(roadCurvature(s-10))<Math.abs(k)*.45){
      const dir=Math.sign(k),lp=ROAD.half+2.4,[x,z]=L(s,lp),y0=groundY(s,lp),ry=roadYaw(s),fx=Math.sin(ry)*.04,fz=Math.cos(ry)*.04;
      obs(s,lp,.12);near.solid.add(cylT(.6,6),M(x,y0+1.1,z,.07,2.2,.07),'#8b9093',{ao:.6});
      near.solid.add(boxT(),M(x,y0+2.15,z,.78,.78,.05,ry),'#e7c13d',{vary:.04});
      for(const up of [1,-1])near.solid.add(boxT(),M(x+fx,y0+2.15+up*.1,z+fz,.09,.32,.02,ry,0,.85*dir*up),'#1d1f22');}}
  // power line along the left side, a pole every 40 m with sagging wires between
  const tops=[];if(!alien)for(let s=start;s<=start+CH;s+=40)tops.push(s<start+CH?pole(s):(()=>{const [x,z]=L(s,-11.5);return [x,groundY(s,-11.5)+8.6,z];})());
  for(let i=0;i<tops.length-1;i++){const a=tops[i],bb=tops[i+1],sa=start+i*40;for(const k of [-1.15,1.15]){const ya=roadYaw(sa),yb=roadYaw(sa+40),ax=a[0]+k*Math.cos(ya),az=a[2]-k*Math.sin(ya),bx=bb[0]+k*Math.cos(yb),bz=bb[2]-k*Math.sin(yb);
    for(let q=0;q<12;q++){for(const t of [q/12,(q+1)/12]){wires.push(lerp(ax,bx,t),lerp(a[1],bb[1],t)-Math.sin(t*Math.PI)*1.1,lerp(az,bz,t));}}}}

  yield;
  const add=m=>m&&g.add(m);
  if(inst.size){const hi=new T.Group();g.add(hi);g.userData.hi=hi;
    for(const [mdl,mats] of inst)for(const p of mdl.parts){const im=acquire('inst:'+p.geometry.uuid,()=>new T.InstancedMesh(p.geometry,p.material,INST_CAP)),n=Math.min(mats.length,INST_CAP);im.count=n;for(let i=0;i<n;i++)im.setMatrixAt(i,mats[i]);im.instanceMatrix.needsUpdate=true;im.castShadow=im.receiveShadow=true;im.computeBoundingSphere();hi.add(im);}
    g.userData.lo=[lod.solid.mesh(MAT.solid,{cast:true}),lod.foliage.mesh(MAT.foliage,{cast:true})].filter(Boolean);g.userData.lo.forEach(m=>g.add(m));}
  // cat's eyes down the centre line: dull studs by day, glinting in the headlights at night
  if(b!=='planet'){const cat=acquire('cats',()=>new T.InstancedMesh(catGeo,CATS,12));let nc=0;
    for(let s=Math.ceil(start/12)*12;s<start+CH&&nc<12;s+=12){if(structureAt(s)===2)continue;const [cx,cz]=L(s,0);_cm.makeRotationY(roadYaw(s));_cm.setPosition(cx,roadSurface(s,0)+.025,cz);cat.setMatrixAt(nc++,_cm);}
    cat.count=nc;cat.instanceMatrix.needsUpdate=true;cat.computeBoundingSphere();g.add(cat);}
  if((b==='fields'||b==='town'||b==='mountain'||b==='coast')&&!winter){const n=b==='town'?8000:b==='mountain'?20000:26000,im=acquire('grass:'+n,()=>new T.InstancedMesh(bladeGeo,MAT.grass,n)),col=_gc,dry=_dry,base=P0.ground.clone().offsetHSL(0,-.08,-.02);let cs=0,clx=0,cy=0,tall=1,pk=0,pc=null;
    const fl=acquire('flowers',()=>new T.InstancedMesh(flowerGeo,flowerMat,FLOWER_CAP)),pal=FLOWERS[SZ]||FLOWERS.summer;let nf=0;
    for(let i=0;i<n;i++){if(i%1200===1199)yield;if(i%9===0){const side=r()<.5?-1:1;cs=start+r()*CH;clx=side*(8.25+Math.pow(r(),2.6)*(b==='town'?9:48));cy=groundY(cs,clx);
        // thick and tall beside the road, thinner and shorter further out; meadow patches of their own colour
        tall=1.3-.55*smooth(Math.abs(clx),9,34);const mv=vnoise(cs*.014+7,clx*.014+3);pk=mv>.58?(mv-.58)*2.2:mv<.38?(.38-mv)*2.4:0;pc=mv>.58?(r()<.3?_sage:_gold):_deep;
        // wildflowers in some clumps (more in spring)
        if(nf<FLOWER_CAP&&b!=='town'&&r()<SZN.flowers*.3){const [fx,fz]=L(cs,clx),fc=pal[Math.floor(r()*pal.length)];for(let q=0;q<3&&nf<FLOWER_CAP;q++){fl.setMatrixAt(nf,Mt(fx+(r()-.5)*.5,cy+.3+r()*.25,fz+(r()-.5)*.5,1,1,1,r()*6));fl.setColorAt(nf,_fc.set(fc));nf++;}}}
      const a=r()*6.283,d=Math.sqrt(r())*.35,s=cs+Math.cos(a)*d,lx=clx+Math.sin(a)*d;if(Math.abs(lx)<8.05){im.setMatrixAt(i,Mt(0,-50,0,0,0,0));continue;}
      const [x,z]=L(s,lx),h=((b==='fields'?.3:.22)+r()*r()*.45)*tall;
      im.setMatrixAt(i,Mt(x,cy-.02,z,.6+r()*.6,h,1,r()*6.283,(r()-.5)*.5,(r()-.5)*.5));col.copy(base).multiplyScalar(.62+r()*.5);if(pk>0)col.lerp(pc,Math.min(.7,pk));if(r()<.12)col.lerp(dry,.55);im.setColorAt(i,col);}
    im.instanceMatrix.needsUpdate=true;if(im.instanceColor)im.instanceColor.needsUpdate=true;im.receiveShadow=true;im.computeBoundingSphere();g.add(im);g.userData.grass=im;
    fl.count=nf;if(nf){fl.instanceMatrix.needsUpdate=true;fl.instanceColor.needsUpdate=true;fl.computeBoundingSphere();g.add(fl);g.userData.flowers=fl;}else release(fl);}
  yield;
  add(yield* buildTerrainGen(start,ox));yield;add(buildRoad(start,ox));yield;
  add(near.solid.mesh(MAT.solid,{cast:true}));yield;add(near.foliage.mesh(MAT.foliage,{cast:true}));yield;
  add(far.solid.mesh(MAT.solid));yield;add(far.foliage.mesh(MAT.foliage));yield;
  {const dm=deerB.mesh(MAT.solid,{cast:true});if(dm){g.add(dm);g.userData.deer=dm;}}
  add(windows.mesh(MAT.windows,{receive:false}));add(lamps.mesh(MAT.lamps,{receive:false}));add(pools.mesh(MAT.pool,{receive:false}));add(signs.mesh(MAT.sign));
  if(wires.length){const n=wires.length/3;g.add(new T.LineSegments(fillGeometry(pooledGeometry({position:3},n),{position:wires},n),MAT.wire));}
  g.userData.obstacles=OBS;g.userData.lights=LIGHTS;g.userData.chimneys=CHIM;g.userData.spin=SPIN;scene.add(g);return g;}

// cat's eyes: a tiny stud whose reflector lights up when the headlights fall on it (bright close by, at night)
const catGeo=new T.BoxGeometry(.16,.035,.1),_cm=new T.Matrix4();
const CATS=MAT.cats;
// surf: white foam that comes and goes along the shore
const FOAM=new T.MeshBasicMaterial({color:'#f4f8f7',transparent:true,depthWrite:false,opacity:.85});
FOAM.onBeforeCompile=sh=>{sh.uniforms.uTime=wind.time;
  sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nattribute float edge;varying float vEdge;varying vec2 vP;').replace('#include <begin_vertex>','#include <begin_vertex>\nvEdge=edge;vP=position.xz;');
  sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nuniform float uTime;varying float vEdge;varying vec2 vP;')
    .replace('#include <color_fragment>','#include <color_fragment>\nfloat bend=sin(vP.x*.05+vP.y*.07)*.3,foam=0.;for(int i=0;i<3;i++){float fi=float(i);float wave=fract(vEdge*1.6-uTime*(.1+fi*.025)+bend+fi*.37);float line=smoothstep(.0,.12,wave)*smoothstep(.5,.2,wave)*(1.-smoothstep(.45,1.,vEdge));float lace=.45+.55*sin(vP.x*(.9+fi*.4)+vP.y*(.7+fi*.3)+uTime*(1.3+fi*.5));foam=max(foam,line*lace*(1.-fi*.2));}diffuseColor.a*=clamp(foam+(1.-smoothstep(0.,.25,vEdge))*.6,0.,1.);');};
// shared pieces for the landmarks
const BEAM=new T.MeshBasicMaterial({color:'#fff1c4',transparent:true,opacity:.07,blending:T.AdditiveBlending,depthWrite:false,side:T.DoubleSide,fog:false});
const SAILW=new T.MeshStandardMaterial({color:'#6b5440',roughness:.9}),SAILC=new T.MeshStandardMaterial({color:'#e8e1d0',roughness:.95,side:T.DoubleSide});
let _beam,_sail,_pool,_fall;
const shared=g=>{g.userData.shared=true;return g;};
const beamGeo=()=>_beam||(_beam=shared(new T.ConeGeometry(5,140,16,1,true).translate(0,-70,0).rotateZ(Math.PI/2)));
const sailGeo=()=>_sail||(_sail=shared(new T.BoxGeometry(1,1,1)));
const poolGeo=()=>_pool||(_pool=shared(new T.CircleGeometry(6,20).rotateX(-Math.PI/2)));
/** Falling water: white streaks on blue, scrolled downwards each frame (see life.js). */
export function fallMat(){if(_fall)return _fall;const c=document.createElement('canvas');c.width=64;c.height=256;const x=c.getContext('2d');x.fillStyle='#9fc3cf';x.fillRect(0,0,64,256);
  for(let i=0;i<220;i++){x.fillStyle=`rgba(255,255,255,${.2+Math.random()*.6})`;x.fillRect(Math.random()*64,Math.random()*256,1+Math.random()*3,10+Math.random()*50);}
  const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.colorSpace=T.SRGBColorSpace;
  return _fall=new T.MeshStandardMaterial({map:t,transparent:true,opacity:.92,roughness:.3,emissive:'#ffffff',emissiveIntensity:.12,depthWrite:false,side:T.DoubleSide});}
export {BEAM};
// side streets use the road surface, drawn just above the ground they lie on
const STREET=MAT.road.clone();STREET.polygonOffset=true;STREET.polygonOffsetFactor=-1;STREET.polygonOffsetUnits=-2;
STREET.onBeforeCompile=MAT.road.onBeforeCompile;STREET.customProgramCacheKey=MAT.road.customProgramCacheKey;STREET.userData=MAT.road.userData;
const LAKE=new T.MeshStandardMaterial({color:'#2d6370',roughness:.08,metalness:0,envMapIntensity:.9,side:T.DoubleSide});
// small wind ripples on still water: the surface normal is bent by moving noise (in the section's own coordinates)
LAKE.onBeforeCompile=sh=>{sh.uniforms.uTime=wind.time;Object.assign(sh.uniforms,REFL);
  sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vWp;').replace('#include <common>','#include <common>\nuniform mat4 uReflM;varying vec4 vRP;').replace('#include <begin_vertex>','#include <begin_vertex>\nvWp=position.xz;').replace('#include <project_vertex>','#include <project_vertex>\nvRP=uReflM*(modelMatrix*vec4(transformed,1.));');
  sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
    varying vec2 vWp;uniform float uTime,uRefl;uniform sampler2D tRefl;varying vec4 vRP;vec2 rip=vec2(0.);
    float wh(vec2 p){return sin(p.x*.9+uTime*1.3)*.5+sin(p.y*1.17-uTime*1.1+p.x*.31)*.5+sin((p.x+p.y)*2.3+uTime*2.1)*.22+sin((p.x-p.y*.7)*3.7-uTime*2.7)*.12;}`)
  .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
    {float e=.15,h0=wh(vWp);float rk=.05*(1.-smoothstep(25.,140.,length(vViewPosition)));vec3 wn=normalize(vec3(-(wh(vWp+vec2(e,0.))-h0)/e*rk,1.,-(wh(vWp+vec2(0.,e))-h0)/e*rk));normal=normalize((viewMatrix*vec4(wn,0.)).xyz);rip=wn.xz;}`)
  .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
    {float fr=pow(1.-clamp(dot(normal,normalize(vViewPosition)),0.,1.),4.);diffuseColor.rgb*=1.-fr*.6;}`)
  .replace('#include <opaque_fragment>',`if(uRefl>.5){vec4 rp=vRP;rp.xy+=rip*rp.w*.35;vec3 rc=texture2DProj(tRefl,rp).rgb;
      float fr=.3+.7*pow(1.-clamp(dot(normal,normalize(vViewPosition)),0.,1.),3.);outgoingLight=mix(outgoingLight,rc*vec3(.86,.92,.94),fr*.82);}
    #include <opaque_fragment>`);};
const INST_CAP=8,_gc=new T.Color(),_dry=C('#b9a964'),_fc=new T.Color(),_gold=C('#b4ab4e'),_deep=C('#35663a'),_sage=C('#7f9a6a');
const FLOWER_CAP=1500,flowerGeo=new T.OctahedronGeometry(.07,0),flowerMat=new T.MeshStandardMaterial({roughness:.75});
const FLOWERS={spring:['#f2d36b','#f6f3e8','#b79be0','#e27c63','#f3a5c0','#f2d36b'],summer:['#f2d36b','#f4f1e6','#a98ad3','#df6a52'],autumn:['#d9b45a','#c98b4a'],winter:['#ffffff']};
// Road sections: built ahead by the scheduler, recycled behind.
const chunks=[],have=new Set(),scheduler=new Scheduler(5),AHEAD=11,BEHIND=2;
const addChunk=c=>{const k=c.userData.index;
  // a section rebuilt after the road changed replaces the old one only now, so nothing ever goes missing
  for(let i=chunks.length-1;i>=0;i--)if(chunks[i].userData.index===k&&chunks[i].userData.stale){clearObstacles(k);recycle(chunks[i]);chunks.splice(i,1);}
  chunks.push(c);have.add(k);setObstacles(k,c.userData.obstacles||[]);};

/** Distance range covered by built sections around the player (the far land hides under it). */
function builtRange(idx){let a=idx,b=idx;while(have.has(a-1))a--;while(have.has(b+1))b++;return have.has(idx)?[a*CH,(b+1)*CH]:null;}

function disposeChunk(g){have.delete(g.userData.index);clearObstacles(g.userData.index);recycle(g);}

for(let i=-BEHIND;i<=AHEAD;i++)addChunk(makeChunk(i));

/** Call every frame: queues new sections ahead, recycles old ones, builds within the time budget and places sections around the player. */
const RL={n:0,v:MAT.road.userData.lamps.value};
function updateChunks(distance,base,yBase=0){wind.dist.value=distance;wind.base.value=base;
  const idx=Math.floor(distance/CH);
  if(idx!==G.lastIndex){G.lastIndex=idx;
    for(let i=chunks.length-1;i>=0;i--){const ci=chunks[i].userData.index;if(ci<idx-BEHIND||ci>idx+AHEAD){disposeChunk(chunks[i]);chunks.splice(i,1);}}
    for(let k=idx-BEHIND;k<=idx+AHEAD;k++)if(!scheduler.has(k)&&!have.has(k)){const v=VER;scheduler.add(k,chunkBuilder(k),c=>{if(v!==VER&&c.userData.index>=STALE){recycle(c);G.lastIndex=-999;}else addChunk(c);});}}
  scheduler.run();
  const t=state.time,dusk=(t>5.3&&t<8.6)||(t>17&&t<20.6);RL.n=0;let lakeD=1e9;G.lakeLevel=null;
  for(let i=0;i<chunks.length;i++){const c=chunks[i],u=c.userData,d=u.start-distance;c.position.set(u.ox-base,-yBase,distance-u.start);
    if(u.lights&&RL.n<16&&MAT.road.userData.lampK.value>0)for(let j=0;j<u.lights.length&&RL.n<16;j+=4){const ld=u.lights[j+3]-distance;if(ld>-40&&ld<220)RL.v[RL.n++].set(u.lights[j]+c.position.x,u.lights[j+1]+c.position.y,u.lights[j+2]+c.position.z,1);}
    if(u.hi){const on=G.quality.hi>0&&d>-260&&d<G.quality.hi;u.hi.visible=on;for(let j=0;j<u.lo.length;j++)u.lo[j].visible=!on;}if(u.grass)u.grass.visible=d>-160&&d<G.quality.grass;if(u.flowers)u.flowers.visible=d>-160&&d<G.quality.grass*.8;if(u.deer)u.deer.visible=dusk;}
  MAT.road.userData.lampN.value=RL.n;
  for(const c of chunks){const u=c.userData,d=u.start-distance;if(u.lake&&d>-150&&d<420&&Math.abs(d+30)<lakeD){lakeD=Math.abs(d+30);G.lakeLevel=u.lake.userData.level+c.position.y;}}
}

/** The places from distance s onwards have changed (a fork): sections from there are built again
 * (they are far ahead, so the change is not seen). Sections still being built are dropped when done. */
let VER=0,STALE=1e9;
function refreshFrom(s){VER++;STALE=Math.floor(s/CH);
  // the old sections stay on screen until their replacements are ready (nearest first)
  for(const c of chunks)if(c.userData.index>=STALE&&!c.userData.stale){c.userData.stale=true;have.delete(c.userData.index);}
  G.lastIndex=-999;}
/** Rebuild every section around `distance` at once (scenery, road or difficulty changed, or a jump). Unfinished jobs are completed and recycled so nothing leaks. */
function rebuild(distance,near=false){scheduler.jobs.delete('far');scheduler.drain(c=>{have.delete(c.userData.index);recycle(c);});
  for(const c of chunks)disposeChunk(c);chunks.length=0;const idx=Math.floor(distance/CH);G.lastIndex=idx;
  // near: only the sections right around you now, the rest are built over the next frames (a shorter pause)
  if(near){for(let k=idx-1;k<=idx+1;k++)addChunk(makeChunk(k));G.lastIndex=-999;return;}
  for(let k=idx-BEHIND;k<=idx+AHEAD;k++)addChunk(makeChunk(k));}

/** The village near distance s (where cars pull in to stop), or null. Same rule as the sections use. */
function villageNear(s){const VSEG=2600,vn=Math.floor(s/VSEG),vc=vn*VSEG+600+hash2(vn,77)*1400,b=biomeAt(vc);
  if(!(hash2(vn,78)<.75&&['fields','coast','mountain','snow'].includes(b)&&!structureAt(vc)&&!structureAt(vc+90)))return null;
  return {vc,stop:vc+62};}
export {villageNear,refreshFrom,LAKE,builtRange,buildTerrain,buildTerrainGen,buildRoad,USABLE_MODELS,makeChunk,chunkBuilder,chunks,scheduler,disposeChunk,rebuild,updateChunks,poolStats};
