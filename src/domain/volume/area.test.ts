import { describe, expect, it } from 'vitest';
import { areaDe, trenDeEjercicio } from './area.js';
import type { Centesimas } from './centesimas.js';
import type { Agregado } from './tipos.js';

const REGIONES: Record<string, 'superior' | 'inferior' | null> = {
  pecho: 'superior',
  espalda: 'superior',
  pierna: 'inferior',
  gluteo: 'inferior',
  abdomen: null,
};

function con(volumen: Record<string, number>): Agregado {
  return {
    porGrupo: new Map(Object.entries(volumen).map(([g, v]) => [g, v as Centesimas])),
    seriesEfectivas: 0,
    seriesSinMapeo: 0,
    seriesSobreUmbral: 0,
    seriesDeCalentamiento: 0,
    versionesDeParametros: [],
  };
}

const area = (volumen: Record<string, number>) => areaDe(con(volumen), (g) => REGIONES[g] ?? null);

describe('el área de una sesión (ADR-024)', () => {
  it('tren superior o inferior con 2/3 de lo que fue a un tren, frontera incluida', () => {
    expect(area({ pecho: 800, espalda: 400 })).toBe('superior');
    expect(area({ pecho: 200, pierna: 100 })).toBe('superior'); // justo 2/3
    expect(area({ pecho: 199, pierna: 101 })).toBe('completo'); // por debajo
    expect(area({ pierna: 600, gluteo: 200, pecho: 400 })).toBe('inferior'); // 800 de 1200
  });

  it('si ninguno llega a 2/3, cuerpo completo', () => {
    expect(area({ pecho: 500, pierna: 500 })).toBe('completo');
  });

  it('el centro y lo que no tiene región no inclinan la balanza', () => {
    expect(area({ pecho: 100, abdomen: 5000 })).toBe('superior');
    expect(area({ abdomen: 300, desconocido: 300 })).toBeNull();
    expect(area({})).toBeNull();
  });
});

describe('el tren de un ejercicio (ADR-025)', () => {
  const tren = (c: Record<string, number>) =>
    trenDeEjercicio(
      Object.entries(c).map(([grupoId, coeficiente]) => ({
        grupoId,
        coeficiente: coeficiente as Centesimas,
      })),
      (g) => REGIONES[g] ?? null,
    );
  it('el que se lleva más coeficiente; el centro no cuenta; empate o nada, ninguno', () => {
    expect(tren({ pecho: 100, gluteo: 50 })).toBe('superior');
    expect(tren({ pierna: 100, gluteo: 50, espalda: 100 })).toBe('inferior');
    expect(tren({ abdomen: 100, pierna: 25 })).toBe('inferior');
    expect(tren({ pecho: 50, pierna: 50 })).toBeNull();
    expect(tren({ abdomen: 100 })).toBeNull();
    expect(tren({})).toBeNull();
  });
});
