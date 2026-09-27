# Contrato de sesión y lectura — `/api/sesion/v1`, `/api/lectura/v1`

Todo con cookie y alcance `sesion`. Reglas comunes: la credencial antes que el
esquema; recurso ajeno o inexistente → **404, nunca 403**; `Cache-Control:
no-store` en toda la API; decimales como texto con dos posiciones; un 500 es mudo
(`{"codigo":"interno","mensaje":"Error interno"}`) y el registro guarda sólo
nombre, mensaje y traza.

Errores: `{ "codigo": "…", "mensaje": "…" }`. Un 429 lleva `reintentar_en`
(segundos) y la cabecera `Retry-After`. Un 409 `almacen-cambiado` significa que
el Excel se editó a mano mientras se guardaba: no se escribió nada.

## Sesión

| Ruta | Qué hace |
| ---- | -------- |
| `POST /api/sesion/v1/entrar` `{correo, contrasena}` | 204 y cookie `sigir_sesion` (`HttpOnly; Secure; SameSite=Strict; Path=/`). El fallo es **siempre** el mismo 401, exista o no el correo. 10 intentos por minuto por correo e IP, y 30 por IP sea cual sea el correo (cada intento cuesta un Argon2). |
| `POST /api/sesion/v1/salir` | Revoca la fila y borra la cookie. 204, idempotente. |
| `GET /api/sesion/v1/actual` | `{ correo, zona_horaria }` o 401. |

La sesión se desliza como mucho una vez al día (30 días) y caduca a los 90 desde
la emisión; al deslizarse se re-emite la cookie.

## `GET /api/lectura/v1/dashboard`

Semana natural (lunes a domingo) del hoy lógico del usuario.

```json
{
  "semana": { "desde": "2026-09-21", "hasta": "2026-09-27", "hoy": "2026-09-26" },
  "grupos": [
    {
      "id": "…", "nombre": "Dorsal", "series_efectivas": "12.00",
      "nivel": 4, "zona": "dorsal",
      "referencia": { "banda": "general", "nombre": "Rango general", "minimo": "10.00", "maximo": "20.00", "respaldo": "publicado", "estado": "dentro" }
    }
  ],
  "estadisticas": { "series_efectivas": 14, "sesiones": 3, "grupos_sin_trabajo": 2 },
  "escala": [{ "nivel": 0, "desde": "0.00", "hasta": "0.00", "rotulo": "Sin trabajo", "descripcion": "Ninguna serie efectiva" }],
  "diagnostico": { "series_sin_mapeo": 0, "series_sobre_umbral": 1, "series_de_calentamiento": 2, "versiones_de_parametros": ["…"] },
  "frescura": { "ultima_serie_recibida": "2026-09-27T01:42:00.000Z" },
  "catalogo": { "grupos": 16, "ejercicios": 170 }
}
```

- **Todos** los grupos, los de `0.00` incluidos, en el orden de la taxonomía.
- `nivel` (ADR-018): 0 = cero; 1 = más de 0 y menos de 4; 2 = 4–<8; 3 = 8–<12;
  4 = 12–<16; 5 = 16–<20; 6 = 20 o más. Aritmética entera sobre las centésimas
  del motor. **El cliente no lo recalcula.**
- `zona`: identificador del catálogo base si el nombre coincide por
  `trim().toLowerCase()`; `null` si el grupo se renombró o es propio. Misma regla
  que `referencia`.
- `escala`: la leyenda del mapa. Fuente única.
- `estadisticas`: contadas en el servidor (el motor cuenta `seriesEfectivas`);
  el navegador no suma.
- `frescura`: lo que el servidor sabe de verdad. La web no ve la cola del
  teléfono; no hay «pendientes».

## `GET /api/lectura/v1/historial?limite=30`

Hasta 100 sesiones, de la más reciente a la más antigua, con sus series crudas:
`{ sesiones: [{ id, fecha_logica, iniciada_en, finalizada_en, fecha_por_confirmar,
origen, series: [{ id, orden, ejercicio, repeticiones, carga_kg, rir,
es_calentamiento, realizada_en }] }] }`. El calentamiento se marca, no se borra;
`rir` es `null` cuando no hay dato.

## Catálogo

| Ruta | Qué hace |
| ---- | -------- |
| `GET /api/lectura/v1/catalogo` | `{ grupos: [{id, nombre, zona}], ejercicios: [{id, nombre, archivado, sin_grupos}], parametros: { version_id, umbral_rir, vigente_desde, fijada, manana, contribuciones: [{ejercicio_id, grupo_id, coeficiente}] } }` — la versión ABIERTA. |
| `POST /api/lectura/v1/catalogo/grupos` `{nombre}` | 201; duplicado (sin mayúsculas ni espacios) → 409 `duplicado`. |
| `POST /api/lectura/v1/catalogo/ejercicios` `{nombre}` | 201; 409 `duplicado`. |
| `PUT /api/lectura/v1/catalogo/ejercicios/:id/archivo` `{archivado}` | Borrado lógico reversible. 204 o 404. |
| `PUT /api/lectura/v1/catalogo/parametros` `{umbral_rir, contribuciones}` | Reemplaza la propuesta ENTERA. Si nadie fija la versión abierta → `{"camino":"en-sitio"}` y rige ya (ADR-013); si una sesión la fija → cierra la vigente y crea la sucesora desde mañana `{"camino":"sucesora","vigente_desde":…}` (ADR-003); si la fija una sesión futura → 409 `fijada-por-futura`. Referencias ajenas, pares repetidos o coeficientes fuera de (0, 2] → 422. |
| `GET /api/lectura/v1/catalogo/base` | La semilla del repositorio más `ejercicios_por_perfil`. |
| `POST /api/lectura/v1/catalogo/importa` `{grupos: [id], ejercicios: [id]}` | Importa **por identificadores**. Idempotente y reconciliadora: reutiliza por nombre, crea lo que falta, **no pisa** un coeficiente existente; con la versión fijada, la sucesora copia todo antes de añadir. Devuelve conteos y `camino` (`en-sitio`, `sucesora` o `sin-cambios`). Identificador desconocido → 422. Un coeficiente en el cuerpo → 400 (no hay forma de colar un valor). |

## Dispositivos y exportación

| Ruta | Qué hace |
| ---- | -------- |
| `GET /api/lectura/v1/dispositivos` | `{ dispositivos: [{id, nombre, emitido_en, expira_en, ultimo_uso_en}] }`. Nunca la credencial. |
| `POST /api/lectura/v1/dispositivos` `{nombre}` | 201 `{ dispositivo, credencial, archivo: { nombre: "credencial.json", contenido }, servidor: { url, aviso } }`. **La única vez** que la credencial existe fuera del teléfono. `servidor.url` es la dirección que lleva el archivo: `URL_PUBLICA` si está declarada, si no el `Origin` del navegador que emite y, en último lugar, esquema y `Host` de la petición. `aviso` es texto del servidor, o `null`, y dice si el teléfono no la va a alcanzar (local) o la usaría sin cifrar (sin https). |
| `DELETE /api/lectura/v1/dispositivos/:id` | Revoca. 204; ajena o inexistente → 404. |
| `GET /api/lectura/v1/exportacion` | JSON abierto `{ formato: "sigir-exportacion", version: 1, exportado_en, cuenta: {correo, zona_horaria, creado_en}, datos: {<hoja>: [filas]} }` con las once hojas tal cual. Sin hashes ni tokens. `Content-Disposition: attachment`. **2 por hora**. |

`ultimo_uso_en` se anota con resolución de diez minutos.
