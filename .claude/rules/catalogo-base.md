---
paths:
  - "src/catalogo/**/*"
---

# Catálogo base

La semilla del ADR-012: grupos musculares, ejercicios con sus coeficientes,
perfiles de equipamiento, plantillas de rutina y rangos de referencia. Vive en
`src/catalogo/datos/*.json` y su porqué —la taxonomía, la convención de
coeficientes, las fuentes y sus márgenes— está en `docs/09-catalogo-base.md`.

**No es el catálogo de nadie: es su semilla.** Se copia al libro de un
propietario por una operación explícita y a partir de ahí la copia es suya. Una
versión nueva de estos archivos **no reescribe ningún libro ya sembrado**, y eso
no es una limitación: los coeficientes de una versión de parámetros con sesiones
fijadas no se editan, se versionan (ADR-003), y esa regla no deja de aplicar
porque el cambio venga del repositorio.

## Los datos

- **Son JSON y se importan como módulo**, con `import … with { type: 'json' }`.
  Nunca con `node:fs`: la frontera del ADR-010 dice que sólo `src/almacen/` abre
  archivos y `src/server/arquitectura.test.ts` fija la lista exacta. Un `import`
  se resuelve al cargar el módulo y no añade ninguna ruta de lectura de disco.
- **Los coeficientes son cadenas decimales de dos decimales**, como todo decimal
  aquí, y sólo valen `1.00`, `0.50` y `0.25`. Son números con rango validado,
  **nunca expresiones evaluables**: el spec descarta explícitamente cualquier
  diseño que evalúe contenido del almacén.
- **Un identificador no se renombra y no se recicla.** Es la clave estable que
  usan los perfiles, las plantillas y la importación. Reciclarlo hace que una
  plantilla vieja apunte a otro ejercicio sin que nada falle.
- **Los nombres se eligen cortos y dictables.** El atajo del iPhone resuelve el
  ejercicio por nombre EXACTO (`src/api/captura/servicio.ts`) y el nombre llega
  por dictado en un gimnasio ruidoso. Los sinónimos van en `alias`, que es dato
  de búsqueda del cliente web y **no se guarda en el almacén**: allí sería una
  segunda clave por la que dos ejercicios pueden colisionar.
- **Añadir es aditivo. Quitar o reinterpretar exige un ADR**, igual que lo exigía
  un `DROP COLUMN`. Quitar un ejercicio deja huérfanas a las plantillas que lo
  citan, y eso lo caza la prueba de datos, no la revisión.

## La validación

`validaCatalogo` corre **al importar el módulo**, que es al arrancar: un catálogo
mal formado no deja levantar el servidor en vez de fallar en la primera petición
que lo toque. Cuesta milisegundos y paga la única forma realista de romperlo, que
es editar el `.json` a mano.

`src/catalogo/catalogo.test.ts` ejerce el validador con catálogos **rotos a
propósito**. Un validador que sólo se prueba con el archivo bueno pasaría igual
estando vacío.

Lo que se comprueba, y por tanto lo que no hace falta revisar a mano:

- identificadores únicos y nombres únicos por `trim().toLowerCase()`, que es la
  misma clave del índice único del almacén;
- coeficientes en (0, 2] con dos decimales y al menos un `1.00` por ejercicio;
- alias sin repetir y sin repetir el nombre;
- cada perfil cubre los dieciséis grupos **o declara el hueco** en
  `sin_cobertura`: un hueco silencioso es el usuario descubriéndolo en la
  proyección;
- exactamente un perfil por omisión;
- cada plantilla sólo pide ejercicios de su perfil y cabe en su ciclo;
- cada banda de referencia cita una fuente existente con su margen.

**Las plantillas se comprueban con el motor de verdad.** La prueba expande cada
una con `expandePlan` y `agrega` —las mismas funciones que la proyección— sobre
el mínimo común múltiplo de su ciclo y la semana, y compara con la banda de cada
grupo en aritmética entera. Escribir aquí una suma propia sería el motor
duplicado en una prueba (ADR-006, riesgo R10) y dejaría de comprobar nada.

## La importación

Vive en `src/api/lectura/servicio.ts` y tiene tres reglas que no se negocian:

- **El cliente manda identificadores, nunca coeficientes.** El coeficiente decide
  cuánto vale una serie; aceptarlo del navegador sería dejar que lo fije quien lo
  va a leer, y cierra además la superficie entera: no hay forma de colar un valor
  fuera de rango porque no hay forma de colar un valor.
- **Es idempotente y reconciliadora.** Lo que ya existe con ese nombre se
  reutiliza, lo que falta se crea, y **un coeficiente que el usuario ya puso no se
  pisa nunca**. Importar dos veces no duplica y no destruye ajustes.
- **Al versionar, la sucesora COPIA las contribuciones de la anterior.** Importar
  añade a lo que hay; una sucesora vacía borraría de hecho el catálogo del
  usuario a partir de mañana.

## Los rangos de referencia

Son **referencia, no objetivo** (ADR-014). Reglas de presentación:

- Se muestran junto a un número que ya existía. No se compone ninguna métrica
  nueva; si se borrara el rango, el producto perdería una referencia, no una
  medida.
- El texto dice «por debajo», «dentro» o «por encima». **Sin puntuación, sin
  porcentaje de cumplimiento y sin semáforo**: el color nunca es el único
  portador del significado.
- `respaldo` distingue lo publicado de lo nuestro, y se enseña. Un rango sin
  fuente es una opinión con aspecto de hecho, y por eso la fuente es obligatoria
  y su ausencia rompe la validación.
- El veredicto se decide con **aritmética entera** —la banda multiplicada por las
  semanas contra las centésimas del motor—, nunca sobre el decimal redondeado que
  se pinta.
