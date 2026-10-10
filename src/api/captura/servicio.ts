import { randomUUID } from 'node:crypto';
import type { AlmacenDeUsuario } from '../../almacen/acceso.js';
import type { Fila } from '../../almacen/esquema.js';
import { normalizaNombre } from '../../almacen/invariantes.js';
import {
  agrega,
  centesimasDesdeDecimal,
  decimalDesdeCentesimas,
  diasEntre,
  type FechaLogica,
  lunesDe,
  sumaDias,
  volumenDe,
} from '../../domain/volume/index.js';
import {
  hoyDe,
  parametrosDe,
  serieDelMotor,
  seriesEjecutadas,
  versionVigenteEn,
} from '../volumen.js';
import { fechaLogicaEn } from '../zona.js';
import type { CatalogoDeCaptura, RespuestaDeCaptura, VolumenDeGrupo } from './contrato.js';

/**
 * EL servicio de escritura de lo entrenado. Lo llaman los atajos por
 * `/api/captura/v1` y la pantalla «Registrar» por `/api/registro/v1`: cambian
 * la credencial y el alcance, nunca la lógica. Una segunda implementación de
 * la escritura sería el riesgo R10 con otro nombre.
 *
 * Los rechazos de dominio se deciden aquí, con una consulta antes de escribir,
 * y viajan en el cuerpo con 200.
 */

export type Origen = 'captura' | 'registro';

export interface SerieNormalizada {
  readonly origen: Origen;
  readonly sesion: {
    readonly clave: string;
    readonly iniciadaEn: Date;
    /**
     * La fecha de un día elegido de la rutina en la web (ADR-026), calculada por
     * el servidor. Sin ella, la fecha sale de `iniciadaEn` en la zona de la cuenta.
     */
    readonly fecha?: FechaLogica;
  };
  readonly serie: {
    readonly clave: string;
    readonly ejercicio: string;
    readonly repeticiones: number;
    /** En libras, ya normalizada: punto decimal, a lo sumo dos decimales. */
    readonly cargaLb: string;
    /** Lo que mandó un atajo anterior al ADR-023, en kilos; `null` si llegó en libras. */
    readonly kilosDelAtajo: string | null;
    readonly rir: number | null;
    readonly calentamiento: boolean;
    readonly realizadaEn: Date;
  };
}

/** Una sesión con fecha lógica futura, o muy vieja, entra marcada para que se vea (riesgo R3). */
const DIAS_DE_ANTIGUEDAD_PLAUSIBLE = 14;
/** El alcance `captura` ve treinta días de escrituras: con semanas más viejas no se afirma un total. */
const DIAS_DE_SEMANA_VISIBLE = 23;

function rechazo(mensaje: string): RespuestaDeCaptura {
  return { estado: 'rechazada', mensaje };
}

function ejercicioPorNombre(
  almacen: AlmacenDeUsuario,
  nombre: string,
): Fila<'ejercicio'> | undefined {
  const buscado = normalizaNombre(nombre);
  // Sin coincidencia aproximada: un dictado mal entendido no puede caer en
  // otro ejercicio. La clave es la misma del índice único del almacén.
  return almacen.lee('ejercicio').find((e) => normalizaNombre(e.nombre) === buscado);
}

/** El volumen de la semana natural de una fecha, en los grupos que toca un ejercicio. */
function semanaDe(
  almacen: AlmacenDeUsuario,
  fecha: FechaLogica,
  versionId: string,
  ejercicioId: string,
): readonly VolumenDeGrupo[] | undefined {
  const lunes = lunesDe(fecha);
  if (almacen.alcance === 'captura' && diasEntre(lunes, hoyDe(almacen)) > DIAS_DE_SEMANA_VISIBLE) {
    // Parte de esa semana puede haberse escrito hace más de treinta días y este
    // alcance no la ve: antes que un total plausible y falso, ningún total.
    return undefined;
  }
  const parametros = parametrosDe(almacen);
  const { series } = seriesEjecutadas(almacen, parametros, lunes, sumaDias(lunes, 7));
  const agregado = agrega({ series, umbrales: parametros.umbrales });
  const grupos = new Map(almacen.lee('grupo_muscular').map((g) => [g.id, g.nombre]));
  const contribuciones = [...(parametros.contribucionesDe(versionId).get(ejercicioId) ?? [])].sort(
    (a, b) => b.coeficiente - a.coeficiente,
  );
  return contribuciones.map((c) => ({
    grupo: grupos.get(c.grupoId) ?? 'Grupo sin nombre',
    series_efectivas: decimalDesdeCentesimas(volumenDe(agregado, c.grupoId)),
  }));
}

function textoDeSemana(semana: readonly VolumenDeGrupo[] | undefined): string {
  if (semana === undefined) return 'Mira el resumen en la web para el total de esa semana.';
  if (semana.length === 0) return '';
  return `Esta semana: ${semana.map((g) => `${g.grupo} ${g.series_efectivas}`).join(' · ')}.`;
}

function mensajeDeSerie(
  entrada: SerieNormalizada,
  ejercicio: Fila<'ejercicio'>,
  umbral: number,
  mapeado: boolean,
  semana: readonly VolumenDeGrupo[] | undefined,
  repetida: boolean,
): string {
  const { serie } = entrada;
  // Un atajo anterior a las libras manda kilos: se dice en qué quedaron.
  const prefijo = `${repetida ? 'Ya estaba registrada.' : 'Guardada.'}${
    serie.kilosDelAtajo === null
      ? ''
      : ` ${serie.kilosDelAtajo} kg = ${serie.cargaLb} lb (actualiza el atajo: ahora la carga va en libras).`
  }`;
  let nota = '';
  if (serie.calentamiento) nota = 'Calentamiento: no cuenta volumen.';
  else if (serie.rir !== null && serie.rir > umbral) {
    nota = `RIR ${serie.rir} por encima de tu umbral (${umbral}): no cuenta como efectiva.`;
  } else if (!mapeado) {
    nota = `«${ejercicio.nombre}» no aporta a ningún grupo en tus parámetros: revisa el catálogo.`;
  }
  return [prefijo, nota, textoDeSemana(semana)].filter((t) => t !== '').join(' ');
}

function mismaSerie(fila: Fila<'serie'>, entrada: SerieNormalizada, ejercicioId: string): boolean {
  const { serie } = entrada;
  return (
    fila.ejercicio_id === ejercicioId &&
    fila.repeticiones === String(serie.repeticiones) &&
    centesimasDesdeDecimal(fila.carga_lb) === centesimasDesdeDecimal(serie.cargaLb) &&
    fila.rir === (serie.rir === null ? null : String(serie.rir)) &&
    fila.es_calentamiento === String(serie.calentamiento)
  );
}

export function registraSerie(
  almacen: AlmacenDeUsuario,
  entrada: SerieNormalizada,
): RespuestaDeCaptura {
  const ejercicio = ejercicioPorNombre(almacen, entrada.serie.ejercicio);
  if (ejercicio === undefined) {
    return rechazo(
      `«${entrada.serie.ejercicio}» no está en tu catálogo. Se busca por nombre exacto; revisa cómo se escribe.`,
    );
  }
  if (ejercicio.archivado_en !== null) {
    return rechazo(
      `«${ejercicio.nombre}» está archivado. Recupéralo en el catálogo para volver a usarlo.`,
    );
  }

  const parametros = parametrosDe(almacen);
  const sesiones = almacen.lee('sesion');
  const series = almacen.lee('serie');

  // Idempotencia por serie: un reenvío del drenado no produce un segundo efecto.
  const previa = series.find((s) => s.clave_idempotencia === entrada.serie.clave);
  if (previa !== undefined) {
    const sesionPrevia = sesiones.find((s) => s.id === previa.sesion_id);
    if (sesionPrevia === undefined || !mismaSerie(previa, entrada, ejercicio.id)) {
      return rechazo('Esa clave de serie ya se usó con otros datos. No se guardó nada.');
    }
    const umbral = parametros.umbrales.get(sesionPrevia.version_parametros_id) ?? 0;
    const mapeado =
      (parametros.contribucionesDe(sesionPrevia.version_parametros_id).get(ejercicio.id) ?? [])
        .length > 0;
    const semana = semanaDe(
      almacen,
      sesionPrevia.fecha_logica as FechaLogica,
      sesionPrevia.version_parametros_id,
      ejercicio.id,
    );
    return {
      estado: 'aceptada',
      mensaje: mensajeDeSerie(entrada, ejercicio, umbral, mapeado, semana, true),
      serie: {
        id: previa.id,
        orden: Number(previa.orden),
        fecha_logica: sesionPrevia.fecha_logica,
        fecha_por_confirmar: sesionPrevia.fecha_por_confirmar === 'true',
      },
      ...(semana === undefined ? {} : { semana }),
    };
  }

  // Sesión vigente por clave; si es nueva, fecha lógica desde su inicio y la
  // zona de la cuenta. La serie de las 00:15 viaja con la clave de la sesión de
  // las 23:50 y hereda su fecha: el motor nunca ve la medianoche.
  let sesion = sesiones.find((s) => s.clave_idempotencia === entrada.sesion.clave);
  // Un entrenamiento es de un día: lo de otro día va en otro, nunca mezclado en silencio.
  if (
    sesion !== undefined &&
    entrada.sesion.fecha !== undefined &&
    sesion.fecha_logica !== entrada.sesion.fecha
  ) {
    return rechazo(
      `Ese entrenamiento es del ${sesion.fecha_logica} y esta serie es del ${entrada.sesion.fecha}: van en entrenamientos distintos. No se guardó nada.`,
    );
  }
  if (sesion === undefined) {
    const fecha =
      entrada.sesion.fecha ?? fechaLogicaEn(entrada.sesion.iniciadaEn, almacen.zonaHoraria);
    const version = versionVigenteEn(parametros.versiones, fecha);
    if (version === undefined) {
      return rechazo(`No hay parámetros vigentes el ${fecha}. Revisa la fecha del teléfono.`);
    }
    const hoy = hoyDe(almacen);
    const antiguedad = almacen.ahora.getTime() - entrada.sesion.iniciadaEn.getTime();
    const implausible = fecha > hoy || antiguedad > DIAS_DE_ANTIGUEDAD_PLAUSIBLE * 86_400_000;
    sesion = almacen.inserta('sesion', {
      id: randomUUID(),
      clave_idempotencia: entrada.sesion.clave,
      fecha_logica: fecha,
      // El pin lo deriva el servidor de la fecha lógica, nunca lo propone el cliente.
      version_parametros_id: version.id,
      iniciada_en: entrada.sesion.iniciadaEn.toISOString(),
      finalizada_en: null,
      fecha_por_confirmar: String(implausible),
      origen: entrada.origen,
    });
  }

  // `orden` lo asigna el servidor: si lo propusiera el cliente, un reenvío
  // podría sobrescribir otra serie.
  const sesionId = sesion.id;
  const orden =
    Math.max(0, ...series.filter((s) => s.sesion_id === sesionId).map((s) => Number(s.orden))) + 1;
  const nueva = almacen.inserta('serie', {
    id: randomUUID(),
    sesion_id: sesion.id,
    clave_idempotencia: entrada.serie.clave,
    orden: String(orden),
    ejercicio_id: ejercicio.id,
    repeticiones: String(entrada.serie.repeticiones),
    carga_lb: entrada.serie.cargaLb,
    rir:
      entrada.serie.calentamiento || entrada.serie.rir === null ? null : String(entrada.serie.rir),
    es_calentamiento: String(entrada.serie.calentamiento),
    realizada_en: entrada.serie.realizadaEn.toISOString(),
  });

  const umbral = parametros.umbrales.get(sesion.version_parametros_id) ?? 0;
  const mapeado =
    (parametros.contribucionesDe(sesion.version_parametros_id).get(ejercicio.id) ?? []).length > 0;
  const semana = semanaDe(
    almacen,
    sesion.fecha_logica as FechaLogica,
    sesion.version_parametros_id,
    ejercicio.id,
  );
  return {
    estado: 'aceptada',
    mensaje: mensajeDeSerie(entrada, ejercicio, umbral, mapeado, semana, false),
    serie: {
      id: nueva.id,
      orden,
      fecha_logica: sesion.fecha_logica,
      fecha_por_confirmar: sesion.fecha_por_confirmar === 'true',
    },
    ...(semana === undefined ? {} : { semana }),
  };
}

export function cierraSesion(
  almacen: AlmacenDeUsuario,
  entrada: { readonly clave: string; readonly finalizadaEn: Date },
): RespuestaDeCaptura {
  const sesion = almacen.lee('sesion').find((s) => s.clave_idempotencia === entrada.clave);
  if (sesion === undefined) {
    return rechazo('No hay ningún entrenamiento con esa clave: no llegó ninguna serie suya.');
  }
  const yaCerrada = sesion.finalizada_en !== null;
  if (!yaCerrada)
    almacen.actualiza('sesion', sesion.id, { finalizada_en: entrada.finalizadaEn.toISOString() });

  // Las series de ESTA sesión, no las del día: puede haber dos sesiones el mismo día.
  const parametros = parametrosDe(almacen);
  const filas = almacen.lee('serie').filter((s) => s.sesion_id === sesion.id);
  const soloEsta = filas.map((f) => serieDelMotor(f, sesion, parametros));
  const agregado = agrega({ series: soloEsta, umbrales: parametros.umbrales });
  const grupos = new Map(almacen.lee('grupo_muscular').map((g) => [g.id, g.nombre]));
  const porGrupo = [...agregado.porGrupo.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([id, c]) => `${grupos.get(id) ?? 'Grupo sin nombre'} ${decimalDesdeCentesimas(c)}`);
  const resumen = `${filas.length} series, ${agregado.seriesEfectivas} efectivas${
    porGrupo.length > 0 ? `. ${porGrupo.join(' · ')}` : ''
  }.`;
  return {
    estado: 'aceptada',
    mensaje: `${yaCerrada ? 'Ya estaba cerrado.' : 'Entrenamiento cerrado.'} ${resumen}`,
  };
}

export function registraPeso(
  almacen: AlmacenDeUsuario,
  entrada: { readonly pesoKg: string; readonly medidoEn: Date; readonly origen: Origen },
): RespuestaDeCaptura {
  const fecha = fechaLogicaEn(entrada.medidoEn, almacen.zonaHoraria);
  if (almacen.alcance === 'captura' && diasEntre(fecha, hoyDe(almacen)) > DIAS_DE_SEMANA_VISIBLE) {
    return rechazo(`La fecha ${fecha} es demasiado antigua para registrarla desde el teléfono.`);
  }
  if (fecha > hoyDe(almacen))
    return rechazo(`La fecha ${fecha} es futura. Revisa la fecha del teléfono.`);
  // Idempotente por fecha lógica: una medición por día; la última manda.
  const existente = almacen.lee('medicion_corporal').find((m) => m.fecha_logica === fecha);
  if (existente === undefined) {
    almacen.inserta('medicion_corporal', {
      id: randomUUID(),
      fecha_logica: fecha,
      peso_kg: entrada.pesoKg,
      origen: entrada.origen,
    });
    return { estado: 'aceptada', mensaje: `Peso del ${fecha}: ${entrada.pesoKg} kg.` };
  }
  if (centesimasDesdeDecimal(existente.peso_kg) === centesimasDesdeDecimal(entrada.pesoKg)) {
    return {
      estado: 'aceptada',
      mensaje: `Peso del ${fecha}: ${existente.peso_kg} kg (ya estaba).`,
    };
  }
  almacen.actualiza('medicion_corporal', existente.id, {
    peso_kg: entrada.pesoKg,
    origen: entrada.origen,
  });
  return { estado: 'aceptada', mensaje: `Peso del ${fecha} corregido: ${entrada.pesoKg} kg.` };
}

export function catalogoDeCaptura(almacen: AlmacenDeUsuario): CatalogoDeCaptura {
  const porNombre = (a: { nombre: string }, b: { nombre: string }) =>
    a.nombre.localeCompare(b.nombre, 'es');
  return {
    ejercicios: almacen
      .lee('ejercicio')
      .filter((e) => e.archivado_en === null)
      .map((e) => ({ nombre: e.nombre }))
      .sort(porNombre),
    grupos: almacen
      .lee('grupo_muscular')
      .map((g) => ({ nombre: g.nombre }))
      .sort(porNombre),
  };
}

// ── Sólo desde la web (alcance `sesion`): borrar y confirmar, a la vista ─────

/** Una serie mal capturada se borra entera, no se edita en sitio. */
export function borraSerie(almacen: AlmacenDeUsuario, id: string): boolean {
  if (!almacen.lee('serie').some((s) => s.id === id)) return false;
  almacen.borra('serie', id);
  return true;
}

/** Una sesión con la fecha gravemente mal se borra con sus series y se vuelve a capturar. */
export function borraSesion(almacen: AlmacenDeUsuario, id: string): boolean {
  if (!almacen.lee('sesion').some((s) => s.id === id)) return false;
  for (const serie of almacen.lee('serie').filter((s) => s.sesion_id === id))
    almacen.borra('serie', serie.id);
  almacen.borra('sesion', id);
  return true;
}

export function confirmaFecha(almacen: AlmacenDeUsuario, id: string): boolean {
  const sesion = almacen.lee('sesion').find((s) => s.id === id);
  if (sesion === undefined) return false;
  if (sesion.fecha_por_confirmar === 'true') {
    almacen.actualiza('sesion', id, { fecha_por_confirmar: 'false' });
  }
  return true;
}
