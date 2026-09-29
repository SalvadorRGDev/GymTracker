import { caja, cilindro, type Pieza, trazo } from './escena';
import type { Par } from './esqueleto';
import { combina, mezcla, punto, resta, unitario, type V3 } from './vector';

/**
 * El material: lo que va en las manos (barra, mancuernas, kettlebell, cuerda,
 * asas), lo que tira (cable, banda) y los muebles (bancos, torres de polea,
 * palancas y rodillos de las máquinas). Lo que tiene volumen se dibuja como
 * cilindros con su tapa: discos con grosor, manguitos, collarines. Todo en las
 * mismas unidades que el esqueleto.
 */

export const RADIO_DE_DISCO = 19;

/**
 * Barra olímpica que pasa por dos agarres: la barra fina entre collarines,
 * manguitos más gruesos y dos discos por lado. Se parte en tramos para que cada
 * uno quede delante o detrás del cuerpo según su propia profundidad.
 */
export function barra(
  a: V3,
  b: V3,
  opciones: { readonly largo?: number; readonly radio?: number; readonly eje?: V3 } = {},
): Pieza[] {
  const centro = mezcla(a, b, 0.5);
  const eje = opciones.eje ?? unitario(resta(a, b), [0, 0, 1]);
  const mitad = (opciones.largo ?? 150) / 2;
  const r = opciones.radio ?? RADIO_DE_DISCO;
  const en = (d: number) => combina(centro, [eje, d]);
  const [da, db] = [punto(resta(a, centro), eje), punto(resta(b, centro), eje)];
  const interior = mitad - 24;
  const piezas: Pieza[] = [
    cilindro(en(-interior), en(Math.min(da, db)), 1.5, 'acero'),
    cilindro(en(Math.min(da, db)), en(Math.max(da, db)), 1.5, 'acero'),
    cilindro(en(Math.max(da, db)), en(interior), 1.5, 'acero'),
  ];
  for (const s of [1, -1]) {
    piezas.push(cilindro(en(s * interior), en(s * mitad), 2.6, 'acero'));
    piezas.push(cilindro(en(s * (interior - 2)), en(s * interior), 3.8, 'acero'));
    if (r > 0) {
      piezas.push(cilindro(en(s * (interior + 1)), en(s * (interior + 6)), r, 'disco'));
      piezas.push(cilindro(en(s * (interior + 6)), en(s * (interior + 10)), r * 0.72, 'disco'));
    }
  }
  return piezas;
}

/** Mancuerna: mango de acero y dos cabezas. */
export function mancuerna(c: V3, eje: V3): Pieza[] {
  const u = unitario(eje, [0, 0, 1]);
  return [
    cilindro(combina(c, [u, -7]), combina(c, [u, 7]), 1.7, 'acero'),
    cilindro(combina(c, [u, 6]), combina(c, [u, 12]), 7.6, 'disco'),
    cilindro(combina(c, [u, -6]), combina(c, [u, -12]), 7.6, 'disco'),
  ];
}

/** Kettlebell colgando del agarre en la dirección `abajo`. */
export function kettlebell(agarre: V3, abajo: V3, lateral: V3): Pieza[] {
  const d = unitario(abajo);
  const l = unitario(lateral);
  const centro = combina(agarre, [d, 16]);
  const cuernos = [combina(centro, [d, -7], [l, -6]), combina(centro, [d, -7], [l, 6])] as const;
  const mango = [combina(agarre, [l, -6]), combina(agarre, [l, 6])] as const;
  return [
    {
      tipo: 'masa',
      esferas: [
        [centro, 10],
        [combina(centro, [d, 3]), 9.5],
      ],
      clase: 'disco',
    },
    cilindro(cuernos[0], mango[0], 1.8, 'agarre'),
    cilindro(mango[0], mango[1], 1.8, 'agarre'),
    cilindro(mango[1], cuernos[1], 1.8, 'agarre'),
  ];
}

/** Cable de polea, con la roldana donde sale. */
export function cable(polea: V3, agarre: V3): Pieza[] {
  return [
    trazo(polea, agarre, 1.3, 'cable'),
    cilindro(combina(polea, [[0, 0, 1], -1.8]), combina(polea, [[0, 0, 1], 1.8]), 5, 'acero'),
  ];
}

export const banda = (a: V3, b: V3): Pieza => trazo(a, b, 3, 'banda');

/** Agarre recto entre las dos manos (el de la polea), algo más ancho que ellas. */
export function agarreRecto(a: V3, b: V3, sobra = 7): Pieza {
  const eje = unitario(resta(a, b), [0, 0, 1]);
  return cilindro(combina(b, [eje, -sobra]), combina(a, [eje, sobra]), 1.9, 'agarre');
}

/** Asa de máquina o de polea a una mano: un mango corto de goma. */
export function asa(c: V3, eje: V3 = [0, 1, 0], largo = 13): Pieza {
  const u = unitario(eje, [0, 1, 0]);
  return cilindro(combina(c, [u, -largo / 2]), combina(c, [u, largo / 2]), 2.3, 'agarre');
}

/** Cuerda de tríceps o de face pull: del extremo del cable a cada mano. */
export function cuerda(extremo: V3, a: V3, b: V3): Pieza[] {
  return [cilindro(extremo, a, 1.8, 'agarre'), cilindro(extremo, b, 1.8, 'agarre')];
}

/** Brazo de palanca de una máquina: acero. */
export const palanca = (a: V3, b: V3): Pieza => cilindro(a, b, 2.3, 'acero');

/**
 * Brazo de una máquina de aperturas (pec deck, también el invertido): gira
 * sobre un eje vertical encima del hombro, así que no se estira mientras la
 * mano recorre el arco. Va por encima del brazo hasta el asa y baja a ella.
 */
export function brazoDeAperturas(pivote: V3, mano: V3): Pieza[] {
  const codo: V3 = [mano[0], pivote[1], mano[2]];
  return [
    palanca(pivote, codo),
    palanca(codo, [mano[0], mano[1] + 6, mano[2]]),
    asa(mano, [0, 1, 0], 13),
  ];
}

/**
 * El bastidor de una máquina de aperturas: un travesaño en lo alto del poste
 * (en `x`) y, a cada lado, un brazo hasta el eje de giro, que baja hasta la
 * altura de las palancas.
 */
export function bastidorDeAperturas(x: number, pivotes: Par<V3>, alto: number): Pieza[] {
  return [
    ...caja([x, alto, 0], [3.5, 2.5, 22], { clase: 'acero' }),
    ...pivotes.flatMap((p) => [
      cilindro([x, alto, p[2]], [p[0], alto, p[2]], 2.3, 'acero'),
      cilindro([p[0], p[1] - 2, p[2]], [p[0], alto + 1, p[2]], 3.2, 'acero'),
    ]),
  ];
}

/** Rodillo acolchado de una máquina (tobillos, muslos, rodillas). */
export const rodillo = (a: V3, b: V3, r = 5.5): Pieza => cilindro(a, b, r, 'almohadilla');

/** Un disco suelto (el de una barra anclada al suelo): centro y eje. */
export function placa(c: V3, eje: V3, r = RADIO_DE_DISCO, grosor = 5): Pieza {
  const u = unitario(eje);
  return cilindro(combina(c, [u, -grosor / 2]), combina(c, [u, grosor / 2]), r, 'disco');
}

/** Una anilla de gimnasia. */
export function anilla(c: V3, normal: V3 = [0, 0, 1]): Pieza {
  return { tipo: 'disco', c, normal, r: 6.5, clase: 'anilla' };
}

/** Barra fija: la barra de acero y, si se piden, dos postes hasta el suelo. */
export function barraFija(x: number, y: number, ancho = 70, postes = true): Pieza[] {
  return [
    cilindro([x, y, -ancho], [x, y, ancho], 2, 'acero'),
    ...(postes ? [-ancho, ancho].map((z) => trazo([x, 0, z], [x, y + 8, z], 5, 'pata')) : []),
  ];
}

/** Torre de polea: dos montantes, travesaño, base y la pila de discos. */
export function torre(x: number, z: number, alto = 210): Pieza[] {
  return [
    ...caja([x, 1.5, z], [16, 1.5, 18]),
    ...caja([x, 22, z], [6, 20, 7], { clase: 'acero' }),
    ...[-9, 9].flatMap((dz) => caja([x, alto / 2, z + dz], [2.5, alto / 2, 2.5])),
    ...caja([x, alto - 3, z], [5, 3, 12]),
  ];
}

export function bancoPlano(
  x0: number,
  x1: number,
  opciones: { readonly alto?: number; readonly z?: number; readonly ancho?: number } = {},
): Pieza[] {
  const alto = opciones.alto ?? 44;
  const z = opciones.z ?? 0;
  const ancho = opciones.ancho ?? 13;
  const medio = (x0 + x1) / 2;
  return [
    ...caja([medio, alto - 4, z], [(x1 - x0) / 2, 4, ancho]),
    ...caja([medio, (alto - 8) / 2, z], [(x1 - x0) / 2 - 12, 2.5, 3], { clase: 'acero' }),
    ...[x0 + 12, x1 - 12].flatMap((x) => [
      ...caja([x, (alto - 8) / 2, z], [2.5, (alto - 8) / 2, 3], { clase: 'acero' }),
      ...caja([x, 1.5, z], [3.5, 1.5, ancho + 3], { clase: 'acero' }),
    ]),
  ];
}

/**
 * Respaldo inclinado: sube desde `pie` (su extremo bajo) hacia atrás (−x) con
 * `angulo` grados sobre el suelo. Devuelve también el punto de su superficie a
 * una distancia dada del pie, para apoyar ahí el tronco.
 */
export function respaldo(
  pie: V3,
  angulo: number,
  largo: number,
  opciones: { readonly ancho?: number; readonly haciaDelante?: boolean } = {},
): {
  readonly piezas: Pieza[];
  readonly superficie: (distancia: number) => V3;
  readonly normal: V3;
} {
  const rad = (angulo * Math.PI) / 180;
  const signo = opciones.haciaDelante === true ? 1 : -1;
  const dir: V3 = [signo * Math.cos(rad), Math.sin(rad), 0];
  const n: V3 = [-signo * Math.sin(rad), Math.cos(rad), 0];
  const centro = combina(pie, [dir, largo / 2], [n, -4]);
  const giro = (Math.atan2(dir[1], dir[0]) * 180) / Math.PI;
  const apoyo = combina(pie, [dir, largo * 0.6], [n, -8]);
  const piezas = [
    ...caja(centro, [largo / 2, 4, opciones.ancho ?? 13], { giro }),
    trazo(apoyo, [apoyo[0], 0, pie[2]], 5, 'pata'),
    trazo([apoyo[0] - 14, 1.5, pie[2]], [apoyo[0] + 14, 1.5, pie[2]], 5, 'pata'),
  ];
  return { piezas, superficie: (d) => combina(pie, [dir, d]), normal: n };
}

/**
 * Banco inclinado con el pecho apoyado: el acolchado sigue la cara delantera
 * del tronco desde la boca del estómago, así los muslos quedan por debajo.
 */
export function apoyoDePecho(pelvis: V3, tronco: number): Pieza[] {
  const a = (tronco * Math.PI) / 180;
  const arriba: V3 = [Math.sin(a), Math.cos(a), 0];
  const delante: V3 = [Math.cos(a), -Math.sin(a), 0];
  const pie = combina(pelvis, [arriba, 16], [delante, 11]);
  return respaldo(pie, 90 - tronco, 60, { haciaDelante: true }).piezas;
}
