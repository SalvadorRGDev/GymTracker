import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { Autenticacion } from '../../auth/sesiones.js';
import {
  borraCookieDeSesion,
  leeCookie,
  NOMBRE_DE_COOKIE,
  ponCookieDeSesion,
} from '../credenciales.js';
import { ErrorDeDominio, MENSAJE_SIN_SESION } from '../errores.js';
import type { LimiteDeTasa } from '../limites.js';
import {
  type CuerpoEntrada,
  Entrada,
  MENSAJE_DE_ACCESO_FALLIDO,
  type SesionActual,
} from './contrato.js';

/**
 * `/api/sesion/v1`: entrar, salir y la protección de las rutas con cookie.
 * No hay registro público: las cuentas se crean con `npm run alta` (ADR-007).
 */

/**
 * Resuelve la cookie o lanza 401. Si la sesión se deslizó, re-emite la cookie
 * con la nueva caducidad. Es lo PRIMERO que hace cada ruta protegida.
 */
export async function usuarioDeLaSesion(
  request: FastifyRequest,
  reply: FastifyReply,
  autenticacion: Autenticacion,
  reloj: () => Date,
): Promise<string> {
  const token = leeCookie(request, NOMBRE_DE_COOKIE);
  const sesion = token === null ? null : await autenticacion.resuelveSesion(token);
  if (sesion === null || token === null) {
    throw new ErrorDeDominio(401, 'sin-sesion', MENSAJE_SIN_SESION);
  }
  if (sesion.renovada) ponCookieDeSesion(reply, token, sesion.expiraEn, reloj());
  return sesion.usuarioId;
}

export function rutasDeSesion(
  app: FastifyInstance,
  dependencias: {
    readonly autenticacion: Autenticacion;
    readonly reloj: () => Date;
    /** Por correo e IP: lo que protege una cuenta de que le prueben contraseñas. */
    readonly limiteDeAcceso: LimiteDeTasa;
    /**
     * Por IP, sea cual sea el correo: con un correo nuevo en cada intento, una
     * sola IP pasaba el de arriba siempre y encolaba Argon2 sin fin.
     */
    readonly limiteDeAccesoPorIp: LimiteDeTasa;
  },
): void {
  const { autenticacion, reloj, limiteDeAcceso, limiteDeAccesoPorIp } = dependencias;

  app.post<{ Body: CuerpoEntrada }>(
    '/api/sesion/v1/entrar',
    { schema: { body: Entrada } },
    async (request, reply) => {
      const correo = request.body.correo.trim().toLowerCase();
      // Detrás del túnel la IP sólo es real con TRUSTED_PROXY.
      const espera =
        limiteDeAccesoPorIp.consume(request.ip) ??
        limiteDeAcceso.consume(`${correo}|${request.ip}`);
      if (espera !== null) {
        reply.header('retry-after', String(espera));
        throw new ErrorDeDominio(429, 'limite', 'Demasiados intentos. Espera un poco.', {
          reintentar_en: espera,
        });
      }
      const resultado = await autenticacion.entra(correo, request.body.contrasena);
      if (resultado === null) throw new ErrorDeDominio(401, 'acceso', MENSAJE_DE_ACCESO_FALLIDO);
      ponCookieDeSesion(reply, resultado.token, resultado.expiraEn, reloj());
      return reply.code(204).send();
    },
  );

  app.post('/api/sesion/v1/salir', async (request, reply) => {
    const token = leeCookie(request, NOMBRE_DE_COOKIE);
    if (token !== null) await autenticacion.sale(token);
    borraCookieDeSesion(reply);
    return reply.code(204).send();
  });

  app.get('/api/sesion/v1/actual', async (request, reply): Promise<SesionActual> => {
    const usuarioId = await usuarioDeLaSesion(request, reply, autenticacion, reloj);
    const cuenta = await autenticacion.cuenta(usuarioId);
    if (cuenta === null) throw new ErrorDeDominio(401, 'sin-sesion', MENSAJE_SIN_SESION);
    return { correo: cuenta.correo, zona_horaria: cuenta.zona_horaria };
  });
}
