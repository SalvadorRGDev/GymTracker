# Criterios de aceptación

Cada criterio dice **cómo se manifiesta el fallo** y en qué nivel se prueba. Un
criterio que no puede fallar no es un criterio. Las pruebas se comprueban por
mutación: quitar el mecanismo debe poner en rojo su caso y sólo el suyo.

## Niveles

| Nivel | Qué comprueba | Dónde |
| ----- | ------------- | ----- |
| Dominio | La aritmética del motor, sin disco ni reloj | `src/domain/volume/*.test.ts` |
| Almacén | Lo que el almacén impide aunque el servicio falle | `src/almacen/almacen.test.ts` |
| Hoja de cálculo | LibreOffice abre y re-guarda sin cambiar un decimal | `src/almacen/xlsx.test.ts` (se salta sola sin LibreOffice; en CI tiene su trabajo) |
| API | Autorización, alcance, idempotencia, aislamiento con **dos propietarios** | `src/api/*.integracion.test.ts` |
| Orden de comprobaciones | Credencial antes que esquema en **todas** las rutas con esquema | `src/api/orden-de-comprobaciones.test.ts` |
| Arquitectura | Pureza del motor, fronteras del almacén, un solo servicio de escritura | `pureza.test.ts`, `src/server/arquitectura.test.ts`, `src/api/arquitectura.test.ts` |
| Catálogo | Forma, coherencia y plantillas en rango con el motor real | `src/catalogo/catalogo.test.ts` |
| Cliente | Lo que se ve y alcanza un lector de pantalla; que el nivel y los totales son los del servidor | `src/web/**/*.test.tsx` (jsdom) |
| Lenguaje visual | Contraste, escala monótona, apagados, movimiento | `src/server/lenguaje-visual.test.ts` |
| Operación | Arrancar, capturar, respaldar, restaurar, comparar | `deploy/ensayo.sh` |
| Captura | Cola, sesión vigente, bandera, pantalla bloqueada | **A mano en el iPhone** (`atajos/PRUEBA-MANUAL.md`) |

## Criterios del spec

| Caso | Cómo se vería el fallo | Estado |
| ---- | ---------------------- | ------ |
| Sesión que cruza la medianoche | Dos sesiones cortas; la serie de las 00:15 en otro día | En verde en motor, almacén y API · pendiente en el atajo (manual) |
| Cambio de plan a mitad del histórico | Las semanas viejas comparadas con el plan nuevo | En verde de punta a punta: «la semana del 3 de marzo contra el plan vigente el 3 de marzo» (`comparativa.integracion.test.ts`) |
| Edición de coeficiente con datos previos | El total de la semana pasada cambia | En verde |
| Edición del umbral con datos previos | Idem | En verde |
| Guardado duplicado por reintento | Doble volumen | En verde (sesión y serie) |
| Serie en la frontera del umbral | Cuenta o no según el redondeo del día | En verde, determinista |
| Ejercicio que aporta a varios grupos | Un grupo sin su parte | En verde |
| Semana sin datos | Error o `null` en vez de cero | En verde |
| Los dos lados de la resta salen de la misma función | Una diferencia distinta de cero por redondear distinto | En verde (`comparativa.test.ts`: hacer justo lo planeado da cero, también con coeficientes fraccionarios) |
| Una ventana con dos versiones de parámetros | Reglas mezcladas sin decirlo | En verde: se declaran, y cada día se lee con la suya en los dos lados |
| Una sesión hecha otro día dentro de la semana del ciclo | Déficit un día y superávit otro | En verde: la ventana suma cero; el detalle lo rotula como desplazamiento |
| Vigilancia del umbral (R6) | Un umbral que decide el resultado sin que nadie lo vea | En verde: más del 15 % con 30 efectivas o más, en enteros |

## Mapa muscular (ADR-018)

| Caso | Cómo se vería el fallo | Dónde |
| ---- | ---------------------- | ----- |
| Cortes en sus fronteras (0, 0.01, 3.99, 4.00, 11.99, 12.00, 19.99, 20.00) con dos propietarios | 11.99 pintado como alto | `lectura.integracion.test.ts` |
| `zona` nula en un grupo renombrado | Un grupo propio heredando el color de «pectoral» | `lectura.integracion.test.ts` |
| Escala presente y ordenada | Leyenda desincronizada de la figura | `lectura.integracion.test.ts` |
| La región se pinta según el `nivel` aunque la cifra diga otra cosa | El cliente recalculando | `resumen.test.tsx` |
| El control de cara cambia `aria-pressed` y la clase de giro; con movimiento reducido no hay animación | Giro que ignora la preferencia | `resumen.test.tsx` |
| Grupos sin `zona` en «Sin lugar en el modelo» | Un cero silencioso | `resumen.test.tsx` |
| Semana vacía en neutro y con el texto | Figura de muestra coloreada | `resumen.test.tsx` |
| Los 16 grupos tienen región | Un grupo invisible | `figura/rutas.test.ts` |
| Luminancia monótona en claro y oscuro; contraste de rótulos | Escala ilegible en gris o con deuteranopía | `lenguaje-visual.test.ts` |
| Deuteranopía: claridad monótona y niveles separados (ΔE ≥ 8) con la escala simulada; déficit y superávit distinguibles | Dos niveles o los dos signos que se confunden | `lenguaje-visual.test.ts` (Machado 2009) |
| A mano: el giro en Safari de iOS | — | pendiente |

## Lo que deliberadamente no se prueba

La exactitud fisiológica de los coeficientes (convención, no medición); que los
rangos acierten con cada persona; el rendimiento (presupuesto de 200 ms p95 para
el resumen, a medir con histórico); los atajos y Safari de iOS en CI.
