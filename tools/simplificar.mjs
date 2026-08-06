// Reduce el GeoJSON de departamentos a algo que pese poco en el navegador:
// Douglas-Peucker + 3 decimales (~110 m) + descarte de islas minúsculas.
//
//   curl -sL "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/\
//   gbOpen/URY/ADM1/geoBoundaries-URY-ADM1_simplified.geojson" -o ury.geojson
//   node tools/simplificar.mjs ury.geojson public/uruguay.json
//
// Fuente: geoBoundaries gbOpen (CC BY 4.0), derivado de OpenStreetMap.
import fs from 'node:fs';

const ENTRADA = process.argv[2] ?? 'ury.geojson';
const SALIDA = process.argv[3] ?? 'public/uruguay.json';
const EPS = Number(process.argv[4] ?? 0.008);   // grados (~0.9 km)
const MIN_AREA = Number(process.argv[5] ?? 0.0006);

const gj = JSON.parse(fs.readFileSync(ENTRADA, 'utf8'));

const distPerp = ([px, py], [ax, ay], [bx, by]) => {
  const dx = bx - ax, dy = by - ay;
  if (dx === 0 && dy === 0) return Math.hypot(px - ax, py - ay);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
};

function rdp(pts, eps) {
  if (pts.length < 3) return pts;
  let iMax = 0, dMax = 0;
  for (let i = 1; i < pts.length - 1; i++) {
    const d = distPerp(pts[i], pts[0], pts[pts.length - 1]);
    if (d > dMax) { dMax = d; iMax = i; }
  }
  if (dMax <= eps) return [pts[0], pts[pts.length - 1]];
  return [...rdp(pts.slice(0, iMax + 1), eps).slice(0, -1), ...rdp(pts.slice(iMax), eps)];
}

const areaAnillo = (r) => {
  let a = 0;
  for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += r[j][0] * r[i][1] - r[i][0] * r[j][1];
  return Math.abs(a / 2);
};

const red = (v) => Math.round(v * 1000) / 1000;

const limpiarAnillo = (anillo) => {
  const s = rdp(anillo, EPS).map(([x, y]) => [red(x), red(y)]);
  // quitar puntos repetidos tras el redondeo
  const out = s.filter((p, i) => i === 0 || p[0] !== s[i - 1][0] || p[1] !== s[i - 1][1]);
  if (out.length && (out[0][0] !== out.at(-1)[0] || out[0][1] !== out.at(-1)[1])) out.push(out[0]);
  return out.length >= 4 ? out : null;
};

const salida = { type: 'FeatureCollection', features: [] };
let antes = 0, despues = 0;

for (const f of gj.features) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  const nuevos = [];
  for (const poly of polys) {
    const anillos = [];
    for (const [k, anillo] of poly.entries()) {
      antes += anillo.length;
      if (areaAnillo(anillo) < MIN_AREA) continue;      // isla o hueco irrelevante
      const s = limpiarAnillo(anillo);
      if (!s) continue;
      despues += s.length;
      anillos.push(s);
      if (k === 0 && anillos.length === 0) break;
    }
    if (anillos.length) nuevos.push(anillos);
  }
  if (!nuevos.length) { console.warn('descartado:', f.properties.shapeName); continue; }
  salida.features.push({
    type: 'Feature',
    properties: { nombre: f.properties.shapeName, iso: f.properties.shapeISO },
    geometry: nuevos.length === 1
      ? { type: 'Polygon', coordinates: nuevos[0] }
      : { type: 'MultiPolygon', coordinates: nuevos },
  });
}

fs.writeFileSync(SALIDA, JSON.stringify(salida));
const kb = (n) => (n / 1024).toFixed(1) + ' KB';
console.log(`departamentos: ${salida.features.length}`);
console.log(`puntos: ${antes} → ${despues}`);
console.log(`peso: ${kb(fs.statSync(ENTRADA).size)} → ${kb(fs.statSync(SALIDA).size)}`);
