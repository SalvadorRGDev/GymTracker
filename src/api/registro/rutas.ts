import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ConAlmacenDeUsuario, Identidad } from '../../almacen/acceso.js';
import type { Autenticacion } from '../../auth/sesiones.js';
import { fechaLogica } from '../../domain/volume/index.js';
import {
  type CatalogoDeCaptura,
  CierreDeRegistro,
  type CuerpoCierreDeRegistro,
  type CuerpoPesoDeRegistro,
  type CuerpoSerieDeRegistro,
  PesoDeRegistro,
  type RespuestaDeCaptura,
  SerieDeRegistro,
} from '../captura/contrato.js';
import { pesoDesde, serieDesdeRegistro } from '../captura/entrada.js';
import {
  borraSerie,
  borraSesion,
  catalogoDeCaptura,
  cierraSesion,
  confirmaFecha,
  registraPeso,
  registraSerie,
} from '../captura/servicio.js';
import { compruebaEsquema } from '../credenciales.js';
import { noEncontrado } from '../errores.js';
import { usuarioDeLaSesion } from '../sesion/rutas.js';
import { ConsultaDeRutina, type ParametrosDeRutina, type RutinaDelDia } from './contrato.js';
import { destinoDeRegistro, rutinaDelDia } from './rutina.js';

/**
 * `/api/registro/v1`: la pantalla «Registrar» del cliente web (ADR-011).
 * Llama a LAS MISMAS funciones que la captura; cambian la credencial (cookie)
 * y el alcance (`sesion`), nunca la lógica. Aquí, y sólo aquí, se borra o se
 * confirma lo capturado: a la vista, desde el historial.
 */
export function rutasDeRegistro(
  app: FastifyInstance,
  dependencias: {
    readonly autenticacion: Autenticacion;
    readonly conAlmacenDeUsuario: ConAlmacenDeUsuario;
    readonly reloj: () => Date;
  },
): void {
  const { autenticacion, conAlmacenDeUsuario, reloj } = dependencias;

  async function identidad(request: FastifyRequest, reply: FastifyReply): Promise<Identidad> {
    return {
      usuarioId: await usuarioDeLaSesion(request, reply, autenticacion, reloj),
      alcance: 'sesion',
    };
  }

  app.post<{ Body: CuerpoSerieDeRegistro }>(
    '/api/registro/v1/serie',
    { schema: { body: SerieDeRegistro }, attachValidation: true },
    async (request, reply): Promise<RespuestaDeCaptura> => {
      const quien = await identidad(request, reply);
      compruebaEsquema(request);
      const entrada = serieDesdeRegistro(request.body, reloj());
      const { rutina } = request.body;
      return conAlmacenDeUsuario(quien, (almacen): RespuestaDeCaptura => {
        if (rutina === undefined) return registraSerie(almacen, entrada);
        // ADR-026: el día elegido de la rutina manda la fecha, calculada aquí
        // con la misma función que la lectura que vio la pantalla.
        const destino = destinoDeRegistro(almacen, {
          ...(rutina.sesion === undefined ? {} : { sesion: rutina.sesion }),
          ...(rutina.version === undefined ? {} : { version: rutina.version }),
          ...(rutina.dia === undefined ? {} : { dia: Number(rutina.dia) }),
        });
        if (destino.fecha === null) {
          return {
            estado: 'rechazada',
            mensaje: `Ese día de la rutina caería antes del ${destino.desde}, cuando empezó: no hay fecha a la que registrarlo. No se guardó nada.`,
          };
        }
        return registraSerie(almacen, {
          ...entrada,
          sesion: { ...entrada.sesion, fecha: fechaLogica(destino.fecha) },
        });
      });
    },
  );

  app.post<{ Body: CuerpoCierreDeRegistro }>(
    '/api/registro/v1/sesion/cerrar',
    { schema: { body: CierreDeRegistro }, attachValidation: true },
    async (request, reply): Promise<RespuestaDeCaptura> => {
      const quien = await identidad(request, reply);
      compruebaEsquema(request);
      const clave = request.body.sesion.clave;
      return conAlmacenDeUsuario(quien, (almacen) =>
        cierraSesion(almacen, { clave, finalizadaEn: reloj() }),
      );
    },
  );

  app.post<{ Body: CuerpoPesoDeRegistro }>(
    '/api/registro/v1/peso',
    { schema: { body: PesoDeRegistro }, attachValidation: true },
    async (request, reply): Promise<RespuestaDeCaptura> => {
      const quien = await identidad(request, reply);
      compruebaEsquema(request);
      const entrada = pesoDesde(request.body, 'registro', reloj());
      return conAlmacenDeUsuario(quien, (almacen) => registraPeso(almacen, entrada));
    },
  );

  // La rutina del día (ADR-022): qué toca y cuánto va hecho. Sólo lee.
  app.get<{ Querystring: ParametrosDeRutina }>(
    '/api/registro/v1/rutina',
    { schema: { querystring: ConsultaDeRutina }, attachValidation: true },
    async (request, reply): Promise<RutinaDelDia> => {
      const quien = await identidad(request, reply);
      compruebaEsquema(request);
      const { sesion, version, dia } = request.query;
      return conAlmacenDeUsuario(quien, (almacen) =>
        rutinaDelDia(almacen, {
          ...(sesion === undefined ? {} : { sesion }),
          ...(version === undefined ? {} : { version }),
          ...(dia === undefined ? {} : { dia: Number(dia) }),
        }),
      );
    },
  );

  app.get('/api/registro/v1/catalogo', async (request, reply): Promise<CatalogoDeCaptura> => {
    const quien = await identidad(request, reply);
    return conAlmacenDeUsuario(quien, catalogoDeCaptura);
  });

  app.delete<{ Params: { id: string } }>('/api/registro/v1/serie/:id', async (request, reply) => {
    const quien = await identidad(request, reply);
    const borrada = await conAlmacenDeUsuario(quien, (almacen) =>
      borraSerie(almacen, request.params.id),
    );
    if (!borrada) throw noEncontrado('esa serie');
    return reply.code(204).send();
  });

  app.delete<{ Params: { id: string } }>('/api/registro/v1/sesion/:id', async (request, reply) => {
    const quien = await identidad(request, reply);
    const borrada = await conAlmacenDeUsuario(quien, (almacen) =>
      borraSesion(almacen, request.params.id),
    );
    if (!borrada) throw noEncontrado('esa sesión');
    return reply.code(204).send();
  });

  app.post<{ Params: { id: string } }>(
    '/api/registro/v1/sesion/:id/confirmacion',
    async (request, reply) => {
      const quien = await identidad(request, reply);
      const confirmada = await conAlmacenDeUsuario(quien, (almacen) =>
        confirmaFecha(almacen, request.params.id),
      );
      if (!confirmada) throw noEncontrado('esa sesión');
      return reply.code(204).send();
    },
  );
}
