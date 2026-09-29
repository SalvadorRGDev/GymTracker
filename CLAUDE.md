# SIGIR Fitness — reglas del proyecto

Aplicación personal de seguimiento de fuerza: **series efectivas por grupo
muscular y semana**, lo planeado contra lo ejecutado. Dos personas, coste cero,
un proceso de Node en la máquina del autor publicado por un túnel, datos en
libros de Excel. Documento maestro: `Plan.md`. Decisiones: `docs/01-decisiones.md`
(ADR-001 a 020). Reglas por directorio: `.claude/rules/`.

Código, comentarios, documentación e identificadores en **español**: el dominio
se piensa en español y traducir a medias hace que dos personas llamen distinto a
lo mismo.

## Estado

- Fases 0, 1, 2 y **3** en código: la **comparativa** con su vigilancia del
  umbral, la simulación, la línea semanal del atajo y el mapa «Comparado con el
  plan» (ADR-019); fase de producto
  (catálogo base, rangos, rutinas); dirección visual moderna y **mapa muscular
  del resumen** (ADR-017 y 018); borrar serie o sesión, confirmar fecha y
  archivar ejercicio desde la web.
- Baja de cuenta real con `npm run baja` y aviso de privacidad
  (`docs/11-privacidad.md`). Alta pública opcional desde la web con tope
  (`ALTA_ABIERTA`, `MAXIMO_DE_CUENTAS`; ADR-020).
- Pendiente: **probar los atajos en un iPhone real** (`atajos/PRUEBA-MANUAL.md`).

## Comandos

```bash
npm test                 # Vitest: dominio, almacén, API, catálogo, cliente (jsdom), lenguaje visual
npm run lint             # Biome + tsc del servidor + tsc del cliente
npm run build:api        # dist/ (servidor)
npm run build:web        # dist/web (cliente)
bash deploy/ensayo.sh    # proceso compilado de verdad: veintidós afirmaciones, respalda, restaura y da de baja
npm run alta -- correo zona umbral     # cuenta nueva; la contraseña se teclea
npm run verifica -- datos              # valida el almacén sin escribir nada
npm run baja -- correo                 # borra la cuenta de verdad; se confirma tecleando el correo
npm start                              # http://127.0.0.1:3000
npm run dev / npm run dev:web          # API vigilando dist/ · Vite con /api reenviado
```

Antes de dar algo por hecho: `npm run lint`, `npm test`, `npm run build:api`,
`npm run build:web` y `bash deploy/ensayo.sh`. **Nunca** apuntes `DATOS_DIR` al
almacén real en un experimento: un libro corrompido no tiene deshacer.

## Invariantes del dominio

- **El motor (`src/domain/volume/`) es puro** y es el ÚNICO sitio donde se
  calcula volumen. Sin reloj, sin red, sin disco, sin importar nada de fuera
  (`pureza.test.ts`). El plan se expande con `expandePlan` a la misma entrada que
  lo ejecutado y pasa por la misma `agrega`.
- **Centésimas enteras** en el motor; todo decimal viaja y se guarda como
  **cadena**. El único redondeo es el del total por grupo del lado del plan
  (objetivo fraccionario × coeficiente fraccionario), a la mitad par.
- **Calentamiento** como variante del tipo; el motor lo descarta él mismo.
- **Fecha lógica** de la sesión, puesta por el servidor desde la zona de la
  cuenta; en la web, con el reloj del servidor. Nunca se convierte a `Date` para
  pintarla.
- **Parámetros versionados** con pin por sesión; congelados en cuanto una sesión
  los fija; la versión que nadie fija se reescribe en sitio (ADR-013).
- **Planes**: versión publicada inmutable; asignación con ancla (día 1 del
  ciclo); una asignación que cubre sesiones no se borra, no se re-apunta, no se le
  mueve el ancla y sólo se cierra por arriba.
- **Idempotencia** por clave de sesión y de serie, generadas por el cliente.
- **Almacén**: invariantes en `src/almacen/invariantes.ts` y en ningún otro sitio;
  sólo `src/almacen/` abre archivos; el depósito se construye en `src/server/`;
  toda operación pasa por `conAlmacenDeUsuario` con alcance **obligatorio**;
  `ALCANCE_DE_HOJA` por afirmación (falla cerrado).
- **Credencial antes que esquema** en toda ruta con esquema (`attachValidation`),
  y también ante un JSON ilegible (`CUERPO_ILEGIBLE`). Ajv estricto: sin
  coerción de tipos y sin borrar propiedades de más.
- **Detrás del túnel, `Host` no es la dirección pública**: `credencial.json`
  apunta a `URL_PUBLICA`, si no al `Origin` del navegador, y avisa si el teléfono
  no la alcanzará (`src/api/servidor-publico.ts`).
- **`WEB_DIR` se publica entero**: el servidor no arranca si contiene
  `DATOS_DIR`, y de él sólo salen las extensiones de `build:web`, sin ocultos.
- **El cliente no agrega ni recalcula**, tampoco el nivel de color del mapa: lo
  decide el servidor (`src/api/escala.ts`).

## Qué no hacer

- Sumar, promediar o redondear volumen fuera de `src/domain/volume/` (riesgo R10).
- Dar un valor por omisión al alcance, al umbral o a `veces`.
- Guardar agregados: son un segundo sitio donde vive la verdad.
- Crear ejercicios desde la captura, o aceptar coeficientes del navegador.
- Poner vidrio fuera de la cabecera y del detalle flotante, o un semáforo en los
  rangos de referencia.
- Usar librerías de hojas de cálculo (convierten tipos), JWT, Google Fonts o una
  séptima dependencia de ejecución sin justificarla en el commit.
- Inventar datos de ejemplo en una gráfica o en la figura.
- Tocar el esquema de una hoja de forma destructiva sin ADR y sin respaldo.

## Convenciones

TypeScript `strict` con `noUncheckedIndexedAccess`, `exactOptionalPropertyTypes`,
`noPropertyAccessFromIndexSignature` y `verbatimModuleSyntax`. Imports con `.js`
en el servidor (nodenext) y sin extensión en el cliente (bundler). Los tipos que
consume el cliente viven en `contrato.ts`/`tipos.ts` sin nada ejecutable. Las
pruebas no usan instantáneas y los validadores se ejercen con datos rotos a
propósito; los controles comprueban que detectan (mutación).
