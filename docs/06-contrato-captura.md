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
    "carga_kg": "62,5",
    "rir": 2,
    "calentamiento": false,
    "realizada_en": "2026-09-26T23:52:10-06:00"
  }
}
```

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
Además, sólo desde la web y a la vista:

| Ruta | Qué hace |
| ---- | -------- |
| `GET /api/registro/v1/catalogo` | Igual que el de captura. |
| `DELETE /api/registro/v1/serie/:id` | Borra una serie mal capturada (entera: no hay edición en sitio). 204 o 404. |
| `DELETE /api/registro/v1/sesion/:id` | Borra una sesión con sus series (fecha gravemente equivocada). 204 o 404. |
| `POST /api/registro/v1/sesion/:id/confirmacion` | Confirma una fecha por confirmar. 204 o 404. |

La pantalla guarda del entrenamiento abierto **la clave y un instante** en
`sessionStorage`, vigentes seis horas por antigüedad, para que recargar no parta
la sesión. No hay cola: nada pendiente, nada que reintentar.
