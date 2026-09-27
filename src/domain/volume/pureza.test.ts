import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * El motor es puro: no menciona reloj, azar ni entorno, y no importa nada de
 * fuera de su directorio. Una regla escrita que nada comprueba es falsa el día
 * que alguien escriba el cambio.
 */

const DIRECTORIO = import.meta.dirname;

const PROHIBIDO: readonly [RegExp, string][] = [
  [/\bDate\s*\.\s*now\b/, 'Date.now'],
  [/\bnew\s+Date\b/, 'new Date'],
  [/\bDate\s*\(/, 'Date()'],
  [/\bMath\s*\.\s*random\b/, 'Math.random'],
  [/\bprocess\b/, 'process'],
  [/\bperformance\b/, 'performance'],
  [/\bcrypto\b/, 'crypto'],
  [/\bglobalThis\b/, 'globalThis'],
  [/\brequire\s*\(/, 'require'],
  [/\bfetch\s*\(/, 'fetch'],
  [/\bsetTimeout\b|\bsetInterval\b/, 'temporizadores'],
  [/\bIntl\b/, 'Intl (zona y configuración regional son entorno)'],
];

function fuentes(): { nombre: string; texto: string }[] {
  return readdirSync(DIRECTORIO)
    .filter((nombre) => nombre.endsWith('.ts') && !nombre.endsWith('.test.ts'))
    .map((nombre) => ({ nombre, texto: readFileSync(join(DIRECTORIO, nombre), 'utf8') }));
}

function sinComentarios(texto: string): string {
  return texto.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

describe('pureza del motor', () => {
  it('encuentra los módulos que vigila (un control que no ve nada no controla)', () => {
    const nombres = fuentes().map((f) => f.nombre);
    expect(nombres).toEqual(
      expect.arrayContaining([
        'agrega.ts',
        'centesimas.ts',
        'fecha-logica.ts',
        'plan.ts',
        'tipos.ts',
      ]),
    );
  });

  it('no importa nada de fuera de su directorio', () => {
    for (const { nombre, texto } of fuentes()) {
      const especificadores = [...texto.matchAll(/\bfrom\s+['"]([^'"]+)['"]/g)].map((m) => m[1]);
      const dinamicos = [...texto.matchAll(/\bimport\s*\(\s*['"]([^'"]+)['"]/g)].map((m) => m[1]);
      for (const especificador of [...especificadores, ...dinamicos]) {
        expect(especificador, `${nombre} importa ${especificador}`).toMatch(/^\.\/[a-z-]+\.js$/);
      }
    }
  });

  it('no menciona reloj, azar ni entorno', () => {
    for (const { nombre, texto } of fuentes()) {
      const codigo = sinComentarios(texto);
      for (const [patron, que] of PROHIBIDO) {
        expect(patron.test(codigo), `${nombre} usa ${que}`).toBe(false);
      }
    }
  });

  it('el detector detecta: una fuente con reloj no pasaría', () => {
    const trampa = sinComentarios('export const hoy = () => new Date(); // sólo prueba');
    expect(PROHIBIDO.some(([patron]) => patron.test(trampa))).toBe(true);
  });
});
