/**
 * Panel de pruebas — solo en local, o con `?pruebas` en la URL.
 *
 * El clima real no se deja probar: para ver la tormenta hay que esperar a que
 * haya tormenta, y las alertas aparecen unas pocas veces al mes (hoy mismo
 * INUMET dio de baja las tres que había a las 07:26, y el mapa se queda sin
 * nada que pintar). Esto fuerza cada escenario a mano.
 *
 * Se carga con `import()` dinámico desde app.js, así que en producción el
 * archivo no se baja siquiera.
 *
 * Ojo: no hay nieve. En Uruguay no nieva —cae aguanieve en el sur cada muchos
 * años— y no está en el vocabulario de INUMET, así que tampoco es un estado
 * que el cielo sepa dibujar.
 */

const CONDICIONES = [
  ['despejado', 'Despejado'],
  ['nuboso', 'Nuboso'],
  ['cubierto', 'Cubierto'],
  ['niebla', 'Niebla'],
  ['lluvia', 'Lluvia'],
  ['tormenta', 'Tormenta'],
];

const NIVELES = {
  2: { nombre: 'amarilla', color: '#FFD800' },
  3: { nombre: 'naranja', color: '#FF6A00' },
  4: { nombre: 'roja', color: '#E00000' },
};

/**
 * Polígono con el borde algo irregular. Un rectángulo perfecto no sirve para
 * juzgar el dibujo: los de INUMET son manchas con vértices sueltos, y el halo
 * y el recorte contra la costa se comportan distinto con esquinas rectas.
 */
function mancha(loMin, laMin, loMax, laMax, semilla = 1) {
  const puntos = [];
  const lados = [
    [loMin, laMin, loMax, laMin],
    [loMax, laMin, loMax, laMax],
    [loMax, laMax, loMin, laMax],
    [loMin, laMax, loMin, laMin],
  ];
  let n = semilla;
  const ruido = (amp) => {
    // Congruencial simple: da siempre la misma forma para la misma semilla,
    // así comparar dos capturas tiene sentido.
    n = (n * 1103515245 + 12345) & 0x7fffffff;
    return ((n / 0x7fffffff) - .5) * amp;
  };

  for (const [x1, y1, x2, y2] of lados) {
    for (let i = 0; i < 4; i++) {
      const t = i / 4;
      puntos.push([
        x1 + (x2 - x1) * t + ruido(.28),
        y1 + (y2 - y1) * t + ruido(.22),
      ]);
    }
  }
  puntos.push(puntos[0]);
  return puntos;
}

function alerta(nivel, fenomeno, caja, semilla, zonas) {
  const { nombre, color } = NIVELES[nivel];
  return {
    nivel, nombre, color, fenomeno,
    tipo: 'advertencia',
    poligonos: [mancha(...caja, semilla)],
    comienzo: 'hoy 12:00',
    finalizacion: 'hoy 22:00',
    probabilidad: 'alta',
    fenomenos: [{ tipo: fenomeno.toLowerCase() }],
    descripcion: `Escenario de prueba. ${fenomeno} sobre la zona marcada.`,
    zonas,
  };
}

// Cajas que se pisan de verdad: es el caso que rompía antes, cuando dos tramas
// encimadas se leían como una sola mancha. Los solapes son a propósito —
// NORTE∩CENTRO entre -31.7 y -31.0, CENTRO∩ESTE entre -33.4 y -32.6— porque si
// las bandas quedan pegadas sin encimarse no se prueba nada.
const NORTE = [-58.1, -31.7, -53.6, -30.2];
const CENTRO = [-58.1, -33.4, -53.6, -31.0];
const ESTE = [-55.6, -34.6, -53.5, -32.6];

const ESCENARIOS = {
  ninguna: () => [],
  amarilla: () => [alerta(2, 'Vientos fuertes', CENTRO, 7, [{ departamento: 'Durazno' }])],
  naranja: () => [alerta(3, 'Tormentas fuertes', NORTE, 3, [{ departamento: 'Artigas' }])],
  roja: () => [alerta(4, 'Tormentas severas', ESTE, 11, [{ departamento: 'Rocha' }])],
  dos: () => [
    alerta(3, 'Tormentas fuertes', NORTE, 3, [{ departamento: 'Artigas' }, { departamento: 'Salto' }]),
    alerta(2, 'Vientos fuertes', CENTRO, 7,
      [{ departamento: 'Tacuarembó', localidades: 'Paso de los Toros, Piedra Sola' }]),
  ],
  tres: () => [
    alerta(3, 'Tormentas fuertes', NORTE, 3, [{ departamento: 'Artigas' }]),
    alerta(2, 'Vientos fuertes', CENTRO, 7, [{ departamento: 'Durazno' }]),
    alerta(4, 'Tormentas severas', ESTE, 11, [{ departamento: 'Rocha' }]),
  ],
};

const boton = (texto, alPulsar, clase = '') => {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = `prueba-btn ${clase}`.trim();
  b.textContent = texto;
  b.addEventListener('click', alPulsar);
  return b;
};

const titulo = (texto) => {
  const h = document.createElement('h3');
  h.className = 'prueba-titulo';
  h.textContent = texto;
  return h;
};

export function montarPruebas(api) {
  const { estado, aplicarCielo, refrescarCielo, repintarMapa, repintarAvisos } = api;

  const avisosReales = estado.avisos;
  let noche = false;

  const panel = document.createElement('aside');
  panel.className = 'pruebas';
  panel.hidden = true;

  // --- cielo ---------------------------------------------------------------
  panel.append(titulo('Cielo'));

  const marcarActivo = (grupo, activo) => {
    for (const b of panel.querySelectorAll(`[data-grupo="${grupo}"]`)) {
      b.classList.toggle('activo', b === activo);
    }
  };

  const filaCielo = document.createElement('div');
  filaCielo.className = 'prueba-fila';
  for (const [clave, etiqueta] of CONDICIONES) {
    const b = boton(etiqueta, () => {
      estado.cieloForzado = true;
      // El tercer argumento es el tema, que solo regula el brillo del velo:
      // acá se pasa el vigente para previsualizar en las condiciones reales.
      aplicarCielo(clave, noche, document.documentElement.dataset.tema !== 'claro');
      marcarActivo('cielo', b);
    });
    b.dataset.grupo = 'cielo';
    filaCielo.append(b);
  }
  panel.append(filaCielo);

  const filaMomento = document.createElement('div');
  filaMomento.className = 'prueba-fila';
  const btnNoche = boton('☾ Noche', () => {
    noche = !noche;
    btnNoche.classList.toggle('activo', noche);
    btnNoche.textContent = noche ? '☀ Volver al día' : '☾ Noche';
    const actual = panel.querySelector('[data-grupo="cielo"].activo');
    if (actual) actual.click();
  });
  filaMomento.append(btnNoche);
  panel.append(filaMomento);

  // --- alertas -------------------------------------------------------------
  panel.append(titulo('Alertas en el mapa'));

  const filaAlertas = document.createElement('div');
  filaAlertas.className = 'prueba-fila';
  const etiquetas = {
    ninguna: 'Ninguna', amarilla: 'Amarilla', naranja: 'Naranja',
    roja: 'Roja', dos: 'Naranja + amarilla', tres: 'Las tres',
  };
  for (const [clave, etiqueta] of Object.entries(etiquetas)) {
    const b = boton(etiqueta, () => {
      estado.avisos = { advertencias: ESCENARIOS[clave](), avisos: [] };
      repintarAvisos();
      repintarMapa();
      marcarActivo('alerta', b);
    }, `prueba-${clave}`);
    b.dataset.grupo = 'alerta';
    filaAlertas.append(b);
  }
  panel.append(filaAlertas);

  // --- volver --------------------------------------------------------------
  const pie = document.createElement('div');
  pie.className = 'prueba-fila prueba-fila-pie';
  pie.append(boton('↺ Volver a lo real', () => {
    estado.cieloForzado = false;
    estado.avisos = avisosReales;
    noche = false;
    btnNoche.textContent = '☾ Noche';
    btnNoche.classList.remove('activo');
    marcarActivo('cielo', null);
    marcarActivo('alerta', null);
    refrescarCielo();
    repintarAvisos();
    repintarMapa();
  }, 'prueba-volver'));
  panel.append(pie);

  const abrir = boton('Pruebas', () => {
    panel.hidden = !panel.hidden;
    abrir.classList.toggle('activo', !panel.hidden);
  }, 'pruebas-abrir');
  abrir.setAttribute('aria-label', 'Panel de pruebas de animaciones y alertas');

  document.body.append(panel, abrir);
}
