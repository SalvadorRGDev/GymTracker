import { useEffect, useState } from 'preact/hooks';

/**
 * Enrutador escrito a mano: rutas fijas sin parámetros de camino, y una
 * biblioteca para eso sería más superficie que problema. Usa la API de
 * historial, así que el servidor devuelve `index.html` en cualquier ruta que
 * no sea de la API (ADR-011). La consulta (`?vista=superior&cara=espalda`)
 * es estado de la vista: se comparte por mensaje y el botón «atrás» funciona.
 */

const EVENTO = 'sigir:navegacion';

export interface Ubicacion {
  readonly camino: string;
  readonly consulta: URLSearchParams;
}

function ubicacionActual(): Ubicacion {
  return {
    camino: window.location.pathname,
    consulta: new URLSearchParams(window.location.search),
  };
}

export function navega(destino: string, opciones: { reemplaza?: boolean } = {}): void {
  const actual = `${window.location.pathname}${window.location.search}`;
  if (destino === actual) return;
  if (opciones.reemplaza === true) window.history.replaceState(null, '', destino);
  else window.history.pushState(null, '', destino);
  window.dispatchEvent(new Event(EVENTO));
}

/** Cambia la consulta de la ruta actual sin apilar historial por cada clic de control. */
export function actualizaConsulta(
  cambios: Record<string, string | null>,
  opciones: { reemplaza?: boolean } = {},
): void {
  const consulta = new URLSearchParams(window.location.search);
  for (const [clave, valor] of Object.entries(cambios)) {
    if (valor === null) consulta.delete(clave);
    else consulta.set(clave, valor);
  }
  const texto = consulta.toString();
  navega(`${window.location.pathname}${texto === '' ? '' : `?${texto}`}`, opciones);
}

export function useUbicacion(): Ubicacion {
  const [ubicacion, setUbicacion] = useState(ubicacionActual);
  useEffect(() => {
    const actualiza = () => setUbicacion(ubicacionActual());
    window.addEventListener('popstate', actualiza);
    window.addEventListener(EVENTO, actualiza);
    return () => {
      window.removeEventListener('popstate', actualiza);
      window.removeEventListener(EVENTO, actualiza);
    };
  }, []);
  return ubicacion;
}
