import { type Static, Type } from '@sinclair/typebox';
import type { ReferenciaDeGrupo } from '../../catalogo/tipos.js';

/**
 * Contrato de planes (`docs/08-contrato-planes.md`). Códigos de rechazo:
 * `no-encontrado`, `publicada`, `vacia`, `borrador`, `solape`,
 * `cubre-sesiones`, `ciclo`, `destino`, `duplicado`, `referencia`,
 * `archivado`, `ventana`.
 */

const cerrado = { additionalProperties: false } as const;
const Uuid = Type.String({
  pattern: '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$',
});
const Fecha = Type.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' });
const Ciclo = Type.Integer({ minimum: 1, maximum: 28 });

export interface VersionResumida {
  readonly id: string;
  readonly numero: number;
  readonly ciclo_dias: number;
  readonly copiada_de: string | null;
  /** `null` = borrador. Publicar es irreversible. */
  readonly publicada_en: string | null;
  readonly entradas: number;
}

export interface Asignacion {
  readonly id: string;
  readonly plan_id: string;
  readonly plan_version_id: string;
  /** Ancla: el día 1 del ciclo. */
  readonly vigente_desde: string;
  /** Exclusiva. */
  readonly vigente_hasta: string | null;
  /** Si ya cubre sesiones registradas, no se re-apunta, no se mueve y no se retira. */
  readonly cubre_sesiones: boolean;
}

export interface Planes {
  readonly hoy: string;
  readonly planes: readonly {
    readonly id: string;
    readonly nombre: string;
    readonly versiones: readonly VersionResumida[];
  }[];
  readonly asignaciones: readonly Asignacion[];
}

export interface EntradaDeVersion {
  readonly id: string;
  readonly dia: number;
  readonly ejercicio_id: string | null;
  readonly grupo_id: string | null;
  readonly objetivo: string;
}

export interface VersionCompleta extends VersionResumida {
  readonly plan_id: string;
  readonly plan_nombre: string;
  readonly lista_de_entradas: readonly EntradaDeVersion[];
}

export const NuevoPlan = Type.Object(
  { nombre: Type.String({ minLength: 1, maxLength: 80 }), ciclo_dias: Ciclo },
  cerrado,
);
export type CuerpoNuevoPlan = Static<typeof NuevoPlan>;

export const NuevaVersion = Type.Object(
  { copiar_de: Type.Optional(Uuid), ciclo_dias: Type.Optional(Ciclo) },
  cerrado,
);
export type CuerpoNuevaVersion = Static<typeof NuevaVersion>;

/** Reemplaza la versión ENTERA: lo que no se envía desaparece. */
export const Entradas = Type.Object(
  {
    ciclo_dias: Type.Optional(Ciclo),
    entradas: Type.Array(
      Type.Object(
        {
          dia: Type.Integer({ minimum: 1, maximum: 28 }),
          ejercicio_id: Type.Optional(Uuid),
          grupo_id: Type.Optional(Uuid),
          objetivo: Type.String({ pattern: '^\\d{1,3}(?:\\.\\d{1,2})?$' }),
        },
        cerrado,
      ),
      { maxItems: 600 },
    ),
  },
  cerrado,
);
export type CuerpoEntradas = Static<typeof Entradas>;

export const NuevaAsignacion = Type.Object({ version_id: Uuid, desde: Fecha }, cerrado);
export type CuerpoNuevaAsignacion = Static<typeof NuevaAsignacion>;

/** Semanas relativas a la de hoy, o fechas explícitas (≤ 370 días). */
export const ConsultaDeProyeccion = Type.Object(
  {
    desde_semana: Type.Optional(Type.String({ pattern: '^-?\\d{1,2}$' })),
    semanas: Type.Optional(Type.String({ pattern: '^\\d{1,2}$' })),
    desde: Type.Optional(Fecha),
    hasta: Type.Optional(Fecha),
  },
  cerrado,
);
export type ParametrosDeProyeccion = Static<typeof ConsultaDeProyeccion>;

export interface GrupoProyectado {
  readonly id: string;
  readonly nombre: string;
  readonly series: string;
}

export interface SemanaProyectada {
  readonly desde: string;
  /** Inclusiva: el domingo. */
  readonly hasta: string;
  /** Sin ningún día con plan asignado. La vista dice que no hay plan; no enseña ceros. */
  readonly sin_plan: boolean;
  readonly grupos: readonly GrupoProyectado[];
  readonly entradas_sin_mapeo: number;
}

export interface Proyeccion {
  readonly hoy: string;
  readonly parametros: {
    readonly version_id: string;
    readonly umbral_rir: number;
    readonly vigente_desde: string;
  };
  readonly semanas: readonly SemanaProyectada[];
}

export interface GrupoSimulado {
  readonly id: string;
  readonly nombre: string;
  /** Media semanal sobre el mínimo común múltiplo del ciclo y la semana. */
  readonly series_por_semana: string;
  /** Total exacto de esa ventana. */
  readonly total: string;
  /** Decidida con aritmética entera sobre el total, nunca sobre la media redondeada. */
  readonly referencia: ReferenciaDeGrupo | null;
}

/** Lo que una versión pediría si se asignara. Simulación: no escribe nada. */
export interface VolumenDeVersion {
  readonly version_id: string;
  readonly ciclo_dias: number;
  readonly semanas_de_la_ventana: number;
  readonly grupos: readonly GrupoSimulado[];
  readonly entradas_sin_mapeo: number;
}

// ── Comparativa (fase 3) ────────────────────────────────────────────────────

/** Las `ventanas` más recientes (1–52); `umbral` simula otro umbral de RIR sin escribir. */
export const ConsultaDeComparativa = Type.Object(
  {
    ventanas: Type.Optional(Type.String({ pattern: '^\\d{1,2}$' })),
    umbral: Type.Optional(Type.String({ pattern: '^(?:10|\\d)$' })),
  },
  cerrado,
);
export type ParametrosDeComparativa = Static<typeof ConsultaDeComparativa>;

/**
 * Lo decide el servidor. `pendiente` es el déficit de una semana que no ha
 * terminado: todavía no es déficit.
 */
export type EstadoDeComparacion = 'deficit' | 'pendiente' | 'en-plan' | 'superavit';

export interface GrupoComparado {
  readonly id: string;
  readonly nombre: string;
  readonly planeado: string;
  readonly ejecutado: string;
  /** Ejecutado menos planeado, con el signo siempre escrito: «+2.00», «-1.50», «0.00». */
  readonly delta: string;
  readonly estado: EstadoDeComparacion;
}

export interface CantidadDeGrupo {
  readonly id: string;
  readonly nombre: string;
  readonly series: string;
}

/** Un día de la ventana: detalle de DESPLAZAMIENTO, no de incumplimiento. */
export interface DiaComparado {
  readonly fecha: string;
  readonly dia_del_ciclo: number;
  /** Todavía no ha llegado. */
  readonly futuro: boolean;
  readonly planeado: readonly CantidadDeGrupo[];
  readonly ejecutado: readonly CantidadDeGrupo[];
}

export interface VersionDeParametrosCitada {
  readonly id: string;
  readonly vigente_desde: string;
  readonly umbral_rir: number;
}

export interface VentanaComparada {
  readonly desde: string;
  /** Inclusiva: el último día de la ventana. */
  readonly hasta: string;
  /** 7, o menos si la asignación se cerró a mitad de semana. */
  readonly dias: number;
  /** Semana del plan, contada desde el ancla. */
  readonly numero: number;
  /** La ventana incluye días que aún no han llegado. */
  readonly en_curso: boolean;
  /** El plan vigente ENTONCES, no el de hoy. */
  readonly plan: {
    readonly asignacion_id: string;
    readonly version_id: string;
    readonly nombre: string;
    readonly numero_de_version: number;
    readonly ciclo_dias: number;
    /** Día 1 del ciclo. */
    readonly ancla: string;
  };
  /** De los dos lados. Más de una se declara: la ventana mezcla reglas. */
  readonly versiones_de_parametros: readonly VersionDeParametrosCitada[];
  /** Entradas del plan cuyo ejercicio no aporta a ningún grupo: no suman nada. */
  readonly entradas_sin_mapeo: number;
  /** Series efectivas cuyo ejercicio no aporta a ningún grupo. */
  readonly series_sin_mapeo: number;
  /** Sólo los grupos con algo en un lado o en el otro. */
  readonly grupos: readonly GrupoComparado[];
  readonly detalle: readonly DiaComparado[];
}

export interface VigilanciaDelUmbral {
  readonly desde: string;
  /** Inclusiva: hoy. */
  readonly hasta: string;
  readonly efectivas: number;
  readonly en_la_franja: number;
  /** Con un decimal, redondeado a la mitad par; `null` sin efectivas. */
  readonly porcentaje: string | null;
  /** Convenciones declaradas: el 15 % y el mínimo de efectivas. */
  readonly disparador: number;
  readonly minimo: number;
  readonly pide_sensibilidad: boolean;
  /** Los umbrales que rigieron las series del periodo. */
  readonly umbrales: readonly number[];
}

export interface Comparativa {
  readonly hoy: string;
  /** `null`: con los umbrales de verdad. Con número: simulación, no escribe nada. */
  readonly simulacion: { readonly umbral_rir: number } | null;
  /** De la más antigua a la más reciente. Vacía: ningún plan asignado hasta hoy. */
  readonly ventanas: readonly VentanaComparada[];
  readonly vigilancia: VigilanciaDelUmbral;
}
