import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Las reglas de la capa de aplicación, comprobadas sobre el código y no
 * confiadas a la revisión. Límite declarado: esto lee texto; un módulo que
 * recibiera el depósito con otro nombre no lo vería.
 */

const RAIZ = join(import.meta.dirname, '..');

function archivos(directorio: string): string[] {
  return readdirSync(directorio).flatMap((nombre) => {
    const ruta = join(directorio, nombre);
    if (statSync(ruta).isDirectory()) return nombre === 'prueba' ? [] : archivos(ruta);
    return ruta.endsWith('.ts') && !ruta.endsWith('.test.ts') ? [ruta] : [];
  });
}

/** Sin comentarios: un control no debe tropezar con la documentación de la regla que vigila. */
function sinComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
}

const API = archivos(join(RAIZ, 'api')).map((ruta) => ({
  ruta: relative(RAIZ, ruta),
  texto: sinComentarios(readFileSync(ruta, 'utf8')),
}));

describe('arquitectura de la API', () => {
  it('encuentra los módulos que vigila', () => {
    expect(API.map((a) => a.ruta)).toEqual(
      expect.arrayContaining([
        'api/app.ts',
        'api/captura/rutas.ts',
        'api/registro/rutas.ts',
        'api/captura/servicio.ts',
      ]),
    );
  });

  it('ninguna ruta ni la app nombran el depósito: reciben funciones ya enlazadas', () => {
    for (const { ruta, texto } of API) {
      expect(/\bDeposito\b|\bdeposito\b/.test(texto), ruta).toBe(false);
    }
  });

  it('el alcance es un literal fijado por la ruta, nunca algo que llegue en la petición', () => {
    for (const { ruta, texto } of API.filter((a) => a.ruta.endsWith('rutas.ts'))) {
      const alcances = [...texto.matchAll(/alcance:\s*([^,}\n]+)/g)].map((m) => m[1]?.trim());
      for (const alcance of alcances)
        expect(["'sesion'", "'captura'"], `${ruta}: ${alcance}`).toContain(alcance);
      if (ruta === 'api/captura/rutas.ts') expect(alcances).toEqual(["'captura'"]);
      else
        expect(
          alcances.every((a) => a === "'sesion'"),
          ruta,
        ).toBe(true);
    }
  });

  it('sólo el servicio de captura escribe sesiones, series y mediciones: un único servicio de escritura', () => {
    const escriben = API.filter(({ texto }) =>
      /inserta\('(serie|sesion|medicion_corporal)'/.test(texto),
    ).map((a) => a.ruta);
    expect(escriben).toEqual(['api/captura/servicio.ts']);
  });

  it('las dos puertas de captura llaman a las mismas funciones', () => {
    const registro = API.find((a) => a.ruta === 'api/registro/rutas.ts')?.texto ?? '';
    const captura = API.find((a) => a.ruta === 'api/captura/rutas.ts')?.texto ?? '';
    for (const funcion of ['registraSerie', 'cierraSesion', 'registraPeso', 'catalogoDeCaptura']) {
      expect(registro, `registro usa ${funcion}`).toContain(funcion);
      expect(captura, `captura usa ${funcion}`).toContain(funcion);
    }
    expect(registro).toContain("from '../captura/servicio.js'");
  });

  it('bajo /api/captura no hay planes, exportación ni borrado', () => {
    const captura = API.find((a) => a.ruta === 'api/captura/rutas.ts')?.texto ?? '';
    const rutas = [
      ...captura.matchAll(/app\.(get|post|put|delete|all)(?:<[^>]*>)?\(\s*'([^']+)'/g),
    ].map((m) => `${m[1]} ${m[2]}`);
    expect(rutas.length).toBeGreaterThanOrEqual(5);
    for (const ruta of rutas) {
      expect(ruta.startsWith('delete'), ruta).toBe(false);
      expect(ruta, ruta).not.toMatch(/planes|exporta|borra|dispositivo/);
    }
  });

  it('nadie fuera del motor suma volumen: sólo `agrega` produce números de series', () => {
    for (const { ruta, texto } of API) {
      expect(/coeficiente\s*\*|\*\s*coeficiente/.test(texto), ruta).toBe(false);
    }
  });
});
