import { describe, expect, it } from 'vitest';
import { esHoy, fechaLarga, instanteRelativo, rangoDeSemana } from './fechas';
import { anchoDeBarra, escalaDeBarras, paraBuscar } from './numeros';

describe('fechas', () => {
  it('compone la fecha lógica de sus partes ISO, sin zona ni reloj', () => {
    expect(fechaLarga('2026-09-07')).toBe('lunes 7 de septiembre');
    expect(fechaLarga('2026-01-01', true)).toBe('jueves 1 de enero de 2026');
    expect(fechaLarga('no-es-fecha')).toBe('no-es-fecha');
  });

  it('nombra la semana, también cuando cruza de mes o de año', () => {
    expect(rangoDeSemana('2026-09-21', '2026-09-27')).toBe('Semana del 21 al 27 de septiembre');
    expect(rangoDeSemana('2026-09-28', '2026-10-04')).toBe(
      'Semana del 28 de septiembre al 4 de octubre',
    );
    expect(rangoDeSemana('2026-12-28', '2027-01-03')).toBe(
      'Semana del 28 de diciembre de 2026 al 3 de enero',
    );
  });

  it('un instante sí se convierte, en la zona de la cuenta', () => {
    const ahora = new Date('2026-09-27T02:00:00.000Z'); // 20:00 del 26 en Ciudad de México
    expect(instanteRelativo('2026-09-27T01:42:00.000Z', 'America/Mexico_City', ahora)).toBe(
      'hoy 19:42',
    );
    expect(instanteRelativo('2026-09-26T14:10:00.000Z', 'America/Mexico_City', ahora)).toBe(
      'hoy 08:10',
    );
    expect(instanteRelativo('2026-09-25T14:10:00.000Z', 'America/Mexico_City', ahora)).toBe(
      'ayer 08:10',
    );
    expect(instanteRelativo('2026-09-17T14:10:00.000Z', 'America/Mexico_City', ahora)).toBe(
      'hace 9 días',
    );
    expect(esHoy('2026-09-27T01:42:00.000Z', 'America/Mexico_City', ahora)).toBe(true);
    expect(esHoy('2026-09-27T01:42:00.000Z', 'Europe/Madrid', ahora)).toBe(true);
    expect(esHoy('2026-09-26T21:59:00.000Z', 'Europe/Madrid', ahora)).toBe(false);
  });
});

describe('números de presentación', () => {
  it('las barras se miden en centésimas enteras y nunca pasan del 100 %', () => {
    expect(anchoDeBarra('10.00', '20.00')).toBe(50);
    expect(anchoDeBarra('0.01', '20.00')).toBe(0.1);
    expect(anchoDeBarra('40.00', '20.00')).toBe(100);
    expect(anchoDeBarra('0.00', '20.00')).toBe(0);
    expect(escalaDeBarras(['3.00', '22.50'])).toBe('22.50');
    expect(escalaDeBarras(['3.00'])).toBe('20.00');
  });

  it('busca sin acentos ni mayúsculas', () => {
    expect(paraBuscar('  Jalón  al PECHO ')).toBe('jalon al pecho');
  });
});
