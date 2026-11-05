import * as T from '../three.module.js';
import {rand} from './core.js';
import {ASSETS,maxAniso} from './render.js';
/* ---------------------------------------------------------------- textures */

function canvasTexture(w,h,draw,srgb=true){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new T.CanvasTexture(c);if(srgb)t.colorSpace=T.SRGBColorSpace;t.anisotropy=maxAniso;return t;}
// Road: 15.4 m across (gravel shoulder, asphalt, painted lines), 12 m along — one dash per tile.

const RW=7.7, ROAD_TILE=24, lxToU=(lx,w)=>(lx+RW)/(RW*2)*w;

function paintRoad(c,w,h,mode){ // mode: albedo | rough | normal
  const r=rand(77),rough=mode==='rough',img=c.createImageData(w,h),d=img.data;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){const i=(y*w+x)*4,shoulder=Math.abs(x/w*RW*2-RW)>6.2;let v;
    if(mode==='normal'){d[i]=128;d[i+1]=128;d[i+2]=255;}
    else if(rough){v=shoulder?250:205+r()*30;d[i]=d[i+1]=d[i+2]=v;}
    else{v=shoulder?182+r()*48:70+r()*30;if(!shoulder&&r()<.04)v+=35;if(shoulder&&r()<.08)v-=60;d[i]=v;d[i+1]=v+3;d[i+2]=v+1;}d[i+3]=255;}
  c.putImageData(img,0,0);
  const A=ASSETS?.textures.asphalt,src=A&&(mode==='albedo'?A.diff:rough?A.rough:A.nor);
  if(src?.image){const x0=lxToU(-6.2,w),x1=lxToU(6.2,w),tw=2.4*w/(RW*2),th=h/(ROAD_TILE/2.4);c.save();c.beginPath();c.rect(x0,0,x1-x0,h);c.clip();
    for(let y=0;y<h-1;y+=th)for(let x=x0-tw*.37;x<x1;x+=tw)c.drawImage(src.image,x,y,tw,th);c.restore();if(mode==='albedo'){c.fillStyle='rgba(70,74,72,.18)';c.fillRect(x0,0,x1-x0,h);}}
  if(mode==='normal')return;
  // tyre-polished tracks in each lane
  for(const t of [-3.7,-2.1,2.1,3.7]){const x=lxToU(t,w);const g=c.createLinearGradient(x-14,0,x+14,0);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(.5,rough?'rgba(120,120,120,.55)':'rgba(30,34,32,.32)');g.addColorStop(1,'rgba(0,0,0,0)');c.fillStyle=g;c.fillRect(x-14,0,28,h);}
  // asphalt-to-gravel ragged edge
  for(const side of [-1,1])for(let y=0;y<h;y+=2){const x=lxToU(side*6.2,w)+(r()-.5)*5;c.fillStyle=rough?'#ddd':'rgba(95,98,92,.9)';c.fillRect(x-1,y,3,2);}
  if(!rough){ // patches and cracks
    for(let i=0;i<3;i++){const x=lxToU(-5.5+r()*9,w),y=r()*h*.8,v=48+r()*22;c.fillStyle=`rgba(${v},${v+3},${v+1},.12)`;c.fillRect(x,y,40+r()*60,40+r()*120);}
    c.strokeStyle='rgba(28,30,29,.55)';c.lineWidth=1.2;for(let i=0;i<14;i++){let x=lxToU(-6+r()*12,w),y=r()*h;c.beginPath();c.moveTo(x,y);for(let k=0;k<7;k++){x+=(r()-.5)*22;y+=r()*18;c.lineTo(x,y);}c.stroke();}}
  const paint=rough?'#7a7a7a':'#ece6d2',worn=rough?'#999':'rgba(236,230,210,.55)';
  for(const side of [-1,1]){const x=lxToU(side*5.72,w);c.fillStyle=paint;c.fillRect(x-2.5,0,5,h);c.fillStyle=worn;for(let y=0;y<h;y+=3)if(r()<.25)c.fillRect(x-2.5+r()*4,y,1.5,2);}
  const cx=lxToU(0,w);c.fillStyle=rough?'#7a7a7a':'#eadfb4';for(const o of [0,.5])c.fillRect(cx-2.5,h*o,5,h*5.2/ROAD_TILE);
}

const REAL_ROAD=!!ASSETS?.textures.asphalt,RTW=REAL_ROAD?1024:512;

const roadTex=canvasTexture(RTW,RTW*2,(c,w,h)=>paintRoad(c,w,h,'albedo'));

roadTex.wrapS=roadTex.wrapT=T.RepeatWrapping;

const roadRough=canvasTexture(RTW,RTW*2,(c,w,h)=>paintRoad(c,w,h,'rough'),false);

roadRough.wrapS=roadRough.wrapT=T.RepeatWrapping;

const roadNormal=REAL_ROAD&&ASSETS.textures.asphalt.nor?canvasTexture(RTW,RTW*2,(c,w,h)=>paintRoad(c,w,h,'normal'),false):null;

if(roadNormal)roadNormal.wrapS=roadNormal.wrapT=T.RepeatWrapping;

const glowTex=canvasTexture(64,64,(c,w,h)=>{const g=c.createRadialGradient(32,32,0,32,32,32);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.25,'rgba(255,255,255,.45)');g.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=g;c.fillRect(0,0,w,h);});

const puffTex=canvasTexture(256,128,(c,w,h)=>{const r=rand(31);for(let i=0;i<26;i++){const x=40+r()*176,y=60+r()*34-Math.abs(x-128)*.12,rad=18+r()*34*(1-Math.abs(x-128)/150);const g=c.createRadialGradient(x,y,0,x,y,rad);g.addColorStop(0,'rgba(255,255,255,.55)');g.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=g;c.beginPath();c.arc(x,y,rad,0,Math.PI*2);c.fill();}c.globalCompositeOperation='destination-out';const g=c.createLinearGradient(0,92,0,128);g.addColorStop(0,'rgba(0,0,0,0)');g.addColorStop(1,'rgba(0,0,0,1)');c.fillStyle=g;c.fillRect(0,92,w,36);});

const flakeTex=canvasTexture(32,32,(c)=>{const g=c.createRadialGradient(16,16,0,16,16,16);g.addColorStop(0,'rgba(255,255,255,1)');g.addColorStop(.5,'rgba(255,255,255,.5)');g.addColorStop(1,'rgba(255,255,255,0)');c.fillStyle=g;c.fillRect(0,0,32,32);});
// Roadside sign atlas (four invented signs, 512x256 each).

const SIGNS=[['EVERWAY MOTEL','VACANCY · POOL · PIE','#2f5c58','#f1dfb0','#e0704a'],['DATE SHAKES','12 MILES AHEAD →','#e9d6a8','#7a3b2a','#2f5c58'],['SLOW DOWN','THE VIEW IS THE POINT','#3b4f6b','#f4ead2','#e6b85c'],['LAST GAS','FOR 80 MILES','#b4492f','#f6ecd4','#f6ecd4']];

const signTex=canvasTexture(1024,512,(c)=>{SIGNS.forEach(([a,b,bg,fg,ac],i)=>{const x=(i%2)*512,y=Math.floor(i/2)*256;c.fillStyle=bg;c.fillRect(x,y,512,256);c.strokeStyle=ac;c.lineWidth=10;c.strokeRect(x+14,y+14,484,228);c.fillStyle=fg;c.textAlign='center';c.font='bold 74px Georgia, serif';c.fillText(a,x+256,y+125,450);c.fillStyle=ac;c.font='bold 30px system-ui, sans-serif';c.fillText(b,x+256,y+186,450);});});

const signUV=i=>[(i%2)*.5,1-(Math.floor(i/2)+1)*.5,(i%2)*.5+.5,1-Math.floor(i/2)*.5];

export {canvasTexture,RW,ROAD_TILE,lxToU,paintRoad,REAL_ROAD,RTW,roadTex,roadRough,roadNormal,glowTex,puffTex,flakeTex,SIGNS,signTex,signUV};
