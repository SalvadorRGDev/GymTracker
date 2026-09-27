import { type Static, Type } from '@sinclair/typebox';

/** `/api/sesion/v1` (`docs/07-contrato-lectura.md`). */

export const Entrada = Type.Object(
  {
    correo: Type.String({ minLength: 3, maxLength: 254 }),
    contrasena: Type.String({ minLength: 1, maxLength: 1024 }),
  },
  { additionalProperties: false },
);

export type CuerpoEntrada = Static<typeof Entrada>;

export interface SesionActual {
  readonly correo: string;
  readonly zona_horaria: string;
}

/** Fallo de acceso: el mismo texto exista o no el correo. */
export const MENSAJE_DE_ACCESO_FALLIDO = 'Correo o contraseña incorrectos';
