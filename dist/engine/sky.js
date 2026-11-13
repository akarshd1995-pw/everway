import * as T from '../three.module.js';
import {rand,vnoise} from './core.js';
import {renderer,scene} from './render.js';
import {puffTex} from './textures.js';
import {SNOW} from './biomes.js';
import {G} from './state.js';
/* --------------------------------------------------------------------- sky */

const SKY_FS=`uniform vec3 uZenith,uHorizon,uGround,uSunDir,uSunCol,uMoonDir;uniform float uNight,uTime,uDisk,uOvercast,uGlow,uAlien,uFlash;uniform vec4 uTownGlow;varying vec3 vDir;
float hash(vec3 p){p=fract(p*.3183099+.1);p*=17.;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}
float h2(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float vn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h2(i),h2(i+vec2(1,0)),f.x),mix(h2(i+vec2(0,1)),h2(i+vec2(1,1)),f.x),f.y);}
float fbm(vec2 p){float s=0.,a=.5;for(int i=0;i<5;i++){s+=a*vn(p);p=p*2.03+vec2(1.7,9.2);a*=.5;}return s;}
void main(){vec3 d=normalize(vDir);float h=d.y;
  vec3 col=mix(uHorizon,uZenith,pow(clamp(h,0.,1.),.5));col=mix(col,uGround,smoothstep(0.,-.2,h));
  float sd=dot(d,uSunDir),sp=max(sd,0.),above=smoothstep(-.06,.02,h),clear=1.-uOvercast*.8,stars=1.-smoothstep(.25,.7,uOvercast),band=1.-smoothstep(0.,.5,abs(h));
  col+=uSunCol*(pow(sp,7.)*.3+pow(sp,48.)*.55+pow(sp,3.)*band*.22)*uGlow*clear*above;
  col+=uSunCol*smoothstep(.99935,.99962,sd)*uDisk*clear*above;
  // light scattered through a long path of air: near sunrise and sunset the horizon on the sun's side
  // glows warm, the far side shows a pink band over the blue shadow of the earth, and the zenith deepens
  float low=smoothstep(.45,.0,uSunDir.y)*smoothstep(-.2,-.02,uSunDir.y),az=dot(normalize(d.xz+1e-4),normalize(uSunDir.xz+1e-4))*.5+.5;
  col+=vec3(1.,.55,.28)*low*pow(az,3.)*band*(1.-uOvercast)*.55*smoothstep(-.05,.05,h);
  float anti=pow(1.-az,2.),dusk=smoothstep(.12,-.02,uSunDir.y)*smoothstep(-.22,-.06,uSunDir.y);
  col=mix(col,vec3(.86,.6,.66),dusk*anti*smoothstep(.02,.07,h)*smoothstep(.22,.1,h)*.55*(1.-uOvercast));
  col=mix(col,vec3(.16,.22,.38),dusk*anti*smoothstep(.04,0.,h)*smoothstep(-.02,0.,h)*.5*(1.-uOvercast));
  col*=1.-low*.18*smoothstep(.3,1.,h);
  // at night a town or village beyond the hills lights the low sky over it, warm orange
  {vec2 tg=uTownGlow.xz;float tw=uTownGlow.w*pow(max(dot(normalize(d.xz+1e-4),normalize(tg+1e-4)),0.),5.)*smoothstep(.22,0.,h)*smoothstep(-.03,.01,h);
   col+=vec3(1.,.62,.34)*tw*uNight*.3;}
  // lightning lights up the whole sky for an instant
  col+=vec3(.72,.78,1.)*uFlash*(.35+.65*clamp(h*2.+.3,0.,1.));
  // a high, thin layer of cloud (cirrus and mackerel sky) drifting with the wind, lit by the sun and
  // set on fire at sunset; thicker as the weather turns
  if(h>.015){vec2 q=d.xz/(h+.08)*1.6+vec2(uTime*.004,uTime*.0015);
    float n=fbm(q*1.3+vec2(fbm(q*.35)*1.8,0.)),streak=fbm(vec2(q.x*2.6,q.y*.55)+3.1);
    float cov=mix(.62,.38,uOvercast),c=smoothstep(cov,cov+.3,n*.65+streak*.45)*smoothstep(.015,.15,h)*(1.-smoothstep(.6,.95,uOvercast));
    vec3 lit=mix(vec3(1.),vec3(1.,.62,.42),low)*(.35+.65*max(uSunCol.r,.0)+.02)+pow(sp,6.)*uSunCol*.8;
    vec3 cc=mix(col*1.05+.06,lit,.55)*(1.-uNight*.85)+vec3(.05,.06,.09)*uNight;
    col=mix(col,cc,c*.55);}
  // another world: two big moons hang in the sky by day and night
  if(uAlien>.01){vec3 m1=normalize(vec3(-.55,.32,-.77)),m2=normalize(vec3(.42,.2,-.88));
    float a1=dot(d,m1),a2=dot(d,m2),lit=.55+.45*uNight;
    col=mix(col,vec3(.93,.78,.68)*lit*1.4,smoothstep(.9965,.9972,a1)*uAlien*clear);
    col=mix(col,vec3(.72,.82,.9)*lit*1.25,smoothstep(.99895,.9991,a2)*uAlien*clear);
    col+=vec3(.9,.6,.5)*pow(max(a1,0.),60.)*.18*uAlien;}
  float md=dot(d,uMoonDir);col+=vec3(.86,.9,1.)*smoothstep(.99955,.99972,md)*uNight*3.5*stars;col+=vec3(.25,.33,.5)*pow(max(md,0.),40.)*uNight*.35*clear;
  if(uNight>.01&&h>0.){vec3 p=d*260.,cell=floor(p);float r=hash(cell);if(r>.9965){vec3 f=fract(p)-.5;float tw=.55+.45*sin(uTime*2.3+r*500.);col+=vec3(1.,.95,.86)*smoothstep(.24,0.,length(f))*uNight*tw*2.2*smoothstep(0.,.18,h)*stars;}}
  gl_FragColor=vec4(col,1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const skyU={uZenith:{value:new T.Color()},uHorizon:{value:new T.Color()},uGround:{value:new T.Color()},uSunDir:{value:new T.Vector3()},uSunCol:{value:new T.Color()},uMoonDir:{value:new T.Vector3()},uNight:{value:0},uTime:{value:0},uDisk:{value:12},uOvercast:{value:0},uGlow:{value:1},uAlien:{value:0},uTownGlow:{value:new T.Vector4()},uFlash:{value:0}};

const skyMat=new T.ShaderMaterial({uniforms:skyU,side:T.BackSide,depthWrite:false,fog:false,vertexShader:'varying vec3 vDir;void main(){vDir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',fragmentShader:SKY_FS});

const skyDome=new T.Mesh(new T.SphereGeometry(2600,48,24),skyMat);

skyDome.frustumCulled=false;

skyDome.renderOrder=-10;

scene.add(skyDome);
// Image-based lighting: the sky is re-baked into a reflection map so paint, chrome and wet roads mirror it.

const pmrem=new T.PMREMGenerator(renderer),envScene=new T.Scene();

envScene.add(new T.Mesh(new T.SphereGeometry(50,32,16),skyMat));

let envRT=null;G.envTimer=99;G.lastEnvKey=-999;

function bakeEnvironment(){const disk=skyU.uDisk.value;skyU.uDisk.value=Math.min(disk,3);const rt=pmrem.fromScene(envScene,0,.1,100);skyU.uDisk.value=disk;scene.environment=rt.texture;envRT?.dispose();envRT=rt;}
/* --------------------------------------------------------------- mountains */

const MOUNT_VS='attribute float aH;varying float vH;varying vec3 vN;void main(){vH=aH;vN=normalize(mat3(modelMatrix)*normal);gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}';

const MOUNT_FS=`uniform vec3 uLow,uHigh,uSnowCol,uHaze,uSunDir,uSunCol,uAmb;uniform float uHazeAmt,uSnow;varying float vH;varying vec3 vN;
void main(){vec3 alb=mix(uLow,uHigh,smoothstep(.05,.75,vH));float sn=smoothstep(.62,.7,vH+(fract(sin(gl_FragCoord.x*.013+vH*91.)*43758.5)-.5)*.03)*uSnow;alb=mix(alb,uSnowCol,clamp(sn,0.,1.));
  vec3 lit=alb*(uAmb+uSunCol*max(dot(normalize(vN),uSunDir),0.));gl_FragColor=vec4(mix(lit,uHaze,uHazeAmt*(1.-vH*.25)),1.);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const mountainU={uLow:{value:new T.Color('#5f8070')},uHigh:{value:new T.Color('#8fa2a0')},uSnowCol:{value:SNOW.clone()},uSunDir:{value:new T.Vector3()},uSunCol:{value:new T.Color()},uAmb:{value:new T.Color()},uSnow:{value:.35}};

const mountains=new T.Group();

scene.add(mountains);

[[1500,230,1.0,.32],[1900,330,4.7,.5],[2300,430,9.3,.66]].forEach(([dist,peak,seed,haze],layer)=>{
  const seg=240,X=3400,depth=[[0,-.25],[-.05,.5],[-.09,1],[-.15,.45]],pos=[],aH=[],idx=[];
  for(let i=0;i<=seg;i++){const x=-X+i*2*X/seg;let rf=0,amp=1,f=1;for(let o=0;o<5;o++){rf+=amp*Math.pow(1-Math.abs(vnoise(x*.0011*f+seed*10,seed+o*7)*2-1),2);amp*=.5;f*=2.1;}rf/=1.94;const crest=peak*(.25+.75*Math.pow(rf,1.6));
    for(const [dz,k] of depth){const y=k<0?-60:crest*k+(k>0&&k<1?(vnoise(x*.01,dz*99+seed)-.5)*peak*.08:0);pos.push(x,y,-dist+dz*dist);aH.push(Math.max(0,y)/(peak*1.0));}}
  const n=depth.length;for(let i=0;i<seg;i++)for(let k=0;k<n-1;k++){const a=i*n+k,b=a+1,c=a+n,d=c+1;idx.push(a,c,b,b,c,d);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(pos,3));g.setAttribute('aH',new T.Float32BufferAttribute(aH,1));g.setIndex(idx);g.computeVertexNormals();
  const m=new T.Mesh(g,new T.ShaderMaterial({uniforms:{...mountainU,uHaze:{value:new T.Color()},uHazeAmt:{value:haze}},vertexShader:MOUNT_VS,fragmentShader:MOUNT_FS,fog:false}));m.userData.haze=haze;m.renderOrder=-5;mountains.add(m);});
/* ------------------------------------------------------------------ clouds */

const CLOUD_VS=`uniform float uOffset;varying vec2 vUv;varying float vShade,vCov,vEdge,vSeed;varying vec3 vDir;
void main(){vUv=uv;vec3 c=vec3(instanceMatrix[3]);c.z=mod(c.z+uOffset+2600.,3000.)-2600.;float sx=length(instanceMatrix[0].xyz),sy=length(instanceMatrix[1].xyz);
  vShade=instanceColor.r;vCov=instanceColor.g;vSeed=instanceColor.b;vEdge=smoothstep(-2600.,-2000.,c.z)*(1.-smoothstep(150.,400.,c.z));vDir=normalize(c-cameraPosition);
  vec4 mv=viewMatrix*vec4(c,1.);mv.xy+=position.xy*vec2(sx,sy);gl_Position=projectionMatrix*mv;}`;

const CLOUD_FS=`uniform sampler2D tPuff;uniform vec3 uLit,uShade,uSunCol,uSunDir;uniform float uCover,uOpacity;varying vec2 vUv;varying float vShade,vCov,vEdge,vSeed;varying vec3 vDir;
float ch(vec2 p){return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453);}
float cn(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(ch(i),ch(i+vec2(1.,0.)),f.x),mix(ch(i+vec2(0.,1.)),ch(i+1.),f.x),f.y);}
void main(){if(vCov>uCover)discard;vec4 t=texture2D(tPuff,vUv);
  // break the soft puff into billowy, ragged edges with a little noise
  vec2 q=vUv*3.+vSeed*17.;float n=cn(q)*.6+cn(q*2.3)*.3+cn(q*5.1)*.1;
  float dens=smoothstep(.18,.62,t.a+(n-.5)*.55*(1.-t.a*.5));
  float a=dens*uOpacity*vEdge;if(a<.004)discard;
  float low=1.-smoothstep(.05,.35,uSunDir.y);   // sun near the horizon
  vec3 shade=mix(uShade,uShade*.6+uSunCol*.35,low*.6);
  vec3 col=mix(shade,uLit,clamp(vUv.y*.95+vShade*.2+(n-.5)*.25,0.,1.));
  // silver lining: thin edges glow when the sun is behind the cloud
  col+=uSunCol*pow(max(dot(vDir,uSunDir),0.),7.)*(1.-dens)*1.8;
  gl_FragColor=vec4(col,a);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
}`;

const cloudU={tPuff:{value:puffTex},uLit:{value:new T.Color()},uShade:{value:new T.Color()},uSunCol:{value:new T.Color()},uSunDir:{value:skyU.uSunDir.value},uCover:{value:.4},uOpacity:{value:.95},uOffset:{value:0}};

const cloudCount=60,puffs=8,clouds=new T.InstancedMesh(new T.PlaneGeometry(1,1),new T.ShaderMaterial({uniforms:cloudU,vertexShader:CLOUD_VS,fragmentShader:CLOUD_FS,transparent:true,depthWrite:false,fog:false}),cloudCount*puffs);

{const r=rand(404);let i=0;for(let k=0;k<cloudCount;k++){const cx=(r()-.5)*3600,cy=170+r()*190,cz=-2600+r()*3000,size=150+r()*220,cov=r();
  for(let p=0;p<puffs;p++){const f=p/puffs,up=p<3?0:r(),w=size*(p<3?.7+r()*.4:.35+r()*.4);const m=new T.Matrix4().compose(new T.Vector3(cx+(r()-.5)*size*(p<3?.9:.6),cy+up*size*.18,cz+(r()-.5)*60+f*4),new T.Quaternion(),new T.Vector3(w,w*(p<3?.42:.75),1));clouds.setMatrixAt(i,m);clouds.setColorAt(i,new T.Color(p<3?.1+r()*.3:.5+r()*.5,cov,r()));i++;}}}

clouds.frustumCulled=false;

clouds.renderOrder=-4;

scene.add(clouds);

export {SKY_FS,skyU,skyMat,skyDome,pmrem,envScene,envRT,bakeEnvironment,MOUNT_VS,MOUNT_FS,mountainU,mountains,CLOUD_VS,CLOUD_FS,cloudU,cloudCount,puffs,clouds};
