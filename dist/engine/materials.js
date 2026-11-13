import * as T from '../three.module.js';
import {C,clamp,hash2,rand} from './core.js';
import {ASSETS} from './render.js';
import {canvasTexture,glowTex,roadNormal,roadRough,roadTex,signTex} from './textures.js';
/* --------------------------------------------------------------- materials */

const wind={time:{value:0},amount:{value:.05},dist:{value:0},base:{value:0},car:{value:new T.Vector3(0,-999,0)},carV:{value:0}};

const MAT={
  solid:new T.MeshStandardMaterial({vertexColors:true,roughness:.86}),
  foliage:new T.MeshStandardMaterial({vertexColors:true,roughness:.8}),
  road:roadNormal?new T.MeshStandardMaterial({vertexColors:true,map:roadTex,roughnessMap:roadRough,normalMap:roadNormal,normalScale:new T.Vector2(.9,.9),roughness:1})
    :new T.MeshStandardMaterial({vertexColors:true,map:roadTex,roughnessMap:roadRough,bumpMap:roadRough,bumpScale:.5,roughness:1}),
  windows:new T.MeshBasicMaterial({vertexColors:true}),
  lamps:new T.MeshBasicMaterial({vertexColors:true}),
  pool:new T.MeshBasicMaterial({vertexColors:true,map:glowTex,transparent:true,depthWrite:false,blending:T.AdditiveBlending,opacity:0}),
  sign:new T.MeshStandardMaterial({vertexColors:true,map:signTex,roughness:.75}),
  wire:new T.LineBasicMaterial({color:'#2b302d',transparent:true,opacity:.85}),
};

MAT.foliage.onBeforeCompile=sh=>{sh.uniforms.uTime=wind.time;sh.uniforms.uWind=wind.amount;
  sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nattribute float sway;uniform float uTime,uWind;varying vec3 vLeafP;').replace('#include <uv_vertex>','#include <uv_vertex>\nvLeafP=position;')
  .replace('#include <begin_vertex>','#include <begin_vertex>\nfloat ph=dot(position.xz,vec2(.13,.11)),gust=.55+1.1*pow(sin(dot(position.xz,vec2(.021,.013))-uTime*.9)*.5+.5,3.);transformed.x+=(sin(uTime*1.9+ph)+.6)*sway*uWind*gust;transformed.z+=cos(uTime*1.4+ph*1.7)*sway*uWind*.6*gust;transformed.y-=sway*uWind*gust*.15;');
  // leafy surface: clumps of leaves with dark gaps between them and brighter leaf edges catching the light,
  // instead of a smooth blob (bumped as well as shaded, so the light falls into the gaps)
  sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
varying vec3 vLeafP;float lh(vec3 p){return fract(sin(dot(p,vec3(127.1,311.7,74.7)))*43758.5453);}
float leafN(vec3 p){vec3 i=floor(p),f=fract(p);float d=1.;for(int x=-1;x<=1;x++)for(int y=-1;y<=1;y++)for(int z=-1;z<=1;z++){vec3 o=vec3(x,y,z);vec3 c=o+vec3(lh(i+o),lh(i+o+3.1),lh(i+o+7.7))-f;d=min(d,dot(c,c));}return sqrt(d);}`)
  .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
  float lf=leafN(vLeafP*2.6),lf2=leafN(vLeafP*6.1+3.);float leafy=smoothstep(.2,.75,lf)*.6+smoothstep(.15,.6,lf2)*.4;
  normal=normalize(normal+vec3(dFdx(leafy),dFdy(leafy),0.)*6.);
  diffuseColor.rgb*=.62+.55*(1.-leafy)+.12*lh(floor(vLeafP*6.));`);};
/* ------------------------------------------- ground materials (PBR splat) */
// Tileable procedural stand-ins, replaced by Poly Haven scans when they have been downloaded.

function tnoise(x,y,p){const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf),m=k=>((k%p)+p)%p;const a=hash2(m(xi),m(yi)),b=hash2(m(xi+1),m(yi)),c=hash2(m(xi),m(yi+1)),d=hash2(m(xi+1),m(yi+1));return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;}

function tfbm(x,y,p,o){let s=0,a=.5,n=0;for(let i=0;i<o;i++){s+=a*tnoise(x,y,p);n+=a;x*=2;y*=2;p*=2;a*=.5;}return s/n;}

function makeLayer(kind){const N=256,H=new Float32Array(N*N),r=rand(kind.length*31),[c0,c1,f,str]={grass:['#3f5a22','#7c8f3a',8,2.2],rock:['#5f5c56','#a29d92',4,4],sand:['#b98f5f','#e2c393',6,1.6],snow:['#d9e2e8','#f8fbfc',4,.9]}[kind],A=C(c0),B=C(c1),col=new T.Color();
  for(let y=0;y<N;y++)for(let x=0;x<N;x++){const u=x/N*f,v=y/N*f;let h=tfbm(u,v,f,5);
    if(kind==='grass')h=h*.45+tnoise(x/4,y/4,N/4)*.35+r()*.2;if(kind==='rock')h=Math.pow(1-Math.abs(tfbm(u+3,v,f,5)*2-1),2)*.6+h*.4;if(kind==='sand')h=h*.55+(Math.sin((v+tfbm(u,v,f,3)*1.2)*Math.PI*2*3)*.5+.5)*.45;if(kind==='snow')h=h*.85+r()*.15;H[y*N+x]=h;}
  const diff=canvasTexture(N,N,(c)=>{const img=c.createImageData(N,N);for(let i=0;i<N*N;i++){col.copy(A).lerp(B,clamp(H[i]*1.4-.2,0,1));const sr=new T.Color().copy(col).convertLinearToSRGB();img.data[i*4]=sr.r*255;img.data[i*4+1]=sr.g*255;img.data[i*4+2]=sr.b*255;img.data[i*4+3]=255;}c.putImageData(img,0,0);});
  const nor=canvasTexture(N,N,(c)=>{const img=c.createImageData(N,N),at=(x,y)=>H[((y+N)%N)*N+(x+N)%N];for(let y=0;y<N;y++)for(let x=0;x<N;x++){const dx=(at(x+1,y)-at(x-1,y))*str,dy=(at(x,y+1)-at(x,y-1))*str,l=Math.hypot(dx,dy,1),i=(y*N+x)*4;img.data[i]=(-dx/l*.5+.5)*255;img.data[i+1]=(dy/l*.5+.5)*255;img.data[i+2]=(1/l*.5+.5)*255;img.data[i+3]=255;}c.putImageData(img,0,0);},false);
  for(const t of [diff,nor])t.wrapS=t.wrapT=T.RepeatWrapping;return {diff,nor};}

function avgColor(tex){const c=document.createElement('canvas');c.width=c.height=8;const g=c.getContext('2d');g.drawImage(tex.image,0,0,8,8);const d=g.getImageData(0,0,8,8).data;let r=0,gg=0,b=0;for(let i=0;i<d.length;i+=4){r+=d[i];gg+=d[i+1];b+=d[i+2];}const n=d.length/4;return new T.Color().setRGB(r/n/255,gg/n/255,b/n/255,T.SRGBColorSpace);}

const LAYERS={};

for(const k of ['grass','rock','sand','snow']){const a=ASSETS?.textures[k];LAYERS[k]=a?{diff:a.diff,nor:a.nor||makeLayer(k).nor}:makeLayer(k);LAYERS[k].ref=avgColor(LAYERS[k].diff);}

// Road surface: breaks up the repeating texture with slow variation along the road, adds repaired
// patches and fading paint here and there, and on a wet road pools of water that shine.
MAT.road.userData.wet={value:0};MAT.road.userData.lamps={value:Array.from({length:16},()=>new T.Vector4())};MAT.road.userData.lampN={value:0};MAT.road.userData.lampK={value:0};MAT.road.userData.rain={value:0};MAT.road.userData.snow={value:0};MAT.road.userData.time=wind.time;
// cat's eyes: a tiny stud whose reflector lights up when the headlights fall on it (bright close by, at night)
MAT.cats=new T.MeshBasicMaterial({color:'#8d8f88',fog:true});MAT.cats.userData.night={value:0};
MAT.cats.onBeforeCompile=sh=>{sh.uniforms.uNight=MAT.cats.userData.night;
  sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying float vCatD;').replace('#include <project_vertex>','#include <project_vertex>\nvCatD=-mvPosition.z;');
  sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nuniform float uNight;varying float vCatD;')
    .replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb=mix(diffuseColor.rgb,vec3(5.,4.2,2.6)*(1.-smoothstep(25.,150.,vCatD))+diffuseColor.rgb*.2,uNight);');};
MAT.road.onBeforeCompile=sh=>{const U=MAT.road.userData;sh.uniforms.uWet=U.wet;sh.uniforms.uLamps=U.lamps;sh.uniforms.uLampN=U.lampN;sh.uniforms.uLampK=U.lampK;sh.uniforms.uRainNow=U.rain;sh.uniforms.uSnowRoad=U.snow;sh.uniforms.uTime=U.time;
  sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vRW;').replace('#include <project_vertex>','#include <project_vertex>\nvRW=(modelMatrix*vec4(transformed,1.)).xyz;');
  sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
uniform float uWet,uLampN,uLampK,uRainNow,uTime,uSnowRoad;uniform vec4 uLamps[16];varying vec3 vRW;
float rh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float rn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(rh(i),rh(i+vec2(1.,0.)),f.x),mix(rh(i+vec2(0.,1.)),rh(i+1.),f.x),f.y);}
float puddle;`)
  .replace('#include <map_fragment>',`#include <map_fragment>
  { vec2 q=vMapUv; float asphalt=step(.105,q.x)*step(q.x,.895);
    // long, slow changes in tone so the 24 m texture never visibly repeats
    float macro=rn(vec2(q.y*.31,q.x*2.7))*.6+rn(vec2(q.y*1.7+9.,q.x*7.))*.4;
    diffuseColor.rgb*=mix(1.,.86+.26*macro,asphalt);
    // repaired patches: darker, smoother rectangles in some cells of the road
    vec2 cell=floor(vec2(q.x*5.,q.y*.9)); float p=rh(cell+7.3);
    vec2 inCell=fract(vec2(q.x*5.,q.y*.9));
    float patchMask=asphalt*step(.86,p)*step(.08,inCell.x)*step(inCell.x,.92)*step(.1,inCell.y)*step(inCell.y,.1+.6*rh(cell));
    diffuseColor.rgb*=mix(1.,.72+.1*rh(cell+3.),patchMask);
    // paint wears thin in places
    float lum=dot(diffuseColor.rgb,vec3(.33));
    float worn=smoothstep(.45,.85,rn(vec2(q.y*2.3,q.x*40.)))*.6;
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.3,.31,.3)*diffuseColor.rgb/max(lum,.01)*.5,step(.42,lum)*worn*asphalt*.7);
    // the wheel paths are a shade darker and smoother, with the odd rubber mark from a hard stop
    float paths=0.;for(int i=0;i<4;i++){float c=i==0?.215:i==1?.385:i==2?.615:.785;paths=max(paths,1.-smoothstep(.012,.04,abs(q.x-c)));}
    diffuseColor.rgb*=1.-paths*asphalt*.07*(.6+.4*rn(vec2(q.y*.6,q.x*3.)));
    float skidCell=floor(q.y*.08),sk=rh(vec2(skidCell,4.2));
    if(sk>.82){float x0=.215+step(.5,rh(vec2(skidCell,8.1)))*.4,along=fract(q.y*.08),bendx=sin(along*3.1)*.02;
      float mark=(1.-smoothstep(.006,.016,abs(q.x-x0-bendx)))+(1.-smoothstep(.006,.016,abs(q.x-x0-.17-bendx)));
      diffuseColor.rgb*=1.-mark*asphalt*smoothstep(.0,.15,along)*smoothstep(.55,.3,along)*.35;}
    // standing water after rain
    puddle=uWet*asphalt*smoothstep(.62,.78,rn(vec2(q.y*.9+3.,q.x*6.)));
    diffuseColor.rgb*=1.-puddle*.35;
    // snow: it settles first at the edges and down the middle; the wheel paths stay as dark, slushy tracks
    if(uSnowRoad>0.){float edge=1.-smoothstep(.12,.2,min(q.x,1.-q.x)),mid=1.-smoothstep(.02,.07,abs(q.x-.5));
      float cover=clamp(uSnowRoad*1.6-.2+rn(vec2(q.y*1.3,q.x*9.))*.35,0.,1.);
      float sn=max(edge*smoothstep(0.,.3,uSnowRoad),max(mid*.8,1.-paths*.92)*cover);sn*=.85+.15*rn(vec2(q.y*4.,q.x*30.));
      diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.86,.89,.92),clamp(sn,0.,1.)*.92);
      diffuseColor.rgb*=1.-paths*uSnowRoad*asphalt*.25;
      puddle*=1.-sn;} }`)
  .replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=mix(roughnessFactor,.04,puddle);')
  // raindrops landing in the puddles: little rings that spread and fade
  .replace('#include <normal_fragment_maps>',`#include <normal_fragment_maps>
  if(puddle>.05&&uRainNow>.05){vec2 g=vRW.xz*2.2,id=floor(g);vec2 rip=vec2(0.);
    for(int j=0;j<4;j++){vec2 o=vec2(float(j/2),float(j-j/2*2))-.5;vec2 c=id+o+vec2(rh(id+o),rh(id+o+4.1));float ph=fract(uTime*.9+rh(id+o+2.3));
      vec2 d=g-c;float l=length(d),w=sin((l-ph*.75)*38.)*exp(-pow((l-ph*.75)*7.,2.))*(1.-ph);rip+=d/max(l,.01)*w;}
    normal=normalize(normal+vec3(rip.x,0.,rip.y)*.35*puddle*uRainNow);}`)
  // at night on a wet road, each street lamp is reflected as a long, wavering streak towards you
  .replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
  if(uLampN>.5){vec3 acc=vec3(0.);vec3 C=cameraPosition;
    for(int i=0;i<16;i++){if(float(i)>=uLampN)break;vec3 P=uLamps[i].xyz;float yr=vRW.y;
      float t=(C.y-yr)/max(C.y-(2.*yr-P.y),.01);vec2 Q=C.xz+(P.xz-C.xz)*t,dir=normalize(Q-C.xz+1e-4);vec2 dq=vRW.xz-Q;
      float along=dot(dq,dir),lat=dot(dq,vec2(-dir.y,dir.x))+sin(along*3.1+vRW.x)*.05;
      acc+=exp(-lat*lat/(.05+abs(along)*.012))*exp(-along*along/(9.+t*4.))/(1.+length(Q-C.xz)*.03);}
    totalEmissiveRadiance+=vec3(1.,.7,.4)*acc*uLampK*(.35+puddle*1.6);}`);};
MAT.terrain=new T.MeshStandardMaterial({vertexColors:true,roughness:1,map:LAYERS.grass.diff,normalMap:LAYERS.grass.nor,normalScale:new T.Vector2(1,1)});

MAT.terrain.onBeforeCompile=sh=>{const L=LAYERS;Object.assign(sh.uniforms,{tG:{value:L.grass.diff},tR:{value:L.rock.diff},tS:{value:L.sand.diff},tW:{value:L.snow.diff},nG:{value:L.grass.nor},nR:{value:L.rock.nor},nS:{value:L.sand.nor},nW:{value:L.snow.nor},uRefG:{value:L.grass.ref},uRefR:{value:L.rock.ref},uRefS:{value:L.sand.ref},uRefW:{value:L.snow.ref}});
  sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nattribute vec4 splat;varying vec4 vSplat;varying vec3 vWP,vWN;').replace('#include <begin_vertex>','#include <begin_vertex>\nvSplat=splat;vWP=vec3(uv.x*7.,transformed.y,uv.y*7.);vWN=normal;');
  sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>\nvarying vec4 vSplat;uniform sampler2D tG,tR,tS,tW,nG,nR,nS,nW;uniform vec3 uRefG,uRefR,uRefS,uRefW;
float hh(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(hh(i),hh(i+vec2(1.,0.)),f.x),mix(hh(i+vec2(0.,1.)),hh(i+1.),f.x),f.y);}
// stochastic tiling: two shifted copies of each texture, blended by a slow noise, so tiles never visibly repeat
varying vec3 vWP,vWN;vec2 oA,oB;float kb;
vec3 st(sampler2D t,vec2 u){vec2 dx=dFdx(u),dy=dFdy(u);return mix(textureGrad(t,u+oA,dx,dy).rgb,textureGrad(t,u+oB,dx,dy).rgb,kb);}
vec3 layers(vec2 b,vec4 sw){vec3 x=vec3(0.);if(sw.x>.01)x+=st(tG,b*2.)*sw.x;if(sw.y>.01)x+=st(tR,b)*sw.y;if(sw.z>.01)x+=st(tS,b*2.)*sw.z;if(sw.w>.01)x+=st(tW,b)*sw.w;return x;}`)
  .replace('#include <map_fragment>',`vec4 sw=vSplat/max(dot(vSplat,vec4(1.)),1e-3);
    // steep ground shows bare rock (cuttings, crags, cliff faces), with a little grass clinging on
    {float stp=smoothstep(.8,.55,normalize(vWN).y)*(.75+.25*vn(vMapUv*.3));sw=mix(sw,vec4(sw.x*.15,1.,0.,sw.w*.4),stp*.85);sw/=max(dot(sw,vec4(1.)),1e-3);}vec2 uG=vMapUv*2.,uR=vMapUv,uS=vMapUv*2.,uW=vMapUv,uM=vMapUv*.25;
    float kN=vn(vMapUv*.05)*8.,ki=floor(kN);oA=sin(vec2(3.,7.)*ki);oB=sin(vec2(3.,7.)*(ki+1.));kb=smoothstep(.2,.8,fract(kN));
    // steep cuttings and cliffs are textured from the side, so the pattern is not stretched
    vec3 wn=normalize(vWN);float side=smoothstep(.8,.55,wn.y);
    vec3 tex=side<.99?layers(vMapUv,sw):vec3(0.);
    if(side>.01){vec2 hd=normalize(wn.xz+1e-4);vec2 us=vec2(dot(vWP.xz,vec2(-hd.y,hd.x)),vWP.y)/7.;tex=mix(tex,layers(us,sw),side);}
    vec3 macro=texture2D(tG,uM).rgb*sw.x+texture2D(tR,uM).rgb*sw.y+texture2D(tS,uM).rgb*sw.z+texture2D(tW,uM).rgb*sw.w;
    tex=mix(tex,macro,.3);
    // patches of bare soil through the grass
    float soil=smoothstep(.58,.82,vn(vMapUv*.021+3.7))*sw.x*.5;
    diffuseColor.rgb*=mix(tex,tex*vec3(.84,.72,.58),soil);
    // fine detail close to the camera: small clumps and stones break up the ground near the road
    {float near=1.-smoothstep(8.,45.,length(vViewPosition));diffuseColor.rgb*=1.+near*(vn(vMapUv*9.)-.5)*.32+near*(vn(vMapUv*31.)-.5)*.18;}`)
  .replace('#include <color_fragment>','vec3 ref=uRefG*sw.x+uRefR*sw.y+uRefS*sw.z+uRefW*sw.w;diffuseColor.rgb*=mix(vec3(1.),clamp(vColor.rgb/max(ref,vec3(.01)),.25,2.5),.75);')
  .replace('#include <roughnessmap_fragment>','float roughnessFactor=dot(sw,vec4(.96,.82,.9,.55));')
  .replace('#include <normal_fragment_maps>','vec3 mapN=vec3(.5,.5,1.)*0.;if(sw.x>.01)mapN+=st(nG,uG)*sw.x;if(sw.y>.01)mapN+=st(nR,uR)*sw.y;if(sw.z>.01)mapN+=st(nS,uS)*sw.z;if(sw.w>.01)mapN+=st(nW,uW)*sw.w;mapN=mapN/max(sw.x*step(.01,sw.x)+sw.y*step(.01,sw.y)+sw.z*step(.01,sw.z)+sw.w*step(.01,sw.w),1e-3)*2.-1.;mapN.xy*=normalScale;normal=normalize(tbn*mapN);');};
// Grass blades: one instanced mesh per road section near the camera.

const bladeGeo=(()=>{const g=new T.BufferGeometry(),w=.028,p=[-w,0,0,w,0,0,-w*.75,.4,.02,w*.75,.4,.02,-w*.4,.75,.06,w*.4,.75,.06,0,1,.12],c=[],n=[];for(let i=0;i<p.length;i+=3){const t=.32+.68*p[i+1];c.push(t,t,t);n.push(0,1,0);}
  g.setAttribute('position',new T.Float32BufferAttribute(p,3));g.setAttribute('normal',new T.Float32BufferAttribute(n,3));g.setAttribute('color',new T.Float32BufferAttribute(c,3));g.setIndex([0,1,2,1,3,2,2,3,4,3,5,4,4,5,6]);return g;})();

MAT.grass=new T.MeshStandardMaterial({vertexColors:true,roughness:.85,side:T.DoubleSide});

MAT.grass.onBeforeCompile=sh=>{sh.uniforms.uTime=wind.time;sh.uniforms.uWind=wind.amount;sh.uniforms.uDist=wind.dist;sh.uniforms.uBase=wind.base;sh.uniforms.uCar=wind.car;sh.uniforms.uCarV=wind.carV;sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nuniform float uTime,uWind,uDist,uBase,uCarV;uniform vec3 uCar;varying float vGust;')
  .replace('#include <begin_vertex>',`#include <begin_vertex>
vec2 gp=vec2(instanceMatrix[3].x,instanceMatrix[3].z);float bend=position.y*position.y;transformed.x+=sin(uTime*2.2+gp.x*.35+gp.y*.2)*bend*(.07+uWind*1.5);transformed.z+=cos(uTime*1.7+gp.x*.2+gp.y*.3)*bend*(.04+uWind);
  // gusts: broad waves that roll across the grass, bending it and showing its paler side
  vec4 wq=modelMatrix*vec4(gp.x,0.,gp.y,1.);vec2 jp=vec2(wq.x+uBase,uDist-wq.z);
  float wave=pow(sin(dot(jp,vec2(.05,.032))-uTime*1.8+sin(jp.y*.011)*2.)*.5+.5,3.)*(.5+uWind*4.);
  transformed.x+=bend*wave*.3;transformed.z+=bend*wave*.18;vGust=wave*clamp(position.y,0.,1.);
  // the car brushes the verge: blades close to it lean away, more the faster it goes
  {vec2 dc=wq.xz-uCar.xz;float dl=length(dc),push=(1.-smoothstep(1.6,3.4,dl))*step(abs(wq.y-uCar.y),3.)*(.5+uCarV);
   vec3 away=vec3(dc.x,0.,dc.y)/max(dl,.2);vec3 loc=(inverse(mat3(modelMatrix)*mat3(instanceMatrix))*away);transformed.xz+=loc.xz*bend*push*.55;transformed.y-=bend*push*.18;}`);
  sh.fragmentShader=sh.fragmentShader.replace('#include <common>','#include <common>\nvarying float vGust;').replace('#include <color_fragment>','#include <color_fragment>\ndiffuseColor.rgb*=1.+vGust*.28;');};

// Cloud shadows: soft patches of shade drift across the land with the wind, as the clouds pass over.
// Added to the ground, road, grass and scenery materials (after their own changes).
const CLOUD={uCloud:{value:0},uCloudT:{value:0}};
function cloudShadows(mat){const prev=mat.onBeforeCompile;mat.onBeforeCompile=(sh,r)=>{if(prev)prev(sh,r);
  sh.uniforms.uCloud=CLOUD.uCloud;sh.uniforms.uCloudT=CLOUD.uCloudT;sh.uniforms.uCBase=wind.base;sh.uniforms.uCDist=wind.dist;
  sh.vertexShader=sh.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 vCloudP;').replace('#include <project_vertex>',`#include <project_vertex>
    {vec4 cw=vec4(transformed,1.);
    #ifdef USE_INSTANCING
      cw=instanceMatrix*cw;
    #endif
    cw=modelMatrix*cw;vCloudP=cw.xz;}`);
  sh.fragmentShader=sh.fragmentShader.replace('#include <common>',`#include <common>
    varying vec2 vCloudP;uniform float uCloud,uCloudT,uCBase,uCDist;
    float cn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);float a=fract(sin(dot(i,vec2(127.1,311.7)))*43758.5),b=fract(sin(dot(i+vec2(1,0),vec2(127.1,311.7)))*43758.5),c=fract(sin(dot(i+vec2(0,1),vec2(127.1,311.7)))*43758.5),d=fract(sin(dot(i+vec2(1,1),vec2(127.1,311.7)))*43758.5);return mix(mix(a,b,f.x),mix(c,d,f.x),f.y);}`)
  .replace('#include <aomap_fragment>',`#include <aomap_fragment>
    if(uCloud>0.){vec2 cp=(vCloudP+vec2(uCBase,-uCDist))*.0045+vec2(uCloudT*.018,uCloudT*.006);
      float n=cn(cp)*.55+cn(cp*2.13+3.7)*.3+cn(cp*4.7+9.1)*.15;float sh=1.-uCloud*smoothstep(.48,.66,n);
      reflectedLight.directDiffuse*=sh;reflectedLight.directSpecular*=sh;}`);};}
for(const m of [MAT.terrain,MAT.solid,MAT.foliage,MAT.grass,MAT.road])cloudShadows(m);
export {CLOUD,cloudShadows,wind,MAT,tnoise,tfbm,makeLayer,avgColor,LAYERS,bladeGeo};
