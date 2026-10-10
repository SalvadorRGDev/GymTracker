# Decisiones de arquitectura (ADR)

Cada pregunta del spec con alternativas excluyentes abre un ADR: contexto,
decisión, alternativas descartadas **con el motivo real** y consecuencias (qué se
vuelve fácil, difícil o caro de revertir). Un ADR superado **no se borra**: se
marca y se conserva, porque el que lo sustituye se apoya en su razonamiento.

El CI falla si existe `src/` y algún ADR está `PENDIENTE`, y falla también si ya
no encuentra ningún ADR que leer: un control que no puede controlar debe fallar,
no aprobar.

| ADR | Tema | Estado |
| --- | ---- | ------ |
| 001 | Plataforma: PWA | SUPERADO POR ADR-008 |
| 002 | PostgreSQL 16 | SUPERADO POR ADR-010 |
| 003 | Cálculo al leer, parámetros versionados, series efectivas | ACEPTADO (enmendado por 013) |
| 004 | Stack | ACEPTADO (despliegue superado por 011; almacén por 010) |
| 005 | «Salud» y calorías fuera | ACEPTADO |
| 006 | Capas y motor centralizado | ACEPTADO |
| 007 | Autenticación con token opaco | ACEPTADO |
| 008 | Captura con Atajos de iOS | ACEPTADO (ampliado por 011) |
| 009 | Credencial de captura y alcances | ACEPTADO |
| 010 | Almacén en libros de Excel | ACEPTADO |
| 011 | Ejecución local, túnel, respaldo por copia | ACEPTADO |
| 012 | Catálogo base sembrado | ACEPTADO |
| 013 | Versión sin fijar se reescribe en sitio | ACEPTADO |
| 014 | Rangos de referencia | ACEPTADO (enmendado por 018) |
| 015 | Plantillas y editor por día del ciclo | ACEPTADO |
| 016 | Vidrio sobre lienzo | ACEPTADO (enmendado por 017) |
| 017 | Dirección visual moderna | ACEPTADO (paleta y modo enmendados) |
| 018 | Mapa muscular del resumen y su escala | ACEPTADO |
| 019 | Comparativa: ventana desde el ancla y línea semanal del atajo | ACEPTADO (enmienda al 009) |
| 020 | Alta pública con tope | ACEPTADO (enmienda al 007) |
| 021 | «Ver ejemplo»: figuras animadas propias | ACEPTADO |
| 022 | «Registrar» empieza por la rutina del día | ACEPTADO (enmendado por 026) |
| 023 | Las cargas, en libras | ACEPTADO (enmienda la unidad canónica del Plan) |
| 024 | Historial: área, carga media y progreso por sesión | ACEPTADO (matiza el ADR-003) |
| 025 | Gráficas del historial: músculos por semana y fuerza estimada | ACEPTADO |
| 026 | Un día elegido de la rutina se registra en su fecha | ACEPTADO (enmienda al 022) |

---

## ADR-001 — Plataforma de captura: PWA

**Estado**: SUPERADO POR ADR-008

**Contexto.** Captura entre series, a veces sin cobertura, en un iPhone.

**Decisión.** PWA instalable con captura *offline-first*: service worker, cola en
IndexedDB, Screen Wake Lock, steppers `+/-`.

**Disparadores declarados por los que dejaría de bastar en iOS**: recordatorios,
HealthKit, desalojo del almacenamiento, sincronización en segundo plano. Los
cuatro son del sistema operativo, y el ADR-008 los resuelve sin escribir cliente.

**Queda como plan B escrito** para Android (§19.5 del plan).

## ADR-002 — PostgreSQL 16

**Estado**: SUPERADO POR ADR-010

PostgreSQL con Row Level Security, cuatro roles, funciones `SECURITY DEFINER`,
migraciones reversibles, 63 afirmaciones SQL en 43 casos. Se construyó entero.
Lo que de verdad hacía el motor era **aplicar invariantes**; el ADR-010 los
repone uno a uno en `src/almacen/invariantes.ts`. Sigue descartada la
idempotencia por «usuario y fecha lógica»: impide entrenar dos veces el mismo día.

## ADR-003 — Cálculo al leer, parámetros versionados, series efectivas

**Estado**: ACEPTADO (enmendado por ADR-013)

**Métrica.** Series efectivas por grupo muscular y semana. Una serie cuenta si no
es de calentamiento y su RIR es ≤ el umbral de la versión de parámetros que fija
su sesión; aporta a cada grupo su coeficiente.

**Por qué conteo y no una función continua.** Es la unidad en la que se escriben
las recomendaciones y los planes («12 de 16»). Carga × repeticiones × RIR cuenta
la intensidad dos veces. El tonelaje queda como métrica secundaria, nunca como
estímulo.

**El motivo real del umbral binario.** Un umbral no «absorbe» el error del RIR:
lo concentra en la frontera. Se prefiere por razones empíricas (así se escriben
los estudios) y por eso se vigila (riesgo R6).

**Cálculo al leer.** No se guarda ningún agregado: sería un segundo sitio donde
vive la verdad. Si el rendimiento lo pidiera, la salida es una caché derivada y
descartable.

**Versionado.** Umbral y coeficientes viven en `version_parametros` con vigencia;
cada sesión guarda un puntero inmutable (pin) a la versión con que se lee.
Editar cierra la vigente y crea la sucesora desde mañana. **Asimetría
declarada:** el versionado protege cambios de DATO, no de código; un error del
motor se corrige para todo el histórico, y un cambio de fórmula pide su ADR.

## ADR-004 — Stack

**Estado**: ACEPTADO (el despliegue lo supera el ADR-011; el almacén, el ADR-010)

TypeScript `strict` (tipos marcados `Centesimas`, `FechaLogica`), Node ≥ 22.9,
Fastify 5 (validación en la ruta), TypeBox, `@node-rs/argon2`, Preact + Vite,
CSS propio, Vitest (+ jsdom), Biome, `tsc --noEmit` en `lint`.

**Nota (ADR-010).** El almacén no usa `exceljs`: se escribió `src/almacen/xlsx.ts`
sobre `fflate`, porque las librerías de hojas de cálculo convierten celdas «por
amabilidad» (`"12.50"` → `12.5`, fechas → `Date`).

Seis dependencias de ejecución: `fastify`, `@fastify/static`,
`@sinclair/typebox`, `@node-rs/argon2`, `fflate`, `preact`. Una séptima se
justifica en su commit.

## ADR-005 — «Salud» y calorías fuera de alcance

**Estado**: ACEPTADO

«Salud» no nombra una cantidad medible. El gasto por MET tiene una banda de
error (±33 %) más ancha que cualquier decisión que se tomaría con él. Reapertura:
definición operativa, medición con error acotado y que el número ordene una
acción mejor que sus componentes. Si vuelve el gasto calórico, calibrado desde
tendencia de peso e ingesta, nunca por MET.

## ADR-006 — Capas y motor centralizado

**Estado**: ACEPTADO

Presentación (web, atajos) → aplicación (`src/api`, `src/auth`, `src/server`) →
dominio (`src/domain/volume`, puro) y almacén (`src/almacen`). Las dependencias
apuntan hacia dentro; una prueba comprueba la pureza del motor.

**El motor está centralizado porque la comparativa es una RESTA.** El plan se
expande a la misma forma de entrada que lo ejecutado (`expandePlan`) y pasa por
la misma `agrega`: una diferencia entre los dos lados sólo puede venir del
gimnasio, no de dos implementaciones que redondean distinto.

## ADR-007 — Autenticación con token opaco

**Estado**: ACEPTADO

Token de 32 bytes en cookie `HttpOnly; Secure; SameSite=Strict`; en el almacén
sólo su `HMAC-SHA256(SESSION_SECRET, token)`. 30 días deslizantes, máximo
absoluto de 90. Revocación inmediata borrando la fila. Argon2id. Sin registro
público: `npm run alta`. **No JWT**: su ventaja es no consultar el almacén, y aquí
se consulta igual; a cambio la revocación dejaría de ser inmediata.

## ADR-008 — Captura con Atajos de iOS

**Estado**: ACEPTADO (ampliado por ADR-011: captura web)

No escribir cliente de captura: la app Atajos ya está en el teléfono, lanza sin
desbloquear, lee Salud y tiene automatizaciones. Un atajo **es** una serie:
pregunta, escribe en un archivo, envía, termina. Precio: no se prueba en CI, no
se actualiza en remoto, un diálogo por campo, sólo iOS, y la web no ve la cola
(de ahí la **frescura** en vez de «pendientes»).

## ADR-009 — Credencial de captura y alcances

**Estado**: ACEPTADO

Tabla propia `token_captura` (no una columna de alcance compartida: olvidar el
filtro autenticaría). Portador `Authorization: Bearer`, huella
`HMAC(SESSION_SECRET, 'captura:' + token)`, un año fijo, emitida desde la web y
mostrada una sola vez. En el teléfono vive en `credencial.json`, nunca dentro del
atajo. `ALCANCE_DE_HOJA` dice por afirmación qué puede cada alcance: `captura`
escribe sesiones, series y mediciones, lee catálogo y parámetros y sus propias
escrituras de los últimos treinta días; no lee planes, no exporta y no borra.

## ADR-010 — Almacén en libros de Excel

**Estado**: ACEPTADO

Un `.xlsx` por propietario más `cuentas.xlsx`. Requisito: poder abrir los datos
en Excel, coste cero, dos personas. Toda celda es texto; se valida al cargar
(hoja, fila, columna); una columna u hoja desconocida detiene la carga; no se
escribe encima de una edición ajena; escritura atómica, en fila india y con
respaldo previo. Invariantes en un único módulo, sobre el antes y el después.
**Lo que se pierde, dicho:** la defensa en profundidad de RLS (ahora el
aislamiento es de diseño) y la escala (nada de esto sobrevive a diez usuarios
concurrentes). Salida anotada si hiciera falta: SQLite, sin cambiar el modelo.

## ADR-011 — Ejecución local, túnel y respaldo por copia

**Estado**: ACEPTADO

Un proceso de Node sirve API y cliente, escucha en `127.0.0.1` y lo publica un
túnel gratuito (Cloudflare Tunnel o Tailscale). Las plataformas gratuitas se
descartan por **disco efímero**. Respaldar es copiar; restaurar es copiar de
vuelta, y la prueba de restauración corre en cada push. Añade la **captura web**
(`/api/registro/v1`) para quien no tenga iPhone o cuando el servidor estuvo
apagado: mismas funciones, otra credencial.

## ADR-012 — Catálogo base sembrado

**Estado**: ACEPTADO

El proyecto se quedó parado donde había que teclear una matriz de 1 920
coeficientes. Catálogo base en JSON dentro del repo (16 grupos, 182 ejercicios,
5 perfiles, 5 plantillas, rangos con fuentes), importado **por identificadores**
cuando el usuario lo pide, idempotente y sin pisar ajustes. Es semilla, no
autoridad.

## ADR-013 — La versión que nadie fija se reescribe en sitio

**Estado**: ACEPTADO

Efecto descubierto: el «0.00 del primer día» (la sesión de hoy fijaba la versión
vacía y la importación regía desde mañana). Una versión que **ninguna** sesión
fija no participa en ninguna lectura histórica: guardar la reescribe en sitio y
conserva su vigencia. Una versión fijada por una sesión futura rechaza el cambio
con una explicación.

## ADR-014 — Rangos de referencia

**Estado**: ACEPTADO (enmendado por ADR-018)

Series semanales por grupo publicadas (general 10–20) y dos bandas propias
declaradas como tales (indirecto 6–16, directo-barato 8–22). Referencia, no
objetivo ni nota: el texto dice «dentro», «por debajo» o «por encima»; sin
puntuación, sin porcentaje y **sin semáforo**. El veredicto se decide en
aritmética entera. Se pueden ocultar.

## ADR-015 — Plantillas y editor por día del ciclo

**Estado**: ACEPTADO

Cinco plantillas que dejan los 16 grupos dentro de su banda **calculado con el
motor real** (prueba de datos). El editor trabaja por día del ciclo; el volumen
del borrador **se lee** del servidor (`GET /versiones/:id/volumen`), nunca se suma
en el navegador. Guardar reemplaza la versión entera y la pantalla lo dice.

## ADR-016 — Vidrio sobre lienzo

**Estado**: ACEPTADO (enmendado por ADR-017)

Tres capas (lienzo con luz, superficies de vidrio, contenido nunca translúcido),
una receta aplicada desde un selector compartido, tres apagados
(`prefers-reduced-transparency`, `prefers-contrast: more`, `@supports not
(backdrop-filter)`) que reescriben tokens, movimiento ≤ 260 ms sólo con
`prefers-reduced-motion: no-preference`, contraste ≥ 5:1 calculado sobre el
color compuesto, un tono verde que manda, nunca vidrio en filas.

## ADR-017 — Dirección visual moderna

**Estado**: ACEPTADO (paleta y modo enmendados el 28/09/2026)

**Contexto.** El usuario pidió un lenguaje visual moderno, analizado con el
enfoque *modern SaaS* (Linear, Stripe, Notion): base clara, títulos editoriales,
tarjetas limpias y microanimaciones con propósito (§19.6 del plan). El enfoque
está pensado para páginas de venta; aquí se adopta pieza a pieza.

**Decisión.** Las cinco preguntas que el enfoque obliga a cerrar, con lo elegido:

| Pregunta | Decisión |
| -------- | -------- |
| Paleta | Familia verde actual; el verde vivo `#5EA832` sólo decora (con texto blanco no llega a 5:1). Botones en el verde profundo `#1C6340`. |
| Títulos | Editorial: Playfair Display sólo en `h1`/`h2`. Nunca en cifras: los números van en Inter con `tabular-nums`. |
| Modo | Claro por omisión; el oscuro se conserva por tokens. |
| Vidrio | Sólo en la cabecera fija y en el detalle flotante del mapa, desde un selector compartido. Tarjetas y paneles: blancos, borde de 1 px, sombra suave, sin vidrio. |
| Iconos | SVG de Lucide copiados como datos (licencia ISC), sin `lucide-preact`. |

Además: fuentes **alojadas en el repositorio** (OFL), no en Google Fonts (cada
visita avisaría a un tercero de que alguien abre una app de datos de salud, y no
funcionaría sin internet). Insignia de frescura con punto que late sólo si el
dato es de hoy. Fila de estadísticas **estática** con cifras del contrato
(el contador que sube desde cero enseñaría números que no son los del servidor).
Trama diagonal en el panel de la figura y en los vacíos, **nunca detrás de un
número**. Sin hero de venta, logos, precios ni testimonios; el acceso toma el
formato de hero con la silueta sin colorear. Líneas discontinuas decorativas en
los bordes de la columna.

**Enmiendas al ADR-016.** El vidrio queda en dos sitios. La escala de radios
crece a `--r4` (20 px) y `--r-pastilla`; el espacio sigue en la escala de 8 px
(`--e1`…`--e7`) y, dentro de un componente, se admiten ajustes finos de 2 px.
**Dos excepciones de movimiento, únicas y declaradas, sólo en el mapa**:
`--duracion-giro` 480 ms (un giro de 180° en 260 ms se ve brusco) y
`--duracion-relleno` 320 ms por región con 40 ms de desfase (el total no pasa de
un segundo y la cifra está en la tabla desde el principio).

**Se conservan intactos** los tres apagados, el contraste calculado ≥ 5:1 y «el
color nunca es el único portador del significado». Los comprueba
`src/server/lenguaje-visual.test.ts`.

**Alternativas descartadas.** Tailwind u otro framework CSS (dependencia y
vocabulario ajeno); quitar el vidrio del todo (el usuario pidió conservar
«toques de liquid glass»); Google Fonts (privacidad y dependencia de red).

**Consecuencias.** Fácil: todo sale de tokens, y el modo oscuro es redefinirlos.
Difícil: cualquier color de fondo nuevo obliga a pasar la prueba de contraste.
Caro de revertir: nada; es presentación.

**Enmienda (28/09/2026): paleta clara en azules y sin modo oscuro.** El usuario
pidió tonos claros, sin nada oscuro, y después volver a los azules. Queda:
**siempre clara** (`color-scheme: light`; el modo oscuro se retira y una prueba
lo impide), lienzo blanco azulado con veladuras azules, tarjetas blancas y
neutros cálidos, texto en grafito. **El verde deja de mandar**: el acento es
pastel, pervinca claro con tinta índigo encima (nunca un bloque oscuro), y el
índigo `#3A45B0` marca enlaces y selección. Todo lo demás del ADR sigue. Los
valores, en `docs/10-lenguaje-visual.md`.

## ADR-018 — Mapa muscular del resumen y su escala de color

**Estado**: ACEPTADO

**Contexto.** En el Resumen, junto a los números, el usuario pidió un modelo de
una persona con los músculos coloreados según el trabajo de la semana: un
desplegable «¿Qué quieres ver?»; con «Tren superior», las opciones Frente y
Espalda; al elegir Espalda la figura se da la vuelta con una animación; los
músculos se van coloreando; debajo, una barra de rangos de color de verde muy
claro a naranja y rojo, con la explicación de cada tramo.

**Decisión.**

- **La figura no calcula.** El servidor añade, de forma aditiva, a cada grupo del
  resumen `nivel` (0–6, aritmética entera sobre las centésimas del motor: 11.99 es
  nivel 3 y 12.00 es nivel 4) y `zona` (identificador del catálogo base si el
  nombre coincide por `trim().toLowerCase()`, o `null`), y al resumen `escala`
  (fuente única de la leyenda) y `estadisticas`. Los cortes son presentación, no
  parámetros de la métrica: no se versionan y viven en `src/api/escala.ts`.
- **Siete niveles** por series efectivas de la semana: 0 (sin trabajo, trama sin
  relleno), <4, 4–8, 8–12, 12–16, 16–20 y 20 o más. Cortes absolutos y a la vista,
  como la leyenda de un mapa; el rojo empieza donde termina el rango publicado
  general.
- **Luminancia monótona**: en claro baja siempre de nivel en nivel (≈ 0.86 → 0.10),
  así que en gris se lee igual y no depende del par rojo-verde; en oscuro se
  invierte (el nivel 1 cerca del fondo). Lo comprueba una prueba.
- **Figura propia**: dos siluetas estilizadas, neutras en cuanto a sexo, dibujadas
  en el proyecto (`src/web/componentes/figura/rutas.ts`), con regiones etiquetadas
  con los 16 identificadores del catálogo base. Giro 3D en CSS puro; encuadres
  (cuerpo completo, tren superior, tren inferior) animando el `transform`, no el
  `viewBox`; relleno en secuencia de arriba abajo. Con movimiento reducido no hay
  giro y el color aparece ya puesto.
- **Accesibilidad**: la figura es `role="img"` con nombre («Mapa muscular, tren
  superior, espalda») y `aria-describedby` hacia la tabla, que es la alternativa
  textual completa. La elección de vista va a la URL (`?vista=superior&cara=espalda`).
- **Grupos sin lugar** (renombrados o propios) se listan bajo la figura con su
  número; hacerlos desaparecer sería el cero silencioso.

**La tensión, dicha de frente.** Una rampa verde → rojo se lee culturalmente como
un semáforo, y el ADR-014 prohíbe el semáforo para los rangos. Se acepta porque
el usuario la pide y porque se mantiene como **escala de cantidad**: rótulos que
describen volumen (nunca «bien» o «mal»), la cifra siempre junto al color, la
leyenda explicada y ninguna relación con el rango de cada grupo. **Alternativa
descartada:** un solo tono (verde claro → oscuro), más neutra y menos expresiva.
**Para la fase 3:** la comparativa no reutilizará este rojo con otro significado
(«déficit»); usará una escala divergente de otros tonos.

**Consecuencias.** El contrato del resumen crece de forma aditiva; ningún cliente
viejo se rompe. `src/domain/volume/` no cambia: si el nivel pasara a formar parte
del cálculo, iría allí con sus pruebas.

## ADR-019 — Comparativa: ventana desde el ancla y línea semanal del atajo

**Estado**: ACEPTADO (enmienda al ADR-009)

**Contexto.** La fase 3 es la resta de lo ejecutado menos lo planeado. Dos cosas
quedaban por decidir: qué semana se compara, y cómo llega al teléfono la línea
semanal que pide el §17.1 («pectoral 12 de 16») sin que el atajo calcule.

**Decisión.**

- **La ventana es la semana del plan, contada desde el ancla** de su asignación
  (`ventanasDeComparacion`, en el motor). Un plan asignado un jueves compara de
  jueves a miércoles; la semana natural partiría un ciclo en dos. Una asignación
  cerrada a mitad deja su última ventana corta (se dice cuántos días tiene) y la
  siguiente cuenta desde su propio ancla. Sin asignación no hay ventana.
- **Cada ventana contra el plan vigente entonces**, y el lado planeado se expande
  con la versión de parámetros de **cada día**, que es la que fija una sesión de
  ese día. Si en la ventana rige más de una, se declaran todas.
- **El signo siempre escrito** («+2.00», «-1.50») y el estado lo decide el
  servidor: `deficit`, `superavit`, `en-plan` y `pendiente`, que es el déficit de
  una semana que no ha terminado. El detalle diario se rotula **desplazamiento**.
- **Simulación** con `?umbral=`: el mismo cálculo con otro umbral para todas las
  versiones, rotulado y sin escribir. Adoptarlo es cambiar los parámetros.
- **Vigilancia del umbral** (R6) en el motor (`vigilaUmbral`): de las series
  efectivas de las últimas doce semanas, cuántas tienen el RIR en
  `[umbral − 1, umbral]`. Dispara con **más del 15 %** y **30 efectivas o más**;
  las dos cifras son convenciones declaradas.
- **Línea semanal del atajo**: `GET /api/captura/v1/semana`, una ruta **nueva**
  del contrato de captura (aditiva). Para calcularla, el alcance `captura` gana
  **lectura** —sólo lectura— de `plan`, `plan_version`, `plan_entrada` y
  `plan_asignacion`. **Enmienda al ADR-009**, que decía que el atajo no lee
  planes: sigue sin haber bajo `/api/captura` ninguna ruta de planes, y el
  portador sigue sin poder escribirlos, exportar ni borrar.

**Por qué la enmienda es aceptable.** Lo que un portador robado ya puede leer
—catálogo, parámetros y treinta días de sesiones, series y peso corporal— es más
sensible que un plan de entrenamiento. Leer el plan añade poco, y la alternativa
—que el servidor leyera con alcance `sesion` en una ruta de captura— rompería la
regla de que el alcance lo fija la ruta y nunca se escala.

**Alternativas descartadas.** Semana natural (parte los ciclos y castiga mover un
entreno del domingo al lunes); ventana móvil de siete días (el mismo entreno
entra y sale según el día en que se mire); guardar la línea calculada (un
agregado guardado es un segundo sitio donde vive la verdad).

**Consecuencias.** Revertir la línea del atajo es quitar la ruta y las cuatro
entradas de lectura de `ALCANCE_DE_HOJA`; nada más depende de ellas.

## ADR-020 — Alta pública con tope

**Estado**: ACEPTADO (enmienda al ADR-007)

**Contexto.** El ADR-007 dejó las cuentas en `npm run alta`: una persona teclea
la contraseña de otra en la máquina del servidor. Con el servidor publicado en
internet (Funnel) y amigos que quieren entrar, ese paso manual no funciona.

**Decisión.** `POST /api/sesion/v1/alta` crea la cuenta desde la web, **sólo si
`ALTA_ABIERTA=si`** (cerrada por omisión). Protecciones, en este orden:

1. **Límite antes de nada caro**: 3 altas por IP y hora y un techo global de 10
   por hora, antes de Argon2 y del disco. El global frena a quien reparte la
   avalancha entre muchas IP.
2. **Validación con motivo**: correo con forma, contraseña de 12 a 128
   caracteres (el tope evita trabajo de Argon2 desproporcionado) y que no
   contenga el usuario del correo, zona IANA válida.
3. **Tope de cuentas** (`MAXIMO_DE_CUENTAS`, 20 por omisión): cada cuenta es un
   libro en disco; sin tope, internet llenaría el disco.
4. Correo repetido → 409 sin tocar la cuenta existente. Revela que el correo
   existe; se acepta porque el límite por IP lo hace lento y el acceso sigue
   contestando igual exista o no.
5. Al crearla, entra: cookie como en «Entrar».

`GET /api/sesion/v1/alta` dice sólo si se puede registrar, nunca cuántas cuentas
hay.

**Alternativas descartadas.** Código de invitación compartido y enlaces de un
solo uso: más seguros frente a desconocidos, pero el dueño eligió abierto con
tope. Verificar el correo: exige un servicio de envío (coste y terceros).

**Consecuencias.** Cualquiera con el enlace puede ocupar plazas hasta el tope;
el dueño lo vigila con `npm run verifica` y retira cuentas con `npm run baja`.

## ADR-021 — «Ver ejemplo»: figuras animadas propias

**Estado**: ACEPTADO

**Contexto.** En el catálogo, quien no conoce un ejercicio no sabe qué está
importando. El usuario pidió, junto a cada nombre y su casilla, un botón «Ver
ejemplo» de otro color que abra una ventana emergente: la página se oscurece y en
el centro queda el vídeo del ejercicio, con un botón «Cerrar» abajo. Eligió
**animaciones propias** frente a vídeos o imágenes de terceros.

**Decisión.**

- **Figura propia en SVG, animada con código.** Un maniquí de proporciones
  humanas en tres dimensiones proyectado por una cámara ortográfica
  (`src/web/componentes/demostracion/`). Cada pose dice dónde está la pelvis,
  cómo va el tronco y adónde llegan manos y tobillos; codos y rodillas los
  resuelve una cinemática inversa de dos segmentos, así una barra que sube recto
  sube recto y un pie apoyado no patina. Entre poses, recto, por un punto de paso
  o en arco alrededor de una articulación (un curl gira alrededor del codo).
- **Una figura para cada uno de los 182 ejercicios**, asignada por identificador
  en una tabla (`ejemplos.ts`): unas noventa animaciones con variantes de
  material (barra, mancuernas, polea, banda, máquina, Smith, anillas) y de
  apoyo. La tabla, no una deducción por nombre, para que una prueba exija
  cobertura completa y ninguna entrada huérfana. Lo que la figura no puede
  enseñar (el agarre) lo dice una nota.
- **La ventana es el `<dialog>` nativo** en modo modal: velo oscuro opaco
  (`--velo`, sin desenfoque: el vidrio sigue en dos sitios), foco en «Cerrar» al
  abrir y de vuelta a «Ver ejemplo» al cerrar; se cierra con «Cerrar», Escape o
  pulsando fuera. Enseña cómo se hace en una frase para quien no lo ha hecho
  nunca, qué músculos trabajan (de los coeficientes: principal, ayudan, un poco)
  y el material.
- **Movimiento**: es la tercera excepción declarada (docs/10). Un bucle con
  `requestAnimationFrame` de unos tres segundos por repetición, sólo con
  `prefers-reduced-motion: no-preference` y sólo mientras la ventana está
  abierta. Con movimiento reducido la figura queda quieta: la posición de partida
  en tenue y la de llegada encima.
- **Carga diferida**: las poses viven en un módulo aparte (≈ 23 kB comprimido)
  que se pide al abrir la primera ventana.

**Alternativas descartadas.** Vídeos o GIF de terceros: dependencia externa, la
política de contenido (`default-src 'self'`) los bloquearía, cargarían desde
fuera a cada apertura y no hay licencia clara. Vídeos grabados en el proyecto:
cientos de megas en el repositorio. Una sola figura genérica por patrón: más
barata, pero enseñaría un press de banca a quien pregunta por una máquina.

**Consecuencias.** Las poses son datos escritos a mano; un error de tecleo se ve
en la figura, no en el cálculo. Lo vigila `demostracion.test.ts`: que manos y
tobillos lleguen a su objetivo en todo el recorrido, que ningún segmento cambie
de largo, que nada atraviese el suelo y que cada bucle cierre sin saltos. Nada
de esto toca el motor ni el almacén.

**Ampliación: una figura que se lea como un maniquí de gimnasio.** Tras la
primera versión, el usuario pidió arreglar los fallos de las animaciones y darles
más oficio. Se decidió:

- **Volumen en vez de palotes.** El tronco son secciones elípticas (cadera,
  cintura, pecho, hombros) con el trapecio como ladera del cuello al hombro;
  brazos y piernas, masas que se estrechan; la cabeza lleva mentón. Luz de arriba
  a la izquierda, el lado lejano más claro y un filo del color del escenario en
  cada pieza. Bajo lo que toca el suelo, una mancha de contacto.
- **Los músculos del ejercicio, en la figura.** Coral lo que trabaja sobre todo
  (1.00) y melocotón lo que ayuda (0.50), **tomados de los coeficientes del
  catálogo base**, los mismos que la ventana nombra en texto: la figura no inventa
  qué trabaja. Cada región del tronco pinta sólo la parte que mira a la cámara.
- **La cámara se elige por lo que trabaja**: tres cuartos por delante por
  omisión y tres cuartos por detrás para espalda, glúteo y deltoides posterior.
- **Material con volumen y máquinas que se entienden**: discos, manguitos,
  mancuernas y rodillos son cilindros con tapa; las palancas giran donde gira la
  articulación (encima del hombro en el pec deck, en la cadera en el crunch, por
  detrás del hombro en las laterales) y las máquinas guiadas suben por su poste,
  así que nada se estira ni atraviesa la cara.
- **Fallos corregidos**: pies que daban media vuelta con el tronco muy
  inclinado, rodillas y puntas que cambiaban de lado de golpe al pasar de una pose
  sin polo a otra con él, y una lista de cruces entre cuerpo y material revisada
  a mano, figura por figura.

`demostracion.test.ts` añade que ninguna articulación salte entre dos de 360
muestras por vuelta (más de 5 unidades es un pie que se da la vuelta), que cada
grupo del catálogo tenga sitio en la figura, que lo que trabaja sobre todo mire a
la cámara en algún momento y que una región de la espalda no se pinte vista de
frente. Los colores los vigila `lenguaje-visual.test.ts`. Sigue sin tocar el
motor ni el almacén, y el módulo diferido de las poses pasa a unos 24 kB
comprimidos.

**Ampliación: «Ver ejemplo» donde se elige un ejercicio.** El usuario pidió el
botón también al archivar, al armar una rutina y al registrar. Va en la lista del
catálogo base (importar), en «Tus ejercicios» (archivar), en cada entrada de
ejercicio del editor de rutinas, junto al selector de «Registrar» y en cada fila
de la rutina del día. Un ejercicio del usuario se empareja con el del catálogo
base **por su nombre normalizado** (`ejercicioBasePorNombre`, el mismo criterio
que `zona` en el ADR-018) y el catálogo lo manda como `base_id`. Uno propio o
renombrado no tiene figura y no enseña el botón: enseñar la de otro ejercicio
sería inventar. Junto a un desplegable el botón es compacto —sólo el icono, en
44 × 44— y su nombre accesible sigue siendo «Ver ejemplo de …».

## ADR-022 — «Registrar» empieza por la rutina del día

**Estado**: ACEPTADO (enmendado por ADR-026: un día elegido se registra en su
fecha)

**Contexto.** Registrar era buscar cada ejercicio en el catálogo entero y
guardar serie a serie. El usuario pidió que lo predeterminado fuera su rutina
publicada: un desplegable con las rutinas, en la lista sólo los ejercicios del
día que toca («si es lunes, los del lunes») y, abajo, una búsqueda manual para
añadir otro; que la pantalla lo indique y dé retroalimentación.

**Decisión.**

- **Una lectura nueva, `GET /api/registro/v1/rutina`, decide en el servidor**
  la fecha que manda (la del entrenamiento abierto si ya existe; si no, hoy en
  la zona de la cuenta), la asignación que la cubre, el día de su ciclo
  (contado desde el ancla, como la comparativa) y lo que pide ese día.
  `?version=` y `?dia=` enseñan otra rutina publicada u otro día; un borrador es
  409 `borrador` y un día fuera del ciclo, 422 `dia`. Con un ciclo que no es de
  siete días, «lunes» no es siempre el mismo día de la rutina: la pantalla dice
  «día 2 de 4».
- **El progreso lo cuenta el motor, en la unidad de la rutina** (series
  efectivas). Por ejercicio, sus series efectivas del día: `seriesEfectivas` de
  `agrega`, que cuenta entradas, y para lo registrado una entrada es una serie.
  Por grupo, el volumen del grupo en el día (`volumenDe`) con los ejercicios que
  no tienen fila propia ese día: lo de la lista ya cuenta en su fila. `completa`
  lo decide el servidor. Una serie que no cuenta ya lo dice el mensaje de
  siempre al guardarla («RIR 5 por encima de tu umbral…»).
- **Guardar no cambia.** La serie se guarda igual y no recuerda de qué rutina
  salió: la comparativa compara por grupo y semana, y hacer el día 1 en martes
  es desplazamiento, no incumplimiento. Ningún cambio de esquema en el almacén,
  y los atajos del iPhone siguen como estaban.
- **La pantalla**: arriba, la rutina (la última publicada de cada una, la
  asignada primero) y el día, con la elección a mano en la consulta
  (`?rutina=…&dia=…`); un aviso que dice qué se ve y por qué —hoy toca el día N de
  M de «X», es descanso, no hay rutina, o «no es el de hoy» con «Volver a la de
  hoy»—; la lista del día con «hechas de objetivo» y «Hecho»; un objetivo por
  grupo se despliega con los ejercicios del catálogo que lo trabajan (1.00 o
  0.50) sin los que tienen fila propia. Debajo, la búsqueda libre de siempre,
  rotulada, con un aviso cuando lo elegido no está en la lista del día. Tras
  guardar, lo elegido se queda —casi siempre sigue otra serie de lo mismo— y el
  progreso se vuelve a pedir; con el día completo, la pantalla invita a terminar
  el entrenamiento.

**Alternativas descartadas.** Guardar en cada serie la entrada de rutina de la
que salió: daría un progreso por entrada sin reglas, pero es un cambio de esquema
y una segunda verdad sobre lo que ya dicen el ejercicio y la fecha. Contar
cualquier serie de trabajo: no es la unidad de la rutina y enseñaría como hecha
una serie que el motor no cuenta. Enseñar en un objetivo por grupo todo el
volumen del grupo en el día: contaría dos veces lo que ya tiene su fila.
Deducir el día en el navegador: convertiría fechas lógicas y partiría el
entrenamiento de medianoche.

**Consecuencias.** Una lectura más por serie guardada. `rutina.integracion.test.ts`
fija el día desde el ancla y su rotación, la fecha del entrenamiento abierto, qué
cuenta como hecho (efectivas, la frontera del umbral, calentamientos,
coeficientes, sin contar dos veces) y los rechazos; `registrar.test.tsx`, lo que
se ve, lo que se avisa y lo que va a la consulta.

## ADR-023 — Las cargas, en libras

**Estado**: ACEPTADO (enmienda la unidad canónica del Plan, §7.3)

**Contexto.** El almacén guardaba la carga en kilos (`carga_kg`) y el Plan
preveía la conversión a libras sólo en presentación. En el gimnasio del usuario
discos, mancuernas y poleas marcan libras: cada serie se convertía de cabeza
antes de capturarla, y ese paso es justo donde entra un error que nadie detecta
después. El usuario decidió que **todo vaya en libras salvo el peso corporal**,
que en México y en toda Latinoamérica se mide en kilos y no es un dato del
gimnasio.

**Decisión.**

- **La carga se guarda en libras**: la columna de `serie` pasa a `carga_lb`, de
  0 a 2500 con dos decimales (cubre el tope anterior de 1000 kg, que son
  2204.62 lb). `peso_kg` de `medicion_corporal` no cambia, ni en el almacén ni en
  la captura ni en la pantalla.
- **Factor exacto y aritmética entera.** Una libra son 0.45359237 kg por
  definición, así que lb = kg × 100000000 / 45359237 sobre centésimas enteras,
  redondeado una sola vez a la centésima de libra, a la mitad par
  (`librasDesdeKilos`, en el motor puro). 60 kg son 132.28 lb.
- **Un libro anterior se convierte al cargarlo.** El lector lee `carga_kg` como
  `carga_lb` con el valor convertido (`RENOMBRADAS_DEL_LIBRO`, en
  `src/almacen/esquema.ts`) y la siguiente escritura lo deja en la forma nueva,
  después de la copia previa de siempre. Un libro con las dos columnas detiene la
  carga —no se sabría cuál vale— y una celda de `carga_kg` ilegible falla con
  hoja, fila y columna, como cualquier otra. Es la única vía de carga de un libro
  de usuario, así que `npm run verifica` y un respaldo restaurado pasan por ella.
- **Contrato aditivo (riesgo R7).** La captura recibe `carga_lb` y, para los
  atajos ya instalados, sigue aceptando `carga_kg`: la convierte y la
  notificación lo dice («60 kg = 132.28 lb (actualiza el atajo…)»). Exactamente
  una de las dos; las dos o ninguna es un 400. La web y las lecturas sólo hablan
  de `carga_lb`.
- **El volumen no cambia**: las series efectivas no miran la carga.

**Alternativas descartadas.** Conservar kilos y convertir en presentación, lo
que preveía el Plan: la ida y vuelta no devuelve lo tecleado (135 lb → 61.23 kg →
134.99 lb), y lo que se guarda debe ser lo que se tecleó. Una preferencia de
unidad por cuenta: con dos unidades en el almacén cada lectura tiene que
preguntar cuál, y nadie la pidió. Un script aparte que reescriba los libros: un
paso más que olvidar, y un respaldo viejo restaurado volvería a traer kilos;
convertir al cargar cubre los dos casos.

**Consecuencias.** La conversión de un libro viejo es de ida: volver a kilos no
reproduce exactamente el original. Las copias previas a cada escritura guardan el
libro tal como estaba y la poda conserva siempre la primera de cada día, así que
al menos una copia en kilos sobrevive; aun así, antes de arrancar el servidor
nuevo sobre el almacén real conviene un respaldo completo (`deploy/respaldo.sh`).
Lo fijan `unidades.test.ts`, `almacen.test.ts` («libros anteriores a las
libras») y `captura.integracion.test.ts`.

## ADR-024 — Historial: área, carga media y progreso por sesión

**Estado**: ACEPTADO (matiza el ADR-003)

**Contexto.** El historial era una lista de sesiones con sus series crudas y sin
páginas. El usuario pidió una tabla: sesión (fecha), área (tren superior, tren
inferior o cuerpo completo), series efectivas, carga media en libras y una
evaluación de −10 a +10 frente a la sesión anterior de la misma área, de diez en
diez con botones numerados abajo. Las gráficas quedan para después.

**Decisión.**

- **Área** (`areaDe`, en el motor). Cada grupo del catálogo base lleva su región
  (superior, inferior o centro), y un grupo del usuario la toma por su nombre,
  como la `zona` del ADR-018. Una sesión es de tren superior si se lleva al menos
  2/3 de las series efectivas que fueron a un tren o al otro; de tren inferior,
  igual; si no, cuerpo completo. El centro —abdomen, lumbares— y un grupo que no
  está en el catálogo base no inclinan la balanza, y una sesión sin nada en los
  dos trenes no tiene área.
- **Series efectivas**: las de `agrega` para esa sesión, el mismo número que
  cuenta la semana.
- **Carga media**: la de las series de trabajo con carga —sin calentamientos ni
  peso corporal—, a la décima. Dice qué cargas se movieron y no compara nada:
  cambia con los ejercicios que se hicieron.
- **Progreso** (`progreso`, en el motor). Por cada ejercicio de la sesión que
  también estuvo en la anterior de su área, su mejor serie frente a la de
  entonces. La marca de una serie con carga es la fórmula de Epley con el RIR,
  carga × (1 + (repeticiones + RIR) / 30), porque repeticiones + RIR son las que
  se podían hacer; sin carga, repeticiones + RIR a secas. Un ejercicio con carga
  en una sesión y sin ella en la otra no se compara. El cambio medio pesa cada
  ejercicio por sus series de trabajo de hoy y da **un punto por cada 1 %**, a la
  mitad par, con tope en ±10. Sin ejercicios en común no hay número: «—» con el
  motivo, nunca un cero. Aritmética entera; el /30 se cancela al dividir.
- **Nada se guarda.** Se calcula al leer con todas las sesiones —la anterior de su
  área puede estar en otra página— y después se pagina: diez por página, de la
  más reciente a la más antigua (`?pagina=`; una página de más se acota a la
  última).
- **La pantalla**: la fecha es la cabecera de cada fila y despliega el detalle
  (las series como llegaron, borrar, confirmar la fecha); el progreso lleva signo,
  flecha y número y el color sólo acompaña; paginación numerada con primera,
  anterior, siguiente y última, y el foco vuelve al resumen al cambiar de página.
  La unidad va en la cabecera («Carga media (lb)»). En el teléfono, como en la
  comparativa, las otras columnas se ocultan y lo suyo va bajo la fecha.

**Relación con el ADR-003.** La métrica de estímulo sigue siendo una: series
efectivas. Carga media y progreso son indicadores de **rendimiento**: no entran en
la semana, ni en la comparativa, ni en el mapa, y no tienen umbral ni objetivo.
El ADR-003 dejaba la carga como métrica secundaria y nunca como estímulo; aquí va
en la misma fila que las series efectivas porque el usuario lo pidió, con su
unidad en el rótulo y sin operar nunca con ellas.

**Alternativas descartadas.** Comparar la carga media: sube con sólo cambiar de
ejercicio sin haber mejorado nada. Comparar con la sesión anterior a secas: un
día de pierna tras uno de pecho no tiene nada en común. Tonelaje (carga ×
repeticiones): premia hacer más series, que es volumen, y castiga subir la carga
con menos repeticiones. Una marca sin RIR: una serie fácil y otra al fallo con
la misma carga y repeticiones valdrían lo mismo. Paginar en el navegador: tendría
que recibirlo todo. Guardar el progreso: un segundo sitio donde vive la verdad, y
dejaría de ser cierto al borrar una serie anterior.

**Consecuencias.** Borrar una serie vieja puede cambiar el progreso de la
siguiente sesión de su área, y es lo correcto: se calcula con lo que hay. Cada
lectura del historial recorre todas las series del libro; con miles de sesiones
sería la caché derivada y descartable que prevé el ADR-003. Lo fijan
`area.test.ts`, `rendimiento.test.ts`, `historial.integracion.test.ts` e
`historial.test.tsx`.

## ADR-025 — Gráficas del historial: músculos por semana y fuerza estimada

**Estado**: ACEPTADO

**Contexto.** El ADR-024 dejó las gráficas para después. El usuario pidió dos:
cómo se fueron trabajando los músculos a lo largo del tiempo y el avance de los
pesos por semana, en dos líneas, tren superior y tren inferior. Se eligieron las
opciones recomendadas: series efectivas por grupo y semana, fuerza estimada en
vez de carga media literal, y ocho semanas.

**Decisión.**

- **Una lectura aparte**, `GET /api/lectura/v1/historial/graficas`: la semana
  actual y las siete anteriores (semanas naturales, de lunes a domingo), sin
  relación con las páginas de la tabla. Se calcula al leer y no se guarda nada.
- **Músculos trabajados**: una cuadrícula de grupo × semana con las series
  efectivas de `agregaPorSemana` —el mismo `agrega` que el resumen— y el nivel de
  `nivelDeVolumen`, la escala del mapa (ADR-018). Es una tabla de verdad: cada
  celda lleva la muestra del color y la cifra **debajo**, nunca encima, porque el
  nivel 5 no da 5:1 con ninguna tinta. En el teléfono, las cuatro semanas más
  recientes.
- **Fuerza estimada** (`fuerzaPorSemana`, en el motor), en libras y por tren.
  Cada ejercicio va al tren que se lleva más coeficiente en la versión abierta
  (`trenDeEjercicio`); el centro, un empate o un grupo fuera del catálogo base no
  van a ninguno. Sólo cuentan series de trabajo con carga. La primera semana con
  datos vale la media de la mejor marca de cada ejercicio (Epley con el RIR, como
  el progreso del ADR-024); cada semana siguiente encadena el `progreso` frente a
  la semana anterior **más reciente que comparta algún ejercicio** y sigue su
  tramo. Así sólo lo repetido mueve la línea: cambiar de ejercicio no la sube ni
  la baja, y una semana con otros ejercicios no rompe la de siempre. Sin ninguna
  semana en común empieza un tramo nuevo, que se dibuja aparte. Una semana sin
  datos deja hueco, nunca un cero.
- **La pantalla**: SVG propio, dibujado al ancho real del contenedor. Dos colores
  validados para daltonismo (`--serie-superior` índigo, `--serie-inferior` verde
  azulado) y además forma distinta en los puntos (círculo y cuadrado); leyenda
  arriba y rótulo directo con el último valor. Al pasar el puntero, una línea
  vertical y un globo con los dos valores y su cambio; en el teléfono el globo va
  debajo del dibujo. El dibujo es `aria-hidden`: los números, para todos, en la
  tabla «Ver los datos».

**Alternativas descartadas.** Carga media literal por semana: sube o baja según
qué ejercicios se hicieron, no según la fuerza. Dieciséis líneas, una por grupo:
ilegible. Comparar sólo con la semana inmediatamente anterior: una semana con
otros ejercicios partía la línea en tres tramos al volver a los de siempre (se
vio en la revisión con datos sembrados). Una biblioteca de gráficas: regla del
proyecto (cliente-web), y cuatro funciones de geometría bastan.

**Consecuencias.** La fuerza estimada es una estimación: compara bien contigo
mismo semana a semana, no es un 1RM medido. Un tramo nuevo empieza en la media de
sus propios ejercicios, así que su altura no se compara con la de otro tramo; por
eso se dibuja aparte. Lo fijan `rendimiento.test.ts`, `area.test.ts`,
`historial.integracion.test.ts`, `graficas-del-historial.test.tsx` y
`lenguaje-visual.test.ts` (contraste ≥ 3:1 y separación con deuteranopía de las
dos líneas).

## ADR-026 — Un día elegido de la rutina se registra en su fecha

**Estado**: ACEPTADO (enmienda al ADR-022)

**Contexto.** En «Registrar» se puede elegir otro día de la rutina, pero lo que
se guardaba iba siempre a hoy: el ADR-022 decidió que «guardar no cambia» y que
hacer el día 1 en martes era desplazamiento. El usuario lo vio como un fallo:
si el martes elige el día del lunes es para registrar el lunes, y si el día
elegido no cambia nada, no debería poder elegirse. Lo que toca hoy sale solo y
así se queda; lo que cambia es qué pasa al elegir otro día.

**Decisión.**

- **El día elegido de la rutina asignada va a su fecha**: la última, sin pasar
  de hoy, en que tocaba ese día del ciclo, contado desde el ancla
  (`fechaDelDiaDelCiclo`, en el motor). El martes, el día del lunes es el lunes;
  el viernes, que todavía no llega, es el de la semana pasada. Nunca una fecha
  futura.
- **Un día que caería antes del inicio de la asignación no tiene fecha**: la
  pantalla lo dice y no deja guardar, y el servidor lo rechaza. No se inventa una
  fecha fuera de la rutina.
- **Otra rutina, no asignada, no tiene calendario**: lo que se registre con ella
  va a hoy, y la pantalla lo dice.
- **La fecha la calcula el servidor**, igual al leer que al guardar.
  `GET /api/registro/v1/rutina` dice adónde va lo que se registre
  (`vista.registro`) y a qué fecha llevaría cada día (`vista.fechas_del_ciclo`,
  para el selector). `POST /api/registro/v1/serie` recibe opcionalmente `rutina`,
  lo mismo con que se leyó (`sesion`, `version`, `dia`), y recalcula la fecha
  con la misma función. El navegador nunca manda una fecha.
- **Un entrenamiento es de un día.** La pantalla abre uno aparte para cada fecha
  elegida, con la misma vigencia de seis horas que el de hoy, y el de hoy no se
  toca. El servidor rechaza una serie de otra fecha con la clave de un
  entrenamiento que ya existe, en vez de mezclarla.
- **Lo hecho se cuenta en la fecha del día elegido**: «hechas de objetivo» del
  lunes cuenta el lunes.
- Lo registrado así es deliberado: no entra como «fecha por confirmar», que es
  para la duda del reloj de un teléfono (riesgo R3).

**Alternativas descartadas.** Quitar el selector de día: se pierde poder
registrar un día olvidado y ver otro día de la rutina. Elegir la fecha en un
calendario: abre fechas sin día de rutina y lleva la aritmética de fechas al
navegador. Que el navegador mande la fecha que leyó: el servidor tendría que
fiarse de ella; recalcularla con la misma función da lo mismo sin confiar en el
cliente.

**Consecuencias.** Las sesiones registradas para otro día llevan como hora de
inicio el momento de guardar, no la del entrenamiento: la fecha lógica es la que
manda en la semana, la comparativa y el historial. Los atajos del iPhone no
cambian. Lo fijan `plan.test.ts`, `rutina.integracion.test.ts` y
`registrar.test.tsx`.
