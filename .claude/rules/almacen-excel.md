---
paths:
  - "src/almacen/**/*"
  - "datos/**/*"
---

# El almacén en libros de Excel

Lo decide el ADR-010. Un libro `.xlsx` por propietario más `cuentas.xlsx`, y
ninguna base de datos debajo. Estas reglas son lo que queda de
`.claude/rules/migraciones.md`, que desapareció con las migraciones: las lecciones
sobre cómo se declara un invariante siguen siendo verdad, sólo cambió dónde se
declaran.

## Dónde se aplica un invariante

- **En `src/almacen/invariantes.ts`, y en ningún otro sitio.** Se comprueba el
  conjunto entero antes de confirmar cada transacción, con el ANTES y el DESPUÉS
  delante. No se ponen guardias en los puntos de escritura: un invariante que
  depende de que cada servicio se acuerde de llamarlo ya no es un invariante, y
  ésa es exactamente la propiedad que el proyecto no quería cuando los declaraba
  en el esquema.
- Un invariante que la documentación afirma se comprueba ahí. Si un documento
  dice «esto es inmutable» y nada lo impide, la afirmación es falsa el día que
  alguien escriba el cambio, y no habrá error que lo delate: los números cambian
  y siguen pareciendo correctos.
- Una comprobación que mira al PADRE de una fila tiene que mirar a los dos padres
  cuando la fila cambia de padre: el que deja y el que recibe. Con sólo el nuevo,
  reasignar la referencia saca la fila del padre protegido sin editarle una sola
  columna (defecto 7 de `docs/02-modelo-datos.md`).
- Si dos filas se AGREGAN al leerlas —se suman, se promedian—, la unicidad de su
  clave lógica es parte del invariante y va comprobada. Sin ella, un duplicado no
  produce un error: produce un número distinto.
- El alcance se escribe por afirmación —lo que un alcance PUEDE hacer— y nunca
  por negación. Añadir una hoja y olvidar la tabla de alcances tiene que dejarla
  invisible para todos, no visible para todos.

## El archivo se edita a mano

Es la razón de ser del ADR-010, así que no es un accidente del que haya que
protegerse: es un caso de uso.

- **Todas las celdas son texto.** Ningún decimal se guarda como número de Excel,
  que es `float64`. El motor recibe cadenas y las parsea a centésimas enteras,
  igual que recibía los `numeric` de PostgreSQL.
- **Se valida al cargar**, no sólo al escribir, y el error dice hoja, fila y
  columna. Adivinar qué quiso decir quien tecleó `once` en un campo numérico es
  la corrupción silenciosa que el proyecto persigue.
- **No se escribe encima de una edición ajena.** Antes de guardar se comprueba
  que el archivo no cambió desde que se cargó; si cambió, la petición falla y no
  se escribe nada.
- Una columna que el esquema no conoce **detiene la carga** en vez de ignorarse:
  ignorarla la borraría en la siguiente escritura.

## Una columna que cambia de nombre (ADR-023)

- Se declara en `RENOMBRADAS_DEL_LIBRO` (`src/almacen/esquema.ts`) con su
  conversión: el lector lee el nombre viejo como el nuevo y la siguiente
  escritura, con su copia previa, lo deja en la forma nueva. Así también carga un
  respaldo viejo restaurado, y no hay un script de migración que olvidar.
- Un libro con **las dos** columnas no carga: no se sabría cuál vale.
- La conversión es pura, vive en el motor y se prueba allí; una celda vieja
  ilegible falla con hoja, fila y la columna vieja entre paréntesis.
- Sigue siendo un cambio destructivo: pide su ADR, como un `RENAME COLUMN`.

## Escritura

- **Atómica**: a un temporal, `sync()`, y renombrar. Un `.xlsx` a medio escribir
  no es un archivo dañado, es un ZIP truncado que no abre nadie.
- **En fila india**: una cola por archivo. Es lo único que puede corromper esto.
- **Respaldo antes de cada escritura**, con poda que conserva además la primera
  copia de cada día. Conservar «las últimas N» a secas se come el historial en
  una tarde de ochenta series.

## Antes de tocar el esquema de las hojas

Añadir una columna es aditivo y no rompe nada: el lector empareja por nombre y
un libro viejo simplemente no la trae —salvo que sea obligatoria, y entonces hay
que poblarla—. Quitar o reinterpretar una columna es destructivo y necesita un
ADR, igual que lo necesitaba un `DROP COLUMN`.

Verificar que hay respaldo reciente antes de cualquier cambio de forma. Un
histórico de entrenamiento no es reconstruible.
