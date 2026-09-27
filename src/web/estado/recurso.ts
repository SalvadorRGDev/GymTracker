import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { mensajeDe, pide } from './api';

/**
 * TODA lectura autenticada pasa por aquí, porque aquí vive el invariante de
 * que cualquier 401 devuelve la aplicación al acceso (lo hace `pide`).
 * Repartido por las páginas, bastaría una nueva distraída para seguir
 * pintando datos con la sesión caducada.
 */

export type Recurso<T> =
  | { readonly estado: 'cargando'; readonly datos: T | null; recarga(): void }
  | { readonly estado: 'listo'; readonly datos: T; recarga(): void }
  | { readonly estado: 'error'; readonly datos: T | null; readonly error: string; recarga(): void };

export function useRecurso<T>(url: string | null): Recurso<T> {
  const [estado, setEstado] = useState<
    | { estado: 'cargando'; datos: T | null }
    | { estado: 'listo'; datos: T }
    | { estado: 'error'; datos: T | null; error: string }
  >({ estado: 'cargando', datos: null });
  const [vuelta, setVuelta] = useState(0);
  const ultima = useRef(0);

  useEffect(() => {
    if (url === null) return;
    const esta = ++ultima.current;
    setEstado((previo) => ({ estado: 'cargando', datos: previo.datos }));
    pide<T>('GET', url)
      .then((datos) => {
        if (esta === ultima.current) setEstado({ estado: 'listo', datos });
      })
      .catch((error: unknown) => {
        if (esta === ultima.current) {
          setEstado((previo) => ({
            estado: 'error',
            datos: previo.datos,
            error: mensajeDe(error),
          }));
        }
      });
  }, [url, vuelta]);

  const recarga = useCallback(() => setVuelta((v) => v + 1), []);
  return { ...estado, recarga } as Recurso<T>;
}
