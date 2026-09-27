import { randomUUID } from 'node:crypto';
import type { AlmacenDeUsuario } from '../../almacen/acceso.js';
import type { Fila } from '../../almacen/esquema.js';
import { normalizaNombre } from '../../almacen/invariantes.js';
import { referenciaPara } from '../../catalogo/index.js';
import {
  type Agregado,
  type AsignacionDePlan,
  agrega,
  agregaPorSemana,
  type Centesimas,
  centesimasDesdeDecimal,
  DISPARADOR_DE_VIGILANCIA,
  decimalDesdeCentesimas,
  dentroDe,
  diasEntre,
  esFechaLogica,
  expandePlan,
  type FechaLogica,
  fechaLogica,
  lunesDe,
  MINIMO_DE_VIGILANCIA,
  resta,
  type Serie,
  sumaDias,
  type VentanaDeComparacion,
  type VersionDePlan,
  ventanasDeComparacion,
  vigilaUmbral,
  volumenDe,
} from '../../domain/volume/index.js';
import { conflicto, invalido, noEncontrado } from '../errores.js';
import {
  hoyDe,
  type Parametros,
  parametrosDe,
  seriesEjecutadas,
  versionAbierta,
  versionVigenteEn,
} from '../volumen.js';
import type {
  CantidadDeGrupo,
  Comparativa,
  CuerpoEntradas,
  CuerpoNuevaAsignacion,
  CuerpoNuevaVersion,
  CuerpoNuevoPlan,
  EstadoDeComparacion,
  Planes,
  Proyeccion,
  VentanaComparada,
  VersionCompleta,
  VolumenDeVersion,
} from './contrato.js';

/**
 * Planes (fase 2). El plan no se compara contra el agregado: se EXPANDE con
 * `expandePlan` a la misma forma de entrada que lo registrado y pasa por el
 * mismo `agrega` (ADR-006). Aquí no se suma nada a mano.
 */

const MAXIMO_DE_DIAS = 370;

function cubre(a: Fila<'plan_asignacion'>, fecha: string): boolean {
  return dentroDe(
    fecha as FechaLogica,
    a.vigente_desde as FechaLogica,
    a.vigente_hasta === null ? null : (a.vigente_hasta as FechaLogica),
  );
}

function versionDe(almacen: AlmacenDeUsuario, id: string): Fila<'plan_version'> {
  const version = almacen.lee('plan_version').find((v) => v.id === id);
  if (version === undefined) throw noEncontrado('esa versión de plan');
  return version;
}

function versionDelMotor(almacen: AlmacenDeUsuario, pv: Fila<'plan_version'>): VersionDePlan {
  return {
    id: pv.id,
    cicloDias: Number(pv.ciclo_dias),
    entradas: almacen
      .lee('plan_entrada')
      .filter((e) => e.plan_version_id === pv.id)
      .map((e) => ({
        dia: Number(e.dia),
        destino:
          e.ejercicio_id !== null
            ? { tipo: 'ejercicio' as const, ejercicioId: e.ejercicio_id }
            : { tipo: 'grupo' as const, grupoId: e.grupo_muscular_id ?? '' },
        objetivo: centesimasDesdeDecimal(e.objetivo),
      })),
  };
}

function resumen(almacen: AlmacenDeUsuario, pv: Fila<'plan_version'>) {
  return {
    id: pv.id,
    numero: Number(pv.numero),
    ciclo_dias: Number(pv.ciclo_dias),
    copiada_de: pv.copiada_de,
    publicada_en: pv.publicada_en,
    entradas: almacen.lee('plan_entrada').filter((e) => e.plan_version_id === pv.id).length,
  };
}

export function lista(almacen: AlmacenDeUsuario): Planes {
  const sesiones = almacen.lee('sesion');
  const versiones = almacen.lee('plan_version');
  return {
    hoy: hoyDe(almacen),
    planes: [...almacen.lee('plan')]
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .map((p) => ({
        id: p.id,
        nombre: p.nombre,
        versiones: versiones
          .filter((v) => v.plan_id === p.id)
          .sort((a, b) => Number(a.numero) - Number(b.numero))
          .map((v) => resumen(almacen, v)),
      })),
    asignaciones: [...almacen.lee('plan_asignacion')]
      .sort((a, b) => a.vigente_desde.localeCompare(b.vigente_desde))
      .map((a) => ({
        id: a.id,
        plan_id: versiones.find((v) => v.id === a.plan_version_id)?.plan_id ?? '',
        plan_version_id: a.plan_version_id,
        vigente_desde: a.vigente_desde,
        vigente_hasta: a.vigente_hasta,
        cubre_sesiones: sesiones.some((s) => cubre(a, s.fecha_logica)),
      })),
  };
}

export function version(almacen: AlmacenDeUsuario, id: string): VersionCompleta {
  const pv = versionDe(almacen, id);
  const plan = almacen.lee('plan').find((p) => p.id === pv.plan_id);
  return {
    ...resumen(almacen, pv),
    plan_id: pv.plan_id,
    plan_nombre: plan?.nombre ?? '',
    lista_de_entradas: almacen
      .lee('plan_entrada')
      .filter((e) => e.plan_version_id === pv.id)
      .sort((a, b) => Number(a.dia) - Number(b.dia))
      .map((e) => ({
        id: e.id,
        dia: Number(e.dia),
        ejercicio_id: e.ejercicio_id,
        grupo_id: e.grupo_muscular_id,
        objetivo: e.objetivo,
      })),
  };
}

// ── Proyección: lo que el plan PIDE ─────────────────────────────────────────

export function proyeccion(
  almacen: AlmacenDeUsuario,
  ventana: { desdeSemana: number; semanas: number } | { desde: string; hasta: string },
): Proyeccion {
  const hoy = hoyDe(almacen);
  let desde: FechaLogica;
  let semanas: number;
  if ('desde' in ventana) {
    if (
      !esFechaLogica(ventana.desde) ||
      !esFechaLogica(ventana.hasta) ||
      ventana.hasta <= ventana.desde
    ) {
      throw invalido('ventana', 'La ventana debe ser AAAA-MM-DD a AAAA-MM-DD, en ese orden');
    }
    desde = ventana.desde;
    const dias = diasEntre(ventana.desde, ventana.hasta);
    if (dias > MAXIMO_DE_DIAS)
      throw invalido('ventana', `La ventana no puede pasar de ${MAXIMO_DE_DIAS} días`);
    semanas = Math.ceil(dias / 7);
  } else {
    if (ventana.semanas < 1 || ventana.semanas > 52)
      throw invalido('ventana', 'Entre 1 y 52 semanas');
    desde = sumaDias(lunesDe(hoy), 7 * ventana.desdeSemana);
    semanas = ventana.semanas;
  }
  const hasta = sumaDias(desde, 7 * semanas);

  const parametros = parametrosDe(almacen);
  // La versión de parámetros del primer día de la ventana: la proyección es
  // una sola lectura, con un solo juego de coeficientes, y lo declara.
  const vigente =
    versionVigenteEn(parametros.versiones, desde) ?? versionAbierta(parametros.versiones);
  if (vigente === undefined) throw new Error('El libro no tiene parámetros');

  const asignaciones: AsignacionDePlan[] = almacen.lee('plan_asignacion').map((a) => ({
    id: a.id,
    versionPlanId: a.plan_version_id,
    desde: fechaLogica(a.vigente_desde),
    hasta: a.vigente_hasta === null ? null : fechaLogica(a.vigente_hasta),
  }));
  const versiones = new Map(
    almacen.lee('plan_version').map((pv) => [pv.id, versionDelMotor(almacen, pv)] as const),
  );
  const series = expandePlan({
    asignaciones,
    versiones,
    desde,
    hasta,
    parametros: {
      versionParametrosId: vigente.id,
      contribuciones: parametros.contribucionesDe(vigente.id),
    },
  });
  const porSemana = agregaPorSemana({ series, umbrales: parametros.umbrales }, { desde, semanas });
  const grupos = almacen.lee('grupo_muscular');
  const filasDeAsignacion = almacen.lee('plan_asignacion');

  return {
    hoy,
    parametros: {
      version_id: vigente.id,
      umbral_rir: Number(vigente.umbral_rir),
      vigente_desde: vigente.vigente_desde,
    },
    semanas: porSemana.map((semana) => {
      const conPlan = Array.from({ length: 7 }, (_, i) => sumaDias(semana.desde, i)).some((dia) =>
        filasDeAsignacion.some((a) => cubre(a, dia)),
      );
      return {
        desde: semana.desde,
        hasta: sumaDias(semana.desde, 6),
        sin_plan: !conPlan,
        grupos: grupos.map((g) => ({
          id: g.id,
          nombre: g.nombre,
          series: decimalDesdeCentesimas(volumenDe(semana, g.id)),
        })),
        entradas_sin_mapeo: semana.seriesSinMapeo,
      };
    }),
  };
}

/** Media semanal redondeada a la mitad par: sólo presentación, y declarada como media. */
function media(total: Centesimas, semanas: number): string {
  const cociente = Math.trunc(total / semanas);
  const resto = total - cociente * semanas;
  const doble = 2 * resto;
  const sube = doble > semanas || (doble === semanas && cociente % 2 !== 0);
  return decimalDesdeCentesimas((cociente + (sube ? 1 : 0)) as Centesimas);
}

/**
 * Simulación: el volumen de una versión SIN asignarla, con la versión de
 * parámetros abierta. Se expande un ciclo sobre el mínimo común múltiplo del
 * ciclo y la semana, y el veredicto de referencia se decide sobre ese total.
 */
export function volumenDeVersion(almacen: AlmacenDeUsuario, id: string): VolumenDeVersion {
  const pv = versionDe(almacen, id);
  const ciclo = Number(pv.ciclo_dias);
  const mcd = (a: number, b: number): number => (b === 0 ? a : mcd(b, a % b));
  const dias = (ciclo * 7) / mcd(ciclo, 7);
  const semanas = dias / 7;
  const parametros = parametrosDe(almacen);
  const abierta = versionAbierta(parametros.versiones);
  if (abierta === undefined) throw new Error('El libro no tiene parámetros');
  const ancla = lunesDe(hoyDe(almacen));
  const series = expandePlan({
    asignaciones: [{ id: 'simulacion', versionPlanId: pv.id, desde: ancla, hasta: null }],
    versiones: new Map([[pv.id, versionDelMotor(almacen, pv)]]),
    desde: ancla,
    hasta: sumaDias(ancla, dias),
    parametros: {
      versionParametrosId: abierta.id,
      contribuciones: parametros.contribucionesDe(abierta.id),
    },
  });
  const agregado = agrega({ series, umbrales: parametros.umbrales });
  return {
    version_id: pv.id,
    ciclo_dias: ciclo,
    semanas_de_la_ventana: semanas,
    entradas_sin_mapeo: agregado.seriesSinMapeo,
    grupos: almacen.lee('grupo_muscular').map((g) => {
      const total = volumenDe(agregado, g.id);
      return {
        id: g.id,
        nombre: g.nombre,
        series_por_semana: media(total, semanas),
        total: decimalDesdeCentesimas(total),
        referencia: referenciaPara(g.nombre, total, semanas),
      };
    }),
  };
}

// ── Comparativa: lo ejecutado menos lo planeado (fase 3) ────────────────────

/** Doce semanas, hoy incluido: el periodo de la vigilancia del umbral. */
const DIAS_DE_VIGILANCIA = 84;

function conSigno(c: Centesimas): string {
  return c > 0 ? `+${decimalDesdeCentesimas(c)}` : decimalDesdeCentesimas(c);
}

function estadoDe(delta: Centesimas, enCurso: boolean): EstadoDeComparacion {
  if (delta > 0) return 'superavit';
  if (delta === 0) return 'en-plan';
  // Lo que falta de una semana que no ha terminado todavía no es déficit.
  return enCurso ? 'pendiente' : 'deficit';
}

/** Un decimal, redondeado a la mitad par, con aritmética entera. */
function porcentaje(parte: number, total: number): string | null {
  if (total === 0) return null;
  const cociente = Math.trunc((parte * 1000) / total);
  const doble = 2 * (parte * 1000 - cociente * total);
  const decimas = cociente + (doble > total || (doble === total && cociente % 2 !== 0) ? 1 : 0);
  return `${Math.trunc(decimas / 10)}.${decimas % 10}`;
}

/**
 * Los tramos de [desde, hasta) en los que rige una sola versión de parámetros.
 * El lado planeado se expande con la versión de CADA día, que es la que fija
 * una sesión de ese día: los dos lados de la resta leen con las mismas reglas.
 */
function tramosDeParametros(parametros: Parametros, desde: FechaLogica, hasta: FechaLogica) {
  const tramos: { desde: FechaLogica; hasta: FechaLogica; versionId: string }[] = [];
  for (let dia = desde; dia < hasta; dia = sumaDias(dia, 1)) {
    const vigente =
      versionVigenteEn(parametros.versiones, dia) ?? versionAbierta(parametros.versiones);
    if (vigente === undefined) throw new Error('El libro no tiene parámetros');
    const ultimo = tramos.at(-1);
    if (ultimo !== undefined && ultimo.versionId === vigente.id) ultimo.hasta = sumaDias(dia, 1);
    else tramos.push({ desde: dia, hasta: sumaDias(dia, 1), versionId: vigente.id });
  }
  return tramos;
}

/**
 * Compara cada ventana contra el plan vigente ENTONCES: el de su asignación, no
 * el de hoy. Los dos lados pasan por el mismo `agrega`; aquí sólo se juntan
 * filas y se restan agregados con `resta`.
 */
function comparaVentanas(
  almacen: AlmacenDeUsuario,
  parametros: Parametros,
  umbrales: ReadonlyMap<string, number>,
  cuantas: number,
): VentanaComparada[] {
  const hoy = hoyDe(almacen);
  const manana = sumaDias(hoy, 1);
  const asignaciones: AsignacionDePlan[] = almacen.lee('plan_asignacion').map((a) => ({
    id: a.id,
    versionPlanId: a.plan_version_id,
    desde: fechaLogica(a.vigente_desde),
    hasta: a.vigente_hasta === null ? null : fechaLogica(a.vigente_hasta),
  }));
  const filasDeVersion = almacen.lee('plan_version');
  const versiones = new Map(
    filasDeVersion.map((pv) => [pv.id, versionDelMotor(almacen, pv)] as const),
  );
  const planes = almacen.lee('plan');
  const grupos = [...almacen.lee('grupo_muscular')].sort((a, b) =>
    a.nombre.localeCompare(b.nombre, 'es'),
  );
  const nombreDe = new Map(grupos.map((g) => [g.id, g.nombre]));
  const versionDeParametros = new Map(parametros.versiones.map((v) => [v.id, v]));
  const cantidades = (agregado: Agregado): CantidadDeGrupo[] =>
    grupos
      .filter((g) => volumenDe(agregado, g.id) > 0)
      .map((g) => ({
        id: g.id,
        nombre: g.nombre,
        series: decimalDesdeCentesimas(volumenDe(agregado, g.id)),
      }));

  return ventanasDeComparacion(asignaciones, hoy, cuantas).map(
    (ventana: VentanaDeComparacion): VentanaComparada => {
      const asignacion = asignaciones.find((a) => a.id === ventana.asignacionId);
      const version = versiones.get(ventana.versionPlanId);
      const fila = filasDeVersion.find((v) => v.id === ventana.versionPlanId);
      if (asignacion === undefined || version === undefined || fila === undefined) {
        throw new Error('La ventana cita una asignación o una versión que no está');
      }
      const planeadas: Serie[] = tramosDeParametros(
        parametros,
        ventana.desde,
        ventana.hasta,
      ).flatMap((tramo) =>
        expandePlan({
          asignaciones: [asignacion],
          versiones,
          desde: tramo.desde,
          hasta: tramo.hasta,
          parametros: {
            versionParametrosId: tramo.versionId,
            contribuciones: parametros.contribucionesDe(tramo.versionId),
          },
        }),
      );
      const { series: ejecutadas } = seriesEjecutadas(
        almacen,
        parametros,
        ventana.desde,
        ventana.hasta,
      );
      const planeado = agrega({ series: planeadas, umbrales });
      const ejecutado = agrega({ series: ejecutadas, umbrales });
      const enCurso = ventana.hasta > manana;
      const dias = diasEntre(ventana.desde, ventana.hasta);
      const citadas = [
        ...new Set([...planeado.versionesDeParametros, ...ejecutado.versionesDeParametros]),
      ]
        .flatMap((id) => {
          const v = versionDeParametros.get(id);
          return v === undefined ? [] : [v];
        })
        .sort((a, b) => a.vigente_desde.localeCompare(b.vigente_desde))
        .map((v) => ({
          id: v.id,
          vigente_desde: v.vigente_desde,
          umbral_rir: Number(v.umbral_rir),
        }));

      return {
        desde: ventana.desde,
        hasta: sumaDias(ventana.hasta, -1),
        dias,
        numero: ventana.numero,
        en_curso: enCurso,
        plan: {
          asignacion_id: asignacion.id,
          version_id: fila.id,
          nombre: planes.find((p) => p.id === fila.plan_id)?.nombre ?? '',
          numero_de_version: Number(fila.numero),
          ciclo_dias: version.cicloDias,
          ancla: asignacion.desde,
        },
        versiones_de_parametros: citadas,
        entradas_sin_mapeo: planeado.seriesSinMapeo,
        series_sin_mapeo: ejecutado.seriesSinMapeo,
        grupos: resta(
          ejecutado,
          planeado,
          grupos.map((g) => g.id),
        )
          .filter((d) => d.planeado > 0 || d.ejecutado > 0)
          .map((d) => ({
            id: d.grupoId,
            nombre: nombreDe.get(d.grupoId) ?? '',
            planeado: decimalDesdeCentesimas(d.planeado),
            ejecutado: decimalDesdeCentesimas(d.ejecutado),
            delta: conSigno(d.delta),
            estado: estadoDe(d.delta, enCurso),
          })),
        detalle: Array.from({ length: dias }, (_, i) => {
          const fecha = sumaDias(ventana.desde, i);
          const delDia = (s: Serie) => s.fechaLogica === fecha;
          return {
            fecha,
            dia_del_ciclo: (diasEntre(asignacion.desde, fecha) % version.cicloDias) + 1,
            futuro: fecha > hoy,
            planeado: cantidades(agrega({ series: planeadas.filter(delDia), umbrales })),
            ejecutado: cantidades(agrega({ series: ejecutadas.filter(delDia), umbrales })),
          };
        }),
      };
    },
  );
}

/**
 * Real contra planeado por semana del ciclo. Con `umbral`, SIMULACIÓN: el mismo
 * cálculo con otro umbral para todas las versiones, rotulado y sin escribir
 * nada. Adoptarlo es cambiar los parámetros, que rige desde mañana (ADR-013).
 */
export function comparativa(
  almacen: AlmacenDeUsuario,
  opciones: { readonly ventanas: number; readonly umbral: number | null },
): Comparativa {
  if (opciones.ventanas < 1 || opciones.ventanas > 52) {
    throw invalido('ventana', 'Entre 1 y 52 ventanas');
  }
  const hoy = hoyDe(almacen);
  const parametros = parametrosDe(almacen);
  const { umbral } = opciones;
  const umbrales =
    umbral === null
      ? parametros.umbrales
      : new Map([...parametros.umbrales.keys()].map((id) => [id, umbral] as const));

  // La vigilancia mira los umbrales de verdad, nunca los simulados.
  const desde = sumaDias(hoy, -(DIAS_DE_VIGILANCIA - 1));
  const { series: recientes } = seriesEjecutadas(almacen, parametros, desde, sumaDias(hoy, 1));
  const vigilancia = vigilaUmbral({ series: recientes, umbrales: parametros.umbrales });
  const enJuego = new Set<number>();
  for (const s of recientes) {
    const u = parametros.umbrales.get(s.versionParametrosId);
    if (s.tipo === 'trabajo' && u !== undefined) enJuego.add(u);
  }

  return {
    hoy,
    simulacion: umbral === null ? null : { umbral_rir: umbral },
    ventanas: comparaVentanas(almacen, parametros, umbrales, opciones.ventanas),
    vigilancia: {
      desde,
      hasta: hoy,
      efectivas: vigilancia.efectivas,
      en_la_franja: vigilancia.enLaFranja,
      porcentaje: porcentaje(vigilancia.enLaFranja, vigilancia.efectivas),
      disparador: DISPARADOR_DE_VIGILANCIA,
      minimo: MINIMO_DE_VIGILANCIA,
      pide_sensibilidad: vigilancia.pideSensibilidad,
      umbrales: [...enJuego].sort((a, b) => a - b),
    },
  };
}

/**
 * La línea semanal del atajo (ADR-019): la ventana en curso en una frase,
 * «Pectoral 6.00 de 8.00», calculada aquí y no en el teléfono. Sólo lee.
 */
export function lineaSemanal(almacen: AlmacenDeUsuario): {
  readonly mensaje: string;
  readonly ventana: { readonly desde: string; readonly hasta: string } | null;
} {
  const parametros = parametrosDe(almacen);
  const hoy = hoyDe(almacen);
  const actual = comparaVentanas(almacen, parametros, parametros.umbrales, 1).find(
    (v) => v.desde <= hoy && hoy <= v.hasta,
  );
  if (actual === undefined) {
    return { mensaje: 'No hay plan asignado hoy: la línea compara contra un plan.', ventana: null };
  }
  // Una notificación se corta: primero lo que el plan pide en mayor cantidad.
  const ordenados = [...actual.grupos].sort(
    (a, b) =>
      centesimasDesdeDecimal(b.planeado) - centesimasDesdeDecimal(a.planeado) ||
      a.nombre.localeCompare(b.nombre, 'es'),
  );
  const cifras =
    ordenados.length === 0
      ? 'el plan no pide nada esta semana.'
      : ordenados.map((g) => `${g.nombre} ${g.ejecutado} de ${g.planeado}`).join(' · ');
  return {
    mensaje: `Semana ${actual.numero} de «${actual.plan.nombre}» (hasta el ${actual.hasta}): ${cifras}`,
    ventana: { desde: actual.desde, hasta: actual.hasta },
  };
}

// ── Autoría ─────────────────────────────────────────────────────────────────

export function creaPlan(almacen: AlmacenDeUsuario, cuerpo: CuerpoNuevoPlan): VersionCompleta {
  const nombre = cuerpo.nombre.trim();
  if (almacen.lee('plan').some((p) => normalizaNombre(p.nombre) === normalizaNombre(nombre))) {
    throw conflicto('duplicado', `Ya tienes un plan llamado «${nombre}»`);
  }
  const plan = almacen.inserta('plan', { id: randomUUID(), nombre });
  const pv = almacen.inserta('plan_version', {
    id: randomUUID(),
    plan_id: plan.id,
    numero: '1',
    ciclo_dias: String(cuerpo.ciclo_dias),
    copiada_de: null,
    publicada_en: null,
  });
  return version(almacen, pv.id);
}

/** Editar un plan publicado es crear su sucesora (copiándolo) y retocarla. */
export function creaVersion(
  almacen: AlmacenDeUsuario,
  planId: string,
  cuerpo: CuerpoNuevaVersion,
): VersionCompleta {
  if (!almacen.lee('plan').some((p) => p.id === planId)) throw noEncontrado('ese plan');
  const hermanas = almacen.lee('plan_version').filter((v) => v.plan_id === planId);
  const numero = Math.max(0, ...hermanas.map((v) => Number(v.numero))) + 1;
  const origen = cuerpo.copiar_de === undefined ? null : versionDe(almacen, cuerpo.copiar_de);
  const ultima = [...hermanas].sort((a, b) => Number(b.numero) - Number(a.numero))[0];
  const ciclo = cuerpo.ciclo_dias ?? Number(origen?.ciclo_dias ?? ultima?.ciclo_dias ?? 7);
  const pv = almacen.inserta('plan_version', {
    id: randomUUID(),
    plan_id: planId,
    numero: String(numero),
    ciclo_dias: String(ciclo),
    copiada_de: origen?.id ?? null,
    publicada_en: null,
  });
  if (origen !== null) {
    for (const e of almacen.lee('plan_entrada').filter((x) => x.plan_version_id === origen.id)) {
      if (Number(e.dia) > ciclo) {
        throw invalido(
          'ciclo',
          `La versión copiada tiene entradas el día ${e.dia} y el ciclo nuevo es de ${ciclo}`,
        );
      }
      almacen.inserta('plan_entrada', {
        id: randomUUID(),
        plan_version_id: pv.id,
        dia: e.dia,
        ejercicio_id: e.ejercicio_id,
        grupo_muscular_id: e.grupo_muscular_id,
        objetivo: e.objetivo,
      });
    }
  }
  return version(almacen, pv.id);
}

/** Reemplaza las entradas de un BORRADOR. Una versión publicada no se toca. */
export function guardaEntradas(
  almacen: AlmacenDeUsuario,
  id: string,
  cuerpo: CuerpoEntradas,
): VersionCompleta {
  const pv = versionDe(almacen, id);
  if (pv.publicada_en !== null) {
    throw conflicto(
      'publicada',
      'Esta versión ya está publicada y no cambia. Crea una versión nueva copiándola.',
    );
  }
  const ciclo = cuerpo.ciclo_dias ?? Number(pv.ciclo_dias);
  const ejercicios = new Map(almacen.lee('ejercicio').map((e) => [e.id, e]));
  const grupos = new Set(almacen.lee('grupo_muscular').map((g) => g.id));
  const vistas = new Set<string>();
  for (const e of cuerpo.entradas) {
    if ((e.ejercicio_id === undefined) === (e.grupo_id === undefined)) {
      throw invalido('destino', 'Cada entrada apunta a un ejercicio o a un grupo, y sólo a uno');
    }
    if (e.dia > ciclo)
      throw invalido('ciclo', `El día ${e.dia} no cabe en un ciclo de ${ciclo} días`);
    if (e.ejercicio_id !== undefined) {
      const ejercicio = ejercicios.get(e.ejercicio_id);
      if (ejercicio === undefined)
        throw invalido('referencia', 'Una entrada cita un ejercicio que no existe');
      if (ejercicio.archivado_en !== null) {
        throw invalido('archivado', `«${ejercicio.nombre}» está archivado`);
      }
    }
    if (e.grupo_id !== undefined && !grupos.has(e.grupo_id)) {
      throw invalido('referencia', 'Una entrada cita un grupo que no existe');
    }
    const objetivo = centesimasDesdeDecimal(e.objetivo);
    if (objetivo <= 0 || objetivo > 10_000)
      throw invalido('objetivo', 'El objetivo va de más de 0 a 100 series');
    const clave = `${e.dia}|${e.ejercicio_id ?? `g:${e.grupo_id}`}`;
    if (vistas.has(clave)) {
      throw invalido(
        'duplicado',
        `El día ${e.dia} pide dos veces lo mismo: se sumaría. Deja un solo objetivo.`,
      );
    }
    vistas.add(clave);
  }

  if (String(ciclo) !== pv.ciclo_dias)
    almacen.actualiza('plan_version', pv.id, { ciclo_dias: String(ciclo) });
  for (const e of almacen.lee('plan_entrada').filter((x) => x.plan_version_id === pv.id)) {
    almacen.borra('plan_entrada', e.id);
  }
  for (const e of cuerpo.entradas) {
    almacen.inserta('plan_entrada', {
      id: randomUUID(),
      plan_version_id: pv.id,
      dia: String(e.dia),
      ejercicio_id: e.ejercicio_id ?? null,
      grupo_muscular_id: e.grupo_id ?? null,
      objetivo: e.objetivo,
    });
  }
  return version(almacen, pv.id);
}

export function publica(almacen: AlmacenDeUsuario, id: string): VersionCompleta {
  const pv = versionDe(almacen, id);
  if (pv.publicada_en !== null) throw conflicto('publicada', 'Esta versión ya estaba publicada');
  if (!almacen.lee('plan_entrada').some((e) => e.plan_version_id === pv.id)) {
    throw conflicto('vacia', 'Una versión sin entradas no se publica');
  }
  almacen.actualiza('plan_version', pv.id, { publicada_en: almacen.ahora.toISOString() });
  return version(almacen, pv.id);
}

/**
 * Asigna una versión publicada desde una fecha, que es su ANCLA (día 1 del
 * ciclo), y cierra por arriba la vigente. No se ofrece re-apuntar ni mover el
 * inicio de una asignación: renumeraría el histórico.
 */
export function asigna(almacen: AlmacenDeUsuario, cuerpo: CuerpoNuevaAsignacion) {
  const pv = versionDe(almacen, cuerpo.version_id);
  if (pv.publicada_en === null) throw conflicto('borrador', 'Sólo se asigna una versión publicada');
  if (!esFechaLogica(cuerpo.desde))
    throw invalido('ventana', `«${cuerpo.desde}» no es una fecha válida`);
  const desde = cuerpo.desde;
  const asignaciones = almacen.lee('plan_asignacion');
  const abierta = asignaciones.find((a) => a.vigente_hasta === null);

  if (abierta !== undefined) {
    if (desde <= abierta.vigente_desde) {
      throw conflicto(
        'solape',
        `El plan vigente empieza el ${abierta.vigente_desde}. Asigna el nuevo desde una fecha posterior.`,
      );
    }
    const quedaria = almacen
      .lee('sesion')
      .filter((s) => s.fecha_logica >= desde && cubre(abierta, s.fecha_logica))
      .map((s) => s.fecha_logica)
      .sort()
      .at(-1);
    if (quedaria !== undefined) {
      throw conflicto(
        'cubre-sesiones',
        `Ya hay sesiones registradas el ${quedaria} con el plan vigente. Asigna el nuevo desde ${sumaDias(fechaLogica(quedaria), 1)} o después.`,
      );
    }
  }
  const solapada = asignaciones.find(
    (a) => a.id !== abierta?.id && (a.vigente_hasta === null || a.vigente_hasta > desde),
  );
  if (solapada !== undefined) {
    throw conflicto('solape', `Choca con la asignación que empieza el ${solapada.vigente_desde}.`);
  }
  if (abierta !== undefined)
    almacen.actualiza('plan_asignacion', abierta.id, { vigente_hasta: desde });
  const nueva = almacen.inserta('plan_asignacion', {
    id: randomUUID(),
    plan_version_id: pv.id,
    vigente_desde: desde,
    vigente_hasta: null,
  });
  return { id: nueva.id, vigente_desde: nueva.vigente_desde };
}

export function retiraAsignacion(almacen: AlmacenDeUsuario, id: string): void {
  const asignacion = almacen.lee('plan_asignacion').find((a) => a.id === id);
  if (asignacion === undefined) throw noEncontrado('esa asignación');
  if (almacen.lee('sesion').some((s) => cubre(asignacion, s.fecha_logica))) {
    throw conflicto(
      'cubre-sesiones',
      'Esta asignación ya cubre sesiones registradas: retirarla reescribiría con qué plan se comparan. Asigna otra desde una fecha posterior.',
    );
  }
  almacen.borra('plan_asignacion', id);
}
