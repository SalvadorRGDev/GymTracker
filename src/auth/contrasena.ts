import { hash, verify } from '@node-rs/argon2';

/**
 * Contraseñas con Argon2id (ADR-007). Binarios precompilados: nada de node-gyp.
 * Parámetros de OWASP: 19 MiB, dos pasadas, un hilo. Argon2id es el algoritmo
 * por omisión del paquete; se comprueba en el resultado en vez de suponerlo.
 */

const OPCIONES = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const LONGITUD_MINIMA = 12;

export async function hashDeContrasena(contrasena: string): Promise<string> {
  if (contrasena.length < LONGITUD_MINIMA) {
    throw new Error(`La contraseña necesita al menos ${LONGITUD_MINIMA} caracteres`);
  }
  const resultado = await hash(contrasena, OPCIONES);
  if (!resultado.startsWith('$argon2id$')) throw new Error('El hash no es Argon2id');
  return resultado;
}

/** Se calcula una vez y sirve para igualar el tiempo cuando el correo no existe. */
let hashDeRelleno: Promise<string> | null = null;

/**
 * `false` si no coincide, y también si no hay hash (correo desconocido): en
 * ese caso se verifica contra un hash de relleno para que el tiempo de
 * respuesta no delate qué correos existen.
 */
export async function verificaContrasena(
  hashGuardado: string | null,
  contrasena: string,
): Promise<boolean> {
  if (hashGuardado === null) {
    hashDeRelleno ??= hash('relleno-para-igualar-el-tiempo', OPCIONES);
    await verify(await hashDeRelleno, contrasena).catch(() => false);
    return false;
  }
  try {
    return await verify(hashGuardado, contrasena);
  } catch {
    return false;
  }
}
