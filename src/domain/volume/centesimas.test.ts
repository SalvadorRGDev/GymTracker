import { describe, expect, it } from 'vitest';
import {
  CERO,
  type Centesimas,
  centesimasDesdeDecimal,
  centesimasDesdeEntero,
  decimalDesdeCentesimas,
  ErrorDeCentesimas,
  esDecimalExacto,
  restaCentesimas,
  sumaCentesimas,
  UNA_SERIE,
} from './centesimas.js';

describe('centésimas', () => {
  it('parsea enteros, uno y dos decimales', () => {
    expect(centesimasDesdeDecimal('12')).toBe(1200);
    expect(centesimasDesdeDecimal('12.5')).toBe(1250);
    expect(centesimasDesdeDecimal('12.50')).toBe(1250);
    expect(centesimasDesdeDecimal('0.25')).toBe(25);
    expect(centesimasDesdeDecimal('-3.05')).toBe(-305);
  });

  it('rechaza lo que no puede representar en vez de redondearlo', () => {
    for (const malo of ['12.345', '1e3', ' 1', '1 ', '', '.5', '1.', '+1', 'abc', '1,5', 'NaN']) {
      expect(() => centesimasDesdeDecimal(malo), malo).toThrow(ErrorDeCentesimas);
      expect(esDecimalExacto(malo), malo).toBe(false);
    }
  });

  it('suma exacta donde la coma flotante falla', () => {
    // 0.5 y 0.25 son fracciones binarias exactas; 0.1 y 0.2 no, y su residuo se
    // leería como un déficit que nadie tiene.
    expect(0.1 + 0.2 === 0.3).toBe(false);
    const total = [0.1, 0.2].reduce<Centesimas>(
      (acc, x) => sumaCentesimas(acc, centesimasDesdeDecimal(String(x))),
      CERO,
    );
    expect(decimalDesdeCentesimas(total)).toBe('0.30');
  });

  it('escribe siempre dos posiciones, con signo', () => {
    expect(decimalDesdeCentesimas(UNA_SERIE)).toBe('1.00');
    expect(decimalDesdeCentesimas(centesimasDesdeDecimal('4.5'))).toBe('4.50');
    expect(
      decimalDesdeCentesimas(
        restaCentesimas(centesimasDesdeDecimal('12'), centesimasDesdeDecimal('16')),
      ),
    ).toBe('-4.00');
    expect(decimalDesdeCentesimas(centesimasDesdeDecimal('-0.05'))).toBe('-0.05');
    expect(decimalDesdeCentesimas(CERO)).toBe('0.00');
  });

  it('normaliza el cero negativo', () => {
    expect(Object.is(centesimasDesdeDecimal('-0.00'), 0)).toBe(true);
  });

  it('convierte enteros y rechaza fracciones', () => {
    expect(centesimasDesdeEntero(3)).toBe(300);
    expect(() => centesimasDesdeEntero(1.5)).toThrow(ErrorDeCentesimas);
  });
});
