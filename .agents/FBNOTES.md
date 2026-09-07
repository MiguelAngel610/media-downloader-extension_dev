## Facebook Reels Fallback & Routing
- **Problema:** Los enlaces DASH de Reels de Facebook no pueden descargar sus .mp4 vA3a inyecciA3n en el DOM, por lo que caen al fallback (yt-dlp). yt-dlp se trababa cargando indefinidamente porque las cookies de Chrome en Windows bloqueaban la BD (SQLite lock). AdemA3s, la extracciA3n de IDs de Reels (/reel/ID) no funcionaba. Finalmente, la ruta de salida no respetaba el subdirectorio 'Videos' ni un nombrado limpio.
- **SoluciA3n:** Se incluyA3 soporte para '/reel/(\d+)' en metadata_parser.js. En host.py se eliminA3 el flag '--cookies-from-browser chrome' para las URLs de FB, permitiendo a yt-dlp usar la red pA3blica rA3pida y evitar el hang. Finalmente, en host.py (lA3nea ~420), se ajustA3 la plantilla de salida para enrutar a 'Videos' y nombrar como '{date}_{shortcode}.%(ext)s'.



- **Bug estructural resuelto (CachA3 venenosa):** En fb_interceptor.js habA3a un 'Absolute last resort' que robaba URLs de videos previos del cachA3 si el video actual era DASH (blob:). Esto causaba que descargar mA3ltiples Reels seguidos saltara un 'STATUS: SKIPPED', porque la extensiA3n re-enviaba silenciosamente el link del video anterior. Se eliminA3 este bloque por completo, confiando en que yt-dlp resolverA3 el DASH limpiamente mediante el fallback.
- **Bug extracciA3n de fecha:** Los timestamps caA3an al fallback de 'Date.now()' porque fb_interceptor.js no extraA3a 'creation_time' de los scripts JSON. Se aA3adiA3 una bA3squeda bidireccional de 'creation_time' junto con la URL del video para incrustarla en __FB_STORY_CACHE__.


- **Bug estructural (CachA3 venenosa 2):** ExistA3a un bloque antiguo en fb_interceptor.js que usaba 'document.documentElement.innerHTML' y tomaba la A3última URL 'playable_url_quality_hd' de toda la pA3gina si el video actual era un blob. En un entorno SPA como Facebook, esto causaba que la extensiA3n robara la URL del Reel anterior (aA3n en el DOM) y se la asignara al nuevo Reel DASH, haciendo fallar el nuevo escA3ner basado en ID y provocando que Python devolviera SKIPPED. Bloque eliminado, la URL ahora se mantiene como blob hasta llegar al escA3ner por ID.


- **Bug estructural (Falso Positivo de targetVideo):** El escA3ner de ID respetaba el 'videoUrl' si ya era un MP4 vA3lido. Sin embargo, en la SPA de Facebook, 'targetVideo' (que busca tags <video>) a veces atrapaba el MP4 del Reel ANTERIOR que seguA3a en el DOM. Esto causaba que el escA3ner de ID no se ejecutara y enviara la URL vieja, resultando en un SKIPPED. SoluciA3n: Se eliminA3 la condicional. Ahora el escA3ner de ID sobreescribe incondicionalmente a 'targetVideo' si encuentra un match exacto.


- **ActualizaciA3n (Falso Positivo de targetVideo):** La SPA de Facebook dejaba tags <video> antiguos en la pantalla al scrollear. 'targetVideo' atrapaba el MP4 del Reel anterior. Como 'videoUrl' ya no era null, el escA3ner de ID no se ejecutaba y enviaba la URL vieja, resultando en SKIPPED. SoluciA3n final: Para los Reels (cualquier cosa que tenga un shortcode distinto a 'story'), 'targetVideo' SE IGNORA POR COMPLETO. El escA3ner de ID es la A3nica autoridad, y si falla, se manda incondicionalmente a blob:fallback.


- **Bug Python (Caché de fallback):** El servidor Python (host.py) utiliza un caché en memoria ('downloaded_urls_cache') para evitar descargas duplicadas. Cuando un video DASH se envía a Python, su URL es estáticamente 'blob:fallback'. Como el servidor Python nunca se cierra, el primer video DASH que se descarga guarda el string 'blob:fallback' en la caché. TODOS los siguientes videos DASH que envíe la extensión serán bloqueados por Python con un 'SKIPPED' instantáneo. Solución: En host.py, si la url empieza con 'blob:', la clave de caché se reemplaza dinámicamente por 'blob_fallback_{shortcode}'. De esta manera, cada Reel DASH tiene su propia clave única en la caché de Python.

- **Bug SPA & UI Cambiante (Extracción de Stories):** El botón de descarga nativo original intentaba anclarse a la barra de controles inferior (`[role="button"]` en `toolbar`) e inyectarse ahí. Esto fallaba silenciosamente o descargaba imágenes de anuncios escondidos porque FB cambia constantemente su estructura de árbol (DOM relative traversal `parent.querySelector("video")` capturaba media irrelevante).
  - **Solución (Botón UI):** Se reescribió `story_buttons.js` para inyectar un botón flotante nativo (`position: fixed`) en la esquina superior derecha solo cuando la URL contiene `/stories/`. Esto desacopla el UI de los contenedores frágiles de Facebook.
  - **Solución (Media Extracción por Viewport):** Se reescribió la lógica en `fb_interceptor.js`. Ahora existe un solo evento `FB_GET_STORY_MEDIA` que implementa una "Viewport Intersection Strategy". Escanea todos los `<video>` y `<img>` con tamaño mayor a 100x100, y evalúa un *score* matemático `(Área / Distancia_al_centro_de_pantalla)`. El elemento multimedia con el mayor score (el más grande y más centrado) es garantizado como la Story activa del usuario.

- **Actualización (Estructura GraphQL de Stories):** Facebook actualizó el esquema interno de GraphQL para las historias. La ruta para obtener el video HD fue anidada en un arreglo: `media.videoDeliveryResponseFragment.videoDeliveryResponseResult.progressive_urls`.
  - **Solución:** Se implementó la función pura `extractVideoUrls` en `fb_interceptor.js` que sigue de forma estricta esta jerarquía para buscar la entrada donde `metadata.quality === "HD"`. Si este arreglo no existe, el sistema hace un fallback seguro a `media.playable_url`. Se añadió telemetría local en consola para indicar el flujo de fallback utilizado.

- **Bug crítico (Descarga de Stories aleatorias / Error Python `[object Object]`):** El interceptor de Stories tenía múltiples estrategias de extracción que colisionaban entre sí (JSON brute force, Viewport Intersection, React Fiber, Regex en scripts, Media Sniffer de red). Cada estrategia fallaba en algún escenario:
  - **GraphQL Cache:** Preciso pero vacío en carga inicial (F5/SSR Hydration) porque Facebook incrusta el estado en funciones JavaScript, no en JSON parseable.
  - **React Fiber:** Facebook ofusca y minifica los nombres de las propiedades; las rutas hardcodeadas (`props.video`, `props.media`) dejaban de funcionar.
  - **Regex en scripts:** Facebook escapa caracteres con doble-backslash, rompe las expresiones regulares.
  - **Media Sniffer (fbcdn.net):** Capturaba URLs de TODAS las stories precargadas, no solo la activa, devolviendo la story equivocada.
  - **DOM `video.src`:** Devuelve URLs `blob:` que Python no puede descargar.
  - **Solución final:** Se eliminaron TODAS las estrategias excepto el GraphQL Cache (preciso cuando está poblado). Cuando el cache está vacío, `main.js` ahora delega a `yt-dlp` usando la `story_url` como mediaType `"auto"`, exactamente como funciona Instagram. Esto es más lento pero infalible.

- **Bug Python (Cache key lee campo incorrecto):** En `host.py`, la generación del cache key anti-duplicados leía `msg.get("metadata")` pero la extensión envía el shortcode dentro de `msg.get("direct_metadata")`. Esto causaba que el shortcode siempre fuera `""` y que el cache key para URLs blob: fuera siempre `blob_fallback_`, provocando que la segunda descarga DASH fuera marcada como SKIPPED.
  - **Solución:** Cambiar a `msg.get("direct_metadata") or msg.get("metadata") or {}`.

- **Deuda técnica (theater_buttons.js):** `theater_buttons.js` envía acciones `FB_GET_STORY_VIDEO` y `FB_GET_STORY_IMAGE` que NO tienen handler en `fb_interceptor.js` (solo existe `FB_GET_STORY_MEDIA`). Estos botones de Theater (para publicaciones en modal) están muertos. Pendiente de unificar en una sesión futura.
