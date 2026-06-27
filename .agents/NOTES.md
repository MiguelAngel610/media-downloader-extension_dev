# Notas de Desarrollo: Media Downloader - Notas Técnicas

## Modularización: De Monolito a src/
**Fecha:** 27 de Junio de 2026
**Problema:** El archivo `content.js` tenía 1,639 líneas mezclando CSS, lógica de UI, extracción de medios, descarga y el loop de sync. Violaba la regla "Cero Monolitos" del AGENTS.md.
**Solución:** Se dividió en 14 módulos dentro de `src/instagram/` y 2 módulos en `src/x/`. El `manifest.json` carga los archivos en orden estricto para compartir el estado global vía `window.__md_*` (Vanilla JS, sin import/export). El `content.js` original se renombró a `content.js.bak` como respaldo hasta validación del usuario.
**Estructura:**
- `src/instagram/core/` — state.js, styles.js, vanish_init.js
- `src/instagram/utils/` — platform.js, username_resolver.js, media_resolver.js
- `src/instagram/ui/` — svgs.js, overlay_root.js, button_state.js
- `src/instagram/features/` — pfp_button.js, story_button.js, feed_buttons.js, video_progress.js
- `src/instagram/main.js` — orquestador principal + MutationObserver + click interceptor
- `src/x/` — x_buttons.js, content_x_init.js

## Problema: Barra de progreso desbordada en videos y carruseles
**Fecha:** 27 de Junio de 2026
**Problema:** La barra de progreso de video se inyectaba utilizando directamente el `getBoundingClientRect()` del elemento `<video>`. En componentes como carruseles o contenedores con recortes (`overflow: hidden`), el elemento `<video>` en realidad puede ser más grande o estar posicionado fuera del contenedor visible, haciendo que la barra de progreso "saliera" del video y se viera rota. Además, la barra no crecía exclusivamente hacia arriba al hacer hover.
**Solución:** 
1. **Lógica de Intersección:** Se agregó lógica en `content.js` para iterar por los padres del elemento video y detectar contenedores con `overflow: hidden/clipPath`. Se calcula el "rectángulo visible" (`visibleRect`) usando `Math.max`/`Math.min` con las coordenadas de estos ancestros.
2. **Posicionamiento y CSS:** Se ajustó el CSS asignando una altura base al contenedor (`16px`) y usando `margin-top: 12px` en el *track* del slider. Al hacer hover, la altura sube a `8px` y el `margin-top` baja a `8px`, logrando que la barra se expanda estrictamente hacia arriba desde el borde inferior del video.

## Problema: Barra de progreso con bordes rectos sobresaliendo de contenedores curvos
**Fecha:** 27 de Junio de 2026
**Problema:** Los videos en ciertos posts o vistas (ej. Reels) tienen bordes inferiores redondeados (`border-radius`), pero el track de la barra de progreso mantenía esquinas afiladas a 90 grados, viéndose poco natural y saliéndose visualmente del reproductor.
**Solución:**
- En la lógica de `content.js` que detecta los recortes del contenedor padre, también extraemos los estilos computados `borderBottomLeftRadius` y `borderBottomRightRadius` de los ancestros.
- Inyectamos ese radio directamente al estilo en línea de `.md-video-progress-container` y le aplicamos `overflow: hidden` por CSS.
- El resultado es que la barra siempre hereda de manera dinámica la curvatura de la esquina inferior, recortando las esquinas del track de manera limpia y nativa.

## Problema: Botones y barras tienen retraso (lag) al hacer scroll rápido en el feed principal
**Fecha:** 27 de Junio de 2026
**Problema:** El contenedor maestro (`#md-overlay-root`) que aloja los botones inyectados y las barras de progreso utilizaba `position: fixed`. Debido a que los elementos en pantalla se calculan usando `getBoundingClientRect()` en un ciclo asíncrono (o `requestAnimationFrame`), el scroll nativo del navegador (hilo de composición) iba más rápido que la actualización del hilo principal de JavaScript, causando que los elementos se separaran temporalmente de sus posiciones (efecto gelatina/lag).
**Solución:** 
- Cambié `#md-overlay-root` de `position: fixed` a `position: absolute`.
- Modifiqué la lógica de cálculo en `content.js` para sumar `window.scrollX` y `window.scrollY` a las posiciones. 
- Gracias a esto, el contenedor absoluto "viaja" nativamente con el scroll de la página de forma fluida y sincronizada a nivel navegador, eliminando por completo el retraso visual en el feed principal, mientras que el script simplemente recalcula sus anclajes silenciosamente en el fondo.

## Problema: Barra de progreso desaparece al salir y volver a la vista
**Fecha:** 27 de Junio de 2026
**Problema:** Al hacer scroll hacia abajo, la extensión removía del DOM la barra de progreso del video (`customContainer.remove()`) para ahorrar recursos cuando salía de la pantalla. Sin embargo, al volver a subir, el contenedor se recuperaba de la memoria caché (`window.__md_videoSliders`) pero nunca se volvía a reinsertar en el DOM, por lo que se volvía invisible permanentemente.
**Solución:**
- Se agregó una validación de estado: Si el `customContainer` existe en caché pero su `parentNode` no es el contenedor maestro (`overlayRoot`), se fuerza una re-inserción con `overlayRoot.appendChild(customContainer)`. Esto permite que la barra se recupere instantáneamente al volver a enfocar videos pasados.

## Problema: Temblor/Movimiento del botón de descarga al hacer hover
**Fecha:** 27 de Junio de 2026
**Problema:** Instagram aplica transformaciones CSS (`transform: scale()`) a sus botones (ej. Bookmark) cuando el usuario pone el cursor sobre ellos. Al usar `getBoundingClientRect()` constantemente para anclar nuestro botón de descarga, las medidas de ancho/alto y posición (left/top) cambiaban fraccionalmente durante la animación, causando que nuestro botón temblara o se desplazara hacia los lados intentando seguir un botón que se encogía.
**Solución:**
- En la función `syncOverlays` de `content.js`, se cambió la lógica matemática de anclaje.
- Ahora, obtenemos el tamaño original sin distorsiones del botón nativo (`offsetWidth` / `offsetHeight`).
- Calculamos el **centro absoluto** del botón nativo (`cx`, `cy`), el cual es matemáticamente inmutable aunque el botón crezca o se encoja desde su centro.
- A partir del centro inmutable y las medidas originales, recalculamos el "rectángulo sin escalar" virtual y anclamos nuestro botón allí. 
- Resultado: El botón inyectado se mantiene 100% rígido e inmóvil aunque el botón de al lado esté temblando, encogiéndose o animándose.

## Problema: Botones y barras de progreso del feed son visibles sobre ventanas modales [PENDIENTE DE VALIDACIÓN]
**Fecha:** 27 de Junio de 2026
**Problema:** Al abrir supuestamente el detalle de un post en un modal (`div[role="dialog"]`), los elementos del feed de fondo "traspasaban" la sombra negra y se veían flotando extrañamente sobre el contenido.
**Solución Tentativa:**
- Se agregó una validación estricta usando `document.querySelector('div[role="dialog"]')` en el ciclo principal para ocultar la capa del feed si hay un modal abierto.
- *Nota:* Pendiente de comprobar exhaustivamente, ya que Instagram actualmente está redirigiendo los clics hacia la ruta `/reels/` completa (pantalla completa) en lugar de abrir el modal tradicional en ciertas cuentas. Se validará cuando se logre forzar la vista modal.

## Problema: Pantalla negra al entrar a un Reel desde el Feed
**Fecha:** 27 de Junio de 2026
**Problema:** Al hacer clic en un Reel desde el feed principal, especialmente desde abajo, la pantalla se ponía negra, se trababa la animación (unos 3 segundos), y los botones de descarga flotaban en la nada.
**Causa:** 
1. **Layout Thrashing:** `video_progress.js` estaba usando `window.getComputedStyle(parent)` en un loop `while` subiendo por el DOM, ¡60 veces por segundo (`requestAnimationFrame`)! Esto destruía el rendimiento del Main Thread durante la compleja animación FLIP de React para abrir el Reel, causando que se colgara y la pantalla quedara negra.
2. **Botones Flotantes:** Durante la transición, los botones nativos desaparecen o cambian bruscamente de lugar, provocando que nuestros clones intenten seguirlos por toda la pantalla.
**Solución:**
- Se eliminaron TODAS las llamadas a `getComputedStyle` dentro del `syncOverlays` de `requestAnimationFrame`. El contenedor que hace "clip" ahora se busca y cachea la primera vez que se descubre el video (`v.__md_clip_parent_calculated`).
- Se implementó un "Suspense de Transición": si la URL cambia (ej. de `/` a `/reels/`), el `syncOverlays` se pausa 1 segundo y se oculta todo el `md-overlay-root` con `opacity: 0` para permitir que React haga su animación sin interferencia de nuestros botones ni caída de FPS.

## Problema: Botón de descarga mal acomodado en los Reels
**Fecha:** 27 de Junio de 2026
**Problema:** El botón de descarga a veces no se renderizaba correctamente en la vista de Reels porque el chequeo del viewport era muy estricto y lo ocultaba a mitad del scroll. Además, el botón se renderizaba en lugares inconsistentes.
**Causa:** `rect.bottom <= window.innerHeight` forzaba a que el botón se esfumara antes de tiempo. Además, la lógica de posición fallaba en diferenciar el Feed de los Reels.
**Solución:** Se amplió la tolerancia del viewport sumando/restando `1000px` a los límites, igualando la suavidad del botón de guardado (bookmark) nativo al scrollear. Se separó la lógica de inyección condicional usando `item.isVertical`: si es verdadero (Reel) va arriba del bookmark, si es falso (Feed) va a la izquierda.

## Problema: Barra de progreso flotante durante transiciones de carrusel
**Fecha:** 27 de Junio de 2026
**Problema:** Al deslizar (hacer swipe) un carrusel de videos en el feed, la barra de progreso se despegaba de la base del video y saltaba al medio de la pantalla.
**Causa:** El algoritmo que ignoraba los márgenes negros (`object-fit: contain`) usaba `visibleRect.width` para calcular la posición real. Durante un slide, `visibleRect.width` se va encogiendo (porque el video es ocultado por la máscara del carrusel). Al encogerse el ancho, la matemática del Aspect Ratio (relación de aspecto) se rompía y calculaba que el video era muy pequeño, empujando la barra hacia arriba de forma irregular.
**Solución:** 
1. Se cambió la lógica para que use `rect.width` (el tamaño total del contenedor sin recortar) al calcular la posición base.
2. Se introdujo una máscara matemática dinámica (`clip-path: inset(...)`) calculada contra el `visibleRect`. Esto rebana y oculta la barra de progreso exactamente en el mismo lugar donde Instagram recorta el video durante el swipe, dándole una apariencia 100% nativa.

## Problema: Botón de descarga mal acomodado en los Reels y Pantallazo Negro
**Fecha:** 27 de Junio de 2026
**Problema 1 (Botón desalineado):** En la vista de Reels, la barra de acciones nativa es vertical, y se requería que el botón estuviera inyectado específicamente *arriba* del botón de guardado (entre el avión de papel y el guardado).
**Problema 2 (Pantallazo Negro al dar click a un video desde abajo):** Al intentar abrir un video desde el feed, si el video estaba casi fuera de pantalla (en la parte inferior), Instagram intentaba hacer una animación de auto-scroll, pero la pantalla se quedaba en negro, crasheando por completo la plataforma.
**Diagnóstico y Solución Definitiva del Pantallazo Negro:**
La causa raíz fue que `overlayRoot` tenía `width: 100%; height: 100%`, lo que expandía las dimensiones del documento. Esto rompía las animaciones FLIP de Instagram al abrir Reels desde posiciones bajas del feed. **Solución:** `width: 0; height: 0; overflow: visible` — la capa es invisible para los cálculos de tamaño de página.
**IMPORTANTE:** `position: absolute` + coordenadas de documento (`getBoundingClientRect + scrollY`) es la arquitectura CORRECTA para evitar el efecto "jelly". Con `position: fixed` los hijos usan coordenadas de viewport y sufren un retraso de 1 frame (~16ms) al scrollear, produciendo el efecto gelatina. Con `position: absolute` anclado al documento, el navegador mueve los elementos junto con el scroll sin ningún lag.
**Botón en Reels:** Posicionado ARRIBA del bookmark con `uTop - baseH - 16 + scrollY` en coordenadas de documento.

**Efecto Gelatina al scrollear en Reels:** Al hacer "swipe" rápido en los Reels, la plataforma hace animaciones supersónicas de scroll en contenedores internos invisibles para el motor del navegador. Esto causaba un desfase de 1 frame (16 milisegundos) entre nuestro botón y la interfaz, haciendo que se viera como gelatina flotante desprendida.
**Solución al Efecto Gelatina:** Se implementó un motor anti-gelatina (`Anti-Jelly Engine`). Ahora, **exclusivamente en la vista de Reels**, si el botón detecta que se está moviendo a una velocidad mayor a 5 píxeles por frame (como durante un swipe), su opacidad baja instantáneamente a 0 (se oculta). En el milisegundo exacto en que el usuario suelta el scroll y la pantalla se estabiliza, el botón reaparece flotando ya en su nueva ubicación final. ¡Un efecto visual ultra limpio! (Nota: Se desactivó este motor para el feed principal, ya que provocaba que el botón desapareciera erróneamente durante el scroll normal).

## Problema: Caída de fotogramas (Lag) al deslizar carruseles con la barra de progreso
**Fecha:** 27 de Junio de 2026
**Problema:** Al deslizar carruseles de videos, el teléfono/navegador se sentía lento y con lag.
**Causa:** El motor de sincronización (`requestAnimationFrame`) re-escribía propiedades del DOM (`style.left`, `style.top`, `style.width`, `clipPath`) 60 veces por segundo, incluso si no habían cambiado. Estas propiedades en particular fuerzan al navegador a recalcular el layout completo (Layout Thrashing).
**Solución:** 
- Se implementó un sistema de "caché virtual" guardando los últimos valores aplicados en variables `__md_last*`. El DOM ahora solo se actualiza si el valor matemáticamente cambió.
- Se reemplazó el posicionamiento estático (`left/top`) por `transform: translate3d(x,y,0)`. Esto transfiere la carga de trabajo del procesador (CPU) a la tarjeta gráfica (GPU), permitiendo un movimiento ultra fluido (Hardware Acceleration).

## Problema: Márgenes Negros, Botones Nativos Rotos y Pantallazos Negros Masivos
**Fecha:** 27 de Junio de 2026
**Problema:** Al entrar a la plataforma, se generaban márgenes negros gigantes en algunos videos de los carruseles (el layout se veía roto), al dar clic a un video no abría la ventana modal (solo se pausaba), y el problema de las "pantallas negras" seguía ocurriendo. Todo parecía estar relacionado con una falla masiva de la interfaz nativa.
**Causa:** Durante la refactorización (Modularización) a `src/`, se reescribió `overlay_root.js` anexando la capa de inyección al `document.body`. Instagram usa React (específicamente Portals altamente optimizados) que exige control absoluto y exclusivo sobre el `<body>`. Al detectar nuestro `<div>` intruso, React crasheaba silenciosamente en el fondo, interrumpiendo las actualizaciones de CSS del carrusel (dejando márgenes negros), rompiendo la delegación de eventos globales (impidiendo abrir el post) y matando las animaciones FLIP (pantalla negra).
**Solución:** Se incluyó un bloque `catch` para detectar el fallo de red, el cual despacha un mensaje a `background.js` (`action: "browser_download"`). El background utiliza `chrome.downloads.download()` para bajar el archivo directamente, saltándose las reglas estrictas de CORS del DOM. Se corrigió el archivo `overlay_root.js` para que la capa se ancle estrictamente en `document.documentElement` (el tag `<html>`), el cual es territorio completamente ignorado por React. Esto restauró instantáneamente toda la funcionalidad y diseño nativo de la plataforma.

#### 4. [Telegram WebK] Descargas de Video abortan inmediatamente con error 302
**Problema:** Al intentar descargar videos en canales de WebK, la consola escupía un `Error: Non 200/206 response was received: 302` y la descarga abortaba de inmediato. Resulta que en WebK, la etiqueta `<video>` no siempre tiene el atributo `.src` directo; a veces usa `currentSrc` o anida una etiqueta `<source>`. Al extraer `.src`, devolvía un string vacío `""`. Cuando `fetch("")` se ejecuta, el navegador intenta hacer GET a la URL base de la página (ej. `/k/`), la cual redirige con 302.
**Solución:** Se robusteció la extracción de la URL en `webk_buttons.js`: `const videoSrc = video?.src || video?.currentSrc || video?.querySelector("source")?.src;`. Ahora la URL enviada al motor de descargas siempre es válida.

#### 5. [Telegram Web] Corrupción de Video (Loop infinito en respuestas 200 OK)
**Problema:** Al descargar videos cuyos enlaces arrojaban 200 OK (archivos completos sin chunking, como los URLs `blob:`), el script descargaba el video completo y lo guardaba en disco, pero el apuntador `_next_offset` seguía en 0. Como 0 seguía siendo menor al tamaño total, el script volvía a solicitar el video entero y lo pegaba otra vez, creando un loop infinito que corrompía el archivo hasta que el proceso abortaba.
**Solución:** Se modificó el bloque de `res.status === 200` en `downloader.js` para igualar de inmediato `_next_offset = _total_size`. Esto cierra el ciclo limpiamente sin corromper el stream de escritura.

#### 6. [Telegram WebK] Visores desconocidos (Ej. Fotos de Perfil y Medios en Perfiles)
**Problema:** Telegram WebK utiliza visores de medios distintos para los chats (que sí interceptábamos) y para los perfiles (cuyo botón de descarga original está roto por defecto y tiene otro diseño). Inyectar nuestro botón era imposible sin conocer las clases CSS exactas de esos visores.
**Solución:** Se implementó un "Interceptor Universal" en `webk_buttons.js` que escucha los clics en modo captura (`true`). Si detecta que se clickeó cualquier botón nativo de descarga, detiene el evento nativo, escanea el DOM en busca del elemento `<img...>` o `<video...>` visible más grande, extrae su fuente y lo procesa con nuestro motor infalible, reparando así la descarga en cualquier rincón oscuro de Telegram.

## Problema: Error 302 y Descarga de imágenes fallida en Telegram Web
**Fecha:** 27 de Junio de 2026
**Problema 1 (Imágenes no descargan):** Las fotos de perfil en Telegram Web no se descargaban, solo se abrían o no hacían nada (dependiendo de si eran enlaces cruzados/cross-origin). El método original usaba un elemento `<a>` con atributo `download` apuntando directamente a la URL de la imagen, lo que el navegador bloquea como descarga por motivos de seguridad CORS.
**Problema 2 (Error 302 a mitad del video):** Las descargas de video grandes por partes fallaban aleatoriamente a la mitad devolviendo el error "Non 200/206 response was received: 302".
**Causa:**
- Telegram Web emplea un *Service Worker (SW)* increíblemente agresivo que intercepta las peticiones `fetch`. 
- Durante descargas largas, Telegram invalida el nodo CDN actual y el Service Worker emite programáticamente un código de estado `302 Found` con una nueva cabecera `Location`.
- La función de descarga estaba programada para arrojar un error y abortar si la respuesta no era 200 o 206.
**Solución:**
- **Imágenes:** Se migró a un sistema de descarga mediante un `fetch()` que convierte la imagen en un `Blob` y genera un `blob:` URL seguro y de mismo origen. De este modo, la descarga local no sufre bloqueos por políticas CORS de cross-origin.
- **Redirecciones 302 (Service Worker):** Se incluyó un condicional en la cadena de promesas `fetch` (`if ([301, 302, 303, 307, 308].includes(res.status))`). Si se detecta una redirección, extraemos el nuevo enlace de la cabecera `Location`, invocamos nuevamente a `fetchNextPart` con la nueva URL, y disparamos de forma controlada un `Promise.reject("REDIRECT")` para romper la cadena actual y evitar errores por propagación de un objeto no definido.
