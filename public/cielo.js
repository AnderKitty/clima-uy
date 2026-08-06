// Cielo ambiental: el fondo reacciona a lo que está pasando de verdad.
//
// Capas fijas detrás de todo — degradado, nubes a la deriva, estrellas, halo
// del sol o la luna — más un canvas de lluvia y destellos de tormenta. Nada de
// esto es dato: es atmósfera. Los números siempre mandan y van por encima.

const $ = (s) => document.querySelector(s);

/**
 * Paletas por condición y momento del día. `amb` es el color de acento que
 * toma el resto de la interfaz, así que el sitio entero se tiñe con el clima.
 */
const CIELOS = {
  despejado: {
    dia: { grad: ['#7fb3e8', '#a9cdf0', '#dce9f7'], nubes: .18, sol: .9, solColor: '#fff3c4', solPos: [76, 22], estrellas: 0, amb: '#2a78d6' },
    noche: { grad: ['#070b16', '#0d1526', '#1b2a44'], nubes: .12, sol: .5, solColor: '#cfe0ff', solPos: [76, 20], estrellas: 1, amb: '#9db8ff' },
  },
  nuboso: {
    dia: { grad: ['#8fb0cf', '#b6cade', '#dbe5ee'], nubes: .55, sol: .5, solColor: '#ffeab8', solPos: [72, 26], estrellas: 0, amb: '#4a7fbf' },
    noche: { grad: ['#0d1420', '#182233', '#25344a'], nubes: .5, sol: .3, solColor: '#cfe0ff', solPos: [74, 22], estrellas: .5, amb: '#9db8ff' },
  },
  cubierto: {
    dia: { grad: ['#8d98a6', '#adb8c4', '#ccd4dc'], nubes: .85, sol: 0, estrellas: 0, amb: '#5b6472' },
    noche: { grad: ['#0c1119', '#171e29', '#232c3a'], nubes: .8, sol: 0, estrellas: 0, amb: '#8794aa' },
  },
  niebla: {
    dia: { grad: ['#a8b0b8', '#c3cad1', '#dde1e5'], nubes: .95, sol: 0, estrellas: 0, amb: '#6b7480', niebla: 1 },
    noche: { grad: ['#11151b', '#1c222b', '#28303b'], nubes: .9, sol: 0, estrellas: 0, amb: '#8b95a3', niebla: 1 },
  },
  lluvia: {
    dia: { grad: ['#6f7f92', '#8d9db0', '#b3c0cd'], nubes: .8, sol: 0, estrellas: 0, amb: '#2a78d6', lluvia: 1 },
    noche: { grad: ['#0a1018', '#141d2a', '#1f2c3e'], nubes: .82, sol: 0, estrellas: 0, amb: '#7cb8f5', lluvia: 1 },
  },
  tormenta: {
    dia: { grad: ['#525d6c', '#6d7a8a', '#94a1b0'], nubes: .95, sol: 0, estrellas: 0, amb: '#3d4757', lluvia: 2, rayos: 1 },
    noche: { grad: ['#070a10', '#101722', '#1a2433'], nubes: .95, sol: 0, estrellas: 0, amb: '#a9b6d6', lluvia: 2, rayos: 1 },
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
 * Nubes en SVG con bordes deshilachados por ruido fractal.
 *
 * Una elipse con `blur` no parece una nube: no tiene silueta, queda una mancha
 * difusa. Y una silueta con borde limpio parece una calcomanía. Lo que da el
 * aspecto correcto es una silueta de lóbulos superpuestos deformada con
 * feTurbulence + feDisplacementMap: el contorno se vuelve irregular y algodonoso
 * sin perder la forma.
 *
 * El filtro se aplica a formas estáticas y solo se anima el `transform` del
 * grupo, así el navegador cachea el resultado del filtro y no lo recalcula por
 * cuadro.
 */
function nubeSilueta(semilla) {
  // Lóbulos de una nube cúmulo: base ancha y chata, coronas de distinto radio.
  const lobulos = [
    [50, 58, 46, 26], [96, 48, 38, 30], [140, 60, 42, 24],
    [74, 40, 34, 27], [118, 38, 30, 24], [30, 62, 30, 20], [162, 64, 28, 18],
  ];
  const r = (n) => ((Math.sin(semilla * 12.9898 + n * 78.233) * 43758.5453) % 1 + 1) % 1;

  const formas = lobulos.map(([cx, cy, rx, ry], i) =>
    `<ellipse cx="${(cx + (r(i) - .5) * 14).toFixed(1)}" cy="${(cy + (r(i + 9) - .5) * 8).toFixed(1)}" ` +
    `rx="${(rx * (.85 + r(i + 3) * .4)).toFixed(1)}" ry="${(ry * (.85 + r(i + 5) * .4)).toFixed(1)}"/>`
  ).join('');

  return `<g filter="url(#deshilachar)">${formas}</g>`;
}

function nubes() {
  const capas = [];
  for (let i = 0; i < 9; i++) {
    const escala = .55 + Math.random() * 1.5;
    const y = -4 + Math.random() * 62;
    const dur = 170 + Math.random() * 260;
    const retraso = -Math.random() * dur;
    const op = .28 + Math.random() * .42;

    capas.push(
      `<span class="nube" style="top:${y.toFixed(1)}%;opacity:${op.toFixed(2)};` +
      `animation-duration:${dur.toFixed(0)}s;animation-delay:${retraso.toFixed(0)}s">` +
      `<svg viewBox="0 0 200 100" width="${(200 * escala).toFixed(0)}" height="${(100 * escala).toFixed(0)}" ` +
      `fill="#fff" aria-hidden="true">${nubeSilueta(i + 1)}</svg></span>`
    );
  }

  // Un solo <defs> para todas: el filtro es caro de declarar por nube.
  return `<svg width="0" height="0" class="cielo-defs"><defs>
      <filter id="deshilachar" x="-25%" y="-40%" width="150%" height="180%">
        <feTurbulence type="fractalNoise" baseFrequency="0.015 0.035"
                      numOctaves="4" seed="7" result="ruido"/>
        <feDisplacementMap in="SourceGraphic" in2="ruido" scale="26"
                           xChannelSelector="R" yChannelSelector="G" result="roto"/>
        <feGaussianBlur in="roto" stdDeviation="5"/>
      </filter>
    </defs></svg>` + capas.join('');
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

  c.grad.style.background = `linear-gradient(180deg, ${s.grad[0]} 0%, ${s.grad[1]} 52%, ${s.grad[2]} 100%)`;
  c.nubes.style.opacity = s.nubes;
  c.estrellas.style.opacity = s.estrellas ?? 0;
  c.raiz.classList.toggle('cielo-con-niebla', !!s.niebla);

  // El acento del sitio lo define el cielo: con tormenta todo se apaga, con
  // sol se entibia.
  document.documentElement.style.setProperty('--amb', s.amb);

  if (s.sol) {
    const [x, y] = s.solPos ?? [74, 24];
    const tam = esNoche ? 110 : 190;
    Object.assign(c.astro.style, {
      opacity: s.sol, left: `${x}%`, top: `${y}%`,
      width: `${tam}px`, height: `${tam}px`, marginLeft: `${-tam / 2}px`, marginTop: `${-tam / 2}px`,
      background: `radial-gradient(circle, ${s.solColor} 0%, ${s.solColor} 32%, transparent 72%)`,
      boxShadow: `0 0 140px 50px ${s.solColor}44`,
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
        ctx.strokeStyle = `rgba(174,198,255,${d.o})`;
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
