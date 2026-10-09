import {
  type Centesimas,
  centesimasDesdeDecimal,
  decimalDesdeCentesimas,
  ErrorDeCentesimas,
} from './centesimas.js';

/**
 * Las cargas van en libras (ADR-023). La libra internacional vale EXACTAMENTE
 * 0.45359237 kg, así que una carga en kilos pasa a libras con una división de
 * enteros: lb = kg × 100000000 / 45359237. Se redondea una vez, a la centésima,
 * a la mitad par, como el resto del proyecto. Sólo la usan dos sitios: el
 * almacén al leer un libro anterior a las libras y la captura de un atajo viejo
 * que todavía manda `carga_kg`.
 */

const NUMERADOR = 100_000_000;
const DENOMINADOR = 45_359_237;

export function librasDesdeKilos(kilos: Centesimas): Centesimas {
  if (kilos < 0) throw new ErrorDeCentesimas('Una carga no es negativa');
  const n = kilos * NUMERADOR;
  if (!Number.isSafeInteger(n)) {
    throw new ErrorDeCentesimas('La carga se sale del rango de enteros exactos');
  }
  const cociente = Math.floor(n / DENOMINADOR);
  const doble = 2 * (n - cociente * DENOMINADOR);
  const sube = doble > DENOMINADOR || (doble === DENOMINADOR && cociente % 2 !== 0);
  return (cociente + (sube ? 1 : 0)) as Centesimas;
}

/** `"60"` o `"60.00"` (kg) → `"132.28"` (lb). */
export function librasDesdeKilosEnTexto(kilos: string): string {
  return decimalDesdeCentesimas(librasDesdeKilos(centesimasDesdeDecimal(kilos)));
}
