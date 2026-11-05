import * as T from '../three.module.js';
import {loadAssets} from '../assets.js';
import {$,params} from './core.js';
import {G} from './state.js';
/* --------------------------------------------------------------- renderer */

const canvas=$('#world');

const renderer=new T.WebGLRenderer({canvas,antialias:false,powerPreference:'high-performance',stencil:false});

renderer.outputColorSpace=T.SRGBColorSpace;

renderer.shadowMap.enabled=true;

renderer.shadowMap.type=T.PCFShadowMap;

const maxAniso=Math.min(8,renderer.capabilities.getMaxAnisotropy());

const QUALITY={
  high:{label:'HIGH',ratio:1.5,post:true,bloom:true,shadow:4096,samples:4,ao:1,hi:340,grass:240},
  balanced:{label:'BALANCED',ratio:1.15,post:true,bloom:true,shadow:2048,samples:2,ao:.85,hi:200,grass:150},
  low:{label:'PERFORMANCE',ratio:1,post:false,bloom:false,shadow:1024,samples:0,ao:0,hi:0,grass:0}};

G.qualitySetting=params.get('quality')||'auto';G.quality=QUALITY[G.qualitySetting==='auto'?'high':G.qualitySetting]||QUALITY.high;
// Optional photo-real scenery from GET_ASSETS.bat (dist/assets). Without it, everything is generated.

const introNote=document.querySelector('#intro>small'),introText=introNote?.textContent;

if(introNote)introNote.textContent='Loading scenery…';

const ASSETS=params.get('assets')==='off'?null:await loadAssets(renderer).catch(e=>{console.warn('Everway: assets unavailable',e);return null;});

if(introNote)introNote.textContent=introText;

const REAL=!!(ASSETS&&(Object.keys(ASSETS.textures).length||Object.keys(ASSETS.models).length));

const scene=new T.Scene();

scene.fog=new T.FogExp2('#cfe0e3',.0014);

const camera=new T.PerspectiveCamera(53,innerWidth/innerHeight,.25,3200);

export {canvas,renderer,maxAniso,QUALITY,introNote,introText,ASSETS,REAL,scene,camera};
