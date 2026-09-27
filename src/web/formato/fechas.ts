import { diaDeLaSemana, diasEntre, esFechaLogica } from '../../domain/volume/fecha-logica';

/**
 * La fecha lógica NO se convierte a `Date`: `new Date('2026-09-07')` es
 * medianoche UTC y al oeste de Greenwich se pinta como el día 6. El texto se
 * compone de las tres partes del ISO. Un instante sí es un instante y sí se
 * convierte, en la zona de la cuenta.
 */

const MESES = [
  'enero',
  'febrero',
  'marzo',
  'abril',
  'mayo',
  'junio',
  'julio',
  'agosto',
  'septiembre',
  'octubre',
  'noviembre',
  'diciembre',
];

const DIAS = ['lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado', 'domingo'];

export function partesDeFecha(fecha: string): { anio: number; mes: number; dia: number } {
  const [anio = '0', mes = '1', dia = '1'] = fecha.split('-');
  return { anio: Number(anio), mes: Number(mes), dia: Number(dia) };
}

/** «sábado 26 de septiembre». */
export function fechaLarga(fecha: string, conAnio = false): string {
  if (!esFechaLogica(fecha)) return fecha;
  const { anio, mes, dia } = partesDeFecha(fecha);
  const semana = DIAS[diaDeLaSemana(fecha) - 1] ?? '';
  return `${semana} ${dia} de ${MESES[mes - 1] ?? ''}${conAnio ? ` de ${anio}` : ''}`;
}

/** «26 sep». */
export function fechaCorta(fecha: string): string {
  const { mes, dia } = partesDeFecha(fecha);
  return `${dia} ${(MESES[mes - 1] ?? '').slice(0, 3)}`;
}

/** «Semana del 21 al 27 de septiembre» o «del 28 de septiembre al 4 de octubre». */
export function rangoDeSemana(desde: string, hasta: string): string {
  const a = partesDeFecha(desde);
  const b = partesDeFecha(hasta);
  if (a.mes === b.mes && a.anio === b.anio)
    return `Semana del ${a.dia} al ${b.dia} de ${MESES[b.mes - 1]}`;
  const anioA = a.anio === b.anio ? '' : ` de ${a.anio}`;
  return `Semana del ${a.dia} de ${MESES[a.mes - 1]}${anioA} al ${b.dia} de ${MESES[b.mes - 1]}`;
}

/** «Del 2 al 8 de marzo», «Del 26 de febrero al 4 de marzo» o, si es un día, «El 9 de marzo». */
export function rangoDeDias(desde: string, hasta: string): string {
  const a = partesDeFecha(desde);
  const b = partesDeFecha(hasta);
  if (desde === hasta) return `El ${a.dia} de ${MESES[a.mes - 1]}`;
  if (a.mes === b.mes && a.anio === b.anio)
    return `Del ${a.dia} al ${b.dia} de ${MESES[b.mes - 1]}`;
  const anioA = a.anio === b.anio ? '' : ` de ${a.anio}`;
  return `Del ${a.dia} de ${MESES[a.mes - 1]}${anioA} al ${b.dia} de ${MESES[b.mes - 1]}`;
}

const formateadores = new Map<string, Intl.DateTimeFormat>();

function enZona(zona: string): Intl.DateTimeFormat {
  let f = formateadores.get(zona);
  if (f === undefined) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: zona,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    });
    formateadores.set(zona, f);
  }
  return f;
}

function partesDeInstante(instante: Date, zona: string) {
  const partes = enZona(zona).formatToParts(instante);
  const v = (t: Intl.DateTimeFormatPartTypes) => partes.find((p) => p.type === t)?.value ?? '';
  return { fecha: `${v('year')}-${v('month')}-${v('day')}`, hora: `${v('hour')}:${v('minute')}` };
}

/** «19:42» en la zona de la cuenta. */
export function horaDe(iso: string, zona: string): string {
  return partesDeInstante(new Date(iso), zona).hora;
}

/** Aritmética de calendario del motor: sin `Date`, sin zona. */
function diasEntreFechas(a: string, b: string): number {
  return esFechaLogica(a) && esFechaLogica(b) ? diasEntre(a, b) : 0;
}

/** «hoy 19:42», «ayer 08:10», «el jueves 24 a las 19:42» o «hace 9 días». */
export function instanteRelativo(iso: string, zona: string, ahora: Date = new Date()): string {
  const cuando = partesDeInstante(new Date(iso), zona);
  const hoy = partesDeInstante(ahora, zona).fecha;
  const dias = diasEntreFechas(cuando.fecha, hoy);
  if (dias === 0) return `hoy ${cuando.hora}`;
  if (dias === 1) return `ayer ${cuando.hora}`;
  if (dias > 1 && dias < 7)
    return `el ${fechaLarga(cuando.fecha).replace(/ de .*/, '')} a las ${cuando.hora}`;
  if (dias >= 7) return `hace ${dias} días`;
  return `${fechaLarga(cuando.fecha)} ${cuando.hora}`;
}

export function esHoy(iso: string, zona: string, ahora: Date = new Date()): boolean {
  return partesDeInstante(new Date(iso), zona).fecha === partesDeInstante(ahora, zona).fecha;
}

/** Días desde un instante hasta ahora, en fechas de la zona. */
export function diasDesde(iso: string, zona: string, ahora: Date = new Date()): number {
  return diasEntreFechas(
    partesDeInstante(new Date(iso), zona).fecha,
    partesDeInstante(ahora, zona).fecha,
  );
}
