import type { TramoDeEscala } from '../../api/lectura/contrato';

/**
 * La barra de tramos DISCRETOS bajo la figura: con tramos se lee a qué nivel
 * pertenece un músculo; con un degradado habría que adivinarlo. Se construye
 * con la escala que manda el servidor, así que leyenda y colores no pueden
 * desincronizarse.
 */

const MARCAS = ['0', '4', '8', '12', '16', '20+'];

function posicionDelIndicador(nivel: number): string {
  if (nivel <= 0) return '14px';
  // Primera columna de 28 px, seis columnas iguales y huecos de 4 px.
  return `calc(32px + ${nivel - 0.5} * ((100% - 52px) / 6) + ${(nivel - 1) * 4}px)`;
}

export function LeyendaDeVolumen({
  escala,
  nivelActivo,
}: {
  escala: readonly TramoDeEscala[];
  nivelActivo: number | null;
}) {
  return (
    <div class="leyenda">
      <div class="leyenda-barra" aria-hidden="true">
        {nivelActivo !== null && (
          <span class="leyenda-indicador" style={{ left: posicionDelIndicador(nivelActivo) }} />
        )}
        {escala.map((t) => (
          <span key={t.nivel} class="leyenda-tramo" data-nivel={t.nivel} />
        ))}
      </div>
      <div class="leyenda-marcas" aria-hidden="true">
        <span />
        {MARCAS.map((m) => (
          <span key={m}>{m}</span>
        ))}
      </div>
      <ul class="leyenda-rotulos">
        {escala.map((t) => (
          <li
            key={t.nivel}
            {...(t.nivel === nivelActivo ? { 'aria-current': 'true' as const } : {})}
          >
            <span class="leyenda-tramo muestra-de-nivel" data-nivel={t.nivel} aria-hidden="true" />
            <span>
              {t.rotulo} <span class="solo-lectores">({t.descripcion} series)</span>
            </span>
          </li>
        ))}
      </ul>
      <p class="leyenda-explicacion">
        El color indica cuántas series efectivas recibió cada grupo esta semana. Es una cantidad, no
        una nota: el rango de referencia de cada grupo está en la tabla.
      </p>
    </div>
  );
}
