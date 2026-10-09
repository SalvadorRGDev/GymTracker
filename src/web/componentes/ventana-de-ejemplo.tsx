import { useEffect, useRef, useState } from 'preact/hooks';
import type { CatalogoBase } from '../../catalogo/tipos';
import { useRecurso } from '../estado/recurso';
import { Demostracion } from './demostracion/demostracion';
import type { Ejemplo } from './demostracion/ejemplos';
import { NOMBRE_DE_EQUIPO } from './selector-de-ejercicio';

/**
 * «Ver ejemplo»: el `<dialog>` nativo en modo modal, que oscurece la página
 * detrás y deja en el centro la figura animada del ejercicio, cómo se hace y
 * qué trabaja. Se cierra con «Cerrar», con Escape o pulsando fuera.
 *
 * Las figuras se cargan al abrir la ventana: son un módulo aparte que la página
 * del catálogo no necesita hasta entonces.
 */

/** Lo que dice cada coeficiente, y con qué color sale en la figura (si sale). */
const PESOS = [
  ['1.00', 'Principal', 'principal'],
  ['0.50', 'Ayudan', 'ayuda'],
  ['0.25', 'Un poco', null],
] as const;

export function VentanaDeEjemplo({
  baseId,
  nombre,
  base,
  alCerrar,
}: {
  /** El ejercicio del catálogo base cuya figura se enseña. */
  baseId: string;
  /** Cómo se llama donde se pulsó: el del catálogo del usuario o el de la semilla. */
  nombre: string;
  /** El catálogo base, si la página ya lo tiene; si no, se pide al abrir. */
  base: Pick<CatalogoBase, 'ejercicios' | 'grupos'> | null;
  alCerrar: () => void;
}) {
  const ventana = useRef<HTMLDialogElement>(null);
  // undefined: cargando; null: el ejercicio no tiene figura.
  const [ejemplo, setEjemplo] = useState<Ejemplo | null | undefined>(undefined);
  const pedido = useRecurso<CatalogoBase>(base === null ? '/api/lectura/v1/catalogo/base' : null);
  const datos = base ?? pedido.datos;
  const ejercicio = datos?.ejercicios.find((e) => e.id === baseId) ?? null;
  const grupos = datos?.grupos ?? [];

  useEffect(() => {
    let vigente = true;
    void import('./demostracion/ejemplos').then((m) => {
      if (vigente) setEjemplo(m.ejemploDe(baseId));
    });
    return () => {
      vigente = false;
    };
  }, [baseId]);

  const cierra = () => {
    const d = ventana.current;
    if (d?.open === true && typeof d.close === 'function') d.close();
    alCerrar();
  };

  useEffect(() => {
    const d = ventana.current;
    if (d === null) return;
    const antes = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (typeof d.showModal === 'function') {
      if (!d.open) d.showModal();
    } else {
      d.setAttribute('open', '');
    }
    // El foco entra en la ventana por su único control, igual en todos los navegadores.
    d.querySelector<HTMLButtonElement>('.ventana-pie button')?.focus();
    // Un clic en el velo llega al propio <dialog>: el contenido lo tapa por dentro.
    // Con el teclado, lo mismo es Escape, que el <dialog> modal ya atiende solo.
    const alPulsarFuera = (evento: MouseEvent) => {
      if (evento.target === d) cierra();
    };
    d.addEventListener('click', alPulsarFuera);
    return () => {
      d.removeEventListener('click', alPulsarFuera);
      // El foco vuelve a «Ver ejemplo», que es de donde salió.
      antes?.focus();
    };
  }, []);

  const ids = (coeficiente: string) =>
    Object.entries(ejercicio?.coeficientes ?? {})
      .filter(([, c]) => c === coeficiente)
      .map(([g]) => g);
  const nombres = (coeficiente: string) =>
    ids(coeficiente).map((g) => grupos.find((x) => x.id === g)?.nombre ?? g);
  const musculos = { principales: ids('1.00'), ayudan: ids('0.50') };
  const material =
    ejercicio === null
      ? null
      : ejercicio.equipamiento.length === 0
        ? 'Ninguno: el propio peso del cuerpo'
        : ejercicio.equipamiento.map((q) => NOMBRE_DE_EQUIPO[q]).join(', ');

  return (
    <dialog ref={ventana} class="ventana" aria-labelledby="titulo-ejemplo" onClose={alCerrar}>
      <div class="ventana-cuerpo">
        <div>
          <p class="ventana-antetitulo">Cómo se hace</p>
          <h2 id="titulo-ejemplo">{nombre}</h2>
        </div>
        {ejemplo === undefined && <output class="demo demo-cargando">Cargando la figura…</output>}
        {ejemplo === null && <p class="ventana-nota">Este ejercicio todavía no tiene figura.</p>}
        {ejemplo !== undefined && ejemplo !== null && (
          <>
            <Demostracion
              movimiento={ejemplo.movimiento}
              titulo={ejemplo.titulo}
              musculos={musculos}
            />
            <p class="ventana-pista">{ejemplo.pista}</p>
            <p class="ventana-nota">
              En la figura: {ejemplo.titulo}.{ejemplo.nota === undefined ? '' : ` ${ejemplo.nota}`}
            </p>
          </>
        )}
        <dl class="ventana-datos">
          {PESOS.map(([coeficiente, rotulo, tono]) => {
            const lista = nombres(coeficiente);
            return (
              lista.length > 0 && (
                <div key={coeficiente}>
                  <dt>
                    {/* El mismo color que esos músculos tienen en la figura. */}
                    {tono !== null && <span class={`muestra muestra-${tono}`} aria-hidden="true" />}
                    {rotulo}
                  </dt>
                  <dd>{lista.join(', ')}</dd>
                </div>
              )
            );
          })}
          {material !== null && (
            <div>
              <dt>Material</dt>
              <dd>{material}</dd>
            </div>
          )}
        </dl>
      </div>
      <div class="ventana-pie">
        <button type="button" class="boton" onClick={cierra}>
          Cerrar
        </button>
      </div>
    </dialog>
  );
}
