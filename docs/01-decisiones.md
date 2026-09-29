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
