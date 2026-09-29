import { afterEach, describe, expect, it } from 'vitest';
import { type ServidorDePrueba, servidorDePrueba } from './prueba/servidor.js';

/** Alta pública (ADR-020): abierta con tope, límites por IP y techo global. */

let s: ServidorDePrueba | undefined;

afterEach(async () => {
  await s?.limpia();
  s = undefined;
});

const CONTRASENA = 'una-contraseña-larga-y-propia';

function alta(servidor: ServidorDePrueba, cuerpo: Record<string, unknown>, ip = '198.51.100.1') {
  return servidor.pide({
    method: 'POST',
    url: '/api/sesion/v1/alta',
    headers: { 'x-forwarded-for': ip },
    payload: { contrasena: CONTRASENA, zona_horaria: 'America/Mexico_City', ...cuerpo },
  });
}

describe('POST /api/sesion/v1/alta', () => {
  it('cerrada por omisión: lo dice y no crea nada', async () => {
    s = await servidorDePrueba();
    expect((await s.pide({ method: 'GET', url: '/api/sesion/v1/alta' })).json()).toEqual({
      abierta: false,
    });
    const r = await alta(s, { correo: 'nuevo@ejemplo.com' });
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ codigo: 'alta-cerrada' });
    expect(await s.deposito.conCuentas((c) => c.lee('usuario').length)).toBe(0);
  });

  it('abierta: crea la cuenta con su libro, entra y la sesión vale', async () => {
    s = await servidorDePrueba({ maximoDeCuentas: 5 });
    const r = await alta(s, { correo: '  Nuevo@Ejemplo.com ' });
    expect(r.statusCode, r.body).toBe(201);
    const cookie = String(r.headers['set-cookie']).split(';')[0] ?? '';
    expect(cookie).toMatch(/^sigir_sesion=/);
    const actual = await s.pide({
      method: 'GET',
      url: '/api/sesion/v1/actual',
      headers: { cookie },
    });
    expect(actual.json()).toMatchObject({ correo: 'nuevo@ejemplo.com' });
    const resumen = await s.pide({
      method: 'GET',
      url: '/api/lectura/v1/dashboard',
      headers: { cookie },
    });
    expect(resumen.statusCode).toBe(200);
    expect((await s.entra('nuevo@ejemplo.com', CONTRASENA)).statusCode).toBe(204);
  });

  it('rechaza con motivo: correo, contraseña corta o con el correo dentro, zona', async () => {
    s = await servidorDePrueba({ maximoDeCuentas: 5 });
    const casos: [Record<string, unknown>, string][] = [
      [{ correo: 'sin-arroba' }, 'correo'],
      [{ correo: '"<svg/onload=alert(1)>"@x.co' }, 'correo'],
      [{ correo: 'ana<b>@ejemplo.com' }, 'correo'],
      [{ correo: 'a@ejemplo.com', contrasena: 'corta' }, 'contrasena'],
      [{ correo: 'maria@ejemplo.com', contrasena: 'soy-maria-la-del-gimnasio' }, 'contrasena'],
      [{ correo: 'b@ejemplo.com', contrasena: 'x'.repeat(129) }, 'contrasena'],
      [{ correo: 'c@ejemplo.com', zona_horaria: 'Marte/Olimpo' }, 'zona'],
    ];
    for (const [cuerpo, codigo] of casos) {
      const r = await alta(s, cuerpo, `198.51.100.${10 + casos.findIndex((c) => c[0] === cuerpo)}`);
      expect(r.statusCode, JSON.stringify(cuerpo)).toBe(422);
      expect(r.json()).toMatchObject({ codigo });
    }
    expect(await s.deposito.conCuentas((c) => c.lee('usuario').length)).toBe(0);
  });

  it('un correo ya usado no crea otra cuenta ni toca la existente', async () => {
    s = await servidorDePrueba({ maximoDeCuentas: 5 });
    await s.cuenta('ana@ejemplo.com');
    const r = await alta(s, { correo: 'ANA@ejemplo.com' });
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({ codigo: 'correo-en-uso' });
    expect(r.headers['set-cookie']).toBeUndefined();
    expect(await s.deposito.conCuentas((c) => c.lee('usuario').length)).toBe(1);
  });

  it('con el tope alcanzado se cierra, y lo dice', async () => {
    s = await servidorDePrueba({ maximoDeCuentas: 2 });
    await s.cuenta('ana@ejemplo.com');
    expect((await alta(s, { correo: 'beto@ejemplo.com' })).statusCode).toBe(201);
    expect((await s.pide({ method: 'GET', url: '/api/sesion/v1/alta' })).json()).toEqual({
      abierta: false,
    });
    const r = await alta(s, { correo: 'carla@ejemplo.com' }, '198.51.100.2');
    expect(r.statusCode).toBe(403);
    expect(r.json()).toMatchObject({ codigo: 'alta-completa' });
  });

  it('tres altas por IP y hora, y un techo global de diez aunque cambien las IP', async () => {
    s = await servidorDePrueba({ maximoDeCuentas: 100 });
    for (let i = 0; i < 3; i += 1) {
      expect((await alta(s, { correo: `ip${i}@ejemplo.com` }, '203.0.113.9')).statusCode).toBe(201);
    }
    const cuarta = await alta(s, { correo: 'ip3@ejemplo.com' }, '203.0.113.9');
    expect(cuarta.statusCode).toBe(429);
    expect(Number(cuarta.headers['retry-after'])).toBeGreaterThan(0);
    for (let i = 0; i < 7; i += 1) {
      expect(
        (await alta(s, { correo: `g${i}@ejemplo.com` }, `203.0.113.${20 + i}`)).statusCode,
      ).toBe(201);
    }
    expect((await alta(s, { correo: 'g7@ejemplo.com' }, '203.0.113.99')).statusCode).toBe(429);
    s.reloj.avanza(3_600_001);
    expect((await alta(s, { correo: 'g8@ejemplo.com' }, '203.0.113.99')).statusCode).toBe(201);
  });
});
