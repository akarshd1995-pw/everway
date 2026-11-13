// Settings panel, buttons, keyboard and touch input.
import {$,clamp} from './core.js';
import {G,state} from './state.js';
import {QUALITY,camera,scene} from './render.js';
import {rebuild} from './chunks.js';
import {resetRoad} from './road.js';
import {setViewDistance} from './far.js';
import {makeVehicle, makePlayer} from './actors.js';
import {CARS, carById} from './garage.js';
import {toast,resetRegion} from './hud.js';
import {applyQuality,resetAdaptive} from './quality.js';
import {pickWeather} from './weather.js';
import {toggleSound, setRadio} from './audio.js';
import {CAMERAS, glance} from './camera.js';
import {resetVehicle} from './physics.js';
import {traffic} from './actors.js';
import {enterPhoto, exitPhoto} from './photo.js';
import {journal, ACHIEVEMENTS, POSTCARDS, PLACES, onAchievement, endDrive, startDrive, savedJourney, applySave, clearSave, journeyCode, parseCode, randomSeed} from './progress.js';
import {resetForks} from './fork.js';
import {resetTrip} from './trip.js';
import {resetEvents} from './events.js';
import {resetMoments} from './moments.js';
import {resetPerch} from './perch.js';
import {baseWeather, setWeatherKind} from './atmos.js';
import {startReplay, clearReplay} from './replay.js';
import {setSeed} from './road.js';
import {route, LEG} from './biomes.js';

export const keys = {};

function pause() { if (!state.started) return; state.paused = !state.paused; $('#pause').textContent = state.paused ? '▶' : 'Ⅱ'; toast(state.paused ? 'Take a breath. The road can wait.' : 'And away we go.'); }
function segmented(id, fn) { const el = $(id); if (!el) return; el.onclick = e => { const b = e.target.closest('button'); if (!b) return; el.querySelectorAll('button').forEach(x => x.classList.toggle('active', x === b)); fn(b.dataset.value); }; }

$('#start').onclick = () => { startDrive(); document.body.classList.remove('home'); state.started = true; $('#intro').classList.add('gone'); $('#panel').classList.add('closed'); toast('Nowhere to be. Just enjoy the journey.'); };
$('#settings').onclick = () => $('#panel').classList.toggle('closed');
$('#pause').onclick = pause;
$('#replay').onclick = () => startReplay();
$('#camera').onclick = () => { state.cam = (state.cam + 1) % CAMERAS.length; toast(CAMERAS[state.cam]); };
$('#speed').oninput = e => state.target = +e.target.value;
$('#time').oninput = e => { state.time = +e.target.value; state.autoTime = false; $('#autotime').checked = false; };
$('#autotime').onchange = e => state.autoTime = e.target.checked;
function choosePlace(v) {
  if (state.biome === v) return;
  state.biome = v; resetForks(); resetRoad(); rebuild(state.distance); setViewDistance(); resetRegion();
  if (state.weather === 'auto') G.weatherNow = pickWeather();
  document.querySelectorAll('#biome button').forEach(x => x.classList.toggle('active', x.dataset.value === v));
  document.querySelectorAll('.guide .dest').forEach(x => x.classList.toggle('active', x.dataset.biome === v));
}
segmented('#biome', choosePlace);
// the guide sign on the home screen picks where the journey starts
document.querySelectorAll('.guide .dest').forEach(b => b.onclick = () => choosePlace(b.dataset.biome));
// settings tabs
const tabs = document.querySelectorAll('.tabs button');
tabs.forEach(t => t.onclick = () => {
  tabs.forEach(x => x.setAttribute('aria-selected', String(x === t)));
  document.querySelectorAll('.pane').forEach(p => p.hidden = p.dataset.pane !== t.dataset.tab);
});

segmented('#weather', v => { state.weather = v; G.weatherNext = null; setWeatherKind(v); G.weatherNow = v === 'auto' ? pickWeather() : baseWeather(v); G.snapWeather = .6; toast(v === 'auto' ? 'The forecast follows your journey.' : v === 'stormy' ? 'A thunderstorm is gathering.' : v === 'foggy' ? 'Fog is rolling in.' : 'A little ' + v + ' weather.'); });
segmented('#difficulty', v => { state.difficulty = v; resetForks(); resetRoad(v); rebuild(state.distance); setViewDistance(); toast({relaxed: 'A relaxed road: long sweeping bends and gentle hills.', normal: 'The road as it comes.', twisty: 'A twisty road: tight bends, steep hills, a narrower lane.'}[v]); });
segmented('#season', v => { state.season = v; state.seasonStart = v; state.seasonBase = state.distance; rebuild(state.distance); setViewDistance(); if (state.weather === 'auto') G.weatherNow = pickWeather(); toast({spring: 'Spring: fresh green and wildflowers.', summer: 'High summer.', autumn: 'Autumn colours.', winter: 'Winter: snow on the ground.'}[v]); });
segmented('#traffic', v => { state.traffic = v; toast({none: 'An empty road, all yours.', light: 'A little traffic.', busy: 'Busy roads: cars, vans, tractors and caravans.'}[v]); });
segmented('#view', v => { state.view = v; setViewDistance(v); toast({short: 'Short view: the lightest on your computer.', medium: 'Medium view distance.', far: 'Far view: the land reaches the horizon.', veryfar: 'Very far view: for fast computers.'}[v]); });
segmented('#modes', v => { state.mode = v; toast(v === 'manual' ? 'You drive: W A S D or the arrow keys.' : 'Autodrive on. It keeps to the lane and slows for bends.'); });
/** Swap the vehicle under you for the ride (and car, and paint) now chosen. */
function swapPlayer() {
  resetVehicle(state.speed);
  scene.remove(G.player); G.player.traverse(o => { if (o.isMesh) o.geometry.dispose(); });
  G.player = makePlayer(state.ride); scene.add(G.player);
}
segmented('#rides', v => {
  state.ride = v; swapPlayer(); paintGarage();
  state.target = v === 'cycle' ? 24 : v === 'bike' ? 75 : v === 'coach' ? 70 : 65; $('#speed').value = state.target;
  toast({car: carById(state.car).name + ': ' + carById(state.car).blurb, bike: 'Two wheels. An open road.', coach: 'All aboard. Sit back and watch the view.', cycle: 'Slow down and hear the world.'}[v]);
});

/* ------------------------------------------------------------ seasons through the year */
$('#seasonjourney').addEventListener('change', e => {
  state.seasonJourney = e.target.checked; state.seasonStart = state.season; state.seasonBase = state.distance;
  rebuild(state.distance); setViewDistance();
  toast(state.seasonJourney ? 'The year turns as you drive: a new season every 12 km or so.' : 'The season stays as it is.');
});

/* ------------------------------------------------------------ the garage */
const PAINTS = ['#e8e2d4', '#141719', '#9aa3a6', '#c8342a', '#7d1f1a', '#d9a21b', '#e46b2a', '#2a6fb0', '#2f5d86', '#1f3a33', '#4a5a4c', '#6b4c8a'];
function paintGarage() {
  $('#garagebox').hidden = state.ride !== 'car';
  const bar = (label, n) => `<span>${label}</span><span class="bar"><i style="width:${n * 10}%"></i></span>`;
  $('#garage').innerHTML = CARS.map(c => `<button role="option" data-car="${c.id}" class="${c.id === state.car ? 'active' : ''}" aria-selected="${c.id === state.car}">
    <span class="chip" style="background:${c.id === state.car && state.paint ? state.paint : c.color}"></span><b>${c.name}</b><small>${c.kind}</small>
    <span class="more">${c.blurb} Top speed ${Math.round(c.h.top * 3.6)} km/h.<span class="bars">${bar('Speed', c.stats.speed)}${bar('Pick-up', c.stats.accel)}${bar('Handling', c.stats.handling)}${bar('Comfort', c.stats.comfort)}</span></span></button>`).join('');
  const cur = state.paint || carById(state.car).color;
  $('#paints').innerHTML = [carById(state.car).color, ...PAINTS.filter(p => p !== carById(state.car).color)].map((p, i) =>
    `<button role="radio" data-paint="${i ? p : ''}" aria-checked="${p === cur}" aria-label="${i ? 'Paint ' + p : 'Original colour'}" class="${p === cur ? 'active' : ''}" style="background:${p}"></button>`).join('');
}
$('#garage').onclick = e => {
  const b = e.target.closest('button'); if (!b || b.dataset.car === state.car) return;
  state.car = b.dataset.car; state.paint = null; swapPlayer(); paintGarage();
  const c = carById(state.car); toast(c.name + ', ' + c.kind.toLowerCase() + '. ' + c.blurb);
};
$('#paints').onclick = e => {
  const b = e.target.closest('button'); if (!b) return;
  state.paint = b.dataset.paint || null; swapPlayer(); paintGarage();
};
paintGarage();
segmented('#quality', v => {
  G.qualitySetting = v; G.quality = QUALITY[v === 'auto' ? 'high' : v]; resetAdaptive(); applyQuality();
  toast({auto: 'Graphics adapt to your device.', high: 'Full graphics: bloom, soft shadows, 4× anti-aliasing.', balanced: 'Balanced graphics.', low: 'Performance graphics.'}[v]);
});
if (G.qualitySetting !== 'auto') document.querySelectorAll('#quality button').forEach(x => x.classList.toggle('active', x.dataset.value === G.qualitySetting));

$('#fullscreen').onclick = async () => { try { if (!document.fullscreenElement) await document.documentElement.requestFullscreen(); else await document.exitFullscreen(); } catch { toast('Fullscreen is unavailable in this view.'); } };
const showSound = on => { $('#sound small').textContent = on ? 'Sound on' : 'Sound off'; $('#soundswitch').checked = on; if (!on) { $('#radioswitch').checked = false; setRadio(false); } };
$('#sound').onclick = async () => { try { showSound(await toggleSound()); } catch { toast('Audio is unavailable in this browser.'); } };
$('#soundswitch').onchange = async e => { try { if (e.target.checked !== state.sound) showSound(await toggleSound()); } catch { toast('Audio is unavailable in this browser.'); } };
$('#radioswitch').onchange = async e => { try { await setRadio(e.target.checked); showSound(state.sound); $('#radioswitch').checked = e.target.checked && state.sound; if (e.target.checked) toast('Music on: it follows the time of day and the place.'); } catch { toast('Audio is unavailable in this browser.'); } };

// the display fades after a few quiet seconds while driving; any input brings it back
let lastInput = performance.now();
const wake = () => { lastInput = performance.now(); document.body.classList.remove('idle'); };
for (const ev of ['pointermove', 'pointerdown', 'keydown', 'wheel', 'touchstart']) addEventListener(ev, wake, {passive: true});
setInterval(() => { if (state.hud !== 'full' && state.started && !state.paused && $('#panel').classList.contains('closed') && performance.now() - lastInput > 4500) document.body.classList.add('idle'); }, 500);

window.addEventListener('keydown', e => {
  if (['INPUT', 'SELECT'].includes(document.activeElement.tagName)) return;
  if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) e.preventDefault();
  keys[e.key] = true; if (e.repeat) return;
  if (e.key === ' ') pause(); if (e.key.toLowerCase() === 'c') $('#camera').click();
  if (e.key.toLowerCase() === 'p') { if (document.body.classList.contains('photo')) exitPhoto(); else enterPhoto(); }
  if (e.key === 'Escape') exitPhoto();
  if (e.key.toLowerCase() === 'h') { const bare = document.body.classList.toggle('bare'); if (!bare) toast('Display back. Press H to hide it again.'); }
});
window.addEventListener('keyup', e => keys[e.key] = false);
window.addEventListener('blur', () => { Object.keys(keys).forEach(k => keys[k] = false); });
// touch: drag the steering pad left or right (how far you drag is how much you steer), hold the pedals
state.touch = {steer: 0, throttle: 0, brake: 0};
const toManual = () => { if (state.mode === 'cruise') { state.mode = 'manual'; document.querySelectorAll('#modes button').forEach(x => x.classList.toggle('active', x.dataset.value === 'manual')); } };
{ const wheel = $('#t-wheel'), knob = $('#t-knob'); let x0 = null;
  wheel.onpointerdown = e => { e.preventDefault(); wheel.setPointerCapture(e.pointerId); x0 = e.clientX; toManual(); };
  wheel.onpointermove = e => { if (x0 === null) return; const v = Math.max(-1, Math.min(1, (e.clientX - x0) / 70)); state.touch.steer = Math.sign(v) * v * v * .4 + v * .6; knob.style.transform = `translateX(${v * 34}px)`; wheel.setAttribute('aria-valuenow', v.toFixed(2)); };
  wheel.onpointerup = wheel.onpointercancel = () => { x0 = null; state.touch.steer = 0; knob.style.transform = ''; wheel.setAttribute('aria-valuenow', '0'); };
  for (const [id, k] of [['#t-gas', 'throttle'], ['#t-brake', 'brake']]) { const b = $(id);
    b.onpointerdown = e => { e.preventDefault(); b.setPointerCapture(e.pointerId); state.touch[k] = 1; b.classList.add('on'); toManual(); };
    b.onpointerup = b.onpointercancel = () => { state.touch[k] = 0; b.classList.remove('on'); }; } }
window.addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); applyQuality(); });

/* ---- crashes: the vehicle is totalled and the journey starts again from the menu */
const WHY = {barrier: 'You hit the barrier.', car: 'You hit another car.', scenery: 'You hit something beside the road.', sea: 'You drove into the sea.'};
let crashTimer = null;
export function totalled(reason) {
  if (crashTimer) return;
  $('#crash-why').textContent = WHY[reason] || WHY.scenery;
  $('#crash-km').textContent = (state.odometer / 1000).toFixed(1);
  $('#crash').hidden = false; $('#panel').classList.add('closed');
  crashTimer = setTimeout(backToMenu, 4500);
  setTimeout(() => $('#crash-home').focus(), 50);
}
function backToMenu() {
  endDrive(state.crashed);
  clearTimeout(crashTimer); crashTimer = null;
  const km = (state.odometer / 1000).toFixed(1);
  $('#crash').hidden = true;
  state.started = false; state.paused = false; $('#pause').textContent = 'Ⅱ';
  state.distance = 0; state.odometer = 0; state.speed = 0;
  newJourney();
  document.body.classList.remove('idle', 'bare'); document.body.classList.add('home');
  $('#intro').classList.remove('gone');
  let note = $('#intro .last-trip'); if (!note) { note = document.createElement('span'); note.className = 'last-trip'; $('#intro>small').after(note); }
  note.textContent = `Last drive: ${km} km.`;
}
$('#crash-home').onclick = backToMenu;

/* ---- journal, achievements, journey codes, continue */
function syncSeg(id, v) { document.querySelectorAll(id + ' button').forEach(x => x.classList.toggle('active', x.dataset.value === v)); }
function syncAll() {
  $('#seasonjourney').checked = !!state.seasonJourney;
  syncSeg('#rides', state.ride); paintGarage(); syncSeg('#biome', state.biome); syncSeg('#season', state.season); syncSeg('#difficulty', state.difficulty);
  syncSeg('#weather', state.weather); syncSeg('#modes', state.mode); syncSeg('#traffic', state.traffic); syncSeg('#view', state.view);
  document.querySelectorAll('.guide .dest').forEach(x => x.classList.toggle('active', x.dataset.biome === state.biome));
  $('#speed').value = state.target; $('#time').value = state.time;
}
// start a fresh world from the current state (road, sections, far land, vehicle)
function rebuildWorld() {
  resetRoad(state.difficulty); rebuild(state.distance); setViewDistance(state.view); resetRegion();
  scene.remove(G.player); G.player = makePlayer(state.ride); scene.add(G.player);
  resetVehicle(0); traffic.forEach((car, i) => { car.userData.s = state.distance + i * 75 + 70; });
  setWeatherKind(state.weather); G.weatherNow = state.weather === 'auto' ? pickWeather() : baseWeather(state.weather);
}
function showContinue() {
  const s = savedJourney(), b = $('#continue');
  b.hidden = !s; if (s) b.textContent = `Continue · ${(s.odometer / 1000).toFixed(1)} km`;
}
$('#continue').onclick = () => {
  const s = savedJourney(); if (!s) return;
  applySave(s); const damage = state.damage; rebuildWorld(); state.damage = damage; syncAll();
  $('#start').click();
};
showContinue();
const continueObserver = new MutationObserver(() => { if (document.body.classList.contains('home')) showContinue(); });
continueObserver.observe(document.body, {attributes: true, attributeFilter: ['class']});

onAchievement((title, desc) => { const t = $('#toast'); t.classList.add('toast-ach'); toast(`Achievement: ${title}. ${desc}.`); setTimeout(() => t.classList.remove('toast-ach'), 3400); });

function renderJournal() {
  $('#j-total').textContent = journal.totalKm.toFixed(1);
  $('#j-longest').textContent = journal.longestKm.toFixed(1);
  $('#j-drives').textContent = journal.drives;
  $('#j-places').innerHTML = Object.entries(PLACES).map(([k, n]) => `<span class="${journal.places[k] ? 'got' : ''}">${n}</span>`).join('');
  const got = ACHIEVEMENTS.filter(a => journal.got[a[0]]).length;
  $('#j-count').textContent = `${got} of ${ACHIEVEMENTS.length}`;
  const pc = journal.postcards || {}, have = POSTCARDS.filter(([n]) => pc[n]).length;
  $('#j-pcount').textContent = `${have} of ${POSTCARDS.length}`;
  $('#j-cards').innerHTML = POSTCARDS.map(([n, place]) => { const c = pc[n];
    return c ? `<figure class="card got"><img src="${c.img}" alt="${n}"><figcaption><b>${n}</b>${place} · ${new Date(c.at).toLocaleDateString()}</figcaption></figure>`
             : `<figure class="card"><div class="blank">Not found yet</div><figcaption><b>${n}</b>${place}</figcaption></figure>`; }).join('');
  $('#j-ach').innerHTML = ACHIEVEMENTS.map(([k, t, d]) => `<li class="${journal.got[k] ? 'got' : ''}"><b>${t}</b>${d}</li>`).join('');
  $('#j-code').textContent = journeyCode();
}
$('#journalbtn').onclick = () => { renderJournal(); $('#journal').hidden = false; $('#journal-close').focus(); };
$('#journal-close').onclick = () => { $('#journal').hidden = true; };
$('#journal').onclick = e => { if (e.target.id === 'journal') $('#journal').hidden = true; };
$('#j-copy').onclick = async () => { try { await navigator.clipboard.writeText(journeyCode()); $('#j-msg').textContent = 'Code copied.'; } catch { $('#j-msg').textContent = 'Copy the code by hand: ' + journeyCode(); } };
function driveCode(c) {
  resetForks(); clearReplay(); setSeed(c.seed); state.difficulty = c.difficulty; state.biome = c.biome; state.routeOffset = c.offset || 0; state.distance = 0; state.odometer = 0;
  clearSave(); rebuildWorld(); syncAll(); renderJournal();
}
$('#j-new').onclick = () => { driveCode({seed: randomSeed(), difficulty: state.difficulty, biome: state.biome, offset: Math.floor(Math.random() * 11)}); $('#j-msg').textContent = 'A new road. Its code is above.'; };
$('#j-form').onsubmit = e => {
  e.preventDefault(); const c = parseCode($('#j-input').value);
  if (!c) { $('#j-msg').textContent = 'That code does not look right. It has five letters or numbers, a dash, a letter and a number, like K3F9Q-N2.'; return; }
  driveCode(c); $('#j-msg').textContent = 'Road loaded. Close the journal and press Start driving.';
};

/* ---- game controller: left stick steers, right trigger accelerates, left trigger brakes;
   A starts, Y changes camera, X photo mode, Start pauses, Back/View hides the display */
let padPrev = [];
const padRest = {};
/** A short shake on controllers that can (knocks, rough ground). */
export function rumble(strong = .5, ms = 120) { try { const p = [...navigator.getGamepads()].find(Boolean); p?.vibrationActuator?.playEffect?.('dual-rumble', {duration: ms, strongMagnitude: strong, weakMagnitude: strong * .6}); } catch { /* not supported */ } }
export function pollPad() {
  const pads = navigator.getGamepads ? navigator.getGamepads() : [], p = [...pads].find(Boolean);
  if (!p) { state.pad = null; return; }
  const x = p.axes[0] || 0;
  let rt = p.buttons[7]?.value || 0, lt = p.buttons[6]?.value || 0;
  // a steering wheel: the wheel is the first axis (no dead zone), the pedals are axes that rest at one end
  const wheel = /wheel|racing|G2[0-9]|G9[0-9]{2}|T[0-9]{3}|driving force|thrustmaster|fanatec|moza|simagic/i.test(p.id);
  if (wheel) {
    if (!padRest[p.index]) { padRest[p.index] = p.axes.slice(); toast('Steering wheel connected. Press the accelerator to drive.'); }
    const rest = padRest[p.index], pedals = rest.map((r0, i) => [i, r0]).filter(([i, r0]) => i > 0 && Math.abs(r0) > .9).map(([i, r0]) => Math.min(1, Math.abs((p.axes[i] || 0) - r0) / 2));
    const [a, b] = state.pedalSwap ? [pedals[1], pedals[0]] : [pedals[0], pedals[1]];
    rt = Math.max(rt, a || 0); lt = Math.max(lt, b || 0);
  }
  state.pad = {steer: wheel ? x : Math.abs(x) > .12 ? x : 0, throttle: rt, brake: lt, wheel};
  glance.stick[0] = p.axes[2] || 0; glance.stick[1] = p.axes[3] || 0;   // right stick: look around
  if (state.started && state.mode === 'cruise' && (rt > .2 || lt > .2)) { state.mode = 'manual'; syncSeg('#modes', 'manual'); toast('Controller: you drive. Right trigger to accelerate, left to brake.'); }
  const pressed = i => p.buttons[i]?.pressed && !padPrev[i];
  if (pressed(0) && !state.started) $('#start').click();
  if (pressed(3)) $('#camera').click();
  if (pressed(2)) { if (document.body.classList.contains('photo')) exitPhoto(); else enterPhoto(); }
  if (pressed(9)) pause();
  if (pressed(8)) document.body.classList.toggle('bare');
  if (p.buttons.some(b => b.pressed) || Math.abs(x) > .3) wake();
  padPrev = p.buttons.map(b => b.pressed);
}
addEventListener('gamepadconnected', () => toast('Controller connected. Pull the right trigger to drive.'));
segmented('#mapmode', v => { state.map = v; });
$('#pedalswap').onchange = e => { state.pedalSwap = e.target.checked; };
segmented('#hudmode', v => { state.hud = v; if (v === 'full') document.body.classList.remove('idle'); });

/* ---- every journey starts somewhere new (unless you chose a place, weather or time yourself) */
const ROUTE_NAMES = {fields: 'Green Valley', town: 'Little Town', coast: 'Wild Coast', desert: 'Route 66', mountain: 'Alps', snow: 'Quiet North'};
/** The home-screen sign: the places ahead on this journey's route, nearest first. */
function updateGuide() {
  const guide = $('.guide'); if (!guide) return;
  const off = state.routeOffset || 0, rows = [...guide.querySelectorAll('.dest[data-biome]:not([data-biome="auto"])')];
  for (const row of rows) {
    const b = row.dataset.biome; let km = null;
    for (let i = 0; i < route.length; i++) if (route[(off + i) % route.length] === b) { km = i * LEG / 1000; break; }
    row.dataset.km = km ?? 999; row.querySelector('em').textContent = km === null ? '' : km === 0 ? 'here' : km.toFixed(1) + ' km';
    row.querySelector('.ico').classList.toggle('up', km === 0);
  }
  rows.sort((a, b) => a.dataset.km - b.dataset.km).forEach(r => guide.appendChild(r));
}
export function newJourney() {
  resetEvents(); resetMoments(); resetPerch(); resetTrip(); resetForks(); clearReplay(); setSeed(randomSeed()); state.routeOffset = Math.floor(Math.random() * 11); state.weatherOffset = Math.floor(Math.random() * 5);
  if (state.autoTime) { state.time = Math.round((5.5 + Math.random() * 16) * 20) / 20; $('#time').value = state.time; }
  rebuildWorld(); updateGuide();
}
updateGuide();
if (state.weather === 'auto') G.weatherNow = pickWeather();
