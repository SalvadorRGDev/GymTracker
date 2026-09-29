import type { Clase, Pieza } from './escena';
import type { Esqueleto } from './esqueleto';
import { combina, largo, mezcla, punto, resta, unitario, type V3 } from './vector';

/**
 * El maniquí. El tronco son dos volúmenes (tórax y pelvis) hechos de secciones
 * elípticas —hombros, pecho, costillas, cintura, cadera—, así que se ve ancho de
 * frente, con pecho y espalda de lado, y con cintura. Brazos y piernas son masas
 * que se estrechan hacia la muñeca y el tobillo; la cabeza lleva mentón, que
 * dice hacia dónde mira. Cada pieza se ordena por su propia profundidad y lleva
 * un contorno del color del escenario: hombro, codo, cadera y rodilla se leen
 * como las junturas de un maniquí articulado.
 *
 * Los músculos del ejercicio se colorean en dos tonos: el que trabaja sobre
 * todo y los que ayudan, tal como los da el catálogo base.
 */

export interface Musculos {
  readonly principales: readonly string[];
  readonly ayudan: readonly string[];
}

export const SIN_MUSCULOS: Musculos = { principales: [], ayudan: [] };

type Tono = 'principal' | 'ayuda';

function tonoDe(m: Musculos, grupos: readonly string[]): Tono | null {
  if (grupos.some((g) => m.principales.includes(g))) return 'principal';
  if (grupos.some((g) => m.ayudan.includes(g))) return 'ayuda';
  return null;
}

/** Los grupos del catálogo base que la figura sabe colorear, y en qué parte. */
export const GRUPOS_EN_LA_FIGURA = {
  brazo: ['biceps', 'triceps'],
  antebrazo: ['antebrazo'],
  muslo: ['cuadriceps', 'isquiosurales', 'aductores'],
  pierna: ['gemelo'],
  pecho: ['pectoral'],
  abdomen: ['abdomen'],
  dorsal: ['dorsal'],
  trapecio: ['trapecio'],
  lumbares: ['lumbares'],
  gluteo: ['gluteo'],
  deltoides: ['deltoides-anterior', 'deltoides-lateral', 'deltoides-posterior'],
} as const;

interface Seccion {
  /** Altura desde la pelvis, a lo largo del tronco. */
  readonly u: number;
  /** Media anchura (hacia los costados). */
  readonly w: number;
  /** Media profundidad (pecho y espalda). */
  readonly d: number;
  /** Cuánto se adelanta el centro de la sección. */
  readonly f: number;
}

/** Del pubis a los hombros. Los hombros siguen a los encogimientos y a la retracción. */
function secciones(e: Esqueleto): readonly [Seccion, Seccion, Seccion, Seccion, Seccion, Seccion] {
  const { marco: m } = e;
  const relativo = resta(e.hombros[0], e.cuello);
  const sube = punto(relativo, m.arriba) + 4;
  const atras = -punto(relativo, m.delante);
  return [
    { u: -6, w: 12.5, d: 8.5, f: -1 },
    { u: 3, w: 15, d: 10, f: -1.5 },
    { u: 21, w: 12.5, d: 8.5, f: 0.5 },
    { u: 34, w: 15.5, d: 10, f: 1.5 },
    { u: 44 + sube * 0.5, w: 17, d: 10.5, f: 1.5 - atras * 0.6 },
    { u: 50 + sube * 0.5, w: 16.5, d: 8.5, f: -0.5 - atras },
  ];
}

const RAD = Math.PI / 180;

function enSeccion(e: Esqueleto, s: Seccion, grados: number): V3 {
  const { marco: m } = e;
  return combina(
    e.pelvis,
    [m.arriba, s.u],
    [m.delante, s.f + s.d * Math.cos(grados * RAD)],
    [m.derecha, s.w * Math.sin(grados * RAD)],
  );
}

function arco(e: Esqueleto, s: Seccion, desde: number, hasta: number, pasos = 6): V3[] {
  return Array.from({ length: pasos + 1 }, (_, k) =>
    enSeccion(e, s, desde + ((hasta - desde) * k) / pasos),
  );
}

const vuelta = (e: Esqueleto, s: Seccion) => arco(e, s, 0, 337.5, 15);

/**
 * Los puntos de un arco cuya superficie mira a la cámara: una región que rodea
 * el tronco sólo pinta lo que se ve de ella, nunca lo de detrás a través del
 * cuerpo.
 */
function arcoVisible(e: Esqueleto, s: Seccion, desde: number, hasta: number, mira: V3): V3[] {
  const { marco: m } = e;
  const pasos = Math.max(4, Math.ceil(Math.abs(hasta - desde) / 10));
  const puntos: V3[] = [];
  for (let k = 0; k <= pasos; k += 1) {
    const g = (desde + ((hasta - desde) * k) / pasos) * RAD;
    const normal = combina(
      [0, 0, 0],
      [m.delante, Math.cos(g) / s.d],
      [m.derecha, Math.sin(g) / s.w],
    );
    if (punto(normal, mira) > 0) puntos.push(enSeccion(e, s, g / RAD));
  }
  return puntos;
}

/** Qué lado queda lejos de la cámara; si están a la par (de frente), ninguno. */
function ladoLejano(a: readonly V3[], b: readonly V3[], mira: V3): 0 | 1 | null {
  const hondo = (ps: readonly V3[]) => ps.reduce((s, p) => s + punto(p, mira), 0) / ps.length;
  const diferencia = hondo(a) - hondo(b);
  if (Math.abs(diferencia) < 5) return null;
  return diferencia < 0 ? 0 : 1;
}

const masa = (clase: Clase, esferas: readonly (readonly [V3, number])[]): Pieza => ({
  tipo: 'masa',
  esferas,
  clase,
});

function claseDe(tono: Tono | null, lejos: boolean): Clase {
  if (tono === null) return lejos ? 'lejos' : 'cuerpo';
  return lejos ? `${tono}-lejos` : tono;
}

const parche = (tono: Tono): Clase => (tono === 'principal' ? 'parche-principal' : 'parche-ayuda');

/** Una región del tronco: lo que se ve de ella, si se ve algo. */
function region(puntos: readonly V3[], tono: Tono): Pieza[] {
  return puntos.length < 3 ? [] : [{ tipo: 'silueta', puntos, clase: parche(tono) }];
}

const dir = (...terminos: readonly (readonly [V3, number])[]): V3 =>
  combina([0, 0, 0], ...terminos);

export function piezasDelCuerpo(
  e: Esqueleto,
  mira: V3,
  musculos: Musculos = SIN_MUSCULOS,
): Pieza[] {
  const { marco: m } = e;
  const [s0, s1, s2, s3, s4, s5] = secciones(e);
  const piezas: Pieza[] = [];
  const tono = (clave: keyof typeof GRUPOS_EN_LA_FIGURA) =>
    tonoDe(musculos, GRUPOS_EN_LA_FIGURA[clave]);

  // Tórax, con pecho, dorsales, abdomen y trapecio. El trapecio es la ladera
  // del cuello al hombro: va debajo del tórax y asoma por encima de él, así que
  // se ve de frente y sube con los encogimientos.
  const trapecio = tono('trapecio');
  const torax: Pieza[] = [
    ...([0, 1] as const).map((i) => {
      const lado = i === 0 ? 1 : -1;
      return masa(claseDe(trapecio, false), [
        [combina(e.cuello, [m.derecha, lado * 3.8], [m.arriba, 2.5], [m.delante, -1.5]), 4.4],
        [combina(e.hombros[i], [m.derecha, -lado * 5], [m.arriba, 1], [m.delante, -1.2]), 4.6],
      ]);
    }),
    { tipo: 'silueta', puntos: [s2, s3, s4, s5].flatMap((s) => vuelta(e, s)), clase: 'cuerpo' },
  ];
  const pecho = tono('pecho');
  const dorsal = tono('dorsal');
  const abdomen = tono('abdomen');
  const lumbares = tono('lumbares');
  const visible = (s: Seccion, desde: number, hasta: number) =>
    arcoVisible(e, s, desde, hasta, mira);
  for (const lado of [1, -1]) {
    if (pecho !== null) {
      torax.push(
        ...region(
          [
            ...visible({ ...s3, u: s3.u - 3 }, lado * 6, lado * 74),
            ...visible(s4, lado * 5, lado * 78),
            ...visible(s5, lado * 8, lado * 60),
          ],
          pecho,
        ),
      );
    }
    // El dorsal ancho: del costado, bajo la axila, hacia la espalda.
    if (dorsal !== null) {
      torax.push(
        ...region(
          [
            ...visible(s2, lado * 100, lado * 160),
            ...visible(s3, lado * 90, lado * 166),
            ...visible(s4, lado * 94, lado * 150),
          ],
          dorsal,
        ),
      );
    }
    // Recto abdominal por delante y oblicuos por los costados.
    if (abdomen !== null) {
      torax.push(
        ...region(
          [...visible({ ...s3, u: 33 }, 0, lado * 82), ...visible(s2, 0, lado * 88)],
          abdomen,
        ),
      );
    }
  }
  if (lumbares !== null) {
    torax.push(
      ...region([...visible({ ...s3, u: 29 }, 150, 210), ...visible(s2, 142, 218)], lumbares),
    );
  }
  // Por detrás, el trapecio es una cometa del cuello a media espalda.
  if (trapecio !== null) {
    const espalda = [
      ...visible({ ...s5, u: s5.u + 2 }, 112, 248),
      ...visible(s4, 134, 226),
      ...visible(s3, 155, 205),
      ...visible({ ...s2, u: 25 }, 172, 188),
    ];
    if (espalda.length >= 2) espalda.push(combina(e.cuello, [m.arriba, 3]));
    torax.push(...region(espalda, trapecio));
  }
  const centro = [s2, s3, s4, s5].reduce(
    (c, s) => combina(c, [m.arriba, s.u / 4], [m.delante, s.f / 4]),
    e.pelvis,
  );
  piezas.push({ tipo: 'grupo', piezas: torax, clase: 'cuerpo', profundidad: centro });

  // Pelvis, con glúteos y zona lumbar.
  const pelvis: Pieza[] = [
    { tipo: 'silueta', puntos: [s0, s1, s2].flatMap((s) => vuelta(e, s)), clase: 'cuerpo' },
  ];
  const gluteo = tono('gluteo');
  for (const lado of [1, -1]) {
    // El glúteo mayor atrás y, sobre el costado de la cadera, el medio.
    if (gluteo !== null) {
      pelvis.push(
        ...region(
          [
            ...arcoVisible(e, s1, lado * 100, lado * 178, mira),
            ...arcoVisible(e, s0, lado * 105, lado * 176, mira),
            ...arcoVisible(e, { ...s2, u: 14 }, lado * 108, lado * 172, mira),
          ],
          gluteo,
        ),
        ...region(
          [
            ...arcoVisible(e, { ...s1, u: 4 }, lado * 62, lado * 108, mira),
            ...arcoVisible(e, { ...s2, u: 15 }, lado * 66, lado * 112, mira),
          ],
          gluteo,
        ),
      );
    }
    if (abdomen !== null) {
      pelvis.push(
        ...region(
          [
            ...arcoVisible(e, s2, 0, lado * 88, mira),
            ...arcoVisible(e, { ...s1, u: 7 }, 0, lado * 70, mira),
          ],
          abdomen,
        ),
      );
    }
  }
  if (lumbares !== null) {
    pelvis.push(
      ...region(
        [...arcoVisible(e, s2, 142, 218, mira), ...arcoVisible(e, { ...s1, u: 9 }, 148, 212, mira)],
        lumbares,
      ),
    );
  }
  piezas.push({ tipo: 'grupo', piezas: pelvis, clase: 'cuerpo' });

  // Cuello y cabeza: el mentón dice hacia dónde mira.
  const arribaCabeza = unitario(resta(e.cabeza, e.cuello));
  const delanteCabeza = unitario(
    resta(m.delante, dir([arribaCabeza, punto(m.delante, arribaCabeza)])),
    m.delante,
  );
  piezas.push(
    masa('cuerpo', [
      [e.cuello, 5.2],
      [mezcla(e.cuello, e.cabeza, 0.5), 4.6],
    ]),
  );
  piezas.push(
    masa('cuerpo', [
      [e.cabeza, 9.4],
      [combina(e.cabeza, [delanteCabeza, 3.6], [arribaCabeza, -5.6]), 6],
    ]),
  );

  // Brazos: hombro redondo, bíceps, codo, antebrazo y puño.
  const brazoLejano = ladoLejano(
    [e.brazos[0].medio, e.brazos[0].fin],
    [e.brazos[1].medio, e.brazos[1].fin],
    mira,
  );
  const tonoBrazo = tono('brazo');
  const tonoAntebrazo = tono('antebrazo');
  const deltoides = (
    [
      ['deltoides-anterior', 1, 0],
      ['deltoides-lateral', 0, 1],
      ['deltoides-posterior', -1, 0],
    ] as const
  ).flatMap(([grupo, delante, afuera]) => {
    const t = tonoDe(musculos, [grupo]);
    return t === null ? [] : [{ delante, afuera, tono: t }];
  });
  for (const i of [0, 1] as const) {
    const c = e.brazos[i];
    const lado = i === 0 ? 1 : -1;
    const lejos = brazoLejano === i;
    const partes: Pieza[] = [
      masa(claseDe(tonoBrazo, lejos), [
        [c.raiz, 6.2],
        [mezcla(c.raiz, c.medio, 0.45), 5.3],
        [c.medio, 4.3],
      ]),
    ];
    // Cada cabeza del deltoides: el casquete del hombro por su lado, que baja
    // hasta la mitad del brazo.
    for (const d of deltoides) {
      const hacia = dir([m.delante, d.delante], [m.derecha, lado * d.afuera]);
      if (punto(hacia, mira) < -0.25) continue;
      partes.push(
        masa(parche(d.tono), [
          [combina(c.raiz, [hacia, 2.4], [m.arriba, 0.6]), 6],
          [combina(mezcla(c.raiz, c.medio, 0.42), [hacia, 1.2]), 4.3],
        ]),
      );
    }
    piezas.push({ tipo: 'grupo', piezas: partes, clase: 'cuerpo' });
    piezas.push(
      masa(claseDe(tonoAntebrazo, lejos), [
        [c.medio, 4.4],
        [mezcla(c.medio, c.fin, 0.28), 4.7],
        [mezcla(c.medio, c.fin, 0.86), 3.3],
        [c.fin, 4.6],
      ]),
    );
  }

  // Piernas: muslo, rodilla, gemelo, tobillo y pie con talón y punta.
  const piernaLejana = ladoLejano(
    [e.piernas[0].medio, e.piernas[0].fin],
    [e.piernas[1].medio, e.piernas[1].fin],
    mira,
  );
  const tonoMuslo = tono('muslo');
  const tonoPierna = tono('pierna');
  for (const i of [0, 1] as const) {
    const c = e.piernas[i];
    const lejos = piernaLejana === i;
    const eje = unitario(resta(c.fin, c.raiz));
    const salida = resta(c.medio, combina(c.raiz, [eje, punto(resta(c.medio, c.raiz), eje)]));
    const delanteRodilla = largo(salida) > 1 ? unitario(salida) : m.delante;
    piezas.push(
      masa(claseDe(tonoMuslo, lejos), [
        [c.raiz, 8.2],
        [mezcla(c.raiz, c.medio, 0.4), 7.3],
        [c.medio, 5.4],
      ]),
    );
    piezas.push(
      masa(claseDe(tonoPierna, lejos), [
        [c.medio, 5.4],
        [combina(mezcla(c.medio, c.fin, 0.3), [delanteRodilla, -1.3]), 6],
        [c.fin, 3.6],
      ]),
    );
    const [talon, punta] = e.pies[i];
    piezas.push(
      masa(claseDe(null, lejos), [
        [talon, 3.4],
        [c.fin, 3.9],
        [punta, 2.8],
      ]),
    );
  }
  return piezas;
}
