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

await sellarEstaticos();

/**
 * Cache-busting por contenido.
 *
 * GitHub Pages sirve todo con `max-age=600` y no deja tocar cabeceras, así que
 * después de publicar el navegador puede seguir mostrando la versión anterior
 * hasta diez minutos —y una pestaña ya abierta, indefinidamente—. Pasó: tras un
 * deploy solo se veía el archivo nuevo, porque era el único que no estaba en la
 * caché.
 *
 * La solución es que la URL cambie cuando cambia el archivo. Se le cuelga un
 * hash del contenido a cada referencia; si el archivo no cambió, la URL tampoco
 * y la caché sigue sirviendo. Hay que reescribir también los `import` dentro de
 * app.js: se resuelven contra su propia URL, y sin sello quedarían apuntando al
 * cielo.js viejo aunque app.js sí se hubiera renovado.
 */
async function sellarEstaticos() {
  const { createHash } = await import('node:crypto');
  const sello = (txt) => createHash('sha1').update(txt).digest('hex').slice(0, 8);
  const leer = (f) => fs.readFile(path.join(DIST, f), 'utf8');
  const guardar = (f, txt) => fs.writeFile(path.join(DIST, f), txt);

  // Primero las hojas del árbol de imports, para que su hash ya esté fijo
  // cuando se calcule el de app.js.
  const vCielo = sello(await leer('cielo.js'));
  const vPruebas = sello(await leer('pruebas.js'));

  let app = await leer('app.js');
  app = app.replace("'./cielo.js'", `'./cielo.js?v=${vCielo}'`)
           .replace("'./pruebas.js'", `'./pruebas.js?v=${vPruebas}'`);
  await guardar('app.js', app);

  const vApp = sello(app);
  const vCss = sello(await leer('styles.css'));

  let html = await leer('index.html');
  html = html.replace('href="styles.css"', `href="styles.css?v=${vCss}"`)
             .replace('src="app.js"', `src="app.js?v=${vApp}"`);
  await guardar('index.html', html);

  console.log(`sellos: css=${vCss} app=${vApp} cielo=${vCielo} pruebas=${vPruebas}`);
}

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
