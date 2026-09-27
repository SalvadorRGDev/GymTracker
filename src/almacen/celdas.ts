import { centesimasDesdeDecimal, esDecimalExacto, esFechaLogica } from '../domain/volume/index.js';

/**
 * Tipos de celda. Toda celda es texto; lo que cambia es qué texto es válido.
 * Cada validador contesta con un mensaje (qué esperaba) o `null` si vale.
 */

export type TipoDeCelda =
  | { readonly tipo: 'uuid' }
  | { readonly tipo: 'clave' }
  | { readonly tipo: 'texto'; readonly maximo: number }
  | { readonly tipo: 'correo' }
  | { readonly tipo: 'huella' }
  | { readonly tipo: 'hash' }
  | { readonly tipo: 'zona' }
  | { readonly tipo: 'fecha' }
  | { readonly tipo: 'instante' }
  | { readonly tipo: 'booleano' }
  | { readonly tipo: 'entero'; readonly minimo: number; readonly maximo: number }
  | {
      readonly tipo: 'decimal';
      readonly minimo: string;
      readonly maximo: string;
      /** `true` si el mínimo no está incluido: (0, 2]. */
      readonly minimoExcluido: boolean;
    }
  | { readonly tipo: 'enumerado'; readonly valores: readonly string[] };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
/** Claves de idempotencia del cliente: un UUID o cualquier cadena aleatoria segura para URL. */
const CLAVE = /^[A-Za-z0-9_-]{8,64}$/;
const CORREO = /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,63}$/;
const HUELLA = /^[0-9a-f]{64}$/;
/** Instante en UTC con Z y milisegundos, como lo escribe `toISOString()`. */
const INSTANTE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

const zonasValidas = new Map<string, boolean>();

export function esZonaValida(zona: string): boolean {
  const previa = zonasValidas.get(zona);
  if (previa !== undefined) return previa;
  let valida = false;
  try {
    // Lanza RangeError si ICU no conoce la zona. Node trae ICU completo.
    new Intl.DateTimeFormat('en-US', { timeZone: zona });
    valida = /^[A-Za-z_]+(?:\/[A-Za-z0-9_+-]+)*$/.test(zona);
  } catch {
    valida = false;
  }
  zonasValidas.set(zona, valida);
  return valida;
}

export function esInstante(texto: string): boolean {
  if (!INSTANTE.test(texto)) return false;
  const fecha = new Date(texto);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString() === texto;
}

export function validaCelda(tipo: TipoDeCelda, texto: string): string | null {
  switch (tipo.tipo) {
    case 'uuid':
      return UUID.test(texto) ? null : 'se esperaba un identificador UUID en minúsculas';
    case 'clave':
      return CLAVE.test(texto) ? null : 'se esperaba una clave de 8 a 64 caracteres [A-Za-z0-9_-]';
    case 'texto':
      if (texto !== texto.trim()) return 'el texto no puede empezar ni terminar en espacio';
      return texto.length <= tipo.maximo ? null : `el texto pasa de ${tipo.maximo} caracteres`;
    case 'correo':
      return CORREO.test(texto) && texto === texto.toLowerCase()
        ? null
        : 'se esperaba un correo en minúsculas';
    case 'huella':
      return HUELLA.test(texto) ? null : 'se esperaba una huella HMAC en hexadecimal';
    case 'hash':
      return texto.startsWith('$argon2id$') ? null : 'se esperaba un hash Argon2id';
    case 'zona':
      return esZonaValida(texto)
        ? null
        : 'se esperaba una zona horaria IANA, como America/Mexico_City';
    case 'fecha':
      return esFechaLogica(texto) ? null : 'se esperaba una fecha AAAA-MM-DD';
    case 'instante':
      return esInstante(texto) ? null : 'se esperaba un instante UTC como 2026-09-26T19:42:00.000Z';
    case 'booleano':
      return texto === 'true' || texto === 'false' ? null : 'se esperaba «true» o «false»';
    case 'entero': {
      if (!/^-?\d{1,9}$/.test(texto)) return 'se esperaba un número entero';
      const n = Number(texto);
      return n >= tipo.minimo && n <= tipo.maximo
        ? null
        : `se esperaba un entero entre ${tipo.minimo} y ${tipo.maximo}`;
    }
    case 'decimal': {
      if (!esDecimalExacto(texto) || texto.startsWith('-0') || /^0\d/.test(texto)) {
        return 'se esperaba un decimal con punto y a lo sumo dos decimales, como 12.50';
      }
      const c = centesimasDesdeDecimal(texto);
      const minimo = centesimasDesdeDecimal(tipo.minimo);
      const maximo = centesimasDesdeDecimal(tipo.maximo);
      const bajo = tipo.minimoExcluido ? c <= minimo : c < minimo;
      if (bajo || c > maximo) {
        return `se esperaba un valor en ${tipo.minimoExcluido ? '(' : '['}${tipo.minimo}, ${tipo.maximo}]`;
      }
      return null;
    }
    case 'enumerado':
      return tipo.valores.includes(texto) ? null : `se esperaba uno de: ${tipo.valores.join(', ')}`;
  }
}
