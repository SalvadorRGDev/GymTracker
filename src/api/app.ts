import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyError, type FastifyInstance } from 'fastify';
import type { ConAlmacenDeUsuario } from '../almacen/acceso.js';
import type { Autenticacion } from '../auth/sesiones.js';
import { rutasDeCaptura } from './captura/rutas.js';
import { CUERPO_ILEGIBLE } from './credenciales.js';
import { ErrorDeDominio } from './errores.js';
import { rutasDeLectura } from './lectura/rutas.js';
import { LimiteDeTasa } from './limites.js';
import { rutasDePlanes } from './planes/rutas.js';
import { rutasDeRegistro } from './registro/rutas.js';
import { rutasDeSesion } from './sesion/rutas.js';

/**
 * La aplicación HTTP. Recibe funciones ya enlazadas —la autenticación y
 * `conAlmacenDeUsuario`—, nunca el depósito: ninguna ruta tiene forma de
 * nombrar un archivo.
 */

export interface Dependencias {
  readonly autenticacion: Autenticacion;
  readonly conAlmacenDeUsuario: ConAlmacenDeUsuario;
  readonly reloj: () => Date;
}

export interface ConfiguracionDeApp {
  /**
   * Lo que diga `TRUSTED_PROXY`, nunca `true`: aceptar `X-Forwarded-For` de
   * cualquiera regala la evasión del límite de tasa.
   */
  readonly trustProxy: false | string | readonly string[];
  readonly atajosUrl: string;
  /** `URL_PUBLICA`: a dónde apunta el archivo de credencial; `null` = deducirlo. */
  readonly urlPublica: string | null;
  /** Directorio del cliente compilado; `null` si lo sirve Vite en desarrollo. */
  readonly webDir: string | null;
  readonly registro: boolean;
}

const POLITICA_DE_CONTENIDO = [
  "default-src 'self'",
  "img-src 'self' data:",
  "style-src 'self'",
  "font-src 'self'",
  "script-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join('; ');

/**
 * Lo único que sale de WEB_DIR: lo que produce `build:web`. Si WEB_DIR apuntara
 * donde no debe (la raíz del proyecto, un padre de `datos/`), un `.xlsx`, un
 * `.env` o un fuente seguirían sin salir por aquí.
 */
const RECURSO_DEL_CLIENTE = /(?:\/|\.(?:html|js|css|svg|woff2|png|ico|webmanifest))$/;

function esRutaDeApi(url: string): boolean {
  const ruta = url.split('?')[0] ?? url;
  return ruta === '/api' || ruta.startsWith('/api/');
}

export async function construyeApp(
  dependencias: Dependencias,
  configuracion: ConfiguracionDeApp,
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: configuracion.registro
      ? {
          level: 'info',
          // Sin PII: ni correo ni peso, y tampoco la IP ni el agente.
          serializers: {
            req: (req: { method: string; url: string }) => ({
              method: req.method,
              url: req.url.split('?')[0] ?? req.url,
            }),
            res: (res: { statusCode: number }) => ({ statusCode: res.statusCode }),
          },
        }
      : false,
    trustProxy:
      configuracion.trustProxy === false
        ? false
        : typeof configuracion.trustProxy === 'string'
          ? configuracion.trustProxy
          : [...configuracion.trustProxy],
    bodyLimit: 256 * 1024,
    // Sin HEAD automáticos: duplicarían cada ruta de la API sin su esquema.
    exposeHeadRoutes: false,
    ajv: {
      // Validación estricta: una propiedad no declarada se RECHAZA (no se
      // borra) y un "10" no se convierte en 10.
      customOptions: {
        removeAdditional: false,
        coerceTypes: false,
        useDefaults: false,
        allErrors: false,
      },
    },
  });

  // Un JSON ilegible (o vacío) se contesta DESPUÉS de la credencial, como un
  // esquema que no se cumple: sin credencial, 401 y nada más. El análisis sigue
  // siendo el de Fastify, con su rechazo de `__proto__` y `constructor`.
  const jsonPorOmision = app.getDefaultJsonParser('error', 'error');
  app.addContentTypeParser('application/json', { parseAs: 'string' }, (request, cuerpo, hecho) => {
    const texto = typeof cuerpo === 'string' ? cuerpo : cuerpo.toString('utf8');
    jsonPorOmision(request, texto, (error, valor) => {
      hecho(null, error === null ? valor : CUERPO_ILEGIBLE);
    });
  });

  app.setErrorHandler((error: FastifyError | Error, request, reply) => {
    if (error instanceof ErrorDeDominio) {
      const reintento = error.extra['reintentar_en'];
      if (typeof reintento === 'number') reply.header('retry-after', String(reintento));
      return reply
        .code(error.estado)
        .send({ codigo: error.codigo, mensaje: error.message, ...error.extra });
    }
    if (error.name === 'ErrorDeConcurrencia') {
      return reply.code(409).send({
        codigo: 'almacen-cambiado',
        mensaje:
          'Los datos cambiaron mientras se guardaba (¿se editó el Excel a mano?). No se guardó nada: vuelve a intentarlo.',
      });
    }
    const codigo = 'statusCode' in error ? error.statusCode : undefined;
    if (typeof codigo === 'number' && codigo >= 400 && codigo < 500) {
      return reply.code(codigo).send({ codigo: 'peticion', mensaje: 'Petición no válida' });
    }
    // Un 500 es mudo para el cliente y en el registro va sin el objeto que lo
    // provocó: sólo nombre, mensaje y traza.
    request.log.error(
      { nombre: error.name, mensaje: error.message, traza: error.stack },
      'error interno',
    );
    return reply.code(500).send({ codigo: 'interno', mensaje: 'Error interno' });
  });

  app.addHook('onSend', async (request, reply, payload) => {
    reply.header('x-content-type-options', 'nosniff');
    reply.header('referrer-policy', 'no-referrer');
    reply.header('x-frame-options', 'DENY');
    reply.header('cross-origin-opener-policy', 'same-origin');
    reply.header('permissions-policy', 'camera=(), microphone=(), geolocation=()');
    reply.header('content-security-policy', POLITICA_DE_CONTENIDO);
    if (esRutaDeApi(request.url)) reply.header('cache-control', 'no-store');
    return payload;
  });

  const { autenticacion, conAlmacenDeUsuario, reloj } = dependencias;
  const segundos = () => reloj().getTime();

  app.get('/api/salud', async () => ({ estado: 'ok' }));

  rutasDeSesion(app, {
    autenticacion,
    reloj,
    limiteDeAcceso: new LimiteDeTasa(10, 60_000, segundos),
    limiteDeAccesoPorIp: new LimiteDeTasa(30, 60_000, segundos),
  });
  rutasDeCaptura(app, {
    autenticacion,
    conAlmacenDeUsuario,
    limiteDeCaptura: new LimiteDeTasa(120, 60_000, segundos),
    atajosUrl: configuracion.atajosUrl,
    reloj,
  });
  rutasDeRegistro(app, { autenticacion, conAlmacenDeUsuario, reloj });
  rutasDeLectura(app, {
    autenticacion,
    conAlmacenDeUsuario,
    limiteDeExportacion: new LimiteDeTasa(2, 3_600_000, segundos),
    urlPublica: configuracion.urlPublica,
    reloj,
  });
  rutasDePlanes(app, { autenticacion, conAlmacenDeUsuario, reloj });

  if (configuracion.webDir !== null) {
    await app.register(fastifyStatic, {
      root: configuracion.webDir,
      prefix: '/',
      index: ['index.html'],
      // Resuelve cada archivo al pedirlo: tras un `build:web` los nombres con
      // hash cambian y una lista precalculada serviría una página en blanco.
      wildcard: true,
      allowedPath: (ruta) => RECURSO_DEL_CLIENTE.test(ruta),
      // `@fastify/static` sirve archivos ocultos por omisión; aquí no existen.
      dotfiles: 'ignore',
      setHeaders: (respuesta, ruta) => {
        respuesta.header(
          'cache-control',
          /[\\/]assets[\\/]/.test(ruta) ? 'public, max-age=31536000, immutable' : 'no-cache',
        );
      },
    });
  }

  // Cualquier ruta que no sea de la API devuelve el cliente (el enrutador vive
  // en el navegador); una ruta de API desconocida sigue siendo un 404 de API.
  app.setNotFoundHandler((request, reply) => {
    if (
      esRutaDeApi(request.url) ||
      configuracion.webDir === null ||
      (request.method !== 'GET' && request.method !== 'HEAD')
    ) {
      return reply.code(404).send({ codigo: 'no-encontrado', mensaje: 'Ruta desconocida' });
    }
    return reply.header('cache-control', 'no-cache').sendFile('index.html');
  });

  return app;
}
