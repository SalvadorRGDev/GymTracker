/**
 * Todas las peticiones del cliente. `credentials: 'same-origin'` siempre: el
 * token vive en una cookie HttpOnly que este código ni lee ni guarda.
 *
 * Cualquier 401 de un recurso autenticado devuelve la aplicación al acceso:
 * seguir pintando una vista con la sesión caducada enseñaría datos viejos
 * como si vivieran.
 */

export class ErrorDeApi extends Error {
  override name = 'ErrorDeApi';
  constructor(
    readonly estado: number,
    readonly codigo: string,
    mensaje: string,
    readonly cuerpo: unknown,
  ) {
    super(mensaje);
  }
}

let alPerderLaSesion: () => void = () => undefined;

export function alCaducarLaSesion(accion: () => void): void {
  alPerderLaSesion = accion;
}

type Metodo = 'GET' | 'POST' | 'PUT' | 'DELETE';

export interface OpcionesDePeticion {
  /** El 401 de «entrar» es un fallo de credenciales, no una sesión caducada. */
  readonly sinRedirigir?: boolean;
}

export async function pide<T>(
  metodo: Metodo,
  url: string,
  cuerpo?: unknown,
  opciones: OpcionesDePeticion = {},
): Promise<T> {
  let respuesta: Response;
  try {
    respuesta = await fetch(url, {
      method: metodo,
      credentials: 'same-origin',
      headers: cuerpo === undefined ? {} : { 'content-type': 'application/json' },
      ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }),
    });
  } catch {
    throw new ErrorDeApi(0, 'red', 'No hay conexión con el servidor. ¿Está encendido?', null);
  }
  const texto = respuesta.status === 204 ? '' : await respuesta.text();
  let datos: unknown = null;
  if (texto !== '') {
    try {
      datos = JSON.parse(texto);
    } catch {
      datos = null;
    }
  }
  if (respuesta.status === 401 && opciones.sinRedirigir !== true) {
    alPerderLaSesion();
  }
  if (!respuesta.ok) {
    const error = (datos ?? {}) as { codigo?: unknown; mensaje?: unknown };
    throw new ErrorDeApi(
      respuesta.status,
      typeof error.codigo === 'string' ? error.codigo : 'error',
      typeof error.mensaje === 'string'
        ? error.mensaje
        : `El servidor contestó ${respuesta.status}`,
      datos,
    );
  }
  return datos as T;
}

export function mensajeDe(error: unknown): string {
  if (error instanceof ErrorDeApi) return error.message;
  return 'Algo falló. Vuelve a intentarlo.';
}
