import { describe, expect, it } from 'vitest';
import { centesimasDesdeDecimal } from '../domain/volume/index.js';
import { ESCALA, nivelDeVolumen } from './escala.js';
import { fechaLogicaEn, instanteDelCliente } from './zona.js';

describe('escala del mapa muscular', () => {
  it('corta en 0, 4, 8, 12, 16 y 20 sin redondear', () => {
    const casos: [string, number][] = [
      ['0.00', 0],
      ['0.01', 1],
      ['3.99', 1],
      ['4.00', 2],
      ['7.99', 2],
      ['8.00', 3],
      ['11.99', 3],
      ['12.00', 4],
      ['15.99', 4],
      ['16.00', 5],
      ['19.99', 5],
      ['20.00', 6],
      ['87.50', 6],
    ];
    for (const [volumen, nivel] of casos)
      expect(nivelDeVolumen(centesimasDesdeDecimal(volumen)), volumen).toBe(nivel);
  });

  it('cada tramo de la leyenda corresponde a su nivel en sus dos bordes', () => {
    for (const tramo of ESCALA.slice(1)) {
      expect(
        nivelDeVolumen(centesimasDesdeDecimal(tramo.desde === '0.00' ? '0.01' : tramo.desde)),
      ).toBe(tramo.nivel);
      if (tramo.hasta !== null) {
        const justoAntes = centesimasDesdeDecimal(tramo.hasta) - 1;
        expect(nivelDeVolumen(justoAntes as never)).toBe(tramo.nivel);
      }
    }
  });

  it('los rótulos describen cantidad, nunca «bien» o «mal»', () => {
    for (const tramo of ESCALA)
      expect(tramo.rotulo).not.toMatch(/bien|mal|óptim|excelente|insuficiente|nota/i);
  });
});

describe('fecha lógica desde la zona de la cuenta', () => {
  it('las 23:50 y las 00:15 de Ciudad de México son días distintos en UTC y en la zona', () => {
    expect(fechaLogicaEn(new Date('2026-09-27T05:50:00Z'), 'America/Mexico_City')).toBe(
      '2026-09-26',
    );
    expect(fechaLogicaEn(new Date('2026-09-27T06:15:00Z'), 'America/Mexico_City')).toBe(
      '2026-09-27',
    );
  });

  it('respeta los cambios de horario de las zonas que los tienen', () => {
    // Madrid pasa a UTC+1 el 25 de octubre de 2026 a las 03:00 locales.
    expect(fechaLogicaEn(new Date('2026-10-24T22:30:00Z'), 'Europe/Madrid')).toBe('2026-10-25');
    expect(fechaLogicaEn(new Date('2026-10-25T22:30:00Z'), 'Europe/Madrid')).toBe('2026-10-25');
  });

  it('acepta el ISO 8601 que produce Atajos y rechaza lo ambiguo', () => {
    expect(instanteDelCliente('2026-09-26T23:50:00-06:00')?.toISOString()).toBe(
      '2026-09-27T05:50:00.000Z',
    );
    expect(instanteDelCliente('2026-09-26T23:50-0600')?.toISOString()).toBe(
      '2026-09-27T05:50:00.000Z',
    );
    expect(instanteDelCliente('2026-09-27T05:50:00.123Z')?.toISOString()).toBe(
      '2026-09-27T05:50:00.123Z',
    );
    expect(instanteDelCliente('2026-09-26 23:50')).toBeNull(); // sin zona: ¿de dónde?
    expect(instanteDelCliente('ayer')).toBeNull();
  });
});
