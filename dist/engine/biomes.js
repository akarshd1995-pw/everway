import {C,fbm,lerp,smooth} from './core.js';
import {state} from './state.js';
import {seasonGround,seasonal} from './season.js';
/* ------------------------------------------------------------------ biomes */

const BIOMES={
  fields:{name:'THE GREEN VALLEY',ground:'#76a05a',ground2:'#94ba6e',verge:'#b8c08c',rock:'#8f8b78',tree:'#4f7f4c',flat:58,amp:24,ridge:.55,terrace:0,crops:1,snowline:999,mLow:'#5f8070',mHigh:'#8fa2a0',mSnow:.35},
  desert:{name:'THE LONG WAY · ROUTE 66',ground:'#c89a66',ground2:'#dcb684',verge:'#dcbf93',rock:'#b16f4c',tree:'#7d8a50',flat:24,amp:34,ridge:.95,terrace:1,crops:0,sand:1,snowline:999,mLow:'#a06a52',mHigh:'#c99470',mSnow:0},
  mountain:{name:'THE ALPINE ESCAPE',ground:'#5e8455',ground2:'#80995f',verge:'#8f977b',rock:'#7d807a',tree:'#2e5a45',flat:13,amp:72,ridge:1.4,terrace:0,crops:0,snowline:46,mLow:'#566f74',mHigh:'#8a9a9e',mSnow:1},
  town:{name:'A TOWN CALLED SOMEWHERE',ground:'#80a064',ground2:'#9db474',verge:'#c4bea0',rock:'#8f8d80',tree:'#557f5f',flat:44,amp:16,ridge:.4,terrace:0,crops:.45,snowline:999,mLow:'#6a8a7e',mHigh:'#97a9a4',mSnow:.3},
  coast:{name:'THE WILD COAST',ground:'#7d9b58',ground2:'#9db16c',verge:'#c9c08e',rock:'#8c877b',tree:'#4c7350',flat:46,amp:18,ridge:.45,terrace:0,crops:0,snowline:999,coast:1,mLow:'#6b8a86',mHigh:'#9aaead',mSnow:.2},
  planet:{name:'ANOTHER WORLD',ground:'#a2563a',ground2:'#c27a4c',verge:'#b46d4a',rock:'#76402e',tree:'#7a4a3a',flat:20,amp:44,ridge:1.25,terrace:.35,crops:0,sand:1,snowline:999,alien:1,mLow:'#8c4a3c',mHigh:'#c88a6a',mSnow:0},
  snow:{name:'THE QUIET NORTH',ground:'#e8eff1',ground2:'#d3e0e5',verge:'#d9e2e4',rock:'#7d898c',tree:'#47705f',flat:16,amp:52,ridge:1.1,terrace:0,crops:0,snowline:-200,mLow:'#8b9ea7',mHigh:'#b4c3c9',mSnow:1.4},
};

for(const b of Object.values(BIOMES))for(const k of ['ground','ground2','verge','rock','tree','mLow','mHigh'])b[k+'C']=C(b[k]);

const SNOW=C('#eef4f6'),CROPS=['#c9b46a','#a8b85c','#6e9a49','#8c7b57','#b9a350','#93ad57'].map(C);

const route=['fields','fields','town','fields','coast','coast','desert','desert','mountain','mountain','snow'],LEG=1900,CH=120;

// The journey starts at a random point of the route (state.routeOffset legs in). At a fork the
// driver can choose another place: the route then carries on from that place (state.legPick holds
// the choices, leg number -> place).
let offCache = {key: '', offs: []};
function legOffset(L) {
  const picks = state.legPick || {}, key = (state.routeOffset || 0) + JSON.stringify(picks);
  if (offCache.key !== key) {
    offCache = {key, offs: []}; let off = state.routeOffset || 0;
    for (const Lp of Object.keys(picks).map(Number).sort((a, b) => a - b)) {
      let k = 0; while (k < route.length && route[(Lp + off + k) % route.length] !== picks[Lp]) k++;
      if (k < route.length) off += k; offCache.offs.push([Lp, off]);
    }
    offCache.base = state.routeOffset || 0;
  }
  let off = offCache.base; for (const [Lp, o] of offCache.offs) { if (Lp <= L) off = o; else break; }
  return off;
}
/** The place of leg L (legs are LEG metres long, counted from the start of the journey). */
function legBiome(L) { return route[((L + legOffset(L)) % route.length + route.length) % route.length]; }
/** The place the route would reach at leg L if nobody chose otherwise there. */
function legDefault(L) { const off = legOffset(L - 1); return route[(L + off) % route.length]; }
function biomeAt(s){return state.biome==='auto'?legBiome(Math.floor(Math.max(s,0)/LEG)):state.biome;}

function biomeMix(s){if(state.biome!=='auto')return {a:state.biome,b:state.biome,t:0};const f=Math.max(s,0)/LEG,i=Math.floor(f),fr=f-i,w=.035,a=legBiome(i);
  if(fr>1-w)return {a,b:legBiome(i+1),t:.5*smooth(fr,1-w,1)};if(fr<w&&i>0)return {a,b:legBiome(i-1),t:.5*(1-smooth(fr,0,w))};return {a,b:a,t:0};}

function terrainParams(s){const m=biomeMix(s),A=BIOMES[m.a],B=BIOMES[m.b],t=m.t,o={};
  for(const k of ['flat','amp','ridge','terrace','crops','snowline','sand','coast','alien'])o[k]=lerp(A[k]||0,B[k]||0,t);
  for(const k of ['ground','ground2','verge','rock'])o[k]=A[k+'C'].clone().lerp(B[k+'C'],t);
  seasonGround(o,lerp(seasonal(m.a),seasonal(m.b),t));return o;}

function heightAt(s,lx,P){const ax=Math.abs(lx);if(ax<8)return -.06;
  let h=(fbm(s*.03,lx*.03,2)-.5)*.9*smooth(ax,8.5,16);
  const rise=smooth(ax,P.flat,P.flat+70);
  if(rise>0){const n=fbm(s*.004+(lx<0?71.3:0),ax*.004,4),rg=1-Math.abs(fbm(s*.0021+13,ax*.0021+(lx<0?5:0),3)*2-1);
    let m=P.amp*(.45*n+P.ridge*rg*rg*rg*(.5+ax/350));
    if(P.terrace>0){const q=m/11,fl=Math.floor(q),fr=q-fl;m=lerp(m,(fl+Math.pow(fr,5))*11,P.terrace);}
    h+=rise*m;}
  return h;}

const LXS=(()=>{const a=[0,3,6,7.9,9,10.5,12.5,15,18,22,26,31,37,44,52,61,71,82,89,96,103,110,117,124,131,139,147,170,197,228,262,300,345,400];return a.slice(1).reverse().map(v=>-v).concat(a);})();

export {BIOMES,SNOW,CROPS,route,LEG,CH,legBiome,legDefault,biomeAt,biomeMix,terrainParams,heightAt,LXS};
