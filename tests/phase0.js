// Phase 0 checks: deterministic screenshots per environment and time, plus generation timing while driving.
// node phase0.js <dist dir> <prefix> [scenes|drive|both] [extra query]
const {chromium}=require('playwright');const http=require('http'),fs=require('fs'),path=require('path');
const [,,dir,prefix,mode='both',extra='&assets=off']=process.argv;
const ENVS=['fields','town','desert','mountain','snow'],TIMES={noon:12,golden:18.2,night:22};
(async()=>{
 const srv=http.createServer((q,r)=>{let p=path.join(dir,decodeURIComponent(q.url.split('?')[0]));if(p.endsWith('/'))p+='index.html';fs.readFile(p,(e,d)=>{if(e){r.statusCode=404;return r.end();}const t={'.js':'text/javascript','.css':'text/css','.json':'application/json','.gltf':'application/json','.html':'text/html','.jpg':'image/jpeg','.png':'image/png'}[path.extname(p)]||'application/octet-stream';r.setHeader('Content-Type',t);r.end(d);});}).listen(0);
 const b=await chromium.launch({args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist']});
 const pg=await b.newPage({viewport:{width:800,height:450}});const errs=[];pg.on('pageerror',e=>errs.push('ERR '+e.message));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text());});
 await pg.route(/fonts\.googleapis/,r=>r.abort());
 await pg.goto(`http://localhost:${srv.address().port}/?debug${extra}`);await pg.waitForFunction(()=>window.__ev,null,{timeout:180000});
 fs.mkdirSync('shots/p0',{recursive:true});
 if(mode!=='drive'){
  await pg.evaluate(()=>{document.querySelector('#autotime').checked=false;document.querySelector('#autotime').dispatchEvent(new Event('change'));});
  for(const env of ENVS)for(const [tn,t] of Object.entries(TIMES)){
   await pg.evaluate(()=>__ev.freeze(false));
   await pg.evaluate(e=>{document.querySelector(`#biome button[data-value="${e}"]`).click();},env);
   await pg.evaluate(w=>__ev.setWeather(w),env==='snow'?'cloudy':'sunny');
   await pg.evaluate(t=>{const el=document.querySelector('#time');el.value=t;el.dispatchEvent(new Event('input'));},t);
   await pg.waitForFunction(()=>__ev.idle(),null,{timeout:120000});await pg.waitForTimeout(4000);
   await pg.evaluate(()=>__ev.freeze(true));await pg.waitForTimeout(1500);
   const du=await pg.evaluate(()=>__ev.snap());fs.writeFileSync(`shots/p0/${prefix}_${env}_${tn}.jpg`,Buffer.from(du.split(',')[1],'base64'));
  }
  await pg.evaluate(()=>__ev.freeze(false));
  console.log('scenes done');
 }
 if(mode!=='scenes'){
  // drive fast through several sections and record how long generation takes in each frame
  await pg.evaluate(()=>{document.querySelector('#biome button[data-value="auto"]').click();document.querySelector('#start').click();const sp=document.querySelector('#speed');sp.value=110;sp.dispatchEvent(new Event('input'));});
  const r=await pg.evaluate(()=>new Promise(res=>{const gen=[];let frames=0;const t0=performance.now(),d0=__ev.state.distance;
    (function f(){frames++;if(__ev.scheduler)gen.push(__ev.scheduler.stats.lastMs);if(performance.now()-t0<60000)requestAnimationFrame(f);else res({frames,km:(__ev.state.distance-d0)/1000,gen,pool:__ev.poolStats,worstStep:__ev.scheduler?.stats.worstStep});})();}));
  const g=r.gen.filter(x=>x>0).sort((a,b)=>a-b);
  console.log(JSON.stringify({frames:r.frames,km:r.km.toFixed(2),genFrames:g.length,genMedian:g[g.length>>1]?.toFixed(1),genP95:g[Math.floor(g.length*.95)]?.toFixed(1),genMax:g[g.length-1]?.toFixed(1),over20:g.filter(x=>x>20).length,pool:r.pool}));
 }
 console.log(errs.slice(0,10).join('\n')||'no errors');
 await b.close();srv.close();
})();
