import { type FechaLogica, fechaLogica } from '../domain/volume/index.js';

/**
 * La fecha lógica desde un instante y la zona IANA de la cuenta, con el ICU
 * completo que trae Node. Vive aquí y no en el motor: la zona es entorno, y el
 * motor no ve ni la hora.
 */

const formateadores = new Map<string, Intl.DateTimeFormat>();

function formateador(zona: string): Intl.DateTimeFormat {
  let f = formateadores.get(zona);
  if (f === undefined) {
    f = new Intl.DateTimeFormat('en-CA', {
      timeZone: zona,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hourCycle: 'h23',
    });
    formateadores.set(zona, f);
  }
  return f;
}

export function fechaLogicaEn(instante: Date, zona: string): FechaLogica {
  const partes = formateador(zona).formatToParts(instante);
  const valor = (tipo: Intl.DateTimeFormatPartTypes) =>
    partes.find((p) => p.type === tipo)?.value ?? '';
  return fechaLogica(`${valor('year')}-${valor('month')}-${valor('day')}`);
}

/**
 * Instantes que llegan del cliente: ISO 8601 con zona (`Z` o `±hh:mm`), con o
 * sin fracción de segundo, que es lo que produce «Formatear fecha → ISO 8601»
 * en Atajos. Se guardan normalizados a UTC con `toISOString()`.
 */
const ISO_CON_ZONA =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})$/;

export function instanteDelCliente(texto: string): Date | null {
  if (!ISO_CON_ZONA.test(texto)) return null;
  const instante = new Date(texto);
  return Number.isNaN(instante.getTime()) ? null : instante;
}
