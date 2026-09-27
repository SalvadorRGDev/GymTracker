import { useEffect, useState } from 'preact/hooks';

/**
 * Comodidades de la vista en el navegador —mostrar u ocultar los rangos de
 * referencia, el perfil elegido—. Nunca datos: esos viven en el servidor. El
 * almacenamiento puede no existir (ventana privada, bloqueo), así que todo
 * acceso va envuelto y la página funciona igual sin él.
 */

export function leePreferencia(clave: string): string | null {
  try {
    return window.localStorage.getItem(`sigir:${clave}`);
  } catch {
    return null;
  }
}

export function guardaPreferencia(clave: string, valor: string): void {
  try {
    window.localStorage.setItem(`sigir:${clave}`, valor);
  } catch {
    // Sin almacenamiento, la preferencia dura lo que la página.
  }
}

export function usePreferencia(
  clave: string,
  porOmision: string,
): [string, (valor: string) => void] {
  const [valor, setValor] = useState(() => leePreferencia(clave) ?? porOmision);
  const fija = (nuevo: string) => {
    setValor(nuevo);
    guardaPreferencia(clave, nuevo);
  };
  return [valor, fija];
}

/** `true` si la persona pidió menos movimiento. Se sigue en vivo. */
export function useMovimientoReducido(): boolean {
  const consulta = '(prefers-reduced-motion: reduce)';
  const [reducido, setReducido] = useState(() =>
    typeof window.matchMedia === 'function' ? window.matchMedia(consulta).matches : true,
  );
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const lista = window.matchMedia(consulta);
    const cambia = () => setReducido(lista.matches);
    lista.addEventListener?.('change', cambia);
    return () => lista.removeEventListener?.('change', cambia);
  }, []);
  return reducido;
}
