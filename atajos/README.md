# Atajos de iOS

La captura entre series es la app **Atajos** de iOS hablando con
`/api/captura/v1` (ADR-008). Se versiona la **lista de acciones** en Markdown,
reproducible a mano: un `.shortcut` es un plist binario firmado que no se revisa
en un diff.

**El atajo pregunta, escribe, envía y notifica; no calcula.** La única cifra de
volumen que enseña es el `mensaje` del servidor. No crea ejercicios, no propone
más identificadores que sus claves de idempotencia y nunca el pin de parámetros.

## Estado en iCloud Drive › Atajos › SIGIR

| Archivo | Qué es |
| ------- | ------ |
| `credencial.json` | `{"servidor": "https://…", "portador": "…"}`. Lo da la web (Dispositivos → Emitir) y **nunca** va dentro de un atajo: compartir un atajo exporta sus acciones. `servidor` es `URL_PUBLICA` si el servidor la declara y, si no, la dirección desde la que se emitió: emítelo desde la URL del túnel, no desde `127.0.0.1` (la pantalla avisa si el teléfono no la va a alcanzar). |
| `catalogo.json` | La lista de ejercicios, bajada por `Configurar`. |
| `sesion-vigente.json` | `{"clave": "…", "iniciada_en": "…"}`. Vale mientras tenga **menos de seis horas**. |
| `cola/` | Un JSON por operación: `{"ruta": "/api/captura/v1/serie", "cuerpo": {…}}`. Un archivo por operación evita reescribir una cola única que iOS podría truncar a mitad. |
| `rechazos/` | Lo que el servidor rechazó por dominio. Nunca se descarta nada. |

## Tres reglas que sostienen los invariantes

1. **Archivo primero, red después.** Toda captura se guarda en `cola/` antes de
   enviarse y sólo se borra con el acuse. Atajos aborta cuando una acción falla y
   no ofrece captura de errores: el diseño no depende de atrapar el fallo, sólo de
   que llegue después de la escritura.
2. **Sesión vigente por antigüedad, no por fecha**: la serie de las 00:15 viaja
   con la clave de la sesión de las 23:50 y el servidor le pone la fecha de ésa.
3. **La bandera de calentamiento es el atajo**: `Serie` y `Calentamiento`, en vez
   de un campo que olvidar.

## Claves de idempotencia sin acción de UUID

El servidor acepta claves de 8 a 64 caracteres `[A-Za-z0-9_-]`. Se componen con
**Texto**: `s-` + **Fecha actual** formateada `yyyyMMddHHmmss` + `-` + **Número
aleatorio** entre 100000 y 999999. Prefijo `s-` para sesión y `e-` para serie.

## Los siete atajos

Constrúyelos en este orden. Los nombres de las acciones son los de iOS en
español.

### 1. Configurar (una vez por teléfono)

1. **Obtener archivo** `Atajos/SIGIR/credencial.json` (desactiva «Mostrar selector
   de documentos»). → **Obtener diccionario de la entrada**.
2. **Obtener valor del diccionario** `servidor` → variable *Servidor*;
   `portador` → variable *Portador*.
3. **Obtener contenido de URL** `Servidor` + `/api/captura/v1/catalogo`, método
   GET, cabecera `Authorization: Bearer ` + *Portador*.
4. **Guardar archivo** en `Atajos/SIGIR/catalogo.json` (sobrescribir).
5. **Mostrar notificación**: «SIGIR configurado» y el número de ejercicios.

### 2. Sincronizar

1. Leer *Servidor* y *Portador* como en `Configurar`.
2. **Obtener contenido de la carpeta** `Atajos/SIGIR/cola` → **Ordenar** por nombre.
3. **Repetir con cada** archivo:
   1. **Obtener diccionario** del archivo; `ruta` y `cuerpo`.
   2. **Obtener contenido de URL** `Servidor` + `ruta`, método POST, cabecera
      `Authorization`, cuerpo JSON = `cuerpo`. Si el servidor contesta 401, 409,
      426, 429 o 500, Atajos aborta y **el archivo se queda en la cola**.
   3. **Si** `estado` es `aceptada` → **Eliminar archivos** (sin confirmar) y
      **Mostrar notificación** con `mensaje`.
   4. **Si no** → **Guardar archivo** en `rechazos/` con el mismo nombre,
      **Eliminar** el de la cola y **Mostrar notificación** con `mensaje`.
4. **Contar** los archivos que quedan en `cola/` y **Mostrar notificación**:
   «N pendientes» (**cero también**).

### 3. Serie

1. **Obtener archivo** `sesion-vigente.json` (sin error si no existe).
2. **Si** no existe, o **Obtener tiempo entre fechas** (`iniciada_en`, ahora) en
   horas es **6 o más** → nueva *ClaveDeSesion* (`s-…`) e *IniciadaEn* = **Fecha
   actual** en ISO 8601; **Guardar archivo** `sesion-vigente.json`.
3. **Elegir de la lista** con los nombres de `catalogo.json` → *Ejercicio*.
4. **Preguntar por entrada** (número) «Repeticiones» → *Repeticiones*.
5. **Preguntar por entrada** (número decimal) «Libras» → *Carga*. La carga va en
   libras (ADR-023): lo que marcan los discos o la columna de placas.
6. **Elegir de la lista** 0 a 10, «RIR» → *RIR*.
7. **Diccionario**: `ruta` = `/api/captura/v1/serie`; `cuerpo` = `{ sesion: {
   clave, iniciada_en }, serie: { clave: e-…, ejercicio, repeticiones, carga_lb,
   rir, calentamiento: false, realizada_en: ahora ISO 8601 } }`. Un atajo anterior
   que todavía mande `carga_kg` sigue funcionando: el servidor la convierte a
   libras y la notificación lo dice («60 kg = 132.28 lb…»), pero conviene
   actualizarlo.
8. **Guardar archivo** en `cola/<clave de la serie>.json` **antes** de nada más.
9. **Ejecutar atajo** `Sincronizar`.

### 4. Calentamiento

Igual que `Serie` sin el paso 6: `calentamiento: true` y **sin** `rir`.

### 5. Terminar entrenamiento

1. **Obtener archivo** `sesion-vigente.json`; si no existe, notificar «No hay
   entrenamiento abierto» y terminar.
2. **Diccionario** `ruta` = `/api/captura/v1/sesion/cerrar`, `cuerpo` = `{ sesion: {
   clave }, finalizada_en: ahora ISO 8601 }` → **Guardar** en `cola/`.
3. **Eliminar** `sesion-vigente.json`.
4. **Ejecutar atajo** `Sincronizar` (la notificación trae el resumen del servidor).

### 6. Peso

1. **Buscar muestras de Salud**: masa corporal, la más reciente de hoy; si no hay,
   **Preguntar por entrada** (número decimal).
2. **Diccionario** `ruta` = `/api/captura/v1/peso`, `cuerpo` = `{ peso_kg,
   medido_en: ahora ISO 8601 }` → **Guardar** en `cola/` → **Ejecutar**
   `Sincronizar`.

### 7. Semana (ADR-019)

1. Leer *Servidor* y *Portador* como en `Configurar`.
2. **Obtener contenido de URL** `Servidor` + `/api/captura/v1/semana`, método GET,
   cabecera `Authorization`.
3. **Mostrar notificación** con el valor `mensaje` del diccionario. El atajo no
   calcula nada: la frase («Pectoral 5.00 de 7.00») viene hecha del servidor.

## Automatizaciones

`Semana` a una hora fija (p. ej. el domingo a las 20:00): el aviso semanal en el
teléfono. No sustituye a la comparativa web. `Sincronizar` al conectarse al Wi-Fi
de casa y a una hora fija. Lo que quede en la
cola se ve en el resumen web como **frescura** («última serie recibida: hace 9
días»), nunca como «pendientes»: la web no ve el teléfono.

## Antes del iPhone

`./atajos/comprueba-servidor.sh https://tu-servidor "<portador>"` descarta lo que
no es del dispositivo: URL, credencial, catálogo, el 401 y el 426 donde el atajo
espera abortar. No escribe nada.

## Supuestos de iOS aún sin verificar

Que el código de estado HTTP no es legible desde el atajo; que leer el archivo de
credencial no pide permiso cada vez; que guardar un JSON es atómico; que un
número decimal se convierte a texto con coma en español (el servidor admite coma
y punto). **La prueba del iPhone los cierra** (`PRUEBA-MANUAL.md`).
