# Especificación — SIGIR Fitness

Escrita como encargo a un ingeniero senior. Se puede leer como documento o pegar
como prompt. Las respuestas a sus preguntas son los ADR (`01-decisiones.md`) y
los documentos 02 a 05.

## Contexto

Quien entrena fuerza con objetivo de hipertrofia necesita contestar: **¿cuánto
estímulo real recibió cada músculo esta semana, y es lo que planeaba?** Un press
de banca entrena el pectoral, pero también el tríceps y el deltoides anterior;
sumar «ejercicios» o «series» a secas no dice nada útil por músculo.

Usuarios: dos personas (el autor y un amigo, que puede no tener iPhone). El
modelo es multiusuario desde el día uno; no hay registro público.

## Jerarquía de prioridades ante conflicto

1. Corrección e integridad histórica de los datos.
2. Seguridad y propiedad de los datos por el usuario.
3. Preparación del modelo para multiusuario.
4. Simplicidad operativa y coste bajo.

## Restricciones declaradas

- **Coste cero**: «quiero que la página sea gratis, no quiero pagar nada».
- **Datos abiertos**: poder abrirlos en Excel.
- **Seguridad como requisito**: el modelo de amenaza es un usuario legítimo y
  todo internet. Datos de salud bajo la LFPDPPP (México).
- Mantenible por una sola persona; exportable en formato abierto.

## Definiciones operativas

- **Serie efectiva**: no es de calentamiento y su RIR es ≤ el umbral de la
  versión de parámetros que fija su sesión. Aporta a cada grupo su coeficiente.
- **Fecha lógica**: el día al que pertenece una sesión, puesto por el servidor
  desde la zona de la cuenta. No es el instante de cada serie.
- **Semana**: natural, lunes a domingo, para el resumen; semana del ciclo desde
  el ancla de la asignación para la comparativa.

## Las ocho trampas

| # | Trampa | Qué sale mal | Cómo se resuelve |
| - | ------ | ------------ | ---------------- |
| 1 | Series de calentamiento | Volumen inflado sistemáticamente | Bandera obligatoria; el motor las descarta él mismo; en la captura, la bandera es el atajo o el botón |
| 2 | Sesión que cruza la medianoche | Dos sesiones cortas en dos días | Fecha lógica de la sesión; el motor no ve la hora |
| 3 | Doble conteo de intensidad | Series × carga × reps × RIR cuenta dos veces | Conteo de series efectivas; el motor ni recibe carga ni repeticiones |
| 4 | Coeficientes editables | Editar reescribe el histórico | Parámetros versionados con pin por sesión |
| 5 | Cambiar de plan | El pasado parece incumplimiento | Plan versionado + asignación con rango; lo publicado es inmutable |
| 6 | Reintentos con mala conexión | Sesión y volumen duplicados | Clave de idempotencia por sesión y por serie |
| 7 | Coma flotante | `0.1 + 0.2 ≠ 0.3`; el residuo parece un déficit | Decimales como cadena; el motor calcula en centésimas enteras |
| 8 | Métricas sin definición | Una «salud» o unas calorías con precisión aparente | Fuera de alcance con condiciones de reapertura |

## Vistas, en orden de dependencia

REGISTRO → PRINCIPAL → PROYECCIÓN → COMPARATIVA. La comparativa da nombre al
proyecto y va la última a propósito: es una resta entre dos agregados y un error
suyo no lanza excepción, se manifiesta como una recomendación equivocada.

## Requisitos de seguridad

Autenticación con revocación inmediata; aislamiento por propietario verificado en
cada acceso; límites de tasa; nada de PII en registros; secretos fuera del
repositorio; exportación autenticada y limitada; borrado de cuenta real.

## Fuera de alcance

Métrica de «salud», gasto calórico por MET, registro público, cliente nativo o
Android, nutrición (fase 4, no comprometida).

## Las nueve preguntas

1. Plataforma de captura → ADR-001, superado por ADR-008.
2. Almacén → ADR-002, superado por ADR-010.
3. Modelo de cálculo y reproducibilidad → ADR-003.
4. Stack → ADR-004.
5. Métricas dudosas → ADR-005.
6. Capas → ADR-006.
7. Plan por fases → `03-fases.md`.
8. Criterios de aceptación → `04-aceptacion.md`.
9. Riesgos → `05-riesgos.md`.
