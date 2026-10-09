import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Catalogo } from './lectura/contrato.js';
import type { Planes, Proyeccion, VersionCompleta, VolumenDeVersion } from './planes/contrato.js';
import { type Cuenta, type ServidorDePrueba, servidorDePrueba } from './prueba/servidor.js';

let s: ServidorDePrueba;
let ana: Cuenta;
let ids: { press: string; sentadilla: string; pectoral: string };

beforeEach(async () => {
  s = await servidorDePrueba();
  ana = await s.cuenta('ana@ejemplo.com');
  await s.importaBase(ana);
  const c = (
    await s.pide({
      method: 'GET',
      url: '/api/lectura/v1/catalogo',
      headers: { cookie: ana.cookie },
    })
  ).json() as Catalogo;
  const ejercicio = (n: string) => c.ejercicios.find((e) => e.nombre === n)?.id ?? '';
  ids = {
    press: ejercicio('Press banca'),
    sentadilla: ejercicio('Sentadilla'),
    pectoral: c.grupos.find((g) => g.nombre === 'Pectoral')?.id ?? '',
  };
});

afterEach(async () => {
  await s.limpia();
});

function pide(method: 'GET' | 'POST' | 'PUT' | 'DELETE', url: string, payload?: unknown) {
  return s.pide({
    method,
    url,
    headers: { cookie: ana.cookie },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });
}

async function planPublicado(
  nombre: string,
  entradas: unknown[],
  ciclo = 7,
): Promise<VersionCompleta> {
  const plan = (
    await pide('POST', '/api/planes/v1', { nombre, ciclo_dias: ciclo })
  ).json() as VersionCompleta;
  const guardada = await pide('PUT', `/api/planes/v1/versiones/${plan.id}/entradas`, { entradas });
  expect(guardada.statusCode, guardada.body).toBe(200);
  const publicada = await pide('POST', `/api/planes/v1/versiones/${plan.id}/publicacion`);
  expect(publicada.statusCode, publicada.body).toBe(200);
  return publicada.json() as VersionCompleta;
}

function serieWeb() {
  return pide('POST', '/api/registro/v1/serie', {
    sesion: { clave: randomUUID() },
    serie: {
      clave: randomUUID(),
      ejercicio: 'Press banca',
      repeticiones: 8,
      carga_lb: '60',
      rir: 2,
      calentamiento: false,
    },
  });
}

describe('autoría de planes', () => {
  it('borrador → entradas → volumen leído del servidor → publicar', async () => {
    const plan = (
      await pide('POST', '/api/planes/v1', { nombre: 'Torso', ciclo_dias: 7 })
    ).json() as VersionCompleta;
    expect(plan).toMatchObject({ numero: 1, publicada_en: null, entradas: 0 });
    const guardada = await pide('PUT', `/api/planes/v1/versiones/${plan.id}/entradas`, {
      entradas: [
        { dia: 1, ejercicio_id: ids.press, objetivo: '4' },
        { dia: 3, ejercicio_id: ids.press, objetivo: '4.50' },
        { dia: 5, grupo_id: ids.pectoral, objetivo: '2' },
      ],
    });
    expect((guardada.json() as VersionCompleta).entradas).toBe(3);

    const simulacion = (
      await pide('GET', `/api/planes/v1/versiones/${plan.id}/volumen`)
    ).json() as VolumenDeVersion;
    expect(simulacion.semanas_de_la_ventana).toBe(1);
    const pectoral = simulacion.grupos.find((g) => g.nombre === 'Pectoral');
    expect(pectoral).toMatchObject({ series_por_semana: '10.50', total: '10.50' });
    expect(pectoral?.referencia).toMatchObject({ estado: 'dentro', respaldo: 'publicado' });
    expect(simulacion.grupos.find((g) => g.nombre === 'Tríceps')?.series_por_semana).toBe('4.25');

    const publicada = await pide('POST', `/api/planes/v1/versiones/${plan.id}/publicacion`);
    expect((publicada.json() as VersionCompleta).publicada_en).toBe('2026-09-26T18:00:00.000Z');
  });

  it('un ciclo de 4 días se simula sobre cuatro semanas y el veredicto es sobre el total', async () => {
    const plan = (
      await pide('POST', '/api/planes/v1', { nombre: 'Ciclo 4', ciclo_dias: 4 })
    ).json() as VersionCompleta;
    await pide('PUT', `/api/planes/v1/versiones/${plan.id}/entradas`, {
      entradas: [{ dia: 1, grupo_id: ids.pectoral, objetivo: '6' }],
    });
    const v = (
      await pide('GET', `/api/planes/v1/versiones/${plan.id}/volumen`)
    ).json() as VolumenDeVersion;
    const pectoral = v.grupos.find((g) => g.nombre === 'Pectoral');
    expect(v.semanas_de_la_ventana).toBe(4);
    expect(pectoral).toMatchObject({ total: '42.00', series_por_semana: '10.50' });
    expect(pectoral?.referencia?.estado).toBe('dentro');
  });

  it('rechazos con código: vacía, publicada, destino, ciclo y duplicado', async () => {
    const plan = (
      await pide('POST', '/api/planes/v1', { nombre: 'Pierna', ciclo_dias: 4 })
    ).json() as VersionCompleta;
    expect(
      (await pide('POST', `/api/planes/v1/versiones/${plan.id}/publicacion`)).json(),
    ).toMatchObject({ codigo: 'vacia' });
    const guarda = (entradas: unknown[]) =>
      pide('PUT', `/api/planes/v1/versiones/${plan.id}/entradas`, { entradas });
    expect((await guarda([{ dia: 1, objetivo: '3' }])).json()).toMatchObject({ codigo: 'destino' });
    expect(
      (await guarda([{ dia: 5, ejercicio_id: ids.sentadilla, objetivo: '3' }])).json(),
    ).toMatchObject({ codigo: 'ciclo' });
    const doble = [
      { dia: 1, ejercicio_id: ids.sentadilla, objetivo: '3' },
      { dia: 1, ejercicio_id: ids.sentadilla, objetivo: '2' },
    ];
    expect((await guarda(doble)).json()).toMatchObject({ codigo: 'duplicado' });
    await guarda([{ dia: 1, ejercicio_id: ids.sentadilla, objetivo: '3' }]);
    await pide('POST', `/api/planes/v1/versiones/${plan.id}/publicacion`);
    const tarde = await guarda([{ dia: 2, ejercicio_id: ids.sentadilla, objetivo: '3' }]);
    expect(tarde.statusCode).toBe(409);
    expect(tarde.json()).toMatchObject({ codigo: 'publicada' });

    // Editar lo publicado es crear la sucesora copiándolo.
    const sucesora = await pide('POST', `/api/planes/v1/${plan.plan_id}/versiones`, {
      copiar_de: plan.id,
    });
    expect(sucesora.json()).toMatchObject({
      numero: 2,
      copiada_de: plan.id,
      publicada_en: null,
      entradas: 1,
    });
  });
});

describe('asignaciones y proyección', () => {
  it('una ventana sin plan lo dice; con plan, proyecta desde el ancla', async () => {
    const v = await planPublicado('Pecho', [{ dia: 1, grupo_id: ids.pectoral, objetivo: '10' }]);
    const asigna = await pide('POST', '/api/planes/v1/asignaciones', {
      version_id: v.id,
      desde: '2026-09-30',
    });
    expect(asigna.statusCode, asigna.body).toBe(201);
    const p = (
      await pide('GET', '/api/planes/v1/proyeccion?desde_semana=0&semanas=3')
    ).json() as Proyeccion;
    expect(p.semanas.map((w) => [w.desde, w.sin_plan])).toEqual([
      ['2026-09-21', true],
      ['2026-09-28', false],
      ['2026-10-05', false],
    ]);
    const pectoral = (i: number) =>
      p.semanas[i]?.grupos.find((g) => g.nombre === 'Pectoral')?.series;
    expect([pectoral(1), pectoral(2)]).toEqual(['10.00', '10.00']); // día 1 = miércoles 30 y miércoles 7
  });

  it('cambio de plan a mitad del histórico: cada semana con el plan vigente entonces', async () => {
    const viejo = await planPublicado('Viejo', [{ dia: 1, grupo_id: ids.pectoral, objetivo: '8' }]);
    const nuevo = await planPublicado('Nuevo', [
      { dia: 1, grupo_id: ids.pectoral, objetivo: '14' },
    ]);
    await pide('POST', '/api/planes/v1/asignaciones', {
      version_id: viejo.id,
      desde: '2026-09-14',
    });
    expect((await serieWeb()).statusCode).toBe(200); // el 26 queda cubierto por el viejo
    const choca = await pide('POST', '/api/planes/v1/asignaciones', {
      version_id: nuevo.id,
      desde: '2026-09-21',
    });
    expect(choca.json()).toMatchObject({ codigo: 'cubre-sesiones' });
    const ok = await pide('POST', '/api/planes/v1/asignaciones', {
      version_id: nuevo.id,
      desde: '2026-09-28',
    });
    expect(ok.statusCode).toBe(201);
    const p = (
      await pide('GET', '/api/planes/v1/proyeccion?desde_semana=-1&semanas=3')
    ).json() as Proyeccion;
    expect(p.semanas.map((w) => w.grupos.find((g) => g.nombre === 'Pectoral')?.series)).toEqual([
      '8.00',
      '8.00',
      '14.00',
    ]);
  });

  it('una asignación que cubre sesiones no se retira; una futura sí', async () => {
    const v = await planPublicado('Pecho', [{ dia: 1, grupo_id: ids.pectoral, objetivo: '10' }]);
    const a = (
      await pide('POST', '/api/planes/v1/asignaciones', { version_id: v.id, desde: '2026-09-21' })
    ).json() as {
      id: string;
    };
    await serieWeb();
    const lista = (await pide('GET', '/api/planes/v1')).json() as Planes;
    expect(lista.asignaciones[0]).toMatchObject({
      id: a.id,
      cubre_sesiones: true,
      vigente_hasta: null,
    });
    const retira = await pide('DELETE', `/api/planes/v1/asignaciones/${a.id}`);
    expect(retira.statusCode).toBe(409);
    expect(retira.json()).toMatchObject({ codigo: 'cubre-sesiones' });

    const futura = (
      await pide('POST', '/api/planes/v1/asignaciones', { version_id: v.id, desde: '2026-10-05' })
    ).json() as {
      id: string;
    };
    expect((await pide('DELETE', `/api/planes/v1/asignaciones/${futura.id}`)).statusCode).toBe(204);
  });

  it('no se asigna un borrador ni se solapa con la vigente', async () => {
    const borrador = (
      await pide('POST', '/api/planes/v1', { nombre: 'B', ciclo_dias: 7 })
    ).json() as VersionCompleta;
    expect(
      (
        await pide('POST', '/api/planes/v1/asignaciones', {
          version_id: borrador.id,
          desde: '2026-10-01',
        })
      ).json(),
    ).toMatchObject({
      codigo: 'borrador',
    });
    const v = await planPublicado('P', [{ dia: 1, grupo_id: ids.pectoral, objetivo: '10' }]);
    await pide('POST', '/api/planes/v1/asignaciones', { version_id: v.id, desde: '2026-10-01' });
    const antes = await pide('POST', '/api/planes/v1/asignaciones', {
      version_id: v.id,
      desde: '2026-09-30',
    });
    expect(antes.json()).toMatchObject({ codigo: 'solape' });
  });

  it('la ventana explícita no pasa de 370 días', async () => {
    const r = await pide('GET', '/api/planes/v1/proyeccion?desde=2026-01-01&hasta=2027-06-01');
    expect(r.statusCode).toBe(422);
    expect(r.json()).toMatchObject({ codigo: 'ventana' });
  });
});
