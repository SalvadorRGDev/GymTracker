import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Catalogo } from './lectura/contrato.js';
import type { VersionCompleta } from './planes/contrato.js';
import { type Cuenta, type ServidorDePrueba, servidorDePrueba } from './prueba/servidor.js';
import type { EntradaDelDia, RutinaDelDia } from './registro/contrato.js';

/**
 * La rutina del día (ADR-022) de punta a punta. El reloj empieza el lunes 2 de
 * marzo de 2026 a mediodía en Ciudad de México (UTC−6); la cuenta tiene umbral
 * de RIR 4. La rutina «Torso-Pierna» tiene un ciclo de 4 días anclado ese lunes:
 * día 1, press banca y pectoral a elegir; día 2, remo y sentadilla; día 3,
 * descanso; día 4, press militar.
 */

let s: ServidorDePrueba;
let ana: Cuenta;
let ids: Record<'press' | 'remo' | 'sentadilla' | 'militar' | 'pectoral', string>;

beforeEach(async () => {
  s = await servidorDePrueba({ inicio: '2026-03-02T18:00:00.000Z' });
  ana = await s.cuenta('ana@ejemplo.com');
  await s.importaBase(ana);
  const c = (await pide('GET', '/api/lectura/v1/catalogo')).json() as Catalogo;
  const ejercicio = (nombre: string) => c.ejercicios.find((e) => e.nombre === nombre)?.id ?? '';
  ids = {
    press: ejercicio('Press banca'),
    remo: ejercicio('Remo con barra'),
    sentadilla: ejercicio('Sentadilla'),
    militar: ejercicio('Press militar'),
    pectoral: c.grupos.find((g) => g.nombre === 'Pectoral')?.id ?? '',
  };
});

afterEach(async () => {
  await s.limpia();
});

function pide(method: 'GET' | 'POST' | 'PUT', url: string, payload?: unknown) {
  return s.pide({
    method,
    url,
    headers: { cookie: ana.cookie },
    ...(payload === undefined ? {} : { payload: payload as object }),
  });
}

async function rutina(nombre: string, ciclo: number, entradas: unknown[], publicar = true) {
  const plan = (
    await pide('POST', '/api/planes/v1', { nombre, ciclo_dias: ciclo })
  ).json() as VersionCompleta;
  const r = await pide('PUT', `/api/planes/v1/versiones/${plan.id}/entradas`, { entradas });
  expect(r.statusCode, r.body).toBe(200);
  if (publicar) {
    const p = await pide('POST', `/api/planes/v1/versiones/${plan.id}/publicacion`);
    expect(p.statusCode, p.body).toBe(200);
  }
  return plan;
}

async function torsoPierna() {
  const plan = await rutina('Torso-Pierna', 4, [
    { dia: 1, ejercicio_id: ids.press, objetivo: '3' },
    { dia: 1, grupo_id: ids.pectoral, objetivo: '2' },
    { dia: 2, ejercicio_id: ids.remo, objetivo: '3' },
    { dia: 2, ejercicio_id: ids.sentadilla, objetivo: '2' },
    { dia: 4, ejercicio_id: ids.militar, objetivo: '2' },
  ]);
  const r = await pide('POST', '/api/planes/v1/asignaciones', {
    version_id: plan.id,
    desde: '2026-03-02',
  });
  expect(r.statusCode, r.body).toBe(201);
  return plan;
}

/** Una serie de `ejercicio`; `rir: null` es un calentamiento. */
async function serie(ejercicio: string, rir: number | null, sesion: string = randomUUID()) {
  const r = await pide('POST', '/api/registro/v1/serie', {
    sesion: { clave: sesion },
    serie: {
      clave: randomUUID(),
      ejercicio,
      repeticiones: 8,
      carga_lb: '40',
      ...(rir === null ? {} : { rir }),
      calentamiento: rir === null,
    },
  });
  expect(r.json(), r.body).toMatchObject({ estado: 'aceptada' });
}

async function lee(consulta = ''): Promise<RutinaDelDia> {
  const r = await pide('GET', `/api/registro/v1/rutina${consulta}`);
  expect(r.statusCode, r.body).toBe(200);
  return r.json() as RutinaDelDia;
}

const fila = (r: RutinaDelDia, nombre: string): EntradaDelDia | undefined =>
  r.vista?.entradas.find((e) =>
    e.tipo === 'ejercicio' ? e.ejercicio.nombre === nombre : e.grupo.nombre === nombre,
  );

describe('GET /api/registro/v1/rutina', () => {
  it('sin rutina asignada no enseña nada, y lo dice con null, no con una rutina inventada', async () => {
    const r = await lee();
    expect(r).toEqual({
      fecha: '2026-03-02',
      de_entrenamiento_abierto: false,
      rutinas: [],
      de_hoy: null,
      vista: null,
    });
  });

  it('enseña la asignada, con el día que toca contado desde el ancla', async () => {
    const plan = await torsoPierna();
    const lunes = await lee();
    expect(lunes.de_hoy).toEqual({ version_id: plan.id, dia: 1 });
    expect(lunes.vista).toMatchObject({
      version_id: plan.id,
      plan_nombre: 'Torso-Pierna',
      ciclo_dias: 4,
      dia: 1,
      es_la_de_hoy: true,
      completa: false,
    });
    expect(lunes.vista?.entradas.map((e) => [e.tipo, e.objetivo, e.hechas])).toEqual([
      ['ejercicio', '3.00', '0.00'],
      ['grupo', '2.00', '0.00'],
    ]);
    expect(lunes.rutinas).toEqual([
      {
        version_id: plan.id,
        plan_nombre: 'Torso-Pierna',
        numero: 1,
        ciclo_dias: 4,
        asignada: true,
      },
    ]);

    s.reloj.fija('2026-03-03T18:00:00.000Z');
    expect(
      (await lee()).vista?.entradas.map((e) => e.tipo === 'ejercicio' && e.ejercicio.nombre),
    ).toEqual(['Remo con barra', 'Sentadilla']);
    // Día 3: descanso. La lista está vacía y el día no está «completo».
    s.reloj.fija('2026-03-04T18:00:00.000Z');
    expect((await lee()).vista).toMatchObject({ dia: 3, entradas: [], completa: false });
    // Un ciclo de 4 días rota sobre el calendario: el viernes vuelve a ser el día 1,
    // y empieza de cero: lo del lunes era de otro día.
    s.reloj.fija('2026-03-02T18:00:00.000Z');
    await serie('Press banca', 2);
    s.reloj.fija('2026-03-06T18:00:00.000Z');
    const viernes = await lee();
    expect(viernes.de_hoy?.dia).toBe(1);
    expect(fila(viernes, 'Press banca')?.hechas).toBe('0.00');
  });

  it('cuenta lo hecho con el motor: sólo efectivas, ni calentamientos ni series sobre el umbral', async () => {
    await torsoPierna();
    await serie('Press banca', null);
    await serie('Press banca', 2);
    await serie('Press banca', 4); // justo en el umbral: cuenta
    await serie('Press banca', 5); // por encima: no cuenta
    expect(fila(await lee(), 'Press banca')).toMatchObject({ hechas: '2.00', completa: false });
    await serie('Press banca', 1);
    expect(fila(await lee(), 'Press banca')).toMatchObject({ hechas: '3.00', completa: true });
  });

  it('un objetivo de grupo cuenta lo que no tiene fila propia, con su coeficiente', async () => {
    await torsoPierna();
    await serie('Press banca', 2);
    await serie('Press banca', 2);
    // El press tiene su fila: no cuenta otra vez para «Pectoral».
    expect(fila(await lee(), 'Pectoral')).toMatchObject({ hechas: '0.00', completa: false });
    await serie('Aperturas con mancuernas', 2); // pectoral 1.00
    await serie('Fondos en paralelas', 2); // pectoral 0.50
    expect(fila(await lee(), 'Pectoral')).toMatchObject({ hechas: '1.50', completa: false });
    await serie('Fondos en paralelas', 2);
    await serie('Press banca', 2);
    const r = await lee();
    expect(fila(r, 'Pectoral')).toMatchObject({ hechas: '2.00', completa: true });
    expect(r.vista?.completa).toBe(true);
  });

  it('un objetivo de grupo ofrece los ejercicios que lo trabajan: primero los de 1.00', async () => {
    await torsoPierna();
    const pectoral = fila(await lee(), 'Pectoral');
    if (pectoral?.tipo !== 'grupo') throw new Error('falta la fila de Pectoral');
    const coeficiente = (nombre: string) =>
      pectoral.ejercicios.find((e) => e.nombre === nombre)?.coeficiente;
    expect(coeficiente('Aperturas con mancuernas')).toBe('1.00');
    expect(coeficiente('Fondos en paralelas')).toBe('0.50');
    expect(coeficiente('Press militar')).toBeUndefined();
    // El press banca tiene su fila ese día: ofrecerlo aquí sería prometer que cuenta dos veces.
    expect(coeficiente('Press banca')).toBeUndefined();
    const orden = pectoral.ejercicios.map((e) => e.coeficiente);
    expect(orden).toEqual([...orden].sort().reverse());
  });

  it('lo que sólo aporta 0.25 a un grupo no se ofrece para él', async () => {
    const deltoides = (
      (await pide('GET', '/api/lectura/v1/catalogo')).json() as Catalogo
    ).grupos.find((g) => g.nombre === 'Deltoides anterior')?.id;
    const plan = await rutina('Hombro', 1, [{ dia: 1, grupo_id: deltoides, objetivo: '3' }]);
    const r = await lee(`?version=${plan.id}`);
    const fila0 = r.vista?.entradas[0];
    if (fila0?.tipo !== 'grupo') throw new Error('falta la fila de Deltoides anterior');
    const nombres = fila0.ejercicios.map((e) => e.nombre);
    expect(nombres).toContain('Press banca'); // 0.50
    expect(nombres).not.toContain('Aperturas con mancuernas'); // 0.25
  });

  it('el entrenamiento abierto manda su fecha: el de las 23:50 no cambia de día a medianoche', async () => {
    await torsoPierna();
    const clave = randomUUID();
    s.reloj.fija('2026-03-03T05:50:00.000Z'); // lunes 2, 23:50 en Ciudad de México
    await serie('Press banca', 2, clave);
    s.reloj.fija('2026-03-03T06:15:00.000Z'); // ya es martes 3, 00:15
    const abierto = await lee(`?sesion=${clave}`);
    expect(abierto).toMatchObject({
      fecha: '2026-03-02',
      de_entrenamiento_abierto: true,
      vista: { dia: 1 },
    });
    expect(fila(abierto, 'Press banca')?.hechas).toBe('1.00');
    expect(await lee()).toMatchObject({
      fecha: '2026-03-03',
      de_entrenamiento_abierto: false,
      vista: { dia: 2 },
    });
  });

  it('otra rutina publicada u otro día, elegidos a mano, se enseñan y no se hacen pasar por los de hoy', async () => {
    const asignada = await torsoPierna();
    const otra = await rutina('Cuerpo entero', 7, [
      { dia: 1, ejercicio_id: ids.sentadilla, objetivo: '4' },
      { dia: 3, ejercicio_id: ids.remo, objetivo: '4' },
    ]);
    const vista = await lee(`?version=${otra.id}`);
    expect(vista.de_hoy).toEqual({ version_id: asignada.id, dia: 1 });
    expect(vista.vista).toMatchObject({
      plan_nombre: 'Cuerpo entero',
      dia: 1,
      es_la_de_hoy: false,
    });
    expect(vista.rutinas.map((r) => [r.plan_nombre, r.asignada])).toEqual([
      ['Torso-Pierna', true],
      ['Cuerpo entero', false],
    ]);
    expect((await lee(`?version=${otra.id}&dia=3`)).vista?.dia).toBe(3);
    expect((await lee('?dia=2')).vista).toMatchObject({ dia: 2, es_la_de_hoy: false });
  });

  it('rechaza con su motivo lo que no se puede enseñar', async () => {
    await torsoPierna();
    const borrador = await rutina(
      'Sin publicar',
      7,
      [{ dia: 1, ejercicio_id: ids.remo, objetivo: '2' }],
      false,
    );
    const r = async (consulta: string) => {
      const respuesta = await pide('GET', `/api/registro/v1/rutina${consulta}`);
      return [respuesta.statusCode, (respuesta.json() as { codigo?: string }).codigo];
    };
    expect(await r('?dia=5')).toEqual([422, 'dia']);
    expect(await r(`?version=${randomUUID()}`)).toEqual([404, 'no-encontrado']);
    expect(await r(`?version=${borrador.id}`)).toEqual([409, 'borrador']);
    expect((await r('?dia=uno'))[0]).toBe(400);
    const anonimo = await s.pide({ method: 'GET', url: '/api/registro/v1/rutina?dia=uno' });
    expect(anonimo.statusCode).toBe(401);
  });

  it('ofrece la última publicada de cada rutina, y la asignada aunque ya no sea la última', async () => {
    const v1 = await torsoPierna();
    const v2 = (
      await pide('POST', `/api/planes/v1/${v1.plan_id}/versiones`, { copiar_de: v1.id })
    ).json() as VersionCompleta;
    expect((await pide('POST', `/api/planes/v1/versiones/${v2.id}/publicacion`)).statusCode).toBe(
      200,
    );
    const r = await lee();
    expect(r.rutinas.map((x) => [x.numero, x.asignada])).toEqual([
      [1, true],
      [2, false],
    ]);
  });

  it('un ejercicio archivado después de publicar la rutina se enseña marcado', async () => {
    await torsoPierna();
    const a = await pide('PUT', `/api/lectura/v1/catalogo/ejercicios/${ids.press}/archivo`, {
      archivado: true,
    });
    expect(a.statusCode, a.body).toBe(204);
    const press = fila(await lee(), 'Press banca');
    expect(press?.tipo === 'ejercicio' && press.ejercicio.archivado).toBe(true);
  });
});

describe('registrar un día elegido de la rutina (ADR-026)', () => {
  /** Una serie de trabajo con la rutina y el día elegidos a mano; devuelve la respuesta. */
  async function serieDelDia(
    rutinaElegida: { dia?: string; version?: string; sesion?: string },
    clave: string = randomUUID(),
    ejercicio = 'Remo con barra',
  ) {
    const r = await pide('POST', '/api/registro/v1/serie', {
      sesion: { clave },
      serie: {
        clave: randomUUID(),
        ejercicio,
        repeticiones: 8,
        carga_lb: '95',
        rir: 2,
        calentamiento: false,
      },
      rutina: rutinaElegida,
    });
    expect(r.statusCode, r.body).toBe(200);
    return r.json() as { estado: string; mensaje: string; serie?: { fecha_logica: string } };
  }

  const fechasDeSesiones = async () => {
    const r = await pide('GET', '/api/lectura/v1/historial');
    return (r.json() as { sesiones: { fecha_logica: string; fecha_por_confirmar: boolean }[] })
      .sesiones;
  };

  it('la lectura dice a qué fecha va cada día: el de hoy, hoy; otro, la última vez que tocaba', async () => {
    await torsoPierna(); // ciclo de 4 anclado el lunes 2
    s.reloj.fija('2026-03-05T18:00:00.000Z'); // jueves 5: toca el día 4
    expect((await lee()).vista?.registro).toEqual({ como: 'hoy', fecha: '2026-03-05' });
    expect((await lee('?dia=2')).vista?.registro).toEqual({
      como: 'dia-del-ciclo',
      fecha: '2026-03-03',
    });
    expect((await lee('?dia=1')).vista?.registro).toEqual({
      como: 'dia-del-ciclo',
      fecha: '2026-03-02',
    });
    // El selector sabe de antemano a qué fecha llevaría cada día.
    expect((await lee()).vista?.fechas_del_ciclo).toEqual([
      '2026-03-02',
      '2026-03-03',
      '2026-03-04',
      '2026-03-05',
    ]);
    // Otra rutina no tiene calendario: lo que se registre con ella va a hoy.
    const otra = await rutina('Cuerpo entero', 7, [
      { dia: 2, ejercicio_id: ids.remo, objetivo: '3' },
    ]);
    expect((await lee(`?version=${otra.id}&dia=2`)).vista?.registro).toEqual({
      como: 'otra-rutina',
      fecha: '2026-03-05',
    });
    expect((await lee(`?version=${otra.id}`)).vista?.fechas_del_ciclo).toBeNull();
  });

  it('guardar con el día 2 elegido lo pone en el martes, y su lista lo cuenta allí, no hoy', async () => {
    await torsoPierna();
    s.reloj.fija('2026-03-05T18:00:00.000Z');
    const r = await serieDelDia({ dia: '2' });
    expect(r).toMatchObject({ estado: 'aceptada', serie: { fecha_logica: '2026-03-03' } });
    expect(fila(await lee('?dia=2'), 'Remo con barra')?.hechas).toBe('1.00');
    expect(await fechasDeSesiones()).toEqual([
      expect.objectContaining({ fecha_logica: '2026-03-03', fecha_por_confirmar: false }),
    ]);
    // Sin elegir nada, sigue yendo a hoy.
    await serie('Press militar', 2);
    expect((await fechasDeSesiones()).map((x) => x.fecha_logica)).toEqual([
      '2026-03-05',
      '2026-03-03',
    ]);
  });

  it('un día que caería antes del inicio de la rutina no tiene fecha: se dice y no se guarda', async () => {
    await torsoPierna();
    s.reloj.fija('2026-03-03T18:00:00.000Z'); // martes 3, día 2: el día 3 sería el sábado 28
    expect((await lee('?dia=3')).vista?.registro).toEqual({
      como: 'antes-del-inicio',
      fecha: null,
      desde: '2026-03-02',
    });
    expect((await lee()).vista?.fechas_del_ciclo).toEqual(['2026-03-02', '2026-03-03', null, null]);
    const r = await serieDelDia({ dia: '3' });
    expect(r.estado).toBe('rechazada');
    expect(r.mensaje).toContain('antes del 2026-03-02');
    expect(await fechasDeSesiones()).toEqual([]);
  });

  it('un entrenamiento es de un día: su clave no acepta series de otro, ni las mezcla', async () => {
    await torsoPierna();
    s.reloj.fija('2026-03-05T18:00:00.000Z');
    const deHoy = randomUUID();
    await serie('Press militar', 2, deHoy);
    const r = await serieDelDia({ dia: '2' }, deHoy);
    expect(r.estado).toBe('rechazada');
    expect(r.mensaje).toContain('van en entrenamientos distintos');
    expect((await fechasDeSesiones()).map((x) => x.fecha_logica)).toEqual(['2026-03-05']);
  });

  it('pasada la medianoche, el día del entrenamiento abierto sigue mandando también al guardar', async () => {
    await torsoPierna();
    const abierto = randomUUID();
    s.reloj.fija('2026-03-03T05:50:00.000Z'); // lunes 2, 23:50: día 1
    await serie('Press banca', 2, abierto);
    s.reloj.fija('2026-03-03T06:15:00.000Z'); // martes 3, 00:15
    // Lo mismo que leyó la pantalla: con el entrenamiento abierto, el día 1 es el de hoy.
    expect((await lee(`?sesion=${abierto}&dia=1`)).vista?.registro).toEqual({
      como: 'hoy',
      fecha: '2026-03-02',
    });
    const r = await serieDelDia({ sesion: abierto, dia: '1' }, abierto, 'Press banca');
    expect(r).toMatchObject({ estado: 'aceptada', serie: { fecha_logica: '2026-03-02' } });
  });
});
