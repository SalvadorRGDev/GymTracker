/**
 * Centésimas de serie como enteros: `1.00` → `100`.
 *
 * Todo decimal del sistema viaja como cadena y se parsea aquí, en el borde del
 * motor. El almacén sólo tiene celdas de texto (ADR-010) y un `number` de
 * JavaScript es `float64`: `0.5 + 0.25 + 0.25` no da `1` en coma flotante, y el
 * residuo se leería como un déficit que nadie tiene (trampa 7 del spec).
 *
 * Lo que no se puede representar —un tercer decimal— se rechaza, no se redondea:
 * redondear en la entrada sería decidir en silencio un dato que tecleó alguien.
 */

declare const marcaCentesimas: unique symbol;

/** Entero de centésimas. Admite negativos: la resta de la comparativa los produce. */
export type Centesimas = number & { readonly [marcaCentesimas]: 'Centesimas' };

export class ErrorDeCentesimas extends Error {
  override name = 'ErrorDeCentesimas';
}

export const CERO = 0 as Centesimas;

/** Lo que vale una serie registrada. Una entrada de plan vale su objetivo. */
export const UNA_SERIE = 100 as Centesimas;

const DECIMAL = /^(-?)(\d{1,12})(?:\.(\d{1,2}))?$/;

function comprueba(valor: number): Centesimas {
  if (!Number.isSafeInteger(valor)) {
    throw new ErrorDeCentesimas('La cantidad se sale del rango de enteros exactos');
  }
  // `-0` y `0` son el mismo dato; se normaliza para que `Object.is` no los separe.
  return (valor === 0 ? 0 : valor) as Centesimas;
}

/** Parsea `"12"`, `"12.5"` o `"12.50"`. Rechaza `"12.345"`, `"1e3"`, `" 1"` y `"."`. */
export function centesimasDesdeDecimal(texto: string): Centesimas {
  const partes = DECIMAL.exec(texto);
  if (partes === null) {
    throw new ErrorDeCentesimas(`«${texto}» no es un decimal con a lo sumo dos posiciones`);
  }
  const [, signo, entero = '0', fraccion = ''] = partes;
  const valor = Number(entero) * 100 + Number(fraccion.padEnd(2, '0'));
  return comprueba(signo === '-' ? -valor : valor);
}

/** `true` si el texto es un decimal que el motor puede leer sin perder nada. */
export function esDecimalExacto(texto: string): boolean {
  return DECIMAL.test(texto);
}

/** Un número entero de series (o de lo que sea) en centésimas. */
export function centesimasDesdeEntero(n: number): Centesimas {
  if (!Number.isSafeInteger(n)) {
    throw new ErrorDeCentesimas(`${n} no es un entero`);
  }
  return comprueba(n * 100);
}

/** Siempre con dos posiciones: `100` → `"1.00"`, `-50` → `"-0.50"`. */
export function decimalDesdeCentesimas(c: Centesimas): string {
  const absoluto = Math.abs(c);
  const entero = Math.trunc(absoluto / 100);
  const fraccion = absoluto % 100;
  return `${c < 0 ? '-' : ''}${entero}.${String(fraccion).padStart(2, '0')}`;
}

export function sumaCentesimas(a: Centesimas, b: Centesimas): Centesimas {
  return comprueba(a + b);
}

export function restaCentesimas(a: Centesimas, b: Centesimas): Centesimas {
  return comprueba(a - b);
}

export function comparaCentesimas(a: Centesimas, b: Centesimas): number {
  return a - b;
}

declare const marcaDiezmilesimas: unique symbol;

/** Producto exacto de dos cantidades en centésimas: 0.25 × 4.50 = 1.1250 → `11250`. */
export type Diezmilesimas = number & { readonly [marcaDiezmilesimas]: 'Diezmilesimas' };

/**
 * La misma aritmética exacta que la suma: el producto de dos centésimas cabe
 * entero en diezmilésimas, sin redondear. `agrega` acumula así y redondea una
 * sola vez, al final, por grupo.
 */
export function multiplica(a: Centesimas, b: Centesimas): Diezmilesimas {
  const producto = a * b;
  if (!Number.isSafeInteger(producto)) {
    throw new ErrorDeCentesimas('El producto se sale del rango de enteros exactos');
  }
  return producto as Diezmilesimas;
}
