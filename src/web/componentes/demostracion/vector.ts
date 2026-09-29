/**
 * Vectores de tres componentes para la figura de las demostraciones. Mundo con
 * `x` hacia delante (a donde mira la figura de pie), `y` hacia arriba y `z` hacia
 * su derecha. Nada más que aritmética: sin reloj, sin DOM.
 */

export type V3 = readonly [number, number, number];

export const suma = (a: V3, b: V3): V3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
export const resta = (a: V3, b: V3): V3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
export const escala = (a: V3, k: number): V3 => [a[0] * k, a[1] * k, a[2] * k];
export const punto = (a: V3, b: V3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const cruz = (a: V3, b: V3): V3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
export const largo = (a: V3): number => Math.hypot(a[0], a[1], a[2]);
export const distancia = (a: V3, b: V3): number => largo(resta(a, b));

export function unitario(a: V3, siNulo: V3 = [1, 0, 0]): V3 {
  const l = largo(a);
  return l < 1e-9 ? siNulo : escala(a, 1 / l);
}

/** Suma ponderada: a + b·k₁ + c·k₂ + … en una sola llamada. */
export function combina(base: V3, ...terminos: readonly (readonly [V3, number])[]): V3 {
  let r = base;
  for (const [v, k] of terminos) r = suma(r, escala(v, k));
  return r;
}

export const mezcla = (a: V3, b: V3, t: number): V3 => [
  a[0] + (b[0] - a[0]) * t,
  a[1] + (b[1] - a[1]) * t,
  a[2] + (b[2] - a[2]) * t,
];

export const mezclaNumero = (a: number, b: number, t: number): number => a + (b - a) * t;

const RAD = Math.PI / 180;

export function rotaX(v: V3, grados: number): V3 {
  const [c, s] = [Math.cos(grados * RAD), Math.sin(grados * RAD)];
  return [v[0], v[1] * c - v[2] * s, v[1] * s + v[2] * c];
}

export function rotaY(v: V3, grados: number): V3 {
  const [c, s] = [Math.cos(grados * RAD), Math.sin(grados * RAD)];
  return [v[0] * c + v[2] * s, v[1], -v[0] * s + v[2] * c];
}

export function rotaZ(v: V3, grados: number): V3 {
  const [c, s] = [Math.cos(grados * RAD), Math.sin(grados * RAD)];
  return [v[0] * c - v[1] * s, v[0] * s + v[1] * c, v[2]];
}

/** Interpolación esférica entre dos direcciones unitarias. */
export function esferica(a: V3, b: V3, t: number): V3 {
  const coseno = Math.min(1, Math.max(-1, punto(a, b)));
  const angulo = Math.acos(coseno);
  if (angulo < 1e-4) return unitario(mezcla(a, b, t), a);
  const s = Math.sin(angulo);
  return suma(escala(a, Math.sin((1 - t) * angulo) / s), escala(b, Math.sin(t * angulo) / s));
}
