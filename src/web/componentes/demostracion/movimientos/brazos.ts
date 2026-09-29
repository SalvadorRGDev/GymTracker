import {
  agarreRecto,
  anilla,
  apoyoDePecho,
  asa,
  bancoPlano,
  banda,
  barra,
  bastidorDeAperturas,
  brazoDeAperturas,
  cable,
  cuerda,
  mancuerna,
  palanca,
  respaldo,
  rodillo,
  torre,
} from '../aparatos';
import { caja, cilindro, type Pieza, sombra, trazo } from '../escena';
import type { Esqueleto, Objetivo, Par, Pose } from '../esqueleto';
import { combina, cruz, mezcla, resta, rotaZ, unitario, type V3 } from '../vector';
import { type Demostracion, hombrosDe, manos, par, rel } from './comun';

/**
 * Brazos y hombros: los movimientos de una articulación. El codo o el hombro
 * hacen de pivote y la mano recorre un arco a su alrededor, que es lo que el
 * ojo reconoce como «un curl» o «una elevación».
 */

const EJE_NEUTRO: V3 = [1, 0, 0];
const DE_PIE = { pelvis: [0, 90, 0] as V3, tronco: 0, pies: par([2, 7, 11]) };
const arcoEn = (centro: V3) =>
  [{ centro }, { centro: [centro[0], centro[1], -centro[2]] as V3 }] as const;

/** Eje de una mancuerna agarrada en martillo: perpendicular al antebrazo, en su plano. */
function ejeMartillo(e: Esqueleto, i: 0 | 1): V3 {
  const b = e.brazos[i];
  return unitario(cruz(unitario(resta(b.fin, b.medio)), e.marco.derecha), [0, 1, 0]);
}

/* ─── Curls de bíceps ─────────────────────────────────────────────────── */

export type ImplementoDeCurl =
  | 'barra'
  | 'barra-z'
  | 'mancuernas'
  | 'martillo'
  | 'polea'
  | 'banda'
  | 'martillo-polea';

export function curl(op: {
  readonly implemento: ImplementoDeCurl;
  readonly invertido?: boolean;
}): Demostracion {
  const polea: V3 = [62, 8, 0];
  const z =
    op.implemento === 'barra' || op.implemento === 'barra-z' || op.implemento === 'polea' ? 18 : 20;
  const comun = { ...DE_PIE, codos: par([-0.3, -1, 0.1]) };
  // Abajo, una barra va por delante de los muslos y las mancuernas a los lados.
  const conBarra = ['barra', 'barra-z', 'polea', 'martillo-polea'].includes(op.implemento);
  const abajo: V3 =
    op.implemento === 'mancuernas' ? [4, 80, 30] : conBarra ? [10, 80, z] : [4, 80, z];
  const aparatos = (e: Esqueleto): Pieza[] => {
    const [a, b] = manos(e);
    switch (op.implemento) {
      case 'barra':
        return barra(a, b, { eje: [0, 0, 1], radio: 15 });
      case 'barra-z':
        return barra(a, b, { eje: [0, 0, 1], radio: 13, largo: 120 });
      case 'mancuernas':
        return [...mancuerna(a, [0, 0, 1]), ...mancuerna(b, [0, 0, 1])];
      case 'martillo':
        return [...mancuerna(a, ejeMartillo(e, 0)), ...mancuerna(b, ejeMartillo(e, 1))];
      case 'polea':
        return [...cable(polea, mezcla(a, b, 0.5)), agarreRecto(a, b, 6)];
      case 'martillo-polea': {
        const nudo = combina(mezcla(a, b, 0.5), [unitario(resta(polea, mezcla(a, b, 0.5))), 10]);
        return [...cable(polea, nudo), ...cuerda(nudo, a, b)];
      }
      case 'banda':
        return [banda([2, 3, 11], a), banda([2, 3, -11], b)];
    }
  };
  const titulo =
    op.invertido === true
      ? 'curl invertido con barra Z'
      : {
          barra: 'curl con barra',
          'barra-z': 'curl con barra Z',
          mancuernas: 'curl con mancuernas',
          martillo: 'curl martillo',
          polea: 'curl en polea',
          banda: 'curl con banda',
          'martillo-polea': 'curl martillo en polea',
        }[op.implemento];
  return {
    titulo,
    pista:
      op.invertido === true
        ? 'Con las palmas hacia abajo y los codos pegados al cuerpo, sube la barra doblando los codos y bájala despacio.'
        : 'De pie con los codos pegados al cuerpo, sube el peso doblando los codos sin moverlos hacia delante y bájalo despacio.',
    movimiento: {
      pasos: [
        {
          pose: { ...comun, manos: par(abajo) },
          espera: 200,
          ida: 1000,
          via: { manos: arcoEn([-2, 109, abajo[2]]) },
        },
        { pose: { ...comun, manos: par([22, 128, z]) }, espera: 250, ida: 1300 },
      ],
      escena: [
        ...(op.implemento === 'polea' || op.implemento === 'martillo-polea'
          ? torre(70, 0, 180)
          : []),
        sombra(0, 0, 70),
      ],
      aparatos,
    },
  };
}

/** Banco predicador: los brazos apoyados en el atril. Sirve también para la extensión en máquina. */
export function predicador(op: {
  readonly sentido: 'curl' | 'extension';
  readonly implemento: 'barra-z' | 'maquina';
}): Demostracion {
  const pelvis: V3 = [0, 56, 0];
  const codo: V3 = [39, 81, 18];
  const estirado = par([55, 53.3, 18]);
  const doblado = par([32.6, 112.4, 18]);
  const [inicio, final] = op.sentido === 'curl' ? [estirado, doblado] : [doblado, estirado];
  const comun = { pelvis, tronco: 20, pies: par([40, 7, 15]), codos: par([0.5, -1, 0]) };
  return {
    titulo:
      op.sentido === 'curl'
        ? op.implemento === 'maquina'
          ? 'curl en máquina (predicador)'
          : 'curl predicador con barra Z'
        : 'extensión de tríceps en máquina',
    pista:
      op.sentido === 'curl'
        ? 'Con la parte de atrás de los brazos apoyada en el atril, sube el peso doblando los codos y bájalo hasta casi estirarlos.'
        : 'Con los brazos apoyados en el atril, estira los codos empujando las asas hacia abajo y vuelve despacio.',
    movimiento: {
      pasos: [
        { pose: { ...comun, manos: inicio }, espera: 200, ida: 1000, via: { manos: arcoEn(codo) } },
        { pose: { ...comun, manos: final }, espera: 250, ida: 1300 },
      ],
      escena: [
        ...caja([0, 42, 0], [15, 4, 15]),
        trazo([0, 38, 0], [0, 0, 0], 5, 'pata'),
        // El atril: la profundidad de cada cara decide si tapa al brazo lejano.
        ...caja([22.9, 78.1, 0], [8, 3, 22], { giro: -51.5 }),
        trazo([40, 70, 0], [40, 0, 0], 5, 'pata'),
        sombra(14, 0, 80),
      ],
      aparatos: (e) => {
        const [a, b] = manos(e);
        if (op.implemento === 'barra-z')
          return barra(a, b, { eje: [0, 0, 1], radio: 13, largo: 120 });
        return [
          agarreRecto(a, b, 6),
          ...manos(e).map((m, i) =>
            palanca([39, 81, i === 0 ? 28 : -28], [m[0], m[1], i === 0 ? 28 : -28]),
          ),
        ];
      },
    },
  };
}

export function curlConcentrado(): Demostracion {
  const comun = {
    pelvis: [0, 50, 0] as V3,
    tronco: 35,
    pies: par([40, 7, 26]),
    rodillas: par([1, 0, 0.4]),
    codos: [
      [0.1, -1, -0.3],
      [-0.5, -1, 0.3],
    ] as Par<V3>,
  };
  const izquierda: V3 = [40, 54, -26];
  return {
    titulo: 'curl concentrado',
    pista:
      'Sentado, con el codo apoyado en la cara interna del muslo, sube la mancuerna hacia el hombro y bájala hasta estirar el brazo.',
    movimiento: {
      pasos: [
        {
          pose: { ...comun, manos: [[36, 30, 6], izquierda] },
          espera: 200,
          ida: 1000,
          via: { manos: [{ centro: [31, 60, 14] }, null] },
        },
        { pose: { ...comun, manos: [[40, 89, 8], izquierda] }, espera: 250, ida: 1300 },
      ],
      escena: [...bancoPlano(-40, 20, { alto: 40 }), sombra(10, 0, 80)],
      aparatos: (e) => mancuerna(e.brazos[0].fin, [0, 0, 1]),
    },
  };
}

export function curlInclinado(): Demostracion {
  const r = respaldo([10, 46, 0], 50, 90);
  const comun = {
    pelvis: [14, 56, 0] as V3,
    tronco: -40,
    pies: par([60, 7, 16]),
    codos: par([-0.3, -1, 0]),
  };
  return {
    titulo: 'curl en banco inclinado con mancuernas',
    pista:
      'Recostado en un banco inclinado con los brazos colgando, sube las mancuernas doblando los codos sin adelantarlos y bájalas del todo.',
    movimiento: {
      pasos: [
        {
          pose: { ...comun, manos: par([-16, 34, 27]) },
          espera: 200,
          ida: 1000,
          via: { manos: arcoEn([-17, 63, 20]) },
        },
        { pose: { ...comun, manos: par([10, 82, 27]) }, espera: 250, ida: 1300 },
      ],
      escena: [...r.piezas, ...bancoPlano(6, 40, { alto: 46 }), sombra(10, 0, 90)],
      aparatos: (e) => manos(e).flatMap((m) => mancuerna(m, [0, 0, 1])),
    },
  };
}

export function curlBayesian(): Demostracion {
  const polea: V3 = [-80, 30, 20];
  const comun = {
    ...DE_PIE,
    pies: [
      [-16, 7, 12],
      [14, 7, -11],
    ] as Par<V3>,
    codos: [
      [-1, -0.5, 0],
      [-0.5, 0, -1],
    ] as Par<V3>,
  };
  const izquierda: Objetivo = { desde: 'pelvis', v: [0, 8, -16] };
  return {
    titulo: 'curl Bayesian en polea',
    pista:
      'De espaldas a la polea, con el brazo por detrás del cuerpo, dobla el codo llevando la mano hacia el hombro sin mover el brazo y vuelve despacio.',
    movimiento: {
      pasos: [
        {
          pose: { ...comun, manos: [[-30, 88, 20], izquierda] },
          espera: 200,
          ida: 1000,
          via: { manos: [{ centro: [-12, 112, 20] }, null] },
        },
        { pose: { ...comun, manos: [[12, 132, 20], izquierda] }, espera: 250, ida: 1300 },
      ],
      escena: [...torre(-88, 20, 180), sombra(-20, 0, 100)],
      aparatos: (e) => {
        const m = e.brazos[0].fin;
        return [...cable(polea, m), asa(m, [0, 1, 0], 12)];
      },
    },
  };
}

/** Cuerpo recto boca arriba colgando de un agarre alto, con los talones en el suelo. */
function inclinadoHaciaAtras(tobillo: V3, grados: number): { pelvis: V3; tronco: number } {
  const a = (grados * Math.PI) / 180;
  return {
    pelvis: combina(tobillo, [[-Math.cos(a), Math.sin(a), 0], 83]),
    tronco: -(90 - grados),
  };
}

export function curlEnAnillas(): Demostracion {
  const tobillo: V3 = [96, 10, 0];
  const comun = {
    pies: par([tobillo[0], tobillo[1], 10]),
    puntas: par([tobillo[0] + 6, tobillo[1] + 14, 10]),
    manos: par([0, 140, 14]),
    codos: par([0.6, 0.4, 0.3]),
  };
  const abajo = inclinadoHaciaAtras(tobillo, 36);
  const arriba = inclinadoHaciaAtras(tobillo, 52);
  return {
    titulo: 'curl en anillas',
    pista:
      'Colgado de las anillas con el cuerpo inclinado, dobla los codos llevando las manos hacia la frente sin mover los hombros, y baja despacio.',
    movimiento: {
      pasos: [
        { pose: { ...comun, ...abajo }, espera: 200, ida: 1000 },
        { pose: { ...comun, ...arriba }, espera: 250, ida: 1300 },
      ],
      escena: [
        ...[14, -14].flatMap((z) => [
          trazo([0, 146, z], [0, 225, z], 1.6, 'cable'),
          anilla([0, 140, z]),
        ]),
        sombra(40, 0, 100),
      ],
    },
  };
}

export function curlDeMuneca(op: { readonly invertido?: boolean } = {}): Demostracion {
  const comun = {
    pelvis: [0, 50, 0] as V3,
    tronco: 30,
    pies: par([42, 7, 14]),
    manos: par([48, 58, 12]),
    codos: par([-1, -1, 0]),
  };
  return {
    titulo: op.invertido === true ? 'curl de muñeca invertido' : 'curl de muñeca',
    pista:
      op.invertido === true
        ? 'Sentado con los antebrazos sobre los muslos y las palmas hacia abajo, sube el dorso de la mano doblando sólo la muñeca y bájalo despacio.'
        : 'Sentado con los antebrazos sobre los muslos y las muñecas por fuera de las rodillas, sube la mancuerna doblando sólo la muñeca y bájala despacio.',
    movimiento: {
      pasos: [
        { pose: { ...comun, fase: -55 }, espera: 200, ida: 800 },
        { pose: { ...comun, fase: 45 }, espera: 250, ida: 1000 },
      ],
      escena: [...bancoPlano(-40, 20, { alto: 40 }), sombra(10, 0, 80)],
      aparatos: (e) =>
        e.brazos.flatMap((b) => {
          const antebrazo = unitario(resta(b.fin, b.medio));
          const mano = combina(b.fin, [rotaZ(antebrazo, e.fase), 9]);
          return [trazo(b.fin, mano, 7, 'cuerpo'), ...mancuerna(mano, [0, 0, 1])];
        }),
    },
  };
}

/* ─── Tríceps ─────────────────────────────────────────────────────────── */

export function extensionEnPolea(op: {
  readonly agarre: 'barra' | 'cuerda' | 'banda';
}): Demostracion {
  const polea: V3 = [60, 200, 0];
  const comun = {
    pelvis: [0, 90, 0] as V3,
    tronco: 10,
    pies: par([2, 7, 11]),
    codos: par([-1, -0.3, 0.2]),
  };
  const z = op.agarre === 'barra' ? 12 : 14;
  return {
    titulo:
      op.agarre === 'banda'
        ? 'extensión de tríceps con banda'
        : `extensión de tríceps en polea ${op.agarre === 'barra' ? 'con barra' : 'con cuerda'}`,
    pista:
      'De pie frente a la polea alta, con los codos pegados al cuerpo, estira los brazos hacia abajo y vuelve despacio hasta que los antebrazos queden paralelos al suelo.',
    movimiento: {
      pasos: [
        {
          pose: { ...comun, manos: par([34, 118, z]) },
          espera: 200,
          ida: 900,
          via: { manos: arcoEn([6, 109, z]) },
        },
        { pose: { ...comun, manos: par([14, 79, z]) }, espera: 250, ida: 1200 },
      ],
      escena: [...torre(68, 0, 210), sombra(20, 0, 90)],
      aparatos: (e) => {
        const [a, b] = manos(e);
        if (op.agarre === 'banda') return [banda(polea, a), banda(polea, b)];
        if (op.agarre === 'barra')
          return [...cable(polea, mezcla(a, b, 0.5)), agarreRecto(a, b, 6)];
        const nudo = combina(mezcla(a, b, 0.5), [unitario(resta(polea, mezcla(a, b, 0.5))), 10]);
        return [...cable(polea, nudo), ...cuerda(nudo, a, b)];
      },
    },
  };
}

export function extensionTrasNuca(op: {
  readonly implemento: 'mancuerna' | 'polea';
}): Demostracion {
  const conPolea = op.implemento === 'polea';
  const polea: V3 = [-70, 30, 0];
  const comun = { ...DE_PIE, tronco: conPolea ? 18 : 0, codos: par([0.6, 1, 0.3]) };
  const h = hombrosDe(comun.pelvis, comun.tronco);
  const codo: V3 = [h[0] + 2, h[1] + 30, 8];
  return {
    titulo: `extensión de tríceps tras la nuca ${conPolea ? 'en polea' : 'con mancuerna'}`,
    pista:
      'Con los brazos junto a la cabeza y los codos hacia arriba, baja el peso por detrás de la cabeza doblando los codos y súbelo estirándolos.',
    movimiento: {
      pasos: [
        {
          pose: { ...comun, manos: par([h[0] + 4, h[1] + 60, 8]) },
          espera: 250,
          ida: 1200,
          via: { manos: arcoEn(codo) },
        },
        { pose: { ...comun, manos: par([h[0] - 26, h[1] + 16, 6]) }, espera: 150, ida: 1000 },
      ],
      escena: [...(conPolea ? torre(-78, 0, 180) : []), sombra(conPolea ? -20 : 0, 0, 80)],
      aparatos: (e) => {
        const [a, b] = manos(e);
        const medio = mezcla(a, b, 0.5);
        if (conPolea) {
          const nudo = combina(medio, [unitario(resta(polea, medio)), 10]);
          return [...cable(polea, nudo), ...cuerda(nudo, a, b)];
        }
        const b0 = e.brazos[0];
        return mancuerna(
          combina(medio, [unitario(resta(b0.fin, b0.medio)), 6]),
          unitario(resta(b0.fin, b0.medio)),
        );
      },
    },
  };
}

export function pressFrances(op: { readonly implemento: 'barra-z' | 'mancuernas' }): Demostracion {
  const comun = {
    pelvis: [18, 56, 0] as V3,
    tronco: -90,
    pies: par([70, 7, 22]),
    rodillas: par([0.3, 1, 0.2]),
    codos: par([-0.2, 1, 0.2]),
  };
  return {
    titulo: `press francés ${op.implemento === 'barra-z' ? 'con barra Z' : 'con mancuernas'}`,
    pista:
      'Tumbado en el banco con los brazos estirados hacia el techo, baja el peso hacia la frente doblando sólo los codos y vuelve a estirarlos.',
    movimiento: {
      pasos: [
        {
          pose: { ...comun, manos: par([-36, 117, 12]) },
          espera: 250,
          ida: 1300,
          via: { manos: arcoEn([-36, 86, 13]) },
        },
        { pose: { ...comun, manos: par([-66, 80, 12]) }, espera: 150, ida: 1000 },
      ],
      escena: [...bancoPlano(-72, 42), sombra(-10, 0, 100)],
      aparatos: (e) => {
        const [a, b] = manos(e);
        if (op.implemento === 'barra-z')
          return barra(a, b, { eje: [0, 0, 1], radio: 13, largo: 120 });
        return [...mancuerna(a, EJE_NEUTRO), ...mancuerna(b, EJE_NEUTRO)];
      },
    },
  };
}

export function patadaDeTriceps(op: { readonly implemento: 'mancuerna' | 'polea' }): Demostracion {
  const conPolea = op.implemento === 'polea';
  const polea: V3 = [80, 20, 20];
  const comun = {
    pelvis: [-22, 86, 0] as V3,
    tronco: 80,
    cabeza: -10,
    pies: [
      [-4, 7, 22],
      [-66, 49, -10],
    ] as Par<V3>,
    rodillas: [
      [1, 0, 0.1],
      [0, -1, 0],
    ] as Par<V3>,
    puntas: [null, [-81, 45.5, -10]] as Par<V3 | null>,
    codos: [
      [0, 1, 0.1],
      [0, -1, -0.2],
    ] as Par<V3>,
  };
  const izquierda: V3 = [32, 45, -16];
  return {
    titulo: `patada de tríceps ${conPolea ? 'en polea' : 'con mancuerna'}`,
    pista:
      'Inclinado con la espalda recta y el brazo pegado al costado, estira el codo llevando el peso hacia atrás y vuelve despacio sin mover el brazo.',
    movimiento: {
      pasos: [
        {
          pose: { ...comun, manos: [[-2, 63, 24], izquierda] },
          espera: 200,
          ida: 900,
          via: { manos: [{ centro: [-3.8, 94.7, 24] }, null] },
        },
        { pose: { ...comun, manos: [[-35, 96, 24], izquierda] }, espera: 300, ida: 1100 },
      ],
      escena: [
        ...bancoPlano(-82, 42, { alto: 40 }),
        ...(conPolea ? torre(88, 20, 150) : []),
        sombra(-10, 0, 90),
      ],
      aparatos: (e) => {
        const m = e.brazos[0].fin;
        return conPolea ? [...cable(polea, m), asa(m, [0, 1, 0], 12)] : mancuerna(m, EJE_NEUTRO);
      },
    },
  };
}

/* ─── Hombros: elevaciones y pájaros ──────────────────────────────────── */

export function elevacionLateral(op: {
  readonly implemento: 'mancuernas' | 'banda' | 'maquina' | 'polea';
  readonly sentado?: boolean;
}): Demostracion {
  const sentado = op.sentado === true || op.implemento === 'maquina';
  const pelvis: V3 = sentado ? [0, 56, 0] : [0, 90, 0];
  const h = hombrosDe(pelvis, 0);
  const unaMano = op.implemento === 'polea';
  const escena: Pieza[] = [sombra(0, 0, 90)];
  if (sentado)
    escena.push(...caja([0, 42, 0], [15, 4, 15]), trazo([0, 38, 0], [0, 0, 0], 5, 'pata'));
  if (op.implemento === 'maquina') escena.push(...caja([-18, 96, 0], [4, 40, 14]));
  if (unaMano) escena.push(...torre(4, -84, 190));
  const pies = sentado ? par([42, 7, 15]) : par([2, 7, 11]);
  const izquierdaQuieta: Objetivo = { desde: 'pelvis', v: [0, 8, -16] };
  const abajo: Par<Objetivo> = unaMano
    ? [[h[0] + 16, h[1] - 48, 0], izquierdaQuieta]
    : par([h[0] + 4, h[1] - 54, 24]);
  const arriba: Par<Objetivo> = unaMano
    ? [[h[0] + 4, h[1] - 2, 74], izquierdaQuieta]
    : par([h[0] + 4, h[1] - 2, 74]);
  const polea: V3 = [4, 8, -76];
  return {
    titulo:
      op.implemento === 'maquina'
        ? 'elevaciones laterales en máquina'
        : unaMano
          ? 'elevación lateral a una mano en polea'
          : `elevaciones laterales ${op.implemento === 'banda' ? 'con banda' : 'con mancuernas'}${sentado ? ', sentado' : ''}`,
    pista:
      'Con los brazos a los lados, súbelos hacia fuera hasta la altura de los hombros con los codos un poco doblados, y bájalos despacio.',
    movimiento: {
      camara: { giro: 68, alzado: 10 },
      pasos: [
        {
          pose: { pelvis, tronco: 0, pies, manos: abajo, codos: par([-0.5, -1, 0]) },
          espera: 200,
          ida: 1000,
          via: { manos: unaMano ? [{ centro: [h[0], h[1], 17] }, null] : arcoEn([h[0], h[1], 17]) },
        },
        {
          pose: { pelvis, tronco: 0, pies, manos: arriba, codos: par([-0.5, -1, 0]) },
          espera: 250,
          ida: 1300,
        },
      ],
      escena,
      aparatos: (e) => {
        const [a, b] = manos(e);
        switch (op.implemento) {
          case 'mancuernas':
            return [...mancuerna(a, e.marco.delante), ...mancuerna(b, e.marco.delante)];
          case 'banda':
            return [banda([2, 3, 11], a), banda([2, 3, -11], b)];
          case 'polea':
            return [...cable(polea, a), asa(a, [0, 1, 0], 12)];
          case 'maquina':
            // La palanca gira sobre un eje que pasa por detrás del hombro y
            // empuja el brazo por fuera, por encima del codo.
            return e.brazos.flatMap((c, i) => {
              const lado = i === 0 ? 1 : -1;
              const hacia = unitario(resta(c.medio, c.raiz));
              const fuera = unitario([0, lado * hacia[2], -lado * hacia[1]], [0, 0, lado]);
              const atras: V3 = [-9, 0, 0];
              const pivote = combina(c.raiz, [atras, 1]);
              const apoyo = combina(c.raiz, [hacia, 23], [fuera, 8.5]);
              return [
                cilindro(
                  combina(pivote, [atras, 0.6]),
                  combina(pivote, [atras, -0.1]),
                  3.4,
                  'acero',
                ),
                palanca(pivote, combina(apoyo, [atras, 1])),
                palanca(combina(apoyo, [atras, 1]), apoyo),
                rodillo(
                  combina(c.raiz, [hacia, 16], [fuera, 8.5]),
                  combina(c.raiz, [hacia, 30], [fuera, 8.5]),
                  4,
                ),
              ];
            });
        }
      },
    },
  };
}

export function elevacionFrontal(op: {
  readonly implemento: 'mancuernas' | 'polea';
}): Demostracion {
  const polea: V3 = [-50, 8, 0];
  const comun = { ...DE_PIE, codos: par([-1, -0.3, 0.1]) };
  const z = op.implemento === 'polea' ? 12 : 20;
  return {
    titulo: `elevaciones frontales ${op.implemento === 'polea' ? 'en polea' : 'con mancuernas'}`,
    pista:
      'De pie, sube los brazos estirados hacia delante hasta la altura de los hombros y bájalos despacio, sin balancear el cuerpo.',
    movimiento: {
      pasos: [
        {
          pose: { ...comun, manos: par([12, 84, op.implemento === 'polea' ? z : 22]) },
          espera: 200,
          ida: 1000,
          via: { manos: arcoEn([0, 140, z]) },
        },
        { pose: { ...comun, manos: par([58, 142, z]) }, espera: 250, ida: 1300 },
      ],
      escena: [...(op.implemento === 'polea' ? torre(-58, 0, 170) : []), sombra(0, 0, 80)],
      aparatos: (e) => {
        const [a, b] = manos(e);
        return op.implemento === 'polea'
          ? [...cable(polea, mezcla(a, b, 0.5)), agarreRecto(a, b, 6)]
          : [...mancuerna(a, [0, 0, 1]), ...mancuerna(b, [0, 0, 1])];
      },
    },
  };
}

export function pajaros(op: { readonly soporte: 'de-pie' | 'banco' }): Demostracion {
  if (op.soporte === 'banco') {
    const pelvis: V3 = [0, 86, 0];
    const h = hombrosDe(pelvis, 45);
    const comun = {
      pelvis,
      tronco: 45,
      cabeza: -15,
      pies: par([-10, 7, 14]),
      codos: par([-0.3, 1, 0.3]),
    };
    return {
      titulo: 'pájaros en banco inclinado',
      pista:
        'Con el pecho apoyado en el banco inclinado, abre los brazos hacia los lados hasta la altura de los hombros y bájalos despacio.',
      movimiento: {
        camara: { giro: -40, alzado: 30 },
        pasos: [
          {
            pose: { ...comun, manos: par([h[0] + 2, h[1] - 57, 20]) },
            espera: 200,
            ida: 1000,
            via: { manos: arcoEn([h[0], h[1], 17]) },
          },
          { pose: { ...comun, manos: par([h[0] + 2, h[1] - 4, 74]) }, espera: 250, ida: 1300 },
        ],
        escena: [...apoyoDePecho(pelvis, 45), sombra(10, 0, 90)],
        aparatos: (e) => manos(e).flatMap((m) => mancuerna(m, EJE_NEUTRO)),
      },
    };
  }
  const pelvis: V3 = [-20, 84, 0];
  const h = hombrosDe(pelvis, 75);
  const comun = {
    pelvis,
    tronco: 75,
    cabeza: -15,
    pies: par([2, 7, 12]),
    codos: par([-0.3, 1, 0.3]),
  };
  return {
    titulo: 'pájaros con mancuernas',
    pista:
      'Inclinado hacia delante con la espalda recta, abre los brazos hacia los lados hasta la altura de los hombros y bájalos despacio.',
    movimiento: {
      camara: { giro: 58, alzado: 14 },
      pasos: [
        {
          pose: { ...comun, manos: par([h[0] + 2, h[1] - 59, 20]) },
          espera: 200,
          ida: 1000,
          via: { manos: arcoEn([h[0], h[1], 17]) },
        },
        { pose: { ...comun, manos: par([h[0] + 2, h[1] - 5, 74]) }, espera: 250, ida: 1300 },
      ],
      escena: [sombra(0, 0, 90)],
      aparatos: (e) => manos(e).flatMap((m) => mancuerna(m, EJE_NEUTRO)),
    },
  };
}

export function aperturaInversa(op: {
  readonly implemento: 'polea' | 'maquina' | 'banda' | 'anillas';
}): Demostracion {
  if (op.implemento === 'anillas') return pajarosEnAnillas();
  const sentado = op.implemento === 'maquina';
  const pelvis: V3 = sentado ? [0, 56, 0] : [0, 90, 0];
  const h = hombrosDe(pelvis, 0);
  const comun = {
    pelvis,
    tronco: 0,
    pies: sentado ? par([42, 7, 15]) : par([2, 7, 12]),
    codos: par([-0.3, -1, 0.2]),
  };
  const pivotes = par([h[0], h[1] + 22, 17]);
  const escena: Pieza[] = [sombra(0, 0, 90)];
  if (sentado) {
    escena.push(
      ...caja([0, 42, 0], [15, 4, 15]),
      trazo([0, 38, 0], [0, 0, 0], 5, 'pata'),
      ...caja([16, 104, 0], [3, 18, 12]),
      ...caja([22, 71, 0], [2.5, 71, 5], { clase: 'acero' }),
      ...bastidorDeAperturas(22, pivotes, 144),
    );
  }
  if (op.implemento === 'polea') escena.push(...torre(70, 90, 190), ...torre(70, -90, 190));
  return {
    titulo: {
      polea: 'pájaros en polea',
      maquina: 'pec deck invertido',
      banda: 'separaciones con banda',
      anillas: '',
    }[op.implemento],
    pista:
      'Con los brazos estirados al frente a la altura de los hombros, ábrelos hacia los lados hasta formar una T y vuelve despacio.',
    movimiento: {
      // Desde atrás: lo que trabaja es la parte de atrás del hombro.
      camara: { giro: -40, alzado: 24 },
      pasos: [
        {
          pose: { ...comun, manos: par([h[0] + 58, h[1] - 2, 8]) },
          espera: 200,
          ida: 1000,
          via: { manos: arcoEn([h[0], h[1], 17]) },
        },
        { pose: { ...comun, manos: par([h[0] + 6, h[1] - 2, 74]) }, espera: 250, ida: 1300 },
      ],
      escena,
      aparatos: (e) => {
        const [a, b] = manos(e);
        if (op.implemento === 'banda') return [banda(a, b)];
        if (op.implemento === 'polea')
          return [...cable([70, 140, -90], a), ...cable([70, 140, 90], b)];
        return manos(e).flatMap((m, i) => brazoDeAperturas(pivotes[i === 0 ? 0 : 1], m));
      },
    },
  };
}

function pajarosEnAnillas(): Demostracion {
  const tobillo: V3 = [90, 10, 0];
  const comun = {
    pies: par([tobillo[0], tobillo[1], 10]),
    puntas: par([tobillo[0] + 6, tobillo[1] + 14, 10]),
    codos: par([0, 1, 0.3]),
  };
  const abajo = inclinadoHaciaAtras(tobillo, 40);
  const arriba = inclinadoHaciaAtras(tobillo, 52);
  const anclaje = (z: number): V3 => [0, 230, z];
  return {
    titulo: 'pájaros en anillas',
    pista:
      'Colgado de las anillas con el cuerpo inclinado hacia atrás y los brazos al frente, ábrelos hacia los lados hasta formar una T y vuelve despacio.',
    movimiento: {
      camara: { giro: -35, alzado: 4 },
      pasos: [
        { pose: { ...comun, ...abajo, manos: par([2, 136, 12]) }, espera: 200, ida: 1000 },
        { pose: { ...comun, ...arriba, manos: par([10, 150, 60]) }, espera: 250, ida: 1300 },
      ],
      escena: [sombra(40, 0, 100)],
      aparatos: (e) =>
        manos(e).flatMap((m, i) => [
          trazo(combina(m, [[0, 1, 0], 6]), anclaje(i === 0 ? 20 : -20), 1.6, 'cable'),
          anilla(m),
        ]),
    },
  };
}

export function elevacionesYTW(): Demostracion {
  const comun = {
    pelvis: [0, 12, 0] as V3,
    tronco: 90,
    pies: par([-83.6, 10, 10]),
    puntas: par([-96, 6, 10]),
    codos: par([0, 1, 0.3]),
  };
  return {
    titulo: 'Y-T-W tumbado boca abajo',
    pista:
      'Tumbado boca abajo, levanta los brazos estirados formando una Y, luego una T y luego una W con los codos doblados, apretando los omóplatos.',
    movimiento: {
      camara: { giro: 52, alzado: 34 },
      pasos: [
        { pose: { ...comun, manos: par([95, 8, 50]) }, espera: 200, ida: 800 },
        { pose: { ...comun, manos: par([93, 26, 48]), cabeza: -8 }, espera: 400, ida: 900 },
      ],
      escena: [sombra(0, 0, 110)],
    },
  };
}

export function elevacionesY(): Demostracion {
  const pelvis: V3 = [0, 86, 0];
  const h = hombrosDe(pelvis, 45);
  const comun = {
    pelvis,
    tronco: 45,
    cabeza: -15,
    pies: par([-10, 7, 14]),
    codos: par([-0.3, 1, 0.3]),
  };
  return {
    titulo: 'elevaciones en Y en banco inclinado',
    pista:
      'Con el pecho apoyado en el banco inclinado, sube los brazos estirados por delante formando una Y y bájalos despacio.',
    movimiento: {
      camara: { giro: -40, alzado: 30 },
      pasos: [
        {
          pose: { ...comun, manos: par([h[0] + 2, h[1] - 57, 20]) },
          espera: 200,
          ida: 1000,
          via: { manos: arcoEn([h[0], h[1], 17]) },
        },
        { pose: { ...comun, manos: par([h[0] + 34, h[1] + 34, 46]) }, espera: 250, ida: 1300 },
      ],
      escena: [...apoyoDePecho(pelvis, 45), sombra(10, 0, 90)],
      aparatos: (e) => manos(e).flatMap((m) => mancuerna(m, e.marco.derecha)),
    },
  };
}

/* ─── Pecho aislado ───────────────────────────────────────────────────── */

export function aperturas(op: { readonly banco: 'plano' | 'inclinado' }): Demostracion {
  const inclinado = op.banco === 'inclinado';
  const pelvis: V3 = inclinado ? [16, 55, 0] : [18, 56, 0];
  const tronco = inclinado ? -58 : -90;
  const h = hombrosDe(pelvis, tronco);
  const r = respaldo([10, 44, 0], 32, 92);
  const comun = {
    pelvis,
    tronco,
    pies: inclinado ? par([64, 7, 20]) : par([70, 7, 22]),
    rodillas: par([0.3, 1, 0.2]),
    codos: par([0, -0.5, 1]),
  };
  return {
    titulo: `aperturas con mancuernas en banco ${inclinado ? 'inclinado' : 'plano'}`,
    pista:
      'Tumbado con los brazos estirados sobre el pecho, ábrelos hacia los lados con los codos algo doblados hasta notar el estiramiento y ciérralos por el mismo arco.',
    movimiento: {
      camara: { giro: 58, alzado: 26 },
      pasos: [
        {
          pose: { ...comun, manos: par([h[0] + 2, h[1] + 58, 10]) },
          espera: 250,
          ida: 1300,
          via: { manos: arcoEn([h[0], h[1], 17]) },
        },
        { pose: { ...comun, manos: par([h[0] + 2, h[1] + 6, 72]) }, espera: 150, ida: 1100 },
      ],
      escena: [
        ...(inclinado ? [...r.piezas, ...bancoPlano(4, 44)] : bancoPlano(-72, 42)),
        sombra(-10, 0, 100),
      ],
      aparatos: (e) =>
        manos(e).flatMap((m) => mancuerna(m, inclinado ? unitario([-0.848, 0.53, 0]) : EJE_NEUTRO)),
    },
  };
}

export function cruceDePoleas(op: { readonly altura: 'alta' | 'baja' }): Demostracion {
  const alta = op.altura === 'alta';
  const pelvis: V3 = [0, 90, 0];
  const comun = { pelvis, tronco: 10, pies: par([-2, 7, 13]), codos: par([-0.4, -1, 0.3]) };
  const poleaY = alta ? 200 : 12;
  const inicio = alta ? par([-6, 158, 70]) : par([2, 100, 58]);
  const final = alta ? par([50, 108, 6]) : par([52, 140, 6]);
  const h = hombrosDe(pelvis, 10);
  return {
    titulo: alta ? 'cruce de poleas altas' : 'cruce de poleas bajas',
    pista:
      'De pie entre las dos poleas, lleva los agarres desde los lados hasta juntarlos delante del cuerpo trazando un arco, y vuelve despacio.',
    movimiento: {
      camara: { giro: 55, alzado: 14 },
      pasos: [
        {
          pose: { ...comun, manos: inicio },
          espera: 200,
          ida: 1000,
          via: { manos: arcoEn([h[0], h[1], 17]) },
        },
        { pose: { ...comun, manos: final }, espera: 250, ida: 1300 },
      ],
      escena: [...torre(-14, 92, 210), ...torre(-14, -92, 210), sombra(0, 0, 100)],
      aparatos: (e) =>
        manos(e).flatMap((m, i) => [
          ...cable([-8, poleaY, i === 0 ? 86 : -86], m),
          asa(m, [0, 1, 0], 12),
        ]),
    },
  };
}

export function pecDeck(): Demostracion {
  const pelvis: V3 = [0, 56, 0];
  const h = hombrosDe(pelvis, 0);
  const comun = { pelvis, tronco: 0, pies: par([42, 7, 15]), codos: par([-0.3, -1, 0.3]) };
  const pivotes = par([h[0], h[1] + 22, 17]);
  return {
    titulo: 'pec deck (aperturas en máquina)',
    pista:
      'Sentado con la espalda apoyada y los brazos abiertos, junta las asas delante del pecho y ábrelas despacio.',
    movimiento: {
      camara: { giro: 55, alzado: 24 },
      pasos: [
        {
          pose: { ...comun, manos: par([8, 108, 70]) },
          espera: 200,
          ida: 1000,
          via: { manos: arcoEn([h[0], h[1], 17]) },
        },
        { pose: { ...comun, manos: par([50, 108, 8]) }, espera: 250, ida: 1300 },
      ],
      escena: [
        ...caja([0, 42, 0], [15, 4, 15]),
        trazo([0, 38, 0], [0, 0, 0], 5, 'pata'),
        ...caja([-18, 100, 0], [4, 42, 14]),
        ...bastidorDeAperturas(-18, pivotes, 144),
        sombra(10, 0, 90),
      ],
      aparatos: (e) => manos(e).flatMap((m, i) => brazoDeAperturas(pivotes[i === 0 ? 0 : 1], m)),
    },
  };
}

export function pullover(): Demostracion {
  const comun = {
    pelvis: [18, 56, 0] as V3,
    tronco: -90,
    pies: par([70, 7, 22]),
    rodillas: par([0.3, 1, 0.2]),
    codos: par([0, 0.3, 1]),
  };
  return {
    titulo: 'pullover con mancuerna',
    pista:
      'Tumbado en el banco con la mancuerna sobre el pecho y los brazos casi estirados, llévala por detrás de la cabeza en arco y vuelve por el mismo camino.',
    movimiento: {
      pasos: [
        {
          pose: { ...comun, manos: par([-30, 116, 4]) },
          espera: 250,
          ida: 1400,
          via: { manos: arcoEn([-32, 56, 5]) },
        },
        { pose: { ...comun, manos: par([-90, 66, 4]) }, espera: 150, ida: 1200 },
      ],
      escena: [...bancoPlano(-72, 42), sombra(-10, 0, 100)],
      aparatos: (e) => {
        const [a, b] = manos(e);
        const medio = mezcla(a, b, 0.5);
        const hombros = mezcla(e.hombros[0], e.hombros[1], 0.5);
        const eje = unitario(resta(medio, hombros));
        return mancuerna(combina(medio, [eje, 8]), eje);
      },
    },
  };
}

/* ─── Trapecio ────────────────────────────────────────────────────────── */

export function encogimientos(op: {
  readonly implemento: 'barra' | 'mancuernas' | 'maquina';
}): Demostracion {
  const z = op.implemento === 'barra' ? 22 : 21;
  const x = op.implemento === 'barra' ? 11 : 2;
  const comun: Omit<Pose, 'manos'> = { ...DE_PIE, codos: par([-1, -0.2, 0.1]) };
  return {
    titulo: `encogimientos ${{ barra: 'con barra', mancuernas: 'con mancuernas', maquina: 'en máquina' }[op.implemento]}`,
    pista:
      'De pie con el peso colgando, sube los hombros hacia las orejas sin doblar los codos, aguanta un instante y bájalos despacio.',
    movimiento: {
      camara: { giro: 55, alzado: 8 },
      pasos: [
        {
          pose: { ...comun, hombros: 0, manos: rel('cuello', [x, -60, z]) },
          espera: 250,
          ida: 700,
        },
        {
          pose: { ...comun, hombros: 9, manos: rel('cuello', [x, -51, z]) },
          espera: 500,
          ida: 900,
        },
      ],
      escena: [
        ...(op.implemento === 'maquina' ? caja([-20, 90, 0], [4, 90, 30]) : []),
        sombra(0, 0, 70),
      ],
      aparatos: (e) => {
        const [a, b] = manos(e);
        if (op.implemento === 'barra') return barra(a, b, { eje: [0, 0, 1] });
        if (op.implemento === 'mancuernas')
          return [...mancuerna(a, EJE_NEUTRO), ...mancuerna(b, EJE_NEUTRO)];
        // Asas de agarre neutro a los costados, unidas a la máquina de detrás.
        return manos(e).flatMap((m) => [
          palanca([-16, m[1], m[2]], [m[0] - 6, m[1], m[2]]),
          asa(m, [1, 0, 0], 12),
        ]);
      },
    },
  };
}
