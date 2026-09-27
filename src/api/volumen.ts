import type { AlmacenDeUsuario } from '../almacen/acceso.js';
import type { Fila } from '../almacen/esquema.js';
import {
  type Contribucion,
  centesimasDesdeDecimal,
  dentroDe,
  type FechaLogica,
  fechaLogica,
  type Serie,
  UNA_SERIE,
} from '../domain/volume/index.js';
import { fechaLogicaEn } from './zona.js';

/**
 * Construye la entrada del motor desde el almacén. Aquí se JUNTAN filas —cada
 * serie con el pin de su sesión y los coeficientes de esa versión—; no se suma
 * nada. Sumar es cosa de `agrega`, y sólo de `agrega`.
 */

export interface Parametros {
  readonly versiones: readonly Fila<'version_parametros'>[];
  /** Umbral de RIR por versión, para el motor. */
  readonly umbrales: ReadonlyMap<string, number>;
  /** Contribuciones de una versión, por ejercicio. */
  contribucionesDe(versionId: string): ReadonlyMap<string, readonly Contribucion[]>;
}

export function parametrosDe(almacen: AlmacenDeUsuario): Parametros {
  const versiones = [...almacen.lee('version_parametros')].sort((a, b) =>
    a.vigente_desde < b.vigente_desde ? -1 : 1,
  );
  const umbrales = new Map(versiones.map((v) => [v.id, Number(v.umbral_rir)]));
  const porVersion = new Map<string, Map<string, Contribucion[]>>();
  for (const cm of almacen.lee('contribucion_muscular')) {
    let porEjercicio = porVersion.get(cm.version_parametros_id);
    if (porEjercicio === undefined) {
      porEjercicio = new Map();
      porVersion.set(cm.version_parametros_id, porEjercicio);
    }
    const lista = porEjercicio.get(cm.ejercicio_id) ?? [];
    lista.push({
      grupoId: cm.grupo_muscular_id,
      coeficiente: centesimasDesdeDecimal(cm.coeficiente),
    });
    porEjercicio.set(cm.ejercicio_id, lista);
  }
  const vacio = new Map<string, readonly Contribucion[]>();
  return {
    versiones,
    umbrales,
    contribucionesDe: (versionId) => porVersion.get(versionId) ?? vacio,
  };
}

/** La versión que regía en una fecha lógica: la que fija una sesión de ese día. */
export function versionVigenteEn(
  versiones: readonly Fila<'version_parametros'>[],
  fecha: FechaLogica,
): Fila<'version_parametros'> | undefined {
  return versiones.find((v) =>
    dentroDe(
      fecha,
      fechaLogica(v.vigente_desde),
      v.vigente_hasta === null ? null : fechaLogica(v.vigente_hasta),
    ),
  );
}

/** La versión abierta: la que se edita. Puede empezar mañana si se creó hoy como sucesora. */
export function versionAbierta(
  versiones: readonly Fila<'version_parametros'>[],
): Fila<'version_parametros'> | undefined {
  return versiones.find((v) => v.vigente_hasta === null);
}

/** «Hoy» es la fecha lógica del usuario, desde su zona: la sabe el servidor, no el navegador. */
export function hoyDe(almacen: AlmacenDeUsuario): FechaLogica {
  return fechaLogicaEn(almacen.ahora, almacen.zonaHoraria);
}

export interface Ejecucion {
  readonly series: Serie[];
  readonly sesiones: readonly Fila<'sesion'>[];
}

/** Las series registradas en [desde, hasta), cada una con su pin y sus coeficientes. */
export function seriesEjecutadas(
  almacen: AlmacenDeUsuario,
  parametros: Parametros,
  desde: FechaLogica,
  hasta: FechaLogica,
): Ejecucion {
  const sesiones = almacen
    .lee('sesion')
    .filter((s) => s.fecha_logica >= desde && s.fecha_logica < hasta);
  const porId = new Map(sesiones.map((s) => [s.id, s]));
  const series: Serie[] = [];
  for (const fila of almacen.lee('serie')) {
    const sesion = porId.get(fila.sesion_id);
    if (sesion !== undefined) series.push(serieDelMotor(fila, sesion, parametros));
  }
  return { series, sesiones };
}

/**
 * Una fila de `serie` en la forma del motor: la fecha lógica y el pin son los
 * de su SESIÓN, y los coeficientes los de esa versión. Vale `UNA_SERIE`.
 */
export function serieDelMotor(
  fila: Fila<'serie'>,
  sesion: Fila<'sesion'>,
  parametros: Parametros,
): Serie {
  const comun = {
    fechaLogica: fechaLogica(sesion.fecha_logica),
    versionParametrosId: sesion.version_parametros_id,
    contribuciones:
      parametros.contribucionesDe(sesion.version_parametros_id).get(fila.ejercicio_id) ?? [],
    veces: UNA_SERIE,
  };
  return fila.es_calentamiento === 'true'
    ? { tipo: 'calentamiento', ...comun }
    : { tipo: 'trabajo', rir: Number(fila.rir), ...comun };
}
