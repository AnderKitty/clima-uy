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
    dia: { grad: ['#152038', '#2a3c68', '#7d5a3c', '#d0904c'], nubes: .28, sol: 1,
           solColor: '#ffcf7a', solPos: [74, 72], estrellas: 0, amb: '#ffcf8a' },
    noche: { grad: ['#070b16', '#0d1526', '#16233c'], nubes: .22, sol: .55,
             solColor: '#cfe0ff', solPos: [76, 20], estrellas: 1, amb: '#aab8dd' },
  },
  nuboso: {
    dia: { grad: ['#18202f', '#26324a', '#3a4a66'], nubes: .7, sol: .45,
           solColor: '#ffdca0', solPos: [72, 30], estrellas: 0, amb: '#9db8ff' },
    noche: { grad: ['#0d1420', '#182233', '#25344a'], nubes: .6, sol: .3,
             solColor: '#cfe0ff', solPos: [74, 22], estrellas: .6, amb: '#9db8ff' },
  },
  cubierto: {
    dia: { grad: ['#1a2130', '#2b3546', '#414d61'], nubes: .85, sol: 0, estrellas: 0, amb: '#b9c6de' },
    noche: { grad: ['#0c1119', '#171e29', '#232c3a'], nubes: .8, sol: 0, estrellas: 0, amb: '#8794aa' },
  },
  niebla: {
    dia: { grad: ['#20262f', '#333c48', '#4c5765'], nubes: .95, sol: 0, estrellas: 0,
           amb: '#c3cad1', niebla: 1 },
    noche: { grad: ['#11151b', '#1c222b', '#28303b'], nubes: .9, sol: 0, estrellas: 0,
             amb: '#8b95a3', niebla: 1 },
  },
  lluvia: {
    dia: { grad: ['#121824', '#1f2a3b', '#2d3b50'], nubes: .8, sol: 0, estrellas: 0,
           amb: '#8fb4ff', lluvia: 1 },
    noche: { grad: ['#0a1018', '#141d2a', '#1f2c3e'], nubes: .82, sol: 0, estrellas: 0,
             amb: '#7cb8f5', lluvia: 1 },
  },
  tormenta: {
    dia: { grad: ['#0b1019', '#161e2e', '#232f45'], nubes: .92, sol: 0, estrellas: 0,
           amb: '#a9b6d6', lluvia: 2, rayos: 1 },
    noche: { grad: ['#070a10', '#101722', '#1a2433'], nubes: .95, sol: 0, estrellas: 0,
             amb: '#a9b6d6', lluvia: 2, rayos: 1 },
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
 * Nubes: manchas grandes con degradado radial y desenfoque.
 *
 * Es la técnica de la maqueta original, con sus valores. La probé primero con
 * blanco puro y quedaban "puntos blancos moviéndose"; después con siluetas SVG
 * y quedaba un borrón. Lo que la hace funcionar no es la forma sino el color:
 * gris azulado (no blanco) sobre un cielo oscuro. El blanco puro salta como
 * mancha contra cualquier fondo; este tono se integra como bruma.
 */
function nubes() {
  const capa = [];
  for (let i = 0; i < 9; i++) {
    const w = 180 + Math.random() * 260;
    const dur = 50 + Math.random() * 70;
    capa.push(
      `<span class="nube" style="width:${w.toFixed(0)}px;height:${(w * .55).toFixed(0)}px;` +
      `top:${(Math.random() * 55).toFixed(1)}%;opacity:${(.5 + Math.random() * .5).toFixed(2)};` +
      `animation-duration:${dur.toFixed(0)}s;animation-delay:${(-Math.random() * dur).toFixed(0)}s"></span>`
    );
  }
  return capa.join('');
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
