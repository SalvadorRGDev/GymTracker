import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LineaSemanal } from './captura/contrato.js';
import type { Catalogo, ResultadoDeParametros } from './lectura/contrato.js';
import type { Comparativa, VersionCompleta } from './planes/contrato.js';
import { type Cuenta, type ServidorDePrueba, servidorDePrueba } from './prueba/servidor.js';

/**
 * Fase 3 de punta a punta: el reloj empieza el domingo 1 de marzo de 2026 y
 * cada entrenamiento fija el reloj en su día (mediodía en Ciudad de México).
 */

let s: ServidorDePrueba;
let ana: Cuenta;
let ids: { press: string; pectoral: string };

beforeEach(async () => {
  s = await servidorDePrueba({ inicio: '2026-03-01T18:00:00.000Z' });
  ana = await s.cuenta('ana@ejemplo.com');
  await s.importaBase(ana);
  const c = (await pide('GET', '/api/lectura/v1/catalogo')).json() as Catalogo;
  ids = {
    press: c.ejercicios.find((e) => e.nombre === 'Press banca')?.id ?? '',
    pectoral: c.grupos.find((g) => g.nombre === 'Pectoral')?.id ?? '',
  };
});

afterEach(async () => {
  await s.limpia();
});

function pide(
  method: 'GET' | 'POST' | 'PUT',
  url: string,
  payload?: unknown,
  cuenta: Cuenta = ana,
) {
  return s.pide({
    method,
    url,
    headers: { cookie: cuenta.cookie },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });
}

async function planPublicado(nombre: string, entradas: unknown[]): Promise<VersionCompleta> {
  const plan = (
    await pide('POST', '/api/planes/v1', { nombre, ciclo_dias: 7 })
  ).json() as VersionCompleta;
  expect(
    (await pide('PUT', `/api/planes/v1/versiones/${plan.id}/entradas`, { entradas })).statusCode,
  ).toBe(200);
  expect((await pide('POST', `/api/planes/v1/versiones/${plan.id}/publicacion`)).statusCode).toBe(
    200,
  );
  return plan;
}

async function asigna(versionId: string, desde: string) {
  const r = await pide('POST', '/api/planes/v1/asignaciones', { version_id: versionId, desde });
  expect(r.statusCode, r.body).toBe(201);
}

/** Un entrenamiento de press banca el día `fecha`, una serie por cada RIR. */
async function entrena(fecha: string, rirs: number[]) {
  s.reloj.fija(`${fecha}T18:00:00.000Z`);
  const sesion = randomUUID();
  for (const rir of rirs) {
    const r = await pide('POST', '/api/registro/v1/serie', {
      sesion: { clave: sesion },
      serie: {
        clave: randomUUID(),
        ejercicio: 'Press banca',
        repeticiones: 8,
        carga_kg: '60',
        rir,
        calentamiento: false,
      },
    });
    expect(r.json(), r.body).toMatchObject({ estado: 'aceptada' });
  }
}

async function compara(consulta: string, cuenta: Cuenta = ana): Promise<Comparativa> {
  const r = await pide('GET', `/api/planes/v1/comparativa?${consulta}`, undefined, cuenta);
  expect(r.statusCode, r.body).toBe(200);
  return r.json() as Comparativa;
}

const grupo = (c: Comparativa, i: number, nombre: string) =>
  c.ventanas[i]?.grupos.find((g) => g.nombre === nombre);

describe('GET /api/planes/v1/comparativa', () => {
  it('la semana del 3 de marzo se compara contra el plan vigente el 3 de marzo, no contra el de hoy', async () => {
    const viejo = await planPublicado('Viejo', [{ dia: 1, grupo_id: ids.pectoral, objetivo: '8' }]);
    const nuevo = await planPublicado('Nuevo', [
      { dia: 1, grupo_id: ids.pectoral, objetivo: '14' },
    ]);
    await asigna(viejo.id, '2026-03-02'); // lunes
    await entrena('2026-03-03', [2, 2, 2]);
    await asigna(nuevo.id, '2026-03-10'); // martes: el nuevo cuenta desde su ancla
    await entrena('2026-03-11', [2, 2, 2, 2, 2]);
    s.reloj.fija('2026-03-20T18:00:00.000Z');

    const c = await compara('ventanas=10');
    expect(
      c.ventanas.map((v) => [v.plan.nombre, v.numero, v.desde, v.hasta, v.dias, v.en_curso]),
    ).toEqual([
      ['Viejo', 1, '2026-03-02', '2026-03-08', 7, false],
      ['Viejo', 2, '2026-03-09', '2026-03-09', 1, false],
      ['Nuevo', 1, '2026-03-10', '2026-03-16', 7, false],
      ['Nuevo', 2, '2026-03-17', '2026-03-23', 7, true],
    ]);
    expect(grupo(c, 0, 'Pectoral')).toMatchObject({
      planeado: '8.00',
      ejecutado: '3.00',
      delta: '-5.00',
      estado: 'deficit',
    });
    expect(grupo(c, 2, 'Pectoral')).toMatchObject({
      planeado: '14.00',
      ejecutado: '5.00',
      delta: '-9.00',
    });
    // Lo que falta de la semana en curso todavía no es déficit.
    expect(grupo(c, 3, 'Pectoral')).toMatchObject({ delta: '-14.00', estado: 'pendiente' });
    // Lo hecho sin plan es superávit, con el signo escrito.
    expect(grupo(c, 0, 'Tríceps')).toMatchObject({
      planeado: '0.00',
      delta: '+1.50',
      estado: 'superavit',
    });
  });

  it('entrenar otro día dentro de la semana del ciclo es desplazamiento, no déficit', async () => {
    const v = await planPublicado('Empuje', [{ dia: 1, ejercicio_id: ids.press, objetivo: '3' }]);
    await asigna(v.id, '2026-03-02');
    await entrena('2026-03-04', [2, 2, 2]); // miércoles, día 3 del ciclo
    s.reloj.fija('2026-03-08T18:00:00.000Z');

    const [ventana] = (await compara('ventanas=1')).ventanas;
    expect(ventana?.grupos.length).toBeGreaterThanOrEqual(2);
    for (const g of ventana?.grupos ?? []) {
      expect(g, g.nombre).toMatchObject({ delta: '0.00', estado: 'en-plan' });
    }
    const pectoral = (d: readonly { id: string; series: string }[] | undefined) =>
      d?.find((x) => x.id === ids.pectoral)?.series;
    expect(ventana?.detalle[0]).toMatchObject({ fecha: '2026-03-02', dia_del_ciclo: 1 });
    expect(pectoral(ventana?.detalle[0]?.planeado)).toBe('3.00');
    expect(ventana?.detalle[0]?.ejecutado).toEqual([]);
    expect(ventana?.detalle[2]).toMatchObject({
      fecha: '2026-03-04',
      dia_del_ciclo: 3,
      planeado: [],
    });
    expect(pectoral(ventana?.detalle[2]?.ejecutado)).toBe('3.00');
  });

  it('una ventana con dos versiones de parámetros las declara, y cada día se lee con la suya', async () => {
    const v = await planPublicado('Pecho', [
      { dia: 1, grupo_id: ids.pectoral, objetivo: '6' },
      { dia: 3, ejercicio_id: ids.press, objetivo: '3' },
    ]);
    await asigna(v.id, '2026-03-02');
    await entrena('2026-03-02', [2, 2]); // fija la versión vigente
    const catalogo = (await pide('GET', '/api/lectura/v1/catalogo')).json() as Catalogo;
    // Desde mañana el press aporta 0.50 al pectoral, y el umbral baja a 3.
    const cambio = (
      await pide('PUT', '/api/lectura/v1/catalogo/parametros', {
        umbral_rir: 3,
        contribuciones: catalogo.parametros.contribuciones.map((p) =>
          p.ejercicio_id === ids.press && p.grupo_id === ids.pectoral
            ? { ...p, coeficiente: '0.50' }
            : p,
        ),
      })
    ).json() as ResultadoDeParametros;
    expect(cambio).toMatchObject({ camino: 'sucesora', vigente_desde: '2026-03-03' });
    await entrena('2026-03-04', [2, 2]);
    s.reloj.fija('2026-03-08T18:00:00.000Z');

    const [ventana] = (await compara('ventanas=1')).ventanas;
    expect(ventana?.versiones_de_parametros.map((p) => [p.vigente_desde, p.umbral_rir])).toEqual([
      ['2000-01-01', 4],
      ['2026-03-03', 3],
    ]);
    // Plan: 6.00 del día 1 (versión vieja) + 3 × 0.50 del día 3 (nueva) = 7.50.
    // Hecho: 2 × 1.00 el día 1 + 2 × 0.50 el día 3 = 3.00. Las mismas reglas cada día.
    expect(ventana?.grupos.find((g) => g.nombre === 'Pectoral')).toMatchObject({
      planeado: '7.50',
      ejecutado: '3.00',
      delta: '-4.50',
    });
  });

  it('la simulación rotula, recalcula con otro umbral y no escribe nada', async () => {
    const v = await planPublicado('Pecho', [{ dia: 1, grupo_id: ids.pectoral, objetivo: '4' }]);
    await asigna(v.id, '2026-03-02');
    await entrena('2026-03-02', [2, 2, 2, 2]);
    s.reloj.fija('2026-03-08T18:00:00.000Z');

    const real = await compara('ventanas=1');
    expect(real.simulacion).toBeNull();
    expect(grupo(real, 0, 'Pectoral')).toMatchObject({ ejecutado: '4.00', estado: 'en-plan' });
    const simulada = await compara('ventanas=1&umbral=1');
    expect(simulada.simulacion).toEqual({ umbral_rir: 1 });
    expect(grupo(simulada, 0, 'Pectoral')).toMatchObject({
      planeado: '4.00',
      ejecutado: '0.00',
      delta: '-4.00',
      estado: 'deficit',
    });
    expect(await compara('ventanas=1')).toEqual(real);
    const catalogo = (await pide('GET', '/api/lectura/v1/catalogo')).json() as Catalogo;
    expect(catalogo.parametros.umbral_rir).toBe(4);
  });

  it('vigila la franja del umbral en las últimas doce semanas, con los umbrales de verdad', async () => {
    await entrena('2026-03-02', [4, 3, 1, 1, 6]);
    s.reloj.fija('2026-03-08T18:00:00.000Z');
    const c = await compara('ventanas=4&umbral=2');
    expect(c.ventanas).toEqual([]); // ningún plan asignado: nada contra qué comparar
    expect(c.vigilancia).toMatchObject({
      hasta: '2026-03-08',
      efectivas: 4,
      en_la_franja: 2,
      porcentaje: '50.0',
      disparador: 15,
      minimo: 30,
      pide_sensibilidad: false, // cuatro efectivas no llegan al mínimo
      umbrales: [4],
    });
  });

  it('cada propietario ve lo suyo, y la consulta se valida después de la credencial', async () => {
    const v = await planPublicado('Pecho', [{ dia: 1, grupo_id: ids.pectoral, objetivo: '4' }]);
    await asigna(v.id, '2026-03-02');
    await entrena('2026-03-02', [2]);
    const beto = await s.cuenta('beto@ejemplo.com');
    const suya = await compara('ventanas=4', beto);
    expect(suya.ventanas).toEqual([]);
    expect(suya.vigilancia).toMatchObject({ efectivas: 0, porcentaje: null });

    expect((await pide('GET', '/api/planes/v1/comparativa?ventanas=0')).json()).toMatchObject({
      codigo: 'ventana',
    });
    expect((await pide('GET', '/api/planes/v1/comparativa?umbral=11')).statusCode).toBe(400);
    const anonima = await s.pide({ method: 'GET', url: '/api/planes/v1/comparativa?umbral=11' });
    expect(anonima.statusCode).toBe(401);
  });
});

describe('GET /api/captura/v1/semana (ADR-019)', () => {
  it('la semana en curso en una frase, calculada en el servidor; sin plan, lo dice', async () => {
    const v = await planPublicado('Empuje', [{ dia: 1, grupo_id: ids.pectoral, objetivo: '8' }]);
    await asigna(v.id, '2026-03-02');
    await entrena('2026-03-03', [2, 2, 2]);
    s.reloj.fija('2026-03-05T18:00:00.000Z');
    const portador = await s.portador(ana);
    const r = await s.pide({
      method: 'GET',
      url: '/api/captura/v1/semana',
      headers: { authorization: `Bearer ${portador}` },
    });
    expect(r.statusCode, r.body).toBe(200);
    const linea = r.json() as LineaSemanal;
    expect(linea.ventana).toEqual({ desde: '2026-03-02', hasta: '2026-03-08' });
    expect(linea.mensaje).toContain('Semana 1 de «Empuje» (hasta el 2026-03-08)');
    expect(linea.mensaje).toContain('Pectoral 3.00 de 8.00');
    // Lo que el plan pide primero: una notificación se corta por el final.
    expect(linea.mensaje).toMatch(/\): Pectoral 3\.00 de 8\.00 · /);

    const beto = await s.cuenta('beto@ejemplo.com');
    const suyo = await s.portador(beto);
    const sinPlan = (
      await s.pide({
        method: 'GET',
        url: '/api/captura/v1/semana',
        headers: { authorization: `Bearer ${suyo}` },
      })
    ).json() as LineaSemanal;
    expect(sinPlan).toEqual({
      mensaje: 'No hay plan asignado hoy: la línea compara contra un plan.',
      ventana: null,
    });
    // La cookie no vale aquí, y el portador sigue sin llegar a los planes.
    expect(
      (
        await s.pide({
          method: 'GET',
          url: '/api/captura/v1/semana',
          headers: { cookie: ana.cookie },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await s.pide({
          method: 'GET',
          url: '/api/planes/v1',
          headers: { authorization: `Bearer ${portador}` },
        })
      ).statusCode,
    ).toBe(401);
  });
});
