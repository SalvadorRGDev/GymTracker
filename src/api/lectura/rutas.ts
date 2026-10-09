import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { ConAlmacenDeUsuario, Identidad } from '../../almacen/acceso.js';
import type { Autenticacion } from '../../auth/sesiones.js';
import { compruebaEsquema } from '../credenciales.js';
import { ErrorDeDominio, noEncontrado } from '../errores.js';
import type { LimiteDeTasa } from '../limites.js';
import { servidorPublico } from '../servidor-publico.js';
import { usuarioDeLaSesion } from '../sesion/rutas.js';
import {
  Archivo,
  type Catalogo,
  type CatalogoBaseConPerfiles,
  ConsultaDeHistorial,
  type CuerpoArchivo,
  type CuerpoImportacion,
  type CuerpoNuevoDispositivo,
  type CuerpoNuevoNombre,
  type CuerpoPropuestaDeParametros,
  type Dashboard,
  type DispositivoEmitido,
  type Dispositivos,
  type GraficasDelHistorial,
  type Historial,
  Importacion,
  NuevoDispositivo,
  NuevoNombre,
  type ParametrosDeHistorial,
  PropuestaDeParametros,
  type ResultadoDeImportacion,
  type ResultadoDeParametros,
} from './contrato.js';
import {
  archivaEjercicio,
  catalogo,
  catalogoBase,
  creaEjercicio,
  creaGrupo,
  dashboard,
  exportacion,
  graficasDelHistorial,
  guardaParametros,
  historial,
  importa,
} from './servicio.js';

/** `/api/lectura/v1`: todo con cookie y alcance `sesion`. */
export function rutasDeLectura(
  app: FastifyInstance,
  dependencias: {
    readonly autenticacion: Autenticacion;
    readonly conAlmacenDeUsuario: ConAlmacenDeUsuario;
    readonly limiteDeExportacion: LimiteDeTasa;
    readonly urlPublica: string | null;
    readonly reloj: () => Date;
  },
): void {
  const { autenticacion, conAlmacenDeUsuario, limiteDeExportacion, urlPublica, reloj } =
    dependencias;

  async function identidad(request: FastifyRequest, reply: FastifyReply): Promise<Identidad> {
    return {
      usuarioId: await usuarioDeLaSesion(request, reply, autenticacion, reloj),
      alcance: 'sesion',
    };
  }

  app.get('/api/lectura/v1/dashboard', async (request, reply): Promise<Dashboard> => {
    return conAlmacenDeUsuario(await identidad(request, reply), dashboard);
  });

  app.get<{ Querystring: ParametrosDeHistorial }>(
    '/api/lectura/v1/historial',
    { schema: { querystring: ConsultaDeHistorial }, attachValidation: true },
    async (request, reply): Promise<Historial> => {
      const quien = await identidad(request, reply);
      compruebaEsquema(request);
      const pagina = Number(request.query.pagina ?? '1');
      return conAlmacenDeUsuario(quien, (almacen) => historial(almacen, pagina));
    },
  );

  app.get(
    '/api/lectura/v1/historial/graficas',
    async (request, reply): Promise<GraficasDelHistorial> => {
      return conAlmacenDeUsuario(await identidad(request, reply), graficasDelHistorial);
    },
  );

  app.get('/api/lectura/v1/catalogo', async (request, reply): Promise<Catalogo> => {
    return conAlmacenDeUsuario(await identidad(request, reply), catalogo);
  });

  app.post<{ Body: CuerpoNuevoNombre }>(
    '/api/lectura/v1/catalogo/grupos',
    { schema: { body: NuevoNombre }, attachValidation: true },
    async (request, reply) => {
      const quien = await identidad(request, reply);
      compruebaEsquema(request);
      const grupo = await conAlmacenDeUsuario(quien, (almacen) =>
        creaGrupo(almacen, request.body.nombre),
      );
      return reply.code(201).send(grupo);
    },
  );

  app.post<{ Body: CuerpoNuevoNombre }>(
    '/api/lectura/v1/catalogo/ejercicios',
    { schema: { body: NuevoNombre }, attachValidation: true },
    async (request, reply) => {
      const quien = await identidad(request, reply);
      compruebaEsquema(request);
      const ejercicio = await conAlmacenDeUsuario(quien, (almacen) =>
        creaEjercicio(almacen, request.body.nombre),
      );
      return reply.code(201).send(ejercicio);
    },
  );

  app.put<{ Params: { id: string }; Body: CuerpoArchivo }>(
    '/api/lectura/v1/catalogo/ejercicios/:id/archivo',
    { schema: { body: Archivo }, attachValidation: true },
    async (request, reply) => {
      const quien = await identidad(request, reply);
      compruebaEsquema(request);
      await conAlmacenDeUsuario(quien, (almacen) =>
        archivaEjercicio(almacen, request.params.id, request.body.archivado),
      );
      return reply.code(204).send();
    },
  );

  app.put<{ Body: CuerpoPropuestaDeParametros }>(
    '/api/lectura/v1/catalogo/parametros',
    { schema: { body: PropuestaDeParametros }, attachValidation: true, bodyLimit: 1_048_576 },
    async (request, reply): Promise<ResultadoDeParametros> => {
      const quien = await identidad(request, reply);
      compruebaEsquema(request);
      return conAlmacenDeUsuario(quien, (almacen) => guardaParametros(almacen, request.body));
    },
  );

  app.get(
    '/api/lectura/v1/catalogo/base',
    async (request, reply): Promise<CatalogoBaseConPerfiles> => {
      await identidad(request, reply);
      return catalogoBase();
    },
  );

  app.post<{ Body: CuerpoImportacion }>(
    '/api/lectura/v1/catalogo/importa',
    { schema: { body: Importacion }, attachValidation: true },
    async (request, reply): Promise<ResultadoDeImportacion> => {
      const quien = await identidad(request, reply);
      compruebaEsquema(request);
      return conAlmacenDeUsuario(quien, (almacen) => importa(almacen, request.body));
    },
  );

  app.get('/api/lectura/v1/dispositivos', async (request, reply): Promise<Dispositivos> => {
    const { usuarioId } = await identidad(request, reply);
    return { dispositivos: await autenticacion.listaCapturas(usuarioId) };
  });

  app.post<{ Body: CuerpoNuevoDispositivo }>(
    '/api/lectura/v1/dispositivos',
    { schema: { body: NuevoDispositivo }, attachValidation: true },
    async (request, reply) => {
      const { usuarioId } = await identidad(request, reply);
      compruebaEsquema(request);
      const { dispositivo, token } = await autenticacion.emiteCaptura(
        usuarioId,
        request.body.nombre.trim(),
      );
      const servidor = servidorPublico(request, urlPublica);
      const emitido: DispositivoEmitido = {
        dispositivo,
        credencial: token,
        archivo: {
          nombre: 'credencial.json',
          contenido: `${JSON.stringify({ servidor: servidor.url, portador: token }, null, 2)}\n`,
        },
        servidor,
      };
      return reply.code(201).send(emitido);
    },
  );

  app.delete<{ Params: { id: string } }>(
    '/api/lectura/v1/dispositivos/:id',
    async (request, reply) => {
      const { usuarioId } = await identidad(request, reply);
      if (!(await autenticacion.revocaCaptura(usuarioId, request.params.id)))
        throw noEncontrado('ese dispositivo');
      return reply.code(204).send();
    },
  );

  app.get('/api/lectura/v1/exportacion', async (request, reply) => {
    const quien = await identidad(request, reply);
    const espera = limiteDeExportacion.consume(quien.usuarioId);
    if (espera !== null) {
      reply.header('retry-after', String(espera));
      throw new ErrorDeDominio(
        429,
        'limite',
        'Ya exportaste hace poco. Vuelve a intentarlo más tarde.',
        {
          reintentar_en: espera,
        },
      );
    }
    const cuenta = await autenticacion.cuenta(quien.usuarioId);
    if (cuenta === null) throw noEncontrado('esa cuenta');
    const datos = await conAlmacenDeUsuario(quien, (almacen) => exportacion(almacen, cuenta));
    reply.header(
      'content-disposition',
      `attachment; filename="sigir-${datos.exportado_en.slice(0, 10)}.json"`,
    );
    return datos;
  });
}
