import { ErrorDeMotor } from './agrega.js';
import { type Centesimas, centesimasDesdeEntero } from './centesimas.js';
import { dentroDe, diasEntre, type FechaLogica, sumaDias } from './fecha-logica.js';
import type { Contribucion, Serie } from './tipos.js';

/**
 * El plan no se compara contra el agregado: se EXPANDE a la misma forma de
 * entrada que lo ejecutado y pasa por la misma `agrega` (ADR-006). Los dos lados
 * del signo menos de la comparativa salen del mismo código.
 */

export type DestinoDeEntrada =
  | { readonly tipo: 'ejercicio'; readonly ejercicioId: string }
  | { readonly tipo: 'grupo'; readonly grupoId: string };

export interface EntradaDePlan {
  /** Día del ciclo, desde 1. */
  readonly dia: number;
  readonly destino: DestinoDeEntrada;
  /** Series efectivas pedidas. Puede ser fraccionario (4.50). */
  readonly objetivo: Centesimas;
}

export interface VersionDePlan {
  readonly id: string;
  /** 1 a 28 días. No tiene por qué ser una semana. */
  readonly cicloDias: number;
  readonly entradas: readonly EntradaDePlan[];
}

export interface AsignacionDePlan {
  readonly id: string;
  readonly versionPlanId: string;
  /** Inicio de la vigencia y ANCLA: el día 1 del ciclo. */
  readonly desde: FechaLogica;
  /** Exclusiva; nula mientras sigue vigente. */
  readonly hasta: FechaLogica | null;
}

export interface ParametrosDeExpansion {
  readonly versionParametrosId: string;
  /** Contribuciones por ejercicio en esa versión de parámetros. */
  readonly contribuciones: ReadonlyMap<string, readonly Contribucion[]>;
}

export interface PeticionDeExpansion {
  readonly asignaciones: readonly AsignacionDePlan[];
  readonly versiones: ReadonlyMap<string, VersionDePlan>;
  /** Inclusiva. */
  readonly desde: FechaLogica;
  /** Exclusiva. */
  readonly hasta: FechaLogica;
  readonly parametros: ParametrosDeExpansion;
}

/** Un objetivo por grupo recorre el mismo camino que uno por ejercicio: coeficiente 1.00. */
const COEFICIENTE_DE_GRUPO = centesimasDesdeEntero(1);

function claveDeDestino(destino: DestinoDeEntrada): string {
  return destino.tipo === 'ejercicio' ? `e:${destino.ejercicioId}` : `g:${destino.grupoId}`;
}

function compruebaVersion(version: VersionDePlan): void {
  if (!Number.isInteger(version.cicloDias) || version.cicloDias < 1 || version.cicloDias > 28) {
    throw new ErrorDeMotor(
      `Ciclo fuera de rango en la versión ${version.id}: ${version.cicloDias}`,
    );
  }
  const vistas = new Set<string>();
  for (const entrada of version.entradas) {
    if (!Number.isInteger(entrada.dia) || entrada.dia < 1 || entrada.dia > version.cicloDias) {
      throw new ErrorDeMotor(
        `La versión ${version.id} pide el día ${entrada.dia} de un ciclo de ${version.cicloDias}`,
      );
    }
    if (!Number.isSafeInteger(entrada.objetivo) || entrada.objetivo <= 0) {
      throw new ErrorDeMotor(`Objetivo no positivo en la versión ${version.id}`);
    }
    // Dos objetivos para el mismo destino y día se SUMARÍAN: el lado planeado se
    // duplicaría sin que nada fallara (defecto 8 de docs/02-modelo-datos.md).
    const clave = `${entrada.dia}|${claveDeDestino(entrada.destino)}`;
    if (vistas.has(clave)) {
      throw new ErrorDeMotor(`Objetivo duplicado en la versión ${version.id}, día ${entrada.dia}`);
    }
    vistas.add(clave);
  }
}

function compruebaAsignaciones(asignaciones: readonly AsignacionDePlan[]): void {
  for (const a of asignaciones) {
    if (a.hasta !== null && a.hasta <= a.desde) {
      throw new ErrorDeMotor(`La asignación ${a.id} termina antes de empezar`);
    }
  }
  for (let i = 0; i < asignaciones.length; i += 1) {
    for (let j = i + 1; j < asignaciones.length; j += 1) {
      const a = asignaciones[i];
      const b = asignaciones[j];
      if (a === undefined || b === undefined) continue;
      const aAntesDeB = a.hasta !== null && a.hasta <= b.desde;
      const bAntesDeA = b.hasta !== null && b.hasta <= a.desde;
      if (!aAntesDeB && !bAntesDeA) {
        // Dos planes vigentes el mismo día: ¿contra cuál se compara? El motor
        // no elige; el almacén no debió guardarlo.
        throw new ErrorDeMotor(`Las asignaciones ${a.id} y ${b.id} se solapan`);
      }
    }
  }
}

/**
 * Convierte asignaciones y entradas en `Serie[]`, un día tras otro.
 *
 * - El día del ciclo se cuenta desde el ANCLA de la asignación, nunca desde el
 *   lunes ni desde el principio de la ventana.
 * - Cada entrada es una serie de trabajo con `rir: 0` (el plan declara series
 *   efectivas y cero cuenta con cualquier umbral) y `veces` igual al objetivo.
 * - Se niega a suponer: solapes, días fuera del ciclo u objetivos duplicados
 *   son excepciones, no datos que ignorar.
 */
export function expandePlan(peticion: PeticionDeExpansion): Serie[] {
  const { asignaciones, versiones, desde, hasta, parametros } = peticion;
  if (hasta <= desde) throw new ErrorDeMotor('La ventana de expansión está vacía');
  compruebaAsignaciones(asignaciones);

  const vigentes = asignaciones.filter(
    (a) => (a.hasta === null || a.hasta > desde) && a.desde < hasta,
  );
  for (const a of vigentes) {
    const version = versiones.get(a.versionPlanId);
    if (version === undefined) {
      throw new ErrorDeMotor(`La asignación ${a.id} cita una versión que no llegó`);
    }
    compruebaVersion(version);
  }

  const series: Serie[] = [];
  const dias = diasEntre(desde, hasta);
  for (let d = 0; d < dias; d += 1) {
    const fecha = sumaDias(desde, d);
    const asignacion = vigentes.find((a) => dentroDe(fecha, a.desde, a.hasta));
    if (asignacion === undefined) continue;
    const version = versiones.get(asignacion.versionPlanId);
    if (version === undefined) continue; // ya comprobado arriba
    const diaDeCiclo = (diasEntre(asignacion.desde, fecha) % version.cicloDias) + 1;
    for (const entrada of version.entradas) {
      if (entrada.dia !== diaDeCiclo) continue;
      const contribuciones =
        entrada.destino.tipo === 'grupo'
          ? [{ grupoId: entrada.destino.grupoId, coeficiente: COEFICIENTE_DE_GRUPO }]
          : (parametros.contribuciones.get(entrada.destino.ejercicioId) ?? []);
      series.push({
        tipo: 'trabajo',
        rir: 0,
        fechaLogica: fecha,
        versionParametrosId: parametros.versionParametrosId,
        contribuciones,
        veces: entrada.objetivo,
      });
    }
  }
  return series;
}
