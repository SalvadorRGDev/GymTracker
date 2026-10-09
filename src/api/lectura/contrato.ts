import { type Static, Type } from '@sinclair/typebox';
import type { CatalogoBase, ReferenciaDeGrupo } from '../../catalogo/tipos.js';
import type { Nivel, TramoDeEscala } from '../escala.js';

/**
 * Contrato de lectura (`docs/07-contrato-lectura.md`). Decimales como TEXTO
 * con dos posiciones: el cliente los enseña tal cual. Nada de lo que el
 * cliente pinta se calcula en el navegador.
 */

export type { Nivel, ReferenciaDeGrupo, TramoDeEscala };

export interface Dispositivo {
  readonly id: string;
  readonly nombre: string;
  readonly emitido_en: string;
  readonly expira_en: string;
  /** `null` = todavía no se ha usado. Es lo que delata una credencial viva que nadie usa. */
  readonly ultimo_uso_en: string | null;
}

const cerrado = { additionalProperties: false } as const;
const Uuid = Type.String({
  pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
});
const Nombre = Type.String({ minLength: 1, maxLength: 60 });
const Coeficiente = Type.String({ pattern: '^\\d(?:\\.\\d{1,2})?$' });

// ── Resumen (PRINCIPAL) ─────────────────────────────────────────────────────

export interface GrupoDelDashboard {
  readonly id: string;
  readonly nombre: string;
  /** Series efectivas de la semana, como las dio el motor. */
  readonly series_efectivas: string;
  /** 0–6, decidido en el servidor con aritmética entera. El cliente NO lo recalcula. */
  readonly nivel: Nivel;
  /** Región del modelo corporal (id del catálogo base) o `null` si el grupo no tiene lugar en él. */
  readonly zona: string | null;
  /** Referencia, no objetivo ni nota (ADR-014). `null` si el grupo no es de la semilla. */
  readonly referencia: ReferenciaDeGrupo | null;
}

export interface Dashboard {
  /** Semana natural, lunes a domingo, ambos inclusive, y el hoy lógico del usuario. */
  readonly semana: { readonly desde: string; readonly hasta: string; readonly hoy: string };
  /** Todos los grupos, los de 0.00 incluidos. */
  readonly grupos: readonly GrupoDelDashboard[];
  /** Cifras de la fila de estadísticas, contadas en el servidor: el navegador no suma. */
  readonly estadisticas: {
    readonly series_efectivas: number;
    readonly sesiones: number;
    readonly grupos_sin_trabajo: number;
  };
  /** Fuente única de la leyenda del mapa muscular. */
  readonly escala: readonly TramoDeEscala[];
  readonly diagnostico: {
    readonly series_sin_mapeo: number;
    readonly series_sobre_umbral: number;
    readonly series_de_calentamiento: number;
    /** Más de una → la semana mezcla parámetros y la vista lo declara. */
    readonly versiones_de_parametros: readonly string[];
  };
  /** Lo que el servidor sabe de verdad. La web no ve la cola del teléfono: no hay «pendientes». */
  readonly frescura: { readonly ultima_serie_recibida: string | null };
  readonly catalogo: { readonly grupos: number; readonly ejercicios: number };
}

// ── Historial ───────────────────────────────────────────────────────────────

export interface SerieDelHistorial {
  readonly id: string;
  readonly orden: number;
  readonly ejercicio: string;
  readonly repeticiones: number;
  /** En libras (ADR-023). */
  readonly carga_lb: string;
  /** `null` = no hay dato (calentamiento). Nunca un cero: cero es el fallo muscular. */
  readonly rir: number | null;
  readonly es_calentamiento: boolean;
  readonly realizada_en: string;
}

/**
 * Frente a la sesión anterior de la misma área (ADR-024). Sin comparación se
 * dice por qué: nunca un cero, que significaría «igual».
 */
export type ProgresoDeSesion =
  | {
      readonly estado: 'comparada';
      /** De −10 a +10: un punto por cada 1 % de mejora media de las mejores series. */
      readonly puntos: number;
      /** El cambio medio en %, con signo y dos decimales: «+2.86», «-0.40», «0.00». */
      readonly cambio: string;
      /** Los ejercicios que estaban en las dos y se pudieron comparar. */
      readonly ejercicios: number;
      /** La fecha de la sesión con la que se compara. */
      readonly frente_a: string;
    }
  /** Hubo una anterior de su área, pero ningún ejercicio en común que comparar. */
  | { readonly estado: 'sin-comunes'; readonly frente_a: string }
  /** La primera de su área: no hay con qué comparar. */
  | { readonly estado: 'primera' }
  /** Sin series efectivas de tren superior ni inferior: no tiene área. */
  | { readonly estado: 'sin-area' };

export interface SesionDelHistorial {
  readonly id: string;
  readonly fecha_logica: string;
  readonly iniciada_en: string;
  /** `null` = sin cerrar. No se inventa una hora. */
  readonly finalizada_en: string | null;
  readonly fecha_por_confirmar: boolean;
  readonly origen: 'captura' | 'registro';
  /** Tren superior o inferior con 2/3 de sus series efectivas; si no, completo. */
  readonly area: 'superior' | 'inferior' | 'completo' | null;
  /** Como las cuenta el motor: el calentamiento y lo que pasa del umbral no cuentan. */
  readonly series_efectivas: number;
  /** Media de las cargas de las series de trabajo con carga, a la décima, en libras. */
  readonly carga_media_lb: string | null;
  readonly progreso: ProgresoDeSesion;
  readonly series: readonly SerieDelHistorial[];
}

export interface Historial {
  /** La que se devuelve: una pedida de más se acota a la última. */
  readonly pagina: number;
  /** Al menos una, aunque no haya sesiones. */
  readonly paginas: number;
  readonly total: number;
  readonly por_pagina: number;
  /** De la más reciente a la más antigua. */
  readonly sesiones: readonly SesionDelHistorial[];
}

export const ConsultaDeHistorial = Type.Object(
  { pagina: Type.Optional(Type.String({ pattern: '^[1-9]\\d{0,3}$' })) },
  cerrado,
);
export type ParametrosDeHistorial = Static<typeof ConsultaDeHistorial>;

/** Las gráficas del historial (ADR-025): las últimas semanas naturales, de la más antigua a la actual. */
export interface GraficasDelHistorial {
  readonly semanas: readonly {
    readonly desde: string;
    /** Inclusiva: el domingo. */
    readonly hasta: string;
    readonly en_curso: boolean;
  }[];
  /** La leyenda del mapa muscular: los mismos niveles y rótulos. */
  readonly escala: readonly TramoDeEscala[];
  /** Cada grupo, con sus series efectivas de cada semana, en el orden de `semanas`. */
  readonly grupos: readonly {
    readonly id: string;
    readonly nombre: string;
    readonly semanas: readonly { readonly series_efectivas: string; readonly nivel: Nivel }[];
  }[];
  /** La fuerza estimada de cada tren, en libras, una por semana. */
  readonly fuerza: readonly {
    readonly tren: 'superior' | 'inferior';
    readonly semanas: readonly {
      /** `null`: esa semana no hubo series con carga de ese tren. */
      readonly lb: string | null;
      readonly tramo: number | null;
      /** Frente a la semana anterior del tramo, en %, con signo: `"+1.85"`. */
      readonly cambio: string | null;
      readonly ejercicios: number;
    }[];
  }[];
}

// ── Catálogo ────────────────────────────────────────────────────────────────

export interface Catalogo {
  readonly grupos: readonly {
    readonly id: string;
    readonly nombre: string;
    readonly zona: string | null;
  }[];
  readonly ejercicios: readonly {
    readonly id: string;
    readonly nombre: string;
    readonly archivado: boolean;
    /** Sin grupos en la versión abierta: es el origen de «sin mapeo» en el resumen. */
    readonly sin_grupos: boolean;
    /**
     * El ejercicio del catálogo base del que sale su figura de «Ver ejemplo»,
     * por nombre; `null` si es propio o se renombró: no se le inventa una.
     */
    readonly base_id: string | null;
  }[];
  readonly parametros: {
    readonly version_id: string;
    readonly umbral_rir: number;
    readonly vigente_desde: string;
    /** Alguna sesión la fija: guardar crea una sucesora desde mañana en vez de reescribirla. */
    readonly fijada: boolean;
    readonly manana: string;
    readonly contribuciones: readonly {
      readonly ejercicio_id: string;
      readonly grupo_id: string;
      readonly coeficiente: string;
    }[];
  };
}

export const NuevoNombre = Type.Object({ nombre: Nombre }, cerrado);
export type CuerpoNuevoNombre = Static<typeof NuevoNombre>;

export const Archivo = Type.Object({ archivado: Type.Boolean() }, cerrado);
export type CuerpoArchivo = Static<typeof Archivo>;

/** Reemplaza la propuesta ENTERA: lo que no se envía desaparece de la versión nueva. */
export const PropuestaDeParametros = Type.Object(
  {
    umbral_rir: Type.Integer({ minimum: 0, maximum: 10 }),
    contribuciones: Type.Array(
      Type.Object({ ejercicio_id: Uuid, grupo_id: Uuid, coeficiente: Coeficiente }, cerrado),
      { maxItems: 5000 },
    ),
  },
  cerrado,
);
export type CuerpoPropuestaDeParametros = Static<typeof PropuestaDeParametros>;

export type Camino = 'en-sitio' | 'sucesora' | 'sin-cambios';

export interface ResultadoDeParametros {
  /** En sitio (ninguna sesión la fijaba, ADR-013) o sucesora desde mañana (ADR-003). */
  readonly camino: Camino;
  readonly version_id: string;
  readonly vigente_desde: string;
}

/** El cliente manda IDENTIFICADORES del catálogo base, nunca coeficientes. */
export const Importacion = Type.Object(
  {
    grupos: Type.Array(Type.String({ pattern: '^[a-z0-9-]{1,40}$' }), { maxItems: 100 }),
    ejercicios: Type.Array(Type.String({ pattern: '^[a-z0-9-]{1,60}$' }), { maxItems: 1000 }),
  },
  cerrado,
);
export type CuerpoImportacion = Static<typeof Importacion>;

export interface ResultadoDeImportacion {
  readonly grupos_creados: number;
  readonly grupos_reutilizados: number;
  readonly ejercicios_creados: number;
  readonly ejercicios_reutilizados: number;
  readonly contribuciones_creadas: number;
  /** Las que ya existían: un coeficiente que el usuario puso no se pisa nunca. */
  readonly contribuciones_conservadas: number;
  readonly camino: Camino;
  readonly vigente_desde: string;
}

export interface CatalogoBaseConPerfiles extends CatalogoBase {
  /** Qué ejercicios caben en cada perfil, resuelto en el servidor. */
  readonly ejercicios_por_perfil: Readonly<Record<string, readonly string[]>>;
}

// ── Dispositivos y exportación ──────────────────────────────────────────────

export const NuevoDispositivo = Type.Object(
  { nombre: Type.String({ minLength: 1, maxLength: 60 }) },
  cerrado,
);
export type CuerpoNuevoDispositivo = Static<typeof NuevoDispositivo>;

export interface Dispositivos {
  readonly dispositivos: readonly Dispositivo[];
}

export interface DispositivoEmitido {
  readonly dispositivo: Dispositivo;
  /** La ÚNICA vez que la credencial existe fuera del teléfono. No hay forma de volver a verla. */
  readonly credencial: string;
  /** Lo que el atajo «Configurar» espera en iCloud Drive/Shortcuts/SIGIR/. */
  readonly archivo: { readonly nombre: string; readonly contenido: string };
  /**
   * La dirección del archivo, y el aviso si el teléfono no va a poder usarla
   * (local o sin https). El texto es del servidor y se enseña tal cual.
   */
  readonly servidor: { readonly url: string; readonly aviso: string | null };
}

export interface Exportacion {
  readonly formato: 'sigir-exportacion';
  readonly version: 1;
  readonly exportado_en: string;
  readonly cuenta: {
    readonly correo: string;
    readonly zona_horaria: string;
    readonly creado_en: string;
  };
  /** Cada hoja del libro, fila por fila, con las cadenas tal cual. Sin hashes ni tokens. */
  readonly datos: Readonly<Record<string, readonly Readonly<Record<string, string | null>>[]>>;
}
