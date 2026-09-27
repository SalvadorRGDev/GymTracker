import { clasifica, ErrorDeMotor, volumenDe } from './agrega.js';
import { type Centesimas, restaCentesimas } from './centesimas.js';
import { comparaFechas, type FechaLogica, sumaDias } from './fecha-logica.js';
import type { AsignacionDePlan } from './plan.js';
import type { Agregado, EntradaDeAgregado } from './tipos.js';

/**
 * La comparativa (fase 3) es una RESTA entre dos agregados que salieron de la
 * misma `agrega`: lo ejecutado menos lo planeado (ADR-006). Aquí se decide la
 * ventana y se resta; sumar sigue siendo cosa de `agrega` y de nadie más.
 */

export interface VentanaDeComparacion {
  readonly asignacionId: string;
  readonly versionPlanId: string;
  /** Semana del plan, contada desde el ancla: 1, 2, 3… */
  readonly numero: number;
  readonly desde: FechaLogica;
  /** Exclusiva. Antes de siete días si la asignación se cerró a mitad de semana. */
  readonly hasta: FechaLogica;
}

const MAXIMO_DE_VENTANAS = 104;

/**
 * Las ventanas de la comparativa: semanas contadas desde el ANCLA de cada
 * asignación, no desde el lunes. Un plan asignado un jueves compara de jueves a
 * miércoles, y una sesión movida de día dentro de esa semana no genera ni
 * déficit ni superávit. Una asignación cerrada a mitad deja su última semana
 * corta; la siguiente cuenta desde su propio ancla. Sin asignación no hay
 * ventana: no hay contra qué comparar.
 *
 * Devuelve las `cuantas` más recientes que ya empezaron el día `hoy`, en orden.
 */
export function ventanasDeComparacion(
  asignaciones: readonly AsignacionDePlan[],
  hoy: FechaLogica,
  cuantas: number,
): VentanaDeComparacion[] {
  if (!Number.isInteger(cuantas) || cuantas < 1 || cuantas > MAXIMO_DE_VENTANAS) {
    throw new ErrorDeMotor(`Número de ventanas fuera de rango: ${cuantas}`);
  }
  const manana = sumaDias(hoy, 1);
  const ventanas: VentanaDeComparacion[] = [];
  for (const a of [...asignaciones].sort((x, y) => comparaFechas(x.desde, y.desde))) {
    if (a.hasta !== null && a.hasta <= a.desde) {
      throw new ErrorDeMotor(`La asignación ${a.id} termina antes de empezar`);
    }
    const tope = a.hasta !== null && a.hasta < manana ? a.hasta : manana;
    for (let k = 0; ; k += 1) {
      const desde = sumaDias(a.desde, 7 * k);
      if (desde >= tope) break;
      const natural = sumaDias(desde, 7);
      const hasta = a.hasta !== null && a.hasta < natural ? a.hasta : natural;
      ventanas.push({
        asignacionId: a.id,
        versionPlanId: a.versionPlanId,
        numero: k + 1,
        desde,
        hasta,
      });
    }
  }
  return ventanas.slice(-cuantas);
}

export interface Diferencia {
  readonly grupoId: string;
  readonly planeado: Centesimas;
  readonly ejecutado: Centesimas;
  /** Ejecutado menos planeado: negativo es déficit, positivo superávit. */
  readonly delta: Centesimas;
}

/** La resta, grupo a grupo. Un grupo que un lado no tiene vale cero en ese lado. */
export function resta(
  ejecutado: Agregado,
  planeado: Agregado,
  grupos: readonly string[],
): Diferencia[] {
  return grupos.map((grupoId) => {
    const p = volumenDe(planeado, grupoId);
    const e = volumenDe(ejecutado, grupoId);
    return { grupoId, planeado: p, ejecutado: e, delta: restaCentesimas(e, p) };
  });
}

/**
 * Riesgo R6: el umbral de RIR decidiendo el resultado. Si más del 15 % de las
 * series efectivas queda a un punto o menos del umbral, moverlo un punto cambia
 * el volumen de verdad y toca mirar la sensibilidad. El 15 % es una convención
 * declarada, no una medida.
 */
export const DISPARADOR_DE_VIGILANCIA = 15;

/** Con menos efectivas en el periodo, el porcentaje es ruido. También convención. */
export const MINIMO_DE_VIGILANCIA = 30;

export interface Vigilancia {
  /** Series de trabajo que cuentan con el umbral de su versión. */
  readonly efectivas: number;
  /** De ésas, las que tienen el RIR en `[umbral − 1, umbral]`: la franja de la frontera. */
  readonly enLaFranja: number;
  readonly pideSensibilidad: boolean;
}

export function vigilaUmbral(entrada: EntradaDeAgregado): Vigilancia {
  let efectivas = 0;
  let enLaFranja = 0;
  for (const serie of entrada.series) {
    if (clasifica(serie, entrada.umbrales) !== 'efectiva' || serie.tipo !== 'trabajo') continue;
    efectivas += 1;
    const umbral = entrada.umbrales.get(serie.versionParametrosId) ?? 0;
    if (serie.rir >= umbral - 1) enLaFranja += 1;
  }
  return {
    efectivas,
    enLaFranja,
    // Aritmética entera: 15 % de 40 son 6, y 6 no es «más del 15 %».
    pideSensibilidad:
      efectivas >= MINIMO_DE_VIGILANCIA && enLaFranja * 100 > DISPARADOR_DE_VIGILANCIA * efectivas,
  };
}
