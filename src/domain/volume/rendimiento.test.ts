import { describe, expect, it } from 'vitest';
import { type Centesimas, centesimasDesdeDecimal } from './centesimas.js';
import { cargaMedia, progreso, type SerieConCarga } from './rendimiento.js';

/** Una serie de trabajo: `libras` como texto, `rir` por defecto 2. */
function t(ejercicioId: string, libras: string, repeticiones: number, rir = 2): SerieConCarga {
  return {
    ejercicioId,
    tipo: 'trabajo',
    carga: centesimasDesdeDecimal(libras),
    repeticiones,
    rir,
  };
}

function calentamiento(ejercicioId: string, libras: string): SerieConCarga {
  return {
    ejercicioId,
    tipo: 'calentamiento',
    carga: centesimasDesdeDecimal(libras),
    repeticiones: 10,
    rir: null,
  };
}

describe('carga media de trabajo (ADR-024)', () => {
  it('media de las series de trabajo con carga, a la décima', () => {
    expect(cargaMedia([t('press', '135', 8), t('press', '140', 8)])).toBe(13750);
    expect(cargaMedia([t('press', '135', 8), t('press', '135', 8), t('press', '136', 8)])).toBe(
      13530,
    );
  });

  it('sin calentamientos ni series de peso corporal; sin cargas, no hay media', () => {
    expect(
      cargaMedia([calentamiento('press', '45'), t('press', '135', 8), t('dominada', '0', 10)]),
    ).toBe(13500);
    expect(cargaMedia([t('dominada', '0', 10)])).toBeNull();
    expect(cargaMedia([])).toBeNull();
  });

  it('redondea a la décima, a la mitad par', () => {
    // 100.00 y 100.10 → 100.05 → 100.0 (el par); 100.10 y 100.20 → 100.15 → 100.2.
    expect(cargaMedia([t('a', '100', 1), t('a', '100.1', 1)])).toBe(10000);
    expect(cargaMedia([t('a', '100.1', 1), t('a', '100.2', 1)])).toBe(10020);
  });
});

describe('progreso frente a la sesión anterior de la misma área (ADR-024)', () => {
  it('el ejemplo del plan: el press sube un 5.71 %, el remo igual → +2.86 % → +3', () => {
    const antes = [t('press', '175', 8), t('remo', '135', 10)];
    const ahora = [t('press', '185', 8), t('remo', '135', 10)];
    expect(progreso(ahora, antes)).toEqual({ puntos: 3, cambio: 286, ejercicios: 2 });
  });

  it('más repeticiones con la misma carga es progreso; con menos margen (RIR), no', () => {
    expect(progreso([t('press', '135', 10)], [t('press', '135', 8)])?.puntos).toBeGreaterThan(0);
    // Mismas repeticiones y carga, pero llegando más cerca del fallo: podía menos.
    expect(progreso([t('press', '135', 8, 0)], [t('press', '135', 8, 2)])?.puntos).toBeLessThan(0);
    expect(progreso([t('press', '135', 8)], [t('press', '135', 8)])).toEqual({
      puntos: 0,
      cambio: 0,
      ejercicios: 1,
    });
  });

  it('cuenta la mejor serie de cada ejercicio y pesa más el que tiene más series', () => {
    const antes = [t('press', '100', 5), t('curl', '50', 10)];
    const ahora = [
      t('press', '110', 5), // +10 %
      t('press', '110', 5),
      t('press', '60', 5), // una floja no tapa la mejor
      t('curl', '50', 10), // 0 %
    ];
    // (1000 × 3 + 0 × 1) / 4 = 750 → +7.50 % → 8 puntos.
    expect(progreso(ahora, antes)).toEqual({ puntos: 8, cambio: 750, ejercicios: 2 });
  });

  it('sin carga se comparan repeticiones más RIR; con carga contra sin carga, no se compara', () => {
    expect(progreso([t('dominada', '0', 12)], [t('dominada', '0', 10)])?.cambio).toBe(1667);
    expect(progreso([t('dominada', '25', 6)], [t('dominada', '0', 10)])).toBeNull();
  });

  it('los calentamientos no cuentan, y sin ejercicios en común no hay progreso: no se inventa un 0', () => {
    expect(progreso([calentamiento('press', '135')], [t('press', '95', 8)])).toBeNull();
    expect(progreso([t('press', '135', 8)], [t('sentadilla', '225', 5)])).toBeNull();
  });

  it('el tope es ±10', () => {
    expect(progreso([t('press', '200', 8)], [t('press', '100', 8)])?.puntos).toBe(10);
    expect(progreso([t('press', '50', 8)], [t('press', '100', 8)])?.puntos).toBe(-10);
  });

  it('las marcas usan centésimas enteras: nada de coma flotante en el camino', () => {
    const r = progreso([t('press', '62.5', 8)], [t('press', '62.25', 8)]);
    // 62.50 / 62.25 − 1 = 0.4016 % → 40 centésimas de punto.
    expect(r).toEqual({ puntos: 0, cambio: 40, ejercicios: 1 });
    expect(Number.isInteger((r as { cambio: number }).cambio)).toBe(true);
    expect(cargaMedia([t('a', '0.01', 1)])).toBe(0 as Centesimas);
  });
});
