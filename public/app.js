// Clima UY — toda la UI. Sin dependencias: fetch + SVG a mano.

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

const SOL = `<circle cx="32" cy="30" r="12" fill="#eda100"/>
  <g stroke="#eda100" stroke-width="3" stroke-linecap="round">
    <path d="M32 8v6M32 46v6M10 30h6M48 30h6M16.5 14.5l4 4M43.5 41.5l4 4M47.5 14.5l-4 4M20.5 41.5l-4 4"/>
  </g>`;

const NUBE = (x = 0, y = 0, c = '#9ec5f4') =>
  `<path transform="translate(${x} ${y})" fill="${c}" d="M22 46a12 12 0 0 1 .6-23.9A16 16 0 0 1 53 26.4 10 10 0 0 1 52 46z"/>`;

const ICONOS = {
  despejado: `<svg viewBox="0 0 64 64" role="img" aria-label="Despejado">${SOL}</svg>`,

  nuboso: `<svg viewBox="0 0 64 64" role="img" aria-label="Parcialmente nuboso">
    <g transform="translate(6 -4) scale(.72)">${SOL}</g>${NUBE(0, 6)}</svg>`,

  cubierto: `<svg viewBox="0 0 64 64" role="img" aria-label="Cubierto">
    ${NUBE(-4, -2, '#c3c2b7')}${NUBE(2, 8, '#9ec5f4')}</svg>`,

  lluvia: `<svg viewBox="0 0 64 64" role="img" aria-label="Lluvia">
    ${NUBE(0, -4)}
    <g stroke="#2a78d6" stroke-width="3" stroke-linecap="round">
      <path d="M22 50l-3 8M34 50l-3 8M46 50l-3 8"/>
    </g></svg>`,

  tormenta: `<svg viewBox="0 0 64 64" role="img" aria-label="Tormenta">
    ${NUBE(0, -6, '#898781')}
    <path d="M34 42l-10 14h7l-4 10 13-16h-7l5-8z" fill="#eda100"/>
    <g stroke="#2a78d6" stroke-width="3" stroke-linecap="round">
      <path d="M20 46l-3 7M48 46l-3 7"/>
    </g></svg>`,

  niebla: `<svg viewBox="0 0 64 64" role="img" aria-label="Niebla">
    ${NUBE(0, -8, '#c3c2b7')}
    <g stroke="#898781" stroke-width="3" stroke-linecap="round">
      <path d="M14 46h36M18 54h30M14 62h26"/>
    </g></svg>`,
};

const icono = (nombre) => ICONOS[nombre] ?? ICONOS.nuboso;

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
 * En producción la web vive en GitHub Pages (estático) y la API en el VPS, así
 * que hay que apuntar a otro origen — por eso el server manda CORS. En local
 * `server.js` sirve las dos cosas, así que va contra el mismo origen y no hace
 * falta tocar nada para desarrollar.
 */
const API = (() => {
  if (['localhost', '127.0.0.1', ''].includes(location.hostname)) return '';
  const meta = document.querySelector('meta[name="clima-api"]')?.content?.trim();
  return meta ? meta.replace(/\/+$/, '') + '/' : '';
})();

async function json(ruta) {
  const url = ruta.startsWith('uruguay.json') ? ruta : API + ruta;   // el mapa viaja con la web
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${ruta} → HTTP ${r.status}`);
  return r.json();
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

    if (!estado.estaciones.length) throw new Error('INUMET no devolvió estaciones con datos');

    $('#app').replaceChildren($('#tpl-contenido').content.cloneNode(true));

    llenarSelector();
    pintarAvisos(avisos);
    pintarMapa(ahora.estaciones.filter((e) => e.pais === 'UY'));

    $('#pie-actualizado').textContent = ahora.actualizado
      ? `Observación de las ${nHora.format(new Date(ahora.actualizado))} h${ahora.rancio ? ' · dato en caché, INUMET no respondió' : ''}`
      : '';

    await elegir(estacionInicial());
    window.addEventListener('resize', redibujarGraficos, { passive: true });
  } catch (err) {
    $('#app').innerHTML =
      `<p class="cargando">No se pudieron cargar los datos.<br><small>${err.message}</small></p>`;
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
  return esDeNoche() ? 'despejado' : 'despejado';
}

function esDeNoche() {
  const h = Number(nHora.format(new Date()).slice(0, 2));
  return h < 7 || h >= 19;
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

function vacio(cont, texto) {
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

/** Marcas del eje X: una cada 12 h, sobre las horas redondas. */
function marcasTiempo(datos) {
  const out = [];
  let ultima = -Infinity;
  datos.forEach((d, i) => {
    const h = Number(nHora.format(d.x).slice(0, 2));
    if (h % 12 === 0 && i - ultima >= 6) { out.push(i); ultima = i; }
  });
  return out;
}

function graficoLinea(cont, datos, { unidad, decimales }) {
  if (!datos.length) return vacio(cont, estado.serie ? 'Esta estación no reporta temperatura.' : 'Cargando…');

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
  for (const i of marcasTiempo(datos)) {
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
  for (const i of marcasTiempo(datos)) {
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

    art.append(nodo('p', 'dia-desc',
      [d.periodos[0]?.descripcion, d.periodos[0]?.evolucion].filter(Boolean).join(' ')));

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
  if (!items.length) return;

  cont.hidden = false;
  cont.replaceChildren(...items.map((a) => {
    // INUMET no publica el nivel de color en este JSON: una advertencia pesa
    // más que un aviso, así que ese es el criterio del tono.
    const div = nodo('div', `aviso aviso-${a.tipo === 'aviso' ? 'amarilla' : 'naranja'}`);
    div.append(Object.assign(nodo('span', 'aviso-icono', '⚠'), { ariaHidden: 'true' }));

    const cuerpo = nodo('div', 'aviso-cuerpo');
    cuerpo.append(nodo('p', 'aviso-titulo',
      `${a.tipo === 'aviso' ? 'Aviso' : 'Advertencia'}${a.fenomeno ? `: ${a.fenomeno}` : ''}`));

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

  svg.append(leyendaTemp(temps[0], medio, temps[temps.length - 1], rango, W, H + 14));
  cont.replaceChildren(svg);
}

/** Contorno del país por departamento. Se dibuja debajo de los puntos y es
 *  puramente contexto: sin interacción y con tinta recesiva. */
function capaDepartamentos(X, Y) {
  const g = el('g', { class: 'mapa-geo' });
  if (!estado.geo?.features) return g;

  for (const f of estado.geo.features) {
    const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
    const d = polys
      .flatMap((poly) => poly.map((anillo) =>
        anillo.map(([lon, lat], i) => `${i ? 'L' : 'M'}${X(lon).toFixed(1)},${Y(lat).toFixed(1)}`).join('') + 'Z'))
      .join('');

    const p = el('path', { class: 'mapa-depto', d });
    const t = el('title');
    t.textContent = f.properties.nombre;
    p.append(t);
    g.append(p);
  }
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

function aplicarTema(t) {
  if (t === 'claro' || t === 'oscuro') document.documentElement.dataset.tema = t;
  else delete document.documentElement.dataset.tema;
  $('#tema').textContent = document.documentElement.dataset.tema === 'oscuro' ? '☀' : '☾';
}

function alternarTema() {
  const actual = document.documentElement.dataset.tema;
  const sistemaOscuro = matchMedia('(prefers-color-scheme: dark)').matches;
  const siguiente = actual ? (actual === 'oscuro' ? 'claro' : 'oscuro') : (sistemaOscuro ? 'claro' : 'oscuro');
  localStorage.setItem('tema', siguiente);
  aplicarTema(siguiente);
  if (estado.serie) redibujarGraficos();
}

iniciar();
