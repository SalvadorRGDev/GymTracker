import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RespuestaDeCaptura } from './captura/contrato.js';
import type { Dashboard, Historial } from './lectura/contrato.js';
import {
  type Cuenta,
  type ServidorDePrueba,
  serieDeAtajo,
  servidorDePrueba,
} from './prueba/servidor.js';

let s: ServidorDePrueba;
let ana: Cuenta;

beforeEach(async () => {
  s = await servidorDePrueba();
  ana = await s.cuenta('ana@ejemplo.com');
  await s.importaBase(ana);
});

afterEach(async () => {
  await s.limpia();
});

function registra(cuenta: Cuenta, sesion: string, serie: Record<string, unknown>) {
  return s.pide({
    method: 'POST',
    url: '/api/registro/v1/serie',
    headers: { cookie: cuenta.cookie },
    payload: { sesion: { clave: sesion }, serie: { clave: randomUUID(), ...serie } },
  });
}

async function historial(): Promise<Historial> {
  const r = await s.pide({
    method: 'GET',
    url: '/api/lectura/v1/historial',
    headers: { cookie: ana.cookie },
  });
  return r.json() as Historial;
}

describe('/api/registro/v1: la captura web', () => {
  it('llama al mismo servicio que el atajo: mismo mensaje, misma sesión si comparten clave', async () => {
    const sesion = randomUUID();
    const web = await registra(ana, sesion, {
      ejercicio: 'Press banca',
      repeticiones: 8,
      carga_kg: '70',
      rir: 2,
      calentamiento: false,
    });
    expect(web.statusCode).toBe(200);
    expect((web.json() as RespuestaDeCaptura).mensaje).toBe(
      'Guardada. Esta semana: Pectoral 1.00 · Tríceps 0.50 · Deltoides anterior 0.50.',
    );
    const portador = await s.portador(ana);
    const atajo = await s.pide({
      method: 'POST',
      url: '/api/captura/v1/serie',
      headers: { authorization: `Bearer ${portador}` },
      payload: serieDeAtajo({ sesion }),
    });
    expect((atajo.json() as RespuestaDeCaptura).serie?.orden).toBe(2);
    const h = await historial();
    expect(h.sesiones).toHaveLength(1);
    expect(h.sesiones[0]?.origen).toBe('registro');
  });

  it('la fecha lógica la pone el servidor con su reloj: el navegador no manda instantes', async () => {
    s.reloj.fija('2026-09-27T05:50:00.000Z'); // sábado 23:50 en Ciudad de México
    const sesion = randomUUID();
    await registra(ana, sesion, {
      ejercicio: 'Sentadilla',
      repeticiones: 5,
      carga_kg: '100',
      rir: 3,
      calentamiento: false,
    });
    s.reloj.fija('2026-09-27T06:15:00.000Z'); // domingo 00:15
    const r = await registra(ana, sesion, {
      ejercicio: 'Sentadilla',
      repeticiones: 5,
      carga_kg: '100',
      rir: 2,
      calentamiento: false,
    });
    expect((r.json() as RespuestaDeCaptura).serie?.fecha_logica).toBe('2026-09-26');
    const conInstante = await s.pide({
      method: 'POST',
      url: '/api/registro/v1/serie',
      headers: { cookie: ana.cookie },
      payload: serieDeAtajo({}),
    });
    expect(conInstante.statusCode).toBe(400);
  });

  it('sin cookie es 401, aunque el cuerpo esté mal', async () => {
    const r = await s.pide({
      method: 'POST',
      url: '/api/registro/v1/serie',
      payload: { basura: true },
    });
    expect(r.statusCode).toBe(401);
  });

  it('una serie mal capturada se borra desde el historial, a la vista', async () => {
    const sesion = randomUUID();
    await registra(ana, sesion, {
      ejercicio: 'Press banca',
      repeticiones: 8,
      carga_kg: '8',
      rir: 2,
      calentamiento: false,
    });
    const serie = (await historial()).sesiones[0]?.series[0];
    const borra = await s.pide({
      method: 'DELETE',
      url: `/api/registro/v1/serie/${serie?.id}`,
      headers: { cookie: ana.cookie },
    });
    expect(borra.statusCode).toBe(204);
    expect((await historial()).sesiones[0]?.series).toEqual([]);
    const otraVez = await s.pide({
      method: 'DELETE',
      url: `/api/registro/v1/serie/${serie?.id}`,
      headers: { cookie: ana.cookie },
    });
    expect(otraVez.statusCode).toBe(404);
  });

  it('una sesión con la fecha mal se confirma o se borra entera; el atajo no puede borrar', async () => {
    const portador = await s.portador(ana);
    await s.pide({
      method: 'POST',
      url: '/api/captura/v1/serie',
      headers: { authorization: `Bearer ${portador}` },
      payload: serieDeAtajo({ iniciada: '2030-01-01T17:00:00Z' }),
    });
    const sesion = (await historial()).sesiones[0];
    expect(sesion?.fecha_por_confirmar).toBe(true);

    const confirma = await s.pide({
      method: 'POST',
      url: `/api/registro/v1/sesion/${sesion?.id}/confirmacion`,
      headers: { cookie: ana.cookie },
    });
    expect(confirma.statusCode).toBe(204);
    expect((await historial()).sesiones[0]?.fecha_por_confirmar).toBe(false);

    const conPortador = await s.pide({
      method: 'DELETE',
      url: `/api/registro/v1/sesion/${sesion?.id}`,
      headers: { authorization: `Bearer ${portador}` },
    });
    expect(conPortador.statusCode).toBe(401);
    const borra = await s.pide({
      method: 'DELETE',
      url: `/api/registro/v1/sesion/${sesion?.id}`,
      headers: { cookie: ana.cookie },
    });
    expect(borra.statusCode).toBe(204);
    expect((await historial()).sesiones).toEqual([]);
  });

  it('lo de otra persona es 404, nunca 403', async () => {
    const beto = await s.cuenta('beto@ejemplo.com');
    await s.importaBase(beto);
    await registra(beto, randomUUID(), {
      ejercicio: 'Press banca',
      repeticiones: 8,
      carga_kg: '70',
      rir: 2,
      calentamiento: false,
    });
    const r = await s.pide({
      method: 'GET',
      url: '/api/lectura/v1/historial',
      headers: { cookie: beto.cookie },
    });
    const deBeto = (r.json() as Historial).sesiones[0];
    const intento = await s.pide({
      method: 'DELETE',
      url: `/api/registro/v1/sesion/${deBeto?.id}`,
      headers: { cookie: ana.cookie },
    });
    expect(intento.statusCode).toBe(404);
    const d = await s.pide({
      method: 'GET',
      url: '/api/lectura/v1/dashboard',
      headers: { cookie: beto.cookie },
    });
    expect(
      (d.json() as Dashboard).grupos.find((g) => g.nombre === 'Pectoral')?.series_efectivas,
    ).toBe('1.00');
  });
});
