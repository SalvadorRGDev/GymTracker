import { describe, expect, it } from 'vitest';
import { type Centesimas, centesimasDesdeDecimal, ErrorDeCentesimas } from './centesimas.js';
import { librasDesdeKilos, librasDesdeKilosEnTexto } from './unidades.js';

describe('libras desde kilos (ADR-023)', () => {
  it('convierte con el factor exacto de la libra internacional', () => {
    expect(librasDesdeKilosEnTexto('60')).toBe('132.28');
    expect(librasDesdeKilosEnTexto('20.00')).toBe('44.09');
    expect(librasDesdeKilosEnTexto('2.5')).toBe('5.51');
    expect(librasDesdeKilosEnTexto('0')).toBe('0.00');
    expect(librasDesdeKilosEnTexto('1000.00')).toBe('2204.62');
    // Un disco de 45 lb pesa 20.41 kg, y 100 lb, 45.36 kg: vuelven a dar lo mismo.
    expect(librasDesdeKilosEnTexto('20.41')).toBe('45.00');
    expect(librasDesdeKilos(centesimasDesdeDecimal('45.36'))).toBe(10000);
  });

  it('redondea una sola vez, a la mitad par', () => {
    // 0.01 kg = 0.0220462… lb → 0.02; 0.05 kg = 0.110231… lb → 0.11.
    expect(librasDesdeKilos(1 as Centesimas)).toBe(2);
    expect(librasDesdeKilos(5 as Centesimas)).toBe(11);
  });

  it('una carga negativa no es una carga', () => {
    expect(() => librasDesdeKilos(-100 as Centesimas)).toThrow(ErrorDeCentesimas);
  });
});
