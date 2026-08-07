# Pampero

Visor del tiempo para Uruguay construido sobre los datos de INUMET.

```bash
node server.js      # http://localhost:8080
PORT=3000 node server.js
```

Sin dependencias. Node 18+ (usa `fetch` global).

---

## El "API" de INUMET

INUMET no publica una API documentada, pero su sitio se alimenta de endpoints
JSON estables. Los cuatro que usa este proyecto, encontrados leyendo el bundle
de sus SPAs y el módulo Drupal `climav2`:

| Recurso | URL | Contenido |
|---|---|---|
| Observaciones | `/reportes/estadoActual/datos_inumet_ui_publica.mch` | 72 h horarias, 91 estaciones, 11 variables |
| Pronóstico | `/reportes/pronosticos/pronosticoV4.json` | 7 días × 7 zonas, con mañana y tarde/noche |
| Catálogo | `/reportes/estaciones/estaciones.mch` | 906 estaciones con departamento, lat/lon, altitud |
| Avisos | `/` (portada) | Embebidos como `var aviso` / `var alerta` en un `<script>` inline |

Todos responden `application/json` salvo la portada. `.mch` es JSON a pesar de
la extensión.

### Cosas que hay que saber

**No mandan CORS.** Ninguno de esos endpoints devuelve
`Access-Control-Allow-Origin`, así que el navegador no puede llamarlos directo:
hace falta un proxy propio. Eso es lo que hace `server.js`.

**Las observaciones vienen en columnas, y el anidamiento engaña.** El array
`observaciones` está indexado por *variable*, no por estación:

```
observaciones[iVariable].datos[iEstacion][iTiempo]
observaciones[iVariable].iFechas[iTiempo]  →  índice en el array global `fechas`
```

Cada variable trae su propio `iFechas`, así que las series no están alineadas
entre sí: hay que reconstruirlas una por una. `indexarEstado()` lo resuelve.

**Los valores son de tipo mixto.** La misma variable llega como número (`13.7`),
como string (`"150"`) o como texto (`"TRAZA"`, cuando llovió menos de lo
medible). Siempre coercionar; ver `num()`.

**Las unidades no son las que uno espera.** El viento viene en **nudos**, no en
km/h. La temperatura usa `ºC` con el carácter *masculine ordinal* (U+00BA), no
el símbolo de grado.

**Los avisos no tienen endpoint.** Están embebidos en el HTML de la portada.
`extraerAvisos()` los saca con una regex sobre el `<script>` inline. Es lo más
frágil del proyecto: si INUMET cambia el markup, se rompe. El resto sigue
andando porque cada fuente se cachea por separado.

**El campo `zonas` de un aviso viene pegado**, con los departamentos sin
separador limpio: `…y Topador.Cerro Largo : Arévalo…` y también
`Salto(Todo el departamento), Tacuarembó : Achar…`. `partirZonas()` maneja las
dos formas.

**`categoria` es un objeto**, no un string: `{riesgoViento, riesgoLluvia,
riesgoTormenta}` donde solo los riesgos vigentes traen valor. No trae el nivel
de color (amarillo/naranja/rojo) en este JSON.

**Hay bugs del lado de ellos.** El campo `grupo` del pronóstico a veces trae el
día en inglés (`"Thu 06"` entre días en español). Por eso las fechas se derivan
de `inicioPronostico + diaMasN` en lugar de confiar en la etiqueta.

**`estadoTiempo` no está documentado.** Los códigos observados son
1, 2, 4, 6, 7, 11, 12, 13 y mezclan variantes de día y de noche. El texto libre
(`descripcion`, `evolucion`) es mucho más confiable, así que `icono()` decide
por palabras y usa el código solo para desempatar.

**No copies su API key de Google Maps.** La portada de INUMET expone una key de
Static Maps en el HTML. Es de ellos: usarla te deja colgado de su cuota y de su
facturación. Este proyecto dibuja su propio mapa de puntos y no la toca.

### Ser buen vecino

El origen declara `max-age` de 60–300 s. `server.js` cachea por 300 s (24 h el
catálogo) en memoria, compartido entre todos los visitantes: una instancia hace
como mucho ~12 requests/hora a INUMET sin importar cuánta gente la use. Si el
origen falla, se sigue sirviendo lo último bueno con `rancio: true` en la
respuesta. Manda un `User-Agent` identificable.

---

## API propia

Normalizada, con CORS abierto y unidades convertidas.

| Endpoint | Devuelve |
|---|---|
| `GET /api/ahora.json` | Condición actual de cada estación, con departamento y zona de pronóstico |
| `GET /api/estacion/<id>.json` | Las 72 h de todas las variables de una estación |
| `GET /api/pronostico.json` | 7 días × 7 zonas, con icono ya resuelto |
| `GET /api/avisos.json` | Avisos y advertencias vigentes, con zonas parseadas |

Las rutas terminan en `.json` a propósito: son los mismos nombres que produce el
build estático, así que lo que ves en local es literalmente lo que se publica.

```console
$ curl -s localhost:8080/api/ahora.json | jq '.estaciones[] | select(.nombre=="Prado")'
{
  "id": 211,
  "nombre": "Prado",
  "temp": 13.7,
  "humedad": 95,
  "sensacion": 13.7,
  "viento": { "kmh": 7, "nudos": 4, "dir": 130, "card": "SE" },
  "presion": 1012.8,
  "visibilidad": 0.5,
  "departamento": "Montevideo",
  "zonaId": 88,
  "pais": "UY"
}
```

Notas sobre lo que agrega esta capa:

- **Viento en km/h** además de los nudos originales, con punto cardinal.
- **Sensación térmica**, que INUMET no publica: wind chill (JAG/TI) bajo 10 °C
  con viento, heat index sobre 27 °C con humedad ≥ 40 %, y la temperatura tal
  cual fuera de esos rangos.
- **Zona de pronóstico por estación** (`zonaId`), por centroide más cercano —
  es una aproximación, INUMET no publica el polígono de cada zona.
- **`pais`**: 27 de las 91 estaciones son de Argentina y Brasil. Vienen marcadas
  `"XX"` para poder filtrarlas.

## Frontend

`public/` es HTML, CSS y un módulo JS, sin build ni dependencias. Incluye tema
claro/oscuro, gráficos SVG dibujados a mano con crosshair, tabla alternativa
para lectura accesible de las series, y un mapa del país con escala divergente
frío↔calor.

### El mapa

`public/uruguay.json` son los 19 departamentos, de
[geoBoundaries](https://www.geoboundaries.org) gbOpen (CC BY 4.0, derivado de
OpenStreetMap). El original pesa 415 KB; está simplificado con Douglas-Peucker
(ε = 0.008°) y 3 decimales hasta 41 KB, que a este tamaño de dibujo se ve igual.

La proyección es equirectangular con corrección `cos(φ)` — sin eso el país sale
estirado a lo ancho. El encuadre usa la bbox del país, no la de las estaciones,
para que el norte de Artigas no quede cortado.

Las etiquetas de temperatura se separan con un empuje mutuo, pero **con tope de
desplazamiento** (1.5 × radio): sin ese límite los puntos costeros terminan en
el agua, y sobre un mapa real eso miente sobre dónde está la estación. Si dos
estaciones están de verdad pegadas, se solapan.

Para regenerar la geometría con otro nivel de detalle:

```bash
curl -sL "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/URY/ADM1/geoBoundaries-URY-ADM1_simplified.geojson" -o ury.geojson
node tools/simplificar.mjs ury.geojson public/uruguay.json 0.008
```

## Desplegar

**No hay servidor.** Pages no ejecuta código y el navegador no puede hablar con
INUMET directamente (no mandan CORS), así que el scraping corre en CI: cada
media hora `tools/generar.mjs` consulta INUMET y deja los JSON ya normalizados
junto al sitio.

```
                      cron */30 (GitHub Actions)
                                 │
                   node tools/generar.mjs dist
                                 │
clima.anderkitty.pink  ◄──  gh-pages  (sitio + api/*.json)
```

Los archivos que produce son exactamente las rutas que sirve `server.js`
(`api/ahora.json`, `api/pronostico.json`, `api/avisos.json`,
`api/estacion/<id>.json`), así que el front no distingue entre local y
producción. Para desarrollar alcanza con `node server.js`.

`public/index.html` trae un `<meta name="clima-api">` vacío: mismo origen. Poner
una URL ahí vuelve a apuntar a un backend propio, por si algún día el scraping
tiene que correr fuera de CI.

> **Nota histórica.** Hubo una API en un VPS (`api-clima.anderkitty.pink`), con
> Caddy y límites de cgroup para convivir con un scanner que barría 2.5 M de IPs
> por día. El proveedor suspendió la red de esa máquina y el sitio se cayó
> entero. Generar en CI eliminó esa dependencia. Los archivos de `deploy/` siguen
> en el repo por si hiciera falta volver, pero no se usan.

### El cron

GitHub apaga los workflows programados en repos sin actividad por 60 días. Si
los datos se congelan, es eso: se reactiva con un commit o desde la pestaña
Actions.

## Licencia y atribución

Los datos son de [INUMET](https://www.inumet.gub.uy). Este es un visor
independiente y no oficial. Para alertas meteorológicas, la fuente autoritativa
es siempre INUMET.
