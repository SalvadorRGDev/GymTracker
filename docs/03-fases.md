# Fases

El orden sigue las dependencias, no la importancia. Cada fase deja algo usable.

| Fase | Contenido | Estado (V2) |
| ---- | --------- | ----------- |
| **0 — Decisiones** | ADR-001 a 009, modelo, invariantes | Cerrada |
| **1 — Registro y esfuerzo real** | Motor, almacén, autenticación, contrato de captura, atajos especificados, captura web, resumen, historial, catálogo, dispositivos, exportación, respaldo y restauración ensayados | En código · **prueba de los atajos en un iPhone pendiente** |
| **2 — Proyección** | Expansión del plan por el motor, contrato de planes, proyección, autoría | Cerrada |
| **Producto** | Catálogo base (ADR-012), versión reescribible (013), rangos (014), constructor de rutinas (015), vidrio (016) | Cerrada |
| **Producto visual** | Dirección moderna (ADR-017) y mapa muscular del resumen (ADR-018) | Cerrada |
| **Huecos del spec** | Borrar serie o sesión desde el historial, confirmar fecha, archivar ejercicio, aviso de frescura activo | Cerrada |
| **3 — Comparativa** | La resta plan contra real (ADR-019), también en el mapa muscular | En código |
| **4 — Nutrición** | Hojas aditivas | No comprometida |

## Fase 3 — Comparativa (en código)

Hecho: `GET /api/planes/v1/comparativa` (ventana desde el ancla, plan vigente
entonces, versiones de parámetros por día y declaradas, delta con signo, estado
del servidor, detalle diario como desplazamiento, simulación con `?umbral=`),
`vigilaUmbral` en el motor, la vista web con escala divergente ámbar ↔ azul y la
línea semanal del atajo (`GET /api/captura/v1/semana`), y la opción «Comparado
con el plan» del mapa muscular (color aparte, `?color=plan`).

Lo que se pedía:

- Ventana: semana del ciclo del plan vigente, con el ancla en el inicio de la
  asignación.
- Cada semana histórica contra la versión de plan **vigente entonces**.
- Déficit y superávit con delta numérico y signo; el color nunca solo, y **con
  una escala divergente propia**: no se reutiliza el rojo del mapa (que dice
  «mucho volumen») con el significado de «déficit».
- Declaración explícita cuando una ventana mezcla versiones de parámetros.
- Comparación diaria rotulada como **desplazamiento**, no como incumplimiento.
- Simulación con otros parámetros (p. ej. RIR ≤ 3), rotulada y sin escribir.
- Vigilancia del umbral (riesgo R6): más del 15 % de las series efectivas en
  `[umbral − 1, umbral + 1]` durante doce semanas pide análisis de sensibilidad.
- Línea semanal para el atajo: un campo o una ruta **nueva** del contrato.

Piezas ya listas: `expandePlan` y `agrega` para los dos lados, `Centesimas` con
negativos, la proyección con su versión de parámetros declarada, asignaciones
inmutables en cuanto cubren sesiones, y el mapa muscular preparado para una
opción «Comparado con el plan».

Orden sugerido: endpoint `/api/planes/v1/comparativa`; pruebas de dominio de los
tres criterios pendientes; vista con delta y signo; simulación; vigilancia; línea
semanal del atajo.
