# Runbook

Un proceso de Node sirve la API y el cliente, escucha en `127.0.0.1` y lo publica
un túnel gratuito (ADR-011). Coste cero: no hay hosting, base gestionada ni
dominio.

## Requisitos

Node.js **22.9 o superior**. Para compartirlo, un túnel. Para la prueba de hoja
de cálculo en local, LibreOffice (opcional: sin él esa prueba se salta sola, y
entonces di que no la comprobaste).

## Desde cero

```bash
npm ci
npm test && npm run lint          # todo en verde antes de nada

cp .env.example .env
#   SESSION_SECRET  → openssl rand -hex 32
#   ATAJOS_URL      → https a donde mandar a reinstalar un atajo viejo
#   URL_PUBLICA     → la dirección https del túnel (va en credencial.json)

npm run build:api
npm run build:web

# Una cuenta por persona: correo, zona IANA y umbral de RIR. La contraseña se
# teclea (12 caracteres o más), nunca va por argumento.
npm run alta -- tucorreo@ejemplo.com America/Mexico_City 4

npm start                         # http://127.0.0.1:3000
```

Primer uso: entrar → **Catálogo → Importar catálogo base** (elegir equipamiento,
afinar la lista, importar) → **Registrar** una serie → el **Resumen** ya muestra el
número y el mapa muscular. Para rutinas: **Rutinas → Nueva rutina desde una
plantilla → publicar → asignar**, y mirar la **Proyección**.

## Compartirlo

| Opción | Comando | A favor | En contra |
| ------ | ------- | ------- | --------- |
| Cloudflare Tunnel | `cloudflared tunnel --url http://127.0.0.1:3000` | Nada que instalar en la otra punta; HTTPS | La URL cambia en cada arranque (rompe los atajos); un nombre fijo exige dominio propio, que cuesta |
| **Tailscale** | `tailscale up` y `tailscale serve --bg 3000` | Red privada, **nombre fijo** (los atajos siguen funcionando), HTTPS real `ts.net` | La otra persona instala un cliente |

La cookie es `Secure`: sobre HTTP plano el navegador la descarta sin avisar
(entrar da 204 y la siguiente petición 401). Por eso `tailscale serve`, no el
puerto a pelo. En `127.0.0.1` los navegadores la aceptan.

Declara `URL_PUBLICA` con la dirección del túnel en cuanto la tengas fija. Es la
que va en el `credencial.json` de cada iPhone. Sin ella, el servidor usa la
dirección del navegador desde el que emites (su `Origin`), y sólo en último
lugar el `Host` de la petición, que un túnel puede reescribir a `127.0.0.1`. Si
la dirección que va a salir no le sirve al teléfono —local o sin https—, la
pantalla lo dice al emitir.

## Datos

- **Respaldo automático**: antes de cada escritura, copia en `datos/respaldos/`
  (últimas 20 + la primera de cada día). Protege del error de esta tarde, no del
  disco muerto.
- **Respaldo completo**: `bash deploy/respaldo.sh <destino>`; con
  `BACKUP_RECIPIENT=<huella-gpg>` sale cifrado. Se niega a escribir dentro de
  `datos/`.
- **Prueba de restauración**:
  `ESPERADO_PROPIETARIOS=2 ESPERADO_SESIONES=87 bash deploy/restaura-verifica.sh <archivo>`.
  Restaura en un temporal, carga cada libro (valida todo) y compara conteos. Sin
  conteos declarados, falla.
- **Restaurar de verdad**: con el servidor parado, extraer el `tar.gz` sobre
  `datos/`.
- **Llevarlo a otra máquina** conservando el histórico: parar el servidor, copiar
  `datos/` entero, `npm run verifica -- datos` (debe decir los propietarios que
  esperas), y usar el mismo `SESSION_SECRET` si quieres que sigan valiendo las
  sesiones y las credenciales de los atajos. `npm run alta` crea cuentas VACÍAS:
  no copia nada.

## Baja de una cuenta

`npm run baja -- correo@ejemplo.com` (se confirma tecleando el correo). Borra el
libro, sus filas de `cuentas.xlsx` y las copias automáticas con sus datos; puede
hacerse con el servidor arriba (la cuenta deja de autenticar en el acto). Los
respaldos completos externos se borran a mano: `docs/11-privacidad.md`.

## Editar el Excel a mano

Se puede: es la razón del ADR-010. No conviertas ninguna columna a número o
fecha (las celdas están en formato texto: escribe `62.5` con punto). Si el
servidor tenía el archivo cargado, su siguiente escritura fallará con 409 en vez
de pisarte: reintenta. Después, `npm run verifica -- datos`, que valida todo sin
arrancar el servidor y dice hoja, fila y columna si algo no cuadra.

## Problemas conocidos

| Síntoma | Causa | Solución |
| ------- | ----- | -------- |
| Entra (204) y luego todo es 401 | Cookie `Secure` sobre HTTP | HTTPS: `tailscale serve` o cloudflared |
| Los atajos dejan de conectar | La URL del túnel público cambió | Tailscale, o reconfigurar el atajo |
| «Configurar» no conecta con un teléfono nuevo | El `credencial.json` apunta a `127.0.0.1` (se emitió desde local y sin `URL_PUBLICA`) | Declarar `URL_PUBLICA`, emitir otra y revocar ésa |
| El servidor no arranca tras editar el Excel | Una celda inválida o una columna desconocida | Leer hoja/fila/columna del error; `npm run verifica` |
| «0.00» en un grupo que sí se entrenó | El ejercicio no tiene coeficientes en la versión que fijó la sesión | El resumen avisa de las series «sin mapeo»; revisar el catálogo |
| 409 «los datos cambiaron mientras se guardaba» | Alguien guardó el Excel a mano a la vez | Reintentar; no se escribió nada |

## Rotar el secreto de sesión

Cambiar `SESSION_SECRET` y reiniciar. Cierra **todas** las sesiones web y anula
**todas** las credenciales de captura: emite una nueva en Dispositivos y ponla en
`credencial.json` de cada iPhone. Es el precio correcto ante sospecha de
compromiso.

## Arranque automático (recomendado)

Un servicio de usuario de systemd para el servidor y otro para el túnel, con
`Restart=on-failure`, reduce el riesgo R8 (servidor apagado):

```ini
# ~/.config/systemd/user/sigir.service
[Unit]
Description=SIGIR Fitness
After=network-online.target

[Service]
WorkingDirectory=%h/Proyectos/gymtracker-V2
ExecStart=/usr/bin/npm start
Restart=on-failure

[Install]
WantedBy=default.target
```

`systemctl --user enable --now sigir` (y `loginctl enable-linger $USER` para que
arranque sin iniciar sesión).

## El ensayo

`bash deploy/ensayo.sh` monta un directorio temporal (nunca toca `datos/`), da de
alta una cuenta, arranca el proceso compilado y comprueba **veintidós**
afirmaciones: el alta, el 401, el cliente en la raíz y en sus rutas, el 404 de
API, los recursos compilados, la cookie, la importación del catálogo base, la
credencial (y que su archivo apunta a la URL del navegador), la captura del atajo
y su idempotencia, que el atajo no llega a las rutas de planes, la web en la
misma sesión, que la cookie no vale como portador, el rechazo con 200, que lo
capturado hoy cuenta (ADR-013), el grupo sin mapeo a cero, el contrato del mapa
muscular, la exportación sin huellas, la comparativa con la línea semanal del
atajo, que respaldar y restaurar reproduce el almacén, y que la baja borra el
libro, las credenciales y las copias automáticas con sus datos.
