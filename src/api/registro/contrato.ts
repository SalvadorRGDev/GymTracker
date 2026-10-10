import { type Static, Type } from '@sinclair/typebox';
import { Clave } from '../captura/contrato.js';
import { Uuid } from '../planes/contrato.js';

/**
 * La rutina del día para la pantalla «Registrar» (ADR-022). Es una LECTURA:
 * qué rutina toca, qué día de su ciclo y qué pide, con lo que ya se hizo, y a
 * qué fecha iría lo que se registre viendo ese día (ADR-026). La serie no guarda
 * de qué rutina salió: guarda su fecha.
 *
 * El cliente web importa de aquí sólo TIPOS (`import type`).
 */

const cerrado = { additionalProperties: false } as const;

export const ConsultaDeRutina = Type.Object(
  {
    /** La clave del entrenamiento abierto: si ya existe, manda la fecha de ese entrenamiento. */
    sesion: Type.Optional(Clave),
    /** Otra rutina publicada; sin ella, la asignada en la fecha. */
    version: Type.Optional(Uuid),
    /** Otro día de su ciclo; sin él, el que toca (o el 1 si la rutina no está asignada). */
    dia: Type.Optional(Type.String({ pattern: '^\\d{1,2}$' })),
  },
  cerrado,
);
export type ParametrosDeRutina = Static<typeof ConsultaDeRutina>;

/** Una rutina que se puede elegir: sólo versiones publicadas. */
export interface RutinaPublicada {
  readonly version_id: string;
  readonly plan_nombre: string;
  readonly numero: number;
  readonly ciclo_dias: number;
  /** La asignada en la fecha: el día que toca lo pone su ancla. */
  readonly asignada: boolean;
}

/**
 * Lo que pide la rutina ese día. Cantidades como las da el motor, en series
 * efectivas y con dos decimales; `completa` la decide el servidor.
 */
export type EntradaDelDia =
  | {
      readonly tipo: 'ejercicio';
      readonly id: string;
      readonly ejercicio: {
        readonly id: string;
        readonly nombre: string;
        /** Archivado después de publicar la rutina: no se puede registrar hasta recuperarlo. */
        readonly archivado: boolean;
      };
      readonly objetivo: string;
      /** Series efectivas de ese ejercicio en la fecha del registro. */
      readonly hechas: string;
      readonly completa: boolean;
    }
  | {
      readonly tipo: 'grupo';
      readonly id: string;
      readonly grupo: { readonly id: string; readonly nombre: string };
      readonly objetivo: string;
      /**
       * Volumen del grupo en la fecha con ejercicios que NO tienen fila propia
       * ese día: lo de la lista ya cuenta en su fila.
       */
      readonly hechas: string;
      readonly completa: boolean;
      /**
       * Los de tu catálogo que trabajan el grupo (1.00 o 0.50), sin archivados
       * y sin los que ya tienen fila propia ese día.
       */
      readonly ejercicios: readonly {
        readonly id: string;
        readonly nombre: string;
        readonly coeficiente: string;
      }[];
    };

/**
 * A qué fecha va lo que se registre viendo esta rutina y este día (ADR-026). Lo
 * decide el servidor, igual al leer que al guardar:
 *
 * - `hoy`: el día que toca, o el del entrenamiento abierto.
 * - `dia-del-ciclo`: otro día de la rutina asignada; va a la última fecha en
 *   que tocaba, nunca a una futura.
 * - `otra-rutina`: una rutina que no está asignada no tiene calendario; va a hoy.
 * - `antes-del-inicio`: ese día caería antes de que empezara la asignación: no
 *   hay fecha a la que registrarlo.
 */
export type DestinoDeRegistro =
  | { readonly como: 'hoy' | 'dia-del-ciclo' | 'otra-rutina'; readonly fecha: string }
  | { readonly como: 'antes-del-inicio'; readonly fecha: null; readonly desde: string };

export interface VistaDeRutina {
  readonly version_id: string;
  readonly plan_nombre: string;
  readonly numero: number;
  readonly ciclo_dias: number;
  readonly dia: number;
  /** Es la asignada y el día que toca en la fecha. */
  readonly es_la_de_hoy: boolean;
  /** Adónde va lo que se registre viendo esto. `hechas` cuenta esa fecha. */
  readonly registro: DestinoDeRegistro;
  /**
   * La fecha de cada día del ciclo (el día 1 primero), para la rutina asignada:
   * así el selector dice a qué fecha llevaría cada día antes de elegirlo. `null`
   * dentro, un día que caería antes del inicio; `null` entera, otra rutina.
   */
  readonly fechas_del_ciclo: readonly (string | null)[] | null;
  /** En el orden de la rutina. Vacía: día de descanso. */
  readonly entradas: readonly EntradaDelDia[];
  /** Hay entradas y todas llegaron a su objetivo. */
  readonly completa: boolean;
}

export interface RutinaDelDia {
  /** La fecha lógica que manda: la del entrenamiento abierto o, si no lo hay, hoy. */
  readonly fecha: string;
  /** La fecha es la del entrenamiento abierto (pasada la medianoche puede no ser hoy). */
  readonly de_entrenamiento_abierto: boolean;
  readonly rutinas: readonly RutinaPublicada[];
  /** La asignada en la fecha y el día de su ciclo que toca; `null` sin asignación. */
  readonly de_hoy: { readonly version_id: string; readonly dia: number } | null;
  /** Lo que se enseña: la de hoy u otra rutina o día elegidos. `null`: nada que enseñar. */
  readonly vista: VistaDeRutina | null;
}
