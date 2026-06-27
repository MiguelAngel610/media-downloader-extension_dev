# Reglas del Proyecto: Media Downloader Extension

## 1. Contexto del Proyecto
- **Propósito:** Extensión para descargar contenido multimedia.
- **Plataformas:** Actualmente enfocado en Instagram, Facebook y X.
- **Alcance y Privacidad:** Es una herramienta de **uso estrictamente personal**. La privacidad es prioritaria; la extensión debe operar de la manera más "offline" posible, sin enviar datos del usuario a servidores externos ni incluir rastreadores.

## 2. Arquitectura de Archivos (Módulos)
- **Cero Monolitos:** No escribir todo el código en un solo archivo gigante. Toda lógica debe estar dividida en pequeños módulos dentro de la carpeta src/ (ejemplo: src/utils/, src/ui/, src/core/).
- El manifest.json cargará estos archivos en orden para que compartan el estado global (Vanilla JS).

## 3. Estilo de Código, Diseño y Feedback
- **Estética 100% Nativa:** Cualquier elemento frontend inyectado (botones, barras, menús) debe ser indistinguible de la interfaz oficial. Se debe replicar rigurosamente el diseño, colores, sombras, espaciado, opacidad y tamaños nativos de cada entorno (ej. en Historias vs. Feed). Un botón nunca debe "desentonar".
- **Vanilla JavaScript:** Mantener el uso exclusivo de Vanilla JS sin frameworks externos.
- **Feedback al Usuario:** Los errores no críticos, advertencias o estados de descarga deben reportarse al usuario mediante un sistema de notificaciones en pantalla (Toasts), de forma sutil y no intrusiva.

## 4. Comunicación
- Siempre respóndeme en español, de forma clara y directa.
- No asumas que un bug está arreglado hasta que yo te lo confirme.
- No agregues NINGUNA regla ni detalle técnico a este archivo (para guardar detalles o soluciones técnicas, utiliza exclusivamente `NOTES.md`).

## 5. Mantenimiento del Conocimiento
- **Registro Automático:** Cada vez que se aprenda algo importante, se modifique lógica clave o se corrija un bug estructural, el Agente DEBE actualizar automáticamente el archivo .agents/NOTES.md con los detalles (problema y solución).
- **Notificación al Usuario:** Tras actualizar el archivo, el Agente debe informarle explícitamente al usuario qué fue lo que se agregó, modificó o corrigió en las notas.