import { randomUUID } from 'node:crypto';
import Fastify, { type RouteOptions } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { rutasDeCaptura } from './captura/rutas.js';
import { rutasDeLectura } from './lectura/rutas.js';
import { LimiteDeTasa } from './limites.js';
import { rutasDePlanes } from './planes/rutas.js';
import { type Cuenta, type ServidorDePrueba, servidorDePrueba } from './prueba/servidor.js';
import { rutasDeRegistro } from './registro/rutas.js';
import { rutasDeSesion } from './sesion/rutas.js';

/**
 * La credencial se comprueba ANTES que el esquema. Contestar 400 a quien no
 * está autenticado es explicarle, campo a campo, la forma del contrato.
 */

let s: ServidorDePrueba;
let ana: Cuenta;
let portador: string;
let conEsquema: RouteOptions[] = [];

beforeAll(async () => {
  s = await servidorDePrueba();
  ana = await s.cuenta('ana@ejemplo.com');
  portador = await s.portador(ana);

  // Se registran las rutas en una instancia aparte sólo para listar sus opciones.
  const espejo = Fastify();
  const rutas: RouteOptions[] = [];
  espejo.addHook('onRoute', (r) => {
    rutas.push(r);
  });
  const dependencias = {
    autenticacion: null as never,
    conAlmacenDeUsuario: null as never,
    reloj: () => new Date(),
  };
  rutasDeSesion(espejo, {
    ...dependencias,
    limiteDeAcceso: new LimiteDeTasa(1, 1),
    limiteDeAccesoPorIp: new LimiteDeTasa(1, 1),
    alta: null,
    limiteDeAltaPorIp: new LimiteDeTasa(1, 1),
    limiteDeAltaGlobal: new LimiteDeTasa(1, 1),
  });
  rutasDeCaptura(espejo, {
    ...dependencias,
    limiteDeCaptura: new LimiteDeTasa(1, 1),
    atajosUrl: '',
  });
  rutasDeRegistro(espejo, dependencias);
  rutasDeLectura(espejo, {
    ...dependencias,
    limiteDeExportacion: new LimiteDeTasa(1, 1),
    urlPublica: null,
  });
  rutasDePlanes(espejo, dependencias);
  await espejo.ready();
  conEsquema = rutas.filter(
    (r) =>
      r.method !== 'HEAD' &&
      (r.schema?.body !== undefined || r.schema?.querystring !== undefined) &&
      // Públicas por diseño: no hay credencial que comprobar antes.
      r.url !== '/api/sesion/v1/entrar' &&
      r.url !== '/api/sesion/v1/alta',
  );
  await espejo.close();
});

afterAll(async () => {
  await s.limpia();
});

function url(ruta: RouteOptions): string {
  return ruta.url.replace(/:[a-z]+/g, randomUUID());
}

function metodo(ruta: RouteOptions): 'GET' | 'POST' | 'PUT' | 'DELETE' {
  return (Array.isArray(ruta.method) ? ruta.method[0] : ruta.method) as
    | 'GET'
    | 'POST'
    | 'PUT'
    | 'DELETE';
}

function peticionMala(ruta: RouteOptions) {
  return metodo(ruta) === 'GET'
    ? { method: metodo(ruta), url: `${url(ruta)}?campo_inventado=1` }
    : { method: metodo(ruta), url: url(ruta), payload: { campo_inventado: 1 } };
}

describe('orden de comprobaciones', () => {
  it('encuentra las rutas que vigila (un control que no ve nada no controla)', () => {
    expect(conEsquema.length).toBeGreaterThanOrEqual(18);
  });

  it('toda ruta con esquema aplaza la validación con attachValidation', () => {
    const sinAplazar = conEsquema.filter((r) => r.attachValidation !== true).map((r) => r.url);
    expect(sinAplazar).toEqual([]);
  });

  it('un JSON ilegible, vacío o con __proto__ también es 401 sin credencial; con ella, 400', async () => {
    const conCuerpo = conEsquema.filter((r) => metodo(r) !== 'GET' && r.schema?.body !== undefined);
    expect(conCuerpo.length).toBeGreaterThanOrEqual(12);
    for (const ruta of conCuerpo) {
      const esCaptura = ruta.url.startsWith('/api/captura/');
      for (const cuerpo of ['{"sesion":', '', '{"__proto__":{"x":1}}']) {
        const peticion = {
          method: metodo(ruta),
          url: url(ruta),
          headers: { 'content-type': 'application/json' },
          payload: cuerpo,
        };
        const anonima = await s.pide(peticion);
        expect(anonima.statusCode, `${metodo(ruta)} ${ruta.url} «${cuerpo}» sin credencial`).toBe(
          401,
        );
        const autenticada = await s.pide({
          ...peticion,
          headers: {
            ...peticion.headers,
            ...(esCaptura ? { authorization: `Bearer ${portador}` } : { cookie: ana.cookie }),
          },
        });
        expect(
          autenticada.statusCode,
          `${metodo(ruta)} ${ruta.url} «${cuerpo}» con credencial`,
        ).toBe(400);
        // Y dice qué pasa, no «body must be object».
        expect(autenticada.json()).toMatchObject({ mensaje: expect.stringMatching(/JSON válido/) });
      }
    }
  });

  it('entrar, que no lleva credencial, sigue contestando 400 a un JSON ilegible', async () => {
    const r = await s.pide({
      method: 'POST',
      url: '/api/sesion/v1/entrar',
      headers: { 'content-type': 'application/json' },
      payload: '{"correo":',
    });
    expect(r.statusCode).toBe(400);
  });

  it('sin credencial es 401 aunque el cuerpo esté mal; con credencial, 400', async () => {
    for (const ruta of conEsquema) {
      const esCaptura = ruta.url.startsWith('/api/captura/');
      const anonima = await s.pide(peticionMala(ruta));
      expect(anonima.statusCode, `${metodo(ruta)} ${ruta.url} sin credencial`).toBe(401);
      const autenticada = await s.pide({
        ...peticionMala(ruta),
        headers: esCaptura ? { authorization: `Bearer ${portador}` } : { cookie: ana.cookie },
      });
      expect(autenticada.statusCode, `${metodo(ruta)} ${ruta.url} con credencial`).toBe(400);
    }
  });
});
