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

## Futuras Expansiones: iCloud y Google Photos
**Estado:** PENDIENTE (En Pausa)
- Se planea expandir el ecosistema a servicios de nube personales como iCloud (www.icloud.com/photos) y Google Photos.
- **Objetivo Principal:** Interceptar el boton nativo de descarga de dichas plataformas para extraer la fecha original (via DOM scraping o API interception) y renombrar el archivo descargado para que coincida con el formato del proyecto (ej: YYYY-MM-DD_NombreArchivo.jpg).
- **Implementacion pausada** a favor de continuar estabilizando el nucleo de Instagram.

