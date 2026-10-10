# Contrato de captura — `/api/captura/v1` y `/api/registro/v1`

Dos puertas, **un solo servicio** (`src/api/captura/servicio.ts`):

| Puerta | Cliente | Credencial | Alcance | Instantes |
| ------ | ------- | ---------- | ------- | --------- |
| `/api/captura/v1` | Atajos de iOS | `Authorization: Bearer <portador>` | `captura` | Los manda el teléfono (la cola puede llegar tarde) |
| `/api/registro/v1` | Pantalla «Registrar» | Cookie de sesión | `sesion` | Los pone el servidor con su reloj |

## Reglas

- **La versión va en la ruta** y el contrato sólo crece de forma **aditiva**: el
  atajo es una copia en el teléfono sin canal de actualización (riesgo R7).
- **Validación estricta**: un objeto con una propiedad no declarada es 400; un
  `"10"` donde va `10` también (sin coerción de tipos).
- **La credencial se comprueba antes que el esquema**: sin portador o cookie
  válidos la respuesta es 401 aunque el cuerpo esté mal —incluso si no es JSON o
  llega vacío—; el 400 sólo lo ve quien ya se autenticó. Van antes sólo los del
  transporte: 413 (más de 256 KiB) y 415 (un tipo de contenido desconocido).
- **Todo lo que el atajo debe enseñar va en el cuerpo con 200**, aceptado o
  rechazado por dominio, porque Atajos no expone el código de estado. Los no-2xx
  son para lo que el atajo no puede resolver: 400, 401, 409 (el Excel cambió
  mientras se guardaba: reintentar), **426** contrato desconocido, 429, 500. Con
  ellos el atajo aborta y el elemento se queda en la cola, que es lo correcto.
- **Decimales como texto** (`"62.5"`). Se admite la **coma** (`"62,5"`), porque un
  iPhone en español la pone al convertir un número en texto, y también un número
  JSON (`62.5`), que se convierte con su representación exacta. Nunca más de dos
  decimales.
- **Instantes** en ISO 8601 con zona (`2026-09-26T23:50:00-06:00`, con o sin
  segundos o fracción), como los da «Formatear fecha» de Atajos. Sin zona es 400.
- Las **claves de idempotencia** las genera el cliente: 8 a 64 caracteres
  `[A-Za-z0-9_-]` (un UUID sirve).

## `POST /api/captura/v1/serie`

```json
{
  "sesion": { "clave": "3b1f…", "iniciada_en": "2026-09-26T23:50:00-06:00" },
  "serie": {
    "clave": "9c0e…",
    "ejercicio": "Press banca",
    "repeticiones": 10,
    "carga_lb": "135,5",
    "rir": 2,
    "calentamiento": false,
    "realizada_en": "2026-09-26T23:52:10-06:00"
  }
}
```

- **La carga va en libras** (`carga_lb`, de 0 a 2500; ADR-023). Un atajo
  anterior que todavía mande `carga_kg` (0 a 1000) sigue valiendo: el servidor la
  pasa a libras con el factor exacto, a la centésima, y el mensaje lo dice
  («Guardada. 60 kg = 132.28 lb (actualiza el atajo: ahora la carga va en
  libras). Esta semana: …»). Exactamente una de las dos: las dos o ninguna es
  400. El peso corporal sigue en kilos (`peso_kg`).
- `rir` es obligatorio si `calentamiento` es `false` y no puede ir si es `true`
  (la bandera **es** el atajo que se ejecutó: `Serie` o `Calentamiento`).
- El ejercicio se resuelve por nombre con la clave del índice único
  (`trim().toLowerCase()`), **sin coincidencia aproximada** y sin crear nada.
- **Sesión**: si la clave es nueva, se abre con fecha lógica = el día de
  `iniciada_en` en la zona de la cuenta, y el pin = la versión de parámetros que
  regía ese día. Una serie posterior con la misma clave hereda esa fecha: la de
  las 00:15 cuenta con la de las 23:50.
- **Fecha implausible**: si la fecha lógica es futura, o `iniciada_en` tiene más
  de 14 días, la sesión entra con `fecha_por_confirmar` y el historial lo enseña.
- **Idempotencia por serie**: reenviar la misma clave con los mismos datos
  contesta «Ya estaba registrada» sin segundo efecto; con otros datos, rechazo.
- `orden` lo asigna el servidor (máximo + 1 dentro de la sesión).

Respuesta 200:

```json
{
  "estado": "aceptada",
  "mensaje": "Guardada. Esta semana: Pectoral 12.00 · Tríceps 6.00 · Deltoides anterior 6.00.",
  "serie": { "id": "…", "orden": 4, "fecha_logica": "2026-09-26", "fecha_por_confirmar": false },
  "semana": [{ "grupo": "Pectoral", "series_efectivas": "12.00" }]
}
```

`semana` es el volumen de la semana natural de la sesión en los grupos que toca
el ejercicio, **calculado por el motor**. Con el alcance `captura` (que sólo ve 30
días de escrituras) se omite si esa semana empezó hace más de 23 días: antes que
un total plausible y falso, ningún total.

Rechazos (200, `"estado": "rechazada"`): ejercicio desconocido o archivado; clave
de serie reutilizada con otros datos; ninguna versión de parámetros para la fecha.

## `POST /api/captura/v1/sesion/cerrar`

```json
{ "sesion": { "clave": "3b1f…" }, "finalizada_en": "2026-09-27T00:40:00-06:00" }
```

Fija `finalizada_en` (idempotente: la segunda vez dice «Ya estaba cerrado») y
devuelve el resumen de **esa** sesión calculado por el motor: «Entrenamiento
cerrado. 18 series, 15 efectivas. Pectoral 8.00 · …».

## `POST /api/captura/v1/peso`

```json
{ "peso_kg": "72,4", "medido_en": "2026-09-26T07:10:00-06:00" }
```

Una medición por fecha lógica (20–400 kg); reenviar el mismo valor no hace nada y
uno distinto la corrige («corregido»). Fechas futuras o de hace más de 23 días
desde el teléfono se rechazan.

## `GET /api/captura/v1/catalogo`

`{ "ejercicios": [{ "nombre": "…" }], "grupos": [{ "nombre": "…" }] }`, por nombre,
sin archivados.

## `GET /api/captura/v1/semana` (ADR-019)

La semana del plan en curso en una frase, calculada por el motor en el servidor:

```json
{ "mensaje": "Semana 2 de «Torso» (hasta el 2026-09-28): Pectoral 5.00 de 7.00 · Dorsal 5.00 de 8.00",
  "ventana": { "desde": "2026-09-22", "hasta": "2026-09-28" } }
```

Sin plan hoy: `{ "mensaje": "No hay plan asignado hoy: la línea compara contra un plan.", "ventana": null }`.
Ruta **nueva** (el contrato crece de forma aditiva). Para calcularla, el alcance
`captura` **lee** el plan; no lo escribe, no lo exporta y no lo borra.

## 426 — contrato desconocido

Cualquier `/api/captura/<versión>/…` distinta de `v1`:

```json
{ "codigo": "contrato-desconocido", "mensaje": "…Reinstala los atajos.", "reinstalar": "<ATAJOS_URL>" }
```

## Lo que no existe aquí

Rutas de planes (la línea semanal sólo lee), exportación, borrados y creación de
ejercicios. Un dictado mal entendido no puede partir en dos el histórico de un
ejercicio.

## `/api/registro/v1` (web)

Los mismos cuerpos **sin instantes** (`sesion: { clave }`, `serie` sin
`realizada_en`; `peso` sin `medido_en`): la fecha lógica la pone el servidor.
La serie admite además `rutina: { sesion?, version?, dia? }`, la rutina y el día
elegidos a mano con que se leyó la rutina (ADR-026): el servidor recalcula con
ellos la fecha del día elegido y la sesión nueva la toma. Un día sin fecha
(antes del inicio de la rutina) o una clave de sesión de otra fecha se rechazan
con 200 y su motivo; no se guarda nada.
Además, sólo desde la web y a la vista:

| Ruta | Qué hace |
| ---- | -------- |
| `GET /api/registro/v1/catalogo` | Igual que el de captura. |
| `GET /api/registro/v1/rutina` `?sesion=&version=&dia=` | La rutina del día (ADR-022): qué rutina toca, qué día de su ciclo y cuánto va hecho. Sólo lee. 404 `no-encontrado`, 409 `borrador`, 422 `dia`. |
| `DELETE /api/registro/v1/serie/:id` | Borra una serie mal capturada (entera: no hay edición en sitio). 204 o 404. |
| `DELETE /api/registro/v1/sesion/:id` | Borra una sesión con sus series (fecha gravemente equivocada). 204 o 404. |
| `POST /api/registro/v1/sesion/:id/confirmacion` | Confirma una fecha por confirmar. 204 o 404. |

La pantalla guarda del entrenamiento abierto **la clave y un instante** en
`sessionStorage`, vigentes seis horas por antigüedad, para que recargar no parta
la sesión, y otro igual por cada fecha elegida (ADR-026). No hay cola: nada
pendiente, nada que reintentar.

### `GET /api/registro/v1/rutina` (ADR-022)

Todo lo decide el servidor; la pantalla sólo pinta.

- **La fecha**: la del entrenamiento abierto si `sesion` es la clave de una
  sesión que ya existe (el de las 23:50 no cambia de lista a medianoche); si no,
  hoy en la zona de la cuenta. `de_entrenamiento_abierto` dice cuál fue.
- **`de_hoy`**: la asignación que cubre la fecha y el día de su ciclo, contado
  desde el ancla. `null` sin asignación.
- **`vista`**: la de hoy, o la rutina (`version`, sólo publicadas) y el día
  (`dia`, 1 a su ciclo) pedidos. Sin rutina que enseñar, `null`.
  `es_la_de_hoy` es falso en cuanto la rutina o el día no son los que tocan.
- **`rutinas`**: la última versión publicada de cada rutina, más la asignada y
  la que se ve si son otras; la asignada primero.
- **Cada entrada** trae `objetivo` y `hechas` en series efectivas, como las da
  el motor, y `completa`. Una de ejercicio cuenta sus series efectivas del día;
  una de grupo, el volumen del grupo en el día con los ejercicios que **no**
  tienen fila propia ese día, y ofrece los del catálogo que lo trabajan (1.00 o
  0.50), sin archivados ni los que ya tienen fila. Un ejercicio archivado
  después de publicar la rutina llega con `archivado: true`.
- **`vista.registro`** dice adónde va lo que se registre viendo eso (ADR-026):
  `hoy`, `dia-del-ciclo` (otro día de la asignada: la última fecha en que tocaba,
  nunca futura), `otra-rutina` (no asignada: va a hoy) o `antes-del-inicio`
  (`fecha: null`, con `desde`). `hechas` cuenta esa fecha.
- **`vista.fechas_del_ciclo`**: la fecha de cada día del ciclo de la asignada,
  para el selector; `null` dentro para un día antes del inicio y `null` entera
  para otra rutina.
- La serie no guarda de qué rutina salió: guarda su fecha.
