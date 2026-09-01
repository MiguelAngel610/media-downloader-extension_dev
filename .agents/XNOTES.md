# Notas sobre la arquitectura visual de X (Twitter)

Este documento guarda los aprendizajes tAccnicos más difA-ciles que hemos descubierto sobre cA3mo X renderiza su interfaz, para no tener que batallar con esto en el futuro.

## 1. El misterio del "Timeline" (DistribuciA3n Perfecta)
- **El problema original:** Al inyectar un 7mo botA3n en la barra del tweet, el espacio se rompA-a. Los botones de la derecha se apachurraban y se generaba un vacA-o gigante en el medio.
- **La trampa de X:** Nativamente, X le pone \`flex-grow: 1\` (la clase \`r-13awgt0\`) a los botones de la izquierda (Reply, RT, Like, View). Esto hace que actúen como esponjas y absorban todo el espacio sobrante. Además, el botA3n de Bookmark tiene un \`margin-left: auto\` (clase \`r-1wron08\`) que lo empuja hacia la derecha.
- **La SoluciA3n Definitiva:** Para lograr una barra 100% simActrica con 7 botones, NO hay que pelear con los márgenes de la derecha. Lo que hay que hacer es:
  1. Quitarle el \`flex-grow: 1\` a TODOS los elementos (nativos e inyectados).
  2. Quitar el \`margin-left: auto\` a Bookmark.
  3. Forzar \`justify-content: space-between\` en el contenedor padre (\`role="group"\`).
  Con esto, el navegador divide el espacio sobrante en 6 huecos matemáticamente idAcnticos, logrando una estActica visual inigualable y superior a la de X nativo.

## 2. El problema del Z-Index en los Tooltips (SuperposiciA3n)
- **El problema:** Al crear un tooltip personalizado y meterlo dentro del botA3n, el texto quedaba decapitado (oculto) detrás del tweet de abajo.
- **La trampa de X (Stacking Context):** El feed de X se construye capa por capa. El tweet de abajo siempre se dibuja "encima" del tweet de arriba por el flujo normal del DOM. Ningún \`z-index: 9999\` puede romper el Stacking Context de un contenedor con \`overflow: hidden\` o z-index base.
- **La SoluciA3n Definitiva (TAccnica de React Portals):** 
  - Jamás meter el tooltip dentro del botA3n.
  - Inyectar el tooltip directamente en \`document.body\` para que estAc en la capa absoluta más alta.
  - Usar \`position: fixed\` y calcular dinmicamente sus coordenadas con \`getBoundingClientRect()\` en el evento \`mouseenter\`.
  - **Dato clave:** Para que nuestro tooltip quede a la misma altura que los nativos, hay que agregar **+8 pA-xeles** a la posiciA3n \`top\` (\`rect.bottom + 8px\`), dándole ese respiro visual perfecto.

## 3. El modal flotante, la re-renderizaciA3n de React y los Colores Nativos
- **El problema de la Re-renderizaciA3n:** Inicialmente usA3bamos clases de CSS nativas (como 
-1wron08) para ubicar al contenedor padre e inyectar nuestro botA3n. Pero al hacer scroll o dar Like, React volvA3a a renderizar el componente. Como nosotros le habA3amos quitado esa clase en la primera inyecciA3n, el script ya no encontraba al contenedor padre y terminaba inyectando el botA3n **adentro** del botA3n vecino, rompiendo por completo la interfaz.
- **La soluciA3n infalible (Tree Traversal):** Dejamos de depender de clases CSS inestables. Ahora usamos un *while loop* genA3tico que trepa por el A3rbol del DOM (HTML) desde cualquier botA3n (Bookmark o Like) hasta llegar siempre al ancestro que tenga 
ole=\

group\. Esto garantiza inyecciA3n perfecta en el flexbox sin importar los re-renders.
- **El problema del color en el Modal (Tema oscuro/claro):** Forzar colores estA3ticos (
gb(83, 100, 113)) rompA3a la estA3tica en el modal negro (donde los botones nativos son blancos).
- **La soluciA3n (Herencia CamaleA3nica):** Quitamos cualquier estilo quemado. Al usar svg.style.color = '' en estado normal, el SVG hereda automA3ticamente el color de texto de sus clases nativas de X (Gris en timeline, Blanco en el modal). Condicionamos el color del hover a 
gba(255, 255, 255, 0.1) si estA3 en la barra inferior del modal para imitar el modo oscuro, y azul para el Timeline normal.

