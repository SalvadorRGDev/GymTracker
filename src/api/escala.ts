import type { Centesimas } from '../domain/volume/index.js';

/**
 * La escala de color del mapa muscular (ADR-018): siete niveles por series
 * efectivas de la semana en un grupo.
 *
 * Los cortes son PRESENTACIÓN, no parámetros de la métrica: cambiarlos no
 * reescribe ningún número, sólo cómo se pinta. Por eso no se versionan como el
 * umbral de RIR, y viven en un único módulo del servidor para que la figura y la
 * leyenda no puedan desincronizarse: el cliente no decide el nivel, lo lee.
 *
 * Son cantidades absolutas y a la vista (0, 4, 8, 12, 16, 20), como la leyenda
 * de un mapa, y no un juicio sobre cada grupo: el rojo empieza donde termina el
 * rango publicado general (10–20) y la leyenda lo dice.
 */

export type Nivel = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export interface TramoDeEscala {
  readonly nivel: Nivel;
  /** Inclusivo, salvo en el nivel 1, que empieza justo por encima de cero. */
  readonly desde: string;
  /** Exclusivo; `null` en el último tramo. */
  readonly hasta: string | null;
  /** Lo que se lee bajo el tramo: describe volumen, nunca «bien» o «mal». */
  readonly rotulo: string;
  readonly descripcion: string;
}

/** En centésimas: 4.00 → 400. */
const CORTES = [400, 800, 1200, 1600, 2000] as const;

export const ESCALA: readonly TramoDeEscala[] = [
  {
    nivel: 0,
    desde: '0.00',
    hasta: '0.00',
    rotulo: 'Sin trabajo',
    descripcion: 'Ninguna serie efectiva',
  },
  {
    nivel: 1,
    desde: '0.00',
    hasta: '4.00',
    rotulo: 'Estímulo mínimo',
    descripcion: 'Más de 0 y menos de 4',
  },
  {
    nivel: 2,
    desde: '4.00',
    hasta: '8.00',
    rotulo: 'Poco volumen',
    descripcion: 'De 4 a menos de 8',
  },
  {
    nivel: 3,
    desde: '8.00',
    hasta: '12.00',
    rotulo: 'Volumen moderado',
    descripcion: 'De 8 a menos de 12',
  },
  {
    nivel: 4,
    desde: '12.00',
    hasta: '16.00',
    rotulo: 'Volumen alto',
    descripcion: 'De 12 a menos de 16',
  },
  {
    nivel: 5,
    desde: '16.00',
    hasta: '20.00',
    rotulo: 'Volumen muy alto',
    descripcion: 'De 16 a menos de 20',
  },
  { nivel: 6, desde: '20.00', hasta: null, rotulo: 'Más de 20 series', descripcion: '20 o más' },
];

/**
 * Aritmética ENTERA sobre las centésimas del motor: 11.99 es nivel 3 y 12.00
 * es nivel 4, sin redondeos. Negativo no puede ser (el motor no resta aquí) y
 * se trata como cero antes que inventarle un color.
 */
export function nivelDeVolumen(volumen: Centesimas): Nivel {
  if (volumen <= 0) return 0;
  let nivel = 1;
  for (const corte of CORTES) {
    if (volumen >= corte) nivel += 1;
  }
  return nivel as Nivel;
}
