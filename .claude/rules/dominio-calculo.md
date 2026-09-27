---
paths:
  - "src/domain/**/*"
---

# Motor de cálculo de volumen

Este es el activo central del sistema. Un error de signo o de ventana temporal
aquí puede pasar meses inadvertido y contaminar todo el histórico.

## Reglas

- Función pura: entra un conjunto de series, sale volumen por grupo muscular.
  Sin acceso a red, sin lectura directa de base de datos, sin fecha del sistema.
  La fecha entra como parámetro para que sea comprobable.
- Una sola métrica de estímulo, la definida en ADR-003. No combinar series,
  carga, repeticiones y RIR sin criterio explícito: eso cuenta la intensidad
  dos veces.
- El filtro de calentamiento vive DENTRO del motor. La bandera es obligatoria en
  el tipo de entrada y el motor descarta esas series él mismo. No es
  responsabilidad del llamador filtrarlas antes: si lo fuera, bastaría un llamador
  nuevo distraído para inflar el volumen de forma sistemática y silenciosa, sin
  que nada falle. Ver ADR-006.
- Los coeficientes de contribución muscular Y el umbral de RIR llegan como dato de
  entrada, nunca se leen desde dentro del motor ni se codifican en constantes del
  módulo. Ambos son parámetros de la métrica y viven en `version_parametros`
  (ADR-003): el umbral en la cabecera, los coeficientes en las filas.

## El plan no se compara contra el agregado: se expande a la misma entrada

Lo decidió el ADR-006 y lo implementa `plan.ts`. Una entrada de plan se convierte
en una `Serie` con sus grupos, sus coeficientes y su condición de efectiva, y
pasa por `agrega` igual que lo registrado. Los dos lados del signo menos de la
comparativa salen del mismo código, así que una diferencia entre ellos solo puede
venir de lo que el usuario hizo en el gimnasio y no de dos implementaciones que
redondean distinto.

- **El multiplicador vive en el tipo compartido, no en quien expande.** `Serie`
  lleva `veces: Centesimas`, obligatorio y sin valor por omisión: una serie
  registrada vale `UNA_SERIE`, una entrada de plan vale su objetivo, que es
  `numeric(5,2)` y puede ser fraccionario. La multiplicación la hace `agrega` con
  `multiplica`, que es la misma aritmética exacta que la suma. Si el
  multiplicador viviera en la expansión, el campo `coeficiente` dejaría de ser un
  coeficiente para el lado del plan —el esquema lo acota a 2.00 y un objetivo de
  grupo llega a 100— y las dos ramas de la resta usarían caminos distintos.
- **Un objetivo por grupo se expresa con coeficiente 1.00**, no con un atajo que
  esquive el reparto: recorre el mismo camino que el objetivo por ejercicio.
- **Una serie de plan entra con `rir: 0`.** El plan declara series efectivas y no
  tiene RIR que declarar; cero es el único valor que cuenta con cualquier umbral,
  porque el umbral está acotado a `[0, 10]`. Un valor mayor haría que un
  umbral bajo borrara el plan en silencio.
- **El día de ciclo se cuenta desde el ancla de la asignación**, que es el
  inicio de su vigencia. Nunca desde el lunes ni desde el principio de la
  ventana.
- **`seriesEfectivas`, `seriesSinMapeo` y compañía cuentan ENTRADAS, no volumen.**
  Para la ejecución coinciden con el número de series; para un plan expandido una
  sola entrada puede valer 4.50. El volumen está en `porGrupo` y solo ahí.
- La expansión **se niega a suponer**: asignaciones solapadas, una asignación que
  empieza antes de su ancla o una entrada que pide un día fuera de su ciclo son
  excepciones, no datos que ignorar. Las tres las impide
  `src/almacen/invariantes.ts`; llegar aquí con una significa que el almacén
  trajo algo que nunca debió guardar.

## La comparativa es una resta (ADR-019)

`comparativa.ts` decide la ventana y resta; no suma nada.

- **La ventana es la semana del plan contada desde el ancla**
  (`ventanasDeComparacion`), nunca desde el lunes. Una asignación cerrada a mitad
  deja su última ventana corta; la siguiente cuenta desde su propio ancla.
- **`resta` es ejecutado menos planeado**, grupo a grupo, sobre dos `Agregado`
  que salieron de `agrega`. Un grupo que un lado no tiene vale cero en ese lado.
- **Qué cuenta lo dice `clasifica`**, y sólo ella: `agrega` y `vigilaUmbral` la
  llaman. Repetir la comparación `rir <= umbral` en otro sitio es la forma de que
  la vigilancia y el volumen discrepen sin que nada falle.
- **Vigilancia del umbral**: de las efectivas, las que tienen el RIR en
  `[umbral − 1, umbral]`, cada una con el umbral de su versión. Dispara con
  **más** del 15 % y 30 efectivas o más, en aritmética entera. Las dos cifras son
  convenciones declaradas.

## Reproducibilidad

Editar un coeficiente o el umbral de RIR NO debe reescribir métricas históricas.
Las comparativas del mes pasado deben seguir mostrando lo que mostraban entonces.
El mecanismo está definido en ADR-003: cada sesión guarda un puntero inmutable a
la versión de parámetros con la que debe interpretarse. Respétalo.

No lo respetas por disciplina: lo aplican los invariantes. En cuanto una sesión
fija una versión, el umbral y los coeficientes de esa versión dejan de admitir
cambio, borrado o alta. Si escribes un flujo de edición que actualiza en sitio,
la transacción se aborta entera; el flujo correcto es cerrar la vigencia de la
versión actual y crear la sucesora.

Recalcular el histórico con otros parámetros es legítimo como SIMULACIÓN: se le
pasan otros argumentos al motor, el resultado se rotula como simulación y no se
escribe. Lo que no es legítimo es que una simulación se convierta en la lectura
canónica sin crear una versión nueva.

## Pruebas obligatorias

Todo cambio en este directorio requiere pruebas en el mismo commit. Casos que
siempre deben estar cubiertos:

- Sesión que cruza la medianoche (23:50 a 00:15) cuenta como un solo día.
- Cambio de plan a mitad del histórico: las semanas previas se comparan contra
  el plan viejo. El flujo es cerrar la asignación vigente por arriba y asignar la
  siguiente desde mañana; en cuanto una asignación cubre sesiones registradas, el
  invariante rechaza re-apuntarla, moverle el ancla y borrarla. Asignar hacia atrás sí es legítimo mientras la ventana no
  cubra ninguna sesión: es como se da de alta alguien que ya venía entrenando.
- Edición de un coeficiente con datos previos: el histórico no cambia.
- Edición del umbral de RIR con datos previos: el histórico no cambia.
- Serie efectiva justo en la frontera del umbral: cuenta o no cuenta de forma
  determinista, y el caso está cubierto explícitamente porque ahí la métrica es
  máximamente sensible al error de medición (ADR-003).
- Guardado duplicado por reintento: no genera doble volumen.
- Ejercicio que contribuye a varios grupos musculares con coeficientes
  distintos.
- Semana sin datos: devuelve cero, no error ni null.
