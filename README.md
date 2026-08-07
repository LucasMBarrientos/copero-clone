# Confecon Career (Copero clone)

Clon jugable, con fines lúdicos y educativos (no comercial), del mini-juego "Simulador de Carrera"
de [Copero](https://copero.com.ar/juegos/simulador-carrera). Creás un futbolista ficticio, elegís
ofertas de clubes cada una o más temporadas, y tu carrera se autosimula (estadísticas, OVR, valor de
mercado, trofeos) hasta el retiro.

Todos los países, ligas y clubes son **100% ficticios**, tomados del universo de
[Confecon](https://sites.google.com/view/confecon) (un sitio de fútbol ficticio no relacionado con
Copero). No se usa ningún nombre real de país, liga, club ni jugador.

## Cómo jugar

```bash
python -m http.server 8791
```

Abrí `http://localhost:8791`.

1. Elegí dificultad (Intensa / Normal / Exprés) — define cada cuántas temporadas tomás decisiones.
2. Definí tu identidad: apellido, número, pierna hábil, nacionalidad (ficticia, con camiseta de
   selección con los colores/patrón reales de esa bandera) y posición.
3. En cada punto de decisión puede aparecer primero un **evento de carrera** (lesión, tatuaje,
   crisis institucional, oferta de un club rival, etc. — ver abajo) y después la oferta de clubes
   (con escudo). Fichá por uno de los clubes ofertados o quedate en tu club actual. La carrera se
   simula sola con roles/minutos/goles/asistencias/OVR según tu nivel contra el nivel del club, y
   podés ganar trofeos.
4. Al llegar al retiro (40 años) se muestra el resumen de carrera con logros desbloqueados.

El progreso se autoguarda en `localStorage` (sin cuentas ni login).

## Mecánicas (reimplementadas del juego original)

El motor (`js/engine.js` + `js/config.js`) reimplementa las fórmulas reales de Copero
—reconstruidas a partir de su bundle JS público, sin copiar su base de datos ni sus assets—
adaptadas a nuestro catálogo ficticio de Confecon:

- **Divisiones reales**: cada país conserva las divisiones que tiene en Confecon (1ra, 2da, y hasta
  3ra en Pasburgo). Los clubes ascienden y descienden entre ellas durante tu carrera — siempre como
  un intercambio (un club sube, otro baja), y solo donde esa división existe en ese país.
- **Reputación de club** (`domestic`/`continental`/`international`, derivadas del OVR real de cada
  club de Confecon y penalizadas por el nivel de división) determina el nivel base esperado en ese
  club. Los OVR de club y de jugador son siempre números enteros.
- **Rol y minutos**: tu OVR contra ese nivel base decide si sos titular, rotación, suplente o
  tercer arquero, y cuántos partidos jugás.
- **Goles/asistencias**: dependen de tu posición (delantero/creador/soporte/defensivo/arquero), tu
  nivel relativo al equipo y la fuerza del plantel.
- **Crecimiento de OVR**: curva por edad con perfil de desarrollo (precoz/normal/tardío, asignado
  al azar por jugador), penalizada si pasás varias temporadas sin jugar.
- **Ofertas**: la oferta de cantera viene de las divisiones más bajas de tu país; el mercado de pases
  genera hasta 2 ofertas por "paseo aleatorio" alrededor de tu nivel, con más chance de ofertas
  globales cuanto mejor sea tu OVR.
- **Trofeos**: liga/copa/copa continental primaria/secundaria, con probabilidad según la reputación
  efectiva del club (un jugador estrella en un club chico infla esa reputación efectiva). Solo los
  clubes de 1ra división pueden ganar liga o torneos continentales. Cada título, ascenso o descenso
  dispara una animación de celebración a pantalla completa.
- **Lesiones**: 10 tipos con peso y penalización de OVR distintos (de esguince leve a rotura de
  Aquiles), más el evento interactivo "Molestia física".
- **Eventos de carrera**: catálogo reducido de los eventos personales/de club de Copero (entrenamiento
  extra, tatuaje, crisis institucional, oferta de un rival, cambio de posición, etc.), cada uno con
  tarjetas ilustradas y píldoras que anticipan las consecuencias de cada opción. Se omiten los
  eventos de selección nacional/Mundial porque Confecon no tiene datos de selecciones.

## Datos: procedencia (Confecon)

`data/countries.json` se generó con `scripts/scrape_confecon.py`, que descarga la 1ra división de
cada uno de los 11 países de Confecon (Mirmania, Kentimbo, Zirmagna, Alartela, Pasburgo, Jopán,
Liconia, Everiá, Razú, Baigorria, Paltia) como CSV público desde Google Sheets, y arma el catálogo
(club, ciudad, estadio, capacidad, fundación, plantel, OVR, valor de mercado). El CSV crudo de cada
país queda cacheado en `data/countries.raw/` para trazabilidad. Algunas celdas del sheet original
tienen fórmulas rotas (`#REF!`); en esos casos se genera un OVR/valor de reemplazo determinístico
(no aleatorio real) solo para que el club siga siendo jugable, documentado en el propio script.

Para regenerar el catálogo (por ejemplo si Confecon actualiza sus planillas):

```bash
python scripts/scrape_confecon.py
```

Las banderas SVG de los 11 países (`assets/flags/`) se reutilizaron del proyecto hermano
`cyberfoot-clone/` (mismo universo ficticio de nombres de países). `data/kits.json`
(`scripts/extract_flag_colors.py`) deriva una camiseta de selección (colores + patrón: sólido,
rayas verticales, tablero o banda diagonal) de cada bandera, ya que Confecon no tiene datos de
selecciones nacionales.

## Estructura

- `index.html` / `css/style.css` — shell de la SPA y estilos (incluye la animación de celebración de
  trofeo, reconstruida del CSS real de Copero).
- `js/config.js` — todas las tablas reimplementadas de Copero (reputación, apariciones, crecimiento
  de OVR, goles/asistencias, trofeos, lesiones, catálogo de eventos) más las ajustables del juego
  (dificultades, fórmula de valor).
- `js/data.js` — carga el catálogo `data/countries.json` + `data/kits.json` y deriva la reputación
  de cada club.
- `js/jersey.js` — camiseta SVG (forma exacta reconstruida del bundle de Copero) con colores por
  nacionalidad.
- `js/crest.js` — escudos de club generados proceduralmente (Confecon no tiene imágenes de escudo).
- `js/engine.js` — motor de simulación (ofertas, rol/apariciones/crecimiento/goles por temporada,
  trofeos, eventos de carrera), compartido por las 3 dificultades.
- `js/state.js` — estado de partida y autoguardado en `localStorage`.
- `js/screens/*.js` — pantallas: dificultad, identidad, carrera (oferta + evento), resumen.
- `scripts/scrape_confecon.py` — scraper del catálogo de países/clubes.
- `scripts/extract_flag_colors.py` — deriva `data/kits.json` (colores/patrón de camiseta) de las
  banderas.

## Notas

- Proyecto propio, sin relación con Copero ni con Confecon más allá de tomar sus nombres ficticios
  como catálogo de datos públicos.
- No apto para uso comercial — es un proyecto lúdico/educativo.
