import { type Static, Type } from '@sinclair/typebox';

/**
 * Contrato de captura (`docs/06-contrato-captura.md`). La versión va en la
 * ruta y el contrato sólo crece de forma ADITIVA: el atajo es una copia en el
 * teléfono sin canal de actualización, y cambiar el significado de un campo
 * corrompería datos en silencio (riesgo R7).
 *
 * Validación estricta: los objetos rechazan propiedades no declaradas.
 *
 * El cliente web importa de aquí sólo TIPOS (`import type`), así que el
 * navegador no arrastra nada de TypeBox.
 */

const cerrado = { additionalProperties: false } as const;

/** Clave de idempotencia generada por el cliente: un UUID o cualquier cadena aleatoria segura. */
export const Clave = Type.String({ pattern: '^[A-Za-z0-9_-]{8,64}$' });

/** ISO 8601 con zona, como lo produce «Formatear fecha» de Atajos. */
export const InstanteDelCliente = Type.String({ minLength: 16, maxLength: 40 });

/**
 * Decimal como texto. Se admite la coma porque un iPhone en español la pone al
 * convertir un número en texto; no hay separador de miles que confundir. Un
 * número JSON también se admite y se convierte con su representación exacta.
 */
export const DecimalDelCliente = Type.Union([
  Type.String({ pattern: '^\\d{1,4}(?:[.,]\\d{1,2})?$' }),
  Type.Number({ minimum: 0, maximum: 1000 }),
]);

export const Ejercicio = Type.String({ minLength: 1, maxLength: 60 });

/** Una carga en libras (ADR-023): como `DecimalDelCliente`, hasta 2500. */
export const CargaDelCliente = Type.Union([
  Type.String({ pattern: '^\\d{1,4}(?:[.,]\\d{1,2})?$' }),
  Type.Number({ minimum: 0, maximum: 2500 }),
]);

const SerieComun = {
  clave: Clave,
  ejercicio: Ejercicio,
  repeticiones: Type.Integer({ minimum: 1, maximum: 200 }),
  /** En libras (ADR-023): lo que marcan los discos. */
  carga_lb: Type.Optional(CargaDelCliente),
  /**
   * Atajos anteriores al ADR-023: la carga en kilos, que se convierte a libras
   * al llegar y la respuesta lo dice. Va una de las dos, nunca las dos: crecer
   * de forma aditiva es lo que deja seguir funcionando a un atajo sin actualizar.
   */
  carga_kg: Type.Optional(DecimalDelCliente),
  /** Obligatorio en una serie de trabajo, ausente o nulo en un calentamiento. */
  rir: Type.Optional(Type.Union([Type.Integer({ minimum: 0, maximum: 10 }), Type.Null()])),
  /** La bandera ES el atajo (o el botón) que se usó: no hay campo que olvidar. */
  calentamiento: Type.Boolean(),
};

export const SerieDeCaptura = Type.Object(
  {
    sesion: Type.Object({ clave: Clave, iniciada_en: InstanteDelCliente }, cerrado),
    serie: Type.Object({ ...SerieComun, realizada_en: InstanteDelCliente }, cerrado),
  },
  cerrado,
);

/** En la web el instante lo pone el servidor: el navegador no manda relojes. */
export const SerieDeRegistro = Type.Object(
  {
    sesion: Type.Object({ clave: Clave }, cerrado),
    serie: Type.Object(SerieComun, cerrado),
  },
  cerrado,
);

export const CierreDeCaptura = Type.Object(
  { sesion: Type.Object({ clave: Clave }, cerrado), finalizada_en: InstanteDelCliente },
  cerrado,
);

export const CierreDeRegistro = Type.Object(
  { sesion: Type.Object({ clave: Clave }, cerrado) },
  cerrado,
);

export const PesoDeCaptura = Type.Object(
  { peso_kg: DecimalDelCliente, medido_en: InstanteDelCliente },
  cerrado,
);

export const PesoDeRegistro = Type.Object({ peso_kg: DecimalDelCliente }, cerrado);

export type CuerpoSerieDeCaptura = Static<typeof SerieDeCaptura>;
export type CuerpoSerieDeRegistro = Static<typeof SerieDeRegistro>;
export type CuerpoCierreDeCaptura = Static<typeof CierreDeCaptura>;
export type CuerpoCierreDeRegistro = Static<typeof CierreDeRegistro>;
export type CuerpoPesoDeCaptura = Static<typeof PesoDeCaptura>;
export type CuerpoPesoDeRegistro = Static<typeof PesoDeRegistro>;

// ── Respuestas ──────────────────────────────────────────────────────────────

export interface VolumenDeGrupo {
  readonly grupo: string;
  /** Decimal como texto, tal cual lo dio el motor. */
  readonly series_efectivas: string;
}

/**
 * Todo lo que el atajo debe mostrar va en el cuerpo con 200: Atajos no expone
 * el código de estado. `mensaje` es lo que se enseña, palabra por palabra, en
 * la notificación del iPhone y en la pantalla «Registrar».
 */
export interface RespuestaDeCaptura {
  readonly estado: 'aceptada' | 'rechazada';
  readonly mensaje: string;
  readonly serie?: {
    readonly id: string;
    readonly orden: number;
    readonly fecha_logica: string;
    readonly fecha_por_confirmar: boolean;
  };
  /** Volumen de la semana de la sesión en los grupos del ejercicio. Ausente si no se puede decir con certeza. */
  readonly semana?: readonly VolumenDeGrupo[];
}

export interface CatalogoDeCaptura {
  readonly ejercicios: readonly { readonly nombre: string }[];
  readonly grupos: readonly { readonly nombre: string }[];
}

/** 426: el atajo pide un contrato que este servidor no conoce. */
export interface RespuestaDeContratoDesconocido {
  readonly codigo: 'contrato-desconocido';
  readonly mensaje: string;
  readonly reinstalar: string;
}

/**
 * `GET /api/captura/v1/semana` (ADR-019): la semana del plan en curso en una
 * frase, para una notificación. Calculada en el servidor; el atajo la enseña.
 */
export interface LineaSemanal {
  readonly mensaje: string;
  /** Inclusivas. `null` si hoy no rige ningún plan. */
  readonly ventana: { readonly desde: string; readonly hasta: string } | null;
}
