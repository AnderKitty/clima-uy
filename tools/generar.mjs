/**
 * Build estático para GitHub Pages.
 *
 * Pages no corre código: no hay servidor que pueda consultar a INUMET cuando
 * alguien abre la web, y el navegador tampoco puede hacerlo por su cuenta
 * porque INUMET no manda cabeceras CORS. La salida es hacer el scraping *acá*,
 * en CI, y publicar el resultado como archivos JSON estáticos junto al sitio.
 *
 *   node tools/generar.mjs [dist]
 *
 * Lo dispara .github/workflows/pages.yml cada 30 minutos.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ahora, pronostico, avisos, estacion } from '../lib/inumet.js';

const RAIZ = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const DIST = path.resolve(process.argv[2] ?? path.join(RAIZ, 'dist'));

const escribir = async (rel, datos) => {
  const destino = path.join(DIST, rel);
  await fs.mkdir(path.dirname(destino), { recursive: true });
  await fs.writeFile(destino, JSON.stringify(datos));
  return (await fs.stat(destino)).size;
};

const kb = (n) => `${(n / 1024).toFixed(1)} KB`;

console.log(`generando en ${DIST}`);

await fs.rm(DIST, { recursive: true, force: true });
await fs.cp(path.join(RAIZ, 'public'), DIST, { recursive: true });

const [datosAhora, datosPron, datosAvisos, todas] = await Promise.all([
  ahora(),
  pronostico().catch((e) => { console.warn('pronóstico falló:', e.message); return null; }),
  avisos().catch((e) => { console.warn('avisos falló:', e.message); return null; }),
  estacion(),
]);

// Sello de generación: sin servidor, es la única forma de que la página sepa
// (y muestre) qué tan vieja es la foto que está mirando.
const generado = new Date().toISOString();

let total = 0;
total += await escribir('api/ahora.json', { ...datosAhora, generado });
total += await escribir('api/pronostico.json', { ...(datosPron ?? {}), generado });
total += await escribir('api/avisos.json', { ...(datosAvisos ?? { avisos: [], advertencias: [] }), generado });

// Una serie por estación: la web solo baja la que elegís, no las 84.
const conDatos = todas.filter((e) => e.estacion.temp !== null);
for (const e of conDatos) total += await escribir(`api/estacion/${e.estacion.id}.json`, { ...e, generado });

console.log(`estaciones: ${conDatos.length}`);
console.log(`avisos: ${(datosAvisos?.advertencias?.length ?? 0) + (datosAvisos?.avisos?.length ?? 0)}`);
console.log(`json: ${kb(total)} en ${conDatos.length + 3} archivos`);
console.log(`generado: ${generado}`);
