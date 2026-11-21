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
