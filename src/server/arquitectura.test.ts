import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Sólo `src/almacen/` abre archivos (ADR-010), y el depósito se construye en
 * `src/server/`. Un módulo que leyera un `.xlsx` por su cuenta se saltaría el
 * alcance, el filtro por propietario, la cola y los invariantes sin que
 * ninguna otra prueba fallara.
 *
 * Límites declarados de este control: lee texto. Caza los `import`, `require`
 * y `import()` literales de `fs`, y prohíbe fuera del almacén los caminos que
 * llegan a un módulo del sistema sin nombrarlo así (`getBuiltinModule`,
 * `createRequire`, `process.binding`, `child_process`). No ve un nombre de
 * módulo armado en tiempo de ejecución (`import('node:' + x)`) ni un módulo
 * que reciba el depósito por parámetro con otro nombre.
 */

const SRC = join(import.meta.dirname, '..');

function fuentes(directorio: string): string[] {
  return readdirSync(directorio).flatMap((nombre) => {
    const ruta = join(directorio, nombre);
    if (statSync(ruta).isDirectory()) return nombre === 'prueba' ? [] : fuentes(ruta);
    return /\.tsx?$/.test(ruta) && !/\.test\.tsx?$/.test(ruta) ? [ruta] : [];
  });
}

const TODAS = fuentes(SRC).map((ruta) => ({
  ruta: relative(SRC, ruta),
  texto: readFileSync(ruta, 'utf8'),
}));

const ABRE_ARCHIVOS =
  /(?:from\s+|import\s*\(\s*|require\s*\(\s*|getBuiltinModule\s*\(\s*)['"`](?:node:)?(?:fs|fs\/promises)['"`]/;

/** Llegar a un módulo del sistema sin un `import` literal, o abrir archivos por otro proceso. */
const CAMINO_INDIRECTO =
  /\b(?:createRequire|getBuiltinModule|process\.binding)\b|['"`](?:node:)?child_process['"`]/;

describe('fronteras del almacén', () => {
  it('encuentra lo que vigila', () => {
    expect(TODAS.length).toBeGreaterThan(40);
    expect(TODAS.some((a) => a.ruta === 'almacen/libro.ts')).toBe(true);
  });

  it('sólo src/almacen/ importa fs', () => {
    const fuera = TODAS.filter(
      (a) => ABRE_ARCHIVOS.test(a.texto) && !a.ruta.startsWith('almacen/'),
    ).map((a) => a.ruta);
    expect(fuera).toEqual([]);
  });

  it('fuera de src/almacen/ nadie llega a módulos del sistema por caminos indirectos', () => {
    const fuera = TODAS.filter(
      (a) => CAMINO_INDIRECTO.test(a.texto) && !a.ruta.startsWith('almacen/'),
    ).map((a) => a.ruta);
    expect(fuera).toEqual([]);
  });

  it('el detector detecta: las formas conocidas de importar fs', () => {
    for (const trampa of [
      "import { readFile } from 'node:fs/promises';",
      'import fs from "fs";',
      "const fs = require('fs');",
      "await import('node:fs')",
      'await import(`node:fs`)',
      "export { readFile } from 'node:fs/promises';",
      "const fs = process.getBuiltinModule('node:fs');",
    ]) {
      expect(ABRE_ARCHIVOS.test(trampa), trampa).toBe(true);
    }
    for (const trampa of [
      "createRequire(import.meta.url)('fs')",
      "process.getBuiltinModule('fs')",
      "process.binding('fs')",
      "import { execFile } from 'node:child_process';",
    ]) {
      expect(CAMINO_INDIRECTO.test(trampa), trampa).toBe(true);
    }
  });

  it('el depósito sólo se construye en src/server/', () => {
    const construyen = TODAS.filter((a) => /Deposito\.abre\(/.test(a.texto)).map((a) => a.ruta);
    expect(construyen.every((r) => r.startsWith('server/'))).toBe(true);
    expect(construyen).toContain('server/compone.ts');
  });

  it('el catálogo base se importa como módulo, nunca se lee del disco', () => {
    const catalogo = TODAS.filter((a) => a.ruta.startsWith('catalogo/'));
    expect(catalogo.some((a) => /with \{ type: 'json' \}/.test(a.texto))).toBe(true);
  });

  it('el cliente web no importa código del servidor, sólo tipos de contratos', () => {
    for (const { ruta, texto } of TODAS.filter((a) => a.ruta.startsWith('web/'))) {
      for (const m of texto.matchAll(/^import\s+(type\s+)?[^'"]*from\s+['"](\.\.\/[^'"]+)['"]/gm)) {
        const [, esTipo, destino = ''] = m;
        const alServidor = /\.\.\/(api|almacen|auth|server|catalogo)\//.test(destino);
        if (!alServidor) continue;
        expect(esTipo, `${ruta} importa ${destino}`).toBeDefined();
        expect(destino, ruta).toMatch(/contrato|tipos/);
      }
    }
  });
});
