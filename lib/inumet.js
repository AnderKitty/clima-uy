/**
 * Clima UY — acceso y normalización de los datos de INUMET.
 *
 * INUMET no publica una API documentada, pero su sitio se alimenta de unos
 * pocos endpoints JSON estables (ver README.md). Este módulo los consume, los
 * cachea y los deja en un formato cómodo.
 *
 * Lo usan los dos frontales: server.js (dinámico, para desarrollo o VPS) y
 * tools/generar.mjs (estático, para GitHub Pages).
 */

const UA = 'clima-uy/1.0 (agregador propio de datos publicos de INUMET)';

const ORIGEN = 'https://www.inumet.gub.uy';
const FUENTES = {
  estado: `${ORIGEN}/reportes/estadoActual/datos_inumet_ui_publica.mch`,
  pronostico: `${ORIGEN}/reportes/pronosticos/pronosticoV4.json`,
  catalogo: `${ORIGEN}/reportes/estaciones/estaciones.mch`,
  // OJO: /alerta y no la portada. La portada embebe UNA sola advertencia (la
  // destacada); /alerta trae la lista completa. Con tormenta + viento naranja
  // + viento amarillo simultáneos, la portada mostraba solo la primera.
  home: `${ORIGEN}/alerta`,
  portada: `${ORIGEN}/`,
};

// El origen declara max-age 60-300s. Vamos un poco por encima: nadie mira el
// clima con más resolución que eso y no hay motivo para golpearles el server.
const TTL = { estado: 300e3, pronostico: 300e3, catalogo: 86400e3, home: 600e3, portada: 600e3 };

const NUDO_A_KMH = 1.852;
// ---------------------------------------------------------------------------
// Caché: una entrada por fuente, compartida por todos los visitantes.
// Si el origen falla, seguimos sirviendo lo último bueno y lo marcamos.
// ---------------------------------------------------------------------------

const cache = new Map();

const ESPERAS = [2_000, 6_000];   // entre intentos; la longitud fija los reintentos

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * Un GET con reintentos.
 *
 * INUMET parpadea: se cae un rato y vuelve. Con un solo intento, ese parpadeo
 * tiraba abajo la generación entera —y en CI duele el doble, porque el proceso
 * arranca sin caché y no hay dato viejo que sirva de red—. Un deploy programado
 * murió justo así.
 *
 * Solo se reintenta lo que puede mejorar solo: timeouts, errores de red y 5xx.
 * Un 404 o un 403 van a dar lo mismo tres veces, así que cortan de una.
 */
async function conReintentos(clave, comoTexto) {
  for (let intento = 0; ; intento++) {
    try {
      const r = await fetch(FUENTES[clave], {
        signal: AbortSignal.timeout(20_000),
        headers: { 'User-Agent': UA, Accept: comoTexto ? 'text/html' : 'application/json' },
      });
      if (!r.ok) {
        const err = new Error(`${clave}: HTTP ${r.status}`);
        err.reintentable = r.status >= 500 || r.status === 429;
        throw err;
      }
      return comoTexto ? await r.text() : await r.json();
    } catch (err) {
      // Sin `reintentable` es fallo de red o timeout: esos sí se reintentan.
      const puede = err.reintentable ?? true;
      if (!puede || intento >= ESPERAS.length) throw err;
      console.warn(`[inumet] ${clave} falló (${err.message}); reintento en ${ESPERAS[intento] / 1000}s`);
      await dormir(ESPERAS[intento]);
    }
  }
}

async function traer(clave, { comoTexto = false } = {}) {
  const previo = cache.get(clave);
  if (previo?.datos && Date.now() - previo.t < TTL[clave]) return previo;

  if (previo?.enVuelo) return previo.enVuelo;

  const promesa = (async () => {
    const datos = await conReintentos(clave, comoTexto);
    const entrada = { datos, t: Date.now(), rancio: false };
    cache.set(clave, entrada);
    return entrada;
  })();

  cache.set(clave, { ...previo, enVuelo: promesa });

  try {
    return await promesa;
  } catch (err) {
    if (previo?.datos) {
      const entrada = { datos: previo.datos, t: previo.t, rancio: true, error: err.message };
      cache.set(clave, entrada);
      return entrada;
    }
    cache.delete(clave);
    throw err;
  }
}

// ---------------------------------------------------------------------------
// Utilidades de normalización
// ---------------------------------------------------------------------------

/** Los valores llegan como number, como string ("36", "1013.8") o como texto
 *  ("TRAZA" cuando llovió menos de lo medible). Solo nos quedamos con números. */
function num(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = typeof v === 'number' ? v : Number(String(v).replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

const CARDINALES = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE',
                    'S', 'SSO', 'SO', 'OSO', 'O', 'ONO', 'NO', 'NNO'];

function cardinal(grados) {
  if (grados === null) return null;
  return CARDINALES[Math.round(((grados % 360) + 360) % 360 / 22.5) % 16];
}

/**
 * `estado` viene en columnas: observaciones[iVariable].datos[iEstacion][iTiempo],
 * donde iTiempo indexa observaciones[iVariable].iFechas, que a su vez indexa
 * el array global `fechas`. Lo damos vuelta a series por estación.
 */
function indexarEstado(raw) {
  const { variables, fechas, estaciones, observaciones } = raw;
  const porVar = new Map();
  variables.forEach((v, i) => porVar.set(v.idStr, i));

  const serie = (idStr, iEst) => {
    const iVar = porVar.get(idStr);
    if (iVar === undefined) return [];
    const obs = observaciones[iVar];
    const col = obs?.datos?.[iEst];
    if (!col) return [];
    return col
      .map((valor, k) => ({ hora: fechas[obs.iFechas[k]], valor: num(valor) }))
      .filter((p) => p.hora && p.valor !== null);
  };

  const ultimo = (s) => (s.length ? s[s.length - 1] : null);

  return { variables, fechas, estaciones, serie, ultimo };
}

function condicionActual(ix, iEst) {
  const { serie, ultimo, estaciones } = ix;
  const e = estaciones[iEst];

  const temp = ultimo(serie('TempAire', iEst));
  const hum = ultimo(serie('HumRelativa', iEst));
  const rocio = ultimo(serie('TempPtoRocio', iEst));
  const dir = ultimo(serie('DirViento', iEst));
  const int = ultimo(serie('IntViento', iEst));
  const rafaga = ultimo(serie('IntRafaga', iEst));
  const pres = ultimo(serie('PresAtmMar', iEst));
  const vis = ultimo(serie('Visibilidad', iEst));
  const lluvia = ultimo(serie('precipHoraria', iEst));

  const kmh = int ? Math.round(int.valor * NUDO_A_KMH) : null;

  return {
    id: e.id,
    nombre: e.displayNamePublic || e.nombre,
    lat: e.latitud,
    lon: e.longitud,
    altitud: e.altitud,
    automatica: e.tipoAutomatica === true,
    hora: temp?.hora ?? hum?.hora ?? null,
    temp: temp?.valor ?? null,
    humedad: hum?.valor ?? null,
    rocio: rocio?.valor ?? null,
    sensacion: temp && hum ? sensacionTermica(temp.valor, hum.valor, kmh) : null,
    viento: int ? { kmh, nudos: int.valor, dir: dir?.valor ?? null, card: cardinal(dir?.valor ?? null) } : null,
    rafagaKmh: rafaga ? Math.round(rafaga.valor * NUDO_A_KMH) : null,
    presion: pres?.valor ?? null,
    visibilidad: vis?.valor ?? null,
    lluvia1h: lluvia?.valor ?? null,
  };
}

/**
 * INUMET no publica sensación térmica, así que la calculamos:
 * wind chill (JAG/TI) cuando hace frío y venta, heat index cuando hace calor.
 * Fuera de esos rangos la sensación es la temperatura misma.
 */
function sensacionTermica(t, hr, kmh) {
  if (t <= 10 && kmh >= 5) {
    const v = Math.pow(kmh, 0.16);
    return Math.round((13.12 + 0.6215 * t - 11.37 * v + 0.3965 * t * v) * 10) / 10;
  }
  if (t >= 27 && hr >= 40) {
    const f = t * 9 / 5 + 32;
    let hi = -42.379 + 2.04901523 * f + 10.14333127 * hr
      - 0.22475541 * f * hr - 6.83783e-3 * f * f - 5.481717e-2 * hr * hr
      + 1.22874e-3 * f * f * hr + 8.5282e-4 * f * hr * hr - 1.99e-6 * f * f * hr * hr;
    return Math.round(((hi - 32) * 5 / 9) * 10) / 10;
  }
  return t;
}

/**
 * El código `estadoTiempo` de INUMET (1,2,4,6,7,11,12,13) no está documentado y
 * mezcla variantes día/noche. El texto libre es mucho más confiable, así que el
 * ícono sale de las palabras y el código solo desempata.
 */
function icono(descripcion = '', evolucion = '', codigo = '') {
  const t = `${descripcion} ${evolucion}`.toLowerCase();
  if (/tormenta/.test(t)) return 'tormenta';
  if (/precipitac|lluvia|chaparr|llovizna/.test(t)) return 'lluvia';
  if (/niebla|neblina|bruma/.test(t)) return 'niebla';
  if (/cubierto/.test(t)) return 'cubierto';
  if (/nuboso|nubosidad/.test(t)) return 'nuboso';
  if (/claro|despejad/.test(t)) return 'despejado';
  return { 1: 'despejado', 2: 'despejado', 4: 'cubierto', 6: 'lluvia',
           7: 'cubierto', 11: 'cubierto', 12: 'nuboso', 13: 'nuboso' }[codigo] ?? 'nuboso';
}

function normalizarPronostico(raw) {
  const zonas = new Map();

  for (const it of raw.items ?? []) {
    if (!zonas.has(it.zonaId)) {
      zonas.set(it.zonaId, { id: it.zonaId, corta: it.zonaCorta, nombre: it.zonaLarga, dias: [] });
    }
    // `grupo` a veces trae el día en inglés ("Thu 06"), así que lo derivamos de
    // inicioPronostico + diaMasN en lugar de confiar en la etiqueta del origen.
    const fecha = new Date(`${raw.inicioPronostico}T00:00:00-03:00`);
    fecha.setDate(fecha.getDate() + it.diaMasN);

    const periodos = (it.subgrupos ?? [])
      .sort((a, b) => a.orden - b.orden)
      .map((s) => ({
        periodo: s.subgrupo,
        descripcion: s.descripcion ?? '',
        evolucion: s.evolucion ?? '',
        extra: s.descripcionExtra ?? '',
        vientos: s.vientos ?? '',
        icono: icono(s.descripcion, s.evolucion, s.estadoTiempo),
      }));

    zonas.get(it.zonaId).dias.push({
      fecha: fecha.toISOString().slice(0, 10),
      diaMasN: it.diaMasN,
      tempMin: it.tempMin ?? null,
      tempMax: it.tempMax ?? null,
      icono: icono(periodos[0]?.descripcion, periodos[0]?.evolucion, it.estadoTiempo),
      periodos,
    });
  }

  for (const z of zonas.values()) z.dias.sort((a, b) => a.diaMasN - b.diaMasN);

  return {
    publicado: raw.fechaPublicacion ?? null,
    generado: raw.fechaGeneracion ?? null,
    pronosticador: raw.pronosticador ?? null,
    activo: String(raw.activo) === 'true',
    zonas: [...zonas.values()],
  };
}

/** Zona de pronóstico más cercana a una estación (centroides aproximados). */
const CENTROIDES = [
  { id: 88, lat: -34.80, lon: -56.10 }, // Área Metropolitana
  { id: 89, lat: -34.95, lon: -54.95 }, // Punta del Este
  { id: 65, lat: -31.70, lon: -54.90 }, // Noreste
  { id: 66, lat: -31.50, lon: -57.20 }, // Noroeste
  { id: 67, lat: -33.40, lon: -56.20 }, // Centro-Sur
  { id: 68, lat: -33.60, lon: -54.30 }, // Este
  { id: 86, lat: -33.90, lon: -57.60 }, // Suroeste
];

function zonaDe(lat, lon) {
  if (lat === null || lon === null) return null;
  let mejor = null, mejorD = Infinity;
  for (const c of CENTROIDES) {
    const d = (c.lat - lat) ** 2 + ((c.lon - lon) * Math.cos(lat * Math.PI / 180)) ** 2;
    if (d < mejorD) { mejorD = d; mejor = c.id; }
  }
  return mejor;
}

/**
 * Nivel de alerta. `riesgoFenomeno` trae un número por fenómeno
 * ({riesgoViento: 1, riesgoLluvia: 3, riesgoTormenta: 3, …}) y el nivel de la
 * advertencia es el máximo. La escala sale de su propio alerta.js:
 *
 *   mapAdv = ["AlertaVerde", "AlertaAmarilla", "AlertaNaranja", "AlertaRoja"]
 *   textoNivelAlerta[2] = "Amarilla"; [3] = "Naranja"; [4] = "Roja"
 *
 * O sea 1 = sin alerta. Los colores son los que INUMET usa para pintar su
 * propio mapa (los saca en la URL de Google Static Maps de la portada).
 */
const NIVELES = {
  2: { nombre: 'amarilla', color: '#FFD800' },
  3: { nombre: 'naranja', color: '#FF6A00' },
  4: { nombre: 'roja', color: '#E00000' },
};

function nivelDe(riesgoFenomeno) {
  if (!riesgoFenomeno || typeof riesgoFenomeno !== 'object') return null;
  const max = Math.max(...Object.values(riesgoFenomeno).map(Number).filter(Number.isFinite), 0);
  return NIVELES[max] ? { nivel: max, ...NIVELES[max] } : null;
}

/** Fenómenos efectivamente en alerta (los que superan el nivel 1). */
function fenomenosDe(riesgoFenomeno) {
  if (!riesgoFenomeno || typeof riesgoFenomeno !== 'object') return [];
  return Object.entries(riesgoFenomeno)
    .filter(([, v]) => Number(v) > 1)
    .map(([k, v]) => ({ tipo: k.replace(/^riesgo/, '').toLowerCase(), nivel: Number(v) }))
    .sort((a, b) => b.nivel - a.nivel);
}

/** Para cruzar "SAN JOSE"/"Paysandú" con los nombres de public/uruguay.json. */
const normalizarDepto = (s) =>
  String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().trim();

/**
 * Zonas afectadas. Preferimos `zonasArray`, que viene ya estructurado
 * ({id: "SAN JOSE", label: "San José", localidades: [...]}). El campo `zonas`
 * de texto corrido solo se usa como respaldo si el origen dejara de mandarlo.
 */
function zonasDe(a) {
  if (Array.isArray(a.zonasArray) && a.zonasArray.length) {
    return a.zonasArray.map((z) => ({
      id: normalizarDepto(z.id ?? z.label),
      departamento: z.label ?? z.id ?? null,
      localidades: Array.isArray(z.localidades) && z.localidades.length
        ? z.localidades.join(', ')
        : null,
    })).filter((z) => z.departamento);
  }
  return partirZonas(a.zonas).map((z) => ({ ...z, id: normalizarDepto(z.departamento) }));
}

/**
 * Respaldo: el campo `zonas` viene como un bloque corrido donde los
 * departamentos se pegan sin separador ("…y Topador.Cerro Largo : Arévalo…").
 */
function partirZonas(texto) {
  if (!texto || typeof texto !== 'string') return [];
  return texto
    // Corta antes de cada "Departamento :" o "Departamento(", tolerando que el
    // bloque anterior termine en "." o en ")," — el origen usa ambos.
    .split(/(?<=[.)])\s*,?\s*(?=[A-ZÁÉÍÓÚÑ][A-Za-zÁ-Úá-úñ]*(?:\s+[A-Za-zÁ-Úá-úñ]+)*\s*[:(])/)
    .map((bloque) => {
      const m = bloque.match(/^\s*([^:(]+?)\s*[:(]\s*(.*)$/s);
      if (!m) return { departamento: bloque.trim().replace(/[.,]$/, ''), localidades: null };
      return {
        departamento: m[1].trim().replace(/,$/, ''),
        localidades: m[2].replace(/[).]+$/, '').trim() || null,
      };
    })
    .filter((z) => z.departamento);
}

/**
 * Los avisos y advertencias no tienen endpoint propio: van embebidos como
 * `var aviso = {...}` / `var alerta = {...}` en el HTML de la portada.
 */
/**
 * Extrae `var <nombre> = {...}` contando llaves, respetando strings y escapes.
 *
 * Con regex no alcanza: uno no-greedy se corta en el primer `};` que aparezca
 * dentro del objeto y uno greedy se pasa hasta el último del documento. Este
 * bloque son decenas de KB de JSON, así que el corte tiene que ser exacto.
 */
function extraerVar(html, nombre) {
  const m = html.match(new RegExp(`var\\s+${nombre}\\s*=\\s*`));
  if (!m) return null;
  const i = m.index + m[0].length;
  if (html[i] !== '{') return null;

  let prof = 0, enStr = false, esc = false;
  for (let k = i; k < html.length; k++) {
    const c = html[k];
    if (esc) { esc = false; continue; }
    if (c === '\\') { esc = true; continue; }
    if (c === '"') { enStr = !enStr; continue; }
    if (enStr) continue;
    if (c === '{') prof++;
    else if (c === '}' && --prof === 0) {
      try { return JSON.parse(html.slice(i, k + 1)); } catch { return null; }
    }
  }
  return null;
}

function extraerAvisos(html) {
  const salida = { avisos: [], advertencias: [], actualizado: null };

  for (const nombre of ['aviso', 'alerta']) {
    const d = extraerVar(html, nombre);
    if (!d) continue;
    if (d.inactivo || !Array.isArray(d.advertencias)) continue;

    const items = d.advertencias.map((a) => ({
      tipo: nombre === 'aviso' ? 'aviso' : 'advertencia',
      fenomeno: a.fenomeno ?? null,
      descripcion: a.descripcion ?? null,
      probabilidad: a.probabilidad ?? null,
      zonas: zonasDe(a),
      comienzo: a.comienzo ?? null,
      finalizacion: a.finalizacion ?? null,
      ...(nivelDe(a.riesgoFenomeno) ?? { nivel: null, nombre: null, color: null }),
      fenomenos: fenomenosDe(a.riesgoFenomeno),
      // Polígono exacto del área afectada, que es lo que INUMET dibuja en su
      // propio mapa. Lo pasamos por si algún día queremos el recorte fino en
      // vez de pintar el departamento entero.
      poligonos: (a.coordsPoligonos ?? [])
        .map((p) => p.map((pt) => [pt.lng, pt.lat]))
        .filter((p) => p.length > 2),
    }));

    if (items.length) {
      salida[nombre === 'aviso' ? 'avisos' : 'advertencias'].push(...items);
      salida.actualizado = d.fechaActualizacion ?? salida.actualizado;
    }
  }
  return salida;
}


// ---------------------------------------------------------------------------
// Recursos públicos: lo mismo que sirve server.js y lo que congela generar.mjs.
// ---------------------------------------------------------------------------

export async function ahora() {
  const [estado, catalogo] = await Promise.all([traer('estado'), traer('catalogo')]);
  const ix = indexarEstado(estado.datos);
  const meta = new Map((catalogo.datos.estaciones ?? []).map((e) => [e.id, e]));

  const estaciones = ix.estaciones
    .map((_, i) => condicionActual(ix, i))
    .map((e) => ({
      ...e,
      departamento: meta.get(e.id)?.departamento ?? null,
      zonaId: zonaDe(e.lat, e.lon),
    }))
    // Sin temperatura no hay nada que mostrar; las de fuera del país
    // (Argentina, Brasil) quedan marcadas para poder filtrarlas en la UI.
    .filter((e) => e.temp !== null)
    .map((e) => ({ ...e, pais: e.departamento && e.departamento !== 'Rio Grande do Sul' ? 'UY' : 'XX' }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));

  return { actualizado: ix.fechas[ix.fechas.length - 1], rancio: estado.rancio, estaciones };
}

export async function pronostico() {
  const p = await traer('pronostico');
  return { ...normalizarPronostico(p.datos), rancio: p.rancio };
}

/**
 * Avisos y advertencias.
 *
 * Fuente primaria: /alerta, que trae la lista completa. Si se cae —pasa— o
 * viene vacía, caemos a la portada, que al menos embebe la advertencia
 * destacada. Antes esto devolvía vacío en silencio y la web quedaba sin
 * alertas sin que nada lo indicara, que es peor que mostrar una sola.
 */
export async function avisos() {
  let h = null;
  try {
    h = await traer('home', { comoTexto: true });
    const completo = extraerAvisos(h.datos);
    if (completo.advertencias.length || completo.avisos.length) {
      return { ...completo, rancio: h.rancio, fuente: 'alerta' };
    }
  } catch (err) {
    console.warn('[avisos] /alerta falló:', err.message);
  }

  try {
    const portada = await traer('portada', { comoTexto: true });
    const parcial = extraerAvisos(portada.datos);
    return {
      ...parcial,
      rancio: portada.rancio,
      fuente: 'portada',
      // La portada solo trae la destacada: que la UI pueda decirlo.
      parcial: true,
    };
  } catch (err) {
    console.error('[avisos] también falló la portada:', err.message);
    if (h) return { ...extraerAvisos(h.datos), rancio: true, fuente: 'alerta' };
    throw err;
  }
}

/** Serie completa de 72 h de una estación. Sin `id`, devuelve todas. */
export async function estacion(id) {
  const estado = await traer('estado');
  const ix = indexarEstado(estado.datos);

  const armar = (i) => {
    const series = {};
    for (const v of ix.variables) series[v.idStr] = ix.serie(v.idStr, i);
    return {
      estacion: condicionActual(ix, i),
      unidades: Object.fromEntries(ix.variables.map((v) => [v.idStr, v.unidad])),
      series,
      rancio: estado.rancio,
    };
  };

  if (id === undefined) return ix.estaciones.map((_, i) => armar(i));

  const i = ix.estaciones.findIndex((e) => e.id === Number(id));
  return i === -1 ? null : armar(i);
}
