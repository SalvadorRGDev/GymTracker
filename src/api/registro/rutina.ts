import type { AlmacenDeUsuario } from '../../almacen/acceso.js';
import type { Fila } from '../../almacen/esquema.js';
import {
  agrega,
  type Centesimas,
  type Contribucion,
  centesimasDesdeDecimal,
  centesimasDesdeEntero,
  decimalDesdeCentesimas,
  dentroDe,
  diasEntre,
  type FechaLogica,
  fechaLogica,
  type Serie,
  volumenDe,
} from '../../domain/volume/index.js';
import { conflicto, invalido, noEncontrado } from '../errores.js';
import { hoyDe, parametrosDe, serieDelMotor, versionVigenteEn } from '../volumen.js';
import type { EntradaDelDia, RutinaDelDia, RutinaPublicada, VistaDeRutina } from './contrato.js';

/**
 * La rutina del día para «Registrar» (ADR-022). Sólo lee: qué rutina toca en la
 * fecha, qué día de su ciclo y cuánto se ha hecho de cada cosa. Aquí se juntan
 * filas; lo que cuenta como efectiva y cuánto suma a un grupo lo dice `agrega`.
 */

export interface ConsultaNormalizada {
  readonly sesion?: string;
  readonly version?: string;
  readonly dia?: number;
}

/** Una serie del día con su ejercicio al lado: el motor no lo lleva, la selección sí. */
interface SerieDelDia {
  readonly ejercicioId: string;
  readonly serie: Serie;
}

/** Un ejercicio que cuenta 0.50 o más para un grupo lo trabaja de verdad. */
const COEFICIENTE_MINIMO = centesimasDesdeDecimal('0.50');

function asignacionEn(
  asignaciones: readonly Fila<'plan_asignacion'>[],
  fecha: FechaLogica,
): Fila<'plan_asignacion'> | undefined {
  return asignaciones.find((a) =>
    dentroDe(
      fecha,
      fechaLogica(a.vigente_desde),
      a.vigente_hasta === null ? null : fechaLogica(a.vigente_hasta),
    ),
  );
}

export function rutinaDelDia(
  almacen: AlmacenDeUsuario,
  consulta: ConsultaNormalizada,
): RutinaDelDia {
  // La fecha la pone el entrenamiento abierto si ya existe: el de las 23:50 no
  // cambia de lista a medianoche. Si no, hoy en la zona de la cuenta.
  const abierta =
    consulta.sesion === undefined
      ? undefined
      : almacen.lee('sesion').find((s) => s.clave_idempotencia === consulta.sesion);
  const fecha = abierta === undefined ? hoyDe(almacen) : fechaLogica(abierta.fecha_logica);

  const planes = new Map(almacen.lee('plan').map((p) => [p.id, p]));
  const versiones = almacen.lee('plan_version');
  const asignacion = asignacionEn(almacen.lee('plan_asignacion'), fecha);
  const asignada =
    asignacion === undefined
      ? undefined
      : versiones.find((v) => v.id === asignacion.plan_version_id);
  const deHoy =
    asignacion === undefined || asignada === undefined
      ? null
      : {
          version_id: asignada.id,
          // El día del ciclo se cuenta desde el ancla, nunca desde el lunes.
          dia:
            (diasEntre(fechaLogica(asignacion.vigente_desde), fecha) %
              Number(asignada.ciclo_dias)) +
            1,
        };

  const elegida =
    consulta.version === undefined ? asignada : versiones.find((v) => v.id === consulta.version);
  if (consulta.version !== undefined && elegida === undefined) throw noEncontrado('esa rutina');
  if (elegida !== undefined && elegida.publicada_en === null) {
    throw conflicto('borrador', 'Esa versión es un borrador: publícala para registrar con ella.');
  }

  const resumen = (v: Fila<'plan_version'>): RutinaPublicada => ({
    version_id: v.id,
    plan_nombre: planes.get(v.plan_id)?.nombre ?? '',
    numero: Number(v.numero),
    ciclo_dias: Number(v.ciclo_dias),
    asignada: v.id === asignada?.id,
  });

  // Se ofrece la última publicada de cada rutina y, si son otras, la asignada y
  // la que se está viendo. La asignada va primero.
  const ultimas = [...planes.keys()].flatMap((planId) => {
    const publicadas = versiones
      .filter((v) => v.plan_id === planId && v.publicada_en !== null)
      .sort((a, b) => Number(b.numero) - Number(a.numero));
    return publicadas.slice(0, 1);
  });
  const ofrecidas = new Map(ultimas.map((v) => [v.id, v]));
  for (const v of [asignada, elegida]) if (v !== undefined) ofrecidas.set(v.id, v);
  const rutinas = [...ofrecidas.values()]
    .map(resumen)
    .sort(
      (a, b) =>
        Number(b.asignada) - Number(a.asignada) ||
        a.plan_nombre.localeCompare(b.plan_nombre, 'es') ||
        b.numero - a.numero,
    );

  return {
    fecha,
    de_entrenamiento_abierto: abierta !== undefined,
    rutinas,
    de_hoy: deHoy,
    vista:
      elegida === undefined
        ? null
        : vistaDe(almacen, elegida, resumen(elegida), deHoy, consulta, fecha),
  };
}

function vistaDe(
  almacen: AlmacenDeUsuario,
  version: Fila<'plan_version'>,
  rutina: RutinaPublicada,
  deHoy: RutinaDelDia['de_hoy'],
  consulta: ConsultaNormalizada,
  fecha: FechaLogica,
): VistaDeRutina {
  const ciclo = Number(version.ciclo_dias);
  const dia = consulta.dia ?? (deHoy?.version_id === version.id ? deHoy.dia : 1);
  if (!Number.isInteger(dia) || dia < 1 || dia > ciclo) {
    throw invalido('dia', `El día ${dia} no cabe en un ciclo de ${ciclo} días`);
  }

  const parametros = parametrosDe(almacen);
  const sesiones = new Map(
    almacen
      .lee('sesion')
      .filter((s) => s.fecha_logica === fecha)
      .map((s) => [s.id, s] as const),
  );
  const delDia: SerieDelDia[] = [];
  for (const fila of almacen.lee('serie')) {
    const sesion = sesiones.get(fila.sesion_id);
    if (sesion !== undefined) {
      delDia.push({
        ejercicioId: fila.ejercicio_id,
        serie: serieDelMotor(fila, sesion, parametros),
      });
    }
  }
  const series = (cuales: (s: SerieDelDia) => boolean) =>
    agrega({ series: delDia.filter(cuales).map((s) => s.serie), umbrales: parametros.umbrales });

  const ejercicios = new Map(almacen.lee('ejercicio').map((e) => [e.id, e]));
  const grupos = new Map(almacen.lee('grupo_muscular').map((g) => [g.id, g]));
  const filas = almacen
    .lee('plan_entrada')
    .filter((e) => e.plan_version_id === version.id && Number(e.dia) === dia);
  // Lo que ya tiene fila propia ese día no cuenta otra vez para un objetivo de grupo.
  const conFila = new Set(filas.flatMap((e) => (e.ejercicio_id === null ? [] : [e.ejercicio_id])));
  const vigente = versionVigenteEn(parametros.versiones, fecha);
  const contribuciones: ReadonlyMap<string, readonly Contribucion[]> =
    vigente === undefined ? new Map() : parametros.contribucionesDe(vigente.id);

  const entradas = filas.map((e): EntradaDelDia => {
    const objetivo = centesimasDesdeDecimal(e.objetivo);
    if (e.ejercicio_id !== null) {
      const ejercicio = ejercicios.get(e.ejercicio_id);
      if (ejercicio === undefined)
        throw new Error('Una entrada de rutina cita un ejercicio que no está');
      const idDelEjercicio = ejercicio.id;
      // Para lo registrado, las entradas que cuenta el motor son series: una fila, una serie.
      const hechas = centesimasDesdeEntero(
        series((s) => s.ejercicioId === idDelEjercicio).seriesEfectivas,
      );
      return {
        tipo: 'ejercicio',
        id: e.id,
        ejercicio: {
          id: ejercicio.id,
          nombre: ejercicio.nombre,
          archivado: ejercicio.archivado_en !== null,
        },
        ...cantidades(objetivo, hechas),
      };
    }
    const grupo = grupos.get(e.grupo_muscular_id ?? '');
    if (grupo === undefined) throw new Error('Una entrada de rutina cita un grupo que no está');
    const hechas = volumenDe(
      series((s) => !conFila.has(s.ejercicioId)),
      grupo.id,
    );
    const candidatos = [...contribuciones.entries()]
      .flatMap(([ejercicioId, lista]) => {
        const ejercicio = ejercicios.get(ejercicioId);
        const aporte = lista.find((c) => c.grupoId === grupo.id);
        // Lo que tiene fila propia ese día contaría en su fila, no aquí.
        return ejercicio === undefined ||
          ejercicio.archivado_en !== null ||
          conFila.has(ejercicio.id) ||
          aporte === undefined ||
          aporte.coeficiente < COEFICIENTE_MINIMO
          ? []
          : [{ ejercicio, coeficiente: aporte.coeficiente }];
      })
      .sort(
        (a, b) =>
          b.coeficiente - a.coeficiente ||
          a.ejercicio.nombre.localeCompare(b.ejercicio.nombre, 'es'),
      );
    return {
      tipo: 'grupo',
      id: e.id,
      grupo: { id: grupo.id, nombre: grupo.nombre },
      ...cantidades(objetivo, hechas),
      ejercicios: candidatos.map((c) => ({
        id: c.ejercicio.id,
        nombre: c.ejercicio.nombre,
        coeficiente: decimalDesdeCentesimas(c.coeficiente),
      })),
    };
  });

  return {
    version_id: rutina.version_id,
    plan_nombre: rutina.plan_nombre,
    numero: rutina.numero,
    ciclo_dias: ciclo,
    dia,
    es_la_de_hoy: deHoy !== null && deHoy.version_id === version.id && deHoy.dia === dia,
    entradas,
    completa: entradas.length > 0 && entradas.every((e) => e.completa),
  };
}

function cantidades(objetivo: Centesimas, hechas: Centesimas) {
  return {
    objetivo: decimalDesdeCentesimas(objetivo),
    hechas: decimalDesdeCentesimas(hechas),
    completa: hechas >= objetivo,
  };
}
