import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { type Cuenta, type ServidorDePrueba, servidorDePrueba } from './prueba/servidor.js';

let s: ServidorDePrueba;
let ana: Cuenta;

beforeEach(async () => {
  s = await servidorDePrueba();
  ana = await s.cuenta('ana@ejemplo.com');
});

afterEach(async () => {
  await s.limpia();
});

describe('/api/sesion/v1', () => {
  it('entrar da 204 y una cookie HttpOnly, Secure y SameSite=Strict', async () => {
    const r = await s.entra('ana@ejemplo.com');
    expect(r.statusCode).toBe(204);
    const cookie = String(r.headers['set-cookie']);
    expect(cookie).toMatch(
      /^sigir_sesion=[A-Za-z0-9_-]{43}; Max-Age=2592000; Path=\/; HttpOnly; Secure; SameSite=Strict$/,
    );
  });

  it('el mismo 401, con el mismo texto, exista o no el correo', async () => {
    const mala = await s.entra('ana@ejemplo.com', 'otra-contraseña-cualquiera');
    const nadie = await s.entra('nadie@ejemplo.com', 'otra-contraseña-cualquiera');
    expect(mala.statusCode).toBe(401);
    expect(nadie.statusCode).toBe(401);
    expect(mala.json()).toEqual(nadie.json());
  });

  it('el correo no distingue mayúsculas ni espacios', async () => {
    expect((await s.entra('  ANA@ejemplo.com ')).statusCode).toBe(204);
  });

  it('diez intentos por minuto por cuenta e IP; el undécimo espera', async () => {
    s.reloj.avanza(61_000); // el alta del arnés ya entró una vez: ventana nueva
    for (let i = 0; i < 10; i += 1)
      expect((await s.entra('ana@ejemplo.com', 'mala-contraseña-12')).statusCode).toBe(401);
    const once = await s.entra('ana@ejemplo.com');
    expect(once.statusCode).toBe(429);
    expect(Number(once.headers['retry-after'])).toBeGreaterThan(0);
    s.reloj.avanza(61_000);
    expect((await s.entra('ana@ejemplo.com')).statusCode).toBe(204);
  });

  it('salir revoca en el acto y es idempotente', async () => {
    const actual = await s.pide({
      method: 'GET',
      url: '/api/sesion/v1/actual',
      headers: { cookie: ana.cookie },
    });
    expect(actual.json()).toEqual({
      correo: 'ana@ejemplo.com',
      zona_horaria: 'America/Mexico_City',
    });
    const sale = await s.pide({
      method: 'POST',
      url: '/api/sesion/v1/salir',
      headers: { cookie: ana.cookie },
    });
    expect(sale.statusCode).toBe(204);
    expect(String(sale.headers['set-cookie'])).toContain('Max-Age=0');
    expect(
      (
        await s.pide({
          method: 'GET',
          url: '/api/lectura/v1/dashboard',
          headers: { cookie: ana.cookie },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await s.pide({
          method: 'POST',
          url: '/api/sesion/v1/salir',
          headers: { cookie: ana.cookie },
        })
      ).statusCode,
    ).toBe(204);
  });

  it('la sesión se desliza a diario y caduca a los 90 días aunque se use', async () => {
    const pide = () =>
      s.pide({ method: 'GET', url: '/api/sesion/v1/actual', headers: { cookie: ana.cookie } });
    s.reloj.avanza(2 * 86_400_000);
    const renovada = await pide();
    expect(renovada.statusCode).toBe(200);
    expect(String(renovada.headers['set-cookie'])).toContain('Max-Age=2592000');
    for (let dia = 0; dia < 88; dia += 5) {
      s.reloj.avanza(5 * 86_400_000);
      await pide();
    }
    s.reloj.avanza(5 * 86_400_000); // más de 90 días desde la emisión
    expect((await pide()).statusCode).toBe(401);
  });

  it('entrar limpia las sesiones caducadas que nadie volverá a presentar, y sólo ésas', async () => {
    const filas = () => s.deposito.conCuentas((c) => c.lee('token_sesion').map((t) => t.id));
    for (let i = 0; i < 3; i += 1) await s.entra('ana@ejemplo.com'); // otros navegadores
    expect(await filas()).toHaveLength(4);
    s.reloj.avanza(31 * 86_400_000); // las cuatro caducan
    const beto = await s.cuenta('beto@ejemplo.com'); // su sesión es de ahora
    expect(await filas()).toHaveLength(1);
    s.reloj.avanza(61_000);
    expect((await s.entra('ana@ejemplo.com')).statusCode).toBe(204);
    expect(await filas()).toHaveLength(2);
    // La vigente de otra persona sigue valiendo.
    const suya = await s.pide({
      method: 'GET',
      url: '/api/sesion/v1/actual',
      headers: { cookie: beto.cookie },
    });
    expect(suya.statusCode).toBe(200);
  });

  it('una cookie inventada o caducada no autentica', async () => {
    const inventada = await s.pide({
      method: 'GET',
      url: '/api/lectura/v1/dashboard',
      headers: { cookie: 'sigir_sesion=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' },
    });
    expect(inventada.statusCode).toBe(401);
    s.reloj.avanza(31 * 86_400_000);
    expect(
      (
        await s.pide({
          method: 'GET',
          url: '/api/lectura/v1/dashboard',
          headers: { cookie: ana.cookie },
        })
      ).statusCode,
    ).toBe(401);
  });
});
