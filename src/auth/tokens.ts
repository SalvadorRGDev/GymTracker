import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

/**
 * Credenciales opacas (ADR-007 y ADR-009). El token viaja al cliente; el
 * almacén guarda sólo su HMAC con `SESSION_SECRET`, así que un volcado de
 * `cuentas.xlsx` no contiene credenciales utilizables, y rotar el secreto las
 * invalida todas a la vez: es el botón de pánico.
 */

/** 32 bytes de CSPRNG en base64url. */
export function nuevoToken(): string {
  return randomBytes(32).toString('base64url');
}

const TOKEN = /^[A-Za-z0-9_-]{43}$/;

export function pareceToken(texto: string): boolean {
  return TOKEN.test(texto);
}

function hmac(secreto: string, mensaje: string): string {
  return createHmac('sha256', secreto).update(mensaje, 'utf8').digest('hex');
}

export function huellaDeSesion(secreto: string, token: string): string {
  return hmac(secreto, token);
}

/**
 * Etiqueta de dominio: la huella de una credencial de captura nunca coincide
 * con la de una sesión aunque alguien presente el mismo token en los dos sitios.
 */
export function huellaDeCaptura(secreto: string, token: string): string {
  return hmac(secreto, `captura:${token}`);
}

export function igualesEnTiempoConstante(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
