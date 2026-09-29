import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { esZonaValida } from '../../almacen/celdas.js';
import { hashDeContrasena, LONGITUD_MINIMA } from '../../auth/contrasena.js';
import { esCorreoValido } from '../../auth/correo.js';
import type { Autenticacion } from '../../auth/sesiones.js';
import type { AltaPublica } from '../app.js';
import {
  borraCookieDeSesion,
  leeCookie,
  NOMBRE_DE_COOKIE,
  ponCookieDeSesion,
} from '../credenciales.js';
import { ErrorDeDominio, MENSAJE_SIN_SESION } from '../errores.js';
import type { LimiteDeTasa } from '../limites.js';
import {
  Alta,
  type CuerpoAlta,
  type CuerpoEntrada,
  Entrada,
  type EstadoDelAlta,
  LONGITUD_MAXIMA_DE_CONTRASENA,
  MENSAJE_DE_ACCESO_FALLIDO,
  type SesionActual,
} from './contrato.js';

/**
 * `/api/sesion/v1`: entrar, salir, darse de alta y la protección de las rutas
 * con cookie. El alta pública es opcional (`ALTA_ABIERTA`, ADR-020): con tope de
 * cuentas, pocas altas por IP y un techo global por hora.
 */

function rechazo(codigo: string, mensaje: string): ErrorDeDominio {
  return new ErrorDeDominio(422, codigo, mensaje);
}

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
    /** `null` = alta cerrada: sólo `npm run alta`. */
    readonly alta: AltaPublica | null;
    readonly limiteDeAltaPorIp: LimiteDeTasa;
    readonly limiteDeAltaGlobal: LimiteDeTasa;
  },
): void {
  const { autenticacion, reloj, limiteDeAcceso, limiteDeAccesoPorIp, alta } = dependencias;
  const { limiteDeAltaPorIp, limiteDeAltaGlobal } = dependencias;

  app.get('/api/sesion/v1/alta', async (): Promise<EstadoDelAlta> => {
    return { abierta: alta !== null && (await alta.cuentas()) < alta.maximo };
  });

  app.post<{ Body: CuerpoAlta }>(
    '/api/sesion/v1/alta',
    { schema: { body: Alta } },
    async (request, reply) => {
      if (alta === null) {
        throw new ErrorDeDominio(
          403,
          'alta-cerrada',
          'El registro está cerrado en este servidor: pide una cuenta a quien lo administra.',
        );
      }
      // Antes que nada caro (Argon2, disco): el límite por IP y el techo global.
      const espera = limiteDeAltaPorIp.consume(request.ip) ?? limiteDeAltaGlobal.consume('todas');
      if (espera !== null) {
        reply.header('retry-after', String(espera));
        throw new ErrorDeDominio(
          429,
          'limite',
          'Demasiados registros seguidos. Inténtalo más tarde.',
          { reintentar_en: espera },
        );
      }
      const correo = request.body.correo.trim().toLowerCase();
      const { contrasena } = request.body;
      const zona = request.body.zona_horaria.trim();
      if (!esCorreoValido(correo)) throw rechazo('correo', 'Escribe un correo válido.');
      if (
        contrasena.length < LONGITUD_MINIMA ||
        contrasena.length > LONGITUD_MAXIMA_DE_CONTRASENA
      ) {
        throw rechazo(
          'contrasena',
          `La contraseña debe tener entre ${LONGITUD_MINIMA} y ${LONGITUD_MAXIMA_DE_CONTRASENA} caracteres.`,
        );
      }
      const usuario = correo.split('@')[0] ?? '';
      if (usuario.length >= 4 && contrasena.toLowerCase().includes(usuario)) {
        throw rechazo('contrasena', 'La contraseña no puede contener tu correo.');
      }
      if (!esZonaValida(zona)) throw rechazo('zona', 'La zona horaria no es válida.');
      if ((await alta.cuentas()) >= alta.maximo) {
        throw new ErrorDeDominio(
          403,
          'alta-completa',
          'Este servidor ya no admite cuentas nuevas: pide una a quien lo administra.',
        );
      }
      try {
        await alta.crea({
          correo,
          hashContrasena: await hashDeContrasena(contrasena),
          zonaHoraria: zona,
          umbralRir: 4,
          vigenteDesde: '2000-01-01',
        });
      } catch (error) {
        if (error instanceof Error && /Ya existe/.test(error.message)) {
          throw new ErrorDeDominio(
            409,
            'correo-en-uso',
            'No se pudo crear la cuenta con ese correo. Si ya tienes una, entra con tu contraseña.',
          );
        }
        throw error;
      }
      const sesion = await autenticacion.entra(correo, contrasena);
      if (sesion === null) throw new Error('La cuenta recién creada no pudo entrar');
      ponCookieDeSesion(reply, sesion.token, sesion.expiraEn, reloj());
      return reply.code(201).send({ correo });
    },
  );

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
