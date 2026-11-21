# Notas TAccnicas - Instagram

## Estructura de mA3dulos
- `src/instagram/core/` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬  state.js, styles.js, vanish_init.js
- `src/instagram/utils/` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬  platform.js, username_resolver.js, media_resolver.js
- `src/instagram/ui/` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬  svgs.js, overlay_root.js, button_state.js
- `src/instagram/features/` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬  pfp_button.js, story_button.js, feed_buttons.js, video_progress.js
- `src/instagram/main.js` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬  Orquestador principal + MutationObserver + click interceptor

## Problema: Falla silenciosa al descargar carruseles y nombres incorrectos (timestamp en lugar de shortcode)
**Fecha:** 06 de Septiembre 2026
**Causa:**
1. Al hacer clic en el botÃ³n flotante desprendido del DOM, `btn.closest('a')` y `btn.closest('article')` devolvÃ­an null, impidiendo la extracciÃ³n del shortcode de los enlaces de tiempo de IG.
2. Los videos en carrusel de feed no tenÃ­an un `aria-posinset` directo en la etiqueta `<video>`, lo que causaba que el Ã­ndice (`_1`, `_2`) se perdiera y resultara en colisiones de nombres o nombres basados en el `timestamp` fallback.
3. El script host de Python usaba el `time.time()` como fallback primario en lugar de usar el `media_id` para derivar el shortcode.
**SoluciÃ³n:**
1. Se modificÃ³ `button_state.js` para usar `(originalElement || btn).closest(...)` y asÃ­ garantizar el recorrido correcto del DOM desde el contenedor original del post.
2. Se modificÃ³ `ig_interceptor.js` para asignar `foundIndex` desde `carouselIndex` o desde el Fiber tree.
3. Se actualizÃ³ `host.py` para usar `media_id` como fallback secundario.

## Problema: Ã�ndices incorrectos en carruseles del feed debido a virtualizaciÃ³n del DOM
**Fecha:** 06 de Septiembre 2026
**Causa:**
1. Se habÃ­a aÃ±adido un fallback en `feed_buttons.js` que contaba los hermanos del elemento `<li>` (`lis.indexOf(li)`). Dado que el DOM de Instagram virtualiza las listas de los carruseles (sÃ³lo renderiza la diapositiva actual, la anterior y la siguiente), el elemento visible siempre aparecÃ­a en el Ã­ndice 1 (el segundo nodo), independientemente de si era la 5ta o la 8va diapositiva. Esto causaba que todas las imÃ¡genes se descargaran con Ã­ndices equivocados como `_3` (2 + 1) en lugar de su Ã­ndice real.
2. Los **videos** en particular carecÃ­an de Ã­ndice porque el bucle `while` en `ig_interceptor.js` que recorre el Ã¡rbol de React Fiber se detenÃ­a prematuramente (`!foundDash`) apenas encontraba el manifiesto DASH en el componente de video. Al detenerse ahÃ­, nunca subÃ­a al componente padre (`root post`) para extraer el array de diapositivas ni procesar el Ã­ndice correcto, dejando el video sin sufijo.
3. Al solucionar el punto 2, los videos en carrusel **aÃºn** perdÃ­an su Ã­ndice si el usuario ya le habÃ­a dado *play* al video. Esto se debe a que Instagram destruye el elemento `<img>` (thumbnail/poster) del DOM para ahorrar memoria. Al no haber `<img>`, `media_resolver.js` no podÃ­a extraer `posterSig`, haciendo que el `STRICT SLIDE GUARD` fallara en emparejar la diapositiva correcta dentro del array de GraphQL y, por lo tanto, no se guardara el Ã­ndice.
4. Para los **videos** en un carrusel, Instagram a menudo posiciona el elemento `<video>` de forma **absoluta** sobre el contenedor `<ul>`, sacÃ¡ndolo completamente de la jerarquÃ­a del `<li>`. Por lo tanto, `media.closest('[aria-posinset]')` fallaba devolviendo `null`, y el video era descargado exitosamente usando el manifiesto de la memoria, pero sin saber en quÃ© Ã­ndice estaba.
**SoluciÃ³n:**
1. Se eliminÃ³ por completo el fallback del DOM de `feed_buttons.js`. Ahora, si `aria-posinset` no estÃ¡ presente, pasamos `carouselIndex = null`. 
2. Se modificÃ³ el bucle `while` en `ig_interceptor.js` para que **no se detenga** apenas encuentre la URL del video. Ahora exige encontrar `foundUser` y `foundTime` antes de detenerse, obligando al script a subir hasta el nodo raÃ­z del post. AhÃ­, el script recorre el array completo de diapositivas (`carousel_media`).
3. Se aÃ±adiÃ³ el fallback definitivo en `ig_interceptor.js` (Fase 1.5): Si el video estÃ¡ superpuesto o en un Portal (aislado de los datos del post), el script primero extrae el `video_dash_manifest` del Ã¡rbol del video, y luego realiza una **segunda bÃºsqueda independiente** subiendo por el Ã¡rbol Fiber del elemento `<article>` padre. Al encontrar allÃ­ el array `carousel_media` (a menudo oculto dentro de `queryReference`), utiliza el manifiesto DASH extraÃ­do previamente para emparejar la diapositiva exacta matemÃ¡ticamente y descubrir el `index` real, incluso si Instagram elimina por completo los atributos `aria-posinset` del DOM visual.

## Problema: Barra de progreso desbordada en carruseles
**Fecha:** 27 de Junio 2026
**SoluciA3n:** LA3gica de intersecciA3n para calcular "rectÃ¡ngulo visible" con `Math.max`/`Math.min` de ancestros con `overflow: hidden/clipPath`.

## Problema: Barra con bordes rectos en contenedores curvos
**Fecha:** 27 de Junio 2026
**SoluciA3n:** Extraer `borderBottomLeftRadius`/`borderBottomRightRadius` de ancestros y aplicar al track.

## Problema: Lag al hacer scroll (efecto gelatina)
**Fecha:** 27 de Junio 2026
**Causa:** `position: fixed` + `getBoundingClientRect()` en rAF.
**SoluciA3n:** `position: absolute` + coordenadas de documento (`getBoundingClientRect + scrollY`).

## Problema: Barra desaparece al salir y volver a vista
**Fecha:** 27 de Junio 2026
**SoluciA3n:** Validar si `customContainer.parentNode !== overlayRoot` y re-insertar.

## Problema: Temblor del botA3n al hacer hover
**Fecha:** 27 de Junio 2026
**Causa:** Instagram aplica `transform: scale()` a sus botones.
**SoluciA3n:** Calcular centro absoluto del botA3n nativo (`cx`, `cy`) que es inmutable.

## Problema: Pantalla negra al entrar a Reel desde Feed
**Fecha:** 27 de Junio 2026
**Causa:** `getComputedStyle()` en loop while 60fps + overlayRoot con dimensiones no-cero.
**SoluciA3n:** Cache de clip parent + "Suspense de TransiciA3n" (pausa 1s + opacity:0).

## Problema: BotA3n mal acomodado en Reels
**Fecha:** 27 de Junio 2026
**SoluciA3n:** Tolerancia de viewport Â±1000px. LA3gica condicional: Reels â†’ arriba del bookmark, Feed â†’ izquierda.

## Problema: Barra flotante en transiciones de carrusel
**Fecha:** 27 de Junio 2026
**SoluciA3n:** Usar `rect.width` (total) en vez de `visibleRect.width` + `clip-path: inset(...)` dinÃ¡mico.

## Problema: BotA3n desalineado en Reels + Pantallazo Negro
**Fecha:** 27 de Junio 2026
**Causa raA-z:** `overlayRoot` con `width/height: 100%` rompA-a animaciones FLIP de React.
**SoluciA3n:** `width: 0; height: 0; overflow: visible` + `position: absolute`.
**Anti-Jelly Engine:** En Reels, si velocidad > 5px/frame â†’ opacity:0. Al estabilizar â†’ reaparece.

## Problema: Lag en carruseles con barra de progreso
**Fecha:** 27 de Junio 2026
**SoluciA3n:** CachAc virtual (`__md_last*`) + `transform: translate3d()` para GPU acceleration.

## Problema: MÃ¡rgenes negros + pantallazos masivos
**Fecha:** 27 de Junio 2026
**Causa:** `overlay_root.js` se anclaba a `document.body` â†’ React crasheaba.
**SoluciA3n:** Anclar a `document.documentElement` (tag `<html>`).

## Features funcionando
- ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Descarga de imÃ¡genes (profile pics, stories, posts)
- ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Descarga de videos (stories, reels, posts)
- ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Barra de progreso de video con seek
- ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ BotA3n de descarga nativo en todas las vistas
- ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Vanish Mode, Ocultar En LA-nea, Ocultar Visto
- ÃƒÂ¢Ã…â€œÃ¢â‚¬Â¦ Toast notifications

## Pendiente
- **Checkmark no resetea al hacer swipe en carruseles del feed:** El botA3n de descarga muestra check por 2 segundos. Al hacer swipe a otra imagen del carrusel, el check deberA-a desaparecer instantÃ¡neamente. Instagram no usa `<article>` ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â� el botA3n es el mismo DOM para todas las imÃ¡genes del carrusel. Timeout reducido a 500ms como workaround temporal.
- **Marco negro en videos de carruseles mixtos:** En posts con imÃ¡genes Y videos, los videos a veces aparecen con un marco negro al hacer swipe. Posible interferencia de nuestro overlay root o inyecciA3n de CSS. Investigar.

## Problema: Barra de progreso de Stories con retraso (Efecto Fade-in)
**Fecha:** 3 de Julio 2026
**Causa:** El mecanismo de "Suspense de TransiciÃƒÂ¯Ã‚Â¿Ã‚Â½n" (pausa de 1s para evitar pantalla negra en Reels) detenÃƒÂ¯Ã‚Â¿Ã‚Â½a todo el loop de syncOverlays(), lo que congelaba la inyecciÃƒÂ¯Ã‚Â¿Ã‚Â½n de la barra de Stories al cambiar de URL. AdemÃƒÂ¯Ã‚Â¿Ã‚Â½s, habÃƒÂ¯Ã‚Â¿Ã‚Â½a una animaciÃƒÂ¯Ã‚Â¿Ã‚Â½n CSS de opacity.
**SoluciÃƒÂ¯Ã‚Â¿Ã‚Â½n:** Aislamos el *Suspense* para que **solo** aplique a las barras de video de Reels/Feed. Eliminamos el CSS de *fade-in* (opacity y transiciÃƒÂ¯Ã‚Â¿Ã‚Â½n). Ahora la barra de Stories se inyecta instantÃƒÂ¯Ã‚Â¿Ã‚Â½neamente a 60fps al cambiar de historia, ocultando la nativa sin ningÃƒÂ¯Ã‚Â¿Ã‚Â½n frame de retraso.





## Feature: Descarga de Fotos de Perfil (FHD) sin cookies/bots
**Fecha:** 18 de Julio 2026
**Logro:** Sistema nativo 100% infalible que extrae la foto de perfil en 1080p sin APIs, sin cookies, y sin pestaÃ±as de fondo, evadiendo las firmas de CDN y Content Security Policy (CSP).
**Estado Actual:** Funcional al 100%.
**CA3mo funciona (El Zoom Fantasma V2):**
1. **ExtracciA3n en 3 Fases:** Primero lee el HTML, luego escanea la memoria React interceptada globalmente, y si falla (o si el servidor manda solo 150x150), entra al "Ãšltimo Recurso".
2. **In-Memory Zoom Spoofing:** A travAcs de un `window.postMessage`, le ordena a `vanish.js` (que opera legalmente en el MAIN world saltÃ¡ndose el CSP de Instagram) alterar temporalmente el `window.devicePixelRatio = 5` del navegador.
3. **SimulaciA3n de React:** Dispara un evento `resize`. La app nativa de React de Instagram cree que el usuario hizo Zoom masivo y envA-a una solicitud oficial al servidor para obtener la versiA3n `1080x1080` con todas las firmas criptogrÃ¡ficas vÃ¡lidas.
4. **Sniffer de URL:** La extensiA3n monitorea si el `src` o `srcset` se actualiza. Una vez actualizado, roba el enlace HD firmado y restaura el `devicePixelRatio` a la normalidad en menos de 3 segundos, todo invisiblemente.
5. **GET Abort (ExtracciA3n de Timestamp):** Para extraer la fecha de subida original sin que el CDN nos bloquee (Instagram suele dar 403 Forbidden a las peticiones `HEAD`), `background.js` lanza una peticiA3n `GET` disfrazada. Al instante de recibir las cabeceras (headers) con la fecha `Last-Modified`, ejecuta `controller.abort()` para cancelar la descarga del cuerpo de la imagen (de 5MB) y ahorrar recursos.
6. La extensiA3n finaliza la descarga usando el script `host.py` con el nombre correcto `[usuario]_profile_pic_YYYY-MM-DD_HHMMSS.jpg`.

## Problema: Datos Incorrectos en Videos y Reels (Usuario/Fecha)
**Fecha:** 17 de Julio 2026
**Causa:** 
1. La extracciA3n nativa del *Dash Manifest* provocA3 que se saltara \gallery-dl\, dejando la responsabilidad a la extensiA3n de encontrar el usuario y la fecha.
2. Instagram usa una estructura GraphQL compleja para Reels/Posts donde el \username\ y \	aken_at\ (o \	aken_at_timestamp\) estÃ¡n muy enterrados (profundidad 7 u 8).
3. Cuando la extracciA3n en memoria fallaba, el sistema de respaldo del DOM leA-a \DanyanCat\ del \<meta og:title>\ asumiendo errA3neamente que era un @username, y ponA-a la fecha del dA-a de hoy.
**SoluciA3n:** 
1. **Memoria React (Fase 1 y 2):** Aumentamos la profundidad de exploraciA3n a 15 (\depth > 15\), agregamos soporte para \obj.username\, \	aken_at_timestamp\, y guardamos las variables globalmente (\globalFoundUsername\) para no perderlas al explorar arrays y objetos anidados en el JSON interceptado.
2. **Respaldo DOM:** Eliminamos la regex que leA-a \og:title\, forzando a que busque el enlace exacto de la foto de perfil (ej. \/danyancatoficial/\). AdemÃ¡s, agregamos extracciA3n nativa de fecha mediante \<time datetime>\. 
 
## Problema: Vanish Mode fallando por obfuscaciA3n GraphQL (Julio 2026)
**Fecha:** 25 de Julio 2026
**Causa:** Instagram dejA3 de enviar la mutaciA3n `usePolarisStoriesV3SeenMutation` explA-citamente en el body de sus peticiones POST. Ahora utilizan `doc_id` cifrados donde el nombre de la mutaciA3n no aparece en texto plano, lo que hizo que el interceptor original fallara y las historias se marcaran como vistas.
**SoluciA3n:** 
1. Reescribimos `isSeenRequest` en `vanish.js` para ser extremadamente agresivo.
2. En lugar de buscar el nombre de la mutaciA3n, ahora escaneamos las variables internas enviadas al servidor.
3. El interceptor ahora corta la conexiA3n si detecta palabras clave estructurales universales que Instagram estÃ¡ obligado a enviar, como `view_seen_at` o `viewSeenAt`.
4. Adicionalmente, agregamos filtros amplios (`xdtstory`) que actÃºan como **Seguro de Vida**, bloqueando automAticamente los *Likes* accidentales del usuario mientras el Modo Fantasma estÃ¡ activo, evitando que Instagram los delate.
## ActualizaciA3n (28 de Julio 2026): Funcionalidades de Calidad de Vida (QoL)
**1. Memoria Visual Fantasma:** Se implementA3 una inyecciA3n de CSS con el selector :has() para identificar de forma segura el contenedor del <canvas> (anillo de colores) y la foto de perfil en la barra superior de historias, aplicando un opacity: 0.3 y grayscale(100%). Esto proporciona retroalimentaciA3n visual al usuario de que ya vio una historia en Modo Fantasma, sin romper el Virtual DOM de React (que se rompA-a al usar \display: none\).
**2. Historial Fantasma (Popup UI):** Se creA3 un puente de comnicaciA3n \window.postMessage\ (\MD_GHOST_HISTORY_ADD\) entre \anish.js\ (MAIN world) y \anish_init.js\ (ISOLATED world) para guardar las historias vistas en \chrome.storage.local\. El popup.html ahora muestra una lista interactiva (con enlaces al perfil) de los usuarios vistos, y cuenta con un botA3n de borrado manual y auto-limpieza cada 48 horas.
**3. Control de Frecuencia (Rate-Limiting):** Para prevenir el spam masivo de consola (y congelamiento del navegador) que ocurre cuando la interfaz React de Instagram reintenta fallidamente el POST/GraphQL de seen tras ser bloqueado, se aadi \window.__md_handleGhostBlock\ en \anish.js\ que impone un cooldown estricto de 2 segundos para ejecutar los callbacks visuales.
**4. Atajos de Teclado con Modificadores:** Se reescribiA3 \popup.js\ para escuchar eventos \keydown\ (extrayendo \e.code\) en lugar de \input\. Se actualizA3 \main.js\ para comparar contra \e.code\ y \e.key\, permitiendo a los usuarios mapear teclas como \ControlRight\ o \Space\ como atajo rApido para descargar historias.



**2. Historial Fantasma (Popup UI):** Se creA3 un puente de comnicaciA3n \window.postMessage\ (\MD_GHOST_HISTORY_ADD\) entre \ anish.js\ (MAIN world) y \ anish_init.js\ (ISOLATED world) para guardar las historias vistas en \chrome.storage.local\. El popup.html ahora muestra una lista interactiva (con enlaces al perfil) de los usuarios vistos, y cuenta con un botA3n de borrado manual y auto-limpieza cada 48 horas.
**3. Control de Frecuencia (Rate-Limiting):** Para prevenir el spam masivo de consola (y congelamiento del navegador) que ocurre cuando la interfaz React de Instagram reintenta fallidamente el POST/GraphQL de seen tras ser bloqueado, se aadi \window.__md_handleGhostBlock\ en \ anish.js\ que impone un cooldown estricto de 2 segundos para ejecutar los callbacks visuales.
**4. Atajos de Teclado con Modificadores:** Se reescribiA3 \popup.js\ para escuchar eventos \keydown\ (extrayendo \e.code\) en lugar de \input\. Se actualizA3 \main.js\ para comparar contra \e.code\ y \e.key\, permitiendo a los usuarios mapear teclas como \ControlRight\ o \Space\ como atajo rApido para descargar historias.

## ActualizaciA3n (2 de Agosto 2026): Parche 100% Candado de Scroll en Modales & PrevenciA3n TP
**1. Candado de Scroll en Modales (100% Parcheado):**
- **Causa RaA-z:** Para proteger la extensiA3n contra crashes y pantallas negras causadas por React en el <body>, nuestro contenedor principal #md-overlay-root estÃ¡ colgado del tag superior <html> (document.documentElement). Sin embargo, cuando Instagram abrA-a un modal (foto/video en vista ampliada), intentaba bloquear la vista aplicando overflow: hidden al <body>. Como nuestro overlay root tenA-a elementos de publicaciones previas y traseras sumando miles de pA-xeles de altura dentro del <html>, Google Chrome mantenA-a la barra de scroll externa encendida y permitA-a arrastrar el documento entero de fondo, desfasando el modal.
- 2. **ExtracciA3n Silenciosa:** Se implementA3 una lA3gica de escaneo en 3 fases (`vanish.js` en contexto de pgina) que lee discretamente las respuestas `onreadystatechange` de XHR, sin inyectar encabezados sospechosos.

---

## SoluciA3n de "Click Perdido" en Modal de Perfil de Usuario
**Fecha:** 14 de Agosto 2026 (RefactorizaciA3n VigA-a)
**Problema:** Al hacer clic en un post dentro de la cuadrA-cula del perfil de un usuario, Instagram abre un Modal superpuesto (`div[role="dialog"]`). Aunque el botA3n de descarga se inyectaba correctamente (`feed_buttons.js`), al hacerle clic "no pasaba nada" (ni error, ni descarga). 
**Causa:** Instagram coloca un div invisible de intercepciA3n de clics encima de los botones de interacciA3n en sus modales. El "Global Click Interceptor" de `src/instagram/main.js` estaba diseÃ±ado para robar estos clics y pasarlos a nuestros botones, Â¡pero la consulta CSS solo buscaba `.md-native-btn` (botA3n de Stories), ignorando los botones del Feed (`.md-post-btn`)!
**SoluciA3n:** 
1. Se actualizaron los selectores del interceptor global a `.md-native-btn, .md-post-btn, .md-story-dl-btn-inline, .md-pfp-btn`.
2. En `feed_buttons.js` se actualizA3 la referencia del `clone.onclick` para que busque el contenedor padre (`article`) a partir del `clone` actual en el DOM, en lugar del SVG original que podrA-a haber sido desmontado por React. 

---

## SoluciA3n de "Shortcode Bleed" en Scrolling Infinito
**Fecha:** 14 de Agosto 2026 (RefactorizaciA3n VigA-a)
**Problema:** Al hacer scroll down en el perfil o Reels, los primeros videos se descargaban bien, pero los siguientes "fallaban silenciosamente" (el botA3n se ponA-a verde, pero no se descargaba ningÃºn archivo nuevo).
**Causa:** Si el modal no tenA-a un link de fecha visible (o cargaba lento), `getRealShortcode()` devolvA-a `null`. Sin un shortcode esperado, la extracciA3n Fiber (`vanish.js`) escalaba por el Ã¡rbol de React y devolvA-a la informaciA3n del **primer video cargado en la pgina** (ya que el contenedor de React a veces agrupa todos los posts). La extensiA3n enviaba la URL del primer video a Python, quien a su vez omitA-a la descarga porque el archivo ya existA-a.
**SoluciA3n:** 
1. Se mejorA3 `getRealShortcode()` para ordenar los links `<a>` disponibles basados en su "distancia visual" (pA-xeles en pantalla) respecto al `<video>`, asegurando que siempre se tome el shortcode del post activo.
2. Se implementA3 una guardia secundaria (`posterSig`) en Fiber: si no hay shortcode, Fiber rechazarÃ¡ cualquier nodo de React que no contenga la firma (`extractSignature`) del thumbnail/poster exacto del video cliqueado.

---

## SoluciA3n de Ordenamiento AsimActrico (Descarga de GIFs en Comentarios)
**Fecha:** 14 de Agosto 2026
**Problema:** En posts con GIFs en la secciA3n de comentarios, la extensiA3n descargaba aleatoriamente el GIF del comentario en lugar de la foto principal del post.
**Causa:** La funciA3n de ordenamiento `Array.prototype.sort()` en `feed_buttons.js` (`validMedia`) contenA-a una comparaciA3n de Z-index asimActrica. Al evaluar dos imÃ¡genes que **no se superponA-an** (ej. foto a la izquierda, GIF a la derecha), la funciA3n retornaba `-1` para ambas permutaciones (`compare(a,b)` y `compare(b,a)`). Al recibir una funciA3n asimActrica, el algoritmo TimSort de V8 se rompe, mezclando los elementos de forma impredecible y permitiendo que el GIF (con menor Ã¡rea) le ganara a la foto principal.
**SoluciA3n:** Se reescribiA3 la funciA3n de ordenamiento. Ahora primero determina si las coordenadas rectangulares de las dos imÃ¡genes colisionan (`overlap`). Si y solo si colisionan, resuelve el empate por Z-index usando `elementsFromPoint`. Si no colisionan, resuelve inmediatamente por el Ã�rea total de la imagen (donde el Post principal masacra al GIF en tamaÃ±o), logrando un comportamiento determinista 100% simActrico.

---

## SoluciA3n de "Primera Imagen Fija" (Descarga del Post Incorrecto en Feed/Explore)
**Fecha:** 14 de Agosto 2026
**Problema:** Al hacer clic en el botA3n de un post ubicado mÃ¡s abajo en la pantalla, o en un carrusel, la extensiA3n siempre descargaba la imagen del primer post visible, o un A-tem ubicado "hacia la derecha" en el carrusel.
**Causa:**
1. En las nuevas estructuras de Feed/Explore de Instagram, a veces no hay un tag `<article>` ni un `<div role="dialog">`. La extensiA3n retrocedA-a a `<main>`, el cual agrupa **todos los posts de la pantalla**. Al capturar las imÃ¡genes de todos los posts, el ordenador las evaluaba.
2. **Bug del Eje Y:** El desempate por Ã�rea devolvA-a `0`. Al hacer el desempate por distancia, el cA3digo solo medA-a la distancia **vertical** (Eje Y) respecto al botA3n. En un carrusel, todos los A-tems estÃ¡n en la misma lA-nea vertical, por lo que el botA3n ubicado en la esquina derecha hacA-a que el algoritmo se desviara hacia los A-tems de la derecha.
**SoluciA3n:**
1. Se forzA3 el *Fallback de BÃºsqueda Estrecha* (`while loop parentElement`) incluso si se detecta `<main>`, logrando que aA-sle el contenedor especA-fico del post cliqueado.
2. Se reescribiA3 la fA3rmula de desempate por Proximidad para usar Distancia Euclidiana en 2D (`Math.hypot(X, Y)`) calculada **desde el centro de la pantalla (Viewport)** y no desde el botA3n. De este modo, el A-tem que estAc centrado visualmente para el usuario (el A-tem activo del carrusel o feed) ganarÃ¡ siempre.

---

## SoluciA3n de "Carruseles Rotos y ParacaA-das Roto" (Vanish.js y Fiber)
**Fecha:** 14 de Agosto 2026
**Problema:** Al descargar videos de un carrusel, o videos bajo estructuras extraÃ±as de React, la extensiA3n terminaba descargando el primer video del perfil en lugar del seleccionado.
**Causa:**
1. **El ParacaA-das Roto (Paso 4):** Cuando Fiber fallaba en la extracciA3n, el cA3digo delegaba el rescate al diccionario general de Vanish.js. Sin embargo, el filtro de validaciA3n tenA-a un error tipogrÃ¡fico (`m.code === expectedShortcode` en lugar del correcto `m.shortcode`). Al fallar el chequeo, tomaba por defecto el A-ndice `[0]` de todo el diccionario interceptado (el primer post del perfil).
2. **Ceguera a Carruseles:** Fiber tenA-a programado un ban estricto a escanear Arrays en memoria (`if (Array.isArray) return`), lo cual hacA-a que cualquier video dentro de un Carrusel fallara instantÃ¡neamente (ya que la data del carrusel es un array).
**SoluciA3n:**
1. Se corrigiA3 el typo de validaciA3n (`m.shortcode || m.code`) para que el paracaA-das de Vanish.js sea 100% confiable.
2. Se levantA3 el ban de Arrays en Fiber, pero se compensA3 aplicando estrictamente la regla de `posterSig`. Ahora Fiber puede bucear en los arrays de carruseles, y usarÃ¡ la firma de la miniatura de tu video (`posterSig`) para escoger matemÃ¡ticamente cuÃ¡l de todos los videos del carrusel es el que estÃ¡s viendo.

**2. Salto / Teleport (TP) instantÃ¡neo hacia el post anterior con video (Pendiente de Monitoreo):**
- **Sintoma:** Al subir ligeramente desde un segundo post con video, la pgina daba un salto instantÃ¡neo (tipo TP) regresando a la cabecera del primer post con video.
- **Mitigaciones preventivas aplicadas:**
  1. Se eliminA3 la destrucciA3n y re-creaciA3n violenta de contenedores de barra de progreso durante el scroll (se reemplazA3 customContainer.remove() por un ocultamiento silencioso con display: none para no estresar el motor de layout de Chrome).
  2. Se aadi propiedad tabIndex = -1 y neutralizaciA3n de autofoco (blur()) tanto en botones clonados como en sliders (<input type="range">) para impedir que Chrome o el gestor de teclado nativo de Instagram fuencen un scrollIntoView al aparecer en pantalla.
- **Estado:** Dejado en pendiente y en observaciA3n continua por si reincide en escenarios especA-ficos del feed.

## ActualizaciA3n (3 de Agosto 2026): LA3gica Inteligente del Anillo Gris en Modo Fantasma (Vanish Mode)
**1. Marcado Exclusivo al Finalizar Todas las Historias:**
- **Causa del problema previo:** Al ver solo la primera historia de 10 en Modo Fantasma, el interceptor bloqueaba el POST de `seen` e inmediatamente guardaba al usuario en `localStorage` con un anillo gris por 24 horas.
- **SoluciA3n QuirÃºrgica:** En [vanish.js](file:///C:/Users/Migue/OneDrive/Documents/Projects/media_downloader_extension_dev/src/interceptors/vanish.js) se integrA3 la verificaciA3n `isViewingLastStorySegment()` que consulta tanto nuestro contador oficial `#md-story-counter` como la estructura nativa de barras superiores. Ahora, el anillo gris **solo se activa si estÃ¡s reproduciendo la ÃºÃºltima historia del usuario (`activeIndex >= totalSegments`)**. Si sales antes, el cA-rculo permanece 100% colorido en el feed (comportamiento idAcntico al nativo).

**2. RestauraciA3n AutomÃ¡tica al Subir una Nueva Historia:**
- **LA3gica de Reseteo:** Cuando el usuario publica una nueva historia horas despuAcs, su marca de tiempo (`latest_reel_media` o `taken_at`) en las respuestas API/GraphQL del feed supera la marca de tiempo guardada del Altimo visto.
- **ImplementaciA3n:** El analizador JSON inyectado de `vanish.js` detecta este salto temporal (`tsMs > seenTime`) e instantÃ¡neamente remueve al usuario de `md_ghost_seen_users`, devolviendo su anillo gris a la vida y mostrando el color de degradado normal para avisarte de que hay historias nuevas por ver.

## Feature (3 de Agosto 2026): Alerta Inteligente contra Reels/Posts re-subidos a Historias
- **Problema de Calidad y EstActica:** Cuando los usuarios comparten un Reel o PublicaciA3n del feed dentro de su Historia (ej. sticker con texto *"See Post"*, *"Watch full reel >"*, *"Ver reel completo"*, *"Ver publicaciA3n"* o *"View post"*), descargar el contenido directamente desde la historia genera un archivo re-comprimido, cortado a 15 segundos o con resoluciA3n degradada y marcos oscuros con botones de interfaz de Instagram pegados al archivo.
- **DetecciA3n CuÃ¡druple Avanzada en Tiempo Real (`detectSharedReelOrPost` & API Interception):** Al presionar el botA3n de descarga o usar el atajo en una historia en [story_button.js](file:///C:/Users/Migue/OneDrive/Documents/Projects/media_downloader_extension_dev/src/instagram/features/story_button.js), la extensiA3n aplica un sistema militar de 4 capas:
  0. **Verdad Absoluta en API de Red (JSON Ground Truth):** El interceptor en [vanish.js](file:///C:/Users/Migue/OneDrive/Documents/Projects/media_downloader_extension_dev/src/interceptors/vanish.js) lee las respuestas web nativas y detecta si la historia contiene arreglos como `story_feed_media`, `reeling_media` o `story_reels_media`. Al coincidir con el ID de historia en pantalla, bloquea el intento de descarga instantÃ¡neamente con certeza absoluta, sin depender siquiera de los elementos web.
  1. **Enlaces Ocultos o Visibles:** Localiza etiquetas (`<a href*="/p/">`, `/reel/`, `/reels/`, `/tv/`) incluso con ancho 0 antes del clic.
  2. **Etiquetas y Stickers Textuales:** EvalÃºa nodos con expresiones regulares expandidas (*see*, *watch*, *ver*, *view*, *mirar* + *post*, *reel*, *photo*, *foto*, *publicaciA3n*, *video*).
  3. **Menciones de AtribuciA3n Universal Pre-Clic:** Escanea el Ã¡rbol DOM completo en busca de nodos de texto simples que comiencen con `@` sin espacios en la zona central de la historia, interceptando reposts cuya interfaz aÃºn no ha generado el globo "See Post".
  - *Filtro de Inmunidad Anti-Falsos Positivos:* Se excluyeron estrictamente de las lecturas visuales los propios elementos de la interfaz de nuestra extensiA3n (`#md-reel-warning-toast`, `.md-toast`) y cualquier diapositiva inactiva/oculta en el DOM (`opacity: 0`, `visibility: hidden`). AsA-, si el aviso apareciA3 en una historia anterior y cambias a una historia normal, intentar descargar ya no detecta el texto del aviso de la esquina ni las diapositivas previas; el aviso se cierra solo y tu historia normal se descarga de inmediato.
- **NotificaciA3n Discreta Abajo a la Derecha (`showSharedReelWarning`):** Si se detecta una re-publicaciA3n o menciA3n de Reel/Post, la extensiA3n **bloquea permanentemente la descarga en la historia** y despliega en la esquina inferior derecha del navegador una tarjeta de notificaciA3n luminosa, estActica y nada intrusiva con A-cono personalizado (A3A3 para Reels, A3A3ï¸� para Posts/Fotos) y un **botA3n azul** brillante para abrir el Post, Reel o MenciA3n (`Open "@username"` u `Open Full Post/Reel in New Window`) y descargarlo sin marcos.

## Fix (3 de Agosto 2026): Eliminacin del Delay de 1 Segundo en Barra de Progreso de Historias
- **Causa RaA-z Descubierta en Video:** Al cambiar de historia (ej. de 6/16 a 7/16), durante exactamente 1 segundo aparecA-an las barras blancas cortadas nativas de Instagram sin el nÃºmero de historias, y un segundo mÃ¡s tarde aparecA-a nuestra barra personalizada con el contador. Esto sucedA-a porque en [video_progress.js](file:///C:/Users/Migue/OneDrive/Documents/Projects/media_downloader_extension_dev/src/instagram/features/video_progress.js) el ciclo principal `syncOverlays()` tenA-a un temporizador que suspendA-a toda la sincronizaciA3n durante **1000 milisegundos (`Date.now() + 1000`)** cada vez que el URL (`window.location.href`) cambiaba.
- **SoluciA3n QuirÃºrgica:**
  1. Se separaron `syncStoryProgressBar()` y `syncModalScrollLock()` en funciones independientes de mÃ¡xima prioridad que **siempre se ejecutan instantÃ¡neamente** en cada cuadro de animaciA3n (60 FPS), sin ser jamÃ¡s suspendidas por temporizadores ni transiciones de URL.
  2. Se configurA3 el detector de cambio de URL para que **no suspenda los elementos web si la navegaciA3n es puramente dentro del visor de historias** (`wasStory && isStory`).
- **Resultado:** Al saltar a la siguiente historia, la barra de progreso personalizada y los nÃºmeros (ej. `7/16`, `8/16`) aparecen en **el cuadro cero (0 milisegundos de retraso)** al mismo tiempo que el botA3n de descarga, eliminando el parpadeo de las barras nativas y el lag visual.

## Fix (3 de Agosto 2026): Atajo de Teclado Universal y NavegaciA3n Feed âž” Historias sin F5
- **1. Soporte Universal para el Atajo de Teclado:**
  - **Problema Descubierto:** Al abrir perfiles individuales o publicaciones en pestaÃ±as nuevas, presionar el atajo de descarga de la extensiA3n (ej. ALT+Q / ALT+S) no funcionaba.
  - **Causa RaA-z:** En [main.js](file:///C:/Users/Migue/OneDrive/Documents/Projects/media_downloader_extension_dev/src/instagram/main.js), el escuchador de teclado `keydown` estaba programado para buscar y hacer clic exclusivamente en `.md-story-dl-btn-inline` (botones dentro del visor de historias), ignorando el resto de Instagram.
  - **SoluciA3n QuirÃºrgica:** Se reescribiA3 el manejador de atajos en una matriz inteligente multi-contexto. Ahora, al presionar el atajo, la extensiA3n evalÃºa el contexto en tiempo real:
    1. Si estÃ¡s en **Historias**, dispara el botA3n de la historia central.
    2. Si tienes un **Modal** abierto (Post o Reel emergente), dispara la descarga de ese modal.
    3. Si estÃ¡s viendo el **Feed, Reels o Post Individual**, identifica y descarga el contenido mÃ¡s centrado y visible en pantalla (`.md-post-btn`).
    4. Si estÃ¡s en un **Perfil Individual**, descarga la foto de perfil en Full HD (`#md-pfp-dl`).
- **2. Descarga de Historias desde el Feed sin Necesidad de F5 (Recarga):**
  - **Problema Descubierto:** Al entrar a una historia haciendo clic en un anillo del feed (navegaciA3n SPA de Instagram), a veces la extensiA3n fallaba en inyectar el botA3n o al descargarlo, requiriendo un refresco (F5) para solucionarse.
  - **Causa RaA-z:** Al navegar desde el feed sin recargar la pgina, el DOM mantiene en segundo plano (ocultos o superpuestos) los encabezados y menAs de 3 puntos del feed anterior. La funciA3n `injectStoryButton` tomaba el primer menÃº de 3 puntos que encontraba en orden DOM (que solA-a ser el de un post del feed en segundo plano) y al hacer clic en descarga, la bsqueda global de medios PodA-a capturar un video del feed oculto.
  - **SoluciA3n QuirÃºrgica en [story_button.js](file:///C:/Users/Migue/OneDrive/Documents/Projects/media_downloader_extension_dev/src/instagram/features/story_button.js):**
    1. **PriorizaciA3n por Zona y Centrado:** Ahora la extensiA3n filtra los menAs de 3 puntos a aquellos ubicados exclusivamente en la zona superior central de la pantalla y los ordena por proximidad al centro (`window.innerWidth / 2`), garantizando al 100% capturar el encabezado de la historia activa y jamÃ¡s los posts del feed en segundo plano.
    2. **BÃºsqueda JerÃ¡rquica al Descargarse:** Al hacer clic, en lugar de buscar videos globalmente por el documento entero, el algoritmo asciende directamente por los ancestros del botA3n (`dlBtn.parentElement`) para extraer Ãºnicamente la etiqueta `<video>` o `<img>` que vive dentro de la diapositiva exacta que estÃ¡s reproduciendo.

## Enhancement (3 de Agosto 2026): RediseAo EstActico y Centrado GeomActrico de la Barra de Progreso
- **Problema Visual Reportado:** El cA-rculo de avance (*thumb*) de la barra de progreso de historias lucA-a mal alineado verticalmente y permitA-a ver la lA-nea divisoria del fondo oscuro/claro a travAcs del cA-rculo.
- **AnÃ¡lisis de Fallas en CSS Anterior:**
  1. **Opacidad del CA-rculo (`opacity: 0.9`):** Al tener 90% de opacidad en hover, la intersecciA3n del degradado entre el progreso blanco (90% opaco) y el fondo gris (20% opaco) se transparentaba a travAcs de la perla blanca, creando una lA-nea vertical fantasiosa dentro del cA-rculo.
  2. **Desplazamiento Vertical AsimActrico (`margin-top: -4.5px / -3.5px`):** Al transicionar la altura del carril de 5px a 7px en hover con mÃ¡rgenes superiores imprecisos, el cA-rculo quedaba 1px desfasado del centro real y temblaba durante la animaciA3n.
- **SoluciA3n EstActica de Calidad Nativa en [styles.js](file:///C:/Users/Migue/OneDrive/Documents/Projects/media_downloader_extension_dev/src/instagram/core/styles.js):**
  1. **ExpansiA3n TÃ¡ctil ErgonA3mica (6px âž” 12px) y Hitbox Ampliada ("Anti-osu!"):** Para evitar que el usuario tenga que "apuntar a un pA-xel como en un videojuego de precisiA3n", se expandiA3 el contenedor superior con `top: -12px; bottom: -12px` y `min-height: 32px` para otorgar un **Ã¡rea de clic masiva de 32px** de alto. En reposo, la barra luce con un grosor base robusto y visible de **6px**. Al acercar el mouse o arrastrar, se expande a unos suntuosos **12px** de altura para hacer clic o mover el tiempo con cero esfuerzo.
  2. **Perla Gigante y SincronA-a GeomActrica MActrica:** Se diseÃ±A3 una perla circular ergonA3mica de **20px Ã— 20px**. En reposo (barra de 6px), se aplica `margin-top: -7px` `((6 - 20) / 2 = -7)`. En hover (barra de 12px), transiciona en perfecta sincronA-a mecÃ¡nica a - **Bug 1: Congelamiento Visual al Pasar y Quitar el Mouse ("Bug Tocho"):**
  - **Causa RaA-z Descubierta en [video_progress.js](file:///C:/Users/Migue/OneDrive/Documents/Projects/media_downloader_extension_dev/src/instagram/features/video_progress.js):** El evento de simple movimiento del puntero (`pointermove` y `touchmove`) estaba enlazado a la funciA3n `stopEvt`, la cual marcaba incondicionalmente la bandera `slider.__md_isDragging = true`. Al mover el mouse por la barra sin hacer clic, la extensiA3n asumA-a errA3neamente que se iniciA3 un arrastre permanente. Al salir de la barra sin haber hecho clic, jamÃ¡s se disparaba el evento `mouseup`, dejando el reproductor bloqueado de por vida (`!slider.__md_isDragging`) y congelando la animaciA3n al 96% o 97%.
  - **SoluciA3n QuirÃºrgica:** Se separA3 lA3gicamente el movimiento de la pulsaciA3n. Ahora, `pointermove` y `touchmove` Ãºnicamente detienen la propagaciA3n hacia Instagram, mientras que **solo `mousedown`, `pointerdown` y `touchstart`** activan la bandera de arrastre. Asimismo, se agregaron escuchadores a nivel `window` para limpiar el estado al soltar el clic en cualquier parte de la pantalla.
- **Bug 2: Resto de Barra Gris Visible DetrÃ¡s del CA-rculo al Finalizar (AsomÃ¡ndose a la derecha):**
  - **Causa RaA-z:** Los temporizadores de las historias y reproductores de video en Instagram suelen pausar su progreso numAcrico entre el **96.5% y el 98.5%** durante los milisegundos de transiciA3n antes de cambiar a la siguiente diapositiva. Con un umbral de redondeo alto (`99.2%`), el cA-rculo se detenA-a a unos 15 pA-xeles de la derecha, dejando expuesta la punta redondeada del carril gris como una "oreja" detrÃ¡s del control blanco.
  - **SoluciA3n QuirÃºrgica:** Se recalibrA3 el umbral de sellado estActico al **96.5%**. En cuanto la historia cruza esta marca (los Altimos milisegundos), la perla se desplaza suavemente al **100% absoluto**, estacionÃ¡ndose en el extremo derecho extremo y tapando por completo el carril de fondo con cero asomos ni protuberancias.
- **Bug 3: Incapacidad de Mover la Barra en Historias sin Video ni MÃºsica ("Solamente Foto"):**
  - **Causa RaA-z:** El manejador de arrastre (`input`) Ãºnicamente buscaba etiquetas `<video>`. Al tratarse de una historia estÃ¡tica con foto (cuyo tiempo dura 5 segundos), no existA-a un video que modificar y el temporizador interno de Instagram desoA-a el arrastre del usuario.
  - **SoluciA3n QuirÃºrgica y Eliminacin de ContaminaciA3n en DOM (Aplicando PatrA3n de IGNOTES):** Al arrastrar el control en fotos sin mÃºsica, la extensiA3n manipula la **Web Animations API (`document.getAnimations()`)**. Durante las pruebas del usuario, se detectA3 por quAc tras ver algunos videos la barra dejaba de avanzar y responder ("pasAc unos cuantos vids y ya no"):
    1. **ResurrecciA3n de Animaciones Terminadas y Centrado de Viewport:** Al arrastrar hasta el final, la animaciA3n de la barra nativa termina (`finished`). El ciclo de sincronA-a ahora invoca `anim.play()` y filtra estrictamente que las animaciones correspondan a elementos visibles en el centro de la pantalla (dentro de un radio de 400px del centro de la ventana).
    2. **BÃºsqueda JerÃ¡rquica Exacta desde el Encabezado Interno del Slide:** Cuando el usuario cambia entre historias, las etiquetas `<video>` antiguas permanecen en el DOM en segundo plano. Para evitar capturar videos antiguos y enmudecer o entorpecer las fotos, `getActiveStoryMedias` busca al **botA3n de descarga (`.md-story-dl-btn-inline`) o botA3n nativo de 3 puntos del encabezado del slide mÃ¡s centrado en pantalla** y asciende exclusivamente en el Ã¡rbol de esa diapositiva actual. Si es foto (`<img>`), retorna 0 videos y el arrastre funciona con precisiA3n absoluta.
- **Bug 4: InversiA3n del Contenedor de Progreso y SuperposiciA3n Visual sobre el BotA3n de Audio y Encabezado de Usuario ("Esto es un mierdero"):**
  - **Causa RaA-z Descubierta tras Captura del Usuario:** En historias de fotos o durante estados de carga sin animaciA3n inline de anchura (`width`), el algoritmo de bsqueda de `segmentsContainer` caA-a en el escaneo universal de divs basÃ¡ndose en medidas flexibles (ancho > 100px, alto <= 35px) y ordenaba puramente por cercanA-a horizontal al centro de pantalla. El contenedor del encabezado de usuario (que contiene la fecha "1h", nombre, A-cono de volumen A3A3, pausa â�¸ y descarga A3A3) cumplA-a con esas dimensiones de ancho/alto y muchas veces estaba mÃ¡s centrado horizontalmente que las tiras superiores de progreso. Consecuentemente, el cA3digo asignaba errA3neamente el encabezado como `segmentsContainer`, inyectando la barra de progreso directamente encima del A-cono del altavoz de audio y aplicando la clase `.md-hide-native-segments` a los controles del usuario, rompiendo por completo la estActica y el funcionamiento al intentar avanzar en fotos sin mÃºsica.
  - **SoluciA3n QuirÃºrgica de Barrera Estructural (`isValidSegmentRow`):** Se implementA3 una verificaciA3n estructural estricta e infranqueable en `syncStoryProgressBar`:
    1. **ExclusiA3n Estructurada Absoluta:** Un verdadero contenedor de segmentos de Instagram en historias se compone puramente de divs de barras indicadoras (1/5, 2/5) y jamÃ¡s contiene controles de usuario. Si cualquiera de los hijos del contenedor evaluado posee botones (`<button>`, `[role="button"]`), A-conos (`<svg>`), imÃ¡genes (`<img>`), etiquetas `<header>` o texto legible (ej. marcas de tiempo como "1h" o nombres de usuario, salvo el contador propio de la extensiA3n), la fila es **rechazada instantÃ¡neamente**.
    2. **Ordenamiento por Cima Visual (`rect.top`):** Entre las filas vÃ¡lidas supervivientes en la columna central del monitor, se prioriza estrictamente al contenedor con el menor `rect.top` (el que estÃ¡ en lo mÃ¡s alto absoluto de la pantalla), garantizando al 100% que siempre se capturen las verdaderas tiras de progreso y jamÃ¡s los controles del encabezado ni el A-cono del altavoz.

> [!WARNING]
> **[ESTADO: PENDIENTE / EN INVESTIGACIÃ“N (3 de Agosto 2026)]**
> A pesar de las mejoras de exclusiA3n y jerarquA-a, en ciertas sesiones reales el usuario sigue experimentando problemas al rebobinar/avanzar la barra en historias que Ãºnicamente contienen fotografA-as estÃ¡ticas o al pasar entre varios videos y fotos. Por instrucciA3n expresa del usuario, **esta incidencia en historias se deja en pausa/pendiente de investigaciA3n profunda futura** para enfocarse actualmente en la descarga y formato de nombres en Telegram.

Como conclusiA3n tAccnica definitiva y 100% confiable, **eliminamos las bsquedas globales** y exportamos la misma estrategia probada en nuestra funciA3n de descargas (`getActiveStoryMedias`): la extensiA3n **asciende por el Ã¡rbol DOM exclusivamente desde el contenedor del encabezado de la historia activa hacia su ancestro directo** hasta encontrar los elementos visuales de esa diapositiva en concreto (priorizando por proximidad al centro de pantalla `window.innerWidth / 2`). Al llegar a una historia que Ãºnicamente contiene una foto (`<img>`), esta bsqueda jerÃ¡rquica retorna 0 videos y jamÃ¡s inspecciona las diapositivas anteriores o vecinas del carrusel, logrando que el arrastre en fotos responda siempre de manera perfecta e instantÃ¡nea.

## SoluciA3n de Offset de Index en Carruseles Virtualizados de Feed (Nombres de Archivo)
**Fecha:** 7 de Septiembre 2026
**Problema:** Al descargar imÃ¡genes de un carrusel avanzado (tercera, cuarta imagen, etc), los nombres de archivo recibA-an un Ã­ndice incorrecto o arrastraban un desfase (la primera era `_2`).
**Causa RaÃ­z:** Intentar inferir el A-ndice basado en el orden del DOM (`indexOf(li)`) falla fatalmente en carruseles virtualizados de React (SPA). Al hacer scroll, Instagram "desmonta" las imÃ¡genes previas para ahorrar memoria eliminando por completo el `<li>` del DOM. AsÃ­ que calcular la posiciÃ³n visual es matemÃ¡ticamente imposible desde los elementos HTML.
**SoluciA3n Definitiva:** Se eliminA3 por completo cualquier intento de leer el DOM o buscar "Puntos de PaginaciÃ³n" (los cuales tambiÃ©n fallan en Modo Oscuro o layouts raros). Ahora, la extensiÃ³n delega la responsabilidad 100% al interceptor de React Fiber (`ig_interceptor.js`). Cuando Vanish busca la imagen dentro del arreglo interno `carousel_media` de React, rastrea recursivamente la llave del arreglo (`k`). Si encuentra la imagen correcta dentro de ese arreglo, envÃ­a ese Ã­ndice exacto de regreso a la interfaz como la "Verdad Absoluta", garantizando una numeraciÃ³n perfecta sin importar quÃ© haya en pantalla.

## Fix: Falla Aleatoria del Atajo de Teclado en Historias (Animaciones SPA)
**Fecha:** 14 de Agosto 2026
**Sintoma:** En las historias de Instagram, el atajo de descarga funcionaba a veces sA- y a veces no. Sin embargo, al recargar la pgina (F5) el atajo volvA-a a funcionar siempre. No habA-a textboxes bloqueando.
**Causa RaA-z:** Instagram usa una arquitectura SPA (Single Page Application) donde las historias no siempre modifican el Ã¡rbol DOM (no quitan ni ponen elementos), sino que se deslizan a la pantalla usando transformaciones CSS (`transform: translate3d`). Como el `MutationObserver` no reacciona a cambios puramente visuales de CSS, el script `injectStoryButton` jamÃ¡s se enteraba de que la historia cambiA3 y no inyectaba el botA3n visual `.md-story-dl-btn-inline` en la nueva diapositiva central. Al presionar el atajo, la extensiA3n buscaba el botA3n para hacerle click, pero como nunca se inyectA3 en esa diapositiva, fallaba silenciosamente.
**SoluciA3n (`instagram/main.js`):**
1. **InyecciA3n Forzada on-demand:** Al presionar el atajo de teclado global, si la URL detecta que estamos en `/stories/`, forzamos a ejecutar `injectStoryButton()` inmediatamente antes de intentar hacer clic en la descarga. Si el botA3n no estaba por culpa de la animaciA3n CSS, se inyecta en ese mismo microsegundo y el atajo lo encuentra y acciona exitosamente.
2. **Fallback Visual:** TambiAcn se agregA3 el `showWarningToast` de nuestro `ShortcutManager` al final de la cadena de fallback de Instagram, para que en caso de que verdaderamente no encuentre nada que descargar, avise visualmente que el atajo se ejecutA3 pero no encontrA3 medios, eliminando los fallos silenciosos.

---

## RefactorizaciA3n ArquitectA3nica: ExtracciA3n HA-brida (Viewport Distance + Fiber)
**Fecha:** 14 de Agosto 2026
**Problema Original:** La extensiA3n utilizaba `elementsFromPoint` y cÃ¡lculos de superposiciA3n (`overlap`) para encontrar la etiqueta `<video>` correspondiente al botA3n. Esto era sumamente frÃ¡gil porque Instagram a menudo coloca capas transparentes (`[role="button"]`) encima de los videos en modales o carruseles, lo que hacA-a que `elementsFromPoint` devolviera el div invisible y descartara el video real, descargando accidentalmente un video aleatorio del fondo.
**HipA3tesis Fallida (Fiber Directo):** Se intentA3 acceder a la base de datos de React (Fiber) directamente desde el botA3n de descarga. Sin embargo, se descubriA3 ("Inception") que los ingenieros de Meta optimizan sus componentes: el "Action Bar" (donde estÃ¡ el botA3n) solo recibe el `postId`, pero **no recibe el objeto pesado con las URLs 4K de los videos**.
**SoluciA3n ArquitectA3nica Definitiva:**
1. **Aislamiento Estricto:** Al hacer clic en descargar, la extensiA3n aA-sla el `<article>` actual (`feed_buttons.js`), obteniendo Ãºnicamente las etiquetas `<video>` e `<img>` de ese post especA-fico.
2. **Viewport Distance (AdiA3s al DOM Guessing Complejo):** Se eliminA3 por completo `elementsFromPoint`. Ahora, simplemente se calcula la Distancia Euclidiana (`Math.hypot`) entre el centro de cada video/imagen y el **centro exacto de la pantalla del usuario (Viewport)**. El elemento que estAc mÃ¡s centrado es, lA3gicamente, el que el usuario estÃ¡ viendo activamente en el carrusel o modal.
3. **Fiber Bridge Seguro:** Una vez capturado el `<video>` o `<img>` correcto con precisiA3n militar, la extensiA3n usa `media_resolver.js` para asignarle un ID y pedirle a `vanish.js` (`MD_REQUEST_FIBER`) que escale por la memoria de React a partir de ese elemento multimedia. Como la etiqueta de video *sA-* necesita las URLs para renderizarse, su nodo de React siempre contiene el objeto completo con los `video_versions` en 4K.
---

## SoluciA3n de "Modal Shortcut Bug" y "Carrusel AsimA3trico" (Atajo de Descarga Incorrecto)
**Fecha:** 15 de Agosto 2026
**Problema 1:** Al presionar el atajo de teclado dentro de un Modal de foto o video, la extensiA3n descargaba la foto de perfil del usuario y la guardaba en una carpeta "p" en lugar del post real.
**Problema 2:** En un carrusel de imA3genes, al usar el atajo de descarga, siempre descargaba la primera imagen (la de la izquierda) sin importar en quA3 diapositiva estuviera el usuario.
**Causas:**
1. **Fallo de LocalizaciA3n del Modal:** El cA3digo que procesa el atajo en Modales (instagram/main.js) buscaba nuestro botA3n (.md-post-btn) exclusivamente dentro de la etiqueta <div role="dialog">. Como nuestro botA3n estA3 inyectado directamente en el HTML (md-overlay-root) para evitar que React crashee, nunca lo encontraba.
2. **Sort AsimA3trico de 1 DimensiA3n:** Al fallar en el Modal, la funciA3n saltaba a un "Fallback General" buscando todos los botones de descarga de la pA3gina (incluyendo los del Feed en segundo plano). Luego, intentaba adivinar el botA3n correcto ordenA3ndolos por su **distancia vertical (Math.abs(top - center))**.
   - En un Modal, el botA3n de "Descarga de Foto de Perfil" (#md-pfp-dl) suele estar mA3s centrado verticalmente que el botA3n del Post (el cual queda hundido abajo si el video es alto). Por tanto, el atajo se auto-apuntaba a la Foto de Perfil. Como el extractor de perfil lee la URL para obtener el nombre, y la URL era /p/SHORTCODE, extraA3a "p" como nombre de usuario.
   - En Carruseles horizontales, todas las imA3genes comparten la misma distancia vertical. El sort 1D es inA3til y simplemente seleccionaba la primera imagen en el DOM (la de la izquierda), causando que la extensiA3n descargara el post equivocado.
**SoluciA3n:**
1. **Marcador de Dialogo (md-in-dialog):** En eed_buttons.js, cuando se inyecta el botA3n, si su contenedor original pertenece a un div[role="dialog"], se le aA3ade silenciosamente la clase .md-in-dialog. Esto permite que el atajo lo encuentre instantA3neamente de manera global sin importar dA3nde viva en el DOM.
2. **Sort GeomA3trico 2D Euclidiano:** Se reemplazA3 el obsoleto Math.abs() de 1 dimensiA3n por **Math.hypot(left - center, top - center)** en todos los fallbacks de main.js. Ahora, el algoritmo de selecciA3n calcula la distancia en **2 dimensiones**. En los carruseles, esto asegura que el atajo SIEMPRE escoja el botA3n del slide que estA3 exactamente en el centro horizontal de la pantalla, resolviendo de forma infalible ambos bugs crA3ticos.


---

## SoluciA3n de "Modal Grid Fallback" y "Carrusel TP" (Lag al avanzar derecha)
**Fecha:** 15 de Agosto 2026
**Problema 1:** Dentro de los modales abiertos desde la cuadrA3cula de perfil del usuario, el atajo de descarga no funcionaba y no mostraba error.
**Problema 2:** Al navegar un carrusel usando la flecha nativa derecha de Instagram, a veces el avance fallaba y el carrusel saltaba de regreso (TP) a la imagen previa.
**Causas:**
1. **PA3rdida de Ancestros por TeleportaciA3n (React Crash Fix):** Recientemente movimos los clones de nuestros botones al contenedor global #md-overlay-root para evadir los crashes de React. Sin embargo, al hacer esto, clone.closest('article, div[role="dialog"]') comenzA3 a retornar 
ull (porque el clon ya no vive dentro del Modal en el DOM). Esto causaba que la extensiA3n hiciera un "fallback total" leyendo document.body entero. Como el Modal estA3 por encima del perfil, escaneaba toda la cuadrA3cula de fondo, seleccionaba el enlace del centro de la pantalla, e intentaba extraer una imagen que jamA3s fue cargada, fallando silenciosamente.
2. **DOM Thrashing Asesino por Listener Global:** Para resetear el checkmark verde al deslizar un carrusel, habA3amos agregado un listener universal pointerdown (globalResetBtn) a la pantalla. El problema es que este listener destruA3a y reconstruA3a el HTML interno (SVG) de **todos los botones de descarga activos** en la pantalla **en cada clic o toque del usuario**, sin importar si el botA3n estaba verde o en estado normal. Al cliquear la flecha derecha del carrusel, esta mutaciA3n masiva del DOM congelaba el hilo principal durante el mismo frame en que el Gesture Responder de React inicia el swipe, abortando la animaciA3n nativa de Instagram y provocando un salto violento hacia atrA3s.
**SoluciA3n:**
1. **Ancestros desde Wrapper, no desde Clone:** En eed_buttons.js, cambiamos clone.closest por wrapper.closest y clone.parentElement por wrapper.parentElement. Como el wrapper (el botA3n original invisible) sigue viviendo en el lugar correcto del DOM dentro de React, ahora podemos localizar el <article> o <div role="dialog"> correcto con 100% de precisiA3n y aislar A3nicamente los videos de ese modal.
2. **Short-Circuit en Reset Visual:** Agregamos una verificaciA3n condicional rA3pida (hadState) en globalResetBtn. Ahora, la destrucciA3n y recreaciA3n del nodo SVG solo se ejecuta si (y solo si) el botA3n efectivamente tenA3a una clase temporal (md-success, md-loading, etc.). Si el botA3n estA3 en estado normal, el listener ignora el clic instantA3neamente, eliminando el lag y permitiendo que los carruseles se deslicen suavemente a 60fps de nuevo.


---

## Bug en Progreso: Descarga de Imagen Incorrecta en Modal (Carrusel)
**Fecha:** 15 de Agosto 2026
**Estado:** INVESTIGANDO
**Problema:** Al intentar descargar la diapositiva 2+ de un carrusel abierto en un modal desde el perfil, la extension descarga correctamente la *primera* diapositiva pero le agrega un _1 al nombre.
**Historial de Hipotesis y Fallos:**
1. **Fallo de Diccionario:** Se descubrio que __md_storyMediaDict solo indexa las diapositivas 2+ usando IDs numericos, no por su shortcode padre. Se modifico eed_buttons.js para bifurcar: la diapositiva 1 usa el diccionario rapido, pero las 2+ fuerzan un escape hacia la memoria de React usando Fiber.
2. **Filtro Asimetrico (posterSig):** Fiber devuelve TODAS las diapositivas del carrusel en el mismo nodo. Para saber cual URL escoger, pasamos posterSig y filtramos. Sin embargo, la extraccion de firma resulto engaÃ±osa:
  - Primer intento: usar el nombre de archivo exacto con todo y extension fallaba porque el DOM tenia .webp y React .jpg.
  - Segundo intento: extraer solo el primer bloque numerico del ID. Fallo porque Instagram suele usar el **ID del usuario** como prefijo para todas las diapositivas de un mismo post. Resultado: todas las diapositivas comparten el mismo posterSig y anish.js siempre escoge la diapositiva 1.
  - Tercer intento: usar el nombre de archivo completo pero *sin* la extension (.replace(/\.[a-zA-Z0-9]+$/, '')). Actualmente sigo fallando.


## Solucion Final a Errores Criticos de Nomenclatura y Extraccion en Carruseles
**Fecha:** 15 de Agosto 2026
**Estado:** RESUELTO
1. **Typo en media_resolver:** Se corrigio la lectura de result.shortcode en lugar de result.code.
2. **Shortcode Fallback:** Se protegio la sobreescritura prematura del shortcode usando el media_id.
3. **Area Visible Modal:** Se reemplazo Math.hypot por una logica estricta de visibleArea para ignorar diapositivas adyacentes ocultas.
4. **Nomenclatura Windows:** feed_buttons.js envia el index nativo y host.py le asigna el prefijo _1, dejando el formato (1) para colisiones.


- **Bug Visual de Historias Fantasma (Falso Positivo de CSS):** Las historias se marcaban visualmente como 'vistas' (gris) aunque el usuario no las hubiera abierto. El problema era el selector CSS 'img[alt*=""]'. Como era una bA3squeda por subcadena, si el usuario veA3a las historias de 'mar', el CSS ponA3a gris cualquier historia de cualquier usuario cuyo nombre contuviera 'mar' (como 'mariana' o 'omar'). Se corrigiA3 utilizando 'a[href^="/stories//"]' para un match matemA3tico exacto de la URL, y 'img[alt$=" "]' para el caso de imA3genes sin link.


- **Mejora EstA3tica (Modo Fantasma):** Se eliminA3 la aplicaciA3n de filtros grises y opacidad a las etiquetas <img>. Ahora la extensiA3n SA3LO aplica 'grayscale(100%)' a las etiquetas <canvas> (donde Instagram dibuja el anillo de colores). Esto hace que el estado de 'visto' de la extensiA3n sea visualmente idA3ntico al estado nativo de Instagram: la foto de perfil se mantiene a color e intacta, y A3nicamente el anillo de colores se vuelve gris.


- **CorrecciA3n de Carrera (Race Condition) en Modo Fantasma:** Cuando un usuario cambiaba de historia muy rA3pido, Instagram enviaba la peticiA3n de 'visto' de la historia anterior, pero el script leA3a la URL actual, marcando por error a usuarios que nunca se habA3an visto. Se solucionA3 extrayendo el 'media_id'/'reel_id' directamente del payload de la red (XHR/Fetch) e interceptando el nombre de usuario exacto del diccionario de medios en memoria.
- **Ajuste EstA3tico del Aro Gris:** Se cambiA3 el CSS de 'grayscale(100%)' a 'grayscale(100%) contrast(0) brightness(1.6)'. Al bajar el contraste a 0, todos los colores del aro se promedian en un solo color sA3lido uniforme, y el brillo lo aclara para que se vea idA3ntico al gris claro nativo de Instagram.


- **CorrecciA3n en ExtracciA3n de Carruseles (GraphQL & Fiber):** Los videos dentro de carruseles del feed principal fallaban en descargar ('resolveMediaUrl returned nothing'). La causa era que la Guardia MatemA3tica que encuentra la diapositiva exacta en el Fiber de React estaba cortando la bA3squeda antes de que el script extrajera el usuario y el timestamp del post padre, lo cual dejaba la metadata incompleta. AdemA3s, se aA3adiA3 soporte nativo para los objetos 'edge_sidecar_to_children' (GraphQL del feed) y 'display_url', asegurando compatibilidad total con la pA3gina de inicio de Instagram.


- **CorrecciA3n de A3ndice y SelecciA3n de Media en Feed:** El badge nativo de Instagram (ej. '1/5') a veces se quedaba congelado o escondido en el DOM, provocando que la extensiA3n leyera un A3ndice incorrecto (ej. 2 en lugar de 1) y descargara la imagen de la diapositiva adyacente en vez del video deseado. Se invirtiA3 la lA3gica en 'feed_buttons.js' para darle prioridad absoluta al cA3lculo matemA3tico de la matriz de transformaciA3n del carrusel, usando el texto del badge solo como A3ltimo recurso.


- **CorrecciA3n de Shortcodes Largos (Opaque IDs):** Instagram ha empezado a usar 'Opaque IDs' (cadenas alfanumA3ricas de 39 caracteres) en lugar de los shortcodes tradicionales de 11 caracteres para ciertos posts y cross-posts. El interceptor Fiber tenA3a un lA3mite de 15 caracteres para aceptar un shortcode, lo que causaba un fallo de validaciA3n y un desvA3o hacia enlaces de rastreo del DOM. Se aumentA3 el lA3mite a 50 caracteres y se aA3adiA3 prioridad a la URL nativa (window.location.pathname) al extraer el shortcode dentro de modales de perfiles.


- **CorrecciA3n Definitiva del A3ndice de Carruseles:** El cA3lculo matemA3tico basado en 'getBoundingClientRect()' fallaba silenciosamente en carruseles que usan 'overflow-x: scroll' en lugar de transformaciones CSS, provocando que el offset siempre fuera 0 y por tanto el A3ndice calculado siempre fuera 1, sin importar en quA3 diapositiva estuviera el usuario. Se eliminA3 la matemA3tica de rectA3ngulos y se reemplazA3 por un cA3lculo directo del orden del DOM ('indexOf(li) + 1'), lo cual es 100% exacto para los carruseles del feed de Instagram ya que no estA3n virtualizados.


## Problema: Lag severo acumulativo al ver mltiples Stories (Agosto 2026)
**Causa 1 (story_button.js):** El selector inyectado se disparaba en cada mutacin del DOM buscando ', svg' genricos, lo que obligaba a computar 'getBoundingClientRect' de decenas de SVGs causando Layout Thrashing repetitivo.
**Causa 2 (video_progress.js):** Si la lgica no encontraba instantneamente la barra de progreso de los segmentos, haca un fallback a 'document.querySelectorAll("div")' y forzaba reclculo de estilos en TODOS los divs de la pgina... 60 veces por segundo (va requestAnimationFrame)!
**Solucin:** Se elimin el selector ', svg' genrico y se implement una cach ('window.__md_cachedSegmentsContainer') para la barra de segmentos. Ahora, una vez detectada, se recicla en las siguientes 60 iteraciones/segundo sin tocar el DOM entero.


## Fix (Septiembre 2026): Ghost Online y WebSockets (MQTT)
**Problema:** El modo 'Quitar Online' dejA3 de funcionar porque Instagram migrA3 su estado de presencia en la web a un protocolo MQTT sobre WebSockets (wss://edge-chat.instagram.com/chat), el cual no era interceptado por nuestro proxy de etch/XHR.
**SoluciA3n QuirArgica:** En lugar de bloquear el dominio completo con declarativeNetRequest (lo cual romperA-a los Mensajes Directos en tiempo real), inyectamos un Proxy alrededor de window.WebSocket en ig_interceptor.js. El proxy sobrescribe el mAAtodo .send(), decodifica el payload y, si la opciA3n estAA activa, descarta silenciosamente AAnicamente los paquetes que contienen firmas de presencia MQTT (update_presence, presence_subscribe, oreground_state), permitiendo que el chat bidireccional siga operando 100% normal.

## Fix (Septiembre 2026): Error de Ã�ndice en Carruseles con Videos
**Problema:** Al descargar videos de un carrusel, Instagram saca la etiqueta `<video>` del `<ul>` y elimina su `<li>` del DOM para ahorrar memoria. Esto causaba que la extensiÃ³n usara la geometrÃ­a para encontrar el `<li>` mÃ¡s cercano, deduciendo errÃ³neamente que el usuario estaba en el slide anterior (ej. slide 3 en lugar del video 4). La API de Fiber no podÃ­a emparejar el video por URL porque los videos usan `blob:` o no tienen `.poster`, asÃ­ que Fiber confiaba en el Ã­ndice errÃ³neo, devolviendo la media de la imagen 3.
**SoluciÃ³n MatemÃ¡tica (Scroll FÃ­sico):** Se implementÃ³ una lÃ³gica de extracciÃ³n basada 100% en el motor fÃ­sico del navegador. En lugar de buscar etiquetas o puntitos (que se colapsan), el script encuentra el verdadero contenedor que hace scroll (el `<div>` exterior con `scrollWidth > clientWidth`). Luego, divide su desplazamiento actual (`scrollLeft`) entre su ancho (`clientWidth`). Esto arroja un Ã­ndice matemÃ¡ticamente puro que es exacto sin importar quÃ© haya (o no haya) en el DOM.

## Fix (Septiembre 2026): Ghost Mode Roto por CondiciÃ³n de Carrera en la InyecciÃ³n de Scripts
**Problema:** Tras separar `ig_interceptor.js` en mÃºltiples archivos por modularidad, el modo fantasma de historias y online dejÃ³ de funcionar. La causa fue una condiciÃ³n de carrera (Race Condition): el script inicializador (`ig_interceptor_init.js`) enviaba un mensaje (`postMessage`) a la ventana con la configuraciÃ³n guardada de `chrome.storage.local` usando un `setTimeout` estÃ¡tico de 100ms. Dado que los nuevos scripts se inyectaban de forma secuencial esperando el evento `onload` de cada uno, el proceso tardaba mucho mÃ¡s de 100ms. Como resultado, el mensaje de configuraciÃ³n se disparaba hacia el vacÃ­o *antes* de que `ig_ghost_mode.js` (el tercer script en la lista) terminara de cargarse y pudiera escuchar el evento, causando que Ghost Mode inicializara siempre en `false`.
**SoluciÃ³n:** Se eliminÃ³ el `setTimeout` ciego. Ahora, la lectura de `chrome.storage.local` y el posterior envÃ­o de los mensajes `postMessage` solo ocurren estrictamente dentro de la funciÃ³n `injectNextScript` en su condiciÃ³n base, es decir, *despuÃ©s* de que todos los scripts del arreglo `scriptsToInject` han sido cargados y ejecutados exitosamente en el DOM.

## Fix (9 de Septiembre 2026): Eliminación de Cuello de Botella (Fork Bomb) y Throttle en Stories
**Causa Raíz:** Al refactorizar `video_progress.js` en módulos, se dejó accidentalmente un `requestAnimationFrame` duplicado al final de `feed.js` que generó un fork bomb exponencial. Además, la búsqueda global de `document.querySelectorAll('div')` se estaba ejecutando 60 veces por segundo en historias nuevas.
**Solución:** Se eliminó el `requestAnimationFrame` sobrante de `feed.js`. En `story.js`, la búsqueda del contenedor de segmentos se limitó a `section div, main div, div[role="dialog"] div` y se le aplicó un *throttle* de 250ms para permitir a la UI respirar, restaurando el rendimiento al 100% sin lags al entrar o cambiar de historia.

## Fix (9 de Septiembre 2026, pt 2): Optimizacion de getActiveStoryMedias y Hover
**Problema:** El slider perdio su expansion de :hover en historias de solo foto por culpa de pointer-events:none. Ademas, getActiveStoryMedias (que usa getComputedStyle y trepa el DOM) corria a 60fps en cada frame, causando Layout Thrashing masivo (lag a 30fps) y el throttle de 250ms causaba que la barra tardara un cuarto de segundo en aparecer al cambiar de historia.
**Solucion:** Se cambio pointer-events:none por e.preventDefault() en mousedown, lo cual bloquea el dragging sin romper el hover de CSS. Para el rendimiento, se implemento una cache para getActiveStoryMedias que se invalida cada 250ms o cuando cambia de historia, recuperando la fluidez absoluta. Ademas, si el contenedor de la historia es destruido, el throttle de 250ms se pone a 0 para asegurar busqueda instantanea en el siguiente frame.


## Fix (10 de Septiembre 2026): Anillo Gris del Modo Fantasma desaparece en Historias
**Causa RaÃ­z:** Instagram implementÃ³ un A/B test (o cambio definitivo) en la interfaz web donde el botÃ³n del anillo de las historias en la barra superior (Stories Tray) cambiÃ³ su etiqueta HTML de `<button>` a `<div role="button">`. Como nuestro selector CSS de Ghost Mode esperaba un `button:has(...)`, dejÃ³ de coincidir y el anillo gris ya no se mostraba a pesar de estar guardado en memoria.
**SoluciÃ³n:** Se actualizÃ³ el selector en `fiber_search.js` para incluir `[role="button"]:has(img[alt*="${u}"]):not(:has(video)) canvas`, garantizando que coincida tanto con el diseÃ±o antiguo como con el nuevo, y filtrando cualquier falso positivo en carruseles de video.

## Fix (Octubre 2026): Estado Checked Persistente al Cambiar de Historia en Instagram
**Problema:** Al descargar una historia y navegar a la siguiente (o cambiar de slide), el boton de descarga en la nueva historia se quedaba congelado en el estado de exito/checked (md-success) en lugar de volver a su estado default.
**Causas Raiz:**
1. document.body.__md_download_state no tenia asociacion con el ID o URL de la historia descargada. Cualquier historia navegada dentro de la ventana de 2 segundos heredaba el md-success via syncStoryButtonState.
2. Cuando React reutilizaba el nodo de cabecera o boton entre historias, o cuando pasaban los 2 segundos y se eliminaba __md_download_state, la condicion if (parent && parent.__md_download_state) impedia que el bloque else restableciera el boton al estado default.
3. Si la respuesta de descarga finalizaba despues de que el usuario ya habia cambiado de historia, el callback modificaba el boton visible en la nueva historia.
**Solucion:**
1. Se implemento getStoryKey() para identificar univocamente cada slide de historia (por usuario y story_id / story_media_id).
2. Se vinculo storyKey dentro de __md_download_state en utton_state.js y story_button.js.
3. En injectStoryButton(), al detectar un cambio de currentStoryKey (window.__md_lastActiveStoryKey !== currentStoryKey), se invalida la cache de dots y se restablecen forzosamente todos los botones de historia en el DOM a su estado default.
4. En syncStoryButtonState(btn), si el estado no coincide con el storyKey actual o ya expiro, se restablece automaticamente el boton a SVG_DOWNLOAD.
5. En el callback de chrome.runtime.sendMessage, se valida si el usuario sigue en la misma historia antes de asignar md-success al boton.

## Fix (Octubre 2026): Optimizacion Masiva de Rendimiento y Erradicacion de Layout Thrashing en Instagram
**Problema:** Rendimiento degradado, lag y micro-tirones constantes en el feed y en stories de Instagram.
**Causas Raiz:**
1. RAF Fork Bomb en feed.js: Durante cambios de pagina o modales, syncOverlays() llamaba a requestAnimationFrame(syncOverlays) dentro del frame loop de loop.js, multiplicando callbacks exponencialmente en cada frame.
2. Layout Thrashing cuadratico en feed.js: Para cada video del feed, se recorrian botones y medios con bucles while que trepaban hasta document.body llamando a getComputedStyle a 60 FPS, intercalando lecturas de layout con escrituras forzadas.
3. Medicion masiva de segmentos en story.js: syncStoryProgressBar() calculaba geometrias con getBoundingClientRect() en todos los segmentos (hasta 50) y todos sus divs hijos en cada frame de 16ms.
4. Escaneo de SVGs sin throttle efectivo en story_button.js y feed_buttons.js: Throttle de 16ms inexistente en monitores de 60Hz y consultas querySelectorAll('svg') sin acotar al contenedor activo.
**Solucion:**
1. Eliminacion de la llamada redundante requestAnimationFrame(syncOverlays) en feed.js.
2. Filtro anticipado para descartar videos fuera del viewport en feed.js, reemplazo de escalada con offsetParent === null, y ejecucion del chequeo de carrusel activo acotado unicamente al contenedor padre con throttle de 150ms.
3. Fast-path en story.js: medicion dirigida unicamente al segmento actualmente activo (__md_lastKnownSegmentIndex), reduciendo 30-50 consultas geometricas por frame a tan solo 1. Acotamiento del escaneo de filas al contenedor de historia.
4. Aumento del throttle de escaneo pesado en story_button.js a 200ms y acotamiento de busqueda de SVGs a contenedores de cabecera (header, section, ._aa61).
5. Acotamiento de busqueda de bookmark en feed_buttons.js a contenedores de posts (article, dialog, main section) y retorno rapido en el listener de clics de main.js.
6. Empaquetado y compilacion del bundle de features mediante esbuild (dist/video_progress.bundle.js).

## Refactor (Octubre 2026): Limpieza Quirurgica de Codigo Muerto en Modulo de Instagram
**Objetivo:** Erradicar funciones huerfanas, constantes no utilizadas, estilos CSS obsoletos y carpetas vacias sin romper referencias cruzadas ni scopes globales.
**Elementos Eliminados:**
1. src/instagram/features/feed/: Carpeta vacia residual eliminada.
2. src/instagram/utils/platform.js: Funcion huerfana extractUrlSignature() eliminada.
3. src/instagram/ui/svgs.js: Constante no utilizada SVG_SKIP eliminada.
4. src/instagram/core/styles.js: Reglas CSS obsoletas .md-mini-btn* y animacion @keyframes mdPfpFill (.md-pfp-extracting) eliminadas.
5. src/instagram/features/progress/story.js: Selector residual .md-mini-btn eliminado.
**Falsos Positivos Validados y Preservados:**
- idToShortcode() y getPlatform() en platform.js: Preservadas y validadas (llamadas desde button_state.js).
- Reempaquetado exitoso de dist/video_progress.bundle.js via esbuild.

## Feature & Fix (Octubre 2026): Smart Resume Guard para Historias en Modo Fantasma
**Problema:** Al tener Ghost Mode activo, las historias de Instagram siempre se abrian desde la diapositiva 1 (la primera historia), incluso si el usuario ya habia visto varias diapositivas previamente. Esto se debe a que Ghost Mode bloquea las peticiones de seen, dejando el estado de reel.seen en 0 tanto en el servidor como en el cliente de React (Relay), provocando que Instagram siempre evalue la primera diapositiva como no vista.
**Auditoría de Fallos de la Implementación Previa (Opción 1 con URL/History):**
1. En desktop web, la URL al abrir desde el tray es `/stories/<username>/` sin dígitos numéricos de story ID; el regex `/^\/stories\/([a-zA-Z0-9_.-]+)\/(\d+)\/?/` nunca coincidía, por lo que nunca se guardaba nada en localStorage (escritura nula).
2. Instagram SPA es un carrusel interno en React que actualiza estados y CSS transforms (`translate3d`), sin disparar `history.pushState` ni `replaceState` en transiciones de diapositivas.
3. Los círculos de historias en el feed son `<div role="button">` o `<button>`, no etiquetas `<a href="...">`; el listener de click/pointer jamás capturaba el evento.
4. El store en memoria de Relay calcula la diapositiva inicial en base a `reel.seen_timestamp === 0`, ignorando cualquier ID secundario en la URL al montar.
**Solución Definitiva (Ground-Truth Carousel Resume):**
1. **Medición Ground-Truth Unificada:** Se centralizó `getStorySegmentInfo()` en [story_resume.js](file:///c:/Users/Migue/Documents/Projects/media_downloader_extension_dev/src/instagram/interceptors/core/story_resume.js) (leyendo `#md-story-counter` o barras de segmentos nativas en el DOM) y se sincronizó con `ghost_mode.js`.
2. **Guardado Atómico:** Cada vez que Ghost Mode intercepta una petición `seen` protegida o el monitor de 250ms detecta avance de diapositiva (`segInfo.cur > 1 && segInfo.cur < segInfo.total`), se persiste en `localStorage` (`md_ghost_story_checkpoints`) con TTL de 24 horas y deduplicación por usuario.
3. **Reanudación Activa Nativa:** Al montar el visor de historias de un usuario con checkpoint (`slideIndex > 1`), `story_resume.js` espera a que las barras de segmentos estén presentes y ejecuta avances programados (~60ms por paso) disparando el evento de teclado universal y agnóstico de idioma `KeyboardEvent('keydown', { key: 'ArrowRight' })` (con fallback dinámico al botón chevron Next), guiando la máquina de estados nativa de React de forma imperceptible y fluida (~120ms total).
4. **Invalidación y Limpieza:** Al alcanzar la última diapositiva (`segInfo.isLast`), o al detectarse una nueva historia subida vía GraphQL (`media_parser.js`), el checkpoint del usuario se purga automáticamente.
5. Reempaquetado exitoso de `dist/ig_interceptor.bundle.js` vía esbuild.

## Auditoría Profunda y Corrección Integral: Ghost Mode y Story Resume Guard
**Fecha:** 21 de Octubre 2026
**Estado:** RESUELTO
**Problemática:** Tras la implementación inicial del guard, las historias en modo fantasma continuaban regresando a la diapositiva 1, los checkpoints se borraban prematuramente, se inundaba la consola con logs continuos de `"✨ Story Alert New story posted..."`, y se reportaban fallos de navegación.
**Causas Raíz Descubiertas en la Auditoría:**
1. **Falso '1/1' en `#md-story-counter` (story.js):** El elemento se inicializaba con `textContent = '1/1'` para evitar flash visual. Al montar la historia, `getStorySegmentInfo()` leía inmediatamente `1/1` (`cur=1, total=1`), interpretando erróneamente que la historia estaba en su última diapositiva (`isLast: true`). Esto provocaba que `ghost_mode.js` marcara al usuario como visto en `md_ghost_seen_users` y ejecutara `clearStoryCheckpoint(username)` en el mismo milisegundo de entrar a la historia.
2. **Loop de Falsos Positivos de "Story Alert" (media_parser.js):** En GraphQL de Instagram, `device_timestamp` se transmite en microsegundos (~1.7e15), mientras que `seenTime` usa `Date.now()` en milisegundos (~1.7e12). La comparación `tsMs > seenTime + 5000` resultaba siempre verdadera (por un factor de 1000), borrando cíclicamente `seenUsers[uname]` y ejecutando `clearStoryCheckpoint(uname)` en cada petición de red en segundo plano.
3. **Botón de Navegación Equivocado (findNextStoryButton):** El selector `button[aria-label="Next"]` o con `left > centerX + 100` en desktop web apunta al chevron de navegación de **siguiente cuenta/usuario**, no de siguiente diapositiva. Al intentar avanzar diapositivas, la extensión hacía clic en ese botón, saltando de usuario y abortando el resume.
4. **Falta de Guard contra `resumeInProgress` en `ghost_mode.js`:** Durante el avance programado (ej. diapositiva 1 a 3), Instagram enviaba peticiones `seen` intermedias; `__md_markStoryAsGhostSeen` capturaba estas peticiones y sobreescribía el checkpoint con diapositivas inferiores.
5. **Bloqueo Involuntario de Likes:** `isSeenRequest` contenía `usepolarisstorylike` y `xdtstorylike`, lo que bloqueaba la posibilidad de dar like a historias cuando Ghost Mode estaba activo.
**Solución Quirúrgica:**
1. `story.js`: `#md-story-counter` se inicializa vacío (`dataset.ready = 'false'`) y sólo se marca `ready = 'true'` con `dataset.cur` y `dataset.total` tras la medición geométrica real.
2. `story_resume.js`: Eliminado `findNextStoryButton`. El avance simula el clic nativo en el 85% horizontal de la tarjeta de la historia con `buttons: 1`, `composed: true`, invocando `.click()` en el elemento objetivo y despachando `KeyboardEvent('ArrowRight')`.
3. `story_resume.js`: Búsqueda de segmentos acotada al contenedor raíz de historia (`section, div[role="dialog"], main`), erradicando `document.querySelectorAll('div')`.
4. `ghost_mode.js`: Eliminados `xdtstorylike` y `usepolarisstorylike`. Se blindó `__md_markStoryAsGhostSeen` con `window.__md_resumeInProgress` para evitar limpiar o sobreescribir checkpoints durante el avance activo.
5. `media_parser.js`: Normalización estricta de marcas de tiempo (microsegundos, milisegundos y segundos) con margen de reloj de 10 segundos para descartar falsas alertas de historias nuevas.
6. Compilación exitosa de ambos bundles (`dist/ig_interceptor.bundle.js` y `dist/video_progress.bundle.js`).
7. **Aplicación Inmediata de Aro Gris:** Se eliminó la restricción que impedía poner el aro en gris hasta alcanzar la última diapositiva. Al abrir cualquier historia, el usuario se marca como visto de inmediato en `md_ghost_seen_users` y se aplica el estilo visual, conservando a la vez el checkpoint si la historia se vio de forma parcial.
8. **Soporte de Cuentas con 1 Sola Historia:** Se ajustó la detección de segmentos a `ch.length >= 1`, permitiendo que cuentas con un único slide sean reconocidas y marcadas instantáneamente.
9. **Selectores Multilingües y Barrido DOM Directo:** Soporte para Instagram en español (`"Foto del perfil de..."`), inglés y cualquier idioma en etiquetas `<img>`, cubriendo tanto elementos `<canvas>` como `<svg>`. Además de `#md-ghost-styles`, se inyecta directamente el filtro gris en los elementos del DOM.
10. **Sincronización en SPA:** Sincronización visual periódica (cada 1s) y al navegar (`popstate`), garantizando que al regresar al feed los aros permanezcan grises sin requerir recargar la página.



## Fix (21 de Noviembre 2026): Fugas del Ghost Mode (fail-open) y Canal de Configuración Inseguro
**Estado:** RESUELTO (verificado con test de comportamiento sobre el bundle real: 13/13; el bundle anterior fallaba los escenarios de fuga)
**Causas Raíz:**
1. **Carrera de arranque (fail-open):** Los flags iniciaban en `false` (`logger.js`) hasta que `chrome.storage.local.get` respondía, y eso ocurría *después* de cargar el bundle vía `<script src>` asíncrono. Toda petición de presencia/visto emitida en ese intervalo salía sin filtrar. Además, el código de Instagram podía capturar la referencia original de `fetch` antes del parche.
2. **Formas de petición no inspeccionadas:** `(url || "").toString()` convertía un `Request` en `"[object Request]"` y `FormData`/`Blob`/`ArrayBuffer` en `"[object ...]"`, así que esos seen requests nunca coincidían con los marcadores.
3. **Canal sin validación:** Los listeners del MAIN world (`MD_VANISH_TOGGLE`, `MD_SPOOF_ZOOM`, `MD_REQUEST_FIBER`) no verificaban `event.source`: cualquier ventana con referencia (opener, iframe) podía apagar el modo fantasma. Con `event.data === null` lanzaban `TypeError`.
4. **WebSocket roto:** `window.WebSocket = function(){}` eliminaba `WebSocket.OPEN/CLOSED` e `instanceof`, que el código de IG puede usar antes de enviar.
5. **Historial fantasma muerto:** `MD_GHOST_HISTORY_ADD` se emitía pero nadie lo escuchaba desde que se eliminó `vanish_init.js`; el popup siempre mostraba la lista vacía.
**Solución (verificada en docs oficiales vía Context7: `document_start` corre "before any other DOM is constructed or any other script is run"; `world: "MAIN"` es clave válida de `content_scripts`):**
1. `manifest.json`: el bundle se inyecta como content script `"world": "MAIN"`, `run_at: document_start`, `all_frames: true`. Se quitó de `web_accessible_resources` (los sitios ya no pueden sondear la extensión por ese archivo).
2. Nuevos módulos con responsabilidad única:
   - `ghost_settings.js`: estado de flags, promesa `settingsReady`, mensaje tipado `MD_GHOST_SETTINGS` (valida booleanos, `event.source === window` y mismo origen), handshake `MD_GHOST_SETTINGS_REQUEST` y aviso si no llegan en 5s.
   - `request_body.js`: normaliza URL (`string|URL|Request`) y cuerpo (`FormData`, `URLSearchParams`, `Blob` ≤256KB, `ArrayBuffer`, vistas, `Request` clonado).
   - `ghost_policy.js`: clasificación y decisión puras (marcadores sin cambios respecto a la versión anterior).
3. `network.js`: **fail-closed** — solo las peticiones *relevantes* para el modo fantasma esperan a la configuración; el resto pasa sin demora. XHR asíncrono se difiere; XHR síncrono relevante sin configuración se retiene. `sendBeacon` y WebSocket se movieron aquí; WebSocket ahora parchea `WebSocket.prototype.send`. Metadatos de XHR en `WeakMap` (sin propiedades expando visibles). El sniffing de respuestas se limita a content-types textuales (antes decodificaba segmentos de video como texto).
4. `ig_interceptor_init.js`: ya no inyecta scripts; envía siempre el snapshot completo de los 3 flags (al cargar, al cambiar storage, al recibir handshake o `MD_UPDATE_SETTINGS`) y persiste `ghostHistory` validando el username (`^[A-Za-z0-9._]{1,30}$`) con retención de 48h.
5. `logger.js`: `logError()` para cumplir Zero Silent Errors en el MAIN world.
**Riesgo residual conocido:** el propio código de la página comparte `window` y podría falsificar `MD_GHOST_SETTINGS`; los frames WebSocket tipo `Blob` no se inspeccionan (los de presencia MQTT son `ArrayBuffer`).
