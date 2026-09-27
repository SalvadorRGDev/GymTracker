import { randomBytes } from 'node:crypto';
import { open, readFile, rename, rm, stat } from 'node:fs/promises';
import { basename, dirname } from 'node:path';
import { validaCelda } from './celdas.js';
import type { Esquema, FilaDe, Tablas } from './esquema.js';
import type { Respaldos } from './respaldo.js';
import {
  type Celda,
  ErrorDeXlsx,
  escribeLibro,
  type Hoja,
  leeLibro,
  letraDeColumna,
} from './xlsx.js';

/**
 * Un libro en disco: lectura validada, escritura atómica y el control de que
 * nadie lo editó a mano entre la carga y la escritura.
 */

export class ErrorDeConcurrencia extends Error {
  override name = 'ErrorDeConcurrencia';
}

export class ErrorDeLibroInexistente extends Error {
  override name = 'ErrorDeLibroInexistente';
}

// ── Cola por archivo ────────────────────────────────────────────────────────

/**
 * Una cola de escritura por archivo: lo único que puede corromper un libro es
 * que dos transacciones lo lean, lo cambien y lo escriban a la vez.
 */
export class ColaPorArchivo {
  private readonly colas = new Map<string, Promise<unknown>>();

  en<T>(clave: string, trabajo: () => Promise<T>): Promise<T> {
    const previa = this.colas.get(clave) ?? Promise.resolve();
    const resultado = previa.then(trabajo, trabajo);
    const encadenada = resultado.then(
      () => undefined,
      () => undefined,
    );
    this.colas.set(clave, encadenada);
    void encadenada.then(() => {
      if (this.colas.get(clave) === encadenada) this.colas.delete(clave);
    });
    return resultado;
  }
}

// ── Conversión hojas ↔ tablas ───────────────────────────────────────────────

function esFilaVacia(fila: readonly Celda[]): boolean {
  return fila.every((c) => c === null);
}

/**
 * Valida al cargar, no sólo al escribir: el error dice hoja, fila y columna.
 * Una columna o una hoja que el esquema no conoce DETIENE la carga, porque
 * ignorarla la borraría en la siguiente escritura.
 */
export function tablasDesdeHojas<E extends Esquema>(esquema: E, hojas: readonly Hoja[]): Tablas<E> {
  const conocidas = new Set(Object.keys(esquema));
  for (const hoja of hojas) {
    if (!conocidas.has(hoja.nombre)) {
      throw new ErrorDeXlsx(
        'hoja desconocida: el almacén no la escribiría y se perdería',
        hoja.nombre,
      );
    }
  }
  const salida: Record<string, Record<string, string | null>[]> = {};
  for (const [nombre, columnas] of Object.entries(esquema)) {
    const hoja = hojas.find((h) => h.nombre === nombre);
    const filas: Record<string, string | null>[] = [];
    salida[nombre] = filas;
    if (hoja === undefined || hoja.filas.length === 0) continue; // hoja nueva: aditiva, vacía
    const cabecera = hoja.filas[0] ?? [];
    const indices = new Map<string, number>();
    cabecera.forEach((titulo, j) => {
      if (titulo === null) return;
      if (!(titulo in columnas)) {
        throw new ErrorDeXlsx(`columna desconocida «${titulo}»`, nombre, 1, letraDeColumna(j));
      }
      if (indices.has(titulo))
        throw new ErrorDeXlsx(`columna repetida «${titulo}»`, nombre, 1, letraDeColumna(j));
      indices.set(titulo, j);
    });
    for (const [columna, definicion] of Object.entries(columnas)) {
      if (!indices.has(columna) && !definicion.nula) {
        throw new ErrorDeXlsx(`falta la columna obligatoria «${columna}»`, nombre, 1);
      }
    }
    hoja.filas.forEach((celdas, i) => {
      if (i === 0 || esFilaVacia(celdas)) return;
      const numero = i + 1;
      celdas.forEach((valor, j) => {
        if (valor !== null && !cabecera[j]) {
          throw new ErrorDeXlsx(
            'dato en una columna sin nombre',
            nombre,
            numero,
            letraDeColumna(j),
          );
        }
      });
      const fila: Record<string, string | null> = {};
      for (const [columna, definicion] of Object.entries(columnas)) {
        const j = indices.get(columna);
        const valor = j === undefined ? null : (celdas[j] ?? null);
        const donde = j === undefined ? null : `${letraDeColumna(j)} (${columna})`;
        if (valor === null) {
          if (!definicion.nula)
            throw new ErrorDeXlsx(`«${columna}» no puede estar vacía`, nombre, numero, donde);
        } else {
          const problema = validaCelda(definicion.tipo, valor);
          if (problema !== null) throw new ErrorDeXlsx(problema, nombre, numero, donde);
        }
        fila[columna] = valor;
      }
      filas.push(fila);
    });
  }
  return salida as unknown as Tablas<E>;
}

export function hojasDesdeTablas<E extends Esquema>(esquema: E, tablas: Tablas<E>): Hoja[] {
  return Object.entries(esquema).map(([nombre, columnas]) => {
    const titulos = Object.keys(columnas);
    const filas = (tablas[nombre as keyof E] as readonly Record<string, string | null>[]).map((f) =>
      titulos.map((t) => f[t] ?? null),
    );
    return { nombre, filas: [titulos, ...filas] };
  });
}

/** Una fila en el orden del esquema, con cada celda validada. */
export function filaValidada<D extends Esquema[string]>(
  hoja: string,
  columnas: D,
  valores: Readonly<Record<string, string | null | undefined>>,
): FilaDe<D> {
  const fila: Record<string, string | null> = {};
  for (const [columna, definicion] of Object.entries(columnas)) {
    const valor = valores[columna];
    if (valor === undefined) throw new ErrorDeXlsx(`falta «${columna}» al escribir`, hoja);
    if (valor === null) {
      if (!definicion.nula) throw new ErrorDeXlsx(`«${columna}» no puede estar vacía`, hoja);
    } else {
      const problema = validaCelda(definicion.tipo, valor);
      if (problema !== null) throw new ErrorDeXlsx(`«${columna}»: ${problema}`, hoja);
    }
    fila[columna] = valor;
  }
  for (const columna of Object.keys(valores)) {
    if (!(columna in columnas))
      throw new ErrorDeXlsx(`columna desconocida «${columna}» al escribir`, hoja);
  }
  return fila as FilaDe<D>;
}

// ── Disco ───────────────────────────────────────────────────────────────────

export interface Firma {
  readonly tamano: number;
  readonly mtimeMs: number;
  readonly inodo: number;
}

async function firmaDe(ruta: string): Promise<Firma | null> {
  try {
    const s = await stat(ruta);
    return { tamano: s.size, mtimeMs: s.mtimeMs, inodo: s.ino };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
    throw error;
  }
}

function misma(a: Firma, b: Firma): boolean {
  return a.tamano === b.tamano && a.mtimeMs === b.mtimeMs && a.inodo === b.inodo;
}

/** A un temporal, `sync()`, y renombrar: o la versión de antes o la de después. */
export async function escrituraAtomica(ruta: string, bytes: Uint8Array): Promise<void> {
  const temporal = `${ruta}.${randomBytes(6).toString('hex')}.tmp`;
  const archivo = await open(temporal, 'wx', 0o600);
  try {
    await archivo.writeFile(bytes);
    await archivo.sync();
  } finally {
    await archivo.close();
  }
  try {
    await rename(temporal, ruta);
  } catch (error) {
    await rm(temporal, { force: true });
    throw error;
  }
  const directorio = await open(dirname(ruta), 'r');
  try {
    await directorio.sync();
  } catch {
    // Algunos sistemas de archivos no admiten sync de directorios; el rename ya ocurrió.
  } finally {
    await directorio.close();
  }
}

export interface Cargado<E extends Esquema> {
  readonly tablas: Tablas<E>;
  readonly firma: Firma;
}

export class LibroEnDisco<E extends Esquema> {
  private cache: Cargado<E> | null = null;

  constructor(
    readonly ruta: string,
    private readonly esquema: E,
    private readonly compruebaAlCargar: (tablas: Tablas<E>) => void,
    private readonly respaldos: Respaldos,
  ) {}

  get nombre(): string {
    return basename(this.ruta);
  }

  /** Relee si el archivo cambió (una edición a mano se recoge sola). */
  async carga(): Promise<Cargado<E>> {
    for (let intento = 0; intento < 3; intento += 1) {
      const antes = await firmaDe(this.ruta);
      if (antes === null) throw new ErrorDeLibroInexistente(`No existe ${this.nombre}`);
      if (this.cache !== null && misma(this.cache.firma, antes)) return this.cache;
      const bytes = await readFile(this.ruta);
      const despues = await firmaDe(this.ruta);
      if (despues === null || !misma(antes, despues)) continue; // cambió mientras se leía
      let tablas: Tablas<E>;
      try {
        tablas = tablasDesdeHojas(this.esquema, leeLibro(bytes));
      } catch (error) {
        if (error instanceof ErrorDeXlsx) {
          throw new ErrorDeXlsx(`${this.nombre}: ${error.message}`);
        }
        throw error;
      }
      this.compruebaAlCargar(tablas);
      this.cache = { tablas, firma: antes };
      return this.cache;
    }
    throw new ErrorDeConcurrencia(`${this.nombre} cambia mientras se lee`);
  }

  /**
   * No se escribe encima de una edición ajena: si el archivo no es el que se
   * cargó, la petición falla y no se escribe nada.
   */
  async guarda(tablas: Tablas<E>, firmaDeCarga: Firma): Promise<void> {
    const actual = await firmaDe(this.ruta);
    if (actual === null || !misma(actual, firmaDeCarga)) {
      this.cache = null;
      throw new ErrorDeConcurrencia(
        `${this.nombre} cambió desde que se cargó (¿se editó a mano?); no se escribió nada`,
      );
    }
    await this.respaldos.copia(this.ruta);
    await escrituraAtomica(this.ruta, escribeLibro(hojasDesdeTablas(this.esquema, tablas)));
    const nueva = await firmaDe(this.ruta);
    this.cache = nueva === null ? null : { tablas, firma: nueva };
  }

  /** Crea el archivo; falla si ya existe. */
  async crea(tablas: Tablas<E>): Promise<void> {
    if ((await firmaDe(this.ruta)) !== null) {
      throw new ErrorDeConcurrencia(`${this.nombre} ya existe`);
    }
    this.compruebaAlCargar(tablas);
    await escrituraAtomica(this.ruta, escribeLibro(hojasDesdeTablas(this.esquema, tablas)));
    this.cache = null;
  }
}
