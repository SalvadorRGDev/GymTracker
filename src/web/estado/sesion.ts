import { useEffect, useState } from 'preact/hooks';
import type { SesionActual } from '../../api/sesion/contrato';
import { alCaducarLaSesion, ErrorDeApi, pide } from './api';

/**
 * La única forma de saber si hay sesión es pedir un recurso autenticado y ver
 * si el servidor contesta 401. Nada de esto guarda el token.
 */

export type EstadoDeSesion =
  | { readonly tipo: 'comprobando' }
  | { readonly tipo: 'anonima' }
  | { readonly tipo: 'activa'; readonly correo: string; readonly zona: string };

let actual: EstadoDeSesion = { tipo: 'comprobando' };
const oyentes = new Set<(estado: EstadoDeSesion) => void>();

function fija(estado: EstadoDeSesion): void {
  actual = estado;
  for (const oyente of oyentes) oyente(estado);
}

alCaducarLaSesion(() => {
  if (actual.tipo !== 'anonima') fija({ tipo: 'anonima' });
});

export function sesionActual(): EstadoDeSesion {
  return actual;
}

export function useSesion(): EstadoDeSesion {
  const [estado, setEstado] = useState(actual);
  useEffect(() => {
    oyentes.add(setEstado);
    setEstado(actual);
    return () => {
      oyentes.delete(setEstado);
    };
  }, []);
  return estado;
}

export async function compruebaSesion(): Promise<void> {
  try {
    const yo = await pide<SesionActual>('GET', '/api/sesion/v1/actual');
    fija({ tipo: 'activa', correo: yo.correo, zona: yo.zona_horaria });
  } catch (error) {
    if (error instanceof ErrorDeApi && error.estado === 401) fija({ tipo: 'anonima' });
    else fija({ tipo: 'anonima' });
  }
}

/** Lanza `ErrorDeApi` con el mensaje del servidor, que es el mismo exista o no el correo. */
export async function entra(correo: string, contrasena: string): Promise<void> {
  await pide('POST', '/api/sesion/v1/entrar', { correo, contrasena }, { sinRedirigir: true });
  await compruebaSesion();
}

/** Alta pública (ADR-020): el servidor crea la cuenta y deja la sesión abierta. */
export async function registra(correo: string, contrasena: string, zona: string): Promise<void> {
  await pide(
    'POST',
    '/api/sesion/v1/alta',
    { correo, contrasena, zona_horaria: zona },
    { sinRedirigir: true },
  );
  await compruebaSesion();
}

/**
 * Salir revoca la sesión en el servidor. Si la red falla, la vista vuelve igual
 * al acceso: seguir enseñando datos tras pulsar «Salir» sería peor que una
 * cookie que caduca sola.
 */
export async function sal(): Promise<void> {
  try {
    await pide('POST', '/api/sesion/v1/salir', undefined, { sinRedirigir: true });
  } catch {
    // Sin respuesta del servidor: la fila se revocará al caducar.
  } finally {
    fija({ tipo: 'anonima' });
  }
}

/** Sólo para pruebas: arranca desde un estado conocido. */
export function fijaSesionParaPruebas(estado: EstadoDeSesion): void {
  fija(estado);
}
