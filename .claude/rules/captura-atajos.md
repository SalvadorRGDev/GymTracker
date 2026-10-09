---
paths:
  - "atajos/**/*"
  - "src/api/captura/**/*"
---

# Cliente de captura: atajos de iOS

Decidido en el ADR-008, que supera al ADR-001. La captura entre series es la app
Atajos de iOS hablando con `/api/captura/v1`.

Desde el ADR-011 **no es la única vía**: hay también una pantalla de captura en
el cliente web, contra `/api/registro/v1` y con la cookie de sesión. Los atajos
no pierden nada —siguen siendo lo rápido en el gimnasio— y la regla que sostiene
que haya dos puertas es que **las dos llaman al mismo servicio**: lo que cambia
es la credencial y el alcance, nunca la lógica. Una segunda implementación de la
escritura sería el riesgo R10 con otro nombre.

## Lo que el atajo no hace

- **No calcula.** El número que muestra la notificación —"pectoral 12 series
  efectivas esta semana"— lo produce `src/domain/volume/` en el servidor y viaja
  en la respuesta. Un atajo que sume series es el motor duplicado en el único
  cliente que no se prueba en CI (riesgo R10, ahora literal).
- **No propone identificadores** más allá de sus claves de idempotencia, y nunca
  el pin de parámetros: ese lo deriva el servidor de la fecha lógica (ADR-003).
- **No crea catálogo.** Manda el nombre del ejercicio y el servidor lo resuelve
  contra el catálogo, sin coincidencia aproximada. Un nombre desconocido se
  rechaza. Si la captura pudiera crear ejercicios, un dictado mal entendido
  partiría en dos el histórico de un ejercicio y el volumen bajaría sin que nada
  falle.
- **No guarda la credencial dentro de sí mismo**: la lee de su archivo, porque
  compartir un atajo exporta sus acciones (ADR-009).
- **No lee planes para calcular.** La línea semanal (`GET /api/captura/v1/semana`,
  ADR-019) llega hecha: el servidor lee el plan con el alcance `captura` —sólo
  lectura, cuatro hojas— y la resta la hace el motor. Bajo `/api/captura` sigue sin
  haber rutas de planes.

## Las tres reglas que sostienen los invariantes en este cliente

- **Archivo primero, red después.** Toda captura se escribe en la cola local antes
  de intentar el envío y solo se borra con el acuse del servidor. Atajos aborta la
  ejecución cuando una acción falla y no ofrece captura de errores: el diseño no
  depende de atrapar el fallo, solo de que el fallo llegue después de la escritura.
- **Sesión vigente por antigüedad, no por fecha del día.** El archivo de sesión
  vale mientras `iniciada_en` tenga menos de seis horas. Es lo que mantiene entera
  la sesión de 23:50 a 00:15: comparar contra la fecha de hoy la partiría en dos,
  que es exactamente el fallo que la fecha lógica existe para evitar.
- **La bandera de calentamiento es el atajo que se ejecuta.** Dos atajos, `Serie`
  y `Calentamiento`, en lugar de un campo. Un diálogo menos y una bandera que no
  se puede olvidar.

## El contrato

- Versión en la ruta y crecimiento **aditivo**. El cliente es una copia en el
  dispositivo y iOS no tiene canal de actualización para atajos: cambiar el
  significado de un campo existente corrompe datos en silencio (riesgo R7).
- **Todo resultado que el atajo deba mostrar va en el cuerpo, con 200**: aceptado,
  rechazado por dominio y contador de la semana. Atajos no expone el código de
  estado, así que un rechazo que viaje solo en el estado es un rechazo invisible.
  Los códigos distintos de 2xx quedan para lo que el atajo no puede resolver
  —credencial inválida, límite de tasa, contrato desconocido—: ahí aborta, iOS
  muestra su error y el elemento se queda en la cola, que es lo correcto.
- Validación estricta de la forma: una carga desconocida se rechaza, no se
  interpreta como se pueda.
- **La carga de una serie va en libras** (`carga_lb`, ADR-023). `carga_kg`
  sigue aceptándose para los atajos ya instalados —el contrato crece, ningún
  campo cambia de significado—: se convierte con el factor exacto y la
  notificación pide actualizar el atajo. Las dos a la vez, o ninguna, es 400. El
  peso corporal sigue en kilos (`peso_kg`).

## Qué se versiona aquí

La lista de acciones de cada atajo, en Markdown y reproducible a mano. Un
`.shortcut` es un plist binario firmado: si se guarda, es un blob opaco y se trata
como tal. Cambiar un atajo obliga a ejecutar entera la lista del nivel de captura
de `docs/04-aceptacion.md`, que es revisión manual en el dispositivo y no prueba
automatizada.
