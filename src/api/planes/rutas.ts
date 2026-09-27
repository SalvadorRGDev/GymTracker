import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ConAlmacenDeUsuario, Identidad } from '../../almacen/acceso.js';
import type { Autenticacion } from '../../auth/sesiones.js';
import { compruebaEsquema } from '../credenciales.js';
import { usuarioDeLaSesion } from '../sesion/rutas.js';
import {
  type Comparativa,
  ConsultaDeComparativa,
  ConsultaDeProyeccion,
  type CuerpoEntradas,
  type CuerpoNuevaAsignacion,
  type CuerpoNuevaVersion,
  type CuerpoNuevoPlan,
  Entradas,
  NuevaAsignacion,
  NuevaVersion,
  NuevoPlan,
  type ParametrosDeComparativa,
  type ParametrosDeProyeccion,
  type Planes,
  type Proyeccion,
  type VersionCompleta,
  type VolumenDeVersion,
} from './contrato.js';
import {
  asigna,
  comparativa,
  creaPlan,
  creaVersion,
  guardaEntradas,
  lista,
  proyeccion,
  publica,
  retiraAsignacion,
  version,
  volumenDeVersion,
} from './servicio.js';

/** `/api/planes/v1`: cookie y alcance `sesion`. El atajo no lee planes. */
export function rutasDePlanes(
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

  app.get('/api/planes/v1', async (request, reply): Promise<Planes> => {
    return conAlmacenDeUsuario(await identidad(request, reply), lista);
  });

  app.get<{ Params: { id: string } }>(
    '/api/planes/v1/versiones/:id',
    async (request, reply): Promise<VersionCompleta> => {
      const quien = await identidad(request, reply);
      return conAlmacenDeUsuario(quien, (almacen) => version(almacen, request.params.id));
    },
  );

  app.get<{ Querystring: ParametrosDeProyeccion }>(
    '/api/planes/v1/proyeccion',
    { schema: { querystring: ConsultaDeProyeccion }, attachValidation: true },
    async (request, reply): Promise<Proyeccion> => {
      const quien = await identidad(request, reply);
      compruebaEsquema(request);
      const q = request.query;
      const ventana =
        q.desde !== undefined && q.hasta !== undefined
          ? { desde: q.desde, hasta: q.hasta }
          : { desdeSemana: Number(q.desde_semana ?? '0'), semanas: Number(q.semanas ?? '4') };
      return conAlmacenDeUsuario(quien, (almacen) => proyeccion(almacen, ventana));
    },
  );

  app.get<{ Querystring: ParametrosDeComparativa }>(
    '/api/planes/v1/comparativa',
    { schema: { querystring: ConsultaDeComparativa }, attachValidation: true },
    async (request, reply): Promise<Comparativa> => {
      const quien = await identidad(request, reply);
      compruebaEsquema(request);
      const { ventanas, umbral } = request.query;
      return conAlmacenDeUsuario(quien, (almacen) =>
        comparativa(almacen, {
          ventanas: Number(ventanas ?? '8'),
          umbral: umbral === undefined ? null : Number(umbral),
        }),
      );
    },
  );

  app.get<{ Params: { id: string } }>(
    '/api/planes/v1/versiones/:id/volumen',
    async (request, reply): Promise<VolumenDeVersion> => {
      const quien = await identidad(request, reply);
      return conAlmacenDeUsuario(quien, (almacen) => volumenDeVersion(almacen, request.params.id));
    },
  );

  app.post<{ Body: CuerpoNuevoPlan }>(
    '/api/planes/v1',
    { schema: { body: NuevoPlan }, attachValidation: true },
    async (request, reply) => {
      const quien = await identidad(request, reply);
      compruebaEsquema(request);
      const creada = await conAlmacenDeUsuario(quien, (almacen) => creaPlan(almacen, request.body));
      return reply.code(201).send(creada);
    },
  );

  app.post<{ Params: { id: string }; Body: CuerpoNuevaVersion }>(
    '/api/planes/v1/:id/versiones',
    { schema: { body: NuevaVersion }, attachValidation: true },
    async (request, reply) => {
      const quien = await identidad(request, reply);
      compruebaEsquema(request);
      const creada = await conAlmacenDeUsuario(quien, (almacen) =>
        creaVersion(almacen, request.params.id, request.body),
      );
      return reply.code(201).send(creada);
    },
  );

  app.put<{ Params: { id: string }; Body: CuerpoEntradas }>(
    '/api/planes/v1/versiones/:id/entradas',
    { schema: { body: Entradas }, attachValidation: true },
    async (request, reply): Promise<VersionCompleta> => {
      const quien = await identidad(request, reply);
      compruebaEsquema(request);
      return conAlmacenDeUsuario(quien, (almacen) =>
        guardaEntradas(almacen, request.params.id, request.body),
      );
    },
  );

  app.post<{ Params: { id: string } }>(
    '/api/planes/v1/versiones/:id/publicacion',
    async (request, reply): Promise<VersionCompleta> => {
      const quien = await identidad(request, reply);
      return conAlmacenDeUsuario(quien, (almacen) => publica(almacen, request.params.id));
    },
  );

  app.post<{ Body: CuerpoNuevaAsignacion }>(
    '/api/planes/v1/asignaciones',
    { schema: { body: NuevaAsignacion }, attachValidation: true },
    async (request, reply) => {
      const quien = await identidad(request, reply);
      compruebaEsquema(request);
      const creada = await conAlmacenDeUsuario(quien, (almacen) => asigna(almacen, request.body));
      return reply.code(201).send(creada);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/planes/v1/asignaciones/:id',
    async (request, reply) => {
      const quien = await identidad(request, reply);
      await conAlmacenDeUsuario(quien, (almacen) => retiraAsignacion(almacen, request.params.id));
      return reply.code(204).send();
    },
  );
}
