import { describe, expect, it } from 'vitest';
import {
  dentroDe,
  diaDeLaSemana,
  diasEntre,
  ErrorDeFecha,
  esFechaLogica,
  fechaLogica,
  lunesDe,
  sumaDias,
} from './fecha-logica.js';

const f = fechaLogica;

describe('fecha lógica', () => {
  it('valida el calendario, bisiestos incluidos', () => {
    expect(esFechaLogica('2024-02-29')).toBe(true);
    expect(esFechaLogica('2026-02-29')).toBe(false);
    expect(esFechaLogica('2000-02-29')).toBe(true);
    expect(esFechaLogica('1900-02-29')).toBe(false);
    expect(esFechaLogica('2026-09-31')).toBe(false);
    expect(esFechaLogica('2026-9-1')).toBe(false);
    expect(esFechaLogica('2026-09-07T00:00:00Z')).toBe(false);
    expect(() => fechaLogica('ayer')).toThrow(ErrorDeFecha);
  });

  it('suma días cruzando meses, años y febreros', () => {
    expect(sumaDias(f('2026-09-30'), 1)).toBe('2026-10-01');
    expect(sumaDias(f('2026-12-31'), 1)).toBe('2027-01-01');
    expect(sumaDias(f('2024-02-28'), 1)).toBe('2024-02-29');
    expect(sumaDias(f('2026-02-28'), 1)).toBe('2026-03-01');
    expect(sumaDias(f('2026-03-01'), -1)).toBe('2026-02-28');
    expect(sumaDias(f('2026-01-01'), 365)).toBe('2027-01-01');
  });

  it('cuenta días entre fechas en los dos sentidos', () => {
    expect(diasEntre(f('2026-09-21'), f('2026-09-28'))).toBe(7);
    expect(diasEntre(f('2026-09-28'), f('2026-09-21'))).toBe(-7);
    expect(diasEntre(f('2024-01-01'), f('2025-01-01'))).toBe(366);
  });

  it('sabe el día de la semana sin zona ni reloj', () => {
    expect(diaDeLaSemana(f('1970-01-01'))).toBe(4); // jueves
    expect(diaDeLaSemana(f('2026-09-21'))).toBe(1); // lunes
    expect(diaDeLaSemana(f('2026-09-26'))).toBe(6); // sábado
    expect(diaDeLaSemana(f('2026-09-27'))).toBe(7); // domingo
    expect(lunesDe(f('2026-09-27'))).toBe('2026-09-21');
    expect(lunesDe(f('2026-09-21'))).toBe('2026-09-21');
    expect(lunesDe(f('2026-01-01'))).toBe('2025-12-29');
  });

  it('una vigencia es [desde, hasta)', () => {
    expect(dentroDe(f('2026-09-06'), f('2026-09-01'), f('2026-09-07'))).toBe(true);
    expect(dentroDe(f('2026-09-07'), f('2026-09-01'), f('2026-09-07'))).toBe(false);
    expect(dentroDe(f('2030-01-01'), f('2026-09-01'), null)).toBe(true);
    expect(dentroDe(f('2026-08-31'), f('2026-09-01'), null)).toBe(false);
  });
});
