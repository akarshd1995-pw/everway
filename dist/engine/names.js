// Names for the villages and towns along the road: made up, but they sound like real country places.
// The same place always gets the same name (it comes from where the village is on the road).
const A = ['Ash', 'Brook', 'Mill', 'Thorn', 'Elm', 'Hollow', 'Stan', 'Wick', 'Brad', 'Cold', 'Long', 'Little', 'Upper', 'Nether', 'Kings', 'Shep', 'Wood', 'Marsh', 'Hart', 'Fern', 'Oak', 'Wil', 'Bur', 'Red', 'Whit', 'Hay', 'Sand', 'Stone', 'Har', 'Lang'];
const B = ['ford', 'ley', 'by', 'ton', 'well', 'combe', 'stead', 'thorpe', 'field', 'hurst', 'bury', 'mere', 'ham', 'wick', 'dale', 'cott', 'bridge', 'den', 'worth', 'holme'];
const C = ['', '', '', '', ' Green', ' Cross', ' End', ' on the Water', ' St Mary', ' Magna', ' Parva', ' Heath'];
const h = (n, k) => { let x = Math.sin(n * 12.9898 + k * 78.233) * 43758.5453; return x - Math.floor(x); };
export function placeName(s) {
  const n = Math.round(s / 10);
  let a = A[Math.floor(h(n, 1) * A.length)], b = B[Math.floor(h(n, 2) * B.length)];
  if (a === 'Little' || a === 'Upper' || a === 'Nether' || a === 'Long') { const a2 = A[Math.floor(h(n, 4) * A.length)].replace(/^(Little|Upper|Nether|Long)$/, 'Ash'); return `${a} ${a2}${b}`; }
  if (a.endsWith(b[0])) b = b.slice(1);
  return a + b + C[Math.floor(h(n, 3) * C.length)];
}
