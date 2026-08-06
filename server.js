/**
 * Servidor de desarrollo (y de VPS, si lo querés dinámico).
 *
 * Sirve exactamente las mismas rutas que produce el build estático de GitHub
 * Pages —`api/ahora.json`, `api/estacion/<id>.json`, etc.— así lo que ves acá
 * es lo que se publica allá. La diferencia es que este consulta a INUMET en
 * vivo y el build congela una foto.
 */

import http from 'node:http';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ahora, pronostico, avisos, estacion } from './lib/inumet.js';

const RAIZ = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.join(RAIZ, 'public');
const PORT = Number(process.env.PORT) || 8080;

const rutas = {
  'api/ahora.json': () => ahora(),
  'api/pronostico.json': () => pronostico(),
  'api/avisos.json': () => avisos(),
};

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
};

function responderJson(res, datos, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Cache-Control': 'public, max-age=120',
  });
  res.end(JSON.stringify(datos));
}

async function servirEstatico(req, res, rel) {
  const destino = path.join(PUBLIC_DIR, rel);
  if (!destino.startsWith(PUBLIC_DIR)) { res.writeHead(403).end('403'); return; }

  try {
    const st = await fsp.stat(destino);
    // Revalidación por ETag: el navegador nunca se queda con un app.js viejo
    // después de un deploy, pero tampoco lo re-descarga si no cambió.
    const etag = `W/"${st.size.toString(16)}-${st.mtimeMs.toString(36)}"`;

    if (req.headers['if-none-match'] === etag) {
      res.writeHead(304, { ETag: etag, 'Cache-Control': 'no-cache' }).end();
      return;
    }

    res.writeHead(200, {
      'Content-Type': MIME[path.extname(destino)] ?? 'application/octet-stream',
      'Cache-Control': 'no-cache',
      ETag: etag,
    });
    res.end(await fsp.readFile(destino));
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' }).end('404');
  }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const rel = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '');

  try {
    if (rutas[rel]) return responderJson(res, await rutas[rel]());

    const m = rel.match(/^api\/estacion\/(\d+)\.json$/);
    if (m) {
      const datos = await estacion(m[1]);
      return datos
        ? responderJson(res, datos)
        : responderJson(res, { error: `estación ${m[1]} no encontrada` }, 404);
    }
  } catch (err) {
    console.error(`[${rel}]`, err.message);
    return responderJson(res, { error: 'no se pudo obtener el dato de INUMET', detalle: err.message }, 502);
  }

  await servirEstatico(req, res, rel);
});

server.listen(PORT, () => console.log(`clima-uy escuchando en http://localhost:${PORT}`));
