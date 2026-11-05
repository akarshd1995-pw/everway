// Progress kept in this browser: a saved journey to continue, a journal of all your driving,
// achievements, and journey codes (the same code always gives the same road).
import {G, state} from './state.js';
import {biomeAt} from './biomes.js';
import {roadSeed, setSeed} from './road.js';
import {structureAt} from './terrain.js';

const KEY_SAVE = 'everway.save', KEY_LOG = 'everway.journal';
const load = (k, d) => { try { return JSON.parse(localStorage.getItem(k)) || d; } catch { return d; } };
const store = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* storage unavailable */ } };

export const PLACES = {fields: 'Green Valley', town: 'Little Town', coast: 'Wild Coast', desert: 'Route 66', mountain: 'Alpine Escape', snow: 'Quiet North', planet: 'Another World'};
export const ACHIEVEMENTS = [
  ['first10', 'Off we go', 'Drive 10 km in one go'],
  ['long50', 'The long way', 'Drive 50 km in one go'],
  ['total100', 'Road miles', 'Drive 100 km in total'],
  ['clean25', 'Not a scratch', 'Drive 25 km without a knock'],
  ['places', 'Seen it all', 'Visit every place on the journey'],
  ['planet', 'Not in Kansas', 'Drive on another world'],
  ['seasons', 'All year round', 'Drive in all four seasons'],
  ['night', 'Night owl', 'Drive 10 km at night'],
  ['bridge', 'Over the valley', 'Cross a bridge'],
  ['tunnel', 'Through the hill', 'Drive through a tunnel'],
  ['coach', 'All aboard', 'Drive the coach for 10 km'],
  ['manual', 'Hands on the wheel', 'Drive yourself for 10 km'],
  ['sea', 'Into the sea', 'Find out what lies beyond the cliffs'],
  ['postcards', 'Wish you were here', 'Collect every postcard'],
];

export const journal = Object.assign({postcards: {}, totalKm: 0, longestKm: 0, drives: 0, crashes: 0, nightKm: 0, coachKm: 0, manualKm: 0, places: {}, seasons: {}, got: {}}, load(KEY_LOG, {}));
let listeners = [];
/** Called with (title, description) when an achievement is unlocked. */
export const onAchievement = fn => listeners.push(fn);
function unlock(key) {
  if (journal.got[key]) return;
  journal.got[key] = Date.now(); store(KEY_LOG, journal);
  const a = ACHIEVEMENTS.find(x => x[0] === key); if (a) listeners.forEach(fn => fn(a[1], a[2]));
}

let lastOdo = 0, saveTimer = 0, cleanKm = 0;
/** Call every frame while driving. */
export function trackDrive(dt) {
  const d = Math.max(0, state.odometer - lastOdo) / 1000; lastOdo = state.odometer;
  if (d > 0) {
    journal.totalKm += d;
    if (state.time < 6 || state.time > 20) journal.nightKm += d;
    if (state.ride === 'coach') journal.coachKm += d;
    if (state.mode === 'manual') journal.manualKm += d;
    cleanKm = state.damage > 0 ? 0 : cleanKm + d;
  }
  const place = biomeAt(state.distance); journal.places[place] = 1; journal.seasons[state.season] = 1;
  const km = state.odometer / 1000;
  if (km > journal.longestKm) journal.longestKm = km;
  if (km >= 10) unlock('first10'); if (km >= 50) unlock('long50'); if (journal.totalKm >= 100) unlock('total100');
  if (cleanKm >= 25) unlock('clean25'); if (journal.nightKm >= 10) unlock('night'); if (journal.coachKm >= 10) unlock('coach'); if (journal.manualKm >= 10) unlock('manual');
  if (place === 'planet') unlock('planet');
  if (['fields', 'town', 'coast', 'desert', 'mountain', 'snow'].every(p => journal.places[p])) unlock('places');
  if (['spring', 'summer', 'autumn', 'winter'].every(x => journal.seasons[x])) unlock('seasons');
  const st = structureAt(state.distance); if (st === 1) unlock('bridge'); else if (st === 2) unlock('tunnel');
  saveTimer += dt;
  if (saveTimer > 5) { saveTimer = 0; saveJourney(); store(KEY_LOG, journal); }
}

/** A drive ended in a crash: record it and forget the saved journey. */
export function endDrive(reason) {
  journal.drives++; journal.crashes++; if (reason === 'sea') unlock('sea');
  store(KEY_LOG, journal); clearSave(); lastOdo = 0; cleanKm = 0;
}
export function startDrive() { lastOdo = state.odometer; }

/* ---- postcards: one for each kind of landmark, with a small picture of the moment you passed it */
export const POSTCARDS = [
  ['A lighthouse on the cliffs', 'Wild Coast'], ['A viewpoint over the sea', 'Wild Coast'], ['A ruined castle on the hill', 'Green Valley'],
  ['A windmill', 'Green Valley'], ['A waterfall', 'Alpine Escape'], ['A viewpoint over the valley', 'Alpine Escape'], ['A stone arch in the desert', 'Route 66']];
/** Keep a postcard (the first one of each kind is kept). Returns true if it is new. */
export function addPostcard(name, img) {
  journal.postcards = journal.postcards || {};
  if (journal.postcards[name]) return false;
  journal.postcards[name] = {img, at: Date.now(), km: Math.round(journal.totalKm)};
  if (POSTCARDS.every(([n]) => journal.postcards[n])) unlock('postcards');
  store(KEY_LOG, journal); return true;
}

/* ---- save and continue */
const SAVED = ['roadSwitches', 'legPick', 'routeOffset', 'weatherOffset', 'distance', 'odometer', 'ride', 'biome', 'season', 'difficulty', 'time', 'weather', 'traffic', 'mode', 'target', 'damage', 'view'];
export function saveJourney() {
  if (!state.started || state.crashed || G.trip) return;   // not saved halfway down a side road
  const s = {seed: roadSeed(), at: Date.now()}; for (const k of SAVED) s[k] = state[k];
  store(KEY_SAVE, s);
}
export const savedJourney = () => load(KEY_SAVE, null);
export function clearSave() { try { localStorage.removeItem(KEY_SAVE); } catch { /* ignore */ } }
/** Put a saved journey's values back into the game state (the caller rebuilds the world). */
export function applySave(s) {
  for (const k of SAVED) if (s[k] !== undefined) state[k] = s[k];
  setSeed(s.seed || 1); G.weatherNow = s.weather && s.weather !== 'auto' ? s.weather : G.weatherNow;
  lastOdo = state.odometer;
}

/* ---- journey codes: seed, road and starting place in a short code like K3F9Q-N2 */
const DIFF = {relaxed: 'R', normal: 'N', twisty: 'T'}, PLACE_LIST = ['auto', 'fields', 'town', 'coast', 'desert', 'mountain', 'snow', 'planet'];
export function journeyCode() {
  return roadSeed().toString(36).toUpperCase().padStart(5, '0') + '-' + (DIFF[state.difficulty] || 'N') + Math.max(0, PLACE_LIST.indexOf(state.biome)) + ((state.routeOffset || 0) % 11).toString(36).toUpperCase();
}
/** Returns {seed, difficulty, biome} for a valid code, or null. */
export function parseCode(text) {
  const m = String(text).trim().toUpperCase().match(/^([0-9A-Z]{1,7})-?([RNT])([0-7])([0-9A])?$/);
  if (!m) return null;
  const difficulty = Object.keys(DIFF).find(k => DIFF[k] === m[2]);
  return {seed: parseInt(m[1], 36), difficulty, biome: PLACE_LIST[+m[3]], offset: m[4] ? parseInt(m[4], 36) : 0};
}
export const randomSeed = () => 2 + Math.floor(Math.random() * 60466170);
