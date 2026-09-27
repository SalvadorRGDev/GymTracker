import { dentroDe, type FechaLogica } from '../domain/volume/index.js';
import type { Fila, TablasDeCuentas, TablasDeLibro } from './esquema.js';

/**
 * Los invariantes del almacén, en UN solo sitio (ADR-010).
 *
 * PostgreSQL no guardaba datos: aplicaba invariantes. Con libros de Excel hay
 * que reponerlos, y la regla es la misma que tenía el esquema: se comprueban
 * sobre el conjunto ENTERO, con el antes y el después delante, antes de
 * confirmar cada transacción. No hay guardias repartidos por los puntos de
 * escritura: un invariante que depende de que cada servicio se acuerde de
 * llamarlo ya no es un invariante.
 *
 * Los rechazos de dominio («ese ejercicio no existe», «esa versión ya está
 * publicada») los decide el servicio con una consulta ANTES de escribir. Que
 * salte algo de aquí significa que servidor y almacén no dicen lo mismo, y sale
 * como 500.
 *
 * Al cargar un libro editado a mano se llama con antes = después: valen las
 * reglas estáticas y las de transición no tienen nada que comparar.
 */

export class ErrorDeInvariante extends Error {
  override name = 'ErrorDeInvariante';
  constructor(readonly violaciones: readonly string[]) {
    super(`Invariante violado:\n- ${violaciones.slice(0, 20).join('\n- ')}`);
  }
}

export function normalizaNombre(nombre: string): string {
  return nombre.trim().toLowerCase();
}

type ConId = { readonly id: string };

function porId<T extends ConId>(filas: readonly T[]): Map<string, T> {
  return new Map(filas.map((f) => [f.id, f]));
}

class Violaciones {
  readonly lista: string[] = [];
  agrega(texto: string): void {
    this.lista.push(texto);
  }
  unicos<T>(filas: readonly T[], clave: (f: T) => string, que: string): void {
    const vistos = new Set<string>();
    for (const f of filas) {
      const k = clave(f);
      if (vistos.has(k)) this.agrega(`${que}: «${k}» repetido`);
      vistos.add(k);
    }
  }
  existe(mapa: ReadonlyMap<string, unknown>, id: string | null, que: string): void {
    if (id !== null && !mapa.has(id)) this.agrega(`${que}: apunta a ${id}, que no existe`);
  }
  lanzaSiHay(): void {
    if (this.lista.length > 0) throw new ErrorDeInvariante(this.lista);
  }
}

function fecha(texto: string): FechaLogica {
  return texto as FechaLogica;
}

function cubre(desde: string, hasta: string | null, dia: string): boolean {
  return dentroDe(fecha(dia), fecha(desde), hasta === null ? null : fecha(hasta));
}

function sinSolapes<T extends ConId & { vigente_desde: string; vigente_hasta: string | null }>(
  filas: readonly T[],
  que: string,
  v: Violaciones,
): void {
  const ordenadas = [...filas].sort((a, b) => (a.vigente_desde < b.vigente_desde ? -1 : 1));
  for (let i = 0; i + 1 < ordenadas.length; i += 1) {
    const a = ordenadas[i];
    const b = ordenadas[i + 1];
    if (a === undefined || b === undefined) continue;
    if (a.vigente_hasta === null || a.vigente_hasta > b.vigente_desde) {
      v.agrega(`${que}: ${a.id} y ${b.id} se solapan`);
    }
  }
  for (const f of filas) {
    if (f.vigente_hasta !== null && f.vigente_hasta <= f.vigente_desde) {
      v.agrega(`${que} ${f.id}: termina antes de empezar`);
    }
  }
}

/** Las filas de una hoja cuyo padre es `padreId`, como conjunto comparable. */
function firmaDeHijos<T>(filas: readonly T[], esHijo: (f: T) => boolean): string {
  return filas
    .filter(esHijo)
    .map((f) => JSON.stringify(Object.entries(f as Record<string, unknown>).sort()))
    .sort()
    .join('\n');
}

function igualSalvo<T extends Record<string, unknown>>(
  a: T,
  b: T,
  mutables: readonly (keyof T)[],
): (keyof T)[] {
  return (Object.keys(a) as (keyof T)[]).filter((k) => !mutables.includes(k) && a[k] !== b[k]);
}

// ── Libro de un propietario ─────────────────────────────────────────────────

function estaticas(d: TablasDeLibro, propietarioId: string, v: Violaciones): void {
  for (const [hoja, filas] of Object.entries(d) as [
    string,
    readonly (ConId & { propietario_id: string })[],
  ][]) {
    v.unicos(filas, (f) => f.id, `${hoja}.id`);
    for (const f of filas) {
      // Aunque el libro sea de uno solo: el día que se abra el archivo equivocado,
      // esta comparación es la diferencia entre cero filas y las de otra persona.
      if (f.propietario_id !== propietarioId)
        v.agrega(`${hoja} ${f.id}: pertenece a otro propietario`);
    }
  }

  const grupos = porId(d.grupo_muscular);
  const ejercicios = porId(d.ejercicio);
  const versiones = porId(d.version_parametros);
  const planes = porId(d.plan);
  const versionesDePlan = porId(d.plan_version);
  const sesiones = porId(d.sesion);

  v.unicos(d.grupo_muscular, (g) => normalizaNombre(g.nombre), 'grupo_muscular.nombre');
  v.unicos(d.ejercicio, (e) => normalizaNombre(e.nombre), 'ejercicio.nombre');

  if (d.version_parametros.length === 0) v.agrega('version_parametros: el libro no tiene ninguna');
  sinSolapes(d.version_parametros, 'version_parametros', v);

  for (const cm of d.contribucion_muscular) {
    const que = `contribucion_muscular ${cm.id}`;
    v.existe(versiones, cm.version_parametros_id, que);
    v.existe(ejercicios, cm.ejercicio_id, que);
    v.existe(grupos, cm.grupo_muscular_id, que);
  }
  // Dos filas iguales se SUMARÍAN al leer: la unicidad es parte del invariante.
  v.unicos(
    d.contribucion_muscular,
    (cm) => `${cm.version_parametros_id}|${cm.ejercicio_id}|${cm.grupo_muscular_id}`,
    'contribucion_muscular (versión, ejercicio, grupo)',
  );

  const entradasPorVersion = new Map<string, number>();
  for (const e of d.plan_entrada) {
    entradasPorVersion.set(e.plan_version_id, (entradasPorVersion.get(e.plan_version_id) ?? 0) + 1);
  }
  for (const pv of d.plan_version) {
    const que = `plan_version ${pv.id}`;
    v.existe(planes, pv.plan_id, que);
    v.existe(versionesDePlan, pv.copiada_de, que);
    if (pv.publicada_en !== null && (entradasPorVersion.get(pv.id) ?? 0) === 0) {
      v.agrega(`${que}: publicada sin entradas`);
    }
  }
  v.unicos(d.plan_version, (pv) => `${pv.plan_id}|${pv.numero}`, 'plan_version (plan, número)');

  for (const e of d.plan_entrada) {
    const que = `plan_entrada ${e.id}`;
    const version = versionesDePlan.get(e.plan_version_id);
    if (version === undefined) v.agrega(`${que}: apunta a una versión que no existe`);
    else if (Number(e.dia) > Number(version.ciclo_dias)) {
      v.agrega(`${que}: pide el día ${e.dia} de un ciclo de ${version.ciclo_dias}`);
    }
    if ((e.ejercicio_id === null) === (e.grupo_muscular_id === null)) {
      v.agrega(`${que}: debe apuntar a un ejercicio o a un grupo, y sólo a uno`);
    }
    v.existe(ejercicios, e.ejercicio_id, que);
    v.existe(grupos, e.grupo_muscular_id, que);
  }
  // Objetivo único: dos objetivos para el mismo destino y día se sumarían.
  v.unicos(
    d.plan_entrada,
    (e) => `${e.plan_version_id}|${e.dia}|${e.ejercicio_id ?? `g:${e.grupo_muscular_id}`}`,
    'plan_entrada (versión, día, destino)',
  );

  for (const a of d.plan_asignacion) {
    const version = versionesDePlan.get(a.plan_version_id);
    if (version === undefined)
      v.agrega(`plan_asignacion ${a.id}: apunta a una versión que no existe`);
    else if (version.publicada_en === null) {
      v.agrega(`plan_asignacion ${a.id}: asigna un borrador`);
    }
  }
  // No hay dos planes vigentes el mismo día: ¿contra cuál se compararía?
  sinSolapes(d.plan_asignacion, 'plan_asignacion', v);

  for (const s of d.sesion) {
    const version = versiones.get(s.version_parametros_id);
    if (version === undefined) {
      v.agrega(`sesion ${s.id}: fija una versión de parámetros que no existe`);
    } else if (!cubre(version.vigente_desde, version.vigente_hasta, s.fecha_logica)) {
      // El pin no sólo es inmutable: tiene que ser CIERTO (defecto 9).
      v.agrega(`sesion ${s.id}: fija una versión que no regía el ${s.fecha_logica}`);
    }
  }
  v.unicos(d.sesion, (s) => s.clave_idempotencia, 'sesion.clave_idempotencia');

  for (const s of d.serie) {
    const que = `serie ${s.id}`;
    v.existe(sesiones, s.sesion_id, que);
    v.existe(ejercicios, s.ejercicio_id, que);
    if (s.es_calentamiento === 'true' && s.rir !== null) v.agrega(`${que}: calentamiento con RIR`);
    if (s.es_calentamiento === 'false' && s.rir === null)
      v.agrega(`${que}: serie de trabajo sin RIR`);
  }
  v.unicos(d.serie, (s) => s.clave_idempotencia, 'serie.clave_idempotencia');
  v.unicos(d.serie, (s) => `${s.sesion_id}|${s.orden}`, 'serie (sesión, orden)');

  v.unicos(d.medicion_corporal, (m) => m.fecha_logica, 'medicion_corporal.fecha_logica');
}

function deTransicion(a: TablasDeLibro, d: TablasDeLibro, v: Violaciones): void {
  const sesionesDespues = porId(d.sesion);
  for (const s of a.sesion) {
    const nueva = sesionesDespues.get(s.id);
    if (nueva === undefined) continue;
    const cambiadas = igualSalvo(s, nueva, ['finalizada_en', 'fecha_por_confirmar']);
    if (cambiadas.length > 0)
      v.agrega(`sesion ${s.id}: no se puede cambiar ${cambiadas.join(', ')}`);
  }

  const seriesDespues = porId(d.serie);
  for (const s of a.serie) {
    const nueva = seriesDespues.get(s.id);
    if (nueva !== undefined && igualSalvo(s, nueva, []).length > 0) {
      v.agrega(`serie ${s.id}: una serie registrada no se edita`);
    }
  }

  // Parámetros congelados: con una sesión que la fija, la versión no admite
  // cambios de umbral, de cota inferior ni de coeficientes, y tampoco que se le
  // saque o se le meta una fila reasignando su padre (defectos 4 y 7).
  const fijadas = new Set([...a.sesion, ...d.sesion].map((s) => s.version_parametros_id));
  const versionesDespues = porId(d.version_parametros);
  for (const version of a.version_parametros) {
    if (!fijadas.has(version.id)) continue;
    const nueva = versionesDespues.get(version.id);
    const que = `version_parametros ${version.id}`;
    if (nueva === undefined) {
      v.agrega(`${que}: está fijada por una sesión y no se borra`);
      continue;
    }
    if (nueva.umbral_rir !== version.umbral_rir)
      v.agrega(`${que}: está fijada; su umbral no cambia`);
    if (nueva.vigente_desde !== version.vigente_desde) {
      v.agrega(`${que}: está fijada; su inicio no se mueve`);
    }
    const esDeLaVersion = (cm: Fila<'contribucion_muscular'>) =>
      cm.version_parametros_id === version.id;
    if (
      firmaDeHijos(a.contribucion_muscular, esDeLaVersion) !==
      firmaDeHijos(d.contribucion_muscular, esDeLaVersion)
    ) {
      v.agrega(`${que}: está fijada; sus coeficientes no cambian (se crea una sucesora)`);
    }
  }

  // Una versión de plan publicada es inmutable, y sus entradas también.
  const versionesDePlanDespues = porId(d.plan_version);
  for (const pv of a.plan_version) {
    if (pv.publicada_en === null) continue;
    const nueva = versionesDePlanDespues.get(pv.id);
    const que = `plan_version ${pv.id}`;
    if (nueva === undefined) {
      v.agrega(`${que}: está publicada y no se borra`);
      continue;
    }
    const cambiadas = igualSalvo(pv, nueva, []);
    if (cambiadas.length > 0) v.agrega(`${que}: está publicada; no cambia ${cambiadas.join(', ')}`);
    const esDeLaVersion = (e: Fila<'plan_entrada'>) => e.plan_version_id === pv.id;
    if (
      firmaDeHijos(a.plan_entrada, esDeLaVersion) !== firmaDeHijos(d.plan_entrada, esDeLaVersion)
    ) {
      v.agrega(`${que}: está publicada; sus entradas no cambian`);
    }
  }

  // Una asignación que ya cubre sesiones es el último eslabón reescribible del
  // histórico (defecto 10): no se re-apunta, no se le mueve el ancla, no se
  // borra y sólo se cierra por arriba, sin dejar fuera ninguna sesión que cubría.
  const asignacionesDespues = porId(d.plan_asignacion);
  for (const asignacion of a.plan_asignacion) {
    const cubiertas = a.sesion.filter((s) =>
      cubre(asignacion.vigente_desde, asignacion.vigente_hasta, s.fecha_logica),
    );
    if (cubiertas.length === 0) continue;
    const que = `plan_asignacion ${asignacion.id}`;
    const nueva = asignacionesDespues.get(asignacion.id);
    if (nueva === undefined) {
      v.agrega(`${que}: ya cubre sesiones y no se borra`);
      continue;
    }
    if (nueva.plan_version_id !== asignacion.plan_version_id) {
      v.agrega(`${que}: ya cubre sesiones y no se re-apunta`);
    }
    if (nueva.vigente_desde !== asignacion.vigente_desde) {
      v.agrega(`${que}: ya cubre sesiones; su ancla no se mueve`);
    }
    const alarga =
      asignacion.vigente_hasta !== null &&
      (nueva.vigente_hasta === null || nueva.vigente_hasta > asignacion.vigente_hasta);
    if (alarga) v.agrega(`${que}: ya cubre sesiones; sólo se cierra por arriba`);
    for (const s of cubiertas) {
      if (
        sesionesDespues.has(s.id) &&
        !cubre(nueva.vigente_desde, nueva.vigente_hasta, s.fecha_logica)
      ) {
        v.agrega(`${que}: dejaría fuera la sesión del ${s.fecha_logica}`);
        break;
      }
    }
  }
}

export function compruebaLibro(
  antes: TablasDeLibro,
  despues: TablasDeLibro,
  propietarioId: string,
): void {
  const v = new Violaciones();
  estaticas(despues, propietarioId, v);
  if (antes !== despues) deTransicion(antes, despues, v);
  v.lanzaSiHay();
}

// ── Cuentas ─────────────────────────────────────────────────────────────────

export function compruebaCuentas(antes: TablasDeCuentas, despues: TablasDeCuentas): void {
  const v = new Violaciones();
  const usuarios = porId(despues.usuario);
  v.unicos(despues.usuario, (u) => u.id, 'usuario.id');
  v.unicos(despues.usuario, (u) => u.correo, 'usuario.correo');
  for (const hoja of ['token_sesion', 'token_captura'] as const) {
    const filas: readonly {
      readonly id: string;
      readonly usuario_id: string;
      readonly huella: string;
      readonly emitido_en: string;
      readonly expira_en: string;
    }[] = despues[hoja];
    v.unicos(filas, (t) => t.id, `${hoja}.id`);
    v.unicos(filas, (t) => t.huella, `${hoja}.huella`);
    for (const t of filas) {
      v.existe(usuarios, t.usuario_id, `${hoja} ${t.id}`);
      if (t.expira_en <= t.emitido_en) v.agrega(`${hoja} ${t.id}: caduca antes de emitirse`);
    }
  }
  if (antes !== despues) {
    const previos = porId(antes.usuario);
    for (const u of despues.usuario) {
      const previo = previos.get(u.id);
      if (previo !== undefined && previo.creado_en !== u.creado_en) {
        v.agrega(`usuario ${u.id}: la fecha de alta no cambia`);
      }
    }
  }
  v.lanzaSiHay();
}
