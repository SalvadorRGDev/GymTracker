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
let beto: Cuenta;
let portadorAna: string;
let portadorBeto: string;

beforeEach(async () => {
  s = await servidorDePrueba();
  ana = await s.cuenta('ana@ejemplo.com');
  beto = await s.cuenta('beto@ejemplo.com');
  await s.importaBase(ana);
  await s.importaBase(beto);
  portadorAna = await s.portador(ana);
  portadorBeto = await s.portador(beto);
});

afterEach(async () => {
  await s.limpia();
});

function captura(portador: string, payload: unknown, url = '/api/captura/v1/serie') {
  return s.pide({
    method: 'POST',
    url,
    headers: { authorization: `Bearer ${portador}` },
    payload: payload as object,
  });
}

async function aceptada(
  portador: string,
  payload: unknown,
  url?: string,
): Promise<RespuestaDeCaptura> {
  const r = await captura(portador, payload, url);
  expect(r.statusCode, r.body).toBe(200);
  return r.json() as RespuestaDeCaptura;
}

async function dashboard(cuenta: Cuenta): Promise<Dashboard> {
  const r = await s.pide({
    method: 'GET',
    url: '/api/lectura/v1/dashboard',
    headers: { cookie: cuenta.cookie },
  });
  return r.json() as Dashboard;
}

function volumen(d: Dashboard, grupo: string): string | undefined {
  return d.grupos.find((g) => g.nombre === grupo)?.series_efectivas;
}

describe('credencial de captura', () => {
  it('sin portador, o con la cookie de sesión como portador, es 401', async () => {
    const sin = await s.pide({
      method: 'POST',
      url: '/api/captura/v1/serie',
      payload: serieDeAtajo({}),
    });
    expect(sin.statusCode).toBe(401);
    const token = ana.cookie.split('=')[1] ?? '';
    const conCookie = await captura(token, serieDeAtajo({}));
    expect(conCookie.statusCode).toBe(401);
  });

  it('el portador no vale como cookie: el atajo no lee planes ni la lectura web', async () => {
    const planes = await s.pide({
      method: 'GET',
      url: '/api/planes/v1',
      headers: { authorization: `Bearer ${portadorAna}` },
    });
    expect(planes.statusCode).toBe(401);
    const noExiste = await s.pide({
      method: 'GET',
      url: '/api/captura/v1/planes',
      headers: { authorization: `Bearer ${portadorAna}` },
    });
    expect(noExiste.statusCode).toBe(404);
  });

  it('una credencial revocada deja de valer en el acto', async () => {
    const lista = await s.pide({
      method: 'GET',
      url: '/api/lectura/v1/dispositivos',
      headers: { cookie: ana.cookie },
    });
    const id = (lista.json() as { dispositivos: { id: string }[] }).dispositivos[0]?.id;
    const revoca = await s.pide({
      method: 'DELETE',
      url: `/api/lectura/v1/dispositivos/${id}`,
      headers: { cookie: ana.cookie },
    });
    expect(revoca.statusCode).toBe(204);
    expect((await captura(portadorAna, serieDeAtajo({}))).statusCode).toBe(401);
  });

  it('un contrato desconocido contesta 426 con la dirección de reinstalación en el cuerpo', async () => {
    const r = await captura(portadorAna, serieDeAtajo({}), '/api/captura/v2/serie');
    expect(r.statusCode).toBe(426);
    expect(r.json()).toMatchObject({
      codigo: 'contrato-desconocido',
      reinstalar: 'https://ejemplo.invalid/atajos',
    });
  });

  it('límite de tasa por credencial: 120 por minuto', async () => {
    for (let i = 0; i < 120; i += 1) {
      const r = await s.pide({
        method: 'GET',
        url: '/api/captura/v1/catalogo',
        headers: { authorization: `Bearer ${portadorAna}` },
      });
      expect(r.statusCode).toBe(200);
    }
    const limitada = await s.pide({
      method: 'GET',
      url: '/api/captura/v1/catalogo',
      headers: { authorization: `Bearer ${portadorAna}` },
    });
    expect(limitada.statusCode).toBe(429);
    expect(limitada.headers['retry-after']).toBeDefined();
    // La otra persona tiene su propio cubo.
    const otra = await s.pide({
      method: 'GET',
      url: '/api/captura/v1/catalogo',
      headers: { authorization: `Bearer ${portadorBeto}` },
    });
    expect(otra.statusCode).toBe(200);
  });
});

describe('POST /api/captura/v1/serie', () => {
  it('registra y devuelve el total de la semana calculado por el motor', async () => {
    const r = await aceptada(portadorAna, serieDeAtajo({ rir: 2 }));
    expect(r.estado).toBe('aceptada');
    expect(r.semana).toEqual([
      { grupo: 'Pectoral', series_efectivas: '1.00' },
      { grupo: 'Tríceps', series_efectivas: '0.50' },
      { grupo: 'Deltoides anterior', series_efectivas: '0.50' },
    ]);
    expect(r.mensaje).toBe(
      'Guardada. Esta semana: Pectoral 1.00 · Tríceps 0.50 · Deltoides anterior 0.50.',
    );
    expect(r.serie).toMatchObject({
      orden: 1,
      fecha_logica: '2026-09-26',
      fecha_por_confirmar: false,
    });
    expect(volumen(await dashboard(ana), 'Pectoral')).toBe('1.00');
  });

  it('el reenvío con la misma clave no produce un segundo efecto', async () => {
    const cuerpo = serieDeAtajo({});
    await aceptada(portadorAna, cuerpo);
    const repetida = await aceptada(portadorAna, cuerpo);
    expect(repetida.mensaje).toMatch(/^Ya estaba registrada\. Esta semana: Pectoral 1\.00/);
    expect(volumen(await dashboard(ana), 'Pectoral')).toBe('1.00');
  });

  it('la misma clave con otros datos se rechaza y no se escribe nada', async () => {
    const cuerpo = serieDeAtajo({});
    await aceptada(portadorAna, cuerpo);
    const otra = await aceptada(portadorAna, {
      ...cuerpo,
      serie: { ...cuerpo.serie, repeticiones: 12 },
    });
    expect(otra.estado).toBe('rechazada');
    expect(volumen(await dashboard(ana), 'Pectoral')).toBe('1.00');
  });

  it('un ejercicio desconocido se rechaza con 200 y no se crea nada', async () => {
    const r = await aceptada(portadorAna, serieDeAtajo({ ejercicio: 'Press vanca' }));
    expect(r).toEqual({
      estado: 'rechazada',
      mensaje:
        '«Press vanca» no está en tu catálogo. Se busca por nombre exacto; revisa cómo se escribe.',
    });
    const catalogo = await s.pide({
      method: 'GET',
      url: '/api/captura/v1/catalogo',
      headers: { authorization: `Bearer ${portadorAna}` },
    });
    const nombres = (catalogo.json() as { ejercicios: { nombre: string }[] }).ejercicios.map(
      (e) => e.nombre,
    );
    expect(nombres).not.toContain('Press vanca');
    expect(nombres).toContain('Press banca');
  });

  it('resuelve el nombre con la clave del índice único, no por parecido', async () => {
    expect(
      (await aceptada(portadorAna, serieDeAtajo({ ejercicio: '  press BANCA ' }))).estado,
    ).toBe('aceptada');
    expect((await aceptada(portadorAna, serieDeAtajo({ ejercicio: 'Press banc' }))).estado).toBe(
      'rechazada',
    );
  });

  it('la sesión que cruza la medianoche es una sola, con la fecha de su inicio', async () => {
    // 23:50 del sábado 26 en Ciudad de México = 05:50Z del domingo.
    const sesion = randomUUID();
    await aceptada(
      portadorAna,
      serieDeAtajo({ sesion, iniciada: '2026-09-27T05:50:00Z', realizada: '2026-09-27T05:52:00Z' }),
    );
    s.reloj.fija('2026-09-27T06:20:00.000Z');
    const pasadaLaMedianoche = await aceptada(
      portadorAna,
      serieDeAtajo({ sesion, iniciada: '2026-09-27T05:50:00Z', realizada: '2026-09-27T06:15:00Z' }),
    );
    expect(pasadaLaMedianoche.serie).toMatchObject({ orden: 2, fecha_logica: '2026-09-26' });

    const historial = await s.pide({
      method: 'GET',
      url: '/api/lectura/v1/historial',
      headers: { cookie: ana.cookie },
    });
    const sesiones = (historial.json() as Historial).sesiones;
    expect(sesiones).toHaveLength(1);
    expect(sesiones[0]?.series).toHaveLength(2);
    // Una sesión NUEVA empezada a las 00:15 sí es del domingo.
    const nueva = await aceptada(portadorAna, serieDeAtajo({ iniciada: '2026-09-27T06:15:00Z' }));
    expect(nueva.serie?.fecha_logica).toBe('2026-09-27');
  });

  it('el calentamiento se guarda y no cuenta volumen', async () => {
    const r = await aceptada(portadorAna, serieDeAtajo({ calentamiento: true }));
    expect(r.mensaje).toMatch(
      /^Guardada\. Calentamiento: no cuenta volumen\. Esta semana: Pectoral 0\.00/,
    );
    const d = await dashboard(ana);
    expect(volumen(d, 'Pectoral')).toBe('0.00');
    expect(d.diagnostico.series_de_calentamiento).toBe(1);
  });

  it('por encima del umbral se guarda y se dice que no cuenta', async () => {
    const r = await aceptada(portadorAna, serieDeAtajo({ rir: 6 }));
    expect(r.mensaje).toContain('RIR 6 por encima de tu umbral (4): no cuenta como efectiva.');
    expect((await dashboard(ana)).diagnostico.series_sobre_umbral).toBe(1);
  });

  it('una fecha futura entra marcada por confirmar (riesgo R3)', async () => {
    const r = await aceptada(portadorAna, serieDeAtajo({ iniciada: '2026-10-05T17:00:00Z' }));
    expect(r.serie).toMatchObject({ fecha_logica: '2026-10-05', fecha_por_confirmar: true });
  });

  it('acepta la coma decimal del iPhone y números JSON, y nunca más de dos decimales', async () => {
    expect((await aceptada(portadorAna, serieDeAtajo({ carga: '62,5' }))).estado).toBe('aceptada');
    expect((await aceptada(portadorAna, serieDeAtajo({ carga: 62.5 }))).estado).toBe('aceptada');
    expect((await captura(portadorAna, serieDeAtajo({ carga: '62.555' }))).statusCode).toBe(400);
    const historial = await s.pide({
      method: 'GET',
      url: '/api/lectura/v1/historial',
      headers: { cookie: ana.cookie },
    });
    const cargas = (historial.json() as Historial).sesiones.flatMap((x) =>
      x.series.map((y) => y.carga_lb),
    );
    expect(cargas.sort()).toEqual(['62.5', '62.5']);
  });

  it('un atajo anterior a las libras manda kilos: se guardan en libras y la respuesta lo dice (ADR-023)', async () => {
    const cuerpo = serieDeAtajo({ kilos: '60' });
    const r = await aceptada(portadorAna, cuerpo);
    expect(r.mensaje).toContain('60 kg = 132.28 lb');
    // El reenvío del drenado con los mismos kilos es la misma serie, no otra.
    expect((await aceptada(portadorAna, cuerpo)).mensaje).toMatch(/^Ya estaba registrada\. 60 kg/);
    const historial = await s.pide({
      method: 'GET',
      url: '/api/lectura/v1/historial',
      headers: { cookie: ana.cookie },
    });
    const cargas = (historial.json() as Historial).sesiones.flatMap((x) =>
      x.series.map((y) => y.carga_lb),
    );
    expect(cargas).toEqual(['132.28']);
  });

  it('la carga va en libras o en kilos, una sola: las dos o ninguna es un 400', async () => {
    const cuerpo = serieDeAtajo({});
    const ambas = { ...cuerpo, serie: { ...cuerpo.serie, carga_kg: '60' } };
    expect((await captura(portadorAna, ambas)).statusCode).toBe(400);
    const { carga_lb: _quitada, ...sinCarga } = cuerpo.serie as typeof cuerpo.serie & {
      carga_lb?: string;
    };
    expect((await captura(portadorAna, { ...cuerpo, serie: sinCarga })).statusCode).toBe(400);
    expect((await captura(portadorAna, serieDeAtajo({ carga: '2500.01' }))).statusCode).toBe(400);
    expect((await aceptada(portadorAna, serieDeAtajo({ carga: '2500' }))).estado).toBe('aceptada');
  });

  it('validación estricta: ni propiedades de más ni tipos convertidos', async () => {
    const cuerpo = serieDeAtajo({});
    expect((await captura(portadorAna, { ...cuerpo, extra: 1 })).statusCode).toBe(400);
    expect(
      (await captura(portadorAna, { ...cuerpo, serie: { ...cuerpo.serie, repeticiones: '10' } }))
        .statusCode,
    ).toBe(400);
    expect(
      (await captura(portadorAna, { ...cuerpo, serie: { ...cuerpo.serie, rir: 22 } })).statusCode,
    ).toBe(400);
    const sinRir = serieDeAtajo({ rir: null });
    expect((await captura(portadorAna, sinRir)).statusCode).toBe(400);
  });

  it('aislamiento: lo capturado por una persona no toca los números de la otra', async () => {
    await aceptada(portadorAna, serieDeAtajo({}));
    await aceptada(portadorAna, serieDeAtajo({}));
    await aceptada(portadorBeto, serieDeAtajo({}));
    expect(volumen(await dashboard(ana), 'Pectoral')).toBe('2.00');
    expect(volumen(await dashboard(beto), 'Pectoral')).toBe('1.00');
  });
});

describe('cierre, peso y catálogo', () => {
  it('cerrar devuelve el resumen de ESA sesión, calculado por el motor', async () => {
    const sesion = randomUUID();
    await aceptada(portadorAna, serieDeAtajo({ sesion, calentamiento: true }));
    await aceptada(portadorAna, serieDeAtajo({ sesion }));
    await aceptada(portadorAna, serieDeAtajo({ sesion, ejercicio: 'Sentadilla' }));
    await aceptada(portadorAna, serieDeAtajo({})); // otra sesión del mismo día
    const cierre = await aceptada(
      portadorAna,
      { sesion: { clave: sesion }, finalizada_en: '2026-09-26T18:00:00Z' },
      '/api/captura/v1/sesion/cerrar',
    );
    expect(cierre.mensaje).toBe(
      'Entrenamiento cerrado. 3 series, 2 efectivas. Pectoral 1.00 · Cuádriceps 1.00 · Tríceps 0.50 · Deltoides anterior 0.50 · Glúteo 0.50 · Aductores 0.50 · Lumbares 0.25.',
    );
    const otraVez = await aceptada(
      portadorAna,
      { sesion: { clave: sesion }, finalizada_en: '2026-09-26T18:30:00Z' },
      '/api/captura/v1/sesion/cerrar',
    );
    expect(otraVez.mensaje).toMatch(/^Ya estaba cerrado\./);
  });

  it('el peso es idempotente por fecha lógica y se puede corregir', async () => {
    const url = '/api/captura/v1/peso';
    expect(
      (await aceptada(portadorAna, { peso_kg: '72,40', medido_en: '2026-09-26T13:00:00Z' }, url))
        .mensaje,
    ).toBe('Peso del 2026-09-26: 72.40 kg.');
    expect(
      (await aceptada(portadorAna, { peso_kg: '72.4', medido_en: '2026-09-26T14:00:00Z' }, url))
        .mensaje,
    ).toBe('Peso del 2026-09-26: 72.40 kg (ya estaba).');
    expect(
      (await aceptada(portadorAna, { peso_kg: 71.9, medido_en: '2026-09-26T15:00:00Z' }, url))
        .mensaje,
    ).toBe('Peso del 2026-09-26 corregido: 71.9 kg.');
    expect(
      (await captura(portadorAna, { peso_kg: '19.99', medido_en: '2026-09-26T15:00:00Z' }, url))
        .statusCode,
    ).toBe(400);
  });

  it('el catálogo del atajo trae ejercicios no archivados y grupos, por nombre', async () => {
    const r = await s.pide({
      method: 'GET',
      url: '/api/captura/v1/catalogo',
      headers: { authorization: `Bearer ${portadorAna}` },
    });
    const cuerpo = r.json() as { ejercicios: { nombre: string }[]; grupos: { nombre: string }[] };
    expect(cuerpo.ejercicios).toHaveLength(170);
    expect(cuerpo.grupos).toHaveLength(16);
    expect(r.headers['cache-control']).toBe('no-store');
  });
});
