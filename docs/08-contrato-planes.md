# Contrato de planes — `/api/planes/v1`

Cookie y alcance `sesion`. El atajo no tiene rutas aquí (su línea semanal, ADR-019,
vive en `/api/captura/v1/semana`). El plan no se compara contra el agregado: se
**expande** con `expandePlan` y pasa por el mismo `agrega` que lo registrado
(ADR-006).

## Códigos de rechazo

| Código | HTTP | Cuándo |
| ------ | ---- | ------ |
| `no-encontrado` | 404 | Versión, plan o asignación ajena o inexistente. |
| `publicada` | 409 | Tocar las entradas de una versión publicada, o publicarla dos veces. |
| `vacia` | 409 | Publicar una versión sin entradas. |
| `borrador` | 409 | Asignar una versión sin publicar. |
| `solape` | 409 | Asignar desde una fecha igual o anterior al inicio de la vigente, o que choca con otra. |
| `cubre-sesiones` | 409 | Asignar desde una fecha que dejaría sesiones de la vigente con otro plan, o retirar una asignación que ya cubre sesiones. |
| `duplicado` | 409/422 | Nombre de plan repetido (409); dos objetivos para el mismo destino y día (422: se sumarían). |
| `ciclo` | 422 | Un día fuera del ciclo, o copiar entradas a un ciclo más corto. |
| `destino` | 422 | Una entrada sin destino o con ejercicio y grupo a la vez. |
| `referencia` / `archivado` | 422 | Un ejercicio o grupo que no existe, o un ejercicio archivado. |
| `objetivo` | 422 | Objetivo fuera de (0, 100]. |
| `ventana` | 422 | Ventana explícita mal formada o de más de 370 días; comparativa con 0 o más de 52 ventanas. |

## Rutas

| Método y ruta | Qué hace |
| ------------- | -------- |
| `GET /api/planes/v1` | `{ hoy, planes: [{id, nombre, versiones: [{id, numero, ciclo_dias, copiada_de, publicada_en, entradas}]}], asignaciones: [{id, plan_id, plan_version_id, vigente_desde, vigente_hasta, cubre_sesiones}] }` |
| `GET /api/planes/v1/versiones/:id` | La versión con `lista_de_entradas: [{id, dia, ejercicio_id, grupo_id, objetivo}]`. |
| `POST /api/planes/v1` `{nombre, ciclo_dias}` | Crea el plan con su versión 1 en borrador. |
| `POST /api/planes/v1/:id/versiones` `{copiar_de?, ciclo_dias?}` | Nueva versión (número siguiente), opcionalmente copiando entradas. Es la forma de «editar» algo publicado. |
| `PUT /api/planes/v1/versiones/:id/entradas` `{ciclo_dias?, entradas: [{dia, ejercicio_id? , grupo_id?, objetivo}]}` | Reemplaza las entradas de un **borrador**. Lo que no se envía desaparece. |
| `POST /api/planes/v1/versiones/:id/publicacion` | Publica. Irreversible. |
| `POST /api/planes/v1/asignaciones` `{version_id, desde}` | Asigna desde `desde`, que es el **ancla** (día 1 del ciclo), y cierra por arriba la vigente. |
| `DELETE /api/planes/v1/asignaciones/:id` | Retira una asignación que **no** cubre sesiones; si cubre → 409 `cubre-sesiones`. |
| `GET /api/planes/v1/proyeccion?desde_semana=0&semanas=4` | Volumen previsto por grupo y semana natural, en semanas relativas a la de hoy (o `?desde=AAAA-MM-DD&hasta=AAAA-MM-DD`, ≤ 370 días). |
| `GET /api/planes/v1/versiones/:id/volumen` | **Simulación**: lo que pediría la versión si se asignara, sin escribir nada. |
| `GET /api/planes/v1/comparativa?ventanas=8&umbral=3` | **Comparativa** (fase 3, ADR-019): lo hecho menos lo planeado por semana del plan. `umbral` (0–10, opcional) es una **simulación**: no escribe nada. |

## Proyección

```json
{
  "hoy": "2026-09-26",
  "parametros": { "version_id": "…", "umbral_rir": 4, "vigente_desde": "2000-01-01" },
  "semanas": [
    { "desde": "2026-09-21", "hasta": "2026-09-27", "sin_plan": false, "entradas_sin_mapeo": 0,
      "grupos": [{ "id": "…", "nombre": "Pectoral", "series": "10.00" }] }
  ]
}
```

- Una sola lectura con la versión de parámetros del **primer día** de la ventana;
  se declara.
- `sin_plan`: ningún día de esa semana tiene asignación. La vista dice que no hay
  plan; no enseña ceros.
- Una serie de plan entra con `rir: 0` y `veces` = objetivo; un objetivo por
  grupo lleva coeficiente 1.00. El día del ciclo se cuenta desde el ancla.

## Simulación de volumen

```json
{
  "version_id": "…", "ciclo_dias": 4, "semanas_de_la_ventana": 4, "entradas_sin_mapeo": 0,
  "grupos": [{ "id": "…", "nombre": "Pectoral", "series_por_semana": "10.50", "total": "42.00",
               "referencia": { "estado": "dentro", "minimo": "10.00", "maximo": "20.00", "respaldo": "publicado", "banda": "general", "nombre": "Rango general" } }]
}
```

Se expande un ciclo sobre el mínimo común múltiplo del ciclo y la semana (un
ciclo de 4 días: 28 días, 4 semanas) con la versión de parámetros abierta. El
veredicto de `referencia` se decide con aritmética entera sobre el **total** (la
banda por las semanas); `series_por_semana` es una media redondeada a la mitad
par, sólo para leer.

## Comparativa

```json
{
  "hoy": "2026-09-26",
  "simulacion": null,
  "ventanas": [
    { "desde": "2026-09-22", "hasta": "2026-09-28", "dias": 7, "numero": 3, "en_curso": true,
      "plan": { "asignacion_id": "…", "version_id": "…", "nombre": "Torso", "numero_de_version": 2, "ciclo_dias": 7, "ancla": "2026-09-08" },
      "versiones_de_parametros": [{ "id": "…", "vigente_desde": "2000-01-01", "umbral_rir": 4 }],
      "entradas_sin_mapeo": 0, "series_sin_mapeo": 0,
      "grupos": [{ "id": "…", "nombre": "Pectoral", "planeado": "7.00", "ejecutado": "5.00", "delta": "-2.00", "estado": "pendiente" }],
      "detalle": [{ "fecha": "2026-09-22", "dia_del_ciclo": 1, "futuro": false,
                    "planeado": [{ "id": "…", "nombre": "Pectoral", "series": "5.00" }], "ejecutado": [] }] }
  ],
  "vigilancia": { "desde": "2026-07-05", "hasta": "2026-09-26", "efectivas": 133, "en_la_franja": 55,
                  "porcentaje": "41.4", "disparador": 15, "minimo": 30, "pide_sensibilidad": true, "umbrales": [3, 4] }
}
```

- **Ventana**: la semana del plan contada desde el **ancla** de su asignación, no
  desde el lunes (`ventanasDeComparacion`). La última de una asignación cerrada a
  mitad es corta (`dias` < 7). Sin asignación no hay ventana: `ventanas: []`.
  Vienen las `ventanas` más recientes (8 por omisión), de la más antigua a la
  más reciente.
- **Cada ventana contra el plan vigente entonces**, y el lado planeado con la
  versión de parámetros de **cada día**. `versiones_de_parametros` trae las de los
  dos lados: más de una es una ventana que mezcla reglas, y se dice.
- **`delta`** = ejecutado − planeado, con el signo escrito (`+2.00`, `-1.50`,
  `0.00`). **`estado`** lo decide el servidor: `deficit`, `superavit`, `en-plan`
  y `pendiente` (el déficit de una semana que no ha terminado). `grupos` trae
  sólo los que tienen algo en un lado o en el otro.
- **`detalle`**: día a día, para leerlo como **desplazamiento**; lo que cuenta es
  la semana.
- **Simulación** (`umbral`): el mismo cálculo con ese umbral para todas las
  versiones; `simulacion` lo rotula. La vigilancia usa siempre los umbrales de
  verdad.
- **Vigilancia del umbral** (riesgo R6): de las series efectivas de las últimas
  doce semanas, las que tienen el RIR en `[umbral − 1, umbral]`. Pide mirar la
  sensibilidad con **más del 15 %** y **30 efectivas o más** (convenciones
  declaradas). `porcentaje` va con un decimal, redondeado a la mitad par.

## Lo que deliberadamente no existe

Re-apuntar una asignación o moverle el inicio: el inicio es el día 1 del ciclo y
moverlo renumeraría todo el histórico. Se asigna otra versión desde una fecha
posterior, que cierra la anterior sola.
