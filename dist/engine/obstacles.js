// Things you can crash into, by road section, in road coordinates: distance along (s), sideways
// position square to the road (side) and a radius. The road sections fill this in as they are built;
// the physics reads it. Plain data, so it can move to a worker later.
const bySection = new Map();
export function setObstacles(index, list) { bySection.set(index, list); }
export function clearObstacles(index) { bySection.delete(index); }
/** Calls fn(s, side, r) for every obstacle in the sections around distance s. */
export function forObstaclesNear(s, CH, fn) {
  const i = Math.floor(s / CH);
  for (let k = i - 1; k <= i + 1; k++) { const l = bySection.get(k); if (l) for (let j = 0; j < l.length; j += 3) fn(l[j], l[j + 1], l[j + 2]); }
}
