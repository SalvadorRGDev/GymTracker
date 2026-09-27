import { centesimasDesdeDecimal, esDecimalExacto } from '../../domain/volume/centesimas';

/**
 * Los decimales llegan como CADENA y se enseñan tal cual: `12.50` y `12.5`
 * son el mismo número y distinto dato. Esto sólo calcula anchos de barra —
 * presentación—, y lo hace en centésimas enteras, nunca en coma flotante
 * sobre un total. No suma nada.
 */

function centesimas(texto: string): number {
  return esDecimalExacto(texto) ? centesimasDesdeDecimal(texto) : 0;
}

/** Porcentaje de ancho de una barra respecto de una escala fija. */
export function anchoDeBarra(valor: string, escala: string): number {
  const v = centesimas(valor);
  const e = centesimas(escala);
  if (e <= 0 || v <= 0) return 0;
  return Math.min(100, Math.round((v * 1000) / e) / 10);
}

/** La escala de las barras: 20 series o la cifra mayor que haya llegado, la que sea más alta. */
export function escalaDeBarras(valores: readonly string[]): string {
  let mayor = '20.00';
  for (const v of valores) if (centesimas(v) > centesimas(mayor)) mayor = v;
  return mayor;
}

export function conUnidad(valor: string, unidad: string): string {
  return `${valor} ${unidad}`;
}

/** Normaliza para buscar: sin mayúsculas, sin acentos, sin espacios de sobra. */
export function paraBuscar(texto: string): string {
  return texto.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

/** La clave del índice único del almacén, para emparejar con la semilla. */
export function normalizaNombre(nombre: string): string {
  return nombre.trim().toLowerCase();
}
