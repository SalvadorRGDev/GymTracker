import { useState } from 'preact/hooks';
import type { CatalogoBase } from '../../catalogo/tipos';
import { Icono } from './iconos';
import { VentanaDeEjemplo } from './ventana-de-ejemplo';

/**
 * «Ver ejemplo» (ADR-021) donde se elige un ejercicio: al importar, al archivar,
 * en la rutina y al registrar. Va FUERA de la fila o la etiqueta que elige: dentro,
 * el clic elegiría el ejercicio en vez de enseñarlo. Su nombre accesible dice de
 * cuál es. Compacto, sólo el icono —con el mismo nombre accesible—, para filas
 * donde el texto no cabe en un teléfono.
 */
export function BotonVerEjemplo({
  baseId,
  nombre,
  base = null,
  compacto = false,
}: {
  baseId: string;
  nombre: string;
  base?: Pick<CatalogoBase, 'ejercicios' | 'grupos'> | null;
  compacto?: boolean;
}) {
  const [abierto, setAbierto] = useState(false);
  return (
    <>
      <button
        type="button"
        class={compacto ? 'ver-ejemplo ver-ejemplo-compacto' : 'ver-ejemplo'}
        onClick={() => setAbierto(true)}
        {...(compacto ? { title: `Ver ejemplo de ${nombre}` } : {})}
      >
        <Icono nombre="circle-play" tamano={compacto ? 18 : 15} />
        {compacto ? (
          <span class="solo-lectores">Ver ejemplo de {nombre}</span>
        ) : (
          <>
            Ver ejemplo<span class="solo-lectores"> de {nombre}</span>
          </>
        )}
      </button>
      {abierto && (
        <VentanaDeEjemplo
          baseId={baseId}
          nombre={nombre}
          base={base}
          alCerrar={() => setAbierto(false)}
        />
      )}
    </>
  );
}
