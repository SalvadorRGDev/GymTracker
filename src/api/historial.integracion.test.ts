import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Historial, SesionDelHistorial } from './lectura/contrato.js';
import { type Cuenta, type ServidorDePrueba, servidorDePrueba } from './prueba/servidor.js';

/**
 * El historial (ADR-024) de punta a punta: cada sesión con su área, sus series
 * efectivas, la carga media y el progreso frente a la anterior de su área, de
 * diez en diez. La cuenta tiene umbral de RIR 4 y el catálogo base importado.
 */

let s: ServidorDePrueba;
let ana: Cuenta;

beforeEach(async () => {
  s = await servidorDePrueba({ inicio: '2026-03-01T18:00:00.000Z' });
  ana = await s.cuenta('ana@ejemplo.com');
  await s.importaBase(ana);
});

afterEach(async () => {
  await s.limpia();
});

type Serie = readonly [ejercicio: string, libras: string, repeticiones: number, rir: number | null];

/** Un entrenamiento el día `fecha` a mediodía en Ciudad de México; `rir: null` es calentamiento. */
async function entrena(fecha: string, series: readonly Serie[]) {
  s.reloj.fija(`${fecha}T18:00:00.000Z`);
  const sesion = randomUUID();
  for (const [ejercicio, libras, repeticiones, rir] of series) {
    const r = await s.pide({
      method: 'POST',
      url: '/api/registro/v1/serie',
      headers: { cookie: ana.cookie },
      payload: {
        sesion: { clave: sesion },
        serie: {
          clave: randomUUID(),
          ejercicio,
          repeticiones,
          carga_lb: libras,
          ...(rir === null ? {} : { rir }),
          calentamiento: rir === null,
        },
      },
    });
    expect(r.json(), r.body).toMatchObject({ estado: 'aceptada' });
  }
}

async function lee(consulta = ''): Promise<Historial> {
  const r = await s.pide({
    method: 'GET',
    url: `/api/lectura/v1/historial${consulta}`,
    headers: { cookie: ana.cookie },
  });
  expect(r.statusCode, r.body).toBe(200);
  return r.json() as Historial;
}

const del = (h: Historial, fecha: string): SesionDelHistorial | undefined =>
  h.sesiones.find((x) => x.fecha_logica === fecha);

describe('GET /api/lectura/v1/historial (ADR-024)', () => {
  it('cada sesión dice su área, sus series efectivas y su carga media', async () => {
    await entrena('2026-03-02', [
      ['Press banca', '95', 10, null], // calentamiento: ni cuenta ni entra en la media
      ['Press banca', '175', 8, 2],
      ['Press banca', '175', 8, 3],
      ['Press banca', '185', 6, 5], // por encima del umbral: no es efectiva, pero sí trabajo
    ]);
    await entrena('2026-03-03', [
      ['Sentadilla', '225', 5, 2],
      ['Crunch', '0', 15, 1], // el centro no inclina la balanza
    ]);
    await entrena('2026-03-04', [['Crunch', '0', 15, 1]]);
    const h = await lee();
    expect(del(h, '2026-03-02')).toMatchObject({
      area: 'superior',
      series_efectivas: 2,
      carga_media_lb: '178.3', // (175 + 175 + 185) / 3
    });
    expect(del(h, '2026-03-03')).toMatchObject({
      area: 'inferior',
      series_efectivas: 2,
      carga_media_lb: '225.0', // el crunch sin peso no entra en la media
    });
    expect(del(h, '2026-03-04')).toMatchObject({
      area: null,
      carga_media_lb: null,
      progreso: { estado: 'sin-area' },
    });
  });

  it('compara con la anterior de su misma área, no con la de ayer', async () => {
    await entrena('2026-03-02', [['Press banca', '175', 8, 2]]); // superior
    await entrena('2026-03-03', [['Sentadilla', '225', 5, 2]]); // inferior
    await entrena('2026-03-04', [['Press banca', '185', 8, 2]]); // superior: +5.71 %
    await entrena('2026-03-05', [['Sentadilla', '215', 5, 2]]); // inferior: −4.44 %
    const h = await lee();
    expect(del(h, '2026-03-02')?.progreso).toEqual({ estado: 'primera' });
    expect(del(h, '2026-03-03')?.progreso).toEqual({ estado: 'primera' });
    expect(del(h, '2026-03-04')?.progreso).toEqual({
      estado: 'comparada',
      puntos: 6,
      cambio: '+5.71',
      ejercicios: 1,
      frente_a: '2026-03-02',
    });
    expect(del(h, '2026-03-05')?.progreso).toMatchObject({
      estado: 'comparada',
      puntos: -4,
      cambio: '-4.44',
      frente_a: '2026-03-03',
    });
  });

  it('sin ejercicios en común lo dice, en vez de dar un «igual» que no es', async () => {
    await entrena('2026-03-02', [['Press banca', '175', 8, 2]]);
    await entrena('2026-03-04', [['Remo con barra', '135', 10, 2]]);
    expect(del(await lee(), '2026-03-04')?.progreso).toEqual({
      estado: 'sin-comunes',
      frente_a: '2026-03-02',
    });
  });

  it('un día mitad y mitad es cuerpo completo, y se compara con otro cuerpo completo', async () => {
    await entrena('2026-03-02', [
      ['Press banca', '175', 8, 2],
      ['Sentadilla', '225', 5, 2],
    ]);
    await entrena('2026-03-04', [
      ['Press banca', '175', 8, 2],
      ['Sentadilla', '225', 5, 2],
    ]);
    const h = await lee();
    expect(del(h, '2026-03-02')).toMatchObject({
      area: 'completo',
      progreso: { estado: 'primera' },
    });
    expect(del(h, '2026-03-04')?.progreso).toMatchObject({ estado: 'comparada', puntos: 0 });
  });

  it('de diez en diez, de la más reciente a la más antigua; una página de más se acota', async () => {
    for (let dia = 1; dia <= 23; dia += 1) {
      await entrena(`2026-03-${String(dia).padStart(2, '0')}`, [['Press banca', '135', 8, 2]]);
    }
    const primera = await lee();
    expect(primera).toMatchObject({ pagina: 1, paginas: 3, total: 23, por_pagina: 10 });
    expect(primera.sesiones.map((x) => x.fecha_logica).slice(0, 2)).toEqual([
      '2026-03-23',
      '2026-03-22',
    ]);
    const tercera = await lee('?pagina=3');
    expect(tercera.sesiones.map((x) => x.fecha_logica)).toEqual([
      '2026-03-03',
      '2026-03-02',
      '2026-03-01',
    ]);
    // La última de la página 1 se compara con una de la página 2: se calcula con todas.
    expect(primera.sesiones.at(-1)?.progreso).toMatchObject({
      estado: 'comparada',
      frente_a: '2026-03-13',
    });
    expect((await lee('?pagina=9')).pagina).toBe(3);
    const cero = await s.pide({
      method: 'GET',
      url: '/api/lectura/v1/historial?pagina=0',
      headers: { cookie: ana.cookie },
    });
    expect(cero.statusCode).toBe(400);
  });

  it('sin sesiones, una página vacía: nada inventado', async () => {
    expect(await lee()).toEqual({ pagina: 1, paginas: 1, total: 0, por_pagina: 10, sesiones: [] });
  });
});
