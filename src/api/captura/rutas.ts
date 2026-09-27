import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ConAlmacenDeUsuario, Identidad } from '../../almacen/acceso.js';
import type { Autenticacion } from '../../auth/sesiones.js';
import { compruebaEsquema, leePortador } from '../credenciales.js';
import { ErrorDeDominio, MENSAJE_SIN_CREDENCIAL } from '../errores.js';
import type { LimiteDeTasa } from '../limites.js';
import { lineaSemanal } from '../planes/servicio.js';
import {
  type CatalogoDeCaptura,
  CierreDeCaptura,
  type CuerpoCierreDeCaptura,
  type CuerpoPesoDeCaptura,
  type CuerpoSerieDeCaptura,
  type LineaSemanal,
  PesoDeCaptura,
  type RespuestaDeCaptura,
  type RespuestaDeContratoDesconocido,
  SerieDeCaptura,
} from './contrato.js';
import { cierreDesdeCaptura, pesoDesde, serieDesdeCaptura } from './entrada.js';
import { catalogoDeCaptura, cierraSesion, registraPeso, registraSerie } from './servicio.js';

/**
 * `/api/captura/v1`: los atajos de iOS con su portador (ADR-009). No hay aquí
 * ninguna ruta de planes, de exportación ni de borrado; la línea semanal lee el
 * plan para calcular una frase y nada más (ADR-019).
 */
export function rutasDeCaptura(
  app: FastifyInstance,
  dependencias: {
    readonly autenticacion: Autenticacion;
    readonly conAlmacenDeUsuario: ConAlmacenDeUsuario;
    readonly limiteDeCaptura: LimiteDeTasa;
    readonly atajosUrl: string;
    readonly reloj: () => Date;
  },
): void {
  const { autenticacion, conAlmacenDeUsuario, limiteDeCaptura, atajosUrl, reloj } = dependencias;

  /** Portador → identidad con alcance `captura`. Siempre antes que el esquema. */
  async function identidad(request: FastifyRequest): Promise<Identidad> {
    const token = leePortador(request);
    const resuelta = token === null ? null : await autenticacion.resuelveCaptura(token);
    if (resuelta === null) throw new ErrorDeDominio(401, 'sin-credencial', MENSAJE_SIN_CREDENCIAL);
    const espera = limiteDeCaptura.consume(resuelta.huella);
    if (espera !== null) {
      throw new ErrorDeDominio(
        429,
        'limite',
        'Demasiadas capturas seguidas. Vuelve a sincronizar en un momento.',
        {
          reintentar_en: espera,
        },
      );
    }
    return { usuarioId: resuelta.usuarioId, alcance: 'captura' };
  }

  app.post<{ Body: CuerpoSerieDeCaptura }>(
    '/api/captura/v1/serie',
    { schema: { body: SerieDeCaptura }, attachValidation: true },
    async (request): Promise<RespuestaDeCaptura> => {
      const quien = await identidad(request);
      compruebaEsquema(request);
      const entrada = serieDesdeCaptura(request.body);
      return conAlmacenDeUsuario(quien, (almacen) => registraSerie(almacen, entrada));
    },
  );

  app.post<{ Body: CuerpoCierreDeCaptura }>(
    '/api/captura/v1/sesion/cerrar',
    { schema: { body: CierreDeCaptura }, attachValidation: true },
    async (request): Promise<RespuestaDeCaptura> => {
      const quien = await identidad(request);
      compruebaEsquema(request);
      const entrada = cierreDesdeCaptura(request.body);
      return conAlmacenDeUsuario(quien, (almacen) => cierraSesion(almacen, entrada));
    },
  );

  app.post<{ Body: CuerpoPesoDeCaptura }>(
    '/api/captura/v1/peso',
    { schema: { body: PesoDeCaptura }, attachValidation: true },
    async (request): Promise<RespuestaDeCaptura> => {
      const quien = await identidad(request);
      compruebaEsquema(request);
      const entrada = pesoDesde(request.body, 'captura', reloj());
      return conAlmacenDeUsuario(quien, (almacen) => registraPeso(almacen, entrada));
    },
  );

  app.get('/api/captura/v1/catalogo', async (request): Promise<CatalogoDeCaptura> => {
    const quien = await identidad(request);
    return conAlmacenDeUsuario(quien, catalogoDeCaptura);
  });

  app.get('/api/captura/v1/semana', async (request): Promise<LineaSemanal> => {
    const quien = await identidad(request);
    return conAlmacenDeUsuario(quien, lineaSemanal);
  });

  /**
   * Un atajo viejo o de otra versión: 426 con la dirección de reinstalación EN
   * EL CUERPO, que es lo único que Atajos deja leer. El elemento se queda en la
   * cola del teléfono hasta que se reinstale.
   */
  app.all<{ Params: { version: string } }>('/api/captura/:version/*', async (request, reply) => {
    if (request.params.version === 'v1') {
      return reply
        .code(404)
        .send({ codigo: 'no-encontrado', mensaje: 'Ruta de captura desconocida' });
    }
    const cuerpo: RespuestaDeContratoDesconocido = {
      codigo: 'contrato-desconocido',
      mensaje: `Este servidor no conoce el contrato «${request.params.version.slice(0, 12)}». Reinstala los atajos.`,
      reinstalar: atajosUrl,
    };
    return reply.code(426).send(cuerpo);
  });
}
