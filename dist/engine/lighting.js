import * as T from '../three.module.js';
import {lampMaterials} from '../vehicles.js';
import {C,clamp,lerp,smooth} from './core.js';
import {renderer,scene} from './render.js';
import {post} from './post.js';
import {MAT, CLOUD} from './materials.js';
import {BIOMES,biomeAt,biomeMix} from './biomes.js';
import {G,state} from './state.js';
import {cloudU,mountainU,mountains,skyU} from './sky.js';
import {headGlow,headlights,hemi,sun,tailGlow} from './actors.js';
/* ------------------------------------------------------------- lighting */

const PAL={dayZ:C('#4c8bcc'),dayH:C('#cfe2e8'),setZ:C('#3c5a93'),setH:C('#f6a468'),nightZ:C('#03081a'),nightH:C('#142440'),ovZ:C('#7d8b97'),ovH:C('#b7c1c6'),rainZ:C('#5a6772'),rainH:C('#8e9aa1'),sunDay:C('#fff3dc'),sunSet:C('#ff9447'),moon:C('#a9bde3'),cloudNight:C('#2a3349')};

const sunDir=skyU.uSunDir.value,moonDir=skyU.uMoonDir.value,tmpA=new T.Color(),tmpB=new T.Color(),biomeLow=mountainU.uLow.value,biomeHigh=mountainU.uHigh.value,groundTint=new T.Color('#5d6a3e');
// Scratch values reused every frame (no allocation in the loop).
const _alienZ=new T.Color('#b9876c'),_alienH=new T.Color('#e8b48e'),_ovZ=new T.Color(),_ovH=new T.Color(),_sunC=new T.Color(),_lit=new T.Color(),_warm=new T.Color('#ffd1a6'),_nightGain=new T.Vector3(.9,.97,1.12),_mistC=new T.Color();

G.weatherNow=state.weather==='auto'?['sunny','cloudy','windy','rainy','sunny'][(state.weatherOffset||0)%5]:state.weather;let wet=0,mist=0,overcast=0,dayAmt=1,nightAmt=0,sunsetAmt=0,precipAmt=0;

function updateLighting(dt){
  const a=(state.time-6)/24*Math.PI*2,elev=Math.sin(a);
  sunDir.set(Math.cos(a)*.8,elev,-.6).normalize();moonDir.set(-Math.cos(a)*.6,Math.max(-elev,.08)*.8+.12,-.75).normalize();
  const w=G.weatherNow,ovTarget=w==='rainy'?.9:w==='snowy'?.75:w==='cloudy'?.6:w==='windy'?.2:0;const wr=G.snapWeather>0?20:1;G.snapWeather=Math.max(0,(G.snapWeather||0)-dt);overcast=lerp(overcast,ovTarget,Math.min(dt*.13*wr,1));   // the sky darkens slowly as clouds gather
  dayAmt=smooth(elev,-.14,.2);nightAmt=1-dayAmt;sunsetAmt=(1-smooth(Math.abs(elev),0,.32))*smooth(elev,-.22,.02);
  const zen=tmpA.copy(PAL.dayZ).lerp(PAL.setZ,sunsetAmt*.75),hor=tmpB.copy(PAL.dayH).lerp(PAL.setH,sunsetAmt);
  const ovZ=_ovZ.copy(PAL.ovZ).lerp(PAL.rainZ,smooth(overcast,.6,.9)),ovH=_ovH.copy(PAL.ovH).lerp(PAL.rainH,smooth(overcast,.6,.9));zen.lerp(ovZ,overcast*.85);hor.lerp(ovH,overcast*.8);
  // another world: a dusty peach sky
  const bm=biomeMix(state.distance),alien=lerp(BIOMES[bm.a].alien||0,BIOMES[bm.b].alien||0,bm.t);if(alien>0){zen.lerp(_alienZ,alien*.7);hor.lerp(_alienH,alien*.75);}skyU.uAlien.value=alien;
  skyU.uZenith.value.copy(PAL.nightZ).lerp(zen,dayAmt);skyU.uHorizon.value.copy(PAL.nightH).lerp(hor,dayAmt);
  skyU.uGround.value.copy(skyU.uHorizon.value).multiplyScalar(.92);
  skyU.uSunCol.value.copy(PAL.sunDay).lerp(PAL.sunSet,sunsetAmt).multiplyScalar(dayAmt);skyU.uNight.value=nightAmt;skyU.uOvercast.value=overcast;skyU.uGlow.value=.6+sunsetAmt*.9;skyU.uTime.value=G.elapsed;
  scene.fog.color.copy(skyU.uHorizon.value);const fogT=(w==='rainy'?.0031:w==='snowy'?.0037:w==='cloudy'?.0018:.00135)*(1+nightAmt*.15)*(G.fogScale||1);G.fogBase=lerp(G.fogBase??fogT,fogT,Math.min(dt*.6,1));
  // early morning: mist lies in the valleys until the sun has burnt it off (not in the desert or on another world, less in wind)
  const mb=biomeAt(state.distance),mistT=smooth(state.time,4.8,6.3)*(1-smooth(state.time,8.2,10))*(mb==='desert'||mb==='planet'?0:mb==='coast'?.7:1)*(w==='windy'?.35:w==='rainy'?.5:1)*(G.mistScale??1);
  mist=lerp(mist,mistT,Math.min(dt*.5,1));scene.fog.density=G.fogBase*(1+mist*.35)+Math.round(mist*40);scene.fog.color.lerp(_mistC.set(1,1,1).multiplyScalar(.82+.15*dayAmt),mist*.25);
  // a low sun casts long, soft shadows; a high one short, crisp ones
  sun.shadow.radius=lerp(2.5,7,1-smooth(elev,.06,.5));
  // sun by day, moon by night
  const lightDir=elev>-.04?sunDir:moonDir;
  // shadows reach further on better graphics, and the shadow area sits ahead of the car where you look
  const ext=G.quality.shadow>=4096?100:G.quality.shadow>=2048?74:55,sc=sun.shadow.camera;
  if(sc.right!==ext){sc.left=-ext;sc.right=ext;sc.top=ext;sc.bottom=-ext;sc.far=650;sc.updateProjectionMatrix();}
  const ahead=-ext*.45;sun.position.set(G.player.position.x,0,ahead).addScaledVector(lightDir,260);sun.target.position.set(G.player.position.x,0,ahead);
  sun.color.copy(elev>-.04?_sunC.copy(skyU.uSunCol.value).multiplyScalar(1/Math.max(dayAmt,.001)):PAL.moon);
  sun.intensity=elev>-.04?(.12+3.1*dayAmt)*(1-overcast*.82)*smooth(elev,-.04,.06):.38*(1-overcast*.7);
  hemi.color.copy(skyU.uZenith.value).lerp(skyU.uHorizon.value,.45);hemi.groundColor.copy(groundTint).multiplyScalar(.55+.45*dayAmt);hemi.intensity=.55+1.25*dayAmt+overcast*.35*dayAmt+sunsetAmt*.25;
  scene.environmentIntensity=.2+.75*dayAmt;
  // mountains follow the biome and the air
  const bio=BIOMES[biomeAt(state.distance)],k=Math.min(dt*.5,1);biomeLow.lerp(bio.mLowC,k);biomeHigh.lerp(bio.mHighC,k);mountainU.uSnow.value=lerp(mountainU.uSnow.value,bio.mSnow,k);groundTint.lerp(bio.groundC,k);
  mountainU.uSunDir.value.copy(lightDir);mountainU.uSunCol.value.copy(sun.color).multiplyScalar(sun.intensity*.32);mountainU.uAmb.value.copy(hemi.color).multiplyScalar(hemi.intensity*.42);
  for(const m of mountains.children){m.material.uniforms.uHaze.value.copy(skyU.uHorizon.value);m.material.uniforms.uHazeAmt.value=clamp(m.userData.haze+overcast*.3+nightAmt*.1,0,.95);}
  // clouds
  const lit=_lit.set(1,1,1).lerp(_warm,sunsetAmt*.8).multiplyScalar(1-overcast*.38);cloudU.uLit.value.copy(PAL.cloudNight).lerp(lit,dayAmt);
  cloudU.uShade.value.copy(cloudU.uLit.value).multiplyScalar(.62).lerp(skyU.uZenith.value,.25);cloudU.uSunCol.value.copy(skyU.uSunCol.value).multiplyScalar(1-overcast);
  cloudU.uCover.value=lerp(cloudU.uCover.value,{sunny:.32,windy:.5,cloudy:.88,rainy:1,snowy:1}[w],Math.min(dt*.1*wr,1));
  // cloud shadows on the land: strongest with broken cloud in sunshine, gone under a grey sky or at night
  { const c = cloudU.uCover.value; CLOUD.uCloud.value = .55 * smooth(c, .3, .6) * (1 - smooth(c, .9, 1)) * smooth(elev, .02, .15) * (1 - overcast * .6); CLOUD.uCloudT.value = G.elapsed * (w === 'windy' ? 3 : 1); }
  // lamps, windows, headlights
  const n=smooth(nightAmt,.25,.9);
  MAT.windows.color.setRGB(.11,.13,.14).lerp(tmpA.setRGB(3.2,2.1,.95),n);MAT.lamps.color.setRGB(.9,.88,.8).lerp(tmpA.setRGB(7,5.2,3),n);MAT.pool.opacity=n*.35;
  G.nightAmt=n;for(const l of headlights){const k=G.beamK||1;l.intensity=n*80*(.8+.2*k*k)+(G.flash||0)*140;l.distance=110+(k-1)*170;l.angle=.42+(k-1)*.1;l.target.position.y=.1+(k-1)*.9;}headGlow.opacity=Math.max(n*.7,(G.flash||0)*.95);tailGlow.opacity=n*.7;
  for(const [c,m] of Object.entries(lampMaterials))m.emissiveIntensity=c==='#f05b3e'||c==='#ed6042'?1.4+n*4:1.6+n*9;
  wet=lerp(wet,(G.rainAmt||0)>.3?1:0,Math.min(1,dt*((G.rainAmt||0)>.3?.3:.04)*wr));MAT.road.roughness=1-wet*.62;MAT.road.color.setScalar(1-wet*.3);MAT.road.userData.wet.value=wet;MAT.road.userData.rain.value=G.rainAmt||0;MAT.road.userData.lampK.value=wet*n*1.6;MAT.road.envMapIntensity=1+wet*.8;   // the road stays wet for a while after the rain stops
  // grading
  const cu=post.comp.uniforms;cu.exposure.value=1+nightAmt*.45;cu.gain.value.set(1+sunsetAmt*.06,1,1-sunsetAmt*.07).lerp(_nightGain,nightAmt*.8);cu.saturation.value=.9-overcast*.08;
  // a soft, airy look: shadows lifted towards a pale sky blue, a touch brighter by day
  cu.lift.value.set(.034,.04,.05).multiplyScalar(.25+.75*dayAmt);cu.exposure.value+=dayAmt*.06;
  renderer.toneMappingExposure=cu.exposure.value;
}

export {mist,PAL,sunDir,moonDir,tmpA,tmpB,biomeLow,biomeHigh,groundTint,wet,overcast,dayAmt,nightAmt,sunsetAmt,precipAmt,updateLighting};
