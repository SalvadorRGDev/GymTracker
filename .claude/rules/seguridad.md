---
paths:
  - "src/api/**/*"
  - "src/auth/**/*"
  - "src/server/**/*"
  - "src/almacen/**/*"
  - "atajos/**/*"
---

# Reglas de seguridad

Aplican a todo código que toque la red, el almacén o la sesión.
El modelo de amenaza no es "un usuario": es un usuario legítimo y todo internet.
Que el servidor corra en la máquina de casa no lo reduce: el ADR-011 lo publica
por un túnel, así que está en internet exactamente igual.

## Autorización

- Todo acceso a un recurso verifica propiedad contra el usuario de la sesión.
  Una consulta sin filtro de propietario es un bug, no una optimización.
- Diseñar contra IDOR: identificadores no enumerables, o verificación
  obligatoria de propiedad en cada consulta. Preferentemente ambas.
- El endpoint de exportación requiere autenticación, verificación de propiedad
  y límite de tasa.
- **La credencial se comprueba antes que el esquema.** Fastify valida antes de
  llamar al manejador, así que un esquema declarado a secas en la ruta contesta
  400 a quien no está autenticado: eso es responder «¿esto cumple el contrato?»
  sin credencial, y con esa diferencia se mapean campos y rangos ruta por ruta.
  Las rutas de captura y de lectura llevan `attachValidation`, y el 400 se
  contesta después de resolver el portador o la cookie. Lo fija
  `src/api/orden-de-comprobaciones.test.ts`. Con la validación
  aplazada el cuerpo puede no tener la forma que dice su tipo: no se toca antes
  de mirar `validationError`.
- **Un JSON ilegible también espera a la credencial.** El analizador de Fastify
  contesta 400 antes que nada; `app.ts` lo envuelve para que deje un símbolo
  (`CUERPO_ILEGIBLE`) que ningún esquema acepta, y `compruebaEsquema` lo contesta
  después de la credencial. Sigue siendo su analizador, con el rechazo de
  `__proto__` y `constructor`: no se sustituye por un `JSON.parse` propio. El
  413 del límite de cuerpo y el 415 de un tipo desconocido sí van antes: son del
  transporte y no dicen nada del contrato.

## Aislamiento por propietario

Ya no lo aplica PostgreSQL: lo aplican el sistema de archivos y la capa de acceso
(ADR-010). Lo que cambia es quién lo garantiza, no lo estricto que es.

- **Un libro por propietario.** Los datos de otro no están en el archivo abierto,
  así que una consulta que olvide filtrar no puede devolver filas ajenas.
- **`conAlmacenDeUsuario` es la única vía**, y el alcance es un parámetro
  obligatorio, sin valor por omisión: un valor por omisión convierte el olvido en
  privilegio. Quien recibe un `AlmacenDeUsuario` no tiene forma de nombrar otro
  libro —no ve el depósito, ni rutas, ni identificadores de archivo—.
- **Las consultas siguen filtrando por propietario**, aunque el libro sea de uno
  solo. Cuesta una comparación y es la diferencia entre cero filas y las de otra
  persona el día que se abra el archivo equivocado.
- **El depósito se construye en `src/server/` y sólo `src/almacen/` abre
  archivos.** Lo comprueba `src/server/arquitectura.test.ts`. Un módulo que leyera
  un `.xlsx` por su cuenta se saltaría el alcance, el filtro por propietario, la
  cola de escritura y la verificación de invariantes, y entonces nada de eso
  protegería nada sin que ninguna prueba fallara.
- **Dos archivos, un orden de bloqueo**: primero `cuentas.xlsx`, después el libro
  del propietario. Dos colas tomadas en distinto orden se abrazan.
- Los invariantes se comprueban sobre el conjunto entero antes de confirmar, no
  en cada punto de escritura. Ver `.claude/rules/almacen-excel.md`.

## Credencial de captura (ADR-009)

El cliente de captura son atajos de iOS: no hay navegador, no hay cookie, no hay
llavero, y el atajo **se instala compartiéndolo**.

- Dos credenciales, dos tablas, dos funciones de búsqueda: `token_sesion` para la
  lectura y `token_captura` para la captura. Un hash de una no encuentra nada en
  la otra, y esa separación es estructural a propósito: con una columna `alcance`
  compartida, olvidar el filtro no falla, autentica.
- El hash lleva etiqueta de dominio: `HMAC-SHA256(SESSION_SECRET, 'captura:' || token)`.
- La credencial se muestra **una vez** al emitirla. No hay endpoint público que la
  emita ni forma de recuperarla: se emite otra y se borra la anterior.
- Lo que el alcance `captura` puede hacer lo dice `ALCANCE_DE_HOJA`, no la ruta:
  escribe sesiones, series y mediciones; lee catálogo, parámetros y sus propias
  escrituras de los últimos treinta días; no lee planes, no exporta y **no borra
  nada**.
- El alcance `captura` no lee `usuario`: ahí vive el hash de la contraseña, y
  vive además en otro archivo. La zona horaria llega en el propio
  `AlmacenDeUsuario`, que la resuelve la capa de acceso. Y el instante de escritura
  de una fila lo pone el servidor, nunca el cliente: es la columna sobre la que
  se apoya la ventana de lectura de ese alcance.
- Los permisos de alcance se escriben por afirmación —lo que cada alcance PUEDE
  hacer—, nunca por negación, para que una hoja nueva sin entrada en la tabla
  falle cerrada.
- Límite de tasa por credencial de captura, además del de acceso y exportación.
- El de acceso son dos: por correo e IP (protege la cuenta) y **por IP a secas**
  (30/min). Sin el segundo, una IP con un correo nuevo en cada intento no topaba
  nunca y encolaba un Argon2 por intento: con 400 simultáneos, entrar pasaba de
  55 ms a casi 2 s para todos.

## Límite por IP y proxy inverso

Los límites de acceso y de exportación cuentan por IP, y la IP sale de
`request.ip`. Detrás del túnel del ADR-011 eso es la dirección del socket local
del cliente del túnel, o sea siempre la misma, así que sin `trustProxy` los dos
límites dejan
de separar a nadie: todo el internet comparte un cubo y agotarlo deja al dueño
sin poder entrar. Es un fallo silencioso —el límite sigue respondiendo 429, sólo
que a quien no toca—, de ahí estas reglas:

- La aplicación se construye con `trustProxy` puesto a lo que diga
  `TRUSTED_PROXY`, nunca a `true`: aceptar `X-Forwarded-For` de cualquiera es
  regalar la evasión del límite a quien alcance el puerto directamente.
- Suponer `loopback` sólo vale mientras `HOST` sea local. Si `HOST` se abre a
  otras interfaces, `leeConfiguracion` **exige** declarar el proxy o decir
  `none`: degradar el límite en silencio no es una opción.
- Lo comprueba `src/api/app.test.ts`, sin nada externo.
- Lo mismo vale para esquema y `Host`: detrás del túnel son los del origen local
  si el túnel reescribe `Host`. Nada que se entregue para usarse desde fuera —la
  dirección del `credencial.json`— sale sólo de ahí: manda `URL_PUBLICA`, después
  el `Origin` del navegador (`src/api/servidor-publico.ts`).

## Validación

- Las restricciones de dominio viven en `src/almacen/invariantes.ts`, no solo en
  el cliente: rango válido de RIR, positividad de series, repeticiones y carga.
  Un valor fuera de rango contamina todas las agregaciones históricas en
  silencio y no hay forma de detectarlo después.
- Toda entrada de usuario se valida en el servidor aunque el cliente ya lo haga.

## Datos personales

Peso corporal, historial de entrenamiento y, a futuro, ingesta alimentaria.
Bajo la LFPDPPP (México) buena parte son datos personales sensibles.

- Nada de PII en logs. Ni en logs de error, ni en trazas, ni en mensajes de
  excepción que lleguen al cliente.
- El borrado de cuenta elimina datos de verdad, no solo desactiva la fila:
  `npm run baja` → `Deposito.eliminaCuenta` (filas de cuentas primero, después el
  libro y las copias automáticas con sus datos). Ver `docs/11-privacidad.md`.
- Los libros viven en el disco del usuario, así que el cifrado en reposo es el
  de su sistema de archivos. Hay que decirlo tal cual: no hay cifrado de
  aplicación, y un `.xlsx` copiado a otro sitio va en claro.

## Lo que se sirve

- `WEB_DIR` se publica entero por el túnel. `leeConfiguracion` se niega a
  arrancar si contiene `DATOS_DIR`: con la raíz del proyecto como `WEB_DIR`, el
  servidor servía `cuentas.xlsx`, cada libro y el `.env` a quien los pidiera.
- Además, `app.ts` sólo entrega lo que produce `build:web` (una lista de
  extensiones, por afirmación) y ningún archivo oculto. Es lo que para un
  enlace simbólico que la comprobación por ruta no ve. Lo fijan
  `src/server/configuracion.test.ts` y `src/api/app.test.ts`.

## Secretos

- Ningún secreto en el repositorio. Ni en código, ni en fixtures, ni en
  comentarios, ni en archivos de prueba.
- Las variables sensibles se declaran en `.env.example` sin valor real.
- Si detectas un secreto commiteado, detente y avísalo antes de seguir.

## Idempotencia

El guardado de sesión debe ser idempotente. Captura en gimnasio + conexión
intermitente + reintentos no puede producir sesiones duplicadas.

El mecanismo es la **clave de idempotencia** que el cliente genera al iniciar la
captura y conserva a través de todos los reintentos, única por propietario y
comprobada en `src/almacen/invariantes.ts`. Hay dos claves, no una: la de la
sesión y la de **cada serie** (ADR-008). La segunda existe porque el cliente
de captura no sobrevive entre series —cada ejecución de un atajo empieza de cero—
y el drenado de la cola reenvía: sin clave por serie, el `orden` lo tendría que
proponer el cliente y un reenvío sobrescribiría otra serie en silencio. `orden` lo
asigna el servidor.

La otra opción que proponía el spec —unicidad por usuario y fecha lógica— está
**descartada** (ADR-002, y sigue descartada con el ADR-010): impide entrenar
torso por la mañana y pierna por la tarde, que es un patrón normal, y convierte
un caso legítimo en un error de guardado.
