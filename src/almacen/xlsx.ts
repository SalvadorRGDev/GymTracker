import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';

/**
 * Lector y escritor de `.xlsx` propios, sobre `fflate` para el ZIP.
 *
 * Por qué no una librería de hojas de cálculo: todas convierten celdas «por
 * amabilidad» —`"12.50"` se vuelve `12.5`, una fecha se vuelve un `Date`, un
 * texto que parece número se vuelve `float64`— y aquí eso es exactamente la
 * corrupción silenciosa que el almacén existe para impedir (ADR-010). Toda
 * celda es TEXTO al escribir y al leer; una celda numérica, de fecha, booleana,
 * de error o con fórmula es un error con hoja, fila y columna, nunca un valor
 * que se interpreta como se pueda.
 *
 * Al escribir, las celdas y las columnas llevan formato de texto (`@`), para
 * que lo que alguien teclee después en Excel o LibreOffice se guarde como texto.
 * La compatibilidad real con una hoja de cálculo la comprueba `xlsx.test.ts`
 * abriendo y re-guardando con LibreOffice.
 */

export type Celda = string | null;

export interface Hoja {
  readonly nombre: string;
  /** Fila 0 = fila 1 de la hoja. Las celdas vacías son `null`. */
  readonly filas: readonly (readonly Celda[])[];
}

export class ErrorDeXlsx extends Error {
  override name = 'ErrorDeXlsx';
  constructor(
    mensaje: string,
    readonly hoja: string | null = null,
    readonly fila: number | null = null,
    readonly columna: string | null = null,
  ) {
    super(
      hoja === null
        ? mensaje
        : `hoja «${hoja}»${fila === null ? '' : `, fila ${fila}`}${columna === null ? '' : `, columna ${columna}`}: ${mensaje}`,
    );
  }
}

// ── Columnas ────────────────────────────────────────────────────────────────

export function letraDeColumna(indice: number): string {
  let n = indice + 1;
  let letras = '';
  while (n > 0) {
    const resto = (n - 1) % 26;
    letras = String.fromCharCode(65 + resto) + letras;
    n = Math.floor((n - 1) / 26);
  }
  return letras;
}

function indiceDeReferencia(referencia: string): { fila: number; columna: number } | null {
  const m = /^([A-Z]{1,3})(\d{1,7})$/.exec(referencia);
  if (m === null) return null;
  const [, letras = '', fila = '0'] = m;
  let columna = 0;
  for (const letra of letras) columna = columna * 26 + (letra.charCodeAt(0) - 64);
  return { fila: Number(fila), columna: columna - 1 };
}

// ── XML mínimo ──────────────────────────────────────────────────────────────

interface Nodo {
  readonly nombre: string;
  readonly atributos: ReadonlyMap<string, string>;
  readonly hijos: Nodo[];
  texto: string;
}

const ENTIDADES: Readonly<Record<string, string>> = {
  lt: '<',
  gt: '>',
  amp: '&',
  quot: '"',
  apos: "'",
};

function decodificaEntidades(texto: string): string {
  return texto.replace(/&(#x[0-9a-fA-F]+|#\d+|[a-z]+);/g, (todo, cuerpo: string) => {
    if (cuerpo.startsWith('#x')) return String.fromCodePoint(Number.parseInt(cuerpo.slice(2), 16));
    if (cuerpo.startsWith('#')) return String.fromCodePoint(Number.parseInt(cuerpo.slice(1), 10));
    const valor = ENTIDADES[cuerpo];
    if (valor === undefined) throw new ErrorDeXlsx(`entidad XML desconocida «${todo}»`);
    return valor;
  });
}

function nombreLocal(nombre: string): string {
  const dos = nombre.indexOf(':');
  return dos === -1 ? nombre : nombre.slice(dos + 1);
}

/** Árbol de un documento XML. Sin DTD ni entidades externas: se rechazan. */
function parseaXml(xml: string, parte: string): Nodo {
  const raiz: Nodo = { nombre: '#documento', atributos: new Map(), hijos: [], texto: '' };
  const pila: Nodo[] = [raiz];
  const patron =
    /<!\[CDATA\[([\s\S]*?)\]\]>|<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!([^>]*)>|<(\/?)([^\s/>]+)([^>]*?)(\/?)>|([^<]+)/g;
  for (const m of xml.matchAll(patron)) {
    const actual = pila[pila.length - 1];
    if (actual === undefined) throw new ErrorDeXlsx(`XML mal formado en ${parte}`);
    const [todo, cdata, declaracion, cierre, nombre, resto = '', autocierre, texto] = m;
    if (cdata !== undefined) {
      actual.texto += cdata;
    } else if (declaracion !== undefined) {
      throw new ErrorDeXlsx(`${parte} trae una declaración «<!${declaracion}>» que no se admite`);
    } else if (texto !== undefined) {
      actual.texto += decodificaEntidades(texto);
    } else if (nombre !== undefined) {
      if (cierre === '/') {
        if (actual.nombre !== nombreLocal(nombre))
          throw new ErrorDeXlsx(`XML mal anidado en ${parte}`);
        pila.pop();
        continue;
      }
      const atributos = new Map<string, string>();
      for (const a of resto.matchAll(/([^\s=]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) {
        atributos.set(a[1] ?? '', decodificaEntidades(a[2] ?? a[3] ?? ''));
      }
      const nodo: Nodo = { nombre: nombreLocal(nombre), atributos, hijos: [], texto: '' };
      actual.hijos.push(nodo);
      if (autocierre !== '/') pila.push(nodo);
    } else if (!todo.startsWith('<!--') && !todo.startsWith('<?')) {
      throw new ErrorDeXlsx(`XML mal formado en ${parte}`);
    }
  }
  if (pila.length !== 1) throw new ErrorDeXlsx(`XML sin cerrar en ${parte}`);
  return raiz;
}

function hijos(nodo: Nodo, nombre: string): Nodo[] {
  return nodo.hijos.filter((h) => h.nombre === nombre);
}

function hijo(nodo: Nodo, nombre: string): Nodo | undefined {
  return nodo.hijos.find((h) => h.nombre === nombre);
}

/** Texto de un `<si>` o `<is>`: los `<t>` directos y los de cada `<r>`, sin la fonética `<rPh>`. */
function textoEnriquecido(nodo: Nodo): string {
  let salida = '';
  for (const h of nodo.hijos) {
    if (h.nombre === 't') salida += h.texto;
    else if (h.nombre === 'r') salida += textoEnriquecido(h);
  }
  return decodificaEscapesOoxml(salida);
}

/** OOXML escribe caracteres de control como `_xHHHH_`, y un `_x` literal como `_x005F_x`. */
function decodificaEscapesOoxml(texto: string): string {
  return texto.replace(/_x([0-9A-Fa-f]{4})_/g, (_, hex: string) =>
    String.fromCharCode(Number.parseInt(hex, 16)),
  );
}

function atributo(nodo: Nodo, nombre: string): string | undefined {
  const directo = nodo.atributos.get(nombre);
  if (directo !== undefined) return directo;
  for (const [clave, valor] of nodo.atributos) if (nombreLocal(clave) === nombre) return valor;
  return undefined;
}

// ── Lectura ─────────────────────────────────────────────────────────────────

function resuelveDestino(destino: string): string {
  if (destino.startsWith('/')) return destino.slice(1);
  const partes = `xl/${destino}`.split('/');
  const salida: string[] = [];
  for (const p of partes) {
    if (p === '..') salida.pop();
    else if (p !== '.' && p !== '') salida.push(p);
  }
  return salida.join('/');
}

export function leeLibro(bytes: Uint8Array): Hoja[] {
  let archivos: Record<string, Uint8Array>;
  try {
    archivos = unzipSync(bytes);
  } catch {
    throw new ErrorDeXlsx('el archivo no es un .xlsx legible (ZIP dañado o truncado)');
  }
  const texto = (ruta: string): string | null => {
    const contenido = archivos[ruta];
    return contenido === undefined ? null : strFromU8(contenido);
  };

  const libroXml = texto('xl/workbook.xml');
  const relacionesXml = texto('xl/_rels/workbook.xml.rels');
  if (libroXml === null || relacionesXml === null) {
    throw new ErrorDeXlsx('al archivo le falta xl/workbook.xml: no es un libro de Excel');
  }

  const destinos = new Map<string, string>();
  const relaciones = parseaXml(relacionesXml, 'workbook.xml.rels');
  for (const raiz of hijos(relaciones, 'Relationships')) {
    for (const r of hijos(raiz, 'Relationship')) {
      const id = atributo(r, 'Id');
      const destino = atributo(r, 'Target');
      if (id !== undefined && destino !== undefined) destinos.set(id, resuelveDestino(destino));
    }
  }

  const compartidas: string[] = [];
  const compartidasXml = texto('xl/sharedStrings.xml');
  if (compartidasXml !== null) {
    const sst = hijo(parseaXml(compartidasXml, 'sharedStrings.xml'), 'sst');
    for (const si of sst === undefined ? [] : hijos(sst, 'si'))
      compartidas.push(textoEnriquecido(si));
  }

  const libro = hijo(parseaXml(libroXml, 'workbook.xml'), 'workbook');
  const hojasXml = libro === undefined ? undefined : hijo(libro, 'sheets');
  if (hojasXml === undefined) throw new ErrorDeXlsx('el libro no declara hojas');

  const salida: Hoja[] = [];
  const nombres = new Set<string>();
  for (const declaracion of hijos(hojasXml, 'sheet')) {
    const nombre = atributo(declaracion, 'name') ?? '';
    if (nombres.has(nombre)) throw new ErrorDeXlsx(`la hoja «${nombre}» está repetida`);
    nombres.add(nombre);
    const rid = atributo(declaracion, 'id');
    const ruta = rid === undefined ? undefined : destinos.get(rid);
    const hojaXml = ruta === undefined ? null : texto(ruta);
    if (hojaXml === null) throw new ErrorDeXlsx('no se encuentra el contenido de la hoja', nombre);
    salida.push({ nombre, filas: leeHoja(nombre, hojaXml, compartidas) });
  }
  return salida;
}

function leeHoja(nombre: string, xml: string, compartidas: readonly string[]): Celda[][] {
  const hoja = hijo(parseaXml(xml, `hoja ${nombre}`), 'worksheet');
  const datos = hoja === undefined ? undefined : hijo(hoja, 'sheetData');
  if (datos === undefined) return [];
  const filas: Celda[][] = [];
  let siguienteFila = 1;
  for (const fila of hijos(datos, 'row')) {
    const numero = Number(atributo(fila, 'r') ?? siguienteFila);
    if (!Number.isInteger(numero) || numero < siguienteFila) {
      throw new ErrorDeXlsx('filas desordenadas o repetidas', nombre, numero);
    }
    siguienteFila = numero + 1;
    const celdas: Celda[] = [];
    let siguienteColumna = 0;
    for (const c of hijos(fila, 'c')) {
      const referencia = atributo(c, 'r');
      const posicion = referencia === undefined ? null : indiceDeReferencia(referencia);
      const columna = posicion?.columna ?? siguienteColumna;
      if (posicion !== null && posicion.fila !== numero) {
        throw new ErrorDeXlsx(
          'la celda no pertenece a su fila',
          nombre,
          numero,
          referencia ?? null,
        );
      }
      siguienteColumna = columna + 1;
      const valor = leeCelda(c, compartidas, nombre, numero, letraDeColumna(columna));
      while (celdas.length < columna) celdas.push(null);
      celdas[columna] = valor;
    }
    while (filas.length < numero - 1) filas.push([]);
    filas[numero - 1] = celdas;
  }
  return filas;
}

function leeCelda(
  c: Nodo,
  compartidas: readonly string[],
  hoja: string,
  fila: number,
  columna: string,
): Celda {
  const tipo = atributo(c, 't') ?? 'n';
  const formula = hijo(c, 'f');
  const v = hijo(c, 'v');
  if (formula !== undefined) {
    // El spec descarta cualquier diseño que evalúe contenido del almacén.
    throw new ErrorDeXlsx(
      'la celda tiene una fórmula; el almacén sólo admite texto',
      hoja,
      fila,
      columna,
    );
  }
  let valor: string;
  switch (tipo) {
    case 's': {
      const indice = Number(v?.texto ?? '');
      const texto = compartidas[indice];
      if (!Number.isInteger(indice) || texto === undefined) {
        throw new ErrorDeXlsx('referencia a texto compartido inexistente', hoja, fila, columna);
      }
      valor = texto;
      break;
    }
    case 'inlineStr': {
      const is = hijo(c, 'is');
      valor = is === undefined ? '' : textoEnriquecido(is);
      break;
    }
    case 'n':
      if (v === undefined) return null;
      throw new ErrorDeXlsx(
        'la celda es numérica; el almacén sólo admite texto (dale formato de texto y vuelve a escribirla)',
        hoja,
        fila,
        columna,
      );
    default:
      throw new ErrorDeXlsx(
        `celda de tipo «${tipo}»; el almacén sólo admite texto`,
        hoja,
        fila,
        columna,
      );
  }
  return valor === '' ? null : valor;
}

// ── Escritura ───────────────────────────────────────────────────────────────

function escapaXml(texto: string): string {
  return texto.replace(
    /[<>&"]/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c] ?? c,
  );
}

// biome-ignore lint/suspicious/noControlCharactersInRegex: detectar esos caracteres es justo su función.
const CONTROL_INVALIDO = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/;

function escapaCelda(texto: string, hoja: string, fila: number, columna: string): string {
  if (CONTROL_INVALIDO.test(texto)) {
    throw new ErrorDeXlsx('carácter de control no representable', hoja, fila, columna);
  }
  // Un `_xHHHH_` literal se leería como escape: se protege su guion bajo.
  return escapaXml(texto.replace(/_(x[0-9A-Fa-f]{4}_)/g, '_x005F_$1'));
}

const NOMBRE_DE_HOJA_INVALIDO = /[[\]:*?/\\]/;

const ESTILOS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="49" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/><xf numFmtId="49" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;

function xmlDeHoja(hoja: Hoja): string {
  const anchoMaximo = Math.max(1, ...hoja.filas.map((f) => f.length));
  const filas = hoja.filas
    .map((fila, i) => {
      const numero = i + 1;
      const estilo = i === 0 ? 2 : 1;
      const celdas = fila
        .map((celda, j) => {
          if (celda === null || celda === '') return '';
          const columna = letraDeColumna(j);
          return `<c r="${columna}${numero}" s="${estilo}" t="inlineStr"><is><t xml:space="preserve">${escapaCelda(celda, hoja.nombre, numero, columna)}</t></is></c>`;
        })
        .join('');
      return `<row r="${numero}">${celdas}</row>`;
    })
    .join('');
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="${anchoMaximo}" width="22" style="1" customWidth="1"/></cols><sheetData>${filas}</sheetData></worksheet>`;
}

export function escribeLibro(hojas: readonly Hoja[]): Uint8Array {
  if (hojas.length === 0) throw new ErrorDeXlsx('un libro necesita al menos una hoja');
  const nombres = new Set<string>();
  for (const h of hojas) {
    if (h.nombre.length === 0 || h.nombre.length > 31 || NOMBRE_DE_HOJA_INVALIDO.test(h.nombre)) {
      throw new ErrorDeXlsx(`nombre de hoja no válido en Excel: «${h.nombre}»`);
    }
    if (nombres.has(h.nombre)) throw new ErrorDeXlsx(`hoja repetida «${h.nombre}»`);
    nombres.add(h.nombre);
  }

  const tipos = hojas
    .map(
      (_, i) =>
        `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`,
    )
    .join('');
  const archivos: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${tipos}</Types>`,
    ),
    '_rels/.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
    ),
    'xl/workbook.xml': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${hojas
        .map(
          (h, i) => `<sheet name="${escapaXml(h.nombre)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`,
        )
        .join('')}</sheets></workbook>`,
    ),
    'xl/_rels/workbook.xml.rels': strToU8(
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${hojas
        .map(
          (_, i) =>
            `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`,
        )
        .join(
          '',
        )}<Relationship Id="rId${hojas.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
    ),
    'xl/styles.xml': strToU8(ESTILOS),
  };
  hojas.forEach((h, i) => {
    archivos[`xl/worksheets/sheet${i + 1}.xml`] = strToU8(xmlDeHoja(h));
  });
  return zipSync(archivos, { level: 6 });
}
