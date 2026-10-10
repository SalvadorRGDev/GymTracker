import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { type ServidorDePrueba, servidorDePrueba } from './prueba/servidor.js';

let s: ServidorDePrueba | undefined;
let web: string | undefined;

afterEach(async () => {
  await s?.limpia();
  if (web !== undefined) await rm(web, { recursive: true, force: true });
  s = undefined;
  web = undefined;
});

async function agotaAcceso(servidor: ServidorDePrueba, ip: string): Promise<void> {
  for (let i = 0; i < 10; i += 1) {
    await servidor.pide({
      method: 'POST',
      url: '/api/sesion/v1/entrar',
      headers: { 'x-forwarded-for': ip },
      payload: { correo: 'nadie@ejemplo.com', contrasena: 'no-es-la-buena' },
    });
  }
}

function intento(servidor: ServidorDePrueba, ip: string) {
  return servidor.pide({
    method: 'POST',
    url: '/api/sesion/v1/entrar',
    headers: { 'x-forwarded-for': ip },
    payload: { correo: 'nadie@ejemplo.com', contrasena: 'no-es-la-buena' },
  });
}

describe('proxy de confianza y límite por IP', () => {
  it('confiando en el túnel local, cada cliente real tiene su cubo', async () => {
    s = await servidorDePrueba({ trustProxy: 'loopback' });
    await agotaAcceso(s, '203.0.113.1');
    expect((await intento(s, '203.0.113.1')).statusCode).toBe(429);
    expect((await intento(s, '203.0.113.2')).statusCode).toBe(401);
  });

  it('una IP que cambia de correo en cada intento se para a los treinta por minuto', async () => {
    s = await servidorDePrueba({ trustProxy: 'loopback' });
    const conCorreo = (ip: string, correo: string) =>
      s?.pide({
        method: 'POST',
        url: '/api/sesion/v1/entrar',
        headers: { 'x-forwarded-for': ip },
        payload: { correo, contrasena: 'no-es-la-buena' },
      });
    for (let i = 0; i < 30; i += 1) {
      expect((await conCorreo('203.0.113.7', `bot${i}@ejemplo.com`))?.statusCode).toBe(401);
    }
    const siguiente = await conCorreo('203.0.113.7', 'bot30@ejemplo.com');
    expect(siguiente?.statusCode).toBe(429);
    expect(Number(siguiente?.headers['retry-after'])).toBeGreaterThan(0);
    // Otra IP no paga por ella, y la misma vuelve a pasar pasada la ventana.
    expect((await conCorreo('203.0.113.8', 'bot31@ejemplo.com'))?.statusCode).toBe(401);
    s.reloj.avanza(61_000);
    expect((await conCorreo('203.0.113.7', 'bot32@ejemplo.com'))?.statusCode).toBe(401);
  });

  it('sin confiar en nadie, X-Forwarded-For no sirve para evadir el límite', async () => {
    s = await servidorDePrueba({ trustProxy: false });
    await agotaAcceso(s, '203.0.113.1');
    expect((await intento(s, '203.0.113.2')).statusCode).toBe(429);
  });
});

describe('un solo proceso sirve la API y el cliente', () => {
  async function conCliente(): Promise<ServidorDePrueba> {
    web = await mkdtemp(join(tmpdir(), 'gymtracker-web-'));
    await mkdir(join(web, 'assets'));
    await writeFile(
      join(web, 'index.html'),
      '<!doctype html><title>GymTracker</title><div id="app"></div>',
    );
    await writeFile(join(web, 'assets', 'app-abc123.js'), 'console.log(1)');
    return servidorDePrueba({ webDir: web });
  }

  it('cualquier ruta del cliente devuelve index.html, sin caché', async () => {
    s = await conCliente();
    for (const ruta of ['/', '/resumen', '/planes/editor']) {
      const r = await s.pide({ method: 'GET', url: ruta });
      expect(r.statusCode, ruta).toBe(200);
      expect(r.body).toContain('<title>GymTracker</title>');
      expect(r.headers['cache-control']).toBe('no-cache');
    }
  });

  it('los recursos con hash se cachean para siempre', async () => {
    s = await conCliente();
    const r = await s.pide({ method: 'GET', url: '/assets/app-abc123.js' });
    expect(r.statusCode).toBe(200);
    expect(r.headers['cache-control']).toBe('public, max-age=31536000, immutable');
  });

  it('de WEB_DIR sólo sale lo que produce build:web, aunque apunte donde no debe', async () => {
    s = await conCliente();
    const raiz = web ?? expect.unreachable();
    await mkdir(join(raiz, 'datos'));
    await writeFile(join(raiz, 'datos', 'cuentas.xlsx'), 'HUELLAS-DE-CONTRASENA');
    await writeFile(join(raiz, '.env'), 'SESSION_SECRET=SECRETO-DE-PRUEBA');
    await writeFile(join(raiz, 'arranque.ts'), 'FUENTE-DEL-SERVIDOR');
    for (const url of ['/datos/cuentas.xlsx', '/.env', '/arranque.ts', '/%2eenv']) {
      const r = await s.pide({ method: 'GET', url });
      expect(r.body, url).not.toMatch(/HUELLAS|SECRETO|FUENTE/);
    }
    // Y lo que sí es del cliente sigue saliendo.
    expect((await s.pide({ method: 'GET', url: '/assets/app-abc123.js' })).body).toBe(
      'console.log(1)',
    );
    expect((await s.pide({ method: 'GET', url: '/' })).body).toContain('<title>GymTracker</title>');
  });

  it('una ruta de API desconocida sigue siendo un 404 de API, no una página', async () => {
    s = await conCliente();
    for (const [method, url] of [
      ['GET', '/api/nada'],
      ['POST', '/api/lectura/v1/nada'],
      ['GET', '/api'],
    ] as const) {
      const r = await s.pide({ method, url });
      expect(r.statusCode, url).toBe(404);
      expect(r.json()).toEqual({ codigo: 'no-encontrado', mensaje: 'Ruta desconocida' });
      expect(r.headers['cache-control']).toBe('no-store');
    }
  });

  it('cabeceras de seguridad en todo, y una política de contenido sin terceros', async () => {
    s = await conCliente();
    const r = await s.pide({ method: 'GET', url: '/' });
    expect(r.headers['x-content-type-options']).toBe('nosniff');
    expect(r.headers['x-frame-options']).toBe('DENY');
    expect(r.headers['referrer-policy']).toBe('no-referrer');
    expect(String(r.headers['content-security-policy'])).toContain("default-src 'self'");
    expect(String(r.headers['content-security-policy'])).not.toMatch(/https?:/);
  });

  it('un 500 es mudo: no enseña el error al cliente', async () => {
    s = await servidorDePrueba();
    const ana = await s.cuenta('ana@ejemplo.com');
    // Un libro borrado debajo del servidor: fallo interno, no un dato.
    await rm(join(s.deposito.directorio, `${ana.id}.xlsx`));
    const r = await s.pide({
      method: 'GET',
      url: '/api/lectura/v1/dashboard',
      headers: { cookie: ana.cookie },
    });
    expect(r.statusCode).toBe(500);
    expect(r.json()).toEqual({ codigo: 'interno', mensaje: 'Error interno' });
  });
});

describe('auditoría: segunda barrera contra CSRF y cabeceras', () => {
  it('una escritura con cookie que el navegador marca «desde otro sitio» se rechaza', async () => {
    s = await servidorDePrueba();
    const ana = await s.cuenta('ana@ejemplo.com');
    const pide = (sitio: string) =>
      s?.pide({
        method: 'POST',
        url: '/api/lectura/v1/dispositivos',
        headers: { cookie: ana.cookie, 'sec-fetch-site': sitio },
        payload: { nombre: 'iPhone' },
      });
    const ajena = await pide('cross-site');
    expect(ajena?.statusCode).toBe(403);
    expect(ajena?.json()).toMatchObject({ codigo: 'otro-sitio' });
    expect((await pide('same-origin'))?.statusCode).toBe(201);
    // Leer sigue permitido, y la captura va con portador: no aplica.
    const lectura = await s.pide({
      method: 'GET',
      url: '/api/lectura/v1/dashboard',
      headers: { cookie: ana.cookie, 'sec-fetch-site': 'cross-site' },
    });
    expect(lectura.statusCode).toBe(200);
    const portador = await s.portador(ana);
    const captura = await s.pide({
      method: 'GET',
      url: '/api/captura/v1/catalogo',
      headers: { authorization: `Bearer ${portador}`, 'sec-fetch-site': 'cross-site' },
    });
    expect(captura.statusCode).toBe(200);
  });

  it('HSTS y CORP en todas las respuestas', async () => {
    s = await servidorDePrueba();
    const r = await s.pide({ method: 'GET', url: '/api/salud' });
    expect(r.headers['strict-transport-security']).toBe('max-age=31536000');
    expect(r.headers['cross-origin-resource-policy']).toBe('same-origin');
  });
});
