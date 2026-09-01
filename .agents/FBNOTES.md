## Facebook Reels Fallback & Routing
- **Problema:** Los enlaces DASH de Reels de Facebook no pueden descargar sus .mp4 vA3a inyecciA3n en el DOM, por lo que caen al fallback (yt-dlp). yt-dlp se trababa cargando indefinidamente porque las cookies de Chrome en Windows bloqueaban la BD (SQLite lock). AdemA3s, la extracciA3n de IDs de Reels (/reel/ID) no funcionaba. Finalmente, la ruta de salida no respetaba el subdirectorio 'Videos' ni un nombrado limpio.
- **SoluciA3n:** Se incluyA3 soporte para '/reel/(\d+)' en metadata_parser.js. En host.py se eliminA3 el flag '--cookies-from-browser chrome' para las URLs de FB, permitiendo a yt-dlp usar la red pA3blica rA3pida y evitar el hang. Finalmente, en host.py (lA3nea ~420), se ajustA3 la plantilla de salida para enrutar a 'Videos' y nombrar como '{date}_{shortcode}.%(ext)s'.



- **Bug estructural resuelto (CachA3 venenosa):** En fb_interceptor.js habA3a un 'Absolute last resort' que robaba URLs de videos previos del cachA3 si el video actual era DASH (blob:). Esto causaba que descargar mA3ltiples Reels seguidos saltara un 'STATUS: SKIPPED', porque la extensiA3n re-enviaba silenciosamente el link del video anterior. Se eliminA3 este bloque por completo, confiando en que yt-dlp resolverA3 el DASH limpiamente mediante el fallback.
- **Bug extracciA3n de fecha:** Los timestamps caA3an al fallback de 'Date.now()' porque fb_interceptor.js no extraA3a 'creation_time' de los scripts JSON. Se aA3adiA3 una bA3squeda bidireccional de 'creation_time' junto con la URL del video para incrustarla en __FB_STORY_CACHE__.


- **Bug estructural (CachA3 venenosa 2):** ExistA3a un bloque antiguo en fb_interceptor.js que usaba 'document.documentElement.innerHTML' y tomaba la A3última URL 'playable_url_quality_hd' de toda la pA3gina si el video actual era un blob. En un entorno SPA como Facebook, esto causaba que la extensiA3n robara la URL del Reel anterior (aA3n en el DOM) y se la asignara al nuevo Reel DASH, haciendo fallar el nuevo escA3ner basado en ID y provocando que Python devolviera SKIPPED. Bloque eliminado, la URL ahora se mantiene como blob hasta llegar al escA3ner por ID.


- **Bug estructural (Falso Positivo de targetVideo):** El escA3ner de ID respetaba el 'videoUrl' si ya era un MP4 vA3lido. Sin embargo, en la SPA de Facebook, 'targetVideo' (que busca tags <video>) a veces atrapaba el MP4 del Reel ANTERIOR que seguA3a en el DOM. Esto causaba que el escA3ner de ID no se ejecutara y enviara la URL vieja, resultando en un SKIPPED. SoluciA3n: Se eliminA3 la condicional. Ahora el escA3ner de ID sobreescribe incondicionalmente a 'targetVideo' si encuentra un match exacto.


- **ActualizaciA3n (Falso Positivo de targetVideo):** La SPA de Facebook dejaba tags <video> antiguos en la pantalla al scrollear. 'targetVideo' atrapaba el MP4 del Reel anterior. Como 'videoUrl' ya no era null, el escA3ner de ID no se ejecutaba y enviaba la URL vieja, resultando en SKIPPED. SoluciA3n final: Para los Reels (cualquier cosa que tenga un shortcode distinto a 'story'), 'targetVideo' SE IGNORA POR COMPLETO. El escA3ner de ID es la A3nica autoridad, y si falla, se manda incondicionalmente a blob:fallback.


- **Bug Python (CachA3 de fallback):** El servidor Python (host.py) utiliza un cachA3 en memoria ('downloaded_urls_cache') para evitar descargas duplicadas. Cuando un video DASH se envA3a a Python, su URL es estA3ticamente 'blob:fallback'. Como el servidor Python nunca se cierra, el primer video DASH que se descarga guarda el string 'blob:fallback' en la cachA3. TODOS los siguientes videos DASH que envA3e la extensiA3n serA3n bloqueados por Python con un 'SKIPPED' instantA3neo. SoluciA3n: En host.py, si la url empieza con 'blob:', la clave de cachA3 se reemplaza dinA3micamente por 'blob_fallback_{shortcode}'. De esta manera, cada Reel DASH tiene su propia clave A3nica en la cachA3 de Python.

