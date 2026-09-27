---
description: Verifica errores de verdad — corre todo lo que CI corre, busca donde ninguna prueba mira y reproduce cada hallazgo antes de reportarlo
argument-hint: "[alcance: p. ej. «lo sin commitear», «src/server/», «y arregla los dos primeros»]"
---

# Verificar errores

Alcance: $ARGUMENTS

Si no se dice nada, revisa el árbol de trabajo completo, con atención especial a
lo que todavía no está commiteado: es lo que nadie ha mirado dos veces.

## El principio

**CI verde es el suelo, no el hallazgo.** Si al terminar sólo puedes decir «todo
pasa», no verificaste: repetiste lo que la máquina ya hace en cada push. Los
errores que importan viven donde ninguna prueba mira, y se reconocen porque
fallan **en silencio**: el proceso muere sin que nadie lo vea, un límite sigue
contestando 429 a quien no toca, una consulta se sale de la transacción que fija
identidad y el aislamiento deja de aislar sin que nada falle.

**Ningún hallazgo se reporta sin un experimento que lo reproduzca.** Una sospecha
razonada no es un error verificado, y decirlo como si lo fuera hace perder el
tiempo a quien lo lee.

## Paso 1 — correr todo lo que CI corre, incluido lo que en local se salta solo

Sigue `.github/workflows/ci.yml` como lista, no de memoria.

```bash
npm run lint          # Biome + tsc de la API y del cliente
npm test              # ya no depende de nada externo (ADR-010)
npm run build:api
npm run build:web     # un import que Vite no resuelve no lo ve ni tsc ni Vitest
bash deploy/ensayo.sh # arranca el proceso de verdad, captura, respalda, restaura
```

Dos avisos sobre lo que el conteo esconde:

- **Antes** cuatro archivos y treinta y nueve pruebas se saltaban sin
  `DATABASE_URL_INTEGRACION` y la suite decía «passed» igual. Ya no hay variable
  que poner; si vuelves a ver pruebas saltadas, averigua cuáles y por qué antes
  de decir que todo pasa.
- **`src/almacen/xlsx.test.ts` sí se salta sola** donde no haya LibreOffice, y la
  que se salta es la única que responde a la pregunta del ADR-010: ¿lo abre una
  hoja de cálculo? En CI tiene su propio trabajo. En local, instálalo o di que esa
  no la comprobaste.

## Paso 2 — mirar donde ninguna prueba mira

Aquí es donde aparecen los errores. Preguntas que hay que contestar mirando el
código, no suponiendo:

- **Lo que prometen los documentos contra lo que hace el código.** `README.md`,
  `.env.example`, `deploy/README.md` y los ADR describen cómo corre esto —un solo
  proceso, un túnel delante, el mismo servidor sirviendo el cliente—. Todo lo que
  dependa de la dirección del cliente, del esquema de la URL o de las cabeceras
  cambia de significado detrás del túnel.
- **Qué pasa cuando el almacén se mueve debajo.** Es el equivalente de que se
  caiga la base, y aquí es más probable, porque el archivo está hecho para
  editarse a mano. Pruébalo de verdad con el servidor arriba: abre el `.xlsx` y
  guárdalo, bórralo, déjalo a medio escribir, quítale permisos de escritura,
  mete una celda imposible. ¿Falla diciendo hoja y fila, o pisa la edición?
- **Dos escrituras a la vez sobre el mismo libro.** La cola por archivo es lo
  único que lo impide. Lánzale veinte peticiones simultáneas y comprueba que no
  se pierde ninguna y que el archivo sigue abriendo.
- **EventEmitters sin escucha de `error`.** En Node eso no es un log perdido: es
  el proceso entero. Ya no hay pool de `pg`, pero sí descriptores de archivo y
  procesos hijo.
- **El orden entre validación y autenticación.** Un esquema que se valida antes
  de comprobar la credencial contesta 400 donde la tabla del contrato promete
  401, y le regala la forma del contrato a quien no está autenticado.
- **Los invariantes de `CLAUDE.md`.** Propiedad, calentamiento, fecha lógica,
  versión de plan, versión de parámetros, coeficientes, unidad canónica: ¿algún
  camino nuevo los rodea? ¿Alguna escritura llega al almacén sin pasar por
  `conAlmacenDeUsuario`, o sea sin identidad y sin alcance?
- **Los agujeros de las propias pruebas de arquitectura.**
  `arquitectura.test.ts` caza los `import` de `node:fs` y las llamadas a
  `.conTransaccion(`, y con eso no ve un módulo que reciba el depósito por
  parámetro y lo use, ni uno que importe `fs` con un nombre indirecto. Un control
  que no puede controlar algo hay que decirlo, aunque esté en verde.
- **Los dos caminos de captura.** `/api/captura/v1` y `/api/registro/v1` llaman al
  mismo servicio a propósito. ¿Sigue siendo así, o alguno se ha quedado con lógica
  propia? Y al revés: ¿acepta alguno la credencial del otro?
- **Lo sin commitear contra lo que dicen los documentos.** Un comando que
  `CLAUDE.md` declara inexistente pero que `.env.example` sigue citando, una
  pieza marcada como pendiente que ya está hecha.

## Paso 3 — reproducir

Cada hallazgo, un experimento. Scripts en el directorio de scratchpad, nunca en
el repositorio. Pega la salida real en el informe; es lo que convierte una
opinión en un hecho.

Notas prácticas de este entorno:

- `sleep` en primer plano está bloqueado. Para esperar: `curl --retry 40
  --retry-delay 1 --retry-connrefused --retry-all-errors`, que además sirve para
  esperar a que el servidor levante.
- El shell es fish: cita los globos de `grep --include='*.ts'` o no coinciden.
- `dist/` está en `.gitignore`; compilar no ensucia el árbol. Comprueba
  `git status` al terminar igual.
- Nunca apuntes `DATOS_DIR` al almacén de verdad. Monta uno temporal: un
  experimento que corrompa un libro real no tiene deshacer.

Si algo no se puede reproducir, va como sospecha marcada como tal, con lo que
haría falta para confirmarla. Nunca mezclado con lo confirmado.

## Paso 4 — reportar

- Primero, en una tabla corta, qué se ejecutó y qué dio: esa es la base.
- Después los errores confirmados, ordenados por lo que rompen, cada uno con
  `archivo:línea`, qué pasa en producción y la salida del experimento.
- Aparte y claramente marcados, los menores.
- Di explícitamente qué quedó sin revisar. No infles: dos errores reproducidos
  valen más que diez sospechas.

## Si además piden arreglarlos

- Pruebas en el mismo commit, y sin nada externo: toda la batería corre así
  desde el ADR-010, y una prueba que necesite algo instalado se salta sola el día
  que no esté.
- **Comprueba también el caso positivo.** Que el control deje de disparar mal no
  sirve si además dejó de disparar bien. Quitar el síntoma no es arreglar.
- Repite el experimento original: tiene que dar lo contrario que antes.
- Sincroniza `CLAUDE.md`, `.claude/rules/` y `.env.example` en cuanto el arreglo
  añada o cambie una regla, para que nadie lo deshaga sin querer.
- Antes de darlo por hecho: `npm run lint`, `npm test`, `npm run build:api`,
  `npm run build:web` y `bash deploy/ensayo.sh`.
- Si una decisión del arreglo va más allá de lo que se pidió, dilo aparte y di
  por qué, para que la pueda recortar quien manda.
