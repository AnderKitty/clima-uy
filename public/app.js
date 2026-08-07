// Pampero — toda la UI. Sin dependencias: fetch + SVG a mano.

import { aplicarCielo } from './cielo.js';

const $ = (sel, raiz = document) => raiz.querySelector(sel);
const NS = 'http://www.w3.org/2000/svg';

const estado = {
  estaciones: [],
  seleccionada: null,
  pronostico: null,
  serie: null,
  geo: null,
};

// ---------------------------------------------------------------------------
// Iconos: un set propio en SVG. No usamos los sprites de INUMET.
// ---------------------------------------------------------------------------

// Los degradados van en un <defs> único al principio del documento: repetirlos
// por icono multiplicaría el markup (hay 8 iconos por pantalla) y los ids
// duplicados se pisan igual.
const DEFS_ICONOS = `
<svg width="0" height="0" style="position:absolute" aria-hidden="true"><defs>
  <radialGradient id="g-sol" cx="35%" cy="32%" r="72%">
    <stop offset="0%" stop-color="#ffe27a"/>
    <stop offset="55%" stop-color="#fbbf24"/>
    <stop offset="100%" stop-color="#f59e0b"/>
  </radialGradient>
  <linearGradient id="g-nube" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#ffffff"/>
    <stop offset="55%" stop-color="#e8eef8"/>
    <stop offset="100%" stop-color="#cbd7e8"/>
  </linearGradient>
  <linearGradient id="g-nube-gris" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#c8d0dc"/>
    <stop offset="55%" stop-color="#aab4c4"/>
    <stop offset="100%" stop-color="#8f9aab"/>
  </linearGradient>
  <linearGradient id="g-nube-tormenta" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#9aa3b2"/>
    <stop offset="55%" stop-color="#78828f"/>
    <stop offset="100%" stop-color="#5b6472"/>
  </linearGradient>
  <linearGradient id="g-gota" x1="0" y1="0" x2="0" y2="1">
    <stop offset="0%" stop-color="#7cb8f5"/>
    <stop offset="100%" stop-color="#2a78d6"/>
  </linearGradient>
  <radialGradient id="g-luna" cx="38%" cy="34%" r="70%">
    <stop offset="0%" stop-color="#f4f7ff"/>
    <stop offset="100%" stop-color="#c9d6ee"/>
  </radialGradient>
</defs></svg>`;

/** Sol: núcleo con degradado y rayos afinados en las puntas. */
const SOL = (cx = 32, cy = 30, r = 11) => {
  const rayos = Array.from({ length: 8 }, (_, i) => {
    const a = (i * 45) * Math.PI / 180;
    const [x1, y1] = [cx + Math.cos(a) * (r + 4.5), cy + Math.sin(a) * (r + 4.5)];
    const [x2, y2] = [cx + Math.cos(a) * (r + 9.5), cy + Math.sin(a) * (r + 9.5)];
    return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)}L${x2.toFixed(1)} ${y2.toFixed(1)}"/>`;
  }).join('');
  return `<g stroke="#fbbf24" stroke-width="3.2" stroke-linecap="round" opacity=".92">${rayos}</g>` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="url(#g-sol)"/>` +
    `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#f59e0b" stroke-width=".8" opacity=".45"/>`;
};

/** Nube de varios lóbulos, con base plana y un realce arriba a la izquierda. */
const NUBE = (x = 0, y = 0, grad = 'g-nube', s = 1) => `
  <g transform="translate(${x} ${y})${s !== 1 ? ` scale(${s})` : ''}">
    <path fill="url(#${grad})" d="M17.5 45.5h29a10.5 10.5 0 0 0 1.2-20.9 15 15 0 0 0-28.3-4.2A11.2 11.2 0 0 0 17.5 45.5Z"/>
    <path fill="#fff" opacity=".38" d="M22.5 25.9a15 15 0 0 1 17-8.2 15 15 0 0 0-19.1 11.5 11.4 11.4 0 0 1 2.1-3.3Z"/>
  </g>`;

const GOTAS = (ys) => `<g fill="url(#g-gota)">${ys.map(([x, y, h]) =>
  `<path d="M${x} ${y}c2.6 3.4 3.9 5.5 3.9 7a3.9 3.9 0 0 1-7.8 0c0-1.5 1.3-3.6 3.9-7Z" transform="translate(0 ${h})"/>`
).join('')}</g>`;

const ICONOS = {
  despejado: `<svg viewBox="0 0 64 64" role="img" aria-label="Despejado">${SOL(32, 32, 13)}</svg>`,

  nuboso: `<svg viewBox="0 0 64 64" role="img" aria-label="Parcialmente nuboso">
    ${SOL(41, 21, 9)}${NUBE(-2, 6)}</svg>`,

  cubierto: `<svg viewBox="0 0 64 64" role="img" aria-label="Cubierto">
    ${NUBE(6, -6, 'g-nube-gris', .82)}${NUBE(-3, 5)}</svg>`,

  lluvia: `<svg viewBox="0 0 64 64" role="img" aria-label="Lluvia">
    ${NUBE(-1, -4)}${GOTAS([[23, 47, 0], [32, 47, 4], [41, 47, 0]])}</svg>`,

  tormenta: `<svg viewBox="0 0 64 64" role="img" aria-label="Tormenta">
    ${NUBE(-1, -7, 'g-nube-tormenta')}
    <path d="M35.5 38.5 24 54h7.2l-3 10 13.3-17.4h-7.4l4.4-8.1Z" fill="#fbbf24" stroke="#f59e0b" stroke-width=".8" stroke-linejoin="round"/>
    ${GOTAS([[20, 44, 0], [46, 44, 0]])}</svg>`,

  niebla: `<svg viewBox="0 0 64 64" role="img" aria-label="Niebla">
    ${NUBE(-1, -11, 'g-nube-gris')}
    <g stroke="#9aa3b2" stroke-width="3.2" stroke-linecap="round" opacity=".85">
      <path d="M14 44h36"/><path d="M19 52h30" opacity=".75"/><path d="M14 60h25" opacity=".5"/>
    </g></svg>`,

  noche: `<svg viewBox="0 0 64 64" role="img" aria-label="Despejado de noche">
    <path fill="url(#g-luna)" d="M40.5 12a20 20 0 1 0 11.2 26.9A16 16 0 0 1 40.5 12Z"/>
    <g fill="#b7c6e2" opacity=".55">
      <circle cx="27" cy="30" r="3.2"/><circle cx="35" cy="41" r="2.1"/><circle cx="23" cy="41" r="1.5"/>
    </g></svg>`,
};

const icono = (nombre) => ICONOS[nombre] ?? ICONOS.nuboso;

/** INUMET solo detalla los primeros 3 días; para el resto hay que rotular a
 *  partir del código de estado, que es lo único que manda. */
const ETIQUETA_ICONO = {
  despejado: 'Despejado', noche: 'Despejado', nuboso: 'Algo nuboso',
  cubierto: 'Cubierto', lluvia: 'Precipitaciones', tormenta: 'Tormentas',
  niebla: 'Nieblas',
};

// ---------------------------------------------------------------------------
// Formato
// ---------------------------------------------------------------------------

const nDia = new Intl.DateTimeFormat('es-UY', { weekday: 'short', timeZone: 'America/Montevideo' });
const nFecha = new Intl.DateTimeFormat('es-UY', { day: 'numeric', month: 'short', timeZone: 'America/Montevideo' });
const nHora = new Intl.DateTimeFormat('es-UY', { hour: '2-digit', minute: '2-digit', hour12: false, timeZone: 'America/Montevideo' });
const nCompleto = new Intl.DateTimeFormat('es-UY', {
  weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit',
  hour12: false, timeZone: 'America/Montevideo',
});

const capital = (s) => (s ? s.charAt(0).toUpperCase() + s.slice(1) : s);
const redondo = (v, d = 0) => (v === null || v === undefined ? null : Number(v).toFixed(d));

// ---------------------------------------------------------------------------
// Arranque
// ---------------------------------------------------------------------------

/**
 * De dónde salen los datos.
 *
 * Por defecto, mismo origen: el build de CI deja los JSON junto al sitio, así
 * que Pages se sirve solo. El meta `clima-api` permite apuntar a un servidor
 * propio en otro origen —hubo uno en un VPS— por si alguna vez el scraping
 * tiene que volver a correr fuera de CI; en local `server.js` sirve las dos
 * cosas y no hace falta tocar nada.
 */
const API = (() => {
  if (['localhost', '127.0.0.1', ''].includes(location.hostname)) return '';
  const meta = document.querySelector('meta[name="clima-api"]')?.content?.trim();
  return meta ? meta.replace(/\/+$/, '') + '/' : '';
})();

async function json(ruta) {
  const url = ruta.startsWith('uruguay.json') ? ruta : API + ruta;   // el mapa viaja con la web

  // Con timeout a propósito: `fetch` no trae uno, así que una conexión colgada
  // (DNS viejo apuntando a una IP muerta, por ejemplo) deja la promesa sin
  // resolver para siempre y la página se queda en "Cargando…" sin decir nada.
  let r;
  try {
    r = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  } catch (err) {
    const motivo = err.name === 'TimeoutError'
      ? 'no respondió en 15 s'
      : 'no se pudo conectar';
    throw new Error(`${url} ${motivo}`, { cause: err });
  }
  if (!r.ok) throw new Error(`${url} → HTTP ${r.status}`);
  return r.json();
}

/**
 * Panel de pruebas: en local siempre, y en cualquier lado con `?pruebas` en la
 * URL —útil para mirar el sitio ya publicado en un teléfono de verdad, donde
 * el blur y las animaciones se comportan distinto que en el escritorio.
 */
function modoPruebas() {
  return ['localhost', '127.0.0.1', ''].includes(location.hostname)
    || new URLSearchParams(location.search).has('pruebas');
}

async function iniciar() {
  aplicarTema(localStorage.getItem('tema'));
  $('#tema').addEventListener('click', alternarTema);

  try {
    const [ahora, pron, avisos, geo] = await Promise.all([
      json('api/ahora.json'),
      json('api/pronostico.json').catch(() => null),
      json('api/avisos.json').catch(() => null),
      json('uruguay.json').catch(() => null),
    ]);

    estado.estaciones = ahora.estaciones;
    estado.pronostico = pron;
    estado.geo = geo;
    estado.avisos = avisos;

    if (!estado.estaciones.length) throw new Error('INUMET no devolvió estaciones con datos');

    document.body.insertAdjacentHTML('afterbegin', DEFS_ICONOS);
    $('#app').replaceChildren($('#tpl-contenido').content.cloneNode(true));

    llenarSelector();
    pintarAvisos(avisos);
    pintarMapa(ahora.estaciones.filter((e) => e.pais === 'UY'));

    $('#pie-actualizado').textContent = ahora.actualizado
      ? `Observación de las ${nHora.format(new Date(ahora.actualizado))} h${ahora.rancio ? ' · dato en caché, INUMET no respondió' : ''}`
      : '';

    await elegir(estacionInicial());
    window.addEventListener('resize', redibujarGraficos, { passive: true });

    // Enganche de depuración, solo en local: permite inspeccionar el estado y
    // forzar escenarios (dos alertas superpuestas, por ejemplo) sin esperar a
    // que la realidad los produzca.
    if (modoPruebas()) {
      const api = {
        estado,
        aplicarCielo,
        refrescarCielo,
        repintarMapa: () => pintarMapa(estado.estaciones.filter((e) => e.pais === 'UY')),
        repintarAvisos: () => pintarAvisos(estado.avisos),
      };
      window.clima = api;
      // Dinámico: en producción el archivo ni se baja.
      const { montarPruebas } = await import('./pruebas.js');
      montarPruebas(api);
    }
  } catch (err) {
    const caja = nodo('div', 'error-carga');
    caja.append(nodo('p', 'error-titulo', 'No se pudieron cargar los datos'));
    caja.append(nodo('p', 'error-detalle', err.message));
    if (API) {
      caja.append(nodo('p', 'error-pista',
        `La web anda, pero la API en ${new URL(API).hostname} no contesta. ` +
        'Puede ser que tu DNS todavía tenga cacheada una dirección vieja.'));
    }
    $('#app').replaceChildren(caja);
    console.error(err);
  }
}

function estacionInicial() {
  const guardada = Number(localStorage.getItem('estacion'));
  if (estado.estaciones.some((e) => e.id === guardada)) return guardada;
  // Por defecto, Prado: es la estación urbana de Montevideo con serie más completa.
  const prado = estado.estaciones.find((e) => /^prado$/i.test(e.nombre));
  return (prado ?? estado.estaciones.find((e) => e.pais === 'UY') ?? estado.estaciones[0]).id;
}

function llenarSelector() {
  const sel = $('#estaciones');
  const porDepto = new Map();

  for (const e of estado.estaciones) {
    const clave = e.pais === 'UY' ? (e.departamento ?? 'Otras') : 'Fuera del país';
    if (!porDepto.has(clave)) porDepto.set(clave, []);
    porDepto.get(clave).push(e);
  }

  const orden = [...porDepto.keys()].sort((a, b) =>
    a === 'Fuera del país' ? 1 : b === 'Fuera del país' ? -1 : a.localeCompare(b, 'es'));

  for (const depto of orden) {
    const grupo = document.createElement('optgroup');
    grupo.label = depto;
    for (const e of porDepto.get(depto)) {
      const op = document.createElement('option');
      op.value = e.id;
      op.textContent = `${e.nombre} · ${redondo(e.temp, 0)}°`;
      grupo.append(op);
    }
    sel.append(grupo);
  }

  sel.addEventListener('change', () => elegir(Number(sel.value)));
}

async function elegir(id) {
  estado.seleccionada = estado.estaciones.find((e) => e.id === id);
  if (!estado.seleccionada) return;

  $('#estaciones').value = String(id);
  localStorage.setItem('estacion', String(id));

  pintarHero(estado.seleccionada);
  pintarPronostico(estado.seleccionada);
  refrescarCielo();

  estado.serie = null;
  redibujarGraficos();

  try {
    estado.serie = await json(`api/estacion/${id}.json`);
  } catch (err) {
    console.error(err);
  }
  redibujarGraficos();
  pintarTabla();
}

// ---------------------------------------------------------------------------
// Hero
// ---------------------------------------------------------------------------

/** El estado actual no trae código de tiempo, así que lo inferimos de lo medido. */
function iconoObservado(e) {
  if (e.lluvia1h > 0) return 'lluvia';
  if (e.visibilidad !== null && e.visibilidad < 1) return 'niebla';
  if (e.humedad !== null && e.humedad >= 97) return 'cubierto';
  if (e.humedad !== null && e.humedad >= 85) return 'nuboso';
  return esDeNoche() ? 'noche' : 'despejado';
}

/**
 * ¿Es de noche en Uruguay ahora?
 *
 * Esto —y no el tema— es lo que decide si el cielo va en su variante diurna o
 * nocturna, y si el hero muestra sol o luna. El cielo informa el tiempo: a las
 * 10 de la mañana es de día aunque la interfaz esté en negro.
 */
function esDeNoche() {
  const h = Number(nHora.format(new Date()).slice(0, 2));
  return h < 7 || h >= 19;
}

/** ¿La interfaz está en oscuro? Solo afecta colores, nunca qué muestra el cielo. */
function uiEnOscuro() {
  return document.documentElement.dataset.tema !== 'claro';
}

/** Repinta el cielo con la condición de la estación elegida. */
function refrescarCielo() {
  // El panel de pruebas fija una condición a mano; sin esto, cambiar de
  // estación la pisaría con el clima real y no se podría mirar nada.
  if (estado.cieloForzado) return;
  if (estado.seleccionada) {
    aplicarCielo(iconoObservado(estado.seleccionada), esDeNoche(), uiEnOscuro());
  }
}

function pintarHero(e) {
  $('#hero-icono').innerHTML = icono(iconoObservado(e));
  $('#hero-titulo').textContent = e.nombre;
  $('#hero-temp').textContent = redondo(e.temp, 0);

  const partes = [];
  if (e.sensacion !== null && Math.abs(e.sensacion - e.temp) >= 1) {
    partes.push(`Sensación ${redondo(e.sensacion, 0)}°`);
  }
  if (e.hora) partes.push(`medición de las ${nHora.format(new Date(e.hora))} h`);
  $('#hero-desc').textContent = capital(partes.join(' · '));

  const filas = [
    ['Humedad', e.humedad !== null ? `${redondo(e.humedad, 0)} %` : null],
    ['Viento', e.viento?.kmh != null ? `${e.viento.kmh} km/h ${e.viento.card ?? ''}`.trim() : null],
    ['Ráfagas', e.rafagaKmh != null ? `${e.rafagaKmh} km/h` : null],
    ['Punto de rocío', e.rocio !== null ? `${redondo(e.rocio, 1)} °C` : null],
    ['Presión', e.presion !== null ? `${redondo(e.presion, 1)} hPa` : null],
    ['Visibilidad', e.visibilidad !== null ? `${redondo(e.visibilidad, 1)} km` : null],
    ['Lluvia (1 h)', e.lluvia1h !== null ? `${redondo(e.lluvia1h, 1)} mm` : null],
    ['Altitud', e.altitud != null ? `${redondo(e.altitud, 0)} m` : null],
  ].filter(([, v]) => v !== null);

  $('#hero-detalle').replaceChildren(...filas.map(([k, v]) => {
    const div = document.createElement('div');
    div.innerHTML = `<dt>${k}</dt><dd>${v}</dd>`;
    return div;
  }));
}

// ---------------------------------------------------------------------------
// Gráficos
// ---------------------------------------------------------------------------

function redibujarGraficos() {
  const s = estado.serie?.series;
  const temp = (s?.TempAire ?? []).map((p) => ({ x: new Date(p.hora), y: p.valor }));
  const lluvia = (s?.precipHoraria ?? []).map((p) => ({ x: new Date(p.hora), y: p.valor }));

  graficoLinea($('#g-temp'), temp, { unidad: '°C', decimales: 1 });
  graficoBarras($('#g-lluvia'), lluvia, { unidad: 'mm' });

  $('#nota-serie').textContent = temp.length
    ? `${temp.length} mediciones horarias · ${estado.seleccionada?.nombre ?? ''}`
    : '';
}

/**
 * Estado vacío de un gráfico. Colapsa la altura reservada: muchas estaciones no
 * miden precipitación, y dejar el hueco de 110 px con una línea de texto en el
 * medio hacía un agujero enorme en el panel.
 */
function vacio(cont, texto) {
  cont.classList.add('lienzo-vacio');
  cont.replaceChildren(Object.assign(document.createElement('p'), {
    className: 'sin-datos', textContent: texto,
  }));
}

function crearSvg(w, h) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${w} ${h}`);
  svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
  return svg;
}

const el = (tag, attrs = {}) => {
  const n = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
  return n;
};

/**
 * Marcas del eje X, sobre horas redondas. El paso base es cada 12 h, pero se
 * ralea según el ancho disponible: en un teléfono las seis etiquetas de
 * "mié 12:00" no entran y se pisaban unas con otras hasta quedar ilegibles.
 */
function marcasTiempo(datos, iw) {
  const candidatos = [];
  let ultima = -Infinity;
  datos.forEach((d, i) => {
    const h = Number(nHora.format(d.x).slice(0, 2));
    if (h % 12 === 0 && i - ultima >= 6) { candidatos.push(i); ultima = i; }
  });

  const caben = Math.max(2, Math.floor(iw / 64));   // ~64 px por etiqueta
  if (candidatos.length <= caben) return candidatos;

  const salto = Math.ceil(candidatos.length / caben);
  return candidatos.filter((_, k) => k % salto === 0);
}

function graficoLinea(cont, datos, { unidad, decimales }) {
  if (!datos.length) return vacio(cont, estado.serie ? 'Esta estación no reporta temperatura.' : 'Cargando…');
  cont.classList.remove('lienzo-vacio');

  const w = Math.max(cont.clientWidth || 640, 320);
  const h = cont.clientHeight || 190;
  const m = { t: 16, r: 40, b: 22, l: 34 };
  const iw = w - m.l - m.r;
  const ih = h - m.t - m.b;

  const ys = datos.map((d) => d.y);
  let min = Math.min(...ys), max = Math.max(...ys);
  const pad = Math.max((max - min) * 0.15, 0.5);
  min -= pad; max += pad;

  const X = (i) => m.l + (i / (datos.length - 1 || 1)) * iw;
  const Y = (v) => m.t + ih - ((v - min) / (max - min || 1)) * ih;

  const svg = crearSvg(w, h);

  const defs = el('defs');
  const grad = el('linearGradient', { id: 'degradado-temp', x1: 0, y1: 0, x2: 0, y2: 1 });
  grad.append(
    el('stop', { offset: '0%', 'stop-color': 'var(--serie-1)', 'stop-opacity': '.22' }),
    el('stop', { offset: '100%', 'stop-color': 'var(--serie-1)', 'stop-opacity': '0' }),
  );
  defs.append(grad);
  svg.append(defs);

  // Rejilla horizontal recesiva + escala Y
  const pasos = 4;
  for (let k = 0; k <= pasos; k++) {
    const v = min + (k / pasos) * (max - min);
    const y = Y(v);
    svg.append(el('line', { class: 'rejilla', x1: m.l, x2: m.l + iw, y1: y, y2: y }));
    const t = el('text', { class: 'marca-txt', x: m.l - 8, y: y + 3, 'text-anchor': 'end' });
    t.textContent = v.toFixed(0);
    svg.append(t);
  }

  // Eje X con horas
  svg.append(el('line', { class: 'eje', x1: m.l, x2: m.l + iw, y1: m.t + ih, y2: m.t + ih }));
  for (const i of marcasTiempo(datos, iw)) {
    const t = el('text', { class: 'marca-txt', x: X(i), y: h - 6, 'text-anchor': 'middle' });
    t.textContent = `${nDia.format(datos[i].x).replace('.', '')} ${nHora.format(datos[i].x)}`;
    svg.append(t);
  }

  const d = datos.map((p, i) => `${i ? 'L' : 'M'}${X(i).toFixed(1)},${Y(p.y).toFixed(1)}`).join('');
  svg.append(el('path', { class: 'area-serie', d: `${d}L${X(datos.length - 1)},${m.t + ih}L${m.l},${m.t + ih}Z` }));
  svg.append(el('path', { class: 'linea-serie', d }));

  // Etiqueta directa en el último punto: una sola serie no necesita leyenda.
  const ult = datos[datos.length - 1];
  svg.append(el('circle', { class: 'punto-final', cx: X(datos.length - 1), cy: Y(ult.y), r: 4 }));
  const lbl = el('text', {
    class: 'etiqueta-final', x: X(datos.length - 1) + 9, y: Y(ult.y) + 4,
  });
  lbl.textContent = `${ult.y.toFixed(decimales)}${unidad}`;
  svg.append(lbl);

  cont.replaceChildren(svg);
  añadirCursor(cont, svg, datos, { X, Y, m, ih, unidad, decimales });
}

/** Cruz + globo: un gráfico en pantalla es interactivo por defecto. */
function añadirCursor(cont, svg, datos, { X, Y, m, ih, unidad, decimales }) {
  const linea = el('line', { class: 'cursor-linea', y1: m.t, y2: m.t + ih, opacity: 0 });
  const punto = el('circle', { class: 'cursor-punto', r: 5, opacity: 0 });
  svg.append(linea, punto);

  const globo = document.createElement('div');
  globo.className = 'globo';
  cont.append(globo);

  const zona = el('rect', {
    x: m.l, y: m.t, width: X(datos.length - 1) - m.l || 1, height: ih, fill: 'transparent',
  });
  svg.append(zona);

  const mover = (ev) => {
    const caja = svg.getBoundingClientRect();
    const escala = (svg.viewBox.baseVal.width || caja.width) / caja.width;
    const px = (ev.clientX - caja.left) * escala;
    const i = Math.max(0, Math.min(datos.length - 1,
      Math.round(((px - m.l) / (X(datos.length - 1) - m.l || 1)) * (datos.length - 1))));
    const p = datos[i];

    linea.setAttribute('x1', X(i)); linea.setAttribute('x2', X(i)); linea.setAttribute('opacity', 1);
    punto.setAttribute('cx', X(i)); punto.setAttribute('cy', Y(p.y)); punto.setAttribute('opacity', 1);

    globo.innerHTML =
      `<span class="globo-hora">${capital(nDia.format(p.x).replace('.', ''))} ${nHora.format(p.x)} h</span>` +
      `<strong>${p.y.toFixed(decimales)} ${unidad}</strong>`;
    globo.style.left = `${(X(i) / (svg.viewBox.baseVal.width || 1)) * 100}%`;
    globo.style.top = `${(Y(p.y) / (svg.viewBox.baseVal.height || 1)) * 100}%`;
    globo.style.opacity = 1;
  };

  const salir = () => {
    linea.setAttribute('opacity', 0);
    punto.setAttribute('opacity', 0);
    globo.style.opacity = 0;
  };

  svg.addEventListener('pointermove', mover);
  svg.addEventListener('pointerleave', salir);
}

function graficoBarras(cont, datos, { unidad }) {
  if (!datos.length) {
    return vacio(cont, estado.serie ? 'Esta estación no mide precipitación.' : 'Cargando…');
  }
  cont.classList.remove('lienzo-vacio');

  const w = Math.max(cont.clientWidth || 640, 320);
  const h = cont.clientHeight || 110;
  const m = { t: 12, r: 40, b: 20, l: 34 };
  const iw = w - m.l - m.r;
  const ih = h - m.t - m.b;

  const max = Math.max(...datos.map((d) => d.y), 1);
  const paso = iw / datos.length;
  const ancho = Math.max(paso - 2, 1);            // 2px de aire entre barras
  const X = (i) => m.l + i * paso + 1;
  const Y = (v) => m.t + ih - (v / max) * ih;

  const svg = crearSvg(w, h);

  for (const k of [0, 0.5, 1]) {
    const y = m.t + ih - k * ih;
    svg.append(el('line', { class: k === 0 ? 'eje' : 'rejilla', x1: m.l, x2: m.l + iw, y1: y, y2: y }));
    const t = el('text', { class: 'marca-txt', x: m.l - 8, y: y + 3, 'text-anchor': 'end' });
    t.textContent = (max * k).toFixed(max < 5 ? 1 : 0);
    svg.append(t);
  }

  // Mismo rótulo que el gráfico de temperatura: van apilados y se leen juntos.
  for (const i of marcasTiempo(datos, iw)) {
    const t = el('text', { class: 'marca-txt', x: X(i) + ancho / 2, y: h - 5, 'text-anchor': 'middle' });
    t.textContent = `${nDia.format(datos[i].x).replace('.', '')} ${nHora.format(datos[i].x)}`;
    svg.append(t);
  }

  datos.forEach((p, i) => {
    if (!p.y) return;
    const alto = Math.max(m.t + ih - Y(p.y), 2);
    svg.append(el('rect', {
      class: 'barra-lluvia', x: X(i), y: m.t + ih - alto, width: ancho, height: alto, rx: 2,
    }));
    const zona = el('rect', { x: X(i) - 2, y: m.t, width: ancho + 4, height: ih, fill: 'transparent' });
    zona.append(Object.assign(document.createElementNS(NS, 'title'), {
      textContent: `${nHora.format(p.x)} h — ${p.y.toFixed(1)} ${unidad}`,
    }));
    svg.append(zona);
  });

  const total = datos.reduce((a, p) => a + (p.y || 0), 0);
  if (total > 0) {
    const t = el('text', { class: 'etiqueta-final', x: m.l + iw + 6, y: m.t + 10 });
    t.textContent = `${total.toFixed(1)} ${unidad}`;
    svg.append(t);
  }

  cont.replaceChildren(svg);
}

function pintarTabla() {
  const s = estado.serie;
  if (!s) return;

  const cols = ['TempAire', 'HumRelativa', 'IntViento', 'PresAtmMar', 'precipHoraria'];
  const etiquetas = { TempAire: 'Temp.', HumRelativa: 'Hum.', IntViento: 'Viento', PresAtmMar: 'Presión', precipHoraria: 'Lluvia' };

  const horas = [...new Set(cols.flatMap((c) => (s.series[c] ?? []).map((p) => p.hora)))].sort().reverse();
  const mapas = Object.fromEntries(cols.map((c) => [c, new Map((s.series[c] ?? []).map((p) => [p.hora, p.valor]))]));

  const thead = document.createElement('thead');
  const filaCab = document.createElement('tr');
  filaCab.append(nodo('th', null, 'Hora'));
  for (const c of cols) filaCab.append(nodo('th', null, `${etiquetas[c]} ${s.unidades[c] ?? ''}`.trim()));
  thead.append(filaCab);

  const tbody = document.createElement('tbody');
  for (const hora of horas.slice(0, 200)) {
    const f = document.createElement('tr');
    const d = new Date(hora);
    f.append(nodo('td', null, `${capital(nDia.format(d).replace('.', ''))} ${nHora.format(d)}`));
    for (const c of cols) {
      const v = mapas[c].get(hora);
      f.append(nodo('td', null, v === undefined || v === null ? '—' : String(v)));
    }
    tbody.append(f);
  }

  $('#tabla-serie').replaceChildren(thead, tbody);
}

// ---------------------------------------------------------------------------
// Pronóstico
// ---------------------------------------------------------------------------

function pintarPronostico(est) {
  const p = estado.pronostico;
  const cont = $('#dias');
  if (!p?.zonas?.length) { cont.innerHTML = '<p class="sin-datos">Pronóstico no disponible.</p>'; return; }

  const zona = p.zonas.find((z) => z.id === est.zonaId) ?? p.zonas[0];
  const hoy = new Date().toISOString().slice(0, 10);

  $('#nota-pron').textContent =
    `${zona.nombre}${p.publicado ? ` · emitido ${p.publicado}` : ''}${p.pronosticador ? ` · ${p.pronosticador}` : ''}`;

  cont.replaceChildren(...zona.dias.map((d) => {
    const fecha = new Date(`${d.fecha}T12:00:00-03:00`);
    const art = document.createElement('article');
    art.className = `dia${d.fecha === hoy ? ' dia-hoy' : ''}`;

    art.append(nodo('p', 'dia-nombre', d.fecha === hoy ? 'Hoy' : capital(nDia.format(fecha).replace('.', ''))));
    art.append(nodo('p', 'dia-fecha', nFecha.format(fecha)));

    const ico = nodo('div', 'dia-icono');
    ico.innerHTML = icono(d.icono);          // set propio, no viene del origen
    art.append(ico);

    const temps = nodo('p', 'dia-temps');
    temps.append(nodo('span', 'dia-max', `${d.tempMax ?? '—'}°`), document.createTextNode(' '),
                 nodo('span', 'dia-min', `${d.tempMin ?? '—'}°`));
    art.append(temps);

    const detalle = [d.periodos[0]?.descripcion, d.periodos[0]?.evolucion].filter(Boolean).join(' ');
    art.append(detalle
      ? nodo('p', 'dia-desc', detalle)
      // Sin detalle: rotulamos con el código de estado en vez de dejar el
      // hueco, que parecía la tarjeta rota.
      : nodo('p', 'dia-desc dia-desc-breve', ETIQUETA_ICONO[d.icono] ?? '—'));

    art.title = d.periodos
      .map((pe) => `${pe.periodo}: ${[pe.descripcion, pe.evolucion, pe.extra].filter(Boolean).join(' ')}\nViento: ${pe.vientos}`)
      .join('\n\n');
    return art;
  }));
}

// ---------------------------------------------------------------------------
// Avisos
// ---------------------------------------------------------------------------

/** Crea un elemento con texto plano: lo de INUMET nunca entra como HTML. */
function nodo(tag, clase, texto) {
  const n = document.createElement(tag);
  if (clase) n.className = clase;
  if (texto != null) n.textContent = texto;
  return n;
}

function pintarAvisos(datos) {
  const cont = $('#avisos');
  const items = [...(datos?.advertencias ?? []), ...(datos?.avisos ?? [])];
  // Vaciar de verdad al no haber nada: si INUMET da de baja una advertencia y
  // se repinta, el banner viejo se quedaba en pantalla anunciando una alerta
  // que ya no existe.
  if (!items.length) { cont.replaceChildren(); cont.hidden = true; return; }

  cont.hidden = false;
  cont.replaceChildren(...items.map((a) => {
    // El nivel sale de riesgoFenomeno y el color es el mismo que usa INUMET.
    const div = nodo('div', `aviso aviso-${a.nombre ?? 'amarilla'}`);
    if (a.color) div.style.setProperty('--tono', a.color);
    div.append(Object.assign(nodo('span', 'aviso-icono', '⚠'), { ariaHidden: 'true' }));

    const cuerpo = nodo('div', 'aviso-cuerpo');
    const titulo = a.nombre ? `Alerta ${a.nombre}` : (a.tipo === 'aviso' ? 'Aviso' : 'Advertencia');
    cuerpo.append(nodo('p', 'aviso-titulo', `${titulo}${a.fenomeno ? ` · ${a.fenomeno}` : ''}`));

    if (a.fenomenos?.length || a.probabilidad) {
      const meta = [
        a.fenomenos?.length ? a.fenomenos.map((f) => f.tipo).join(' y ') : null,
        a.probabilidad ? `probabilidad ${a.probabilidad}` : null,
      ].filter(Boolean).join(' · ');
      cuerpo.append(nodo('p', 'aviso-meta', capital(meta)));
    }

    if (a.descripcion) {
      // El texto trae saltos de línea reales; los respetamos sin inyectar HTML.
      const p = nodo('p', 'aviso-texto');
      p.style.whiteSpace = 'pre-line';
      p.textContent = a.descripcion;
      cuerpo.append(p);
    }

    const cuando = [a.comienzo && `desde ${a.comienzo}`, a.finalizacion && `hasta ${a.finalizacion}`]
      .filter(Boolean).join(' · ');
    if (cuando) cuerpo.append(nodo('p', 'aviso-meta', cuando));

    if (a.zonas?.length) {
      const det = document.createElement('details');
      det.className = 'aviso-zonas';
      det.append(nodo('summary', null,
        `Zonas afectadas (${a.zonas.length} ${a.zonas.length === 1 ? 'departamento' : 'departamentos'})`));
      const ul = document.createElement('ul');
      for (const z of a.zonas) {
        const li = document.createElement('li');
        li.append(nodo('strong', null, z.departamento));
        if (z.localidades) li.append(document.createTextNode(` — ${z.localidades}`));
        ul.append(li);
      }
      det.append(ul);
      cuerpo.append(det);
    }

    div.append(cuerpo);
    return div;
  }));
}

// ---------------------------------------------------------------------------
// Mapa de puntos: temperatura como escala divergente frío↔calor.
// ---------------------------------------------------------------------------

const RAMPA_FRIA = ['#104281', '#1c5cab', '#2a78d6', '#5598e7', '#9ec5f4'];
const RAMPA_CALIDA = ['#f5c6ad', '#ec835a', '#e0603a', '#c9382a', '#a3241c'];
const NEUTRO = '#c3c2b7';

function colorTemp(v, medio, rango) {
  const d = (v - medio) / (rango || 1);
  if (Math.abs(d) < 0.12) return NEUTRO;
  const rampa = d < 0 ? RAMPA_FRIA : RAMPA_CALIDA;
  const k = Math.min(rampa.length - 1, Math.floor(Math.abs(d) * rampa.length));
  return d < 0 ? rampa[rampa.length - 1 - k] : rampa[k];
}

function pintarMapa(estaciones) {
  const pts = estaciones.filter((e) => e.lat && e.lon && e.temp !== null);
  const cont = $('#mapa');
  if (pts.length < 3) { cont.innerHTML = '<p class="sin-datos">Sin datos para el mapa.</p>'; return; }

  // Bbox del país (no de las estaciones): así el contorno entra completo y
  // el norte de Artigas no queda cortado aunque no haya estación ahí.
  const B = { loMin: -58.50, loMax: -53.18, laMin: -35.00, laMax: -30.08 };
  const pad = 26;

  // Equirectangular con corrección por latitud: sin el cos(φ) el país sale
  // estirado a lo ancho.
  const kx = Math.cos(((B.laMin + B.laMax) / 2) * Math.PI / 180);
  const anchoGeo = (B.loMax - B.loMin) * kx;
  const altoGeo = B.laMax - B.laMin;

  const W = 640;
  const escala = (W - 2 * pad) / anchoGeo;
  const H = Math.round(altoGeo * escala + 2 * pad);

  const X = (lon) => pad + (lon - B.loMin) * kx * escala;
  const Y = (lat) => pad + (B.laMax - lat) * escala;

  const temps = pts.map((p) => p.temp).sort((a, b) => a - b);
  const medio = temps[Math.floor(temps.length / 2)];
  const rango = Math.max(temps[temps.length - 1] - medio, medio - temps[0], 1);

  const R = 12;
  const puestos = pts.map((p) => ({ ...p, px: X(p.lon), py: Y(p.lat) }));
  separar(puestos, R);

  const svg = crearSvg(W, H + 44);
  svg.append(capaDepartamentos(X, Y));
  svg.append(capaAlertas(X, Y));

  // Los más extremos arriba: si algo se tapa, que quede visible lo que llama la atención.
  for (const p of puestos.sort((a, b) => Math.abs(a.temp - medio) - Math.abs(b.temp - medio))) {
    const g = el('g');
    g.append(el('circle', {
      class: 'mapa-punto', cx: p.px, cy: p.py, r: R, fill: colorTemp(p.temp, medio, rango),
    }));
    const titulo = el('title');
    titulo.textContent = `${p.nombre} — ${p.temp} °C`;
    g.append(titulo);
    const t = el('text', {
      class: 'mapa-etiqueta', x: p.px, y: p.py + 3, 'text-anchor': 'middle',
      fill: Math.abs((p.temp - medio) / rango) > 0.45 ? '#fff' : 'var(--tinta)',
    });
    t.textContent = Math.round(p.temp);
    g.append(t);
    svg.append(g);
  }

  const leyAlertas = leyendaAlertas(W, H + 14);
  if (leyAlertas) {
    svg.append(leyAlertas);
    svg.append(leyendaTemp(temps[0], medio, temps[temps.length - 1], rango, W, H + 44));
    svg.setAttribute('viewBox', `0 0 ${W} ${H + 74}`);
  } else {
    svg.append(leyendaTemp(temps[0], medio, temps[temps.length - 1], rango, W, H + 14));
  }
  cont.replaceChildren(svg);
}

const sinTildes = (s) => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

/** Alertas vigentes, de menor a mayor nivel (las graves se dibujan al final). */
function alertasVigentes() {
  return [...(estado.avisos?.advertencias ?? []), ...(estado.avisos?.avisos ?? [])]
    .filter((a) => a.nivel)
    .sort((a, b) => a.nivel - b.nivel);
}

/**
 * Trama diagonal para los departamentos en alerta. El color solo no alcanza:
 * el naranja de una alerta y el naranja de "hace calor" conviven en el mismo
 * mapa, y sin una segunda señal se confunden. Con rayado, la alerta se lee
 * aunque el punto de temperatura tenga el mismo tono.
 */
/** Un ángulo por nivel: cuando dos alertas se solapan, las tramas se cruzan y
 *  se ve que hay dos, en vez de una sola mancha más oscura. */
const ANGULO_TRAMA = { 2: 45, 3: -45, 4: 90 };

function patronesAlerta(niveles) {
  const defs = el('defs');
  for (const [nivel, color] of niveles) {
    const p = el('pattern', {
      id: `trama-alerta-${nivel}`, width: 9, height: 9,
      patternUnits: 'userSpaceOnUse',
      patternTransform: `rotate(${ANGULO_TRAMA[nivel] ?? 45})`,
    });
    // Suave, pero no tanto como para desaparecer: al 10 % sobre un mapa oscuro
    // el amarillo no se veía. La mancha sigue siendo contexto —los puntos de
    // temperatura son el dato— pero tiene que leerse de un vistazo.
    p.append(el('rect', { width: 9, height: 9, fill: color, 'fill-opacity': '.18' }));
    p.append(el('line', {
      x1: 0, y1: 0, x2: 0, y2: 9, stroke: color, 'stroke-width': 2.6, 'stroke-opacity': '.45',
    }));
    defs.append(p);
  }
  return defs;
}

const aPath = (anillo, X, Y) =>
  anillo.map(([lon, lat], i) => `${i ? 'L' : 'M'}${X(lon).toFixed(1)},${Y(lat).toFixed(1)}`).join('') + 'Z';

/** Contorno del país, dividido por departamento. Es el fondo del mapa. */
function capaDepartamentos(X, Y) {
  const g = el('g', { class: 'mapa-geo' });
  if (!estado.geo?.features) return g;

  for (const f of estado.geo.features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const d = polys.flatMap((poly) => poly.map((anillo) => aPath(anillo, X, Y))).join('');

    const p = el('path', { class: 'mapa-depto', d });
    const t = el('title');
    t.textContent = f.properties.nombre;
    p.append(t);
    g.append(p);
  }
  return g;
}

/**
 * Área bajo alerta, dibujada con el polígono real de INUMET (`coordsPoligonos`).
 *
 * Antes pintaba el departamento entero cuando aparecía en la lista de zonas, y
 * eso miente: la mayoría de las advertencias cubren solo algunas localidades
 * ("Tacuarembó : Paso de los Toros, Piedra Sola…" es una franja, no el
 * departamento). Solo unas pocas dicen "(Todo el departamento)". El polígono
 * es lo que INUMET dibuja en su propio mapa, así que es lo que corresponde.
 */
function capaAlertas(X, Y) {
  const alertas = alertasVigentes();
  const g = el('g', { class: 'mapa-alertas' });
  if (!alertas.length) return g;

  const niveles = new Map();
  for (const a of alertas) niveles.set(a.nivel, a.color);
  const defs = patronesAlerta(niveles);

  // El polígono de INUMET es aproximado y se desborda sobre el río y la
  // frontera. Lo recortamos contra la silueta del país para que la mancha no
  // aparezca sobre agua.
  if (estado.geo?.features) {
    const clip = el('clipPath', { id: 'recorte-pais' });
    for (const f of estado.geo.features) {
      const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
      for (const poly of polys) clip.append(el('path', { d: aPath(poly[0], X, Y) }));
    }
    defs.append(clip);
    g.setAttribute('clip-path', 'url(#recorte-pais)');
  }
  g.append(defs);

  for (const a of alertas) {
    for (const poly of a.poligonos ?? []) {
      const d = aPath(poly, X, Y);

      // Halo oscuro debajo del contorno: el borde de la alerta cruza
      // departamentos de distinto tono y, sin él, los tramos que caen sobre
      // una zona clara se pierden. Va primero para quedar por abajo.
      g.append(Object.assign(el('path', { class: 'mapa-halo-alerta', d }), {}));

      const p = el('path', { class: 'mapa-area-alerta', d });
      p.style.fill = `url(#trama-alerta-${a.nivel})`;
      p.style.stroke = a.color;
      p.style.strokeWidth = '2.6';

      const t = el('title');
      t.textContent = `Alerta ${a.nombre}: ${a.fenomeno}` +
        (a.comienzo ? ` (${a.comienzo} → ${a.finalizacion ?? ''})` : '');
      p.append(t);
      g.append(p);
    }
  }
  return g;
}

/** Leyenda de alertas: solo aparece si hay alguna vigente. */
function leyendaAlertas(W, y) {
  const alertas = alertasVigentes();
  if (!alertas.length) return null;

  // Un chip por nivel presente, del más grave al más leve.
  const niveles = new Map();
  for (const a of alertas) if (!niveles.has(a.nivel)) niveles.set(a.nivel, a);
  const orden = [...niveles.entries()].sort((a, b) => b[0] - a[0]);

  const g = el('g');
  const anchoChip = 132;
  const x0 = W / 2 - (orden.length * anchoChip) / 2;

  orden.forEach(([, a], i) => {
    const x = x0 + i * anchoChip;
    // La muestra usa la misma trama que el mapa, no un color plano.
    g.append(el('rect', {
      x, y, width: 13, height: 13, rx: 3,
      fill: `url(#trama-alerta-${a.nivel})`, stroke: a.color, 'stroke-width': '1.6',
    }));
    const t = el('text', { class: 'marca-txt', x: x + 19, y: y + 10.5 });
    t.textContent = `Alerta ${a.nombre}`;
    g.append(t);
  });
  return g;
}

/**
 * Empuje mutuo en unas pocas pasadas para que las etiquetas no se tapen, con
 * un tope de desplazamiento: sobre un mapa real, un punto que se corre de más
 * termina en el mar y miente sobre dónde está la estación. Si dos estaciones
 * están de verdad pegadas, preferimos que se solapen a moverlas fuera de lugar.
 */
function separar(puntos, r) {
  const min = r * 2 + 1;
  const tope = r * 1.5;

  for (const p of puntos) { p.ox = p.px; p.oy = p.py; }

  for (let paso = 0; paso < 40; paso++) {
    let movio = false;
    for (let i = 0; i < puntos.length; i++) {
      for (let j = i + 1; j < puntos.length; j++) {
        const a = puntos[i], b = puntos[j];
        const dx = b.px - a.px, dy = b.py - a.py;
        const d = Math.hypot(dx, dy) || 0.01;
        if (d >= min) continue;
        const empuje = (min - d) / 2;
        const ux = dx / d, uy = dy / d;
        a.px -= ux * empuje; a.py -= uy * empuje;
        b.px += ux * empuje; b.py += uy * empuje;
        movio = true;
      }
    }
    for (const p of puntos) {
      const dx = p.px - p.ox, dy = p.py - p.oy;
      const d = Math.hypot(dx, dy);
      if (d > tope) { p.px = p.ox + (dx / d) * tope; p.py = p.oy + (dy / d) * tope; }
    }
    if (!movio) break;
  }
}

function leyendaTemp(min, medio, max, rango, W, y) {
  const g = el('g');
  const pasos = 9;
  const ancho = 22, alto = 10;
  const x0 = W / 2 - (pasos * ancho) / 2;

  for (let k = 0; k < pasos; k++) {
    const v = min + (k / (pasos - 1)) * (max - min);
    g.append(el('rect', {
      x: x0 + k * ancho, y, width: ancho - 2, height: alto, rx: 2,
      fill: colorTemp(v, medio, rango),
    }));
  }
  for (const [valor, ancla, px] of [[min, 'end', x0 - 8], [max, 'start', x0 + pasos * ancho + 4]]) {
    const t = el('text', { class: 'marca-txt', x: px, y: y + alto - 1, 'text-anchor': ancla });
    t.textContent = `${Math.round(valor)}°`;
    g.append(t);
  }
  const cap = el('text', { class: 'marca-txt', x: W / 2, y: y + alto + 14, 'text-anchor': 'middle' });
  cap.textContent = 'más frío ← temperatura ahora → más cálido';
  g.append(cap);
  return g;
}

// ---------------------------------------------------------------------------
// Tema
// ---------------------------------------------------------------------------

/**
 * Tema claro u oscuro: cambia ÚNICAMENTE el color del sitio.
 *
 * No toca lo que el cielo está mostrando. Si son las 10 de la mañana, el cielo
 * es de día en los dos temas; el oscuro solo le baja el brillo con un velo
 * (--velo-cielo) para que no compita con los paneles.
 *
 * El ícono muestra a dónde vas, no dónde estás — que es la convención: con
 * tema claro se ve una luna (clic = oscurecer) y con tema oscuro, un sol.
 */
function aplicarTema(t) {
  const claro = t === 'claro';
  if (claro) document.documentElement.dataset.tema = 'claro';
  else delete document.documentElement.dataset.tema;

  const b = $('#tema');
  b.textContent = claro ? '☾' : '☀';
  b.title = claro ? 'Pasar a tema oscuro' : 'Pasar a tema claro';
  b.setAttribute('aria-label', b.title);
  b.setAttribute('aria-pressed', String(claro));
}

function alternarTema() {
  const siguiente = document.documentElement.dataset.tema === 'claro' ? 'oscuro' : 'claro';
  localStorage.setItem('tema', siguiente);
  aplicarTema(siguiente);
  // El cielo forzado desde el panel de pruebas manda sobre el tema; si no,
  // el cambio de tema tiene que arrastrarlo.
  refrescarCielo();
  // Y el hero también: su ícono elige entre sol y luna según uiEnOscuro(), así
  // que sin repintarlo quedaba una luna sobre un cielo diurno.
  if (estado.seleccionada) pintarHero(estado.seleccionada);
  if (estado.serie) redibujarGraficos();
}

iniciar();
