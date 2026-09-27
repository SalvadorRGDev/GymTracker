import { describe, expect, it } from 'vitest';
import { ErrorDeConfiguracion, leeConfiguracion } from './configuracion.js';

const SECRETO = 'x'.repeat(64);

describe('leeConfiguracion', () => {
  it('por omisión escucha sólo en 127.0.0.1 y confía en el túnel local', () => {
    const c = leeConfiguracion({ SESSION_SECRET: SECRETO }, '/srv/sigir');
    expect(c).toMatchObject({
      host: '127.0.0.1',
      puerto: 3000,
      trustProxy: 'loopback',
      horasDeSesion: 720,
      datosDir: '/srv/sigir/datos',
      webDir: '/srv/sigir/dist/web',
    });
  });

  it('un secreto corto no arranca', () => {
    expect(() => leeConfiguracion({ SESSION_SECRET: 'corto' })).toThrow(ErrorDeConfiguracion);
  });

  it('abrir HOST exige declarar el proxy: degradar el límite en silencio no es una opción', () => {
    expect(() => leeConfiguracion({ SESSION_SECRET: SECRETO, HOST: '0.0.0.0' })).toThrow(
      /declara TRUSTED_PROXY/,
    );
    expect(
      leeConfiguracion({ SESSION_SECRET: SECRETO, HOST: '0.0.0.0', TRUSTED_PROXY: 'none' })
        .trustProxy,
    ).toBe(false);
    expect(
      leeConfiguracion({
        SESSION_SECRET: SECRETO,
        HOST: '0.0.0.0',
        TRUSTED_PROXY: '10.0.0.1, 10.0.0.2',
      }).trustProxy,
    ).toEqual(['10.0.0.1', '10.0.0.2']);
  });

  it('nunca confía en todos', () => {
    expect(() => leeConfiguracion({ SESSION_SECRET: SECRETO, TRUSTED_PROXY: 'true' })).toThrow(
      /no puede confiar en todos/,
    );
  });

  it('WEB_DIR vacío deja el cliente a Vite; ATAJOS_URL tiene que ser https', () => {
    expect(leeConfiguracion({ SESSION_SECRET: SECRETO, WEB_DIR: '' }).webDir).toBeNull();
    expect(() => leeConfiguracion({ SESSION_SECRET: SECRETO, ATAJOS_URL: 'http://x' })).toThrow(
      /https/,
    );
  });

  it('URL_PUBLICA es un origen https: se normaliza, y lo demás no arranca', () => {
    expect(leeConfiguracion({ SESSION_SECRET: SECRETO }).urlPublica).toBeNull();
    expect(
      leeConfiguracion({ SESSION_SECRET: SECRETO, URL_PUBLICA: ' https://Sigir.Ejemplo.ts.net/ ' })
        .urlPublica,
    ).toBe('https://sigir.ejemplo.ts.net');
    expect(
      leeConfiguracion({
        SESSION_SECRET: SECRETO,
        URL_PUBLICA: 'https://sigir.ejemplo.ts.net:8443',
      }).urlPublica,
    ).toBe('https://sigir.ejemplo.ts.net:8443');
    for (const mala of [
      'http://sigir.ejemplo.ts.net',
      'https://sigir.ejemplo.ts.net/api',
      'https://ana:clave@sigir.ejemplo.ts.net',
      'sigir.ejemplo.ts.net',
    ]) {
      expect(() => leeConfiguracion({ SESSION_SECRET: SECRETO, URL_PUBLICA: mala })).toThrow(
        /URL_PUBLICA/,
      );
    }
  });

  it('WEB_DIR no puede contener DATOS_DIR: serviría los libros a internet', () => {
    for (const [web, datos] of [
      ['.', 'datos'],
      ['/srv/sigir', '/srv/sigir/datos'],
      ['/srv/sigir/datos', '/srv/sigir/datos'],
      ['/srv', '/srv/sigir/datos/'],
    ] as const) {
      expect(
        () =>
          leeConfiguracion(
            { SESSION_SECRET: SECRETO, WEB_DIR: web, DATOS_DIR: datos },
            '/srv/sigir',
          ),
        `${web} ⊇ ${datos}`,
      ).toThrow(/WEB_DIR .* contiene DATOS_DIR/);
    }
    for (const [web, datos] of [
      ['dist/web', 'datos'],
      ['/srv/sigir/web', '/srv/sigir/web-datos'],
      ['/srv/sigir/dist/web', '/srv/sigir'],
    ] as const) {
      expect(
        leeConfiguracion({ SESSION_SECRET: SECRETO, WEB_DIR: web, DATOS_DIR: datos }, '/srv/sigir')
          .webDir,
        `${web} / ${datos}`,
      ).not.toBeNull();
    }
    expect(
      leeConfiguracion({ SESSION_SECRET: SECRETO, WEB_DIR: '', DATOS_DIR: '.' }, '/srv/sigir')
        .webDir,
    ).toBeNull();
  });

  it('junta todos los problemas en un solo error', () => {
    try {
      leeConfiguracion({ SESSION_SECRET: '', PORT: '99999', SESSION_TTL_HOURS: '0' });
      expect.unreachable();
    } catch (error) {
      expect((error as ErrorDeConfiguracion).problemas).toHaveLength(3);
    }
  });
});
