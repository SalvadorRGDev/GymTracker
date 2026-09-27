# Prueba manual de los atajos (nivel de captura)

Es el único nivel que no corre en CI. Cambiar un atajo obliga a repetirla entera.
Antes: `./atajos/comprueba-servidor.sh https://tu-servidor "<portador>"` en verde.

| # | Paso | Resultado esperado |
| - | ---- | ------------------ |
| 1 | `Configurar` con una credencial recién emitida | «SIGIR configurado» con el número de ejercicios |
| 2 | `Serie` desde la pantalla bloqueada | Notificación con el total de la semana del servidor; el historial web la muestra |
| 3 | `Calentamiento` | La notificación dice que no cuenta volumen; el historial la marca |
| 4 | Modo avión → `Serie` | El archivo queda en `cola/`; `Sincronizar` aborta y la cola conserva el archivo |
| 5 | Quitar el modo avión → `Sincronizar` | Se envía, se borra de la cola y termina diciendo «0 pendientes» |
| 6 | Matar el atajo a mitad (tras guardar en la cola) | El archivo sigue en `cola/`; al sincronizar entra una vez |
| 7 | `Sincronizar` dos veces seguidas con el mismo archivo restaurado a mano | La segunda dice «Ya estaba registrada»: no hay doble volumen |
| 8 | Una serie a las 23:50 y otra a las 00:15 | Una sola sesión en el historial, con la fecha del día de las 23:50 |
| 9 | Más de seis horas sin series y otra `Serie` | Sesión nueva |
| 10 | Dictar un ejercicio que no existe (editando `catalogo.json`) | Notificación de rechazo; el archivo pasa a `rechazos/`; nada se crea en el catálogo |
| 11 | `Terminar entrenamiento` | Notificación con el resumen de la sesión; el historial la muestra cerrada |
| 12 | `Peso` con dato de Salud | «Peso del … kg» |
| 13 | Revocar la credencial en la web y `Serie` | 401: aborta y la cola conserva el archivo |
| 14 | Compartir un atajo con otra persona | El atajo compartido no lleva la credencial (vive en `credencial.json`) |
| 15 | Cambiar la hora del teléfono a un año después y `Serie` | La sesión entra con «Fecha por confirmar» en el historial |
| 16 | Cambiar la URL a `/api/captura/v0/…` | 426: aborta; el cuerpo trae la dirección de reinstalación |
| 17 | `Semana` con un plan asignado (y la automatización del domingo) | Notificación «Semana N de «Plan» (hasta el …): Grupo X de Y · …», lo que el plan pide en mayor cantidad primero; sin plan, lo dice |

## Evidencia

| Fecha | iOS | Modelo | Resultado | Notas |
| ----- | --- | ------ | --------- | ----- |
| | | | | |

Supuestos que esta prueba cierra: el estado HTTP no es legible desde el atajo;
leer `credencial.json` no pide permiso cada vez; guardar un JSON es atómico; la
conversión de decimales a texto (coma o punto).
