/**
 * La fecha lógica: el día de calendario al que pertenece una sesión.
 *
 * No es un instante y aquí nunca se convierte a `Date`: `new Date('2026-09-07')`
 * es medianoche UTC y al oeste de Greenwich se pinta como el día 6. Toda la
 * aritmética es de calendario civil sobre enteros (días desde 1970-01-01), con
 * el algoritmo de Howard Hinnant, sin reloj ni zona.
 *
 * La fecha lógica de una sesión la decide el servidor a partir del instante y la
 * zona de la cuenta (`src/api/zona.ts`). El motor sólo la recibe.
 */

declare const marcaFecha: unique symbol;

/** `YYYY-MM-DD` validada. */
export type FechaLogica = string & { readonly [marcaFecha]: 'FechaLogica' };

export class ErrorDeFecha extends Error {
  override name = 'ErrorDeFecha';
}

const ISO = /^(\d{4})-(\d{2})-(\d{2})$/;

function esBisiesto(anio: number): boolean {
  return (anio % 4 === 0 && anio % 100 !== 0) || anio % 400 === 0;
}

function diasDelMes(anio: number, mes: number): number {
  if (mes === 2) return esBisiesto(anio) ? 29 : 28;
  return mes === 4 || mes === 6 || mes === 9 || mes === 11 ? 30 : 31;
}

function partes(texto: string): { anio: number; mes: number; dia: number } | null {
  const m = ISO.exec(texto);
  if (m === null) return null;
  const anio = Number(m[1]);
  const mes = Number(m[2]);
  const dia = Number(m[3]);
  if (anio < 1900 || mes < 1 || mes > 12 || dia < 1 || dia > diasDelMes(anio, mes)) return null;
  return { anio, mes, dia };
}

export function esFechaLogica(texto: string): texto is FechaLogica {
  return partes(texto) !== null;
}

export function fechaLogica(texto: string): FechaLogica {
  if (!esFechaLogica(texto)) {
    throw new ErrorDeFecha(`«${texto}» no es una fecha AAAA-MM-DD válida`);
  }
  return texto;
}

/** Días desde 1970-01-01 (Hinnant, `days_from_civil`). */
function diasDesdeEpoca(fecha: FechaLogica): number {
  const p = partes(fecha);
  if (p === null) throw new ErrorDeFecha(`«${fecha}» no es una fecha válida`);
  const anio = p.mes <= 2 ? p.anio - 1 : p.anio;
  const era = Math.floor(anio / 400);
  const anioDeEra = anio - era * 400;
  const diaDelAnio = Math.floor((153 * (p.mes > 2 ? p.mes - 3 : p.mes + 9) + 2) / 5) + p.dia - 1;
  const diaDeEra =
    anioDeEra * 365 + Math.floor(anioDeEra / 4) - Math.floor(anioDeEra / 100) + diaDelAnio;
  return era * 146097 + diaDeEra - 719468;
}

/** Inversa de `diasDesdeEpoca` (Hinnant, `civil_from_days`). */
function fechaDesdeDias(dias: number): FechaLogica {
  const z = dias + 719468;
  const era = Math.floor(z / 146097);
  const diaDeEra = z - era * 146097;
  const anioDeEra = Math.floor(
    (diaDeEra -
      Math.floor(diaDeEra / 1460) +
      Math.floor(diaDeEra / 36524) -
      Math.floor(diaDeEra / 146096)) /
      365,
  );
  const diaDelAnio =
    diaDeEra - (365 * anioDeEra + Math.floor(anioDeEra / 4) - Math.floor(anioDeEra / 100));
  const mp = Math.floor((5 * diaDelAnio + 2) / 153);
  const dia = diaDelAnio - Math.floor((153 * mp + 2) / 5) + 1;
  const mes = mp < 10 ? mp + 3 : mp - 9;
  const anio = anioDeEra + era * 400 + (mes <= 2 ? 1 : 0);
  return fechaLogica(
    `${String(anio).padStart(4, '0')}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`,
  );
}

export function sumaDias(fecha: FechaLogica, dias: number): FechaLogica {
  if (!Number.isSafeInteger(dias)) throw new ErrorDeFecha(`${dias} no es un número de días`);
  return fechaDesdeDias(diasDesdeEpoca(fecha) + dias);
}

/** `hasta − desde` en días; negativo si `hasta` es anterior. */
export function diasEntre(desde: FechaLogica, hasta: FechaLogica): number {
  return diasDesdeEpoca(hasta) - diasDesdeEpoca(desde);
}

/** Día ISO de la semana: lunes = 1 … domingo = 7. */
export function diaDeLaSemana(fecha: FechaLogica): number {
  // 1970-01-01 fue jueves (4).
  return ((((diasDesdeEpoca(fecha) + 3) % 7) + 7) % 7) + 1;
}

/** El lunes de la semana natural (lunes a domingo) que contiene la fecha. */
export function lunesDe(fecha: FechaLogica): FechaLogica {
  return sumaDias(fecha, 1 - diaDeLaSemana(fecha));
}

export function comparaFechas(a: FechaLogica, b: FechaLogica): number {
  // En ISO de ancho fijo, el orden lexicográfico es el cronológico.
  return a < b ? -1 : a > b ? 1 : 0;
}

/** `true` si `fecha` ∈ [desde, hasta). `hasta` nulo es «sin cierre». */
export function dentroDe(
  fecha: FechaLogica,
  desde: FechaLogica,
  hasta: FechaLogica | null,
): boolean {
  return fecha >= desde && (hasta === null || fecha < hasta);
}
