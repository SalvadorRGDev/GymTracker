/**
 * La forma del catálogo base (ADR-012). Sin nada ejecutable: el cliente web
 * importa estos tipos para leer `GET /api/lectura/v1/catalogo/base`.
 */

export const EQUIPAMIENTOS = [
  'barra',
  'rack',
  'banco',
  'mancuernas',
  'polea',
  'maquina',
  'barra-dominadas',
  'paralelas',
  'kettlebell',
  'barra-z',
  'rueda',
  'banda',
  'anillas',
] as const;
export type Equipamiento = (typeof EQUIPAMIENTOS)[number];

export const PATRONES = [
  'empuje-horizontal',
  'empuje-vertical',
  'traccion-horizontal',
  'traccion-vertical',
  'sentadilla',
  'bisagra',
  'zancada',
  'aislamiento',
  'core',
  'acarreo',
] as const;
export type Patron = (typeof PATRONES)[number];

/** Los únicos coeficientes de la semilla: principal, sinergista y menor. */
export const COEFICIENTES_DE_SEMILLA = ['1.00', '0.50', '0.25'] as const;

export interface GrupoBase {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string;
}

export interface EjercicioBase {
  readonly id: string;
  /** Corto y dictable: el atajo lo resuelve por nombre EXACTO. */
  readonly nombre: string;
  /** Sinónimos de búsqueda. Viven sólo en el navegador, nunca en el almacén. */
  readonly alias: readonly string[];
  /** Todo lo que hace falta; vacío = peso corporal. */
  readonly equipamiento: readonly Equipamiento[];
  readonly patron: Patron;
  readonly unilateral: boolean;
  /** Grupo → coeficiente como cadena de dos decimales. */
  readonly coeficientes: Readonly<Record<string, string>>;
}

export interface PerfilBase {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string;
  readonly por_omision: boolean;
  readonly equipamiento: readonly Equipamiento[];
  /** Si existe, el perfil es esta lista (dentro de su equipamiento). */
  readonly seleccion?: readonly string[];
  /** Grupos sin ejercicio principal en el perfil, declarados. */
  readonly sin_cobertura: readonly string[];
}

export interface EntradaDePlantilla {
  readonly ejercicio: string;
  /** Series efectivas pedidas, decimal como cadena. */
  readonly series: string;
}

export interface DiaDePlantilla {
  readonly dia: number;
  readonly nombre: string;
  readonly entradas: readonly EntradaDePlantilla[];
}

export interface PlantillaBase {
  readonly id: string;
  readonly nombre: string;
  readonly descripcion: string;
  readonly perfil: string;
  readonly ciclo_dias: number;
  readonly dias: readonly DiaDePlantilla[];
}

export interface FuenteBase {
  readonly id: string;
  readonly cita: string;
  readonly aporta: string;
}

export type Respaldo = 'publicado' | 'propio';

export interface BandaBase {
  readonly id: string;
  readonly nombre: string;
  readonly minimo: string;
  readonly maximo: string;
  /** `publicado` = literatura; `propio` = heurística declarada como tal. */
  readonly respaldo: Respaldo;
  readonly fuentes: readonly string[];
  readonly margen: string;
}

export interface RangosBase {
  readonly fuentes: readonly FuenteBase[];
  readonly bandas: readonly BandaBase[];
  /** Grupo base → banda. */
  readonly grupos: Readonly<Record<string, string>>;
}

export interface CatalogoBase {
  readonly grupos: readonly GrupoBase[];
  readonly ejercicios: readonly EjercicioBase[];
  readonly perfiles: readonly PerfilBase[];
  readonly plantillas: readonly PlantillaBase[];
  readonly rangos: RangosBase;
}

export type EstadoDeReferencia = 'por-debajo' | 'dentro' | 'por-encima';

export interface ReferenciaDeGrupo {
  readonly banda: string;
  readonly nombre: string;
  /** Por semana, como se publica. */
  readonly minimo: string;
  readonly maximo: string;
  readonly respaldo: Respaldo;
  /** Referencia, no objetivo ni nota: dentro, por debajo o por encima. Nada más. */
  readonly estado: EstadoDeReferencia;
}
