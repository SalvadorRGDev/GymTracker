import { randomUUID } from 'node:crypto';
import type { AlmacenDeUsuario } from '../../almacen/acceso.js';
import { type Fila, HOJAS_DE_LIBRO } from '../../almacen/esquema.js';
import { normalizaNombre } from '../../almacen/invariantes.js';
import {
  CATALOGO_BASE,
  ejercicioBasePorNombre,
  ejerciciosDePerfil,
  grupoBasePorNombre,
  referenciaPara,
  zonaPara,
} from '../../catalogo/index.js';
import {
  type Area,
  agrega,
  areaDe,
  type Centesimas,
  cargaMedia,
  centesimasDesdeDecimal,
  decimalDesdeCentesimas,
  lunesDe,
  progreso,
  type SerieConCarga,
  sumaDias,
  volumenDe,
} from '../../domain/volume/index.js';
import { conflicto, invalido, noEncontrado } from '../errores.js';
import { ESCALA, nivelDeVolumen } from '../escala.js';
import {
  hoyDe,
  parametrosDe,
  serieDelMotor,
  seriesEjecutadas,
  versionAbierta,
} from '../volumen.js';
import type {
  Catalogo,
  CatalogoBaseConPerfiles,
  CuerpoImportacion,
  CuerpoPropuestaDeParametros,
  Dashboard,
  Exportacion,
  Historial,
  ResultadoDeImportacion,
  ResultadoDeParametros,
} from './contrato.js';

/** Orden de la taxonomía (de arriba abajo en el cuerpo); lo que no es de la semilla, después, por nombre. */
function ordenDeGrupos(a: Fila<'grupo_muscular'>, b: Fila<'grupo_muscular'>): number {
  const posicion = (g: Fila<'grupo_muscular'>) => {
    const base = grupoBasePorNombre(g.nombre);
    return base === null ? Number.MAX_SAFE_INTEGER : CATALOGO_BASE.grupos.indexOf(base);
  };
  return posicion(a) - posicion(b) || a.nombre.localeCompare(b.nombre, 'es');
}

// ── Resumen ─────────────────────────────────────────────────────────────────

export function dashboard(almacen: AlmacenDeUsuario): Dashboard {
  const hoy = hoyDe(almacen);
  const lunes = lunesDe(hoy);
  const parametros = parametrosDe(almacen);
  const { series, sesiones } = seriesEjecutadas(almacen, parametros, lunes, sumaDias(lunes, 7));
  // EL cálculo: el mismo `agrega` que la proyección y que la comparativa.
  const agregado = agrega({ series, umbrales: parametros.umbrales });

  const grupos = [...almacen.lee('grupo_muscular')].sort(ordenDeGrupos).map((g) => {
    const volumen = volumenDe(agregado, g.id);
    return {
      id: g.id,
      nombre: g.nombre,
      series_efectivas: decimalDesdeCentesimas(volumen),
      nivel: nivelDeVolumen(volumen),
      zona: zonaPara(g.nombre),
      referencia: referenciaPara(g.nombre, volumen, 1),
    };
  });

  const recibidas = almacen.lee('serie').map((s) => s.registrado_en);
  const ultima = recibidas.length === 0 ? null : recibidas.reduce((a, b) => (a > b ? a : b));

  return {
    semana: { desde: lunes, hasta: sumaDias(lunes, 6), hoy },
    grupos,
    estadisticas: {
      series_efectivas: agregado.seriesEfectivas,
      sesiones: sesiones.length,
      grupos_sin_trabajo: grupos.filter((g) => g.nivel === 0).length,
    },
    escala: ESCALA,
    diagnostico: {
      series_sin_mapeo: agregado.seriesSinMapeo,
      series_sobre_umbral: agregado.seriesSobreUmbral,
      series_de_calentamiento: agregado.seriesDeCalentamiento,
      versiones_de_parametros: agregado.versionesDeParametros,
    },
    frescura: { ultima_serie_recibida: ultima },
    catalogo: {
      grupos: grupos.length,
      ejercicios: almacen.lee('ejercicio').filter((e) => e.archivado_en === null).length,
    },
  };
}

// ── Historial: el registro, no un resumen ───────────────────────────────────

/** Sesiones por página del historial: las diez últimas en la primera. */
export const SESIONES_POR_PAGINA = 10;

function conSigno(c: Centesimas): string {
  return c > 0 ? `+${decimalDesdeCentesimas(c)}` : decimalDesdeCentesimas(c);
}

/**
 * El historial (ADR-024): cada sesión con su área, sus series efectivas, la carga
 * media y el progreso frente a la anterior de su misma área; de diez en diez, de
 * la más reciente a la más antigua. Se calcula con TODAS las sesiones —la
 * anterior de su área puede estar en otra página— y nada de esto se guarda.
 * Las series siguen ahí, crudas: borrar y confirmar fechas vive en el detalle.
 */
export function historial(almacen: AlmacenDeUsuario, pagina: number): Historial {
  const nombres = new Map(almacen.lee('ejercicio').map((e) => [e.id, e.nombre]));
  const parametros = parametrosDe(almacen);
  const regiones = new Map(
    almacen.lee('grupo_muscular').map((g) => {
      const region = grupoBasePorNombre(g.nombre)?.region;
      return [g.id, region === 'superior' || region === 'inferior' ? region : null] as const;
    }),
  );
  const seriesPorSesion = new Map<string, Fila<'serie'>[]>();
  for (const x of almacen.lee('serie')) {
    const lista = seriesPorSesion.get(x.sesion_id) ?? [];
    lista.push(x);
    seriesPorSesion.set(x.sesion_id, lista);
  }
  // En orden de calendario: la anterior de cada área es la última vista de esa área.
  const cronologicas = [...almacen.lee('sesion')].sort(
    (a, b) =>
      a.fecha_logica.localeCompare(b.fecha_logica) || a.iniciada_en.localeCompare(b.iniciada_en),
  );
  const ultimaDe = new Map<Area, { fecha: string; series: SerieConCarga[] }>();
  const calculadas = cronologicas.map((s) => {
    const filas = (seriesPorSesion.get(s.id) ?? []).sort(
      (a, b) => Number(a.orden) - Number(b.orden),
    );
    const agregado = agrega({
      series: filas.map((x) => serieDelMotor(x, s, parametros)),
      umbrales: parametros.umbrales,
    });
    const conCarga: SerieConCarga[] = filas.map((x) => ({
      ejercicioId: x.ejercicio_id,
      tipo: x.es_calentamiento === 'true' ? 'calentamiento' : 'trabajo',
      carga: centesimasDesdeDecimal(x.carga_lb),
      repeticiones: Number(x.repeticiones),
      rir: x.rir === null ? null : Number(x.rir),
    }));
    const area = areaDe(agregado, (g) => regiones.get(g) ?? null);
    const anterior = area === null ? undefined : ultimaDe.get(area);
    const comparado = anterior === undefined ? null : progreso(conCarga, anterior.series);
    const media = cargaMedia(conCarga);
    if (area !== null) ultimaDe.set(area, { fecha: s.fecha_logica, series: conCarga });
    return {
      id: s.id,
      fecha_logica: s.fecha_logica,
      iniciada_en: s.iniciada_en,
      finalizada_en: s.finalizada_en,
      fecha_por_confirmar: s.fecha_por_confirmar === 'true',
      origen: s.origen === 'captura' ? ('captura' as const) : ('registro' as const),
      area,
      series_efectivas: agregado.seriesEfectivas,
      // A la décima: la media es un resumen, no una carga que alguien levantó.
      carga_media_lb: media === null ? null : decimalDesdeCentesimas(media).slice(0, -1),
      progreso:
        area === null
          ? ({ estado: 'sin-area' } as const)
          : anterior === undefined
            ? ({ estado: 'primera' } as const)
            : comparado === null
              ? ({ estado: 'sin-comunes', frente_a: anterior.fecha } as const)
              : ({
                  estado: 'comparada',
                  puntos: comparado.puntos,
                  cambio: conSigno(comparado.cambio as Centesimas),
                  ejercicios: comparado.ejercicios,
                  frente_a: anterior.fecha,
                } as const),
      series: filas.map((x) => ({
        id: x.id,
        orden: Number(x.orden),
        ejercicio: nombres.get(x.ejercicio_id) ?? 'Ejercicio desconocido',
        repeticiones: Number(x.repeticiones),
        carga_lb: x.carga_lb,
        rir: x.rir === null ? null : Number(x.rir),
        es_calentamiento: x.es_calentamiento === 'true',
        realizada_en: x.realizada_en,
      })),
    };
  });
  const total = calculadas.length;
  const paginas = Math.max(1, Math.ceil(total / SESIONES_POR_PAGINA));
  const actual = Math.min(Math.max(1, pagina), paginas);
  const recientes = calculadas.reverse();
  return {
    pagina: actual,
    paginas,
    total,
    por_pagina: SESIONES_POR_PAGINA,
    sesiones: recientes.slice((actual - 1) * SESIONES_POR_PAGINA, actual * SESIONES_POR_PAGINA),
  };
}

// ── Catálogo ────────────────────────────────────────────────────────────────

function abiertaDe(almacen: AlmacenDeUsuario): Fila<'version_parametros'> {
  const abierta = versionAbierta(parametrosDe(almacen).versiones);
  if (abierta === undefined) throw new Error('El libro no tiene versión de parámetros abierta');
  return abierta;
}

export function catalogo(almacen: AlmacenDeUsuario): Catalogo {
  const abierta = abiertaDe(almacen);
  const contribuciones = almacen
    .lee('contribucion_muscular')
    .filter((c) => c.version_parametros_id === abierta.id);
  const conGrupos = new Set(contribuciones.map((c) => c.ejercicio_id));
  return {
    grupos: [...almacen.lee('grupo_muscular')]
      .sort(ordenDeGrupos)
      .map((g) => ({ id: g.id, nombre: g.nombre, zona: zonaPara(g.nombre) })),
    ejercicios: [...almacen.lee('ejercicio')]
      .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'))
      .map((e) => ({
        id: e.id,
        nombre: e.nombre,
        archivado: e.archivado_en !== null,
        sin_grupos: !conGrupos.has(e.id),
        base_id: ejercicioBasePorNombre(e.nombre)?.id ?? null,
      })),
    parametros: {
      version_id: abierta.id,
      umbral_rir: Number(abierta.umbral_rir),
      vigente_desde: abierta.vigente_desde,
      fijada: almacen.lee('sesion').some((s) => s.version_parametros_id === abierta.id),
      manana: sumaDias(hoyDe(almacen), 1),
      contribuciones: contribuciones.map((c) => ({
        ejercicio_id: c.ejercicio_id,
        grupo_id: c.grupo_muscular_id,
        coeficiente: c.coeficiente,
      })),
    },
  };
}

export function creaGrupo(almacen: AlmacenDeUsuario, nombre: string) {
  const limpio = nombre.trim();
  if (
    almacen.lee('grupo_muscular').some((g) => normalizaNombre(g.nombre) === normalizaNombre(limpio))
  ) {
    throw conflicto('duplicado', `Ya existe un grupo llamado «${limpio}»`);
  }
  const grupo = almacen.inserta('grupo_muscular', { id: randomUUID(), nombre: limpio });
  return { id: grupo.id, nombre: grupo.nombre, zona: zonaPara(grupo.nombre) };
}

export function creaEjercicio(almacen: AlmacenDeUsuario, nombre: string) {
  const limpio = nombre.trim();
  if (almacen.lee('ejercicio').some((e) => normalizaNombre(e.nombre) === normalizaNombre(limpio))) {
    throw conflicto('duplicado', `Ya existe un ejercicio llamado «${limpio}»`);
  }
  const ejercicio = almacen.inserta('ejercicio', {
    id: randomUUID(),
    nombre: limpio,
    archivado_en: null,
  });
  return { id: ejercicio.id, nombre: ejercicio.nombre, archivado: false, sin_grupos: true };
}

/** Borrado lógico: desaparece de los selectores y conserva todo su histórico. */
export function archivaEjercicio(almacen: AlmacenDeUsuario, id: string, archivado: boolean): void {
  const ejercicio = almacen.lee('ejercicio').find((e) => e.id === id);
  if (ejercicio === undefined) throw noEncontrado('ese ejercicio');
  if ((ejercicio.archivado_en !== null) === archivado) return;
  almacen.actualiza('ejercicio', id, {
    archivado_en: archivado ? almacen.ahora.toISOString() : null,
  });
}

/**
 * Decide por qué camino se guardan unos parámetros:
 * - nadie fija la versión abierta → se reescribe en sitio y rige ya (ADR-013);
 * - una sesión la fija → se cierra y nace una sucesora desde mañana (ADR-003);
 * - la fija una sesión FUTURA → no hay camino honrado: 409.
 */
function destinoDeParametros(almacen: AlmacenDeUsuario): {
  abierta: Fila<'version_parametros'>;
  fijada: boolean;
  manana: string;
} {
  const abierta = abiertaDe(almacen);
  const hoy = hoyDe(almacen);
  const manana = sumaDias(hoy, 1);
  const fijadoras = almacen.lee('sesion').filter((s) => s.version_parametros_id === abierta.id);
  const futura = fijadoras.find((s) => s.fecha_logica > hoy);
  if (futura !== undefined) {
    throw conflicto(
      'fijada-por-futura',
      `Una sesión del ${futura.fecha_logica} fija los parámetros vigentes. Revísala en el historial: si la fecha es un error, bórrala y vuelve a intentarlo.`,
    );
  }
  return { abierta, fijada: fijadoras.length > 0, manana };
}

function abreSucesora(
  almacen: AlmacenDeUsuario,
  abierta: Fila<'version_parametros'>,
  manana: string,
  umbral: string,
): Fila<'version_parametros'> {
  almacen.actualiza('version_parametros', abierta.id, { vigente_hasta: manana });
  return almacen.inserta('version_parametros', {
    id: randomUUID(),
    umbral_rir: umbral,
    vigente_desde: manana,
    vigente_hasta: null,
  });
}

export function guardaParametros(
  almacen: AlmacenDeUsuario,
  propuesta: CuerpoPropuestaDeParametros,
): ResultadoDeParametros {
  const ejercicios = new Set(almacen.lee('ejercicio').map((e) => e.id));
  const grupos = new Set(almacen.lee('grupo_muscular').map((g) => g.id));
  const pares = new Set<string>();
  for (const c of propuesta.contribuciones) {
    if (!ejercicios.has(c.ejercicio_id) || !grupos.has(c.grupo_id)) {
      throw invalido('referencia', 'La propuesta cita un ejercicio o un grupo que no existe');
    }
    const par = `${c.ejercicio_id}|${c.grupo_id}`;
    if (pares.has(par)) throw invalido('duplicado', 'La propuesta repite un par ejercicio-grupo');
    pares.add(par);
    const valor = centesimasDesdeDecimal(c.coeficiente);
    if (valor <= 0 || valor > 200) {
      throw invalido('coeficiente', `Coeficiente fuera de (0, 2]: ${c.coeficiente}`);
    }
  }

  const { abierta, fijada, manana } = destinoDeParametros(almacen);
  const umbral = String(propuesta.umbral_rir);

  if (!fijada) {
    // En sitio: se conservan los identificadores de los pares que siguen.
    if (abierta.umbral_rir !== umbral)
      almacen.actualiza('version_parametros', abierta.id, { umbral_rir: umbral });
    const actuales = almacen
      .lee('contribucion_muscular')
      .filter((c) => c.version_parametros_id === abierta.id);
    const propuestos = new Map(
      propuesta.contribuciones.map((c) => [`${c.ejercicio_id}|${c.grupo_id}`, c]),
    );
    for (const actual of actuales) {
      const nuevo = propuestos.get(`${actual.ejercicio_id}|${actual.grupo_muscular_id}`);
      if (nuevo === undefined) almacen.borra('contribucion_muscular', actual.id);
      else if (nuevo.coeficiente !== actual.coeficiente) {
        almacen.actualiza('contribucion_muscular', actual.id, { coeficiente: nuevo.coeficiente });
      }
      propuestos.delete(`${actual.ejercicio_id}|${actual.grupo_muscular_id}`);
    }
    for (const c of propuestos.values()) {
      almacen.inserta('contribucion_muscular', {
        id: randomUUID(),
        version_parametros_id: abierta.id,
        ejercicio_id: c.ejercicio_id,
        grupo_muscular_id: c.grupo_id,
        coeficiente: c.coeficiente,
      });
    }
    return { camino: 'en-sitio', version_id: abierta.id, vigente_desde: abierta.vigente_desde };
  }

  const sucesora = abreSucesora(almacen, abierta, manana, umbral);
  for (const c of propuesta.contribuciones) {
    almacen.inserta('contribucion_muscular', {
      id: randomUUID(),
      version_parametros_id: sucesora.id,
      ejercicio_id: c.ejercicio_id,
      grupo_muscular_id: c.grupo_id,
      coeficiente: c.coeficiente,
    });
  }
  return { camino: 'sucesora', version_id: sucesora.id, vigente_desde: sucesora.vigente_desde };
}

// ── Catálogo base: semilla, no autoridad ────────────────────────────────────

export function catalogoBase(): CatalogoBaseConPerfiles {
  return {
    ...CATALOGO_BASE,
    ejercicios_por_perfil: Object.fromEntries(
      CATALOGO_BASE.perfiles.map((p) => [p.id, ejerciciosDePerfil(p).map((e) => e.id)]),
    ),
  };
}

/**
 * Importa POR IDENTIFICADORES del catálogo base. Idempotente y reconciliadora:
 * reutiliza por nombre normalizado, crea lo que falta y no pisa nunca un
 * coeficiente que ya existe. Si la versión abierta está fijada, la sucesora
 * COPIA todas sus contribuciones antes de añadir: una sucesora vacía borraría
 * de hecho el catálogo del usuario a partir de mañana.
 */
export function importa(
  almacen: AlmacenDeUsuario,
  peticion: CuerpoImportacion,
): ResultadoDeImportacion {
  const gruposBase = new Map(CATALOGO_BASE.grupos.map((g) => [g.id, g]));
  const ejerciciosBase = new Map(CATALOGO_BASE.ejercicios.map((e) => [e.id, e]));
  const desconocidos = [
    ...peticion.grupos.filter((id) => !gruposBase.has(id)),
    ...peticion.ejercicios.filter((id) => !ejerciciosBase.has(id)),
  ];
  if (desconocidos.length > 0) {
    throw invalido(
      'referencia',
      `Identificadores que el catálogo base no tiene: ${desconocidos.slice(0, 5).join(', ')}`,
    );
  }

  const seleccion = [...new Set(peticion.ejercicios)].flatMap((id) => {
    const e = ejerciciosBase.get(id);
    return e === undefined ? [] : [e];
  });
  const idsDeGrupo = new Set([
    ...peticion.grupos,
    ...seleccion.flatMap((e) => Object.keys(e.coeficientes)),
  ]);

  let gruposCreados = 0;
  let gruposReutilizados = 0;
  const grupoDelUsuario = new Map<string, string>();
  for (const base of CATALOGO_BASE.grupos) {
    if (!idsDeGrupo.has(base.id)) continue;
    const existente = almacen
      .lee('grupo_muscular')
      .find((g) => normalizaNombre(g.nombre) === normalizaNombre(base.nombre));
    if (existente !== undefined) {
      gruposReutilizados += 1;
      grupoDelUsuario.set(base.id, existente.id);
    } else {
      gruposCreados += 1;
      grupoDelUsuario.set(
        base.id,
        almacen.inserta('grupo_muscular', { id: randomUUID(), nombre: base.nombre }).id,
      );
    }
  }

  let ejerciciosCreados = 0;
  let ejerciciosReutilizados = 0;
  const ejercicioDelUsuario = new Map<string, string>();
  for (const base of seleccion) {
    const existente = almacen
      .lee('ejercicio')
      .find((e) => normalizaNombre(e.nombre) === normalizaNombre(base.nombre));
    if (existente !== undefined) {
      ejerciciosReutilizados += 1;
      ejercicioDelUsuario.set(base.id, existente.id);
    } else {
      ejerciciosCreados += 1;
      ejercicioDelUsuario.set(
        base.id,
        almacen.inserta('ejercicio', { id: randomUUID(), nombre: base.nombre, archivado_en: null })
          .id,
      );
    }
  }

  // Qué contribuciones faltan en la versión abierta.
  const { abierta, fijada, manana } = destinoDeParametros(almacen);
  const actuales = almacen
    .lee('contribucion_muscular')
    .filter((c) => c.version_parametros_id === abierta.id);
  const existentes = new Set(actuales.map((c) => `${c.ejercicio_id}|${c.grupo_muscular_id}`));
  const nuevas: { ejercicio_id: string; grupo_muscular_id: string; coeficiente: string }[] = [];
  let conservadas = 0;
  for (const base of seleccion) {
    const ejercicioId = ejercicioDelUsuario.get(base.id);
    if (ejercicioId === undefined) continue;
    for (const [grupoBase, coeficiente] of Object.entries(base.coeficientes)) {
      const grupoId = grupoDelUsuario.get(grupoBase);
      if (grupoId === undefined) continue;
      if (existentes.has(`${ejercicioId}|${grupoId}`)) conservadas += 1;
      else nuevas.push({ ejercicio_id: ejercicioId, grupo_muscular_id: grupoId, coeficiente });
    }
  }

  const resultado = {
    grupos_creados: gruposCreados,
    grupos_reutilizados: gruposReutilizados,
    ejercicios_creados: ejerciciosCreados,
    ejercicios_reutilizados: ejerciciosReutilizados,
    contribuciones_creadas: nuevas.length,
    contribuciones_conservadas: conservadas,
  };
  if (nuevas.length === 0)
    return { ...resultado, camino: 'sin-cambios', vigente_desde: abierta.vigente_desde };

  let destino = abierta;
  if (fijada) {
    destino = abreSucesora(almacen, abierta, manana, abierta.umbral_rir);
    for (const c of actuales) {
      almacen.inserta('contribucion_muscular', {
        id: randomUUID(),
        version_parametros_id: destino.id,
        ejercicio_id: c.ejercicio_id,
        grupo_muscular_id: c.grupo_muscular_id,
        coeficiente: c.coeficiente,
      });
    }
  }
  for (const c of nuevas) {
    almacen.inserta('contribucion_muscular', {
      id: randomUUID(),
      version_parametros_id: destino.id,
      ...c,
    });
  }
  return {
    ...resultado,
    camino: fijada ? 'sucesora' : 'en-sitio',
    vigente_desde: destino.vigente_desde,
  };
}

// ── Exportación abierta ─────────────────────────────────────────────────────

export function exportacion(almacen: AlmacenDeUsuario, cuenta: Exportacion['cuenta']): Exportacion {
  return {
    formato: 'sigir-exportacion',
    version: 1,
    exportado_en: almacen.ahora.toISOString(),
    cuenta,
    datos: Object.fromEntries(HOJAS_DE_LIBRO.map((h) => [h, almacen.lee(h)])),
  };
}
