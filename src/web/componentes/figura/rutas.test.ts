import { describe, expect, it } from 'vitest';
import grupos from '../../../catalogo/datos/grupos.json';
import { ENCUADRES, matrizDeEncuadre, REGIONES } from './rutas';

const IDS = grupos.map((g) => g.id);

describe('el modelo corporal', () => {
  it('los dieciséis grupos del catálogo base tienen región en al menos una cara', () => {
    const conRegion = new Set([...REGIONES.frente, ...REGIONES.espalda].map((r) => r.grupo));
    expect(IDS).toHaveLength(16);
    expect(IDS.filter((id) => !conRegion.has(id))).toEqual([]);
  });

  it('ninguna región apunta a un grupo que no existe', () => {
    for (const r of [...REGIONES.frente, ...REGIONES.espalda])
      expect(IDS, r.grupo).toContain(r.grupo);
  });

  it('cada región tiene su simétrica: mismo grupo a izquierda y derecha', () => {
    for (const cara of ['frente', 'espalda'] as const) {
      const izquierdas = REGIONES[cara]
        .filter((r) => r.lado === 'izquierdo')
        .map((r) => r.grupo)
        .sort();
      const derechas = REGIONES[cara]
        .filter((r) => r.lado === 'derecho')
        .map((r) => r.grupo)
        .sort();
      expect(derechas).toEqual(izquierdas);
    }
  });

  it('tren superior de espalda: toda la parte trasera, como se pidió', () => {
    const espalda = new Set(REGIONES.espalda.map((r) => r.grupo));
    for (const g of [
      'trapecio',
      'dorsal',
      'deltoides-posterior',
      'deltoides-lateral',
      'triceps',
      'antebrazo',
      'lumbares',
    ]) {
      expect(espalda.has(g), g).toBe(true);
    }
  });

  it('cada encuadre cabe entero en el lienzo', () => {
    for (const vista of Object.keys(ENCUADRES) as (keyof typeof ENCUADRES)[]) {
      const m = matrizDeEncuadre(vista);
      const r = ENCUADRES[vista];
      expect(r.x * m.escala + m.x).toBeGreaterThanOrEqual(-0.001);
      expect((r.x + r.ancho) * m.escala + m.x).toBeLessThanOrEqual(360.001);
      expect((r.y + r.alto) * m.escala + m.y).toBeLessThanOrEqual(520.001);
    }
  });
});
