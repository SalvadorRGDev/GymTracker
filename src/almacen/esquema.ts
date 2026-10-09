import { librasDesdeKilosEnTexto } from '../domain/volume/index.js';
import type { TipoDeCelda } from './celdas.js';

/**
 * Definición única de las hojas: nombre, columnas en orden, tipo de celda y si
 * admite vacío. De aquí salen el lector, el escritor, la validación al cargar y
 * los tipos de fila que usan los servicios, así que una columna mal escrita en
 * un servicio es un error de compilación.
 *
 * Los nombres de columna son los del modelo relacional (`docs/02-modelo-datos.md`):
 * volver a SQLite o PostgreSQL sería reescribir consultas, no rediseñar.
 */

export interface Columna<Nula extends boolean = boolean> {
  readonly tipo: TipoDeCelda;
  readonly nula: Nula;
}

function columna(tipo: TipoDeCelda): Columna<false> & { readonly nula_: Columna<true> } {
  return { tipo, nula: false, nula_: { tipo, nula: true } };
}

const uuid = columna({ tipo: 'uuid' });
const clave = columna({ tipo: 'clave' });
const fecha = columna({ tipo: 'fecha' });
const instante = columna({ tipo: 'instante' });
const booleano = columna({ tipo: 'booleano' });
const texto = (maximo: number) => columna({ tipo: 'texto', maximo });
const entero = (minimo: number, maximo: number) => columna({ tipo: 'entero', minimo, maximo });
const decimal = (minimo: string, maximo: string, minimoExcluido: boolean) =>
  columna({ tipo: 'decimal', minimo, maximo, minimoExcluido });
const enumerado = (...valores: string[]) => columna({ tipo: 'enumerado', valores });

// Un `Columna<false>` con `nula_` no es un `Columna` limpio: se reduce aquí.
function c<N extends boolean>(col: Columna<N>): Columna<N> {
  return { tipo: col.tipo, nula: col.nula };
}

export type Esquema = Readonly<Record<string, Readonly<Record<string, Columna>>>>;

/** Los libros de cada propietario: `<uuid>.xlsx`. Once hojas. */
export const LIBRO = {
  grupo_muscular: {
    id: c(uuid),
    propietario_id: c(uuid),
    nombre: c(texto(60)),
    creado_en: c(instante),
  },
  ejercicio: {
    id: c(uuid),
    propietario_id: c(uuid),
    nombre: c(texto(60)),
    archivado_en: c(instante.nula_),
    creado_en: c(instante),
  },
  version_parametros: {
    id: c(uuid),
    propietario_id: c(uuid),
    umbral_rir: c(entero(0, 10)),
    vigente_desde: c(fecha),
    vigente_hasta: c(fecha.nula_),
    creado_en: c(instante),
  },
  contribucion_muscular: {
    id: c(uuid),
    propietario_id: c(uuid),
    version_parametros_id: c(uuid),
    ejercicio_id: c(uuid),
    grupo_muscular_id: c(uuid),
    coeficiente: c(decimal('0.00', '2.00', true)),
  },
  plan: {
    id: c(uuid),
    propietario_id: c(uuid),
    nombre: c(texto(80)),
    creado_en: c(instante),
  },
  plan_version: {
    id: c(uuid),
    propietario_id: c(uuid),
    plan_id: c(uuid),
    numero: c(entero(1, 9999)),
    ciclo_dias: c(entero(1, 28)),
    copiada_de: c(uuid.nula_),
    publicada_en: c(instante.nula_),
    creado_en: c(instante),
  },
  plan_entrada: {
    id: c(uuid),
    propietario_id: c(uuid),
    plan_version_id: c(uuid),
    dia: c(entero(1, 28)),
    ejercicio_id: c(uuid.nula_),
    grupo_muscular_id: c(uuid.nula_),
    objetivo: c(decimal('0.00', '100.00', true)),
  },
  plan_asignacion: {
    id: c(uuid),
    propietario_id: c(uuid),
    plan_version_id: c(uuid),
    vigente_desde: c(fecha),
    vigente_hasta: c(fecha.nula_),
    creado_en: c(instante),
  },
  sesion: {
    id: c(uuid),
    propietario_id: c(uuid),
    clave_idempotencia: c(clave),
    fecha_logica: c(fecha),
    version_parametros_id: c(uuid),
    iniciada_en: c(instante),
    finalizada_en: c(instante.nula_),
    fecha_por_confirmar: c(booleano),
    origen: c(enumerado('captura', 'registro')),
    registrado_en: c(instante),
  },
  serie: {
    id: c(uuid),
    propietario_id: c(uuid),
    sesion_id: c(uuid),
    clave_idempotencia: c(clave),
    orden: c(entero(1, 9999)),
    ejercicio_id: c(uuid),
    repeticiones: c(entero(1, 200)),
    /** En libras (ADR-023): lo que marcan los discos y la columna de placas. */
    carga_lb: c(decimal('0.00', '2500.00', false)),
    rir: c(entero(0, 10).nula_),
    es_calentamiento: c(booleano),
    realizada_en: c(instante),
    registrado_en: c(instante),
  },
  medicion_corporal: {
    id: c(uuid),
    propietario_id: c(uuid),
    fecha_logica: c(fecha),
    peso_kg: c(decimal('20.00', '400.00', false)),
    origen: c(enumerado('captura', 'registro')),
    registrado_en: c(instante),
  },
} as const satisfies Esquema;

/**
 * Una columna que cambió de nombre, y quizá de unidad. Un libro anterior la trae
 * con el nombre viejo: se lee con el nuevo y el valor convertido, y la siguiente
 * escritura lo deja ya en la forma nueva —con su respaldo previo, como toda
 * escritura—. Que traiga las dos a la vez detiene la carga: no se sabría cuál vale.
 */
export interface Renombrada {
  readonly de: string;
  readonly a: string;
  /** Del valor viejo al nuevo. Lanza si el viejo no es válido. */
  readonly convierte: (valor: string) => string;
}

export type Renombradas = Readonly<Record<string, readonly Renombrada[]>>;

/** ADR-023: las cargas pasaron de kilos a libras, con el factor exacto. */
export const RENOMBRADAS_DEL_LIBRO: Renombradas = {
  serie: [{ de: 'carga_kg', a: 'carga_lb', convierte: librasDesdeKilosEnTexto }],
};

/** `cuentas.xlsx`: identidad y credenciales. Lo único compartido entre personas. */
export const CUENTAS = {
  usuario: {
    id: c(uuid),
    correo: c(columna({ tipo: 'correo' })),
    hash_contrasena: c(columna({ tipo: 'hash' })),
    zona_horaria: c(columna({ tipo: 'zona' })),
    creado_en: c(instante),
  },
  token_sesion: {
    id: c(uuid),
    usuario_id: c(uuid),
    huella: c(columna({ tipo: 'huella' })),
    emitido_en: c(instante),
    expira_en: c(instante),
    renovado_en: c(instante),
  },
  token_captura: {
    id: c(uuid),
    usuario_id: c(uuid),
    huella: c(columna({ tipo: 'huella' })),
    nombre: c(texto(60)),
    emitido_en: c(instante),
    expira_en: c(instante),
    ultimo_uso_en: c(instante.nula_),
  },
} as const satisfies Esquema;

export type HojaDeLibro = keyof typeof LIBRO;
export type HojaDeCuentas = keyof typeof CUENTAS;

export type FilaDe<D extends Readonly<Record<string, Columna>>> = {
  -readonly [K in keyof D]: D[K]['nula'] extends true ? string | null : string;
};

export type Fila<H extends HojaDeLibro> = FilaDe<(typeof LIBRO)[H]>;
export type FilaDeCuentas<H extends HojaDeCuentas> = FilaDe<(typeof CUENTAS)[H]>;

export type Tablas<E extends Esquema> = { [H in keyof E]: readonly FilaDe<E[H]>[] };
export type TablasDeLibro = Tablas<typeof LIBRO>;
export type TablasDeCuentas = Tablas<typeof CUENTAS>;

export const HOJAS_DE_LIBRO = Object.keys(LIBRO) as HojaDeLibro[];
export const HOJAS_DE_CUENTAS = Object.keys(CUENTAS) as HojaDeCuentas[];

export function tablasVacias<E extends Esquema>(esquema: E): Tablas<E> {
  return Object.fromEntries(Object.keys(esquema).map((h) => [h, []])) as unknown as Tablas<E>;
}

// ── Alcances ────────────────────────────────────────────────────────────────

export type Alcance = 'sesion' | 'captura';
export type Operacion = 'leer' | 'insertar' | 'actualizar' | 'borrar';

export interface Permiso {
  readonly operaciones: readonly Operacion[];
  /** Si existe, sólo se ven las filas escritas (`registrado_en`) en los últimos N días. */
  readonly ventanaDias?: number;
}

/**
 * Qué puede hacer cada alcance en cada hoja, escrito por AFIRMACIÓN. Una hoja
 * sin entrada no la ve nadie, y un alcance sin entrada en una hoja no la ve:
 * añadir una hoja y olvidarse de esta tabla falla cerrado, no abierto.
 *
 * `captura` (los atajos) escribe sesiones, series y mediciones; lee catálogo,
 * parámetros y sus propias escrituras de los últimos treinta días; no lee
 * planes, no exporta y no borra nada (ADR-009).
 */
export const ALCANCE_DE_HOJA: {
  readonly [H in HojaDeLibro]?: { readonly [A in Alcance]?: Permiso };
} = {
  grupo_muscular: {
    sesion: { operaciones: ['leer', 'insertar', 'actualizar'] },
    captura: { operaciones: ['leer'] },
  },
  ejercicio: {
    sesion: { operaciones: ['leer', 'insertar', 'actualizar'] },
    captura: { operaciones: ['leer'] },
  },
  version_parametros: {
    sesion: { operaciones: ['leer', 'insertar', 'actualizar'] },
    captura: { operaciones: ['leer'] },
  },
  contribucion_muscular: {
    sesion: { operaciones: ['leer', 'insertar', 'actualizar', 'borrar'] },
    captura: { operaciones: ['leer'] },
  },
  // `captura` sólo LEE el plan, para la línea semanal del atajo (ADR-019).
  plan: {
    sesion: { operaciones: ['leer', 'insertar', 'actualizar'] },
    captura: { operaciones: ['leer'] },
  },
  plan_version: {
    sesion: { operaciones: ['leer', 'insertar', 'actualizar'] },
    captura: { operaciones: ['leer'] },
  },
  plan_entrada: {
    sesion: { operaciones: ['leer', 'insertar', 'actualizar', 'borrar'] },
    captura: { operaciones: ['leer'] },
  },
  plan_asignacion: {
    sesion: { operaciones: ['leer', 'insertar', 'actualizar', 'borrar'] },
    captura: { operaciones: ['leer'] },
  },
  sesion: {
    sesion: { operaciones: ['leer', 'insertar', 'actualizar', 'borrar'] },
    captura: { operaciones: ['leer', 'insertar', 'actualizar'], ventanaDias: 30 },
  },
  serie: {
    sesion: { operaciones: ['leer', 'insertar', 'borrar'] },
    captura: { operaciones: ['leer', 'insertar'], ventanaDias: 30 },
  },
  medicion_corporal: {
    sesion: { operaciones: ['leer', 'insertar', 'actualizar'] },
    captura: { operaciones: ['leer', 'insertar', 'actualizar'], ventanaDias: 30 },
  },
};

/** Columnas que pone el almacén, nunca el cliente ni el servicio. */
export const COLUMNAS_AUTOMATICAS = ['propietario_id', 'creado_en', 'registrado_en'] as const;
