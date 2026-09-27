import type { FastifyReply, FastifyRequest } from 'fastify';
import { ErrorDeDominio } from './errores.js';

/**
 * Cookie y portador, sin dependencias: leer una cabecera `Cookie` y escribir
 * un `Set-Cookie` no justifica una séptima dependencia de ejecución.
 */

export const NOMBRE_DE_COOKIE = 'sigir_sesion';

export function leeCookie(request: FastifyRequest, nombre = NOMBRE_DE_COOKIE): string | null {
  const cabecera = request.headers.cookie;
  if (typeof cabecera !== 'string') return null;
  for (const trozo of cabecera.split(';')) {
    const igual = trozo.indexOf('=');
    if (igual === -1) continue;
    if (trozo.slice(0, igual).trim() === nombre) return trozo.slice(igual + 1).trim();
  }
  return null;
}

/**
 * `HttpOnly; Secure; SameSite=Strict; Path=/` siempre. Sobre HTTP plano el
 * navegador descarta en silencio una cookie `Secure`: entrar da 204 y la
 * siguiente petición 401. Por eso se publica con HTTPS (túnel), no se afloja.
 */
export function ponCookieDeSesion(
  reply: FastifyReply,
  token: string,
  expiraEn: Date,
  ahora: Date,
): void {
  const segundos = Math.max(0, Math.floor((expiraEn.getTime() - ahora.getTime()) / 1000));
  reply.header(
    'set-cookie',
    `${NOMBRE_DE_COOKIE}=${token}; Max-Age=${segundos}; Path=/; HttpOnly; Secure; SameSite=Strict`,
  );
}

export function borraCookieDeSesion(reply: FastifyReply): void {
  reply.header(
    'set-cookie',
    `${NOMBRE_DE_COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`,
  );
}

export function leePortador(request: FastifyRequest): string | null {
  const cabecera = request.headers.authorization;
  if (typeof cabecera !== 'string') return null;
  const m = /^Bearer\s+(\S+)$/i.exec(cabecera.trim());
  return m?.[1] ?? null;
}

/**
 * Lo que queda como cuerpo cuando el JSON no se deja leer (ver `app.ts`). Ningún
 * JSON produce un símbolo y un símbolo no cumple ningún esquema de objeto.
 */
export const CUERPO_ILEGIBLE: unique symbol = Symbol('cuerpo-ilegible');

/**
 * Con `attachValidation` Fastify no contesta 400 por su cuenta: el error queda
 * en la petición y se mira DESPUÉS de resolver la credencial. Contestar 400 a
 * quien no está autenticado sería explicarle la forma del contrato.
 */
export function compruebaEsquema(request: FastifyRequest): void {
  if (request.body === CUERPO_ILEGIBLE) {
    throw new ErrorDeDominio(400, 'esquema', 'Petición mal formada: el cuerpo no es JSON válido');
  }
  const error = request.validationError;
  if (error !== undefined && error !== null) {
    throw new ErrorDeDominio(400, 'esquema', `Petición mal formada: ${error.message}`);
  }
}
