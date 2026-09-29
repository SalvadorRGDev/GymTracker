import {
  asa,
  bancoPlano,
  banda,
  barraFija,
  cable,
  cuerda,
  palanca,
  rodillo,
  torre,
} from '../aparatos';
import { caja, cilindro, type Pieza, sombra, trazo } from '../escena';
import type { Objetivo, Par, Pose } from '../esqueleto';
import { combina, mezcla, resta, unitario, type V3 } from '../vector';
import { type Demostracion, manos, par, rel } from './comun';

/* ─── Crunch y variantes ──────────────────────────────────────────────── */

const MANOS_EN_LA_NUCA = rel('cuello', [-4, 14, 12]);
const CODOS_ABIERTOS = par([0.2, 0.3, 1]);

export function crunch(op: { readonly banco?: 'declinado' } = {}): Demostracion {
  if (op.banco === 'declinado') {
    const comun = {
      pelvis: [16, 60, 0] as V3,
      manos: MANOS_EN_LA_NUCA,
      codos: CODOS_ABIERTOS,
      pies: par([58, 36, 11]),
      rodillas: par([0.6, 1, 0.1]),
    };
    return {
      titulo: 'crunch en banco declinado',
      pista:
        'Con los pies sujetos y la cabeza más baja que la cadera, despega la espalda del banco acercando el pecho a las rodillas y baja despacio.',
      movimiento: {
        pasos: [
          { pose: { ...comun, tronco: -105 }, espera: 250, ida: 900 },
          { pose: { ...comun, tronco: -62, cabeza: 20 }, espera: 300, ida: 1100 },
        ],
        escena: [
          ...caja([-14, 38, 0], [58, 4, 13], { giro: 15 }),
          trazo([-40, 20, 0], [-40, 0, 0], 5, 'pata'),
          trazo([22, 45, 0], [22, 0, 0], 5, 'pata'),
          rodillo([54, 52, -18], [54, 52, 18], 4.5),
          trazo([54, 52, 0], [48, 0, 0], 5, 'pata'),
          sombra(0, 0, 100),
        ],
      },
    };
  }
  const comun = {
    pelvis: [10, 12, 0] as V3,
    manos: MANOS_EN_LA_NUCA,
    codos: CODOS_ABIERTOS,
    pies: par([50, 7, 12]),
    rodillas: par([0.3, 1, 0.1]),
  };
  return {
    titulo: 'crunch en el suelo',
    pista:
      'Tumbado boca arriba con las rodillas dobladas, despega los hombros del suelo acercando las costillas a la cadera y baja despacio. No tires del cuello.',
    movimiento: {
      pasos: [
        { pose: { ...comun, tronco: -90 }, espera: 250, ida: 800 },
        { pose: { ...comun, tronco: -64, cabeza: 20 }, espera: 300, ida: 1000 },
      ],
      escena: [sombra(0, 0, 90)],
    },
  };
}

export function crunchEnMaquina(): Demostracion {
  const comun = {
    pelvis: [0, 56, 0] as V3,
    pies: par([42, 7, 15]),
    manos: rel('cuello', [8, 2, 20]),
  };
  return {
    titulo: 'crunch en máquina',
    pista:
      'Sentado en la máquina, flexiona el tronco hacia delante acercando el pecho a la cadera y vuelve despacio.',
    movimiento: {
      pasos: [
        { pose: { ...comun, tronco: -4 }, espera: 250, ida: 900 },
        { pose: { ...comun, tronco: 34, cabeza: 15 }, espera: 300, ida: 1100 },
      ],
      escena: [
        ...caja([0, 42, 0], [16, 4, 15]),
        trazo([0, 38, 0], [0, 0, 0], 5, 'pata'),
        ...caja([-18, 92, 0], [4, 32, 14]),
        sombra(10),
      ],
      // Las palancas giran a la altura de la cadera, que es donde gira el
      // tronco: así acompañan a las manos sin estirarse.
      aparatos: (e) =>
        manos(e).flatMap((m, i) => {
          const z = i === 0 ? 26 : -26;
          const bajo = combina(m, [e.marco.arriba, -6]);
          return [
            cilindro([0, 56, z * 0.85], [0, 56, z * 1.15], 4.5, 'acero'),
            palanca([0, 56, z], [bajo[0], bajo[1], z]),
            palanca([bajo[0], bajo[1], z], bajo),
            asa(m, e.marco.arriba, 12),
          ];
        }),
    },
  };
}

export function crunchEnPolea(): Demostracion {
  const polea: V3 = [94, 205, 0];
  const comun = {
    pelvis: [2, 51.5, 0] as V3,
    pies: par([-40.1, 9, 9]),
    rodillas: par([1, -1, 0]),
    manos: rel('cuello', [15, 10, 15]),
    codos: par([0.4, -0.3, 1]),
  };
  return {
    titulo: 'crunch de rodillas en polea',
    pista:
      'De rodillas frente a la polea alta, con la cuerda junto a la cabeza, flexiona el tronco llevando los codos hacia los muslos y vuelve despacio.',
    movimiento: {
      pasos: [
        { pose: { ...comun, tronco: 20 }, espera: 250, ida: 900 },
        { pose: { ...comun, tronco: 78, cabeza: 25 }, espera: 300, ida: 1100 },
      ],
      escena: [...torre(102, 0, 210), ...caja([0, 2, 0], [20, 2, 20]), sombra(30, 0, 100)],
      aparatos: (e) => {
        const [a, b] = manos(e);
        // El nudo queda delante de la cara y por encima, camino de la polea.
        const medio = combina(mezcla(a, b, 0.5), [e.marco.delante, 4]);
        const nudo = combina(medio, [unitario(resta(polea, medio)), 10]);
        return [...cable(polea, nudo), ...cuerda(nudo, a, b)];
      },
    },
  };
}

export function crunchInverso(): Demostracion {
  const comun = { manos: par([12, 6, 26]), codos: par([0, 0.3, 1]) };
  return {
    titulo: 'crunch inverso',
    pista:
      'Tumbado boca arriba con las rodillas dobladas en el aire, llévalas hacia el pecho despegando un poco la cadera del suelo y vuelve despacio.',
    movimiento: {
      pasos: [
        {
          pose: {
            ...comun,
            pelvis: [10, 12, 0],
            tronco: -90,
            pies: par([46, 44, 10]),
            rodillas: par([0.3, 1, 0.1]),
          },
          espera: 250,
          ida: 900,
        },
        {
          pose: {
            ...comun,
            pelvis: [6, 20, 0],
            tronco: -100,
            cabeza: 15,
            pies: par([6, 62, 10]),
            rodillas: par([-0.6, 1, 0.1]),
          },
          espera: 300,
          ida: 1100,
        },
      ],
      escena: [sombra(0, 0, 90)],
    },
  };
}

/* ─── Elevaciones de piernas, L-sit y posición hueca ──────────────────── */

export function elevacionDePiernas(op: {
  readonly apoyo: 'suelo' | 'colgado' | 'paralelas';
}): Demostracion {
  if (op.apoyo === 'suelo') {
    const comun = {
      pelvis: [10, 12, 0] as V3,
      tronco: -90,
      manos: par([14, 4, 26]),
      codos: par([0, 0, 1]),
    };
    return {
      titulo: 'elevaciones de piernas tumbado',
      pista:
        'Tumbado boca arriba con las piernas estiradas, súbelas hasta la vertical sin doblar las rodillas y bájalas despacio sin llegar a tocar el suelo.',
      movimiento: {
        pasos: [
          {
            pose: { ...comun, pies: par([92, 9, 9]) },
            espera: 200,
            ida: 1000,
            via: { pies: [{ centro: [10, 12, 9] }, { centro: [10, 12, -9] }] },
          },
          { pose: { ...comun, pies: par([14, 94, 9]) }, espera: 250, ida: 1300 },
        ],
        escena: [sombra(20, 0, 100)],
      },
    };
  }
  if (op.apoyo === 'colgado') {
    const comun = {
      manos: par([6, 218, 28]) as Par<Objetivo>,
      codos: par([0.3, -1, 0.9]),
    };
    return {
      titulo: 'elevaciones de piernas colgado',
      pista:
        'Colgado de la barra, sube las piernas estiradas hasta la horizontal sin balancearte y bájalas con control.',
      movimiento: {
        pasos: [
          {
            pose: { ...comun, pelvis: [13, 109.5, 0], tronco: -8, pies: par([8, 28, 7]) },
            espera: 200,
            ida: 1000,
            via: { pies: [{ centro: [13, 109.5, 9] }, { centro: [13, 109.5, -9] }] },
          },
          {
            pose: { ...comun, pelvis: [10, 110, 0], tronco: -12, pies: par([94, 106, 7]) },
            espera: 250,
            ida: 1300,
          },
        ],
        escena: [...barraFija(6, 218), sombra(10, 0, 70)],
      },
    };
  }
  const comun = {
    pelvis: [-2, 115, 0] as V3,
    tronco: 0,
    manos: par([0, 105, 26]),
    codos: par([-1, 0, 0.2]),
  };
  return {
    titulo: 'elevaciones de rodillas en paralelas',
    pista:
      'Apoyado en las paralelas con los brazos estirados y la espalda contra el respaldo, sube las rodillas hacia el pecho y bájalas despacio.',
    movimiento: {
      pasos: [
        { pose: { ...comun, pies: par([-2, 33, 7]) }, espera: 200, ida: 900 },
        {
          pose: { ...comun, pies: par([30, 90, 7]), rodillas: par([1, 0.3, 0.1]) },
          espera: 300,
          ida: 1100,
        },
      ],
      escena: [...paralelas(), sombra(0, 0, 70)],
    },
  };
}

function paralelas(): Pieza[] {
  const piezas: Pieza[] = [];
  for (const z of [-26, 26]) {
    piezas.push(trazo([-38, 105, z], [38, 105, z], 5, 'pata'));
    for (const x of [-32, 32]) piezas.push(trazo([x, 0, z], [x, 105, z], 5, 'pata'));
  }
  return piezas;
}

export function lSit(): Demostracion {
  const pose: Pose = {
    pelvis: [-2, 115, 0],
    tronco: 4,
    manos: par([0, 105, 26]),
    codos: par([-1, 0, 0.2]),
    pies: par([80, 110, 7]),
  };
  return {
    titulo: 'L-sit en paralelas',
    pista:
      'Apoyado en las paralelas con los brazos estirados, levanta las piernas rectas hasta la horizontal y aguanta.',
    movimiento: {
      pasos: [
        { pose, espera: 700, ida: 1300 },
        { pose: { ...pose, pies: par([80, 113, 7]), hombros: 1 }, espera: 700, ida: 1300 },
      ],
      escena: [...paralelas(), sombra(20, 0, 80)],
      sostenido: true,
    },
  };
}

export function posicionHueca(): Demostracion {
  const pose: Pose = {
    pelvis: [0, 12, 0],
    tronco: -75,
    cabeza: 20,
    manos: par([-104, 34, 12]),
    pies: par([80, 30, 7]),
    rodillas: par([0.2, 1, 0]),
  };
  return {
    titulo: 'posición hueca',
    pista:
      'Boca arriba, con la zona lumbar pegada al suelo, despega hombros y piernas estiradas y aguanta la postura en forma de plátano.',
    movimiento: {
      pasos: [
        { pose, espera: 700, ida: 1300 },
        { pose: { ...pose, tronco: -76, pies: par([80, 28, 7]) }, espera: 700, ida: 1300 },
      ],
      escena: [sombra(-10, 0, 110)],
      sostenido: true,
    },
  };
}

export function dragonFlag(): Demostracion {
  const hombros: V3 = [-40, 56, 0];
  const cuerpo = (grados: number): Pose => {
    const a = (grados * Math.PI) / 180;
    const haciaLosPies: V3 = [Math.cos(a), Math.sin(a), 0];
    const pelvis = combina(hombros, [haciaLosPies, 50]);
    const pies = combina(pelvis, [haciaLosPies, 82]);
    return {
      pelvis,
      tronco: -(90 + grados),
      cabeza: grados,
      manos: par([-66, 46, 12]),
      codos: par([0, 1, 0.2]),
      pies: par([pies[0], pies[1], 8]),
    };
  };
  return {
    titulo: 'dragon flag',
    pista:
      'Tumbado en el banco sujetándote detrás de la cabeza, sube el cuerpo recto apoyado sólo en los hombros y bájalo despacio sin doblar la cadera.',
    movimiento: {
      pasos: [
        {
          pose: cuerpo(72),
          espera: 250,
          ida: 1800,
          via: {
            pelvis: { centro: hombros },
            pies: [{ centro: [-40, 56, 8] }, { centro: [-40, 56, -8] }],
          },
        },
        { pose: cuerpo(12), espera: 200, ida: 1200 },
      ],
      escena: [...bancoPlano(-72, 30), sombra(0, 0, 100)],
    },
  };
}

/* ─── Planchas ────────────────────────────────────────────────────────── */

export function plancha(): Demostracion {
  const grados = 10.4;
  const a = (grados * Math.PI) / 180;
  const tobillo: V3 = [-133 * Math.cos(a), 11, 0];
  const dir: V3 = [Math.cos(a), Math.sin(a), 0];
  const pelvis = combina(tobillo, [dir, 83]);
  const pose: Pose = {
    pelvis,
    tronco: 90 - grados,
    manos: par([32, 4, 12]),
    codos: par([-0.3, -1, 0]),
    pies: par([tobillo[0], tobillo[1], 9]),
    puntas: par([tobillo[0] + 5, 1, 9]),
  };
  return {
    titulo: 'plancha sobre antebrazos',
    pista:
      'Apoyado en antebrazos y puntas de los pies, mantén el cuerpo recto de la cabeza a los talones, sin hundir ni subir la cadera, y aguanta.',
    movimiento: {
      pasos: [
        { pose, espera: 700, ida: 1300 },
        { pose: { ...pose, pelvis: combina(pelvis, [[0, 1, 0], 1]) }, espera: 700, ida: 1300 },
      ],
      escena: [sombra(-40, 0, 110)],
      sostenido: true,
    },
  };
}

export function planchaLateral(op: { readonly copenhague?: boolean } = {}): Demostracion {
  const copenhague = op.copenhague === true;
  const pose: Pose = copenhague
    ? {
        pelvis: [0, 50, 4],
        tronco: 0,
        lateral: -75,
        manos: [{ desde: 'pelvis', v: [0, 8, 16] }, [26, 4, -50]],
        codos: [
          [-0.5, 0, 1],
          [-0.4, -1, 0],
        ],
        pies: [
          [0, 50, 80],
          [0, 29, 72],
        ],
        rodillas: [
          [1, 0, 0],
          [1, 0, 0],
        ],
      }
    : {
        pelvis: [0, 43.9, 3.1],
        tronco: 0,
        lateral: -70,
        manos: [{ desde: 'pelvis', v: [0, 8, 16] }, [26, 4, -52]],
        codos: [
          [-0.5, 0, 1],
          [-0.4, -1, 0],
        ],
        pies: [
          [0, 16, 76],
          [0, 7, 78],
        ],
        rodillas: [
          [1, 0, 0],
          [1, 0, 0],
        ],
      };
  const respira: Pose = { ...pose, pelvis: combina(pose.pelvis, [[0, 1, 0], 1.2]) };
  return {
    titulo: copenhague ? 'plancha Copenhague' : 'plancha lateral',
    pista: copenhague
      ? 'De lado con la pierna de arriba sobre un banco, apoyado en el antebrazo, levanta la cadera hasta alinear el cuerpo y aguanta; la pierna de abajo queda en el aire.'
      : 'De lado, apoyado en un antebrazo y en el canto del pie, levanta la cadera hasta alinear el cuerpo y aguanta sin dejarla caer.',
    movimiento: {
      camara: { giro: 78, alzado: 18 },
      pasos: [
        { pose, espera: 700, ida: 1300 },
        { pose: respira, espera: 700, ida: 1300 },
      ],
      escena: [...(copenhague ? caja([0, 40, 82], [22, 4, 16]) : []), sombra(0, 10, 110)],
      sostenido: true,
    },
  };
}

/* ─── Rueda, Pallof, leñador y bird dog ───────────────────────────────── */

export function ruedaAbdominal(): Demostracion {
  const rodilla: V3 = [0, 9.5, 0];
  const cadera = (grados: number): V3 => {
    const a = (grados * Math.PI) / 180;
    return [42 * Math.cos(a), 9.5 + 42 * Math.sin(a), 0];
  };
  const comun = { pies: par([-42, 9, 9]), rodillas: par([1, -1, 0]), codos: par([-1, 0, 0.3]) };
  return {
    titulo: 'rueda abdominal de rodillas',
    pista:
      'De rodillas con las manos en la rueda, rueda hacia delante estirando el cuerpo sin hundir la zona lumbar y vuelve tirando con el abdomen.',
    movimiento: {
      pasos: [
        {
          pose: { ...comun, pelvis: cadera(80), tronco: 60, manos: par([54, 15, 6]) },
          espera: 250,
          ida: 1500,
          via: { pelvis: { centro: rodilla } },
        },
        {
          pose: { ...comun, pelvis: cadera(30), tronco: 82, cabeza: -10, manos: par([142, 15, 6]) },
          espera: 200,
          ida: 1300,
        },
      ],
      escena: [...caja([0, 2, 0], [20, 2, 20]), sombra(50, 0, 110)],
      aparatos: (e) => {
        const [a, b] = manos(e);
        const eje = mezcla(a, b, 0.5);
        const centro: V3 = [eje[0], 11, 0];
        return [
          cilindro([centro[0], centro[1], -13], [centro[0], centro[1], 13], 1.8, 'agarre'),
          cilindro([centro[0], centro[1], -3.5], [centro[0], centro[1], 3.5], 11, 'disco'),
        ];
      },
    },
  };
}

export function pressPallof(op: { readonly implemento: 'polea' | 'banda' }): Demostracion {
  const anclaje: V3 = [2, 120, -110];
  const comun = {
    pelvis: [0, 88, 0] as V3,
    tronco: 0,
    pies: par([2, 7, 16]),
    codos: par([-0.2, -1, 0.5]),
  };
  return {
    titulo: `press Pallof ${op.implemento === 'polea' ? 'en polea' : 'con banda'}`,
    pista:
      'De lado al anclaje, con el agarre en el pecho, estira los brazos al frente sin dejar que el tronco gire, aguanta un momento y vuelve.',
    movimiento: {
      pasos: [
        { pose: { ...comun, manos: par([16, 118, 3]) }, espera: 250, ida: 900 },
        { pose: { ...comun, manos: par([56, 118, 3]) }, espera: 800, ida: 900 },
      ],
      escena: [
        ...(op.implemento === 'polea' ? torre(2, -118, 200) : caja([2, 90, -118], [6, 90, 6])),
        sombra(0, -30, 110),
      ],
      aparatos: (e) => {
        const [a, b] = manos(e);
        const agarre = mezcla(a, b, 0.5);
        return op.implemento === 'polea' ? cable(anclaje, agarre) : [banda(anclaje, agarre)];
      },
    },
  };
}

export function lenador(): Demostracion {
  const polea: V3 = [0, 190, 90];
  const comun = { pies: par([2, 7, 20]), codos: par([-0.3, -1, 0.4]) };
  return {
    titulo: 'leñador en polea',
    pista:
      'De lado a la polea alta, tira del agarre en diagonal hacia la rodilla contraria girando el tronco, con los brazos casi estirados, y vuelve despacio.',
    movimiento: {
      camara: { giro: 40, alzado: 12 },
      pasos: [
        {
          pose: {
            ...comun,
            pelvis: [0, 88, 0],
            tronco: 0,
            giro: 30,
            manos: [
              [18, 158, 42],
              [20, 156, 36],
            ],
          },
          espera: 200,
          ida: 900,
        },
        {
          pose: {
            ...comun,
            pelvis: [-6, 76, 0],
            tronco: 20,
            giro: -35,
            manos: [
              [34, 78, -26],
              [30, 80, -32],
            ],
          },
          espera: 250,
          ida: 1200,
        },
      ],
      escena: [...torre(0, 98, 200), sombra(0, 10, 110)],
      aparatos: (e) => {
        const [a, b] = manos(e);
        return cable(polea, mezcla(a, b, 0.5));
      },
    },
  };
}

export function birdDog(): Demostracion {
  const cuadrupedia: Pose = {
    pelvis: [0, 50, 0],
    tronco: 90,
    cabeza: -20,
    manos: par([50, 3, 17]),
    pies: par([-40, 8, 9]),
    rodillas: par([0, -1, 0]),
  };
  const derecha: Pose = {
    ...cuadrupedia,
    manos: [
      [108, 54, 17],
      [50, 3, -17],
    ],
    pies: [
      [-40, 8, 9],
      [-82, 52, -9],
    ],
  };
  const izquierda: Pose = {
    ...cuadrupedia,
    manos: [
      [50, 3, 17],
      [108, 54, -17],
    ],
    pies: [
      [-82, 52, 9],
      [-40, 8, -9],
    ],
  };
  return {
    titulo: 'bird dog',
    pista:
      'A cuatro patas, estira a la vez un brazo al frente y la pierna contraria hacia atrás, sin girar la cadera; vuelve y cambia de lado.',
    movimiento: {
      pasos: [
        { pose: cuadrupedia, espera: 200, ida: 900 },
        { pose: derecha, espera: 500, ida: 900 },
        { pose: cuadrupedia, espera: 200, ida: 900 },
        { pose: izquierda, espera: 500, ida: 900 },
      ],
      escena: [sombra(10, 0, 100)],
    },
  };
}
