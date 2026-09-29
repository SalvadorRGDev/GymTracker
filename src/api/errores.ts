/**
 * Errores con significado HTTP. Un rechazo de dominio se decide con una
 * consulta ANTES de escribir y sale con su código; cualquier otra cosa es un
 * 500 mudo para el cliente.
 */

export class ErrorDeDominio extends Error {
  override name = 'ErrorDeDominio';
  constructor(
    readonly estado: 400 | 401 | 403 | 404 | 409 | 422 | 426 | 429,
    readonly codigo: string,
    mensaje: string,
    readonly extra: Readonly<Record<string, unknown>> = {},
  ) {
    super(mensaje);
  }
}

/** Recurso ajeno o inexistente: siempre 404, nunca 403 (un 403 confirma que existe). */
export function noEncontrado(que: string): ErrorDeDominio {
  return new ErrorDeDominio(404, 'no-encontrado', `No existe ${que}`);
}

export function conflicto(codigo: string, mensaje: string): ErrorDeDominio {
  return new ErrorDeDominio(409, codigo, mensaje);
}

export function invalido(codigo: string, mensaje: string): ErrorDeDominio {
  return new ErrorDeDominio(422, codigo, mensaje);
}

export const MENSAJE_SIN_SESION = 'Hace falta iniciar sesión';
export const MENSAJE_SIN_CREDENCIAL = 'Credencial de captura inválida, caducada o revocada';
