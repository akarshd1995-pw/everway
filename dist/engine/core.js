import * as T from '../three.module.js';
const $=s=>document.querySelector(s);

const {clamp,lerp}=T.MathUtils, smooth=T.MathUtils.smoothstep;

const params=new URLSearchParams(location.search);
/* ------------------------------------------------------------------ noise */

function hash2(x,y){let h=Math.imul(x|0,374761393)+Math.imul(y|0,668265263);h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967296;}

function vnoise(x,y){const xi=Math.floor(x),yi=Math.floor(y),xf=x-xi,yf=y-yi,u=xf*xf*(3-2*xf),v=yf*yf*(3-2*yf);const a=hash2(xi,yi),b=hash2(xi+1,yi),c=hash2(xi,yi+1),d=hash2(xi+1,yi+1);return a+(b-a)*u+(c-a)*v+(a-b-c+d)*u*v;}

function fbm(x,y,o=4){let s=0,a=.5,f=1,n=0;for(let i=0;i<o;i++){s+=a*vnoise(x*f,y*f);n+=a;f*=2.03;a*=.5;}return s/n;}

function rand(seed){let t=seed>>>0;return()=>{t=(1664525*t+1013904223)>>>0;return t/4294967296;};}

const C=hex=>new T.Color(hex);

const vhash=(x,y,z)=>{const s=Math.sin(x*12.9898+y*78.233+z*37.719)*43758.5453;return s-Math.floor(s);};

export {$,clamp,lerp,smooth,params,hash2,vnoise,fbm,rand,C,vhash};
