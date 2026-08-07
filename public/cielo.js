// Cielo ambiental: el fondo reacciona a lo que está pasando de verdad.
//
// Capas fijas detrás de todo — degradado, nubes a la deriva, estrellas, halo
// del sol o la luna — más un canvas de lluvia y destellos de tormenta. Nada de
// esto es dato: es atmósfera. Los números siempre mandan y van por encima.

const $ = (s) => document.querySelector(s);

/**
 * Paletas por condición y momento del día. `amb` es el color de acento que
 * toma el resto de la interfaz, así que el sitio entero se tiñe con el clima.
 *
 * `dia` va con el tema claro y `noche` con el oscuro — el cielo y la interfaz
 * no pueden discrepar. Por eso cada variante lleva su propio `amb` y su propio
 * tinte de nube: sobre fondo claro el acento tiene que ser oscuro para leerse,
 * y las nubes tienen que ser blancas; sobre fondo oscuro, al revés.
 */
const CIELOS = {
  despejado: {
    dia: { grad: ['#3f86cf', '#69a8e0', '#9ccbee', '#d3e8f7'], nubes: .5, sol: 1,
           solColor: '#fff6d0', solPos: [85, 12], estrellas: 0, amb: '#b4630f',
           nube: ['rgba(255,255,255,.98)', 'rgba(212,231,247,.55)'] },
    noche: { grad: ['#070b16', '#0d1526', '#16233c'], nubes: .22, sol: .55,
             solColor: '#cfe0ff', solPos: [85, 12], estrellas: 1, amb: '#aab8dd',
             nube: ['rgba(150,166,205,.52)', 'rgba(90,104,140,.22)'] },
  },
  nuboso: {
    dia: { grad: ['#6d94ba', '#8fb0cd', '#b8cee0', '#d5e2ec'], nubes: .8, sol: .5,
           solColor: '#fff2c8', solPos: [82, 14], estrellas: 0, amb: '#1f63b8',
           nube: ['rgba(255,255,255,.95)', 'rgba(196,213,230,.60)'] },
    noche: { grad: ['#0d1420', '#182233', '#25344a'], nubes: .6, sol: .3,
             solColor: '#cfe0ff', solPos: [82, 14], estrellas: .6, amb: '#9db8ff',
             nube: ['rgba(142,160,202,.62)', 'rgba(84,100,138,.26)'] },
  },
  cubierto: {
    dia: { grad: ['#8b98a6', '#a3aeb9', '#c2cad3'], nubes: .9, sol: 0, estrellas: 0, amb: '#4a5668',
           nube: ['rgba(248,250,252,.92)', 'rgba(178,189,201,.60)'] },
    noche: { grad: ['#0c1119', '#171e29', '#232c3a'], nubes: .8, sol: 0, estrellas: 0, amb: '#8794aa',
             nube: ['rgba(122,134,154,.56)', 'rgba(70,80,96,.26)'] },
  },
  niebla: {
    dia: { grad: ['#b3bac1', '#c6cbd1', '#dee1e5'], nubes: .95, sol: 0, estrellas: 0,
           amb: '#55606e', niebla: 1,
           nube: ['rgba(252,253,254,.88)', 'rgba(198,205,212,.60)'] },
    noche: { grad: ['#11151b', '#1c222b', '#28303b'], nubes: .9, sol: 0, estrellas: 0,
             amb: '#8b95a3', niebla: 1,
             nube: ['rgba(150,158,170,.55)', 'rgba(96,104,116,.28)'] },
  },
  lluvia: {
    dia: { grad: ['#5c7086', '#75899d', '#98aaba', '#b9c6d2'], nubes: .88, sol: 0, estrellas: 0,
           amb: '#125f8c', lluvia: 1,
           nube: ['rgba(230,237,244,.92)', 'rgba(148,165,183,.62)'] },
    noche: { grad: ['#0a1018', '#141d2a', '#1f2c3e'], nubes: .82, sol: 0, estrellas: 0,
             amb: '#7cb8f5', lluvia: 1,
             nube: ['rgba(120,140,176,.60)', 'rgba(66,82,110,.30)'] },
  },
  tormenta: {
    dia: { grad: ['#414b5a', '#57616f', '#767f8d', '#98a0ac'], nubes: .95, sol: 0, estrellas: 0,
           amb: '#36414f', lluvia: 2, rayos: 1,
           nube: ['rgba(198,206,218,.88)', 'rgba(110,120,136,.60)'] },
    noche: { grad: ['#070a10', '#101722', '#1a2433'], nubes: .95, sol: 0, estrellas: 0,
             amb: '#a9b6d6', lluvia: 2, rayos: 1,
             nube: ['rgba(110,122,150,.62)', 'rgba(54,62,84,.34)'] },
  },
};

let capas = null;
let animacion = null;
let estadoActual = null;

const reducido = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Monta las capas una sola vez, detrás de todo el contenido. */
function montar() {
  if (capas) return capas;

  const raiz = document.createElement('div');
  raiz.className = 'cielo';
  raiz.setAttribute('aria-hidden', 'true');
  raiz.innerHTML = `
    <div class="cielo-grad"></div>
    <div class="cielo-astro"></div>
    <div class="cielo-estrellas"></div>
    <div class="cielo-nubes">${nubes()}</div>
    <canvas class="cielo-lluvia"></canvas>
    <div class="cielo-flash"></div>`;
  document.body.prepend(raiz);

  capas = {
    raiz,
    grad: raiz.querySelector('.cielo-grad'),
    astro: raiz.querySelector('.cielo-astro'),
    estrellas: raiz.querySelector('.cielo-estrellas'),
    nubes: raiz.querySelector('.cielo-nubes'),
    canvas: raiz.querySelector('.cielo-lluvia'),
    flash: raiz.querySelector('.cielo-flash'),
  };
  capas.estrellas.innerHTML = estrellas(70);
  return capas;
}

/**
 * Nubes: masas de varios lóbulos desenfocados, repartidas en tres planos.
 *
 * La técnica base es la de la maqueta —degradado radial y blur— y lo que la
 * hace funcionar es el color: gris azulado, no blanco. El blanco puro salta
 * como mancha contra cualquier fondo; este tono se integra como bruma.
 *
 * Sobre eso, dos cosas que antes no estaban. Una sola elipse por nube se lee
 * como óvalo perfecto, que es justo lo que delata que es CSS: ahora cada nube
 * son cinco lóbulos de distinto tamaño con base plana y tope irregular, que el
 * blur funde en una silueta orgánica. No es volver a las siluetas SVG —esas
 * quedaban recortadas por el viewBox—, porque acá no hay recorte: son cajas
 * normales y el desenfoque las une.
 *
 * Y los tres planos dan paralaje: las del fondo van chicas, lentas, tenues y
 * muy desenfocadas; las del frente, grandes, rápidas y más definidas. Es lo
 * que da profundidad en vez de una tira de manchas a la misma distancia.
 */
const PLANOS = [
  { n: 4, w: [130, 240], top: [-2, 26], op: [.20, .36], blur: 34, dur: [150, 230] },
  { n: 3, w: [230, 380], top: [4, 40], op: [.34, .55], blur: 25, dur: [95, 150] },
  { n: 3, w: [340, 540], top: [14, 56], op: [.45, .72], blur: 17, dur: [55, 90] },
];

/**
 * Lóbulos, en fracción de la caja de la nube. La base es ancha y achatada; los
 * bultos de arriba, de tamaños distintos y sin simetría. El orden importa poco
 * porque el blur los promedia, pero las proporciones no: si todos miden igual
 * vuelve a leerse como un óvalo.
 */
const LOBULOS = [
  [.02, .46, .96, .54],
  [.10, .10, .46, .72],
  [.38, .00, .40, .64],
  [.60, .20, .36, .60],
  [.00, .32, .30, .52],
];

const entre = ([a, b]) => a + Math.random() * (b - a);

function nubes() {
  const salida = [];

  PLANOS.forEach((plano, profundidad) => {
    for (let i = 0; i < plano.n; i++) {
      const w = entre(plano.w);
      const h = w * (.42 + Math.random() * .16);
      const dur = entre(plano.dur);
      const bob = 18 + Math.random() * 16;

      const lobulos = LOBULOS.map(([x, y, lw, lh]) => {
        // Un poco de ruido por lóbulo: si no, las diez nubes son la misma
        // figura repetida y el ojo lo nota enseguida.
        const k = .88 + Math.random() * .24;
        return `<i style="left:${(x * 100).toFixed(1)}%;top:${(y * 100).toFixed(1)}%;` +
               `width:${(lw * k * 100).toFixed(1)}%;height:${(lh * k * 100).toFixed(1)}%"></i>`;
      }).join('');

      salida.push(
        `<span class="nube" style="top:${entre(plano.top).toFixed(1)}%;` +
        `opacity:${entre(plano.op).toFixed(2)};z-index:${profundidad};` +
        `animation-duration:${dur.toFixed(0)}s;` +
        `animation-delay:${(-Math.random() * dur).toFixed(0)}s">` +
          `<span class="nube-cuerpo" style="width:${w.toFixed(0)}px;height:${h.toFixed(0)}px;` +
          `filter:blur(${plano.blur}px);animation-duration:${bob.toFixed(0)}s;` +
          `animation-delay:${(-Math.random() * bob).toFixed(0)}s">${lobulos}</span>` +
        `</span>`
      );
    }
  });

  return salida.join('');
}

function estrellas(n) {
  let out = '';
  for (let i = 0; i < n; i++) {
    const x = (Math.random() * 100).toFixed(2);
    const y = (Math.random() * 62).toFixed(2);
    const r = (Math.random() * 1.3 + .5).toFixed(2);
    const d = (Math.random() * 4 + 2).toFixed(1);
    const t = (Math.random() * 4).toFixed(1);
    out += `<span style="left:${x}%;top:${y}%;width:${r}px;height:${r}px;animation-duration:${d}s;animation-delay:${t}s"></span>`;
  }
  return out;
}

/**
 * Aplica una condición. `nombre` es el mismo vocabulario que los iconos
 * (despejado / nuboso / cubierto / lluvia / tormenta / niebla) y `noche`
 * decide la variante.
 */
export function aplicarCielo(nombre, esNoche) {
  const c = montar();
  const set = CIELOS[nombre] ?? CIELOS.nuboso;
  const s = esNoche ? set.noche : set.dia;

  if (estadoActual === `${nombre}|${esNoche}`) return;
  estadoActual = `${nombre}|${esNoche}`;

  const paradas = s.grad
    .map((c, i) => `${c} ${((i / (s.grad.length - 1)) * 100).toFixed(0)}%`)
    .join(', ');
  c.grad.style.background = `linear-gradient(180deg, ${paradas})`;
  c.nubes.style.opacity = s.nubes;

  // Las nubes se tiñen con la condición: cálidas contra un sol bajo, plomizas
  // con tormenta. Con un gris fijo, el cielo cambiaba y ellas no, y se notaba.
  if (s.nube) {
    c.nubes.style.setProperty('--nube-a', s.nube[0]);
    c.nubes.style.setProperty('--nube-b', s.nube[1]);
  }
  c.estrellas.style.opacity = s.estrellas ?? 0;
  c.raiz.classList.toggle('cielo-con-niebla', !!s.niebla);

  // El acento del sitio lo define el cielo: con tormenta todo se apaga, con
  // sol se entibia.
  document.documentElement.style.setProperty('--amb', s.amb);

  if (s.sol) {
    const [x, y] = s.solPos ?? [74, 24];
    const col = s.solColor;

    // La caja es mucho más grande que el disco visible: el halo necesita lugar
    // para desvanecerse. Antes el degradado iba a color pleno hasta el 32 % y
    // recién ahí caía, así que se veía un disco de borde mojado, y el
    // box-shadow le agregaba un anillo con corte propio.
    //
    // Un astro real es un núcleo chico y muy brillante con una cola de luz
    // larguísima y tenue. Eso son muchas paradas juntas cerca del centro y
    // pocas, muy separadas, hacia afuera.
    const tam = esNoche ? 300 : 620;
    const nucleo = esNoche ? 9 : 4.6;   // radio del disco, en % de la caja
    const p = (k) => (nucleo * k).toFixed(1);

    const capas = esNoche
      // Luna: disco definido, halo corto. Si se le da la misma cola que al sol
      // parece una lámpara.
      ? `#ffffff 0%, ${col} ${p(0.9)}%, ${col}cc ${p(1)}%, ` +
        `${col}40 ${p(1.9)}%, ${col}12 ${p(3.4)}%, transparent 62%`
      // Sol: núcleo blanco, y de ahí una caída larga hasta casi nada.
      : `#ffffff ${p(0.35)}%, ${col} ${p(1)}%, ${col}b8 ${p(1.7)}%, ` +
        `${col}5c ${p(3.1)}%, ${col}24 ${p(5.4)}%, ${col}0d ${p(8.6)}%, transparent 72%`;

    Object.assign(c.astro.style, {
      opacity: s.sol, left: `${x}%`, top: `${y}%`,
      width: `${tam}px`, height: `${tam}px`,
      marginLeft: `${-tam / 2}px`, marginTop: `${-tam / 2}px`,
      background: `radial-gradient(circle, ${capas})`,
      boxShadow: 'none',
    });
  } else {
    c.astro.style.opacity = 0;
  }

  arrancarAnimacion(s.lluvia ?? 0, !!s.rayos);
}

/**
 * Lluvia y rayos en canvas. Solo corre si hace falta: sin precipitación no hay
 * bucle, y se frena cuando la pestaña queda en segundo plano.
 */
function arrancarAnimacion(lluvia, rayos) {
  const c = capas;
  cancelAnimationFrame(animacion);
  animacion = null;
  c.flash.style.opacity = 0;

  if ((!lluvia && !rayos) || reducido()) {
    c.canvas.style.opacity = 0;
    return;
  }
  c.canvas.style.opacity = 1;

  const ctx = c.canvas.getContext('2d');
  let gotas = [];
  let destello = 0;

  // Las gotas se dibujan claras sobre cielo oscuro y oscuras sobre cielo
  // diurno: con un solo color, en tema claro la lluvia desaparecía.
  const claro = document.documentElement.dataset.tema === 'claro';
  const tintaGota = claro ? '46,72,104' : '174,198,255';
  const fuerzaGota = claro ? 1.5 : 1;

  const medir = () => {
    c.canvas.width = innerWidth;
    c.canvas.height = innerHeight;
    const n = lluvia === 2 ? 260 : 150;
    gotas = Array.from({ length: n }, () => ({
      x: Math.random() * c.canvas.width,
      y: Math.random() * c.canvas.height,
      l: 8 + Math.random() * 14,
      v: 6 + Math.random() * 8,
      o: .18 + Math.random() * .35,
    }));
  };
  medir();
  addEventListener('resize', medir, { passive: true });

  const paso = () => {
    ctx.clearRect(0, 0, c.canvas.width, c.canvas.height);

    if (lluvia) {
      ctx.lineCap = 'round';
      ctx.lineWidth = lluvia === 2 ? 1.6 : 1.2;
      for (const d of gotas) {
        ctx.strokeStyle = `rgba(${tintaGota},${Math.min(d.o * fuerzaGota, .95)})`;
        ctx.beginPath();
        ctx.moveTo(d.x, d.y);
        ctx.lineTo(d.x - 2, d.y + d.l);
        ctx.stroke();
        d.y += d.v * (lluvia === 2 ? 1.5 : 1);
        d.x -= .6;
        if (d.y > c.canvas.height) { d.y = -10; d.x = Math.random() * c.canvas.width; }
      }
    }

    if (rayos) {
      if (destello <= 0 && Math.random() < .005) destello = 1;
      if (destello > 0) {
        c.flash.style.opacity = destello * (.45 + Math.random() * .5);
        destello -= .08;
      } else {
        c.flash.style.opacity = 0;
      }
    }

    animacion = requestAnimationFrame(paso);
  };
  paso();

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { cancelAnimationFrame(animacion); animacion = null; }
    else if (!animacion) paso();
  });
}
