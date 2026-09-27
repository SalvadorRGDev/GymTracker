# Catálogo base

`src/catalogo/datos/*.json`, validado al importar el módulo (al arrancar). Es
**semilla, no autoridad**: se copia al libro de un propietario cuando lo pide
(`POST /api/lectura/v1/catalogo/importa`) y desde ahí la copia es suya. Una
versión nueva de estos archivos no reescribe ningún libro ya sembrado.

## Contenido

| Qué | Cantidad | Notas |
| --- | -------- | ----- |
| Grupos musculares | 16 | Deltoides en tres porciones; trapecio y romboides aparte del dorsal; aductores con fila propia. |
| Ejercicios | 182 | Nombre corto y dictable, alias de búsqueda, equipamiento, patrón, unilateral, coeficientes. |
| Coeficientes | 3 niveles | `1.00` principal (exactamente uno por ejercicio) · `0.50` sinergista · `0.25` menor. |
| Perfiles | 5 | esencial (44), gimnasio-completo (170, por omisión), gimnasio-casa (107), mancuernas (74), calistenia (42, declara sin cobertura el deltoides lateral). |
| Plantillas | 5 | Cuerpo completo 3 días (casa), torso-pierna 4 días, empuje-tracción-pierna 6 días, cinco días por grupos, empuje-tracción-pierna en ciclo de 4. |
| Bandas de referencia | 3 | general 10–20 (publicado) · indirecto 6–16 · directo-barato 8–22 (criterio propio). |

Grupos: pectoral, deltoides anterior, deltoides lateral, deltoides posterior,
bíceps, tríceps, antebrazo, abdomen, trapecio y romboides, dorsal, lumbares,
glúteo, cuádriceps, isquiosurales, aductores, gemelo y sóleo. Cada uno es algo
que se puede entrenar sin entrenar a los demás.

## Convención de coeficientes

- **1.00**: el músculo que el ejercicio pretende entrenar, que trabaja cerca del
  fallo y cambia de longitud bajo carga.
- **0.50**: sinergista con respaldo (el conteo fraccionado de Pelland et al.,
  2025, da 0.5 al trabajo indirecto): tríceps y deltoides anterior en los
  empujes, bíceps y trapecio en las tracciones, glúteo y aductores en la
  sentadilla.
- **0.25**: contribución menor, criterio propio y declarado como tal
  (estabilizadores, agarre, lumbares en la sentadilla).

**Ejemplo de criterio.** La sentadilla **no** aporta a isquiosurales —su
longitud apenas cambia, porque se acortan en la cadera lo que se alargan en la
rodilla— y **sí** a aductores (0.50): el aductor mayor extiende la cadera en
flexión profunda. Los coeficientes son dato editable del usuario, con dos
decimales como máximo: la heurística no se disfraza de medición. Tampoco se
derivan de estudios de EMG, porque la amplitud aguda no predice hipertrofia
(Vigotsky et al., 2022).

## Reglas

- **El cliente manda identificadores, nunca coeficientes.** No hay forma de colar
  un valor porque no hay forma de colar un valor.
- **Importación idempotente y reconciliadora**: reutiliza por nombre
  normalizado, crea lo que falta y **no pisa** un coeficiente ajustado a mano.
  Importar dos veces no duplica. Si la versión abierta está fijada, la sucesora
  copia todas sus contribuciones antes de añadir.
- **Alias sólo en el navegador**: en el almacén serían una segunda clave por la
  que dos ejercicios podrían colisionar.
- **Un identificador no se renombra ni se recicla.** Añadir es aditivo; quitar o
  reinterpretar exige un ADR.
- **Rangos: referencia, no objetivo ni nota.** «Dentro», «por debajo», «por
  encima», con su respaldo; sin puntuación, sin porcentaje, sin semáforo.

## Lo que comprueba la prueba de datos (`src/catalogo/catalogo.test.ts`)

Con catálogos **rotos a propósito**: identificadores y nombres únicos, coeficientes
en los tres niveles como cadena y exactamente un principal por ejercicio, alias
sin repetir ni repetir un nombre, al menos tres ejercicios principales por grupo,
cada perfil cubre los dieciséis grupos o declara el hueco (y no declara huecos
falsos), exactamente un perfil por omisión, cada plantilla pide sólo ejercicios
de su perfil y cabe en su ciclo, cada banda cita fuentes existentes, y cada grupo
tiene banda. **Las plantillas se comprueban con el motor de verdad**: se expanden
con `expandePlan` y `agrega` sobre el mínimo común múltiplo de su ciclo y la
semana, y cada grupo queda dentro de su banda en aritmética entera.

## Bibliografía

- Schoenfeld BJ, Ogborn D, Krieger JW. Dose-response relationship between weekly
  resistance training volume and increases in muscle mass: a systematic review
  and meta-analysis. *Journal of Sports Sciences*, 2017.
- Baz-Valle E, Balsalobre-Fernández C, Alix-Fages C, Santos-Concejero J. A
  systematic review of the effects of different resistance training volumes on
  muscle hypertrophy. *Journal of Human Kinetics*, 2022.
- Schoenfeld BJ, Contreras B, Krieger J, et al. Resistance training volume
  enhances muscle hypertrophy but not strength in trained men. *Medicine &
  Science in Sports & Exercise*, 2019.
- Pelland JC, Remmert JF, Robinson ZP, et al. The resistance training dose
  response: meta-regressions exploring the effects of weekly volume and frequency
  on muscle hypertrophy and strength gain. *Sports Medicine*, 2025.
- Vigotsky AD, Halperin I, Trajano GS, Vieira TM. Longing for a longitudinal
  proxy: acutely measured surface EMG amplitude is not a validated predictor of
  muscle hypertrophy. *Sports Medicine*, 2022.

**Candidato más serio a crecer**: separar el recto femoral o las porciones del
pectoral. Añadir un grupo es aditivo; hacerlo sólo cuando haya con qué justificar
los coeficientes.
