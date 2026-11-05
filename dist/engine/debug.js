// Developer tools, only with ?debug in the address: a performance panel (press F3 to hide) and the
// window.__ev hooks used by the screenshot and timing tests.
import * as T from '../three.module.js';
import {params} from './core.js';
import {G,state} from './state.js';
import {ASSETS,camera,canvas,renderer,scene} from './render.js';
import {post} from './post.js';
import {chunkBuilder,chunks,disposeChunk,scheduler,poolStats,rebuild} from './chunks.js';
import {traffic} from './actors.js';
import {cloudU,bakeEnvironment} from './sky.js';
import {setDebugView} from './camera.js';
import {setViewDistance} from './far.js';
import {roadX,roadHeight,roadGrade} from './road.js';
const clampPx = v => Math.max(-36, Math.min(36, v));
import {CH,biomeAt} from './biomes.js';

export const DEBUG = params.has('debug');
let panel = null, map = null, snapCb = null;
const win = {frames: 0, sum: 0, worst: 0, over20: 0, gen: 0, genWorst: 0, t: 0};
export const perf = {frameMs: 0, worstMs: 0, over20: 0, totalOver20: 0, frames: 0};

if (DEBUG) {
  renderer.info.autoReset = false;  // count every pass of the frame, not just the last one
  panel = document.createElement('pre');
  panel.id = 'debugpanel';
  panel.style.cssText = 'position:fixed;left:8px;top:64px;z-index:50;margin:0;padding:8px 10px;font:11px/1.45 ui-monospace,Consolas,monospace;color:#e8f2e8;background:#0d1a14cc;border-radius:6px;pointer-events:none;white-space:pre';
  document.body.appendChild(panel);
  // top-down map of the road service: 3 km ahead, built sections in green, queued ones in amber
  map = document.createElement('canvas'); map.id = 'debugmap'; map.width = 180; map.height = 260;
  map.style.cssText = 'position:fixed;left:8px;bottom:96px;z-index:50;border-radius:6px;background:#0d1a14cc;pointer-events:none';
  document.body.appendChild(map);
  addEventListener('keydown', e => { if (e.key === 'F3') { e.preventDefault(); panel.hidden = map.hidden = !panel.hidden; } });
}

/** Call at the very start of a frame. */
export function frameStart() { if (DEBUG) renderer.info.reset(); }

/** Call at the end of a frame with its duration in milliseconds. */
export function frameEnd(ms) {
  if (snapCb) { const cb = snapCb; snapCb = null; cb(canvas.toDataURL('image/jpeg', .9)); }
  if (!DEBUG) return;
  perf.frames++;
  win.frames++; win.sum += ms; win.worst = Math.max(win.worst, ms); win.t += ms;
  win.gen += scheduler.stats.lastMs; win.genWorst = Math.max(win.genWorst, scheduler.stats.lastMs);
  if (ms > 20) { win.over20++; perf.totalOver20++; }
  if (win.t < 500 || panel.hidden) return;
  const i = renderer.info, mem = performance.memory;
  perf.frameMs = win.sum / win.frames; perf.worstMs = win.worst; perf.over20 = win.over20;
  panel.textContent =
    `frame     ${perf.frameMs.toFixed(1)} ms avg · ${win.worst.toFixed(1)} worst · ${win.over20} over 20 ms\n` +
    `generate  ${(win.gen / win.frames).toFixed(1)} ms/frame · ${win.genWorst.toFixed(1)} worst · ${scheduler.size} queued\n` +
    `draws     ${i.render.calls} · ${(i.render.triangles / 1e6).toFixed(2)} M triangles\n` +
    `gpu mem   ${i.memory.geometries} geometries · ${i.memory.textures} textures\n` +
    `pool      ${poolStats.created} made · ${poolStats.reused} reused · ${poolStats.idle} idle\n` +
    `sections  ${chunks.length} live${mem ? ` · heap ${(mem.usedJSHeapSize / 1048576).toFixed(0)} MB` : ''}\n` +
    `quality   ${G.quality.label} · ${(state.distance / 1000).toFixed(2)} km`;
  drawMap();
  win.frames = win.sum = win.worst = win.over20 = win.gen = win.genWorst = win.t = 0;
}

if (DEBUG) window.__ev = {
  G, renderer, scene, state, camera, post, traffic, perf, scheduler, poolStats,
  models: ASSETS?.models,
  get quality() { return G.quality; },
  get player() { return G.player; },
  setWeather: w => { state.weather = w; G.weatherNow = w; G.weatherNext = null; G.snapWeather = 2; },
  snap: () => new Promise(r => snapCb = r),
  setCam: (p, t) => setDebugView(p, t),
  /** Jump to a distance and build the road there at once (tests). */
  jumpTo: d => { state.distance = d; rebuild(d); setViewDistance(); },
  /** Stop drawing new frames (the last one stays on screen), for page screenshots. */
  hold: (on = true) => { G.hold = on; },
  /** True once every queued road section has been built. */
  idle: () => scheduler.size === 0,
  /** Stop all animation so two runs give the same picture (screenshot tests). */
  freeze: (on = true) => { G.frozen = on; if (on) { G.elapsed = 100; cloudU.uOffset.value = 0; bakeEnvironment(); } },
  timeChunk: i => {
    const gen = chunkBuilder(i), times = []; let st, worst = 0; const t0 = performance.now();
    for (;;) { const a = performance.now(); st = gen.next(); const d = performance.now() - a; worst = Math.max(worst, d); times.push(+d.toFixed(1)); if (st.done) break; }
    const total = performance.now() - t0; disposeChunk(st.value);
    return {total, worst, steps: times.length, times};
  },
};

const BIOME_TINT = {fields: '#7fb069', town: '#d9b38c', desert: '#e0b25c', mountain: '#9aa7a0', snow: '#e8eef2'};
function drawMap() {
  const c = map.getContext('2d'), W = map.width, H = map.height, s0 = state.distance - 200, span = 3200, k = (H - 20) / span, x0 = roadX(state.distance), y0 = roadHeight(state.distance);
  c.clearRect(0, 0, W, H);
  const built = new Set(chunks.map(ch => ch.userData.index));
  for (let s = s0; s < s0 + span; s += 20) {
    const y = H - 10 - (s - s0) * k, x = W / 2 + (roadX(s) - x0) * k, idx = Math.floor(s / CH);
    c.fillStyle = BIOME_TINT[biomeAt(s)] || '#888'; c.globalAlpha = .35; c.fillRect(0, y - 20 * k, 8, 20 * k + 1); c.globalAlpha = 1;
    c.fillStyle = built.has(idx) ? '#7ee08a' : scheduler.has(idx) ? '#f2b84b' : '#6b7a72';
    c.fillRect(x - 1.5, y - 20 * k, 3, 20 * k + 1);
    // height profile on the right: up is higher
    c.fillStyle = '#9fc3ff'; c.fillRect(W - 40 + clampPx((roadHeight(s) - y0) * .3), y - 20 * k, 2, 20 * k + 1);
  }
  c.fillStyle = '#9fc3ff55'; c.fillRect(W - 40, 0, 1, H);
  const py = H - 10 - (state.distance - s0) * k;
  c.fillStyle = '#fff'; c.beginPath(); c.arc(W / 2, py, 3.5, 0, 6.283); c.fill();
  c.font = '10px ui-monospace,monospace'; c.fillStyle = '#cfe'; c.fillText('road ahead 3 km', 14, 12);
  c.fillText(`height ${y0.toFixed(0)} m · ${(roadGrade(state.distance) * 100).toFixed(1)}%`, 14, 24);
}
