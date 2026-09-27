import { randomUUID } from 'node:crypto';
import { readdir, readFile, stat, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  type AlmacenDeUsuario,
  type Deposito,
  ErrorDeAlcance,
  ErrorDeCuentaInexistente,
} from './acceso.js';
import { ALCANCE_DE_HOJA, type Fila, LIBRO, type TablasDeLibro } from './esquema.js';
import { compruebaLibro, ErrorDeInvariante } from './invariantes.js';
import { ErrorDeConcurrencia, hojasDesdeTablas, tablasDesdeHojas } from './libro.js';
import { cuentaDePrueba, type DepositoDePrueba, depositoDePrueba } from './prueba/temporal.js';
import { ErrorDeXlsx, escribeLibro, leeLibro } from './xlsx.js';

let prueba: DepositoDePrueba;
let deposito: Deposito;
let ana: string;
let beto: string;

beforeEach(async () => {
  prueba = await depositoDePrueba();
  deposito = prueba.deposito;
  ana = await cuentaDePrueba(deposito, 'ana@ejemplo.com');
  beto = await cuentaDePrueba(deposito, 'beto@ejemplo.com');
});

afterEach(async () => {
  await prueba.limpia();
});

function comoWeb<T>(usuarioId: string, trabajo: (a: AlmacenDeUsuario) => T): Promise<T> {
  return deposito.conAlmacenDeUsuario({ usuarioId, alcance: 'sesion' }, trabajo);
}

function comoAtajo<T>(usuarioId: string, trabajo: (a: AlmacenDeUsuario) => T): Promise<T> {
  return deposito.conAlmacenDeUsuario({ usuarioId, alcance: 'captura' }, trabajo);
}

interface Semilla {
  grupo: Fila<'grupo_muscular'>;
  otroGrupo: Fila<'grupo_muscular'>;
  ejercicio: Fila<'ejercicio'>;
  version: Fila<'version_parametros'>;
  contribucion: Fila<'contribucion_muscular'>;
}

function siembra(usuarioId: string): Promise<Semilla> {
  return comoWeb(usuarioId, (a) => {
    const grupo = a.inserta('grupo_muscular', { id: randomUUID(), nombre: 'Pectoral' });
    const otroGrupo = a.inserta('grupo_muscular', { id: randomUUID(), nombre: 'Tríceps' });
    const ejercicio = a.inserta('ejercicio', {
      id: randomUUID(),
      nombre: 'Press banca',
      archivado_en: null,
    });
    const version = a.lee('version_parametros')[0];
    if (version === undefined) throw new Error('sin versión inicial');
    const contribucion = a.inserta('contribucion_muscular', {
      id: randomUUID(),
      version_parametros_id: version.id,
      ejercicio_id: ejercicio.id,
      grupo_muscular_id: grupo.id,
      coeficiente: '1.00',
    });
    return { grupo, otroGrupo, ejercicio, version, contribucion };
  });
}

function nuevaSesion(
  a: AlmacenDeUsuario,
  versionId: string,
  fecha = '2026-09-26',
  clave: string = randomUUID(),
): Fila<'sesion'> {
  return a.inserta('sesion', {
    id: randomUUID(),
    clave_idempotencia: clave,
    fecha_logica: fecha,
    version_parametros_id: versionId,
    iniciada_en: '2026-09-26T17:00:00.000Z',
    finalizada_en: null,
    fecha_por_confirmar: 'false',
    origen: 'registro',
  });
}

function nuevaSerie(
  a: AlmacenDeUsuario,
  sesionId: string,
  ejercicioId: string,
  opciones: { orden?: number; clave?: string; rir?: string | null; calentamiento?: boolean } = {},
): Fila<'serie'> {
  const calentamiento = opciones.calentamiento ?? false;
  return a.inserta('serie', {
    id: randomUUID(),
    sesion_id: sesionId,
    clave_idempotencia: opciones.clave ?? randomUUID(),
    orden: String(opciones.orden ?? 1),
    ejercicio_id: ejercicioId,
    repeticiones: '10',
    carga_kg: '60.00',
    rir: opciones.rir === undefined ? (calentamiento ? null : '2') : opciones.rir,
    es_calentamiento: calentamiento ? 'true' : 'false',
    realizada_en: '2026-09-26T17:05:00.000Z',
  });
}

async function fijaVersion(usuarioId: string, s: Semilla): Promise<Fila<'sesion'>> {
  return comoWeb(usuarioId, (a) => {
    const sesion = nuevaSesion(a, s.version.id);
    nuevaSerie(a, sesion.id, s.ejercicio.id);
    return sesion;
  });
}

describe('cuentas y libros', () => {
  it('cada cuenta tiene su libro con una versión de parámetros inicial', async () => {
    const versiones = await comoWeb(ana, (a) => a.lee('version_parametros'));
    expect(versiones).toHaveLength(1);
    expect(versiones[0]).toMatchObject({
      umbral_rir: '4',
      vigente_desde: '2000-01-01',
      vigente_hasta: null,
    });
    const archivos = await readdir(prueba.directorio);
    expect(archivos).toEqual(
      expect.arrayContaining(['cuentas.xlsx', `${ana}.xlsx`, `${beto}.xlsx`]),
    );
  });

  it('no admite dos cuentas con el mismo correo', async () => {
    await expect(cuentaDePrueba(deposito, 'ana@ejemplo.com')).rejects.toThrow(/Ya existe/);
  });

  it('una identidad sin cuenta no abre nada', async () => {
    await expect(comoWeb(randomUUID(), () => 1)).rejects.toBeInstanceOf(ErrorDeCuentaInexistente);
    await expect(comoWeb('../cuentas', () => 1)).rejects.toBeInstanceOf(ErrorDeCuentaInexistente);
  });

  it('la baja borra de verdad: filas, libro y copias con sus datos; lo de los demás, intacto', async () => {
    const s = await siembra(ana);
    await fijaVersion(ana, s);
    await siembra(beto);
    const instante = '2026-09-26T18:00:00.000Z';
    await deposito.conCuentas((c) => {
      for (const usuario_id of [ana, beto]) {
        c.inserta('token_sesion', {
          id: randomUUID(),
          usuario_id,
          huella: (usuario_id === ana ? 'a' : 'c').repeat(64),
          emitido_en: instante,
          expira_en: '2026-10-26T18:00:00.000Z',
          renovado_en: instante,
        });
      }
      c.inserta('token_captura', {
        id: randomUUID(),
        usuario_id: ana,
        huella: 'b'.repeat(64),
        nombre: 'iPhone',
        emitido_en: instante,
        expira_en: '2027-09-26T18:00:00.000Z',
        ultimo_uso_en: null,
      });
    });

    const resumen = await deposito.eliminaCuenta('ana@ejemplo.com');
    expect(resumen).toMatchObject({ usuarioId: ana, sesiones: 1, series: 1 });
    expect(resumen?.respaldosBorrados).toBeGreaterThan(0);

    const archivos = await readdir(prueba.directorio);
    expect(archivos).not.toContain(`${ana}.xlsx`);
    expect(archivos).toContain(`${beto}.xlsx`);
    const respaldos = await readdir(join(prueba.directorio, 'respaldos'));
    expect(respaldos.some((n) => n.startsWith(ana))).toBe(false);
    expect(respaldos.some((n) => n.startsWith(beto))).toBe(true);
    // Las copias de cuentas.xlsx se rehacen: una, la de después, sin su correo.
    const deCuentas = respaldos.filter((n) => n.startsWith('cuentas--'));
    expect(deCuentas).toHaveLength(1);
    for (const n of deCuentas) {
      const texto = JSON.stringify(
        leeLibro(await readFile(join(prueba.directorio, 'respaldos', n))),
      );
      expect(texto).not.toContain('ana@ejemplo.com');
      expect(texto).not.toContain(ana);
      expect(texto).toContain('beto@ejemplo.com');
    }

    const cuentas = await deposito.conCuentas((c) => ({
      correos: c.lee('usuario').map((u) => u.correo),
      suyas: [...c.lee('token_sesion'), ...c.lee('token_captura')].filter(
        (x) => x.usuario_id === ana,
      ).length,
      deBeto: c.lee('token_sesion').filter((x) => x.usuario_id === beto).length,
    }));
    expect(cuentas).toEqual({ correos: ['beto@ejemplo.com'], suyas: 0, deBeto: 1 });
    await expect(comoWeb(ana, () => 1)).rejects.toBeInstanceOf(ErrorDeCuentaInexistente);
    expect(await comoWeb(beto, (a) => a.lee('ejercicio').length)).toBe(1);
    expect(await deposito.verifica()).toMatchObject({ propietarios: 1, huerfanos: [] });
    expect(await deposito.eliminaCuenta('ana@ejemplo.com')).toBeNull();
  });

  it('un libro roto no impide la baja: se borra igual y se dice que no se pudo contar', async () => {
    await writeFile(join(prueba.directorio, `${ana}.xlsx`), 'esto no es un xlsx');
    expect(await deposito.eliminaCuenta('ana@ejemplo.com')).toMatchObject({
      usuarioId: ana,
      sesiones: null,
      series: null,
    });
    expect(await readdir(prueba.directorio)).not.toContain(`${ana}.xlsx`);
  });

  it('verifica cuenta propietarios, sesiones y series sin escribir nada', async () => {
    const s = await siembra(ana);
    await fijaVersion(ana, s);
    expect(await deposito.verifica()).toEqual({
      propietarios: 2,
      sesiones: 1,
      series: 1,
      huerfanos: [],
    });
  });
});

describe('aislamiento entre propietarios', () => {
  it('lo escrito por una persona no aparece en el libro de la otra', async () => {
    await siembra(ana);
    expect(await comoWeb(beto, (a) => a.lee('grupo_muscular'))).toEqual([]);
    expect(await comoWeb(ana, (a) => a.lee('grupo_muscular').map((g) => g.nombre))).toEqual([
      'Pectoral',
      'Tríceps',
    ]);
  });

  it('una fila ajena colada en un libro impide cargarlo', async () => {
    const ruta = join(prueba.directorio, `${ana}.xlsx`);
    const tablas = tablasDesdeHojas(LIBRO, leeLibro(await readFile(ruta)));
    const colada: TablasDeLibro = {
      ...tablas,
      grupo_muscular: [
        {
          id: randomUUID(),
          propietario_id: beto,
          nombre: 'Ajeno',
          creado_en: '2026-09-26T18:00:00.000Z',
        },
      ],
    };
    await writeFile(ruta, escribeLibro(hojasDesdeTablas(LIBRO, colada)));
    await expect(comoWeb(ana, (a) => a.lee('grupo_muscular'))).rejects.toThrow(
      /pertenece a otro propietario/,
    );
  });
});

describe('parámetros versionados (ADR-003 y ADR-013)', () => {
  it('sin ninguna sesión que la fije, la versión se reescribe en sitio', async () => {
    const s = await siembra(ana);
    await comoWeb(ana, (a) => {
      a.actualiza('version_parametros', s.version.id, { umbral_rir: '3' });
      a.actualiza('contribucion_muscular', s.contribucion.id, { coeficiente: '0.50' });
    });
    const version = await comoWeb(ana, (a) => a.lee('version_parametros')[0]);
    expect(version?.umbral_rir).toBe('3');
  });

  it('fijada por una sesión, no admite cambio de umbral ni de inicio', async () => {
    const s = await siembra(ana);
    await fijaVersion(ana, s);
    await expect(
      comoWeb(ana, (a) => a.actualiza('version_parametros', s.version.id, { umbral_rir: '3' })),
    ).rejects.toThrow(/su umbral no cambia/);
    await expect(
      comoWeb(ana, (a) =>
        a.actualiza('version_parametros', s.version.id, { vigente_desde: '2001-01-01' }),
      ),
    ).rejects.toThrow(ErrorDeInvariante);
  });

  it('fijada, sus coeficientes no se cambian, ni se añaden ni se quitan', async () => {
    const s = await siembra(ana);
    await fijaVersion(ana, s);
    await expect(
      comoWeb(ana, (a) =>
        a.actualiza('contribucion_muscular', s.contribucion.id, { coeficiente: '0.75' }),
      ),
    ).rejects.toThrow(/sus coeficientes no cambian/);
    await expect(
      comoWeb(ana, (a) =>
        a.inserta('contribucion_muscular', {
          id: randomUUID(),
          version_parametros_id: s.version.id,
          ejercicio_id: s.ejercicio.id,
          grupo_muscular_id: s.otroGrupo.id,
          coeficiente: '0.50',
        }),
      ),
    ).rejects.toThrow(/sus coeficientes no cambian/);
    await expect(
      comoWeb(ana, (a) => a.borra('contribucion_muscular', s.contribucion.id)),
    ).rejects.toThrow(ErrorDeInvariante);
  });

  it('fijada, no se le saca ni se le mete una fila reasignando el padre (defecto 7)', async () => {
    const s = await siembra(ana);
    await fijaVersion(ana, s);
    // Cerrar la fijada y crear la sucesora es el camino correcto…
    const sucesora = await comoWeb(ana, (a) => {
      a.actualiza('version_parametros', s.version.id, { vigente_hasta: '2026-09-27' });
      return a.inserta('version_parametros', {
        id: randomUUID(),
        umbral_rir: '4',
        vigente_desde: '2026-09-27',
        vigente_hasta: null,
      });
    });
    // …pero mover la contribución de la vieja a la nueva vacía la protegida.
    await expect(
      comoWeb(ana, (a) =>
        a.actualiza('contribucion_muscular', s.contribucion.id, {
          version_parametros_id: sucesora.id,
        }),
      ),
    ).rejects.toThrow(/sus coeficientes no cambian/);
    // Y al revés: meterle a la fijada una fila que era de la sucesora.
    const deLaSucesora = await comoWeb(ana, (a) =>
      a.inserta('contribucion_muscular', {
        id: randomUUID(),
        version_parametros_id: sucesora.id,
        ejercicio_id: s.ejercicio.id,
        grupo_muscular_id: s.otroGrupo.id,
        coeficiente: '0.50',
      }),
    );
    await expect(
      comoWeb(ana, (a) =>
        a.actualiza('contribucion_muscular', deLaSucesora.id, {
          version_parametros_id: s.version.id,
        }),
      ),
    ).rejects.toThrow(/sus coeficientes no cambian/);
  });

  it('el pin es inmutable y además cierto', async () => {
    const s = await siembra(ana);
    const sesion = await fijaVersion(ana, s);
    const otra = await comoWeb(ana, (a) => {
      a.actualiza('version_parametros', s.version.id, { vigente_hasta: '2026-09-27' });
      return a.inserta('version_parametros', {
        id: randomUUID(),
        umbral_rir: '3',
        vigente_desde: '2026-09-27',
        vigente_hasta: null,
      });
    });
    await expect(
      comoWeb(ana, (a) => a.actualiza('sesion', sesion.id, { version_parametros_id: otra.id })),
    ).rejects.toThrow(/no se puede cambiar version_parametros_id/);
    // Una sesión del 26 no puede fijar una versión que rige desde el 27.
    await expect(comoWeb(ana, (a) => nuevaSesion(a, otra.id, '2026-09-26'))).rejects.toThrow(
      /no regía el 2026-09-26/,
    );
    // Y cerrar la versión antes de una sesión que la fija la dejaría mintiendo.
    await expect(
      comoWeb(ana, (a) =>
        a.actualiza('version_parametros', s.version.id, { vigente_hasta: '2026-09-20' }),
      ),
    ).rejects.toThrow(ErrorDeInvariante);
  });

  it('dos versiones no rigen el mismo día', async () => {
    await expect(
      comoWeb(ana, (a) =>
        a.inserta('version_parametros', {
          id: randomUUID(),
          umbral_rir: '3',
          vigente_desde: '2026-09-27',
          vigente_hasta: null,
        }),
      ),
    ).rejects.toThrow(/se solapan/);
  });
});

describe('planes: publicado inmutable y asignaciones', () => {
  interface Plan {
    versionId: string;
    entradaId: string;
  }

  function creaVersion(
    a: AlmacenDeUsuario,
    s: Semilla,
    publicada: boolean,
    numero = 1,
    planId?: string,
  ): Plan {
    const plan = planId ?? a.inserta('plan', { id: randomUUID(), nombre: 'Torso' }).id;
    const version = a.inserta('plan_version', {
      id: randomUUID(),
      plan_id: plan,
      numero: String(numero),
      ciclo_dias: '7',
      copiada_de: null,
      publicada_en: null,
    });
    const entrada = a.inserta('plan_entrada', {
      id: randomUUID(),
      plan_version_id: version.id,
      dia: '1',
      ejercicio_id: s.ejercicio.id,
      grupo_muscular_id: null,
      objetivo: '4.00',
    });
    if (publicada) a.actualiza('plan_version', version.id, { publicada_en: a.ahora.toISOString() });
    return { versionId: version.id, entradaId: entrada.id };
  }

  it('una versión publicada no cambia, ni sus entradas, ni reasignando el padre', async () => {
    const s = await siembra(ana);
    const { publicada, borrador } = await comoWeb(ana, (a) => {
      const p = creaVersion(a, s, true);
      return { publicada: p, borrador: creaVersion(a, s, false) };
    });
    await expect(
      comoWeb(ana, (a) => a.actualiza('plan_entrada', publicada.entradaId, { objetivo: '6.00' })),
    ).rejects.toThrow(/sus entradas no cambian/);
    await expect(comoWeb(ana, (a) => a.borra('plan_entrada', publicada.entradaId))).rejects.toThrow(
      ErrorDeInvariante,
    );
    await expect(
      comoWeb(ana, (a) =>
        a.actualiza('plan_entrada', borrador.entradaId, {
          plan_version_id: publicada.versionId,
          dia: '2',
        }),
      ),
    ).rejects.toThrow(/sus entradas no cambian/);
    await expect(
      comoWeb(ana, (a) => a.actualiza('plan_version', publicada.versionId, { publicada_en: null })),
    ).rejects.toThrow(/está publicada/);
    await expect(
      comoWeb(ana, (a) => a.actualiza('plan_version', publicada.versionId, { ciclo_dias: '4' })),
    ).rejects.toThrow(/está publicada/);
  });

  it('no se publica una versión vacía ni se asigna un borrador', async () => {
    const s = await siembra(ana);
    await expect(
      comoWeb(ana, (a) => {
        const plan = a.inserta('plan', { id: randomUUID(), nombre: 'Vacío' });
        a.inserta('plan_version', {
          id: randomUUID(),
          plan_id: plan.id,
          numero: '1',
          ciclo_dias: '7',
          copiada_de: null,
          publicada_en: a.ahora.toISOString(),
        });
      }),
    ).rejects.toThrow(/publicada sin entradas/);
    await expect(
      comoWeb(ana, (a) => {
        const borrador = creaVersion(a, s, false);
        a.inserta('plan_asignacion', {
          id: randomUUID(),
          plan_version_id: borrador.versionId,
          vigente_desde: '2026-09-21',
          vigente_hasta: null,
        });
      }),
    ).rejects.toThrow(/asigna un borrador/);
  });

  it('un objetivo por destino y día: dos se sumarían', async () => {
    const s = await siembra(ana);
    await expect(
      comoWeb(ana, (a) => {
        const v = creaVersion(a, s, false);
        a.inserta('plan_entrada', {
          id: randomUUID(),
          plan_version_id: v.versionId,
          dia: '1',
          ejercicio_id: s.ejercicio.id,
          grupo_muscular_id: null,
          objetivo: '2.00',
        });
      }),
    ).rejects.toThrow(/plan_entrada \(versión, día, destino\)/);
    await expect(
      comoWeb(ana, (a) => {
        const v = creaVersion(a, s, false);
        a.inserta('plan_entrada', {
          id: randomUUID(),
          plan_version_id: v.versionId,
          dia: '9',
          ejercicio_id: null,
          grupo_muscular_id: s.grupo.id,
          objetivo: '2.00',
        });
      }),
    ).rejects.toThrow(/día 9 de un ciclo de 7/);
  });

  it('una asignación que cubre sesiones no se borra, no se re-apunta, no se mueve y sólo se cierra por arriba', async () => {
    const s = await siembra(ana);
    const { asignacionId, otraVersion } = await comoWeb(ana, (a) => {
      const v1 = creaVersion(a, s, true);
      const v2 = creaVersion(a, s, true, 1);
      const asignacion = a.inserta('plan_asignacion', {
        id: randomUUID(),
        plan_version_id: v1.versionId,
        vigente_desde: '2026-09-21',
        vigente_hasta: null,
      });
      return { asignacionId: asignacion.id, otraVersion: v2.versionId };
    });
    await fijaVersion(ana, s); // sesión del 26: la asignación ya cubre historia

    await expect(comoWeb(ana, (a) => a.borra('plan_asignacion', asignacionId))).rejects.toThrow(
      /ya cubre sesiones y no se borra/,
    );
    await expect(
      comoWeb(ana, (a) =>
        a.actualiza('plan_asignacion', asignacionId, { plan_version_id: otraVersion }),
      ),
    ).rejects.toThrow(/no se re-apunta/);
    await expect(
      comoWeb(ana, (a) =>
        a.actualiza('plan_asignacion', asignacionId, { vigente_desde: '2026-09-22' }),
      ),
    ).rejects.toThrow(/su ancla no se mueve/);
    await expect(
      comoWeb(ana, (a) =>
        a.actualiza('plan_asignacion', asignacionId, { vigente_hasta: '2026-09-25' }),
      ),
    ).rejects.toThrow(/dejaría fuera la sesión del 2026-09-26/);

    // Cerrar por arriba y asignar la siguiente desde mañana: el camino correcto.
    await comoWeb(ana, (a) => {
      a.actualiza('plan_asignacion', asignacionId, { vigente_hasta: '2026-09-27' });
      a.inserta('plan_asignacion', {
        id: randomUUID(),
        plan_version_id: otraVersion,
        vigente_desde: '2026-09-27',
        vigente_hasta: null,
      });
    });
    // Ya cerrada, no se reabre alargándola.
    await expect(
      comoWeb(ana, (a) =>
        a.actualiza('plan_asignacion', asignacionId, { vigente_hasta: '2026-10-01' }),
      ),
    ).rejects.toThrow(ErrorDeInvariante);
  });

  it('asignar hacia atrás sobre sesiones que ningún plan cubría es legítimo', async () => {
    const s = await siembra(ana);
    await fijaVersion(ana, s);
    await comoWeb(ana, (a) => {
      const v = creaVersion(a, s, true);
      a.inserta('plan_asignacion', {
        id: randomUUID(),
        plan_version_id: v.versionId,
        vigente_desde: '2026-09-01',
        vigente_hasta: null,
      });
    });
    expect(await comoWeb(ana, (a) => a.lee('plan_asignacion'))).toHaveLength(1);
  });

  it('una asignación sin sesiones se retira libremente', async () => {
    const s = await siembra(ana);
    const id = await comoWeb(ana, (a) => {
      const v = creaVersion(a, s, true);
      return a.inserta('plan_asignacion', {
        id: randomUUID(),
        plan_version_id: v.versionId,
        vigente_desde: '2026-10-01',
        vigente_hasta: null,
      }).id;
    });
    await comoWeb(ana, (a) => a.borra('plan_asignacion', id));
    expect(await comoWeb(ana, (a) => a.lee('plan_asignacion'))).toEqual([]);
  });
});

describe('sesiones y series', () => {
  it('la clave de idempotencia es única por propietario en sesión y en serie', async () => {
    const s = await siembra(ana);
    await comoWeb(ana, (a) => nuevaSesion(a, s.version.id, '2026-09-26', 'clave-sesion-1'));
    await expect(
      comoWeb(ana, (a) => nuevaSesion(a, s.version.id, '2026-09-26', 'clave-sesion-1')),
    ).rejects.toThrow(/sesion\.clave_idempotencia/);
    // En otro libro la misma clave no choca con nada.
    const b = await siembra(beto);
    await comoWeb(beto, (a) => nuevaSesion(a, b.version.id, '2026-09-26', 'clave-sesion-1'));

    await expect(
      comoWeb(ana, (a) => {
        const sesion = nuevaSesion(a, s.version.id);
        nuevaSerie(a, sesion.id, s.ejercicio.id, { clave: 'clave-serie-1', orden: 1 });
        nuevaSerie(a, sesion.id, s.ejercicio.id, { clave: 'clave-serie-1', orden: 2 });
      }),
    ).rejects.toThrow(/serie\.clave_idempotencia/);
    await expect(
      comoWeb(ana, (a) => {
        const sesion = nuevaSesion(a, s.version.id);
        nuevaSerie(a, sesion.id, s.ejercicio.id, { orden: 1 });
        nuevaSerie(a, sesion.id, s.ejercicio.id, { orden: 1 });
      }),
    ).rejects.toThrow(/serie \(sesión, orden\)/);
  });

  it('el calentamiento no lleva RIR y una serie de trabajo sí', async () => {
    const s = await siembra(ana);
    await expect(
      comoWeb(ana, (a) =>
        nuevaSerie(a, nuevaSesion(a, s.version.id).id, s.ejercicio.id, {
          calentamiento: true,
          rir: '2',
        }),
      ),
    ).rejects.toThrow(/calentamiento con RIR/);
    await expect(
      comoWeb(ana, (a) =>
        nuevaSerie(a, nuevaSesion(a, s.version.id).id, s.ejercicio.id, { rir: null }),
      ),
    ).rejects.toThrow(/serie de trabajo sin RIR/);
  });

  it('los rangos de dominio se aplican al escribir, no sólo en el cliente', async () => {
    const s = await siembra(ana);
    await expect(
      comoWeb(ana, (a) =>
        nuevaSerie(a, nuevaSesion(a, s.version.id).id, s.ejercicio.id, { rir: '22' }),
      ),
    ).rejects.toThrow(/entre 0 y 10/);
  });

  it('una serie registrada no se edita', async () => {
    const s = await siembra(ana);
    await fijaVersion(ana, s);
    const antes = (await comoWeb(ana, (a) =>
      Object.fromEntries(Object.keys(LIBRO).map((h) => [h, a.lee(h as keyof typeof LIBRO)])),
    )) as unknown as TablasDeLibro;
    const serie = antes.serie[0];
    if (serie === undefined) throw new Error('sin serie');
    const despues: TablasDeLibro = { ...antes, serie: [{ ...serie, carga_kg: '80.00' }] };
    expect(() => compruebaLibro(antes, despues, ana)).toThrow(/una serie registrada no se edita/);
  });
});

describe('alcances', () => {
  it('el atajo lee el plan pero no lo escribe (ADR-019), y no borra nada', async () => {
    const s = await siembra(ana);
    const sesion = await fijaVersion(ana, s);
    expect(await comoAtajo(ana, (a) => a.lee('plan'))).toEqual([]);
    expect(await comoAtajo(ana, (a) => a.lee('plan_asignacion'))).toEqual([]);
    await expect(
      comoAtajo(ana, (a) => a.inserta('plan', { id: randomUUID(), nombre: 'Colado' })),
    ).rejects.toBeInstanceOf(ErrorDeAlcance);
    for (const hoja of ['plan', 'plan_version', 'plan_entrada', 'plan_asignacion'] as const) {
      const permiso = ALCANCE_DE_HOJA[hoja]?.captura?.operaciones;
      expect(permiso, hoja).toEqual(['leer']);
    }
    await expect(comoAtajo(ana, (a) => a.borra('sesion', sesion.id))).rejects.toBeInstanceOf(
      ErrorDeAlcance,
    );
    await expect(
      comoAtajo(ana, (a) => a.inserta('grupo_muscular', { id: randomUUID(), nombre: 'Nuevo' })),
    ).rejects.toBeInstanceOf(ErrorDeAlcance);
    expect(await comoAtajo(ana, (a) => a.lee('ejercicio').map((e) => e.nombre))).toEqual([
      'Press banca',
    ]);
  });

  it('el atajo sólo ve lo escrito en los últimos treinta días', async () => {
    const s = await siembra(ana);
    await fijaVersion(ana, s);
    prueba.reloj.avanza(31 * 86_400_000);
    expect(await comoAtajo(ana, (a) => a.lee('sesion'))).toEqual([]);
    expect(await comoWeb(ana, (a) => a.lee('sesion'))).toHaveLength(1);
  });

  it('una hoja sin entrada en la tabla de alcances no la ve nadie (falla cerrado)', async () => {
    const guardada = ALCANCE_DE_HOJA.medicion_corporal;
    const tabla = ALCANCE_DE_HOJA as Record<string, unknown>;
    delete tabla['medicion_corporal'];
    try {
      await expect(comoWeb(ana, (a) => a.lee('medicion_corporal'))).rejects.toBeInstanceOf(
        ErrorDeAlcance,
      );
    } finally {
      tabla['medicion_corporal'] = guardada;
    }
  });

  it('el propietario y el instante de escritura los pone el almacén', async () => {
    await comoWeb(ana, (a) =>
      a.inserta('grupo_muscular', {
        id: randomUUID(),
        nombre: 'Dorsal',
        // @ts-expect-error: el tipo ni siquiera deja proponerlos
        propietario_id: beto,
        creado_en: '1999-01-01T00:00:00.000Z',
      }),
    );
    const grupo = await comoWeb(ana, (a) => a.lee('grupo_muscular')[0]);
    expect(grupo?.propietario_id).toBe(ana);
    expect(grupo?.creado_en).toBe('2026-09-26T18:00:00.000Z');
  });
});

describe('el archivo se edita a mano', () => {
  const rutaDe = (id: string) => join(prueba.directorio, `${id}.xlsx`);

  async function reescribe(id: string, cambia: (t: TablasDeLibro) => TablasDeLibro): Promise<void> {
    const tablas = tablasDesdeHojas(LIBRO, leeLibro(await readFile(rutaDe(id))));
    await writeFile(rutaDe(id), escribeLibro(hojasDesdeTablas(LIBRO, cambia(tablas))));
  }

  it('una edición a mano se recoge en la siguiente lectura', async () => {
    await siembra(ana);
    await reescribe(ana, (t) => ({
      ...t,
      grupo_muscular: t.grupo_muscular.map((g) => ({ ...g, nombre: `${g.nombre} (editado)` })),
    }));
    expect(await comoWeb(ana, (a) => a.lee('grupo_muscular').map((g) => g.nombre))).toEqual([
      'Pectoral (editado)',
      'Tríceps (editado)',
    ]);
  });

  it('no se escribe encima de una edición ajena hecha entre la carga y la escritura', async () => {
    await siembra(ana);
    await expect(
      comoWeb(ana, async (a) => {
        a.inserta('grupo_muscular', { id: randomUUID(), nombre: 'Dorsal' });
        await reescribe(ana, (t) => ({ ...t, grupo_muscular: [...t.grupo_muscular].reverse() }));
      }),
    ).rejects.toBeInstanceOf(ErrorDeConcurrencia);
    const nombres = await comoWeb(ana, (a) => a.lee('grupo_muscular').map((g) => g.nombre));
    expect(nombres).toEqual(['Tríceps', 'Pectoral']); // la edición ajena, intacta; lo nuestro, sin escribir
  });

  it('una celda inválida impide cargar y el error dice hoja, fila y columna', async () => {
    const s = await siembra(ana);
    await fijaVersion(ana, s);
    const bytes = await readFile(rutaDe(ana));
    const hojas = leeLibro(bytes).map((h) =>
      h.nombre !== 'serie'
        ? h
        : {
            ...h,
            filas: h.filas.map((f, i) =>
              i === 1 ? f.map((c, j) => (h.filas[0]?.[j] === 'rir' ? 'once' : c)) : f,
            ),
          },
    );
    await writeFile(rutaDe(ana), escribeLibro(hojas));
    await expect(comoWeb(ana, (a) => a.lee('serie'))).rejects.toThrow(
      /hoja «serie», fila 2, columna I \(rir\): se esperaba un número entero/,
    );
  });

  it('una columna desconocida detiene la carga; una columna opcional ausente, no', async () => {
    const hojas = leeLibro(await readFile(rutaDe(ana)));
    const conExtra = hojas.map((h) =>
      h.nombre === 'grupo_muscular' ? { ...h, filas: [[...(h.filas[0] ?? []), 'notas']] } : h,
    );
    await writeFile(rutaDe(ana), escribeLibro(conExtra));
    await expect(comoWeb(ana, (a) => a.lee('grupo_muscular'))).rejects.toThrow(
      /columna desconocida «notas»/,
    );

    const sinOpcional = hojas.map((h) =>
      h.nombre === 'ejercicio'
        ? { ...h, filas: [(h.filas[0] ?? []).filter((c) => c !== 'archivado_en')] }
        : h,
    );
    await writeFile(rutaDe(ana), escribeLibro(sinOpcional));
    expect(await comoWeb(ana, (a) => a.lee('ejercicio'))).toEqual([]);
  });

  it('una hoja desconocida también detiene la carga', async () => {
    const hojas = leeLibro(await readFile(rutaDe(ana)));
    await writeFile(rutaDe(ana), escribeLibro([...hojas, { nombre: 'mis_notas', filas: [['x']] }]));
    await expect(comoWeb(ana, (a) => a.lee('ejercicio'))).rejects.toBeInstanceOf(ErrorDeXlsx);
  });
});

describe('escritura', () => {
  it('veinte escrituras simultáneas sobre el mismo libro: ninguna se pierde', async () => {
    const s = await siembra(ana);
    const sesion = await comoWeb(ana, (a) => nuevaSesion(a, s.version.id));
    await Promise.all(
      Array.from({ length: 20 }, (_, i) =>
        comoWeb(ana, (a) => nuevaSerie(a, sesion.id, s.ejercicio.id, { orden: i + 1 })),
      ),
    );
    const series = await comoWeb(ana, (a) => a.lee('serie'));
    expect(series).toHaveLength(20);
    expect(await deposito.verifica()).toMatchObject({ series: 20 });
  });

  it('es atómica: no quedan temporales y el archivo es privado', async () => {
    await siembra(ana);
    const archivos = await readdir(prueba.directorio);
    expect(archivos.filter((n) => n.endsWith('.tmp'))).toEqual([]);
    expect((await stat(join(prueba.directorio, `${ana}.xlsx`))).mode & 0o077).toBe(0);
  });

  it('respalda antes de cada escritura y la poda conserva las últimas y la primera de cada día', async () => {
    await siembra(ana); // primera escritura del día 26 → primera copia
    for (let i = 0; i < 25; i += 1) {
      prueba.reloj.avanza(60_000);
      await comoWeb(ana, (a) =>
        a.inserta('grupo_muscular', { id: randomUUID(), nombre: `Grupo ${i}` }),
      );
    }
    prueba.reloj.fija('2026-09-27T10:00:00.000Z');
    await comoWeb(ana, (a) => a.inserta('grupo_muscular', { id: randomUUID(), nombre: 'Del 27' }));
    const copias = (await readdir(join(prueba.directorio, 'respaldos')))
      .filter((n) => n.startsWith(ana))
      .sort();
    expect(copias).toHaveLength(21); // últimas 20 + la primera del 26
    expect(copias[0]).toContain('2026-09-26T18-00');
    expect(copias.at(-1)).toContain('2026-09-27T10-00');
  });
});
