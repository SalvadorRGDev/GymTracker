import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import type { GrupoDelDashboard } from '../../api/lectura/contrato';
import type { GrupoComparado } from '../../api/planes/contrato';
import { ROTULO_DE_ESTADO } from './delta';
import {
  CABEZA,
  type Cara,
  COLUMNA,
  LIENZO,
  matrizDeEncuadre,
  REGIONES,
  SILUETA,
  type Vista,
} from './figura/rutas';

/**
 * La figura NO calcula: pinta cada región con el `nivel` que decidió el
 * servidor (ADR-018). Si el número dijera otra cosa, manda el nivel del
 * contrato, porque la leyenda y el color salen de la misma fuente. Comparada
 * con el plan (ADR-019), pinta el `estado` de la comparativa, que también
 * decide el servidor; un grupo sin plan ni series queda con la trama.
 *
 * Dos caras SVG apiladas; elegir «Espalda» gira el interior 180° en 3D (CSS
 * puro). Con movimiento reducido no hay giro: la cara cambia sin más y el
 * color aparece ya puesto.
 */

export interface PropiedadesDeFigura {
  readonly grupos: readonly GrupoDelDashboard[];
  readonly vista: Vista;
  readonly cara: Cara;
  /** Id del grupo del usuario resaltado (fila o región bajo el puntero). */
  readonly activo: string | null;
  readonly alActivar: (grupoId: string | null) => void;
  readonly movimiento: boolean;
  readonly etiqueta: string;
  readonly descritaPor?: string;
  /** Con esto, la figura pinta la comparativa por id de grupo en vez del volumen. */
  readonly comparacion?: ReadonlyMap<string, GrupoComparado> | undefined;
}

function tituloComparado(grupo: GrupoDelDashboard, comparado: GrupoComparado | undefined): string {
  return comparado === undefined
    ? `${grupo.nombre}: ni plan ni series esta semana del plan`
    : `${grupo.nombre}: ${comparado.ejecutado} de ${comparado.planeado}, ${comparado.delta} (${ROTULO_DE_ESTADO[comparado.estado]})`;
}

function CaraDeLaFigura({
  cara,
  vista,
  porZona,
  activo,
  comparacion,
}: {
  cara: Cara;
  vista: Vista;
  porZona: ReadonlyMap<string, GrupoDelDashboard>;
  activo: string | null;
  comparacion: ReadonlyMap<string, GrupoComparado> | undefined;
}) {
  const m = matrizDeEncuadre(vista);
  const trama = `trama-sin-trabajo-${cara}`;
  return (
    <svg
      class={`cara cara-${cara}`}
      viewBox={`0 0 ${LIENZO.ancho} ${LIENZO.alto}`}
      aria-hidden="true"
      focusable="false"
      data-cara={cara}
    >
      <defs>
        <pattern
          id={trama}
          width="6"
          height="6"
          patternUnits="userSpaceOnUse"
          patternTransform="rotate(45)"
        >
          <rect class="trama-fondo" width="6" height="6" />
          <line class="trama-linea" x1="0" y1="0" x2="0" y2="6" />
        </pattern>
      </defs>
      <g
        class="encuadre"
        style={{ transform: `matrix(${m.escala}, 0, 0, ${m.escala}, ${m.x}, ${m.y})` }}
      >
        <path class="silueta" d={SILUETA} />
        <ellipse class="silueta" cx={CABEZA.cx} cy={CABEZA.cy} rx={CABEZA.rx} ry={CABEZA.ry} />
        {cara === 'espalda' && <path class="columna-vertebral" d={COLUMNA} />}
        {REGIONES[cara].map((region) => {
          const grupo = porZona.get(region.grupo);
          const comparado = grupo === undefined ? undefined : comparacion?.get(grupo.id);
          const pintura =
            comparacion === undefined
              ? { 'data-nivel': grupo === undefined ? 'ninguno' : String(grupo.nivel) }
              : {
                  'data-estado':
                    grupo === undefined ? 'ninguno' : (comparado?.estado ?? 'sin-plan'),
                };
          return (
            <path
              key={`${region.grupo}-${region.lado}`}
              class={`region${grupo !== undefined && grupo.id === activo ? ' activa' : ''}`}
              d={region.d}
              data-grupo={region.grupo}
              {...pintura}
              style={{ '--orden': String(region.orden) }}
            >
              <title>
                {grupo === undefined
                  ? 'Grupo que no está en tu catálogo'
                  : comparacion !== undefined
                    ? tituloComparado(grupo, comparado)
                    : `${grupo.nombre}: ${grupo.series_efectivas} series efectivas esta semana`}
              </title>
            </path>
          );
        })}
      </g>
    </svg>
  );
}

export function FiguraMuscular(p: PropiedadesDeFigura) {
  const porZona = useMemo(
    () => new Map(p.grupos.filter((g) => g.zona !== null).map((g) => [g.zona ?? '', g])),
    [p.grupos],
  );

  // Puntero por delegación: un oyente para todas las regiones. Las regiones no
  // reciben foco (la figura es role="img"); el teclado llega por la tabla.
  const figura = useRef<HTMLDivElement>(null);
  const { alActivar } = p;
  useEffect(() => {
    const elemento = figura.current;
    if (elemento === null) return;
    const activa = (evento: Event) => {
      const region = (evento.target as Element | null)?.closest?.('.region');
      const grupo = porZona.get(region?.getAttribute('data-grupo') ?? '');
      if (grupo !== undefined) alActivar(grupo.id);
    };
    elemento.addEventListener('pointerover', activa);
    elemento.addEventListener('click', activa);
    return () => {
      elemento.removeEventListener('pointerover', activa);
      elemento.removeEventListener('click', activa);
    };
  }, [porZona, alActivar]);

  // «Se van coloreando»: tras el giro, del neutro al color, de arriba abajo.
  const [coloreada, setColoreada] = useState(!p.movimiento);
  useEffect(() => {
    if (!p.movimiento) {
      setColoreada(true);
      return;
    }
    setColoreada(false);
    const espera = window.setTimeout(() => setColoreada(true), p.cara === 'frente' ? 60 : 480);
    return () => window.clearTimeout(espera);
  }, [p.cara, p.movimiento]);

  const clases = [
    'figura-interior',
    p.movimiento ? 'animada' : '',
    p.cara === 'espalda' ? 'girada' : '',
    coloreada ? 'coloreada' : '',
  ]
    .filter((c) => c !== '')
    .join(' ');

  return (
    <div
      ref={figura}
      class="figura"
      role="img"
      aria-label={p.etiqueta}
      {...(p.descritaPor === undefined ? {} : { 'aria-describedby': p.descritaPor })}
    >
      <div class={clases} data-testid="figura-interior">
        {(['frente', 'espalda'] as const).map((cara) => (
          <CaraDeLaFigura
            key={cara}
            cara={cara}
            vista={p.vista}
            porZona={porZona}
            activo={p.activo}
            comparacion={p.comparacion}
          />
        ))}
      </div>
    </div>
  );
}

/** La silueta sin colorear, para la pantalla de acceso. Sin cifras: nada de datos de muestra. */
export function Silueta() {
  return (
    <svg
      class="acceso-silueta"
      viewBox={`0 0 ${LIENZO.ancho} ${LIENZO.alto}`}
      aria-hidden="true"
      focusable="false"
    >
      <path class="silueta" d={SILUETA} />
      <ellipse class="silueta" cx={CABEZA.cx} cy={CABEZA.cy} rx={CABEZA.rx} ry={CABEZA.ry} />
      {REGIONES.frente.map((r) => (
        <path key={`${r.grupo}-${r.lado}`} class="region region-muda" d={r.d} />
      ))}
    </svg>
  );
}
