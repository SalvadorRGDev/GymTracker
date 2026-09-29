# Lenguaje visual

ADR-016 (vidrio sobre lienzo), enmendado por el ADR-017 (dirección moderna), el
ADR-018 (mapa muscular) y el ADR-021 (figuras de «Ver ejemplo»). Implementación:
`src/web/estilos.css`. Reglas medibles: `src/server/lenguaje-visual.test.ts`.

**El número manda sobre el efecto.**

## Dirección

- **Siempre clara.** No hay modo oscuro: aunque el sistema esté en oscuro, la
  página se ve clara (`color-scheme: light`; lo fija una prueba). Lienzo blanco
  azulado `#F8FAFD` con veladuras azul cielo, pervinca y hielo (`#D4E4FF`,
  `#DBE0FF`, `#D8EDFB`) y tarjetas blancas; neutros cálidos: sutil `#F6F5F1`, apagado
  `#EFEEE9`, borde `#E8E6E0`; texto grafito `#1F2430`, `#535A6A`, `#4F5566`.
- **Veladuras de color** (lavanda `#EEF0FF`, rosa `#FDF0F4`, menta `#EAF7F3`)
  detrás de cada cifra de la fila de estadísticas: el color decora y el número va
  en tinta, con contraste ≥ 5:1 comprobado.
- **Acento pastel, nunca un bloque oscuro.** Botones en pervinca claro
  `#CFD8FF` con tinta índigo `#1F2A7A` encima; enlaces, bordes de selección y
  controles marcados en índigo `#3A45B0`. El pervinca vivo `#8E9CFF` sólo decora.
  La marca lleva un degradado pastel pervinca → lila → rosa.
- **Títulos en serif** (Playfair Display) sólo en `h1` y `h2`. Todo lo demás
  —navegación, tarjetas, botones, tablas y **cifras**— en Inter; las cifras con
  `tabular-nums` para que las columnas se alineen.
- **Fuentes en el repositorio** (`src/web/fuentes/`, OFL), servidas por el mismo
  proceso. Ningún tercero se entera de que alguien abrió la app.
- **Iconos Lucide** copiados como datos (ISC). Nunca emoji.
- **Tarjetas** blancas, borde de 1 px, radio 14 px, sombra suave; las
  interactivas cambian el borde al pasar, sin elevarse.
- **Botones**: primario relleno, secundario fantasma; suben 2 px al pasar y
  vuelven al pulsar.
- **Tablas**: separadores finos, cifras alineadas a la derecha, nada de vidrio en
  filas.
- **Estados vacíos** con trama diagonal y un icono; la trama nunca va detrás de un
  número.
- **Decoración**: líneas discontinuas en los bordes de la columna y un brillo
  radial suave en el acceso.

## Vidrio: dos sitios, una receta

Fondo translúcido, `backdrop-filter: blur(20px) saturate(165%)`, borde de 1 px,
filo de luz interior y dos sombras, aplicado desde **un selector compartido**:
`.marco-cabecera, .detalle-flotante`. La cabecera fija (el contenido pasa por
debajo al desplazar) y el detalle flotante del mapa. Nada más.

## Los tres apagados (juntos, al principio del archivo)

`prefers-reduced-transparency: reduce`, `prefers-contrast: more` y `@supports not
(backdrop-filter)`. Reescriben **tokens**, no reglas: sin vidrio la aplicación se
ve sobria y completa.

## Contraste

≥ 5:1 para todo texto, **calculado sobre el color compuesto** (el vidrio
translúcido encima del lienzo). La prueba lo recalcula cada vez que se toca un
color.

## Movimiento

Sólo bajo `prefers-reduced-motion: no-preference` y ≤ 260 ms. Excepciones únicas
y declaradas:

- En el mapa muscular, el giro (`--duracion-giro`, 480 ms) y el relleno por región
  (`--duracion-relleno`, 320 ms con 40 ms de desfase; el total no pasa de un
  segundo). Con movimiento reducido no hay giro ni relleno: la cara cambia y el
  color aparece puesto.
- **La demostración de un ejercicio** (ADR-021): un bucle de unos tres segundos
  por repetición, movido con `requestAnimationFrame` y no con CSS, sólo mientras
  la ventana «Ver ejemplo» está abierta. Con movimiento reducido no hay bucle: la
  figura queda quieta, con la posición de partida en tenue (30 %) y la de llegada
  encima. El contenido que se mueve se detiene cerrando la ventana.

## «Ver ejemplo» y su figura (ADR-021)

- **El botón tiene su propio tono**: menta `#E6F6F1` con tinta verde `#0B6557`
  (≥ 5:1, también al pasar, `#D3EFE5`), para no confundirse con el nombre del
  ejercicio, que al marcarlo va en índigo. La prueba exige que los dos tonos se
  separen también con deuteranopía.
- **La ventana** es una tarjeta blanca centrada, radio 20 px, sobre un velo
  `rgb(18 22 38 / 58%)`: lo único oscuro de la aplicación, y opaco, sin
  desenfoque. Aparece con un fundido de 200 ms bajo `no-preference`.
- **La figura** va sobre un escenario `#F3F5FB` con un suelo `#E3E7F0`. El
  maniquí es grafito con luz de arriba a la izquierda (degradado `#5A6480` →
  `#3B4358`); el brazo y la pierna del lado lejano, más claros (`#9AA3B7` →
  `#7C869D`): la profundidad sin sombras. Cada pieza lleva un filo del color del
  escenario (2,2 px, pintado por debajo del relleno) que la separa de la que tiene
  detrás: hombro, codo, cadera y rodilla se leen como las junturas de un maniquí
  articulado. Bajo lo que toca el suelo, una mancha de contacto que se aclara al
  despegar.
- **Los músculos del ejercicio** salen de los coeficientes del catálogo base:
  **coral** `#EC7048` lo que trabaja sobre todo (1.00) y **melocotón** `#F0A88A`
  lo que ayuda (0.50); lo que trabaja «un poco» (0.25) no se colorea. Brazos y
  piernas se colorean enteros; el tronco, por regiones (pecho, dorsal, abdomen con
  oblicuos, lumbares, glúteo mayor y medio, trapecio) y el deltoides por cabezas.
  Una región **sólo pinta lo que mira a la cámara**, nunca lo de detrás a través
  del cuerpo. Los dos tonos se separan del grafito (≥ 3:1) y entre sí con
  deuteranopía; el color nunca va solo: la ventana los nombra en texto.
- **La cámara** de cada ejercicio se elige para que lo que más trabaja se vea:
  tres cuartos por delante por omisión y **tres cuartos por detrás**
  (`DESDE_ATRAS`) cuando trabajan la espalda, el glúteo o la parte de atrás del
  hombro. Una prueba exige que lo que trabaja sobre todo mire a la cámara en
  algún momento del recorrido.
- **El material**: lo que tiene volumen es un cilindro con su tapa y el canto en
  otro tono. Discos y mancuernas en índigo `#4A56C9` (canto `#343F9F`), barras y
  palancas en acero `#C3CAD6`, asas y cuerdas en goma `#5C6477`, rodillos y
  hombreras acolchados `#8B95AA`; cables `#4F586C` y bandas en frambuesa
  `#C2456D`. Bancos y máquinas en grises azulados con la cara de arriba más clara.
  Las palancas giran donde gira la articulación que acompañan (encima del hombro
  en el pec deck, en la cadera en el crunch), así que no se estiran. Todos los
  trazos ≥ 3:1 sobre el escenario (contraste de lo que no es texto), comprobado.

## La escala del mapa muscular (ADR-018)

| Nivel | Series efectivas | Claro | Oscuro | Rótulo |
| ----- | ---------------- | ----- | ------ | ------ |
| 0 | 0 | trama sobre neutro | trama sobre neutro | Sin trabajo |
| 1 | > 0 y < 4 | `#E3F4DA` | `#21402B` | Estímulo mínimo |
| 2 | 4 a < 8 | `#B5DCA3` | `#2C5838` | Poco volumen |
| 3 | 8 a < 12 | `#8DB77A` | `#3F7A3A` | Volumen moderado |
| 4 | 12 a < 16 | `#E08A2E` | `#BF6A22` | Volumen alto |
| 5 | 16 a < 20 | `#CC5A24` | `#E8743A` | Volumen muy alto |
| 6 | 20 o más | `#A8261C` | `#FF7A6B` | Más de 20 series |

La luminancia baja siempre de nivel en nivel en claro (≈ 0.86 → 0.64 → 0.41 → 0.34
→ 0.20 → 0.10) y sube en oscuro: en gris se lee igual y no depende del par
rojo-verde. Las barras de la tabla del resumen usan el color de su nivel: los
datos tienen su propia escala, no el acento de la marca. La leyenda es de tramos
discretos, con marcas 0 · 4 · 8 · 12 · 16 · 20+, y una frase fija: el color es una
cantidad, no una nota.

Con deuteranopía simulada (Machado, 2009) la claridad sigue siendo monótona y
cada nivel se separa del siguiente por ΔE ≥ 8; lo comprueba
`src/server/lenguaje-visual.test.ts`. **Pendiente a mano**: la animación de giro
en Safari de iOS.

## La escala divergente de la comparativa (ADR-019)

Ámbar ↔ azul, propia: no reutiliza el rojo del mapa (que dice «mucho volumen»),
ni el de peligro, ni el acento. El color nunca va solo: cada diferencia lleva su
cifra con signo, un icono y la palabra.

| Token | Claro | Oscuro | Uso |
| ----- | ----- | ------ | --- |
| `--deficit-texto` / `--deficit-fondo` | `#8A4700` / `#FCEFDD` | `#F2B366` / `#2A1F11` | Pastilla de déficit (≥ 5:1) |
| `--superavit-texto` / `--superavit-fondo` | `#1F4F8F` / `#E5EEFA` | `#9CC2F4` / `#15233A` | Pastilla de superávit (≥ 5:1) |
| `--deficit-barra` | `#C77414` | `#D98B2B` | Barra y región con déficit (≥ 3:1) |
| `--superavit-barra` | `#3A6FBD` | `#5B93DD` | Barra y región con superávit (≥ 3:1) |
| `--pendiente-relleno` | `#F0CF9F` | `#6E4A1C` | Región pendiente (semana en curso) |
| `--en-plan-relleno` | `#9AA598` | `#5D6860` | Región en plan |

Con deuteranopía, déficit y superávit quedan a ΔE ≥ 40, y en la figura los cuatro
estados y la trama a ΔE ≥ 25 entre sí. Lo comprueba la misma prueba.
