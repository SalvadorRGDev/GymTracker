import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { strToU8, unzipSync, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { ErrorDeXlsx, escribeLibro, type Hoja, leeLibro, letraDeColumna } from './xlsx.js';

const DIFICILES: Hoja = {
  nombre: 'serie',
  filas: [
    ['id', 'carga_lb', 'nota', 'vacia'],
    ['a', '12.50', 'Press «banca» & <tríceps>', null],
    ['b', '0.25', '  espacios  ', null],
    ['c', '007', 'literal _x000D_ sin escapar', null],
    ['d', '1000.00', 'línea\nnueva y "comillas"', null],
    ['e', '12.5', 'ñ ü é 🏋', null],
  ],
};

function sinFilasVacias(filas: readonly (readonly (string | null)[])[]) {
  return filas.map((f) => {
    const copia = [...f];
    while (copia.length > 0 && copia[copia.length - 1] === null) copia.pop();
    return copia;
  });
}

describe('xlsx propio', () => {
  it('ida y vuelta sin cambiar un solo carácter, decimales incluidos', () => {
    const otra: Hoja = {
      nombre: 'grupo_muscular',
      filas: [
        ['id', 'nombre'],
        ['x', 'Glúteo'],
      ],
    };
    const leido = leeLibro(escribeLibro([DIFICILES, otra]));
    expect(leido.map((h) => h.nombre)).toEqual(['serie', 'grupo_muscular']);
    expect(sinFilasVacias(leido[0]?.filas ?? [])).toEqual(sinFilasVacias(DIFICILES.filas));
    expect(leido[1]?.filas).toEqual(otra.filas);
  });

  it('las columnas se nombran como en Excel', () => {
    expect([0, 25, 26, 27, 701, 702].map(letraDeColumna)).toEqual([
      'A',
      'Z',
      'AA',
      'AB',
      'ZZ',
      'AAA',
    ]);
  });

  it('escribe las celdas con formato de texto para que una edición a mano siga siendo texto', () => {
    const archivos = unzipSync(escribeLibro([DIFICILES]));
    const estilos = new TextDecoder().decode(archivos['xl/styles.xml']);
    const hoja = new TextDecoder().decode(archivos['xl/worksheets/sheet1.xml']);
    expect(estilos).toContain('numFmtId="49"');
    expect(hoja).toMatch(/<col [^>]*style="1"/);
    expect(hoja).not.toMatch(/<c [^>]*t="n"/);
  });

  function libroCon(celda: string, compartidas?: string): Uint8Array {
    const base = unzipSync(escribeLibro([{ nombre: 'h', filas: [['col'], ['x']] }]));
    const hoja = new TextDecoder()
      .decode(base['xl/worksheets/sheet1.xml'])
      .replace(/<row r="2">.*?<\/row>/, `<row r="2">${celda}</row>`);
    base['xl/worksheets/sheet1.xml'] = strToU8(hoja);
    if (compartidas !== undefined) base['xl/sharedStrings.xml'] = strToU8(compartidas);
    return zipSync(base);
  }

  it('rechaza celdas numéricas, fórmulas y booleanos diciendo hoja, fila y columna', () => {
    expect(() => leeLibro(libroCon('<c r="A2"><v>12.5</v></c>'))).toThrow(
      /hoja «h», fila 2, columna A: la celda es numérica/,
    );
    expect(() => leeLibro(libroCon('<c r="A2" t="str"><f>1+1</f><v>2</v></c>'))).toThrow(/fórmula/);
    expect(() => leeLibro(libroCon('<c r="A2" t="b"><v>1</v></c>'))).toThrow(/tipo «b»/);
    expect(() => leeLibro(libroCon('<c r="A2" t="d"><v>2026-09-26</v></c>'))).toThrow(ErrorDeXlsx);
  });

  it('lee textos compartidos y enriquecidos como los guarda Excel', () => {
    const sst =
      '<?xml version="1.0"?><sst xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><si><t>12.50</t></si><si><r><t>Pre</t></r><r><rPr><b/></rPr><t>ss</t></r><rPh><t>x</t></rPh></si></sst>';
    const leido = leeLibro(
      libroCon('<c r="A2" t="s"><v>1</v></c><c r="B2" t="s"><v>0</v></c>', sst),
    );
    expect(leido[0]?.filas[1]).toEqual(['Press', '12.50']);
  });

  it('no acepta DTD ni entidades desconocidas', () => {
    const conDtd =
      '<?xml version="1.0"?><!DOCTYPE x [<!ENTITY e "boom">]><sst xmlns="x"><si><t>&e;</t></si></sst>';
    expect(() => leeLibro(libroCon('<c r="A2" t="s"><v>0</v></c>', conDtd))).toThrow(ErrorDeXlsx);
  });

  it('un ZIP truncado no es un archivo dañado que se intenta leer: es un error', () => {
    const bytes = escribeLibro([DIFICILES]);
    expect(() => leeLibro(bytes.slice(0, bytes.length / 2))).toThrow(/ZIP dañado o truncado/);
  });

  it('se niega a escribir lo que Excel no admitiría', () => {
    expect(() => escribeLibro([{ nombre: 'a/b', filas: [] }])).toThrow(ErrorDeXlsx);
    expect(() => escribeLibro([{ nombre: 'h', filas: [['\u0001']] }])).toThrow(
      /carácter de control/,
    );
  });
});

// ── La pregunta del ADR-010: ¿lo abre una hoja de cálculo de verdad? ─────────

function hayLibreOffice(): boolean {
  return spawnSync('soffice', ['--version'], { stdio: 'ignore' }).status === 0;
}

describe.runIf(hayLibreOffice())('xlsx con LibreOffice Calc', () => {
  it('Calc abre lo que escribimos y lo que re-guarda lo leemos igual', { timeout: 120_000 }, () => {
    const dir = mkdtempSync(join(tmpdir(), 'sigir-soffice-'));
    try {
      const entrada = join(dir, 'entrada.xlsx');
      const salida = join(dir, 'salida');
      writeFileSync(entrada, escribeLibro([DIFICILES]));
      execFileSync(
        'soffice',
        [
          `-env:UserInstallation=file://${join(dir, 'perfil')}`,
          '--headless',
          '--convert-to',
          'xlsx:Calc MS Excel 2007 XML',
          '--outdir',
          salida,
          entrada,
        ],
        { stdio: 'ignore', timeout: 110_000 },
      );
      const releido = leeLibro(readFileSync(join(salida, 'entrada.xlsx')));
      expect(releido[0]?.nombre).toBe('serie');
      // Ni un decimal cambia: «12.50» sigue siendo «12.50» y «007» sigue siendo «007».
      expect(sinFilasVacias(releido[0]?.filas ?? [])).toEqual(sinFilasVacias(DIFICILES.filas));
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
