import { type Centesimas, ErrorDeCentesimas } from './centesimas.js';

/**
 * Lo que la carga dice de una sesión (ADR-024). NO es volumen —el volumen son
 * series efectivas (ADR-003) y sale de `agrega`—: son dos indicadores de
 * lectura que nunca se guardan ni entran en el volumen.
 *
 * - **Carga media de trabajo**: la media de las cargas de las series de trabajo
 *   que llevan carga —sin calentamientos ni series de peso corporal—, a la
 *   décima. Depende de qué ejercicios se hicieron, así que no se usa para comparar.
 * - **Progreso**: cuánto mejoró la mejor serie de cada ejercicio respecto a la
 *   sesión anterior de la misma área. La marca de una serie con carga es la
 *   fórmula de Epley con el RIR —carga × (1 + (repeticiones + RIR) / 30)— porque
 *   repeticiones + RIR son las que se podían hacer; sin carga, repeticiones +
 *   RIR a secas. Sólo se comparan los ejercicios de las dos sesiones, y con o
 *   sin carga en las dos. El cambio medio pesa más los ejercicios con más series
 *   y da un punto por cada 1 %, con tope en ±10.
 *
 * Aritmética entera: el /30 de Epley se cancela al dividir una marca por otra,
 * cada cambio se redondea a la centésima de punto porcentual y la media, una vez
 * más, siempre a la mitad par.
 */

export interface SerieConCarga {
  readonly ejercicioId: string;
  readonly tipo: 'trabajo' | 'calentamiento';
  /** Centésimas de libra; cero es peso corporal. */
  readonly carga: Centesimas;
  readonly repeticiones: number;
  /** Sólo la serie de trabajo lo lleva. */
  readonly rir: number | null;
}

export interface Progreso {
  /** De −10 a +10: un punto por cada 1 % de mejora media. */
  readonly puntos: number;
  /** El cambio medio en centésimas de punto porcentual: `286` es +2.86 %. */
  readonly cambio: number;
  /** Los ejercicios que se pudieron comparar. */
  readonly ejercicios: number;
}

export const TOPE_DE_PROGRESO = 10;

/** `n / d` con `d > 0`, redondeado a la mitad par y simétrico en el signo. */
function divideAlPar(n: number, d: number): number {
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d) || d <= 0) {
    throw new ErrorDeCentesimas(`División fuera de rango: ${n} / ${d}`);
  }
  const absoluto = Math.abs(n);
  const cociente = Math.floor(absoluto / d);
  const doble = 2 * (absoluto - cociente * d);
  const redondeado = doble > d || (doble === d && cociente % 2 !== 0) ? cociente + 1 : cociente;
  return n < 0 ? -redondeado : redondeado;
}

/** Centésimas de libra redondeadas a la décima (múltiplo de 10), o `null` sin cargas. */
export function cargaMedia(series: readonly SerieConCarga[]): Centesimas | null {
  const cargas = series.filter((s) => s.tipo === 'trabajo' && s.carga > 0).map((s) => s.carga);
  if (cargas.length === 0) return null;
  const suma = cargas.reduce((total, c) => total + c, 0);
  return (divideAlPar(suma, cargas.length * 10) * 10) as Centesimas;
}

interface Marca {
  readonly conCarga: boolean;
  readonly valor: number;
  /** Series de trabajo del ejercicio: lo que pesa en la media. */
  readonly series: number;
}

function marcaDe(series: readonly SerieConCarga[]): Marca | null {
  const trabajo = series.filter((s) => s.tipo === 'trabajo');
  if (trabajo.length === 0) return null;
  const conCarga = trabajo.filter((s) => s.carga > 0);
  const capacidad = (s: SerieConCarga) => s.repeticiones + (s.rir ?? 0);
  const valores =
    conCarga.length > 0
      ? conCarga.map((s) => s.carga * (30 + capacidad(s)))
      : trabajo.map(capacidad);
  return { conCarga: conCarga.length > 0, valor: Math.max(...valores), series: trabajo.length };
}

function porEjercicio(series: readonly SerieConCarga[]): Map<string, SerieConCarga[]> {
  const salida = new Map<string, SerieConCarga[]>();
  for (const s of series) {
    const lista = salida.get(s.ejercicioId) ?? [];
    lista.push(s);
    salida.set(s.ejercicioId, lista);
  }
  return salida;
}

/** `null` si no hay ningún ejercicio que se pueda comparar: no se inventa un «igual». */
export function progreso(
  actual: readonly SerieConCarga[],
  anterior: readonly SerieConCarga[],
): Progreso | null {
  const previas = porEjercicio(anterior);
  let suma = 0;
  let pesos = 0;
  let ejercicios = 0;
  for (const [id, deAhora] of porEjercicio(actual)) {
    const deAntes = previas.get(id);
    const ahora = marcaDe(deAhora);
    const antes = deAntes === undefined ? null : marcaDe(deAntes);
    if (ahora === null || antes === null || ahora.conCarga !== antes.conCarga) continue;
    suma += divideAlPar((ahora.valor - antes.valor) * 10_000, antes.valor) * ahora.series;
    pesos += ahora.series;
    ejercicios += 1;
  }
  if (ejercicios === 0) return null;
  const cambio = divideAlPar(suma, pesos);
  const puntos = Math.max(-TOPE_DE_PROGRESO, Math.min(TOPE_DE_PROGRESO, divideAlPar(cambio, 100)));
  return { puntos, cambio, ejercicios };
}
