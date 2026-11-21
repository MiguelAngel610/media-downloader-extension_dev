# Notas de Desarrollo - Media Downloader

## Archivos de notas por plataforma
- `IGNOTES.md` — Instagram (completado)
- `TGNOTES.md` — Telegram (completado)
- `XNOTES.md` — X/Twitter (timeline funcional, detalle pendiente)
- `FBNOTES.md` — Facebook Stories (parcial, pendiente validaciA3n)

## Reglas generales
- **Cero Monolitos** — Todo dividido en mA3dulos dentro de `src/`
- **Vanilla JS** — Sin frameworks externos
- **EstActica 100% Nativa** — Botones indistinguibles de la UI oficial
- **Máxima calidad siempre** — Descargar resoluciA3n original disponible
- **Privacidad** — Sin servidores externos, sin trackers

## Popup
- Tema claro (fondo blanco, texto oscuro)
- Subtitle: `IG • FB • X • TG`
- Toggles: Vanish Mode, Ocultar En LA-nea, Ocultar Visto (solo Instagram)
- Quick Download con auto-fill de URL

## Plataformas - Estado
| Plataforma | Estado | Notas |
|------------|--------|-------|
| Instagram | A3A3 Funcional (Con detalle pendiente) | Stories, feed, reels funcionales. Bug Menor Diferido: "Ciertas descargas de carruseles mixtos fallan si el media.poster no coincide." |
| Telegram | ✅ Completo | Perfil, canales, stories, remux, fecha en nombre |
| X/Twitter | A3A3 Parcial | Timeline funcional, detalle de tweet pendiente |
| Facebook | A3A3 Activo | RefactorizaciA3n modular completada. Soporte Stories y Modales (Theater). ExtracciA3n de metadata (fbid/pfbid) nativa. |

## Ocultamiento AutomAtico del Menú/Burbuja de Descargas en Chrome
**Fecha:** 03 de Agosto 2026
- **MejorA-a Quirúrgica:** Se integrA3 al manifest (`downloads.ui`, `downloads.shelf`) y en el Service Worker (`background.js`) la llamada al API oficial de Chrome `chrome.downloads.setUiOptions({ enabled: false })`. 
- **Efecto:** Cada vez que la extensiA3n procesa una descarga de foto o video en cualquier red social, silencia programáticamente el menú emergente de descargas o la barra inferior de Chrome, impidiendo que bloqueen o distraigan al usuario. El usuario conserva la opciA3n de verificar sus archivos cuando lo desee mediante `Ctrl + J`.

## CorrecciA3n de Ruta del Icono (Logo) en el Popup General
**Fecha:** 04 de Agosto 2026
- **Problemática:** Al abrir el menú desplegable (popup) de la extensiA3n, la imagen superior izquierda (logo) aparecA-a rota o con el A-cono genAcrico por defecto en lugar de cargar `icon48.png`.
- **Causa RaA-z:** En `src/popup/popup.html` se referenciaba la imagen directamente como `<img src="icon48.png">`, buscando el archivo dentro del directorio `src/popup/`. Sin embargo, la estructura modular de la extensiA3n ubica todos los A-conos globales en `assets/icons/`.
- **SoluciA3n:** Se corrigiA3 la ruta relativa a `<img src="../../assets/icons/icon48.png" alt="Logo">` en `popup.html`, restaurando la visualizaciA3n correcta e inmediata del logo del proyecto sin generar errores en consola.

## Feature: Advertencia Global de Bloqueo de Atajo por Foco de Texto
**Fecha:** 14 de Agosto 2026
**Problemática:** El atajo de teclado global no descargaba medios silenciosamente si el cursor del usuario se quedaba "parpadeando" u olvidado en la caja de texto de fondo de un chat o comentario. El usuario pensaba que la extensiA3n fallaba sin recibir feedback.
**SoluciA3n (`shortcut_manager.js`):**
1. **InversiA3n LA3gica:** Ahora el gestor de atajos evalúa primero si la tecla presionada *coincide* con el atajo configurado, antes de abortar por el foco de texto.
2. **Feedback Visual:** Si coinciden las teclas, pero el cursor está activo en un `<input>`, `<textarea>` o `[contenteditable]`, la extensiA3n inyecta una micro-animaciA3n con un Toast (estActica Glassmorphism oscuro y borde rojo) en la parte inferior de la pantalla advirtiendo: *"⚠️ Atajo de descarga bloqueado: Tienes el cursor en una caja de texto. Haz clic afuera para usarlo."*
**Resultado:** Cero fallos silenciosos. El usuario siempre sabe por quAc el atajo no accionA3.

## Refactoring: MA3dulo Universal de UI (ToastManager)
**Fecha:** 14 de Agosto 2026
**Problema:** Múltiples mA3dulos (`telegram/progress_bar`, `instagram/story_button`, `utils/shortcut_manager`) estaban inyectando HTML/CSS en lA-nea para mostrar alertas y toasts al usuario, violando el principio DRY y haciendo imposible mantener un diseAo consistente y estándar en la industria.
**SoluciA3n:** 
1. Se extrajeron todos los estilos en lA-nea al archivo global `src/styles/content.css` usando prefijos `.md-toast-*`.
2. Se creA3 un mA3dulo universal `MDToastManager` en `src/utils/toast_manager.js` que se inyecta en absolutamente todas las redes sociales (manifest.json).
3. El `MDToastManager` expone una API estándar: `.showInfo()`, `.showError()`, `.showWarning()`, y un poderoso `.showComplex()` que permite crear Modales complejos con iconos y botones de acciA3n en una sola llamada (ideal para la alerta de Shared Reels en IG).

## Refactoring: VigA-a de DOM Unificado (MDObserverManager)
**Fecha:** 14 de Agosto 2026
**Problema:** Instagram, Facebook y X estaban usando `MutationObserver` puros, mientras que Telegram usaba `setInterval`. Cada plataforma tenA-a su propio archivo de entrada con nombres dispares (`fb_init.js`, `content_x_init.js`). Esto rompA-a la estandarizaciA3n y podA-a causar lag al re-renderizar en cada mutaciA3n del DOM.
**SoluciA3n:** 
1. **EstandarizaciA3n de Archivos:** Se renombraron los archivos principales de Facebook y X a `main.js` para que todo el proyecto siga la misma estructura (Instagram/Telegram/Facebook/X todos inician en `main.js`).
2. **MDObserverManager:** Se creA3 una clase global en `src/utils/dom_observer.js`. 
   - Provee `.observeDOM(callback)`: Envuelve un `MutationObserver` pero lo restringe mediante `requestAnimationFrame` para que jamás se ejecute más de 60 veces por segundo, eliminando el lag.
   - Provee `.pollDOM(callback)`: Un engine limpio basado en `setInterval` para las redes que lo requieran (ej. Telegram).
3. Todas las redes sociales fueron conectadas a este nuevo motor ultra-eficiente.

## Rediseño Integral de la Interfaz del Popup (Modo Blanco & Modern Web Guidance)
**Fecha:** 19 de Octubre 2026
**Problemática:** La interfaz anterior del popup era monocromática oscura, angosta (320px), poco intuitiva, sin affordances claras para la captura del atajo de teclado ni soporte de tema claro nativo.
**Solución Técnica Aplicada:**
1. **Modo Blanco Nativo por Defecto (`data-theme="light"`):**
   - Paleta de diseño basada en tokens HSL modernos (`#f8fafc` surface, `#ffffff` cards, contraste de texto > 14:1 según pautas de accesibilidad WCAG AAA).
   - Selector dinámico de tema (Modo Blanco / Modo Oscuro) con persistencia local en `chrome.storage.local.popupTheme`.
2. **Modern Web Guidance Best Practices:**
   - **Controles de formulario y Switches:** Switches accesibles con radio de enfoque `:focus-visible` de 2px con offset y cards táctiles con propagación de clic (`wireToggle`).
   - **Child-State Styling (`:has()`):** Las tarjetas reaccionan dinámicamente cuando su switch hijo está activado (`.toggle-card:has(input:checked)`), aportando retroalimentación visual inmediata con bordes de acento e iluminación sutil.
   - **Segmented Control Tabs:** Reemplazo de botones genéricos por una barra segmentada con `role="tablist"` y `aria-selected` con micro-animaciones `fadeInTab`.
   - **Grabador de Atajo Universal Intuitivo:** Input interactivo que entra en estado de escucha al hacer clic, permitiendo presionar cualquier tecla para registrarla y botón clear para restablecer.
   - **Pegado Rápido con Portapapeles:** Botón integrado en la barra de descarga directa con `navigator.clipboard.readText()`.
3. **Mapeo y Retrocompatibilidad:** Se preservaron intactos todos los identificadores de storage (`vanishMode`, `ghostOnline`, `ghostSeen`, `fb_ghost_seen`, `fb_ghost_presence`, `globalShortcutObj`, `ghostHistory`) y la mensajería hacia el Host Python y Service Worker.



## Seguridad: Credenciales de sesión expuestas en el repositorio
**Fecha:** 21 de Noviembre 2026
**Problema:** `host/instagrapi_device.json` (con `sessionid` y `ds_user_id` de Instagram) y `host/host.log` (URLs firmadas del CDN y usuarios cuyas historias se vieron) estaban trackeados y publicados en `origin/main` desde el commit inicial `f1493da`. `host/cookies.txt` (cookies de Facebook generadas por yt-dlp) también estaba trackeado localmente.
**Causa Raíz:** `.gitignore` solo excluía `node_modules/`. Ningún código usa `instagrapi_device.json` ni `host/cookies.txt` (restos de pruebas con instagrapi/yt-dlp).
**Solución:**
1. `git rm --cached` de los archivos (se conservan en disco).
2. `.gitignore` endurecido: `*cookies*.txt`, `*_device.json`, `*.session`, `.env*`, `*.log`, `__pycache__/`, `scratch/`.
3. Acción del usuario: revocar todas las sesiones de Instagram y cambiar contraseña (lo único que invalida el `sessionid` filtrado).
**Regla:** Las cookies/sesiones de gallery-dl/yt-dlp viven en `~/gallery-dl/`, nunca dentro del repo. `host.log` jamás se commitea.

## Seguridad: Inyección de Comandos en el Host Python (gallery-dl)
**Fecha:** 21 de Noviembre 2026
**Problema:** `DownloaderEngines.execute_gallery_dl` lanzaba gallery-dl con `subprocess.Popen(lista, shell=True)`. En Windows, CPython convierte la lista con `list2cmdline`, que solo pone comillas si el argumento tiene espacios o tabs (verificado en el código fuente oficial vía Context7). Un `&` en la URL llegaba sin escapar a `cmd.exe` y se ejecutaba como otro comando. Reproducido: la URL `https://example.invalid/p/X/?a=1&echo.>archivo` creaba el archivo. Efecto secundario: toda URL con `&` (ej. `?igsh=..&utm=..`) se partía y fallaba.
**Segundo hueco (argument injection):** aun sin shell, una "URL" como `--exec=calc` sería interpretada por gallery-dl como su opción `--exec` (ejecuta comandos).
**Solución (`host/host.py`):**
1. `shell=False` siempre.
2. Se ejecuta `sys.executable -m gallery_dl` (mismo intérprete del host): no depende del PATH y nunca pasa por un shim `.bat/.cmd`, que Windows correría por `cmd.exe` incluso con `shell=False` (CPython gh-114539).
3. `--` antes de la URL: gallery-dl la trata como URL, nunca como opción (verificado: `Unsupported URL '--exec=calc'`).
4. `is_safe_http_url()`: solo URLs absolutas `http(s)` llegan al descargador.
5. Hijo con `PYTHONIOENCODING=utf-8` y lectura `encoding="utf-8", errors="replace"`: nombres de archivo no ASCII ya no rompen la salida.
6. El timeout (45s) ahora devuelve un error explícito en vez de un "failed" genérico.
**Verificación:** test de regresión 7/7 (incluye baseline que demuestra la inyección con el estilo anterior).

## Seguridad: Path Traversal, Bridge TCP sin Auth y Race en stdout (Host Python)
**Fecha:** 21 de Noviembre 2026
**Estado:** RESUELTO (test de regresión 20/20, incluye baseline que demuestra la corrupción de frames sin lock)
**A — Path traversal:** `username`, `media_category`, `tweet_id`, `shortcode`, `user_id` y `platform` llegaban desde la página web y se usaban crudos en `os.path.join` y en `outtmpl` de yt-dlp. `..\..\` permitía escribir fuera de `~/gallery-dl/`.
- **Fix:** `PathGuard.sanitize_metadata()` una sola vez en `MediaManager.process_request` (punto de entrada único; los handlers releen `direct_metadata` del msg ya saneado). Reemplaza separadores e inválidos de Windows, neutraliza nombres reservados (`CON`, `NUL`, `COM1`…), quita puntos/espacios finales y `%` (plantillas de yt-dlp). Whitelist de `platform`. Defensa en profundidad: `PathGuard.ensure_inside()` (`realpath` + `commonpath`) en cada carpeta de salida; si falla → `PathTraversalError` → respuesta de error.
**B — Bridge TCP (127.0.0.1:65432) sin autenticación:** cualquier proceso local podía enviar `start_backup` y leer todos los logs.
- **Cliente legítimo:** la app de escritorio `~/Documents/Projects/media_downloader` (`services/tcp_listener.py` lee logs; `stop_bot` envía `stop_backup`). Nadie envía ya `start_backup` (el bot nativo `background_bot.py` lo reemplazó).
- **Fix:** `BridgeAuth`: token `secrets.token_urlsafe(32)` en `~/gallery-dl/md_bridge_token.txt` (fuera de los repos). Primer mensaje obligatorio `{"action":"auth","token":...}` comparado con `hmac.compare_digest`; timeout de 5s para autenticarse. Solo los clientes autenticados reciben logs. Whitelist `start_backup`/`stop_backup`. Lectura por líneas con límite de 64 KB; un mensaje final sin `\n` se procesa al cerrar.
- **Port hijacking (Windows):** `SO_REUSEADDR` en Windows permite que otro proceso haga bind al mismo puerto; se usa `SO_EXCLUSIVEADDRUSE` cuando existe (verificado en docs de CPython vía Context7).
**C — Race en stdout:** el loop principal y los threads TCP escribían frames (4 bytes de longitud + JSON) sin exclusión → frames intercalados → Chrome desconecta el host. **Fix:** `NativeMessaging._stdout_lock`; `Logger._clients_lock` para `active_tcp_clients`. Además, los mensajes mayores al límite de Chrome de 1 MB (docs oficiales) se recortan (cola del `log`) en vez de tumbar la conexión.
**Zero Silent Errors:** los `except: pass` de `Logger` ahora registran (stderr como último recurso, nunca stdout).

## Seguridad: HTML Injection (XSS) en Toasts y Popup
**Fecha:** 21 de Noviembre 2026
**Estado:** RESUELTO (test jsdom 12/12; baseline: el código anterior creaba un `<img>` real a partir del texto de un error)
**Problema:** `MDToastManager` (`src/shared/utils/toast_manager.js`) insertaba todo mensaje con `innerHTML`. Recibía textos externos: errores del host (`str(e)` de yt-dlp/gallery-dl), nombres de archivo y usernames. Un `<img src=x onerror=...>` se ejecutaba **dentro de la página** (instagram.com, facebook.com…) con la sesión del usuario. El popup renderizaba usernames de `ghostHistory` con `innerHTML`.
**Solución:**
1. `toast_manager.js` construye el DOM con `createElement` + `textContent`. El único HTML parseado son los SVG estáticos (`MD_TOAST_ICON_SVGS`).
2. API compatible: `showInfo/Error/Success/Warning(message, duration, detail?)`. `detail` es una segunda línea en negrita (`.md-toast-detail` en `content.css`), reemplaza el viejo `<br><strong>`.
3. `showComplex`: `actionHtml` reemplazado por `action: { label, href }`. `href` solo se acepta si es `http(s)` (bloquea `javascript:`/`data:`), con `rel="noopener noreferrer"`. Estilos del botón movidos a `.md-toast-action-btn` (CSS Isolation).
4. `popup.js`: historial con DOM APIs, username validado con `^[A-Za-z0-9._]{1,30}$` y `encodeURIComponent` en el link.
**Regla:** nunca pasar HTML a `MDToastManager`. Texto dinámico → `message`/`detail`; enlaces → `action.href`.

## Limpieza: Scratch y Código Muerto (Soft Delete)
**Fecha:** 21 de Noviembre 2026
**Método:** escaneo estático (símbolos definidos vs. referenciados en `src/` + `manifest.json`; mensajes enviados vs. manejados) y verificación manual de cada candidato. Todo lo eliminado se conserva en `.trash/` (ahora en `.gitignore`).
- `scratch/` → `.trash/scratch_2026-11-21/` (scripts sueltos: append de notas, test_shortcode.py, tg_user_script.js).
- `background.js`: handlers sin emisor `fetch_mobile_api`, `fetch_web_profile_info`, `fetch_mobile_usernameinfo` (este último enviaba un User-Agent falso de Android a la API privada de IG: riesgo para la cuenta), `open_hd_window`, `report_hd_url` y sus globals `activeHdTabId/WindowId` → `.trash/dead_code_2026-11-21/background_dead_handlers.js`.
- Pestaña oculta de extracción HD (`?__md_extract_hd=1` en `device_spoof.js` y `overlay_root.js`): solo la abría `open_hd_window`.
- Sniffer regex de fotos de perfil (`__md_sniffPfps`, `__md_pfps_list`, handler `MD_PFPS_DICT_UPDATE`): el Set nunca se leía; reemplazado por `profile_pic_collector.js`.
- Símbolos sin uso: `FB_DOWNLOAD_SVG`, `window.__md_activeStorySegment` (solo escritura), alias `window.__md_handleGhostBlock`.
- `.trash/` deja de estar trackeado (los 3 scripts antiguos siguen en disco).
**Falsos positivos descartados:** `start_backup/stop_backup` (llegan por el puerto nativo), `host_response`, `get_photo_date_at_time`, `show_download_toast` (enviados con `chrome.tabs.sendMessage(tabId, …)`), `MD_UPDATE_SETTINGS` (vía `notifyInstagram`).

## Service Worker sin Estado, Fallback del Host y Respuestas por Pestaña (§6, §9)
**Fecha:** 21 de Noviembre 2026
**Estado:** RESUELTO (test de comportamiento 20/20 con APIs chrome.* simuladas, incluye reinicio del worker a mitad de un backup; protocolo real stdin/stdout del host 4/4)
**Problemas:**
1. **Quick Download del popup roto (bug silencioso):** enviaba `action: "download"` y ningún listener lo manejaba → siempre "Error al conectar con el Host Nativo".
2. **Estado en globals (§6):** `downloadQueue`, `backupQueue`, `isBackingUp`, `currentBackupTabId`… se perdían al suspenderse el worker (según docs oficiales: 30s inactivo o al cerrarse el puerto nativo), dejando backups colgados. Reintentos con `setTimeout`.
3. **Sin fallback del host (§9):** si el host no estaba instalado reintentaba cada 5s para siempre y el mensaje se perdía tras 1s; el usuario no se enteraba.
4. **✅ falso y toasts en pestañas ajenas:** el resultado del host se enviaba a TODAS las pestañas; el botón marcaba éxito con solo encolar.
**Solución (APIs verificadas con Context7):**
- `background.js` queda solo como cableado (listeners top-level + tabla de rutas `messageRoutes`). Módulos: `session_store.js` (read/update atómico sobre `chrome.storage.session`), `native_host.js` (puerto, outbox, `request_id`, reconexión con `chrome.alarms`), `backup_coordinator.js` (cola persistida + pausas con alarms), `photo_date_namer.js` (lógica movida sin cambios de comportamiento).
- Protocolo: el host envía `{"action":"host_ready"}` al arrancar y devuelve `request_id` en cada resultado; el worker entrega el resultado solo a la pestaña que lo pidió.
- Host no instalado ("not found"/"forbidden"): error explícito con instrucciones de instalación al instante, outbox vaciado (sin descargas sorpresa), reintento cada 60s. Caída del host: solo fallan las peticiones en vuelo; las del outbox se reenvían al reconectar.
- `download_url`: el popup pega una URL y el worker detecta la plataforma (instagram/facebook/twitter).
- `button_state.js` y `facebook/main.js` muestran el error real (toast + `md-error`) en vez del ✅.
- Permiso nuevo `alarms` en `manifest.json`. Los nombres de usuario del backup se validan (`^[A-Za-z0-9._]{1,30}$`).

## Host: Descargas Atómicas, Timestamps y Rutas Muertas
**Fecha:** 21 de Noviembre 2026
**Estado:** RESUELTO (test con servidor HTTP local real 13/13: descarga completa, conexión cortada a mitad, cuerpo vacío)
1. **Archivos corruptos permanentes:** `execute_direct_http` escribía directo al nombre final y cargaba todo en RAM. Un corte de red dejaba un archivo truncado que el modo backup consideraba "ya descargado" para siempre. Ahora: streaming en bloques de 1 MB a `<archivo>.part`, verificación contra `Content-Length` (y cuerpo no vacío), `os.replace` atómico; ante fallo se borra el `.part` y se devuelve error.
2. **Fecha silenciosa / crash:** `metadata.get("timestamp", now)` usaba la fecha de descarga sin avisar y fallaba con `None` o microsegundos. `resolve_timestamp()` acepta s/ms/µs y registra explícitamente cuando cae a "ahora".
3. **Zero Silent Errors:** los 8 `except:` desnudos/`except Exception: pass` restantes se reemplazaron por excepciones específicas con log (`remove_if_exists()` para limpiezas: solo `FileNotFoundError` se ignora).
4. **Código muerto (soft delete a `.trash/dead_code_2026-11-21/host_dead_paths.py`):** rama `pfp_bot` (nadie setea `is_pfp_bot`; apuntaba a `Downloads/Carpetas_Mixtas`, que no existe) y el hook de progreso de yt-dlp (la extensión descarta todo `progress`).
5. Strings y comentarios restantes en español traducidos al inglés.

## Zero Silent Errors: 45 `catch {}` Vacíos Eliminados
**Fecha:** 21 de Noviembre 2026
**Estado:** RESUELTO (0 catch vacíos en `src/`; 5 suites de regresión en verde)
**Criterio aplicado:**
1. **Errores esperados** → se ignora SOLO ese tipo y se documenta por qué: `SyntaxError` de `JSON.parse` en líneas parciales de streams (FB/X), `InvalidCharacterError` de `atob` en ids que no son base64 (FB), `URIError` de `decodeURIComponent` en manifests no codificados (IG). Cualquier otro error se registra.
2. **Bucles calientes** (rAF a 60fps, recorridos recursivos de React/JSON) → log deduplicado: cada par (contexto, mensaje) se muestra una vez por página.
3. **Resto** → log con contexto.
**Infraestructura (DRY):**
- `src/shared/utils/error_reporter.js` → `window.MDErrorReporter.reportError(context, err)`; se carga primero en cada grupo ISOLATED del manifest.
- MAIN world IG: `logErrorOnce()` en `interceptors/core/logger.js`.
- Interceptores MAIN de FB/X/Google Photos (scripts sueltos sin acceso al reporter): `console.warn` con prefijo de plataforma.
**Mejora colateral:** si `fiber_search.js` falla, ahora responde `MD_FIBER_RESULT { error: true }` al instante en vez de dejar al resolver esperando su timeout.

## Calidad Auditable: ESLint, `npm test` y Métricas (Red de Seguridad para Refactorizar)
**Fecha:** 21 de Noviembre 2026
**Estándares verificados con Context7:** límites por defecto de ESLint (`complexity` 20, `max-depth` 4, `max-lines-per-function` 50, `max-lines` 300); Google JavaScript Style Guide (archivos `lowercase_with_underscores.js`, `lowerCamelCase`, `UpperCamelCase`, `CONSTANT_CASE`, JSDoc); PEP 8 para Python.
**Comandos:**
- `npm run lint`: ESLint (flat config `eslint.config.mjs`). Código legacy: límites de mantenibilidad como *warning* (deuda medible). Módulos en `REFACTORED_MODULES`: como *error* (no pueden regresar). Corrección (`no-empty`, `no-undef`, `no-unused-vars`, `camelcase`, `eqeqeq`, `no-var`): *error* en todo `src/`.
- `npm test`: build + 10 suites (JS y host Python) desde `tests/` (`tests/run_all.mjs` localiza `py`/`ffmpeg` en el PATH; `FFMPEG_DIR` opcional).
- `npm run audit`: `tools/code_metrics.js` (acorn) lista cada función que supera los límites.
**Línea base medida (antes de refactorizar):** 85 funciones fuera de límites, 12 archivos > 300 líneas. Peores: `progress/feed.js syncOverlays` (complejidad 127, anidación 13, 392 líneas), `fiber_search.js searchProps` (173), `feed_buttons.js onclick` (102, 362 líneas). Python: `host.py` con 11 clases en 874 líneas, `_handle_direct_story` complejidad 44, `mediaType` viola PEP 8.
**Bugs encontrados por ESLint en la primera pasada:**
1. `story_button.js`: `clickStoryKey` declarado con `let` dentro del `try` y usado en el `catch` → ante cualquier error de descarga el propio `catch` lanzaba `ReferenceError`; el botón quedaba congelado en "loading" y nunca se mostraba el toast de error.
2. ~20 asignaciones muertas (`isVertical`, `builtInVisualGapX/Y`, `FORWARD_ICON`, `postId`, `hint`, `dateStr`, `prefix`, `iconContainer`, `mediaUrl`, import `mdLog`…) eliminadas.
3. `catch` con fallback silencioso que el escaneo regex no veía (no estaban vacíos): `story_resume` (lectura de checkpoints), portapapeles del popup, clonado de respuestas en Google Photos → ahora registran; los fallbacks intencionales usan `catch {` con el motivo documentado.
**Deuda estructural restante (siguiente fase):** 70 `no-undef` + 13 `no-unused-vars` provienen de funciones globales implícitas compartidas entre content scripts (`injectFeedButtons`, `getOverlayRoot`, `SVG_DOWNLOAD`…): el acoplamiento depende del orden de `manifest.json`. Solución objetivo: módulos ES con `import` explícitos empaquetados por esbuild por plataforma.
