import type { Centesimas } from './centesimas.js';
import type { FechaLogica } from './fecha-logica.js';

/** Lo que un ejercicio aporta a un grupo: `1.00`, `0.50`, `0.25`… Dato, nunca expresión. */
export interface Contribucion {
  readonly grupoId: string;
  readonly coeficiente: Centesimas;
}

interface SerieComun {
  /** El día de la SESIÓN, no el de la serie: la de las 00:15 va con la de las 23:50. */
  readonly fechaLogica: FechaLogica;
  /** El pin de la sesión: con qué umbral y coeficientes se interpreta esta serie. */
  readonly versionParametrosId: string;
  /** Grupos y coeficientes de esa versión. Vacío = serie sin mapeo. */
  readonly contribuciones: readonly Contribucion[];
  /**
   * Cuántas series representa. Obligatorio y sin valor por omisión: una serie
   * registrada vale `UNA_SERIE`; una entrada de plan, su objetivo (que puede ser
   * `4.50`). Olvidarlo en el lado del plan no fallaría: proyectaría una serie
   * donde el plan pedía doce.
   */
  readonly veces: Centesimas;
}

/**
 * Serie de trabajo: cuenta si su RIR está en el umbral o por debajo.
 *
 * El tipo no lleva instante (el motor no puede partir una sesión por la
 * medianoche porque no ve la hora) ni carga ni repeticiones (tenerlas a mano
 * invitaría a contar la intensidad dos veces, ADR-003).
 */
export interface SerieDeTrabajo extends SerieComun {
  readonly tipo: 'trabajo';
  /** Repeticiones en reserva, 0–10. */
  readonly rir: number;
}

/**
 * El calentamiento es una VARIANTE del tipo, no una bandera: no hay forma de
 * construir una serie de trabajo sin RIR, y el motor descarta éstas él mismo.
 */
export interface SerieDeCalentamiento extends SerieComun {
  readonly tipo: 'calentamiento';
}

export type Serie = SerieDeTrabajo | SerieDeCalentamiento;

export interface EntradaDeAgregado {
  readonly series: readonly Serie[];
  /** Umbral de RIR de cada versión de parámetros citada. Si falta uno, el motor falla. */
  readonly umbrales: ReadonlyMap<string, number>;
}

export interface Agregado {
  /** Volumen por grupo. Un grupo sin series no aparece: `volumenDe` lo lee como cero. */
  readonly porGrupo: ReadonlyMap<string, Centesimas>;
  /**
   * Los contadores cuentan ENTRADAS, no volumen. Para lo ejecutado coinciden con
   * el número de series; para un plan expandido, una entrada puede valer 4.50.
   */
  readonly seriesEfectivas: number;
  /** Efectivas cuyo ejercicio no aporta a ningún grupo en su versión. */
  readonly seriesSinMapeo: number;
  readonly seriesSobreUmbral: number;
  readonly seriesDeCalentamiento: number;
  /** Versiones que intervinieron, ordenadas. Más de una en una ventana se declara. */
  readonly versionesDeParametros: readonly string[];
}

export interface Ventana {
  /** Primer día de la primera semana. En la vista principal es un lunes. */
  readonly desde: FechaLogica;
  readonly semanas: number;
}

export interface AgregadoDeSemana extends Agregado {
  readonly desde: FechaLogica;
  /** Exclusiva. */
  readonly hasta: FechaLogica;
}
