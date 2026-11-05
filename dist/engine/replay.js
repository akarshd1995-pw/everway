// Replays: the last two minutes of driving are always kept (15 samples a second: where you were on
// the road, your speed and heading, and where the other vehicles were). Press R (or the Replay
// button) to watch them again from any camera; the cinematic camera is chosen to start with.
// Scrub along the bar, play at half speed, then go back to driving exactly where you left off.
import {$} from './core.js';
import {G, state} from './state.js';
import {traffic} from './actors.js';
import {rebuild} from './chunks.js';
import {toast} from './hud.js';
import {CAMERAS} from './camera.js';

const RATE = 15, KEEP = 120 * RATE, FIELDS = ['distance', 'side', 'psi', 'speed', 'y', 'delta', 'lon', 'lat', 'gear', 'rev', 'airborne', 'time'];
const buf = []; let acc = 0;

/** Keep a sample of the drive (call every frame while driving). */
export function recordReplay(dt) {
  if (G.replay) return;
  acc += dt; if (acc < 1 / RATE) return; acc = 0;
  const f = FIELDS.map(k => +state[k] || 0);
  f.push(traffic.map(c => c.visible ? c.userData.s : NaN));
  buf.push(f); if (buf.length > KEEP) buf.shift();
}
/** Forget the recording (a new journey, a jump along the road). */
export function clearReplay() { buf.length = 0; }

/* ------------------------------------------------------------ playing back */
const bar = document.createElement('div'); bar.id = 'replaybar'; bar.hidden = true;
bar.innerHTML = `<button id="rp-play" aria-label="Pause">❚❚</button><span class="rp-label">Replay</span>
  <input id="rp-seek" type="range" min="0" max="1000" value="0" aria-label="Position in the replay"><output id="rp-time">0:00</output>
  <button id="rp-slow" class="ghost" aria-pressed="false">½×</button><button id="rp-cam" class="ghost">Camera</button><button id="rp-exit">Back to driving</button>`;
document.body.appendChild(bar);
let live = null;
const lerp = (a, b, t) => a + (b - a) * t;
function apply(pos) {
  const n = buf.length, i = Math.min(n - 2, Math.floor(pos)), t = pos - i, a = buf[i], b = buf[i + 1];
  FIELDS.forEach((k, j) => { state[k] = k === 'airborne' ? !!a[j] : k === 'gear' ? a[j] : k === 'time' && Math.abs(b[j] - a[j]) > 1 ? a[j] : lerp(a[j], b[j], t); });
  const ta = a[FIELDS.length], tb = b[FIELDS.length];
  traffic.forEach((c, k) => { const sa = ta[k], sb = tb[k]; if (Number.isNaN(sa)) { c.visible = false; return; } c.visible = true; c.userData.s = Number.isNaN(sb) ? sa : lerp(sa, sb, t); });
}
export function startReplay() {
  if (G.replay || !state.started || state.crashed || G.photo) return;
  if (buf.length < RATE * 4) { toast('Drive a little first: the replay keeps the last two minutes.'); return; }
  live = {state: Object.fromEntries(FIELDS.concat(['odometer', 'cam', 'paused', 'damage']).map(k => [k, state[k]])), traffic: traffic.map(c => [c.visible, c.userData.s])};
  G.replay = {pos: 0, playing: true, slow: false};
  state.paused = false; state.cam = 3;
  apply(0); rebuild(state.distance);
  document.body.classList.add('replaying'); bar.hidden = false; paint();
}
export function stopReplay() {
  if (!G.replay) return;
  G.replay = null;
  Object.assign(state, live.state); traffic.forEach((c, k) => { c.visible = live.traffic[k][0]; c.userData.s = live.traffic[k][1]; });
  rebuild(state.distance); document.body.classList.remove('replaying'); bar.hidden = true;
}
/** Each frame during a replay: move along the recording. */
export function replayFrame(dt) {
  const R = G.replay; if (!R) return;
  if (R.playing && !G.photo) R.pos += dt * RATE * (R.slow ? .5 : 1);
  if (R.pos >= buf.length - 1.01) { R.pos = buf.length - 1.01; R.playing = false; }
  apply(R.pos); paint(true);
}
const fmt = sec => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;
function paint(fast) {
  const R = G.replay; if (!R) return;
  const n = Math.max(2, buf.length - 1);
  if (!seeking) $('#rp-seek').value = Math.round(R.pos / n * 1000);
  $('#rp-time').textContent = '−' + fmt((n - R.pos) / RATE);
  if (fast) return;
  $('#rp-play').textContent = R.playing ? '❚❚' : '▶'; $('#rp-play').setAttribute('aria-label', R.playing ? 'Pause' : 'Play');
  $('#rp-slow').setAttribute('aria-pressed', R.slow); $('#rp-slow').classList.toggle('on', R.slow);
}
let seeking = false;
$('#rp-seek').addEventListener('input', e => { seeking = true; const R = G.replay; if (!R) return; const p = e.target.value / 1000 * (buf.length - 1.01);
  const jump = Math.abs(buf[Math.floor(p)][0] - state.distance) > 600; R.pos = p; apply(p); if (jump) rebuild(state.distance); });
$('#rp-seek').addEventListener('change', () => { seeking = false; });
$('#rp-play').onclick = () => { const R = G.replay; if (!R) return; if (!R.playing && R.pos >= buf.length - 1.02) { R.pos = 0; apply(0); rebuild(state.distance); } R.playing = !R.playing; paint(); };
$('#rp-slow').onclick = () => { if (G.replay) { G.replay.slow = !G.replay.slow; paint(); } };
$('#rp-cam').onclick = () => { state.cam = (state.cam + 1) % CAMERAS.length; toast(CAMERAS[state.cam]); };
$('#rp-exit').onclick = stopReplay;
addEventListener('keydown', e => {
  if (['INPUT', 'SELECT'].includes(document.activeElement.tagName) && document.activeElement.id !== 'rp-seek') return;
  if (e.key.toLowerCase() === 'r' && !e.repeat) { if (G.replay) stopReplay(); else startReplay(); }
  else if (G.replay && e.key === 'Escape') stopReplay();
  else if (G.replay && e.key === ' ') { e.stopImmediatePropagation(); e.preventDefault(); $('#rp-play').click(); }
}, true);
