# Lenguaje visual

ADR-016 (vidrio sobre lienzo), enmendado por el ADR-017 (dirección moderna) y el
ADR-018 (mapa muscular). Implementación: `src/web/estilos.css`. Reglas medibles:
`src/server/lenguaje-visual.test.ts`.

**El número manda sobre el efecto.**

## Dirección

- **Base clara** por omisión, con el modo oscuro conservado por tokens. Neutros
  con una pizca de verde: fondo `#FFFFFF`, sutil `#F7F9F6`, apagado `#F1F4EF`,
  borde `#E3E8E1`; texto `#111611`, `#515A52`, `#5E6760`.
- **Un tono verde manda.** Botones y enlaces en el verde profundo `#1C6340`
  (7.2:1 con blanco). El verde vivo `#5EA832` sólo decora: puntos, anillos de
  foco, bordes al pasar. Con texto blanco no llega a 5:1.
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
translúcido encima del lienzo), en claro y en oscuro. La prueba lo recalcula cada
vez que se toca un color.

## Movimiento

Sólo bajo `prefers-reduced-motion: no-preference` y ≤ 260 ms. Excepciones únicas
y declaradas, en el mapa muscular: el giro (`--duracion-giro`, 480 ms) y el
relleno por región (`--duracion-relleno`, 320 ms con 40 ms de desfase; el total no
pasa de un segundo). Con movimiento reducido no hay giro ni relleno: la cara
cambia y el color aparece puesto.

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
