import type { Camara, Movimiento } from '../escena';
import type { Esqueleto, Par, Relativo } from '../esqueleto';
import type { V3 } from '../vector';

/** Lo que enseña la ventana: la figura, cómo se llama lo que hace y cómo se hace. */
export interface Demostracion {
  /** Lo que se ve, en minúscula: «press en banco plano con barra». */
  readonly titulo: string;
  /** Una o dos frases de cómo se hace, para quien no lo ha hecho nunca. */
  readonly pista: string;
  readonly movimiento: Movimiento;
}

/**
 * Tres cuartos por detrás, para lo que trabaja con la espalda, el glúteo o la
 * parte de atrás del hombro: de frente, eso queda al otro lado del cuerpo.
 */
export const DESDE_ATRAS: Camara = { giro: -40, alzado: 14 };

/** El mismo punto a la derecha y, reflejado, a la izquierda. */
export const par = (v: V3): Par<V3> => [v, [v[0], v[1], -v[2]]];

/** Un par de objetivos relativos al tronco, reflejados igual. */
export const rel = (desde: Relativo['desde'], v: V3): Par<Relativo> => [
  { desde, v },
  { desde, v: [v[0], v[1], -v[2]] },
];

const RAD = Math.PI / 180;

/** Hacia dónde apunta el tronco con una inclinación dada (sin giro ni ladeo). */
export const arribaDe = (tronco: number): V3 => [Math.sin(tronco * RAD), Math.cos(tronco * RAD), 0];
/** Hacia dónde mira el pecho con esa inclinación. */
export const delanteDe = (tronco: number): V3 => [
  Math.cos(tronco * RAD),
  -Math.sin(tronco * RAD),
  0,
];

/** Centro entre los dos hombros para una pelvis y una inclinación. */
export function hombrosDe(pelvis: V3, tronco: number): V3 {
  const a = arribaDe(tronco);
  return [pelvis[0] + a[0] * 50, pelvis[1] + a[1] * 50, pelvis[2]];
}

/** La pelvis que deja los hombros en `hombros` con esa inclinación. */
export function pelvisBajo(hombros: V3, tronco: number): V3 {
  const a = arribaDe(tronco);
  return [hombros[0] - a[0] * 50, hombros[1] - a[1] * 50, hombros[2]];
}

export const manos = (e: Esqueleto): Par<V3> => [e.brazos[0].fin, e.brazos[1].fin];

/** Los pies separados a la anchura de la cadera, planos en el suelo. */
export const PIES = par([2, 7, 11]);
export const PELVIS_DE_PIE: V3 = [0, 90, 0];
