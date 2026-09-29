import { useEffect, useMemo, useState } from 'preact/hooks';
import { useMovimientoReducido } from '../../estado/preferencias';
import {
  CAMARA_POR_OMISION,
  type Caja,
  type Dibujo,
  limites,
  type Movimiento,
  type Pieza,
  type Proyector,
  proyecta,
  proyector,
} from './escena';
import { duracionDelBucle, type Esqueleto, type Pose, poseEn, resuelve } from './esqueleto';
import { type Musculos, piezasDelCuerpo, SIN_MUSCULOS } from './figura';
import type { V3 } from './vector';

/**
 * La figura animada de un ejercicio. El bucle lo mueve `requestAnimationFrame`
 * y sólo corre con `prefers-reduced-motion: no-preference`; con movimiento
 * reducido se enseña quieta: la posición de partida en tenue y la de llegada
 * encima, que cuentan el recorrido sin mover nada.
 */

const PROPORCION = 4 / 3;
const MARGEN = 8;
/** Encuadre mínimo: una figura agachada no se ve más grande que una de pie. */
const ANCHO_MINIMO = 220;

/**
 * Sombras de contacto: una mancha suave bajo lo que toca el suelo (pies,
 * manos, cadera o espalda si se está tumbado). Se mueven con el cuerpo y se
 * aclaran al despegar.
 */
function sombrasDeContacto(e: Esqueleto): Pieza[] {
  const manchas: Pieza[] = [];
  const mancha = (p: V3, r: number, altura: number) => {
    if (p[1] > altura) return;
    const k = 1 - Math.max(0, p[1] - altura * 0.4) / (altura * 0.6);
    manchas.push({
      tipo: 'disco',
      c: [p[0], 0.2, p[2]],
      normal: [0, 1, 0],
      r: r * (0.6 + 0.4 * k),
      clase: 'sombra-cuerpo',
      capa: -9,
    });
  };
  for (const i of [0, 1] as const) {
    const [talon, punta] = e.pies[i];
    mancha(
      [(talon[0] + punta[0]) / 2, Math.min(talon[1], punta[1]), (talon[2] + punta[2]) / 2],
      11,
      16,
    );
    mancha(e.brazos[i].fin, 7, 12);
  }
  mancha(e.pelvis, 20, 26);
  mancha(e.cuello, 16, 24);
  return manchas;
}

function dibujosDe(
  m: Movimiento,
  pose: Pose,
  camara: Proyector,
  conEscena: boolean,
  musculos: Musculos,
): Dibujo[] {
  const e = resuelve(pose);
  return proyecta(
    [
      ...(conEscena ? (m.escena ?? []) : []),
      ...(conEscena ? sombrasDeContacto(e) : []),
      ...piezasDelCuerpo(e, camara.mira, musculos),
      ...(m.aparatos?.(e) ?? []),
    ],
    camara,
  );
}

/** El encuadre que contiene todo el recorrido, con la proporción del escenario. */
export function encuadre(m: Movimiento): Caja {
  const camara = proyector(m.camara ?? CAMARA_POR_OMISION);
  const total = duracionDelBucle(m.pasos);
  let caja: Caja | undefined;
  for (let i = 0; i < 48; i += 1) {
    caja = limites(
      dibujosDe(m, poseEn(m.pasos, (total * i) / 48), camara, i === 0, SIN_MUSCULOS),
      caja,
    );
  }
  const c = caja as Caja;
  let ancho = Math.max(ANCHO_MINIMO, c.maxX - c.minX + 2 * MARGEN);
  let alto = Math.max(ANCHO_MINIMO / PROPORCION, c.maxY - c.minY + 2 * MARGEN);
  if (ancho / alto < PROPORCION) ancho = alto * PROPORCION;
  else alto = ancho / PROPORCION;
  const [cx, cy] = [(c.minX + c.maxX) / 2, (c.minY + c.maxY) / 2];
  return { minX: cx - ancho / 2, minY: cy - alto / 2, maxX: cx + ancho / 2, maxY: cy + alto / 2 };
}

const f = (n: number) => Math.round(n * 10) / 10;

/** Lo que se pinta en el instante `ms` del bucle. */
export function fotograma(m: Movimiento, ms: number, musculos: Musculos = SIN_MUSCULOS): Dibujo[] {
  const camara = proyector(m.camara ?? CAMARA_POR_OMISION);
  return dibujosDe(m, poseEn(m.pasos, ms), camara, true, musculos);
}

function Uno({ d }: { d: Dibujo }) {
  const clase = `demo-${d.clase}`;
  switch (d.tipo) {
    case 'linea':
      return (
        <line
          class={clase}
          x1={f(d.x1)}
          y1={f(d.y1)}
          x2={f(d.x2)}
          y2={f(d.y2)}
          stroke-width={d.grosor}
        />
      );
    case 'elipse':
      return (
        <circle
          class={clase}
          r="1"
          transform={`matrix(${d.matriz.map((n) => Math.round(n * 1000) / 1000).join(' ')})`}
          vector-effect="non-scaling-stroke"
        />
      );
    case 'poligono':
      return (
        <polygon class={clase} points={d.puntos.map(([x, y]) => `${f(x)},${f(y)}`).join(' ')} />
      );
    case 'grupo':
      return (
        <g>
          {d.hijos.map((h, i) => (
            <Uno key={i} d={h} />
          ))}
        </g>
      );
  }
}

export function Dibujos({ dibujos }: { dibujos: readonly Dibujo[] }) {
  return (
    <>
      {dibujos.map((d, i) => (
        <Uno key={i} d={d} />
      ))}
    </>
  );
}

/** La luz viene de arriba a la izquierda: cada pieza del cuerpo, más clara por ese lado. */
const LUCES = ['cuerpo', 'lejos', 'principal', 'principal-lejos', 'ayuda', 'ayuda-lejos'] as const;

export function Luces() {
  return (
    <defs>
      {LUCES.map((n) => (
        <linearGradient key={n} id={`demo-luz-${n}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" class={`demo-luz-${n}-a`} />
          <stop offset="1" class={`demo-luz-${n}-b`} />
        </linearGradient>
      ))}
    </defs>
  );
}

export function Demostracion({
  movimiento,
  titulo,
  musculos = SIN_MUSCULOS,
}: {
  movimiento: Movimiento;
  titulo: string;
  musculos?: Musculos;
}) {
  const reducido = useMovimientoReducido();
  const [ms, setMs] = useState(0);
  const camara = useMemo(() => proyector(movimiento.camara ?? CAMARA_POR_OMISION), [movimiento]);
  const caja = useMemo(() => encuadre(movimiento), [movimiento]);

  useEffect(() => {
    if (reducido || typeof requestAnimationFrame !== 'function') return;
    let pedido = 0;
    let inicio: number | null = null;
    const avanza = (ahora: number) => {
      inicio ??= ahora;
      setMs(ahora - inicio);
      pedido = requestAnimationFrame(avanza);
    };
    pedido = requestAnimationFrame(avanza);
    return () => cancelAnimationFrame(pedido);
  }, [reducido, movimiento]);

  const viewBox = `${f(caja.minX)} ${f(caja.minY)} ${f(caja.maxX - caja.minX)} ${f(caja.maxY - caja.minY)}`;
  const quieto = movimiento.sostenido === true || movimiento.pasos.length < 2;

  if (reducido) {
    const final = movimiento.pasos[quieto ? 0 : (movimiento.clave ?? 1)] ?? movimiento.pasos[0];
    const inicio = movimiento.pasos[0];
    const todo =
      final === undefined ? [] : dibujosDe(movimiento, final.pose, camara, true, musculos);
    const fondo = todo.filter((d) => d.capa < 0);
    return (
      <svg
        class="demo"
        viewBox={viewBox}
        role="img"
        aria-label={
          quieto
            ? `Figura de ${titulo}`
            : `Figura de ${titulo}: en tenue, la posición de partida; encima, la de llegada`
        }
      >
        <Luces />
        <Dibujos dibujos={fondo} />
        {!quieto && inicio !== undefined && (
          <g class="demo-partida" data-pose="partida">
            <Dibujos dibujos={dibujosDe(movimiento, inicio.pose, camara, false, musculos)} />
          </g>
        )}
        <g data-pose="llegada">
          <Dibujos dibujos={todo.filter((d) => d.capa >= 0)} />
        </g>
      </svg>
    );
  }

  return (
    <svg class="demo" viewBox={viewBox} role="img" aria-label={`Animación de ${titulo}`}>
      <Luces />
      <Dibujos
        dibujos={dibujosDe(movimiento, poseEn(movimiento.pasos, ms), camara, true, musculos)}
      />
    </svg>
  );
}
