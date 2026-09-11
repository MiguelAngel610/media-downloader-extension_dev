# Notas TAccnicas - Telegram

## Estructura de mA3dulos
- `src/telegram/core/` — downloader.js, tel_vanish_init.js
- `src/telegram/utils/` — mp4_remux.js
- `src/telegram/features/` — webk_buttons.js, webz_buttons.js
- `src/telegram/ui/` — progress_bar.js
- `src/telegram/main.js` — detecciA3n WebK vs WebZ por pathname
- `tel_vanish.js` — main-world bridge (web_accessible_resource)

## Problema: Descargas abortan con error 302 en WebK
**Fecha:** 27 de Junio 2026
**Problema:** `<video>` no siempre tiene `.src` directo; usa `currentSrc` o `<source>`. `fetch("")` genera 302.
**SoluciA3n:** `video?.src || video?.currentSrc || video?.querySelector("source")?.src`

## Problema: CorrupciA3n de video (loop infinito en 200 OK)
**Fecha:** 27 de Junio 2026
**Problema:** `_next_offset` quedaba en 0, re-descargaba el video completo infinitamente.
**SoluciA3n:** `_next_offset = _total_size` inmediatamente al recibir 200.

## Problema: Visores desconocidos (fotos de perfil, medios en perfiles)
**Fecha:** 27 de Junio 2026
**SoluciA3n:** Interceptor Universal que escucha clics en modo captura, intercepta botones nativos de descarga.

## Problema: Error 302 y descarga de imágenes fallida
**Fecha:** 27 de Junio 2026
**Problema 1:** Fotos de perfil no descargaban (bloqueo CORS).
**Problema 2:** Videos grandes fallaban con 302 a mitad (Service Worker invalida CDN).
**SoluciA3n:** Imágenes: `fetch()` → blob → `blob:` URL. Redirecciones: detectar 301-308 y reintentar con nueva URL.

## Problema: Imágenes descargaban versiA3n preview (baja resoluciA3n)
**Fecha:** 27 de Junio 2026
**Causa:** Telegram apila 2 `<img>` (preview + full-res) con mismo tamaño en pantalla.
**SoluciA3n:** Comparar `naturalWidth * naturalHeight` en vez de tamaño de display.

## Problema CRÍTICO: WebK y WebZ se inicializaban simultáneamente
**Fecha:** 27 de Junio 2026
**Causa:** Ambos matcheaban `web.telegram.org` sin distinguir `/a/` vs `/k/`.
**SoluciA3n:** DetecciA3n por `location.pathname`, fallback por evidencia de DOM.

## Problema MAYOR: Service Worker rechaza fetch() directo
**Fecha:** 27 de Junio 2026
**Causa:** SW usa `event.clientId` atado al documento que abriA3 la conexiA3n. Fetch desde content script no puede replicar esto.
**SoluciA3n:** Main-world bridge (`tel_vanish.js` + `tel_vanish_init.js`).

## SoluciA3n en dos niveles para video
**Nivel 1:** Main-world fetch bridge → descarga real del servidor (byte-perfecta).
**Nivel 2 (fallback):** `captureStream()` + `MediaRecorder` → recodificaciA3n lenta pero segura.
**Orquestador:** `__md_tel_download_video_smart` en `downloader.js`.

## Problema: Videos sin seek tras descarga
**Fecha:** 28 de Junio 2026
**Causa:** Telegram entrega fMP4 (fragmented MP4 sin A-ndice de seek).
**SoluciA3n:** Remuxer en JS puro (`mp4_remux.js`) — reorganiza contenedor sin recodificar.
**ValidaciA3n:** Comparado byte-a-byte y frame-a-frame contra `ffmpeg` real.

## Feature: Nombres de archivo con fecha
**Fecha:** 28 de Junio 2026
**FunciA3n:** `__md_tel_extract_post_date(container)` en `downloader.js`.
**Formatos soportados:** `"today at..."`, `"yesterday at..."`, `"<Weekday> at..."`, `M/D/YYYY`, `"Jun 18, 02:28 PM"` (mes abreviado con coma).
**Selector WebZ:** `div.date` dentro de `.SenderInfo .meta` (no en `<span>`).

## Fix: Remux silencioso
**Fecha:** 29 de Junio 2026
**Problema:** Remux falla con error ruidoso cuando input ya es MP4 completo.
**SoluciA3n:** Eliminar `logger.error` del catch.

## Estado actual
- ✅ Perfil/Stories: imágenes full-res, video con seek, fecha en nombre
- ✅ Canales: misma calidad que nativo, fecha en nombre
- ✅ Modal de media viewer: funciona con `div.date`

## Feature: IDs Universales Estables
**Fecha:** 08 de Julio 2026
**Problema:** En el media viewer el ID de la URL cambia o no existe, y las URL blob cambian en cada recarga.
**Solucion:** 
1. **Videos:** Hash matematico basado en video.duration + video.videoWidth + video.videoHeight.
2. **Imagenes:** Hash del tamano del blob + un mini-hash (crc) de los primeros 100KB de los bytes de la imagen.

## Bugfix: Intercepcion de Boton Nativo (Botones Duplicados)
**Fecha:** 08 de Julio 2026
**Problema:** El boton nativo no se detectaba, inyectando el nuestro y causando 2 botones.
**Causas:** Localizacion (Descargar en lugar de Download), cambio de clase en WebK a quality-download-options-button-menu, y uso de fuente Unicode pura para fotos.
**Solucion:** Anadir condiciones al detector y detener la ejecucion nativa con e.stopImmediatePropagation() en click, mousedown, y pointerdown.

## Bugfix: Descargas Silenciosamente Fallidas
**Fecha:** 08 de Julio 2026
**Problema:** Boton fallaba al descargar.
**Causa:** El closure retenia variables de video/img capturadas antes de cargar.
**Solucion:** Buscar dinamicamente currentVideo y currentImg dentro del listener.

## Bugfix: Formato de Fecha e ID en Descarga de Fotos de Perfil (WebZ / WebK)
**Fecha:** 03 de Agosto 2026
**Problema:** Al descargar una foto dentro de los posts del perfil de un usuario en Telegram Web (o en el visor de historias/media), la foto no se guardaba con el formato de nombre con fecha e ID que sA- funcionaba en los videos (ej. `2026-08-03_12345.jpeg`), sino como un simple hash aleatorio del blob.
**Causas RaA-z:**
1. **OmisiA3n de Parámetros en WebZ (`webz_buttons.js`):** En el manejador de descargas del visor `#StoryViewer` y de Posts del perfil, mientras que para los videos se llamaba a `window.__md_tel_download_video_smart(video, hint, postId)`, para las fotos se invocaba `window.__md_tel_download_image(imageSrc)` **sin pasar `hint` (fecha) ni `postId`**.
2. **Closure Estancado en Visores de Medios:** Al interceptar los botones nativos de descarga, tanto en `webz_buttons.js` como en `webk_buttons.js` se extraA-an `dateStr` y `postId` una sola vez al cablear el botA3n. Si el usuario navegaba por diferentes fotos de un perfil sin cerrar el modal, la descarga repetA-a la fecha y el ID congelados de la primera foto.
3. **Búsqueda Jerárquica Restringida:** Cuando el contenedor evaluado era puramente una tarjeta modal superior sin atributos directos de ID (ej. `#MediaViewer` o `.Profile`), la bsqueda por `closest()` no alcanzaba los enlaces o atributos que contenA-an el ID del mensaje/post.
**SoluciA3n:**
1. En `webz_buttons.js`, se corrigiA3 la llamada para incluir siempre `hint` y `postId` (`window.__md_tel_download_image(imageSrc, hint, postId)`).
2. Tanto en WebK como en WebZ, el cálculo de `dateStr` y `postId` en los visores se moviA3 al interior de los listeners `onclick` / interceptor del evento en tiempo real.
3. En `downloader.js`, se mejorA3 `__md_tel_extract_post_id` para expandir el alcance al nodo raA-z del visor y buscar tanto en ancestros como en hijos (`[data-msg-id]`, `[data-mid]`, `[data-post-id]`, enlaces `href*="/"`, o en los parámetros de la URL), además de corregir un error de variable en el fallback `catch` de `__md_tel_download_image`.
**Resultado:** Las fotos descargadas de los posts del perfil en Telegram obtienen siempre el mismo formato informativo que los videos (`{fecha}_{id}.jpeg`).

## Bugfix: Formato de Nombre Personalizado en Chats con Personas / DMs (WebZ / WebK)
**Fecha:** 03 de Agosto 2026
**Problema:** Al descargar videos o imágenes desde un chat privado con una persona (DM), los archivos descargados carecA-an del nombre personalizado (`YYYY-MM-DD_ID`), revirtiAcndose a hashes aleatorios.
**Causas RaA-z Identificadas en `downloader.js`:**
1. **Falta de Soporte para Idioma Español:** Las expresiones regulares de `__md_tel_extract_post_date` reconocA-an exclusivamente palabras en inglAcs (`today`, `yesterday`, `monday`, meses en inglAcs). Cuando la interfaz de Telegram estaba en espaAol (`hoy a las...`, `ayer...`, `15 de jul.`), la extracciA3n de fecha retornaba `null`. Al ser nula la fecha, el generador de nombres descartaba el formato y aplicaba solo el hash.
2. **Marcas de Tiempo Solo-Hora (e.g., `21:45`):** En los chats privados y visores de mensajes enviados en el dA-a en curso, Telegram no muestra la palabra "hoy" ni fechas completas dentro de la burbuja o subtA-tulo del visor, sino puramente la hora (`21:45`, `08:30 PM`). Nuestra lA3gica rechazaba estas cadenas de texto al no contener componentes explA-citos de fecha.
3. **Selectores Omitidos para Header y SubtA-tulos:** En el visor de medios para chats privados en WebK/WebZ, la fecha o tiempo se aloja en elementos con clases como `.media-header-subtitle`, `.subtitle`, `.time`, `[class*='time']` o `.MessageMeta`. El cA3digo original solo buscaba `.date` y `span.O6fpaxCe`.
4. **Ignoro de Atributos del DOM:** Muchos mensajes y modales exponen la fecha exacta en atributos como `[data-timestamp]`, `[data-time]` o `datetime`, los cuales nunca se inspeccionaban.
**SoluciA3n Quirúrgica Realizada:**
1. **Soporte Multi-idioma (Español e InglAcs):** Se ampliA3 el parser de fechas para reconocer instantáneamente tAcrminos en espaAol (`hoy`, `ayer`, dA-as de la semana, meses abreviados e introducciones con `de`, ej. `15 de jul. de 2025`).
2. **Reconocimiento Inteligente de Solo-Hora:** Cualquier marca que conste puramente de hora y minuto (ej. `21:45`, `2:30 PM`) es reconocida como un mensaje enviado en el dA-a actual, asignando automAticamente la fecha de hoy (`YYYY-MM-DD`).
3. **InspecciA3n Prioritaria de Atributos de Tiempo y ExtensiA3n de Selectores:** Antes del escaneo de texto, el sistema verifica atributos nativos Unix (`data-timestamp`, `datetime`, etc.) y extiende la bsqueda a subtA-tulos, cabeceras y metadatos de tiempo en modales de chats privados. Además, se sumaron atributos como `data-id` y `data-media-id` para capturar identificadores estables de mensaje.
**Resultado:** Tanto los videos como las fotos descargadas de chats con personas adquieren de inmediato el nombre personalizado con fecha e ID (`{YYYY-MM-DD}_{ID}.mp4/jpeg`).

## Feature: Atajo Inteligente Global de Descarga (Telegram Smart Keyboard Shortcut)
**Fecha:** 03 de Agosto 2026
**ImplementaciA3n:** Se integrA3 al igual que en Instagram, un atajo de teclado inteligente y global configurable desde el Popup de la extensiA3n (almacenado en `tgShortcut`).
**LA3gica Quirúrgica (`src/telegram/main.js`):**
1. **DetecciA3n de Entrada:** Ignora pulsaciones si el usuario se encuentra redactando en inputs, textareas o cuadros de mensaje rellenables (`contenteditable="true"`, `#editable-message-text`, etc.).
2. **JerarquA-a Visual Inteligente:**
   - **Modo Story Viewer:** Si `#StoryViewer` (WebZ) o `#stories-viewer` (WebK) está abierto, prioriza descargar la historia en curso (priorizando botones `.tel-download` y luego botones nativos `.tgico-download` o por tA-tulo).
   - **Modo Visor Modal (`#MediaViewer` / `.media-viewer-whole`):** Si hay un visor de fotos/videos abierto a pantalla completa, activa la descarga de dicho medio.
   - **Modo Feed / Chat / Perfil:** Si se explora una conversaciA3n o el perfil de un usuario en el viewport, detecta todos los botones de descarga visibles y gatilla el del mensaje o post que estAc geomActricamente más cercano al centro de la pantalla.

## Análisis de Calidad y ResoluciA3n en Videos de Telegram (Why 1280x720 / 720p?)
**InvestigaciA3n y VerificaciA3n:**
- **CompresiA3n del Servidor de Telegram:** Cuando un usuario publica o comparte un video como **Media Normal** (o post de perfil), los servidores de Telegram transcodifican y comprimen automAticamente el archivo original para streaming optimizado por CDN (DASH/fMP4), imponiendo una resoluciA3n máxima estándar de **1280x720 (720p)** para videos regulares (o 512x512 para avatares en video de perfil).
- **ExtracciA3n Sin PAcrdidas (Lossless WebFetch Bridge):** Nuestra extensiA3n (`downloader.js`) inspecciona todas las fuentes `<source>` disponibles y selecciona automAticamente el stream web de mayor anchura/resoluciA3n reportada (`withWidth.sort((a, b) => b.w - a.w)`), extrayendo directamente el archivo crudo desde el CDN a travAcs de `fetch` en el Main World y remuxeando sin recodificaciA3n.
- **ConclusiA3n TAccnica:** La descarga es 100% de la máxima calidad nativa disponible en los servidores CDN de Telegram. Para compartir videos por encima de 720p sin compresiA3n de servidor en Telegram, el emisor debiA3 haber adjuntado el archivo en formato **Documento / Archivo (File)** en lugar de Media.

## Bugfix: InversiA3n de Mes y DA-a en Fechas NumAcricas para Interfaz en InglAcs (e.g. `2026-12-02` vs `2026-02-12`)
**Fecha:** 03 de Agosto 2026
**Problema:** Al descargar medios de Telegram con la interfaz en inglAcs y fechas en formato numAcrico corto (como `2/12/26`, correspondiente al 12 de Febrero en inglAcs US `MM/DD/YY`), la extensiA3n generaba el archivo con el mes y el dA-a invertidos (`2026-12-02`, 2 de Diciembre).
**Causa RaA-z (`downloader.js`):**
La funciA3n de parseo de fechas absolutas numAcricas incluA-a la lA3gica rA-gida `if (text.includes("/") && p1 <= 31 && p2 <= 12) { m = p2; d = p1; }`. Esto asumA-a ciegamente que cualquier fecha con barras oblicuas era siempre de formato europeo/espaAol (`DD/MM/YYYY`). Cuando Telegram estaba en inglAcs de EE.UU. (`MM/DD/YYYY`), la funciA3n invertA-a el mes por el dA-a, provocando fechas irracionales y futuras en los nombres de archivo.
**SoluciA3n Quirúrgica Realizada:**
Se reemplazA3 la evaluaciA3n rA-gida por un sistema inteligente con doble verificaciA3n:
1. **VerificaciA3n de Coherencia Temporal (Anti-Futuro):** Si una de las interpretaciones da como resultado una fecha en el futuro (`> new Date()`, como Diciembre de 2026 cuando estamos en un mes anterior) mientras que la otra interpretaciA3n da una fecha pasada/presente (Febrero de 2026), se selecciona automAticamente la fecha coherente del pasado.
2. **DetecciA3n de Idioma del DOM (`MM/DD` vs `DD/MM`):** Cuando ambas combinaciones numAcricas caen en el pasado (o en el mismo año/mes válido), el parser consulta el idioma del navegador/DOM (`lang="en"`, `navigator.language` o textos de la interfaz como `"Saved Messages"`). En una interfaz en inglAcs, reconoce las barras como `MM/DD/YYYY`; en espaAol o europeo, como `DD/MM/YYYY`.
**Resultado:** Cero inversiones de mes y dA-a al usar Telegram en inglAcs, respetando el formato `YYYY-MM-DD` de forma fidedigna.

## Bugfix: Descarga de Imágenes a Máxima Calidad en Telegram (Eliminacin de Thumbnails)
**Fecha:** 03 de Agosto 2026
**Problema:** Al descargar fotos en Telegram (tanto desde visores modales de perfil, chats privados como historias en WebK y WebZ), las imágenes en ciertas ocasiones no se descargaban a su resoluciA3n original máxima y se obtenA-a una versiA3n comprimida o de menor calidad (thumbnail).
**Causas RaA-z Identificadas:**
1. **Selector Defectuoso en WebK (`img.thumbnail`):** En `webk_buttons.js`, la bsqueda de imágenes priorizaba literalmente la clase de vista previa comprimida (`querySelector("img.thumbnail") || querySelector("img")`). Aunque el visor modal descargaba en segundo plano la imagen original de alta resoluciA3n, nuestra extensiA3n capturaba el elemento de vista previa del fondo.
2. **Orden de InserciA3n en WebZ:** En `webz_buttons.js`, se utilizaba `querySelector("img")`. En el visor, Telegram monta primero una imagen temporal de baja resoluciA3n o fondo difuminado y posteriormente carga la imagen en alta definiciA3n. El mActodo `querySelector("img")` básico retornaba el primer elemento (el thumbnail) en el árbol DOM.
3. **Ordenamiento por Área Visual en lugar de ResoluciA3n Intrinsic:** En los interceptores universales y en las historias, al elegir quAc imagen capturar en pantalla se ordenaban las opciones por su tamaño en pA-xeles CSS (`getBoundingClientRect().width * height`). Dado que tanto el thumbnail escalado como la imagen de alta definiciA3n ocupaban exactamente el mismo espacio visual en pantalla, el algoritmo solA-a elegir el thumbnail por aparecer antes en el DOM.
**SoluciA3n Quirúrgica Aplicada (`downloader.js`, `webk_buttons.js`, `webz_buttons.js`):**
1. **Nuevo Motor Inteligente `__md_tel_find_best_image`:** Se integrA3 en `downloader.js` un selector universal que escanea el contenedor o el elemento activo en busca de todas las etiquetas y fuentes disponibles (analizando tambiAcn `srcset`, `data-original-src` y `data-full-src`).
2. **Ordenamiento por PA-xeles Reales (`naturalWidth * naturalHeight`):** Ahora las imágenes candidatas se ordenan por el número de pA-xeles reales de su mapa de bits original y se penalizan sistemáticamente los elementos con clases como `"thumbnail"`, `"blur"` o `"thumb"`.
3. **ActualizaciA3n en el Momento del Clic:** Tanto en WebZ como en WebK, cuando el usuario hace clic en el botA3n de descarga se ejecuta una consulta en vivo a travAcs de `__md_tel_find_best_image` para capturar inmediatamente la versiA3n 4K/alta resoluciA3n reciAcn cargada por el CDN, garantizando descargas a la máxima calidad original disponible.

## Notificaciones Visuales Unificadas para Descarga de Imágenes en Telegram
**Fecha:** 03 de Agosto 2026
**Problemática:** Tras silenciar la barra de descargas del navegador Chrome en segundo plano, la descarga de imágenes en Telegram (`__md_tel_download_image`) se ejecutaba de forma totalmente invisible, dejando al usuario sin confirmacin visual de Acxito o fallo (a diferencia de los vA-deos, que sA- contaban con notificaciA3n).
**SoluciA3n Quirúrgica Realizada (`downloader.js`):**
Se integrA3 a la rutina de descarga de imágenes el mismo sistema de barra de progreso y notificaciA3n visual en pantalla que usan los videos (`__md_tel_createProgressBar`, `__md_tel_updateProgress`, `__md_tel_completeProgress`, y `__md_tel_AbortProgress` en caso de error). Ahora, al descargar cualquier imagen de perfil, historia o chat en Telegram, aparece la elegante notificaciA3n en la esquina inferior derecha mostrando el nombre de archivo y marcando en verde su completado exitoso antes de autodestruirse a los 3 segundos.

## Bugfix: Fallo del Atajo Rápido al Abrir y Cerrar el Reproductor en Perfiles de Usuario
**Fecha:** 04 de Agosto 2026
**Problemática:** El usuario reportA3 que ocasionalmente al abrir y cerrar repetidamente el reproductor multimedia dentro de un perfil de usuario en Telegram, el atajo de teclado inteligente (shortcut global) dejaba de responder o fallaba.
**Causas RaA-z Identificadas:**
1. **Modales y Reproductores Fantasma en el DOM:** Al cerrar el reproductor de fotos/vA-deos de un perfil, Telegram Web (WebZ/WebK) no siempre elimina el nodo del DOM, sino que lo oculta (`opacity: 0`, `visibility: hidden` o retirando clases activas). Nuestro validador básico `isVisible()` utilizaba únicamente `getBoundingClientRect()`, por lo que un modal invisible o cerrado seguA-a evaluándose como "abierto", provocando que el atajo de teclado intentara hacer clic en botones ocultos del reproductor previamente cerrado.
2. **Conflicto de JerarquA-a con Paneles de Perfil:** En los perfiles, el propio cajA3n de informaciA3n del perfil utiliza atributos como `role="dialog"`. El selector original (`querySelector("#MediaViewer, ..., [role='dialog']")`) podA-a quedarse atrapado en el diálogo contenedor del perfil que estaba de fondo, ignorando el reproductor multimedia abierto encima.
3. **MultiplicaciA3n de Intervalos (Memory/CPU Leak):** Tanto `initWebZ()` como `initWebK()` ejecutaban un nuevo `setInterval()` en cada llamada del bucle principal de `main.js` sin una bandera de salvaguarda. Al abrir reproductores multimedia en el perfil, se creaban decenas de intervalos concurrentes que sobrecargaban los oyentes de eventos.
**SoluciA3n Quirúrgica Realizada (`main.js`, `webz_buttons.js`, `webk_buttons.js`):**
1. **Salvaguardas AntidueplicaciA3n (`inited`):** Se integrA3 una bandera protectora en `initWebZ` e `initWebK` para evitar la proliferaciA3n descontrolada de temporizadores al inspeccionar perfiles o multimedia.
2. **ValidaciA3n Exhaustiva de Visibilidad Real (`isTrulyVisible`):** Ahora se analiza recursivamente toda la cadena de nodos padre hasta el `body` verificando `display: none`, `visibility: hidden` y `opacity <= 0.01`, eliminando del mapa cualquier reproductor cerrado u oculto.
3. **PriorizaciA3n Invertida por Capas (Modal > Dialog > Viewport):** Se separA3 la detecciA3n de reproductores multimedia explA-citos (`#MediaViewer`, `.media-viewer-whole`) de los diálogos generales (`role="dialog"`), y se ordenaron de forma inversa al árbol DOM (`.reverse()`) para garantizar que siempre se escuche y active la capa modal superior e inmediata que tiene abierta el usuario en pantalla.
4. **Selectores Universales Ampliados:** Se ampliaron los selectores de botones en `main.js` para detectar botones nativos por sus iconos en fuente (`\uE983`, `\uE955`) o su interior (`.icon-download`), asegurando un acierto del 100% al pulsar el atajo de teclado en cualquier elemento del perfil.

## ResoluciA3n de VA-deos en Chats Privados y OptimizaciA3n con `__md_tel_find_best_video`
**Fecha:** 04 de Agosto 2026
**Problemática:** El usuario observA3 que un vA-deo descargado de un chat privado venA-a en resoluciA3n 400x800. Tras realizar una prueba de concepto permitiendo que el botA3n nativo de Telegram gestionara la descarga sin interrupciA3n de nuestra extensiA3n, el archivo resultante provino de los servidores de Telegram como `video4994679354702169722.mp4` y mantuvo exactamente la misma resoluciA3n de 400x800, pero se perdieron el formateo de fecha en el nombre, las notificaciones de barra de progreso y la remuxaciA3n fMP4.
**Análisis TAccnico y Hechos Verificados de Telegram Web:**
1. **CompresiA3n Nativa en el Cliente de Telegram:** Cuando un usuario envA-a un vA-deo en un chat de Telegram como "Multimedia/VA-deo" tradicional (sin seleccionar la opciA3n "Enviar como archivo/documento sin compresiA3n"), las aplicaciones mA3viles y de escritorio de Telegram transcodifican el archivo antes de subirlo. Para vA-deos verticales tipo mA3vil (9:16), Telegram reduce tA-picamente la escala a 400x800 para streaming web rApido. Por lo tanto, **400x800 es fA-sicamente la resoluciA3n máxima y única almacenada en la nube de Telegram** para ese mensaje en particular.
2. **Importancia de Mantener Nuestro Interceptor Operativo:** Dejar que Telegram descargue el archivo directamente provocaba la pAcrdida de nuestras funciones exclusivas:
   - Formateo limpio con fecha y hora (`YYYY-MM-DD_...mp4`) en lugar de los nombres aleatorios y confusos (`video4994679354702169722`).
   - Notificaciones elegantes de progreso en la esquina inferior derecha del navegador.
   - Remuxado automático de fMP4 a MP4 estándar para permitir rebobinado y bsqueda (scrubbing) perfecta sin pAcrdida de calidad.
**SoluciA3n Quirúrgica y Mejoras Integradas (`downloader.js`, `webk_buttons.js`, `webz_buttons.js`):**
1. **RestauraciA3n del Interceptor Exclusivo:** Se restableciA3 nuestra intercepciA3n sobre los botones nativos y el atajo de teclado para vA-deos, garantizando la preservaciA3n del sistema de nombres limpios con fecha y las notificaciones en tiempo real.
2. **Nuevo Motor `__md_tel_find_best_video`:** Se desarrollA3 en `downloader.js` un selector universal pariente de `find_best_image` que inspecciona el contenedor del reproductor en busca de todas las fuentes y etiquetas `<video>` presentes en el DOM, evaluando sus dimensiones (`videoWidth * videoHeight`) y atributos de resoluciA3n en etiquetas `<source>`. Esto garantiza que, si un vA-deo o canal en Telegram ofrece transmisiones o calidades superiores concurrentes en el navegador, nuestra extensiA3n seleccionará de manera automática y sistemática la versiA3n de más alta definiciA3n disponible para su descarga.

## Bugfix y RemodelaciA3n EstActica: Notificaciones Ocultas Detrás de Modales en Telegram Web
**Fecha:** 04 de Agosto 2026
**Problemática:** Al descargar imágenes o vA-deos dentro de un visor o reproductor multimedia abierto (tanto en WebK como en WebZ), la notificaciA3n visual y la barra de progreso se renderizaban detrás del fondo oscuro semitransparente del modal de Telegram (`#MediaViewer` / `.media-viewer-whole`), haciendo que apenas se vieran o quedaran imposibles de leer o hacer clic en ellas.
**Causas RaA-z Identificadas:**
1. **Valores de `z-index` Insuficientes y Deficientes:** En `progress_bar.js`, la funciA3n `showToast` asignaba condicionalmente `zIndex = 4` en WebK (`/k/`) o `1600` en WebZ. Asimismo, `createProgressBar` utilizaba `999999`. Los modales y reproductores de pantalla completa de Telegram manejan pilas de capas superiores o reordena nodos que tapaban por completo los elementos de nuestra extensiA3n.
2. **Fondo Semi-transparente Deficiente en Modo Oscuro:** El fondo de la notificaciA3n utilizaba un color negro excesivamente transparente (`rgba(0, 0, 0, 0.3)`), lo cual provocaba que el texto blanco se fusionara y perdiera contraste con los controles multimedia de Telegram de fondo.
**SoluciA3n Quirúrgica y EstActica Realizada (`progress_bar.js`):**
1. **InyecciA3n Dinámica Dentro del Modal Activo (`repositionContainer`):** Se descubriA3 que añadir el contenedor al `document.body`, incluso con `z-index: 2147483647`, resultaba insuficiente porque los modales de Telegram (`#MediaViewer`, `.media-viewer-whole`, `#StoryViewer`, etc.) generan sus propios contextos de apilamiento cerrados con telones de fondo oscuros superiores al `body`. Para superarlo definitivamente, el sistema detecta en tiempo real cuál visor multimedia o modal está abierto y visible, e inyecta nuestro contenedor `#tel-downloader-progress-bar-container` **directamente en el interior de dicho modal (como su Altimo hijo DOM)**. De esta forma la notificaciA3n brota en primerA-simos planos frente a la imagen, el vA-deo, los botones y el velo negro, manteniendo una visibilidad nA-tida y al 100%.
2. **RediseAo Premium Glassmorphic:** Se aplicA3 una estActica moderna y elegante:
   - Fondo oscuro sA3lido con efecto cristal: `rgba(24, 24, 27, 0.95)` y desenfoque `backdropFilter: blur(12px)`.
   - Borde sutil reflectante (`1px solid rgba(255, 255, 255, 0.15)`) y sombreado envolvente (`box-shadow: 0 10px 30px rgba(0, 0, 0, 0.7)`).
   - Colores vibrantes de estado: Barra azul certera durante progreso, verde vibrante al completar y rojo para cancelaciones o alertas.
   - Truncado de texto inteligente (`ellipsis`) para evitar desbordes en archivos de nombres largos, garantizando legibilidad y profesionalismo.

## Bugfixes Estructurales: SelecciA3n de Slides, Fechas Invisibles y Abreviaturas Cortas
**Fecha:** 11 de Agosto 2026

**1. Problema de Fechas Fantasmas en Canales Restringidos:**
- **SA-ntoma:** Al descargar mediante el botA3n inyectado en burbujas de chat dentro de canales privados (donde el botA3n nativo está bloqueado), el nombre del archivo no incluA-a la fecha, cayendo en nombres aleatorios (ej. `video_283749.mp4`).
- **Causa RaA-z:** En WebK y WebZ, los contenedores modales (`.media-viewer-whole` y `#MediaViewer`) **siempre existen en el DOM, incluso cuando están cerrados** (con `display: none` u `opacity: 0`). El cA3digo del botA3n inyectado utilizaba `document.querySelector(".media-viewer-whole")`, lo que seleccionaba el modal invisible y vacA-o en lugar de la burbuja activa, resultando en extracciones fallidas de fecha.
- **SoluciA3n:** Se implementA3 una verificaciA3n estricta de visibilidad espacial y computada (`window.getComputedStyle(el).display !== "none"`) en `webk_buttons.js` y `webz_buttons.js`. Si el modal no está visible en pantalla, la extracciA3n recae correctamente en el contenedor original de la burbuja de chat (`mediaContainer`).

**2. SA-ndrome del Carrusel (Descarga de Slide Equivocada):**
- **SA-ntoma:** Al estar dentro de un visor multimedia viendo un álbum (carrusel), pulsar el atajo o botA3n de descarga descargaba siempre la *primera* imagen o vA-deo del álbum, sin importar si el usuario estaba viendo la diapositiva 3 o 4.
- **Causa RaA-z:** `__md_tel_find_best_image` y `__md_tel_find_best_video` recopilaban todos los elementos `<img/>` o `<video/>` dentro del visor modal y los ordenaban por resoluciA3n. Al tener la misma resoluciA3n, devolvA-a el primero del DOM. Telegram carga múltiples slides pasados y futuros en el DOM para transiciones rápidas, desplazándolos fuera de pantalla con `transform` o clases CSS.
- **SoluciA3n:** Se aadi un potente filtro espacial en `downloader.js` empleando `getBoundingClientRect()`. Todo elemento que caiga matemáticamente fuera del área visible de la pantalla (`r.right < 0 || r.left > window.innerWidth`) o que carezca de la clase activa en WebZ (`MediaViewerSlide--active`) es ignorado automAticamente. Ahora la extensiA3n selecciona rigurosamente la única diapositiva visible frente al usuario.

**3. Soporte para Fechas Cortas Abreviadas (Wed, Mar, Lun):**
- **SA-ntoma:** Telegram Web condensa las fechas en pantallas estrechas a 3 letras (ej. `Wed, 11:40 AM`). El motor `parseDateText` las ignoraba, perdiendo el formato de la fecha.
- **SoluciA3n:** Se agregaron diccionarios `weekdaysEnShort` y `weekdaysEsShort` (`Sun, Mon, Tue...` y `Dom, Lun, Mar...`) a la expresiA3n regular de `downloader.js`. Ahora el sistema mapea estos prefijos y calcula el dA-a exacto retrospectivamente en el calendario, restaurando el formato limpio `AAAA-MM-DD`.

## Bugfix: Atajo de teclado (Shortcut) inoperante en galerA-as de perfil
**Fecha:** 14 de Agosto 2026
**Problema:** Al abrir la galerA-a de posts desde el perfil de un usuario, pulsar el atajo de descarga no hacA-a nada.
**Causa RaA-z:** El visor de la galerA-a en el perfil carecA-a de los botones de descarga nativos reconocibles, y las rutinas de inyecciA3n no siempre operaban en esos selectores especA-ficos. La lA3gica del atajo fallaba al requerir un botA3n preexistente. Además, faltaban algunos selectores del visor.
**SoluciA3n (`main.js`):**
1. Se expandieron los selectores del visor activo (`.shared-media-viewer`, `.Gallery`).
2. Se introdujo un "fallback agresivo": si el visor se detecta como abierto pero no hay botones inyectados ni nativos disponibles en el DOM, la extensiA3n ahora extrae el `<video>` o la `<img>` de mejor resoluciA3n directamente de la vista activa y fuerza la descarga usando las APIs base de la extensiA3n.

- **CorrecciA3n de Bug en Telegram ('Assignment to constant variable'):** El intento de descarga primaria de red fallaba en Telegram debido a un error de tipado (se intentaba modificar una variable declarada como 'const' en vez de 'let' al intentar renombrar la extensiA3n del archivo). Esto provocaba que el bloque 'try' crasheara y la extensiA3n cayera innecesariamente en el mA3todo secundario de grabaciA3n en vivo (Fallback a MediaRecorder), el cual es mA3s lento. Se cambiA3 de 'const' a 'let', devolviendo la descarga nativa ultrarrA3pida a Telegram.


## Fix (9 de Septiembre 2026): Extraccion de Fechas Erroneas en Galerias y Canales Restringidos
**Problema:** Al descargar desde el visor de galeria (MediaViewer), la fecha extraida a menudo era incorrecta (ej. siempre asignaba una fecha de un dia especifico de la semana). Esto sucedia porque querySelectorAll agarraba todos los 'span' o 'time' del modal, y al estar renderizado el sidebar u otros posts fuera de pantalla, el script robaba la primera fecha que encontraba en el DOM (a menudo de una miniatura oculta). Ademas, si se descargaba directo desde la burbuja del feed en canales privados, solo extraia la hora ('21:45') y asumia que el post era de hoy.
**Solucion:** Se reescribio el motor de busqueda de fechas ('__md_tel_extract_post_date'). Ahora utiliza una lista de selectores estrictamente priorizados (buscando primero '.media-viewer-subtitle') y, crucialmente, aplica un filtro espacial (getBoundingClientRect) para rechazar cualquier elemento de fecha que este fisica o visualmente fuera de la ventana del navegador. Para los posts descargados desde el feed, ahora se priorizan los atributos 'title' ocultos y si falla, trepa por el DOM hasta el 'Date Divider' mas cercano.
