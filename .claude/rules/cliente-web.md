---
paths:
  - "src/web/**/*"
---

# Cliente web

Preact y Vite (ADR-004), sin nada offline (ADR-008): sin service worker, sin
IndexedDB y sin cola propia. Las tres vistas de lectura de la fase 1, la
PROYECCIÓN y la autoría de planes de la fase 2, y —desde el ADR-011— también la
**captura**.

Toda lectura autenticada pasa por `useRecurso`. Ahí vive el invariante de que
cualquier 401 devuelve la aplicación al acceso: repartido por las páginas,
bastaría una nueva distraída para seguir pintando datos con la sesión caducada.

## Lo que el cliente no hace

- **No agrega y no recalcula.** El número que se ve lo produjo
  `src/domain/volume/` en el servidor. Sumar series en el cliente es el motor
  duplicado en una segunda ruta de ejecución (ADR-006, riesgo R10), y su primer
  síntoma es un total que no cuadra con el del servidor.
- **No parchea el total** con nada que el servidor no haya dicho.
- **No declara pendientes de sincronizar.** La cola vive en el iPhone y esta
  pantalla no la ve: se declara la **frescura** —«última serie recibida: hoy
  19:42»— y nada más (ADR-008).
- **No inventa datos de ejemplo.** Una métrica sin datos dice que no tiene datos.

## Decimales y fechas

- `series_efectivas` y demás `numeric` llegan como **cadena** y se presentan tal
  cual. `12.50` y `12.5` son el mismo número y distinto dato; volver a
  formatearlos desde `Number` pierde el segundo. Para aritmética, las centésimas
  enteras del motor —`centesimasDesdeDecimal`—, nunca coma flotante.
- La fecha lógica **no se convierte a `Date`**. `new Date('2026-09-07')` es
  medianoche UTC y al oeste de Greenwich se presenta como el 6 de septiembre: un
  día de menos es justo el fallo que esa columna existe para evitar. El texto se
  compone de las tres partes del ISO (`src/web/formato/fechas.ts`).
- Un instante sí es un instante y sí se convierte: `ultima_serie_recibida` es un
  «cuándo», no un día del calendario.

## Sesión

- El token no se lee, no se guarda y no se reenvía: vive en la cookie `HttpOnly`
  del ADR-007. La única forma de saber si hay sesión es pedir un recurso
  autenticado y ver si el servidor contesta 401.
- Toda petición va con `credentials: 'same-origin'`.
- Cualquier 401 devuelve la aplicación al estado anónimo. Seguir pintando una
  vista autenticada con la sesión caducada enseña datos viejos como si vivieran.
- El fallo de credenciales dice lo mismo exista o no el correo, porque el
  servidor contesta el mismo 401 a propósito.

## La captura web (ADR-008, ampliación del ADR-011)

Existe porque el servidor ya no está siempre encendido y porque el segundo
usuario puede no tener iPhone. Es la misma operación que hacen los atajos y
llama al mismo servicio, así que hereda sus reglas enteras:

- **No calcula.** El «pectoral: 12.00 esta semana» que se ve lo produjo el motor
  en el servidor y viaja en la respuesta.
- **No crea catálogo.** El ejercicio se elige de una lista; un nombre que el
  catálogo no tiene no se puede ni escribir.
- **El calentamiento es el botón que se pulsa**, no una casilla que se pueda
  olvidar: «Guardar serie» o «Guardar calentamiento».
- **La carga en libras** (ADR-023): «Carga (lb)», lo que marcan los discos. El
  peso corporal sigue en kilos («Peso de hoy (kg)»): no es un dato del gimnasio
  y aquí se mide así.
- **La fecha lógica la pone el servidor**, que la saca de la zona de la cuenta.
  Tomarla del reloj del navegador rompería la sesión que cruza la medianoche y
  mentiría cuando el usuario viaja.
- **El mensaje que se enseña es el del servidor**, palabra por palabra, acepte o
  rechace. Reescribirlo aquí sería mantener dos textos para el mismo rechazo,
  uno por cliente, y son los que divergen.
- **Empieza por la rutina del día** (ADR-022). Qué rutina toca, qué día de su
  ciclo, cuánto va hecho y si está completo lo manda
  `GET /api/registro/v1/rutina`: la pantalla no deduce el día —convertiría
  fechas lógicas— ni cuenta series —sería el motor duplicado—. Con entrenamiento
  abierto se manda su clave y la fecha es la suya. Tras guardar, lo elegido se
  queda y el progreso se vuelve a pedir.
- **La rutina o el día elegidos a mano van en la consulta** (`?rutina=…&dia=…`) y
  la pantalla lo dice: «Estás viendo el día 3…, no el que toca», con «Volver a la
  de hoy». Elegir la asignada limpia la consulta, para que siga al día que toque.
- **La búsqueda libre sigue, debajo y rotulada** («¿Vas a hacer algo que no está
  en la rutina?»); lo elegido que no está en la lista del día se avisa: se guarda
  igual y cuenta para la semana. Sin rutina, la búsqueda es lo principal y lo
  dice.
- **Del entrenamiento abierto se guarda la identidad y nada más.** Una clave y
  un instante en `sessionStorage`, vigentes seis horas por ANTIGÜEDAD igual que
  el archivo del atajo. No es la cola offline que el ADR-008 descarta —no hay
  nada pendiente de enviar y no se reintenta nada—: es lo que evita que recargar
  la página parta un entrenamiento en dos sesiones. Ninguna serie vive ahí.

## El historial es el registro, no un resumen

- El calentamiento se **marca y se conserva**. No cuenta volumen —eso lo decide
  el motor— pero borrarlo de la historia sería reescribir lo que pasó.
- Carga, repeticiones y RIR se presentan como llegaron. Un RIR ausente es «—»,
  nunca un cero: cero significa fallo muscular y es lo contrario de no saberlo.
- Una sesión sin cerrar se dice sin cerrar. El final lo pone el atajo «Terminar
  entrenamiento»; inventarle una hora es inventar un dato.
- `fecha_por_confirmar` se muestra. La fecha llegó del reloj de un teléfono y el
  riesgo R3 pide que esa duda se vea, no que se esconda.
- El historial no agrega, así que no declara frescura: la regla de frescura
  aplica a las vistas que agregan. Deducirla de las sesiones que se ven sería
  afirmar sobre lo que no se ve.

## El catálogo se importa antes que teclearse

- **El camino principal es traer el catálogo base** (ADR-012): elegir un perfil,
  afinar la lista e importar. Crear a mano un grupo o un ejercicio sigue estando,
  pero deja de ser lo primero que se ve.
- El cliente manda **identificadores**, nunca coeficientes. El coeficiente decide
  cuánto vale una serie y lo resuelve el servidor contra su propia copia.
- El editor de coeficientes está **plegado**, y plegado significa que sus campos
  ni se pintan: son ejercicios por grupos, y con el catálogo entero eso son miles
  de campos que nadie pidió.
- El desplegable de ejercicio **busca por nombre y por sinónimo** y filtra por
  equipamiento. Los sinónimos salen del catálogo base y viven sólo en el
  navegador: en el almacén serían una segunda clave por la que dos ejercicios
  pueden colisionar.
- **«Ver ejemplo»** (ADR-021) va en cada fila de la lista, **fuera de la
  etiqueta** de la casilla: dentro, el clic marcaría o desmarcaría el ejercicio.
  Su nombre accesible dice de qué ejercicio es («Ver ejemplo de Press banca») y su
  tono (menta) no es el del nombre (índigo al marcarlo).
- La ventana es el `<dialog>` nativo en modo modal: el foco entra por «Cerrar» y
  vuelve a «Ver ejemplo» al salir; Escape y un clic fuera también cierran. Las
  poses se cargan con `import()` al abrirla, no con la página.
- **La figura no inventa lo que no sabe.** Cada ejercicio del catálogo base
  tiene la suya por identificador (`ejemplos.ts`); lo que no puede enseñar (el
  agarre) va en una nota, y un ejercicio sin figura lo dice en vez de enseñar
  otra. Los músculos que lista salen de los coeficientes del catálogo base, y
  **los que colorea también**: coral lo que trabaja sobre todo (1.00),
  melocotón lo que ayuda (0.50), nada para el 0.25. Una región del tronco pinta
  sólo lo que mira a la cámara, y la cámara de cada ejercicio se elige para que
  lo que trabaja se vea (`DESDE_ATRAS` para espalda, glúteo y deltoides
  posterior): lo exige `demostracion.test.ts`.
- Los **rangos de referencia** se presentan como referencia y no como objetivo
  (ADR-014): «dentro», «por debajo» o «por encima», con su respaldo declarado.
  Sin puntuación, sin porcentaje y sin semáforo. Se pueden ocultar (preferencia
  del navegador).
- El **volumen de un plan en borrador se lee**, no se calcula: se guarda la
  versión y se pide `GET /versiones/:id/volumen`. Sumar entradas en el navegador
  sería el motor duplicado (riesgo R10), y su primer síntoma sería un total del
  editor que no cuadra con el de la proyección.

## El catálogo se versiona, no se edita

- Guardar parámetros **no cambia lo ya calculado**. Mientras ninguna sesión fije
  la versión vigente se reescribe en sitio y lo guardado rige ya, hoy incluido
  (ADR-013); en cuanto una la fija, cierra la vigente y crea la sucesora desde
  mañana (ADR-003). La pantalla dice las dos cosas antes de guardar y, después,
  cuál de los dos caminos se tomó. Presentarlo como «editar» sería mentir sobre
  lo que pasa.
- `PUT /catalogo/parametros` **reemplaza la propuesta entera**, umbral y todos los
  pares. De ahí que el editor muestre y envíe todo lo que la versión tiene,
  incluidos los ejercicios archivados: un par que no se envía desaparece de la
  versión nueva, y desaparecer en silencio es justo lo que no puede pasar.
- Un coeficiente en blanco es no contribuir, y por eso sale de la propuesta: el
  contrato exige mayor que cero.
- La validación del cliente repite la del servidor para decirlo antes y con el
  nombre del campo delante. No la sustituye: los códigos de rechazo del servidor
  se muestran igual, con su explicación.
- Un ejercicio sin grupos se marca en la lista. Es el origen de
  `series_sin_mapeo` en el resumen, y verlo aquí es lo que cierra el círculo.
- **Los ajustes de la métrica son opcionales y lo dicen primero.** Se titulan
  «Ajustes avanzados», llevan la etiqueta «Opcional» y abren con «No hace falta
  tocar nada aquí». Cada ajuste explica antes qué es, para quien no sabe de
  entrenamiento: qué es el RIR y qué significa 1.00, 0.50, 0.25 y en blanco. Nada
  de «fijar», «en sitio» ni «versión»: se dice desde cuándo se aplica.
- **Los coeficientes se ven antes de poder tocarse**: el reparto en una frase
  («cada serie de Press banca cuenta así: …») y los campos sólo tras pulsar
  «Modificar los coeficientes». Lo que difiere del catálogo base se marca con su
  valor de referencia y se puede restaurar; antes de guardar se enumera lo que
  cambia, y «Guardar» está desactivado mientras no cambie nada. Un clic suelto no
  puede reescribir cómo se cuentan las series.

## La credencial de captura se ve una vez

- La respuesta de emisión es la **única** vez que la credencial existe fuera del
  teléfono: la base guarda su HMAC y no hay endpoint que la devuelva (ADR-009).
  La pantalla lo dice con esas palabras y no ofrece volver a verla.
- Junto a la credencial va dónde se guarda: el **archivo de credencial** de la
  carpeta de Atajos, que es lo que pide el atajo `Configurar`. Nunca dentro del
  atajo, porque compartirlo exporta sus acciones.
- La dirección del archivo la decide el servidor (`URL_PUBLICA`, si no el
  `Origin` del navegador, si no el `Host`), y el aviso de que el teléfono no la
  alcanzará —local o sin https— también: se enseña tal cual, junto al archivo.
  Tomarla del `Host` a secas fue un error real: detrás de un túnel que lo
  reescribe, el archivo apuntaba a `127.0.0.1` y nada lo decía hasta que el
  atajo no conectaba.
- La lista enseña el último uso, y «todavía no se ha usado» cuando es `null`. Es
  lo que permite notar una credencial viva que nadie usa.
- Borrar una serie o una sesión, o confirmar una fecha, sólo existe en el
  historial web (`/api/registro/v1`), confirmado en dos pasos y a la vista. El
  atajo no borra nada.
- Revocar es irreversible y deja al teléfono sin escribir: se confirma en dos
  pasos, en la propia ficha, y sólo entonces se llama al `DELETE`.
- La exportación declara qué lleva y qué no lleva —ni contraseñas, ni huellas, ni
  tokens— y trata su 429 como lo que es: un límite con hora de vuelta, no un
  error.

## Planes y proyección

- La proyección es lo que el plan **pide**, y la pantalla lo dice con esas
  palabras. No es lo entrenado y no es la diferencia entre los dos: eso es la
  comparativa.
- La ventana se pide en **semanas relativas a hoy**, no en fechas. «Hoy» es la
  fecha lógica del usuario, sale de su zona horaria y la sabe la base; calcularla
  aquí obligaría además a convertir fechas lógicas a `Date`, que es el día de
  menos de arriba.
- Una ventana sin plan asignado dice que no hay plan. No enseña ceros: un cero
  sin explicación es indistinguible de un plan que no entrena nada.
- La autoría **no ofrece re-apuntar una asignación ni moverle el inicio**, porque
  ese inicio es el día 1 del ciclo y moverlo renumera el histórico. Lo que ofrece
  es asignar otra versión desde una fecha posterior, que cierra la anterior sola.
  Una asignación que ya cubre sesiones tampoco se retira, y la pantalla explica
  por qué en vez de esconder el botón sin más.
- Guardar entradas **reemplaza la versión entera**, como los parámetros del
  catálogo: lo que no se envía desaparece, y la pantalla lo dice antes de
  guardar.

## Presentación

- Sin biblioteca de gráficas y sin framework CSS. La gráfica de la vista
  PRINCIPAL es HTML y CSS; la figura del mapa muscular es SVG propio.
- **Dirección moderna** (ADR-017, que enmienda al ADR-016): base clara, títulos en
  serif (Playfair Display) sólo en `h1`/`h2`, todo lo demás —y **las cifras**— en
  Inter con `tabular-nums`. Tarjetas blancas con borde de 1 px y sombra suave; al
  pasar cambian el borde, no se elevan. Botón primario en pervinca claro con
  tinta índigo; el pervinca vivo sólo decora. Lienzo con veladuras azules; las de
  lavanda, rosa y menta, sólo en las fichas de la fila de estadísticas, con la
  cifra en tinta. Fuentes alojadas en `src/web/fuentes/` (OFL) e iconos
  Lucide copiados como datos en `componentes/iconos.tsx` (ISC): ni Google Fonts ni
  `lucide-preact`. Nunca emoji.
- **El vidrio queda en dos sitios**: la cabecera fija y el detalle flotante del
  mapa, desde **un selector compartido** en `src/web/estilos.css`
  (`.marco-cabecera, .detalle-flotante`). Un sitio nuevo con vidrio exige añadirlo a
  esa lista y pasar la prueba de contraste.
- **El número manda sobre el efecto.** La credencial de captura va sobre
  superficie opaca. La trama diagonal decora vacíos y el lienzo de la figura, y
  **nunca va detrás de un número**.
- **Nada de vidrio en filas ni celdas.**
- **Los tres apagados no son opcionales**: `prefers-reduced-transparency`,
  `prefers-contrast: more` y `@supports not (backdrop-filter: …)`, juntos al
  principio del archivo. Reescriben tokens, no reglas.
- **Siempre clara**: no hay modo oscuro (`color-scheme: light`), aunque el
  sistema lo pida. El acento es pastel con tinta encima, nunca un bloque oscuro.
- **El contraste se calcula sobre el color compuesto** y es ≥ 5:1. Lo recalcula
  `src/server/lenguaje-visual.test.ts` cada vez que se toca un color.
- Todo el movimiento vive bajo `prefers-reduced-motion: no-preference` y nada
  dura más de 260 ms, salvo las **dos excepciones declaradas del mapa**:
  `--duracion-giro` (480 ms) y `--duracion-relleno` (320 ms por región, 40 ms de
  desfase, total ≤ 1 s), y **la demostración de «Ver ejemplo»** (ADR-021), un
  bucle con `requestAnimationFrame` que con movimiento reducido no arranca y
  deja la figura quieta (partida en tenue, llegada encima).
- **El velo de la ventana modal** es lo único oscuro de la aplicación, y opaco:
  nada de `backdrop-filter` fuera del selector compartido del vidrio.
- Espacio en la escala de tokens (`--e1`…`--e7`) y radios `--r1`…`--r4` y
  `--r-pastilla`; dentro de un componente se admiten ajustes finos de 2 px. Nunca
  un `rem` a ojo.
- El enrutador está escrito a mano en `src/web/estado/ruta.ts`: son rutas fijas
  sin parámetros de camino, y una biblioteca para eso es más superficie que
  problema. El estado de una vista que se quiere compartir va en la consulta
  (`?vista=superior&cara=espalda`). Usa la API de historial, así que **quien sirva
  los estáticos debe devolver `index.html` en cualquier ruta desconocida**: en
  desarrollo lo hace Vite y en ejecución lo hace el propio servidor (ADR-011), que
  además mantiene el 404 de API bajo `/api`.
- El color nunca es el único portador del significado: cada barra lleva nombre y
  valor en texto, y la barra misma va `aria-hidden`. Las barras del resumen usan
  el color de su nivel: los datos tienen su escala, no el acento.
- HTML semántico, etiquetas asociadas a sus campos, foco visible y regiones
  `aria-live` para los mensajes que aparecen después de una acción.
- «Saltar al contenido» es lo primero que alcanza el teclado en el marco, y se
  **ve** al recibir el foco: un enlace oculto a lectores (`solo-lectores`) que
  sigue oculto al enfocarlo deja al teclado sobre algo invisible. Mueve el foco
  con `preventScroll`: un salto por fragmento deja el principio del contenido
  bajo la cabecera fija.
- Móvil primero: se lee en un teléfono antes que en un escritorio.

## El mapa muscular (ADR-018)

- **La figura no calcula.** Cada región se pinta con el `nivel` que manda el
  servidor en el resumen, y la leyenda sale de `escala`. Decidir el nivel desde la
  cadena decimal sería pequeño, y es la puerta por la que el motor acaba duplicado
  (riesgo R10). Lo fija una prueba que pinta nivel 5 con una cifra de 0.00.
- Las regiones llevan el identificador del catálogo base (`data-grupo`) y se
  emparejan con los grupos del usuario por `zona`. Un grupo sin zona sale en «Sin
  lugar en el modelo» con su número: hacerlo desaparecer sería un cero silencioso.
- La figura es `role="img"` con nombre («Mapa muscular, tren superior, espalda»)
  y `aria-describedby` hacia la tabla, que es la alternativa textual completa. Las
  regiones no reciben foco; el teclado llega por los botones de la tabla, que
  resaltan la región.
- Una semana sin series efectivas deja la figura en neutro con la trama y lo dice
  en texto. Nunca una figura de muestra coloreada.
- La escala verde → rojo es de **cantidad**: rótulos que describen volumen,
  nunca «bien» o «mal», y ninguna relación con el rango de cada grupo. La fase 3
  no reutiliza ese rojo con el significado de «déficit».
- **«Comparado con el plan»** (ADR-019) es un control **aparte** («Color»), no una
  opción más de «¿Qué quieres ver?»: si lo fuera, comparar obligaría al cuerpo
  completo. Va a la URL (`?color=plan`) y sólo entonces se pide la comparativa.
  La figura pinta el `estado` que manda el servidor con la escala divergente
  (ámbar, ámbar claro para «pendiente», neutro para «en plan», azul), dice qué
  semana del plan compara —no es la semana natural del resumen— y cita **su
  propia tabla** («hecho de planeado» y la diferencia con signo) como descripción.
  Sin plan, lo dice y no colorea nada.

## La comparativa (fase 3, ADR-019)

- **No resta y no decide.** `delta`, su signo y el `estado` (déficit, superávit,
  en plan, pendiente) llegan del servidor y se enseñan tal cual. Restar dos
  cadenas en el navegador sería la tercera ruta de ejecución del motor.
- **El color nunca va solo**: cada diferencia lleva el número con su signo, un
  icono y la palabra; la barra va `aria-hidden` y la marca de lo planeado es una
  raya, no otra barra. En el teléfono las columnas «Planeado» y «Hecho» se van y
  «hecho de planeado» va bajo el nombre: la diferencia no puede quedar fuera de la
  vista detrás de un desplazamiento horizontal.
- **Escala divergente propia**, ámbar ↔ azul, con sus tokens (`--deficit-*`,
  `--superavit-*`). No reutiliza el rojo del mapa, ni el de peligro, ni el
  acento; se distingue con deuteranopía. Lo comprueba `lenguaje-visual.test.ts`.
- **«Pendiente» no es déficit**: una semana en curso no ha fallado nada todavía.
- El detalle diario se titula **desplazamiento** y dice que lo que cuenta es la
  semana. Nunca «incumplimiento».
- **La simulación se rotula** en un aviso que dice que no se guarda nada y cómo
  adoptarla (cambiar el umbral en el catálogo, que rige desde mañana). El umbral
  simulado va en la consulta (`?umbral=3`), como toda vista que se comparte.
- Una semana que mezcla versiones de parámetros **se declara** con sus fechas.

## Tipos y pruebas

- Los tipos de respuesta que el cliente consume viven en módulos sin nada
  ejecutable —`src/api/lectura/contrato.ts`, `src/api/captura/contrato.ts`—, no
  en el servicio: importar el servicio desde el navegador arrastraría el almacén
  y `node:crypto`.
- Las pruebas del cliente corren en jsdom, no necesitan nada externo y afirman
  sobre lo que se ve y se puede alcanzar con lector de pantalla: una etiqueta, el
  texto de un botón, el contenido de una celda. Nada de instantáneas.
