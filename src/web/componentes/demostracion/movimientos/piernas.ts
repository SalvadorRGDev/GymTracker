import {
  bancoPlano,
  banda,
  barra,
  cable,
  kettlebell,
  mancuerna,
  palanca,
  rodillo,
  torre,
} from '../aparatos';
import { caja, cilindro, type Pieza, sombra, trazo } from '../escena';
import type { Esqueleto, Objetivo, Par, Pose, Vias } from '../esqueleto';
import { combina, mezcla, resta, unitario, type V3 } from '../vector';
import { arribaDe, DESDE_ATRAS, type Demostracion, manos, par, rel } from './comun';

const EJE_LATERAL: V3 = [0, 0, 1];
/** La dirección de los raíles de la prensa: 45° hacia arriba y hacia delante. */
const DIAGONAL: V3 = [Math.SQRT1_2, Math.SQRT1_2, 0];
const EJE_NEUTRO: V3 = [1, 0, 0];
/** Brazos colgando a los lados, con una mancuerna en cada mano si la hay. */
const COLGANDO = rel('cuello', [2, -58, 21]);
const EN_LA_CADERA = rel('pelvis', [0, 8, 16]);
const BARRA_EN_LA_ESPALDA = rel('cuello', [-9, -3, 30]);

const mancuernasEnLasManos = (e: Esqueleto): Pieza[] =>
  manos(e).flatMap((m) => mancuerna(m, EJE_NEUTRO));

/** Rodillo acolchado sobre la espinilla, del lado `lado` (1 delante, −1 detrás). */
function rodilloEnElTobillo(e: Esqueleto, lado: 1 | -1, i: 0 | 1 = 0, ancho = 22): Pieza[] {
  const pierna = e.piernas[i];
  const s = unitario(resta(pierna.fin, pierna.medio));
  const normal: V3 = lado === 1 ? [-s[1], s[0], 0] : [s[1], -s[0], 0];
  const c = combina(pierna.fin, [s, -4], [normal, 9]);
  const z = i === 0 ? 1 : -1;
  return [rodillo([c[0], c[1], z * 2], [c[0], c[1], z * ancho], 5)];
}

/* ─── Sentadillas ─────────────────────────────────────────────────────── */

export type CargaDeSentadilla = 'barra' | 'frontal' | 'goblet' | 'sin-peso' | 'smith' | 'sumo';

export function sentadilla(op: { readonly carga: CargaDeSentadilla }): Demostracion {
  const sumo = op.carga === 'sumo';
  const erguida = op.carga === 'frontal' || op.carga === 'goblet';
  const pies = sumo ? par([4, 7, 26]) : par([2, 7, 14]);
  const comun = {
    pies,
    rodillas: sumo ? par([0.7, 0, 1]) : par([1, 0, 0.35]),
    ...(sumo ? { puntas: par([17, 3.5, 34]) } : {}),
  };
  let manosArriba: Par<Objetivo>;
  let manosAbajo: Par<Objetivo>;
  let codos = par([-0.6, -1, 0.3]);
  if (op.carga === 'barra' || op.carga === 'smith') {
    manosArriba = BARRA_EN_LA_ESPALDA;
    manosAbajo = BARRA_EN_LA_ESPALDA;
  } else if (op.carga === 'frontal') {
    // Agarre cruzado: cada mano sobre el hombro contrario y los codos altos.
    manosArriba = rel('cuello', [15, 0, -14]);
    manosAbajo = manosArriba;
    codos = par([1, 0.7, 0.2]);
  } else if (op.carga === 'goblet') {
    manosArriba = rel('cuello', [17, -16, 5]);
    manosAbajo = manosArriba;
    codos = par([0.3, -1, 0.3]);
  } else if (op.carga === 'sin-peso') {
    manosArriba = par([54, 136, 16]);
    manosAbajo = par([54, 92, 16]);
    codos = par([-0.2, -1, 0.3]);
  } else {
    manosArriba = par([11, 80, 5]);
    manosAbajo = par([9, 46, 5]);
  }
  const arriba: Pose = {
    ...comun,
    pelvis: sumo ? [0, 88, 0] : [0, 90, 0],
    tronco: 0,
    manos: manosArriba,
    codos,
  };
  const abajo: Pose = {
    ...comun,
    pelvis: sumo ? [-14, 48, 0] : erguida ? [-26, 48, 0] : [-32, 50, 0],
    tronco: sumo ? 14 : erguida ? 25 : 40,
    manos: manosAbajo,
    codos,
  };
  const escena: Pieza[] = [sombra(-6, 0, 80)];
  if (op.carga === 'smith')
    for (const z of [-62, 62]) escena.push(trazo([-7.5, 0, z], [-7.5, 185, z], 4, 'pata'));
  const aparatos = (e: Esqueleto): Pieza[] => {
    const [a, b] = manos(e);
    switch (op.carga) {
      case 'barra':
      case 'smith':
      case 'frontal':
        return barra(a, b, { eje: e.marco.derecha });
      case 'goblet':
        return mancuerna(combina(mezcla(a, b, 0.5), [e.marco.delante, 4]), e.marco.arriba);
      case 'sumo':
        return mancuerna(combina(mezcla(a, b, 0.5), [[0, -1, 0], 9]), [0, 1, 0]);
      default:
        return [];
    }
  };
  const titulo = {
    barra: 'sentadilla con barra',
    frontal: 'sentadilla frontal con barra',
    goblet: 'sentadilla goblet con mancuerna',
    'sin-peso': 'sentadilla sin peso',
    smith: 'sentadilla en máquina Smith',
    sumo: 'sentadilla sumo con mancuerna',
  }[op.carga];
  return {
    titulo,
    pista: sumo
      ? 'Con los pies muy separados y las puntas hacia fuera, baja la cadera entre las piernas con el tronco erguido y sube empujando el suelo.'
      : 'Con los pies a la anchura de los hombros, baja la cadera hacia atrás y abajo doblando las rodillas, con la espalda recta, y sube empujando el suelo.',
    movimiento: {
      pasos: [
        { pose: arriba, espera: 250, ida: 1300 },
        { pose: abajo, espera: 150, ida: 1100 },
      ],
      escena,
      aparatos,
    },
  };
}

export function sentadillaEnMaquina(op: { readonly tipo: 'hack' | 'pendulo' }): Demostracion {
  const tronco = -25;
  const a = arribaDe(tronco);
  const delante: V3 = [Math.cos((tronco * Math.PI) / 180), -Math.sin((tronco * Math.PI) / 180), 0];
  const arriba: V3 = [8, 96, 0];
  const abajo = combina(arriba, [a, -36]);
  const carril = (t: number, z: number): V3 => {
    const p = combina(arriba, [delante, -14], [a, t]);
    return [p[0], p[1], z];
  };
  const base = {
    tronco,
    pies: par([26, 20, 12]),
    puntas: par([41, 23, 12]),
    manos: rel('cuello', [4, -6, 24]),
    codos: par([0.2, -1, 0.5]),
  };
  return {
    titulo: op.tipo === 'hack' ? 'sentadilla hack en máquina' : 'sentadilla péndulo en máquina',
    pista:
      'Con la espalda contra el respaldo y los hombros bajo las almohadillas, baja doblando las rodillas hasta que los muslos queden paralelos a la plataforma y sube.',
    movimiento: {
      pasos: [
        { pose: { ...base, pelvis: arriba }, espera: 250, ida: 1300 },
        { pose: { ...base, pelvis: abajo }, espera: 150, ida: 1100 },
      ],
      escena: [
        ...caja([32, 12.5, 0], [15, 3, 24], { giro: 15 }),
        trazo(carril(-60, 30), carril(95, 30), 4, 'pata'),
        trazo(carril(-60, -30), carril(95, -30), 4, 'pata'),
        trazo(carril(-60, 0), [carril(-60, 0)[0], 0, 0], 5, 'pata'),
        sombra(10, 0, 80),
      ],
      aparatos: (e) => {
        const giro = (Math.atan2(e.marco.arriba[1], e.marco.arriba[0]) * 180) / Math.PI;
        return [
          ...caja(combina(e.pelvis, [e.marco.arriba, 28], [e.marco.delante, -15]), [30, 3, 14], {
            giro,
          }),
          ...e.hombros.flatMap((h) => caja(combina(h, [e.marco.arriba, 7]), [6, 3, 5])),
        ];
      },
    },
  };
}

export function prensa(): Demostracion {
  const rad = Math.PI / 180;
  const tronco = -53;
  const a = arribaDe(tronco);
  const delante: V3 = [Math.cos(tronco * rad), -Math.sin(tronco * rad), 0];
  const pelvis: V3 = [0, 40, 0];
  const pie = (y: number): Pose['pies'] => par([y, y + 40, 14]);
  const punta = (y: number): Par<V3> => par([y - 7, y + 40 + 13, 14]);
  const base = { pelvis, tronco, manos: par([8, 40, 26]), rodillas: par([-0.6, 0.8, 0.25]) };
  return {
    titulo: 'prensa de piernas',
    pista:
      'Con la espalda apoyada, baja la plataforma doblando las rodillas hacia el pecho y empújala hasta casi estirar las piernas, sin bloquearlas.',
    movimiento: {
      pasos: [
        { pose: { ...base, pies: pie(56), puntas: punta(56) }, espera: 250, ida: 1300 },
        { pose: { ...base, pies: pie(28), puntas: punta(28) }, espera: 150, ida: 1100 },
      ],
      escena: [
        ...caja(combina(pelvis, [a, 28], [delante, -13]), [32, 4, 15], {
          giro: (Math.atan2(a[1], a[0]) * 180) / Math.PI,
        }),
        ...caja(combina(pelvis, [delante, -13], [a, -9]), [10, 4, 15], {
          giro: (Math.atan2(a[1], a[0]) * 180) / Math.PI,
        }),
        trazo([-40, 0, 0], [-30, 40, 0], 5, 'pata'),
        trazo([10, 0, 0], [6, 24, 0], 5, 'pata'),
        trazo([22, 22, 32], [112, 112, 32], 4, 'pata'),
        trazo([22, 22, -32], [112, 112, -32], 4, 'pata'),
        trazo([112, 112, 0], [112, 0, 0], 5, 'pata'),
        sombra(20, 0, 100),
      ],
      aparatos: (e) => {
        const medio = mezcla(e.piernas[0].fin, e.piernas[1].fin, 0.5);
        return caja(
          combina(medio, [DIAGONAL, 10], [[-Math.SQRT1_2, Math.SQRT1_2, 0], 6]),
          [3, 26, 28],
          {
            giro: 45,
          },
        );
      },
    },
  };
}

export function sentadillaPistol(): Demostracion {
  const comun = {
    rodillas: [
      [1, 0, 0.1],
      [1, 0.4, 0],
    ] as Par<V3>,
    codos: par([-0.3, -1, 0.3]),
  };
  return {
    titulo: 'sentadilla a una pierna (pistol)',
    pista:
      'Sobre una sola pierna, baja hasta abajo con la otra estirada por delante y vuelve a subir. Al principio puedes sujetarte a algo.',
    movimiento: {
      pasos: [
        {
          pose: {
            ...comun,
            pelvis: [0, 90, 0],
            tronco: 0,
            pies: [
              [2, 7, 10],
              [72, 58, -12],
            ],
            manos: par([50, 132, 16]),
          },
          espera: 250,
          ida: 1500,
        },
        {
          pose: {
            ...comun,
            pelvis: [-26, 34, 0],
            tronco: 45,
            pies: [
              [2, 7, 10],
              [56, 28, -12],
            ],
            manos: par([56, 84, 16]),
          },
          espera: 150,
          ida: 1300,
        },
      ],
      escena: [sombra(10, 0, 80)],
    },
  };
}

export function sentadillaSissy(): Demostracion {
  const comun = { pies: par([-2, 14, 10]), puntas: par([12, 3.5, 10]) };
  return {
    titulo: 'sentadilla sissy',
    pista:
      'De puntillas, lleva las rodillas hacia delante y el cuerpo hacia atrás en línea recta desde las rodillas, y vuelve a subir.',
    movimiento: {
      pasos: [
        {
          pose: { ...comun, pelvis: [0, 90, 0], tronco: 0, manos: par([40, 128, 16]) },
          espera: 250,
          ida: 1400,
        },
        {
          pose: { ...comun, pelvis: [4, 64, 0], tronco: -50, manos: par([14, 104, 16]) },
          espera: 150,
          ida: 1200,
        },
      ],
      escena: [sombra(4, 0, 70)],
    },
  };
}

/* ─── Peso muerto ─────────────────────────────────────────────────────── */

export function pesoMuerto(op: {
  readonly implemento: 'barra' | 'mancuernas';
  readonly sumo?: boolean;
}): Demostracion {
  const sumo = op.sumo === true;
  const conMancuernas = op.implemento === 'mancuernas';
  const z = sumo ? 12 : conMancuernas ? 25 : 22;
  const comun = {
    pies: sumo ? par([4, 7, 26]) : par([2, 7, 12]),
    rodillas: sumo ? par([0.6, 0, 1]) : par([1, 0, 0.3]),
    codos: par([-1, -0.2, 0.2]),
    cabeza: -10,
    ...(sumo ? { puntas: par([17, 3.5, 34]) } : {}),
  };
  const suelo: Pose = sumo
    ? { ...comun, pelvis: [-20.1, 40.7, 0], tronco: 40, manos: par([16, 19, z]) }
    : conMancuernas
      ? { ...comun, pelvis: [-30, 48, 0], tronco: 58, manos: par([8, 14, z]) }
      : { ...comun, pelvis: [-31.3, 54, 0], tronco: 60, manos: par([13, 19, z]) };
  const rodillas: Pose = sumo
    ? { ...comun, pelvis: [-11.5, 65.9, 0], tronco: 28, manos: par([15, 50, z]) }
    : {
        ...comun,
        pelvis: [-21.5, 72.8, 0],
        tronco: 42,
        manos: par([conMancuernas ? 9 : 16, 52, z]),
      };
  const arriba: Pose = {
    ...comun,
    pelvis: [0, sumo ? 88 : 90, 0],
    tronco: 0,
    manos: par([conMancuernas ? 4 : 11, sumo ? 80 : 81, z]),
  };
  const subida: Vias = { manos: [{ pasa: [15, 68, z] }, { pasa: [15, 68, -z] }] };
  return {
    titulo: `peso muerto${sumo ? ' sumo' : ''} ${conMancuernas ? 'con mancuernas' : 'con barra'}`,
    pista: sumo
      ? 'Con los pies muy separados y las manos por dentro de las rodillas, empuja el suelo y extiende la cadera hasta quedar de pie; baja por el mismo camino.'
      : 'Con el peso pegado a las piernas y la espalda recta, empuja el suelo y extiende la cadera hasta quedar de pie; baja por el mismo camino.',
    movimiento: {
      camara: DESDE_ATRAS,
      pasos: [
        { pose: suelo, espera: 250, ida: 800 },
        { pose: rodillas, espera: 0, ida: 800, via: subida },
        { pose: arriba, espera: 300, ida: 800, via: subida },
        { pose: rodillas, espera: 0, ida: 900 },
      ],
      clave: 2,
      escena: [sombra(-6, 0, 80)],
      aparatos: (e) => {
        const [a, b] = manos(e);
        return conMancuernas
          ? mancuernasEnLasManos(e)
          : barra(a, b, { eje: [0, 0, 1], largo: sumo ? 176 : 150 });
      },
    },
  };
}

export function pesoMuertoRumano(op: {
  readonly implemento: 'barra' | 'mancuernas';
}): Demostracion {
  const comun = { pies: par([2, 7, 11]), codos: par([-1, -0.2, 0.2]), rodillas: par([1, 0, 0.2]) };
  return {
    titulo: `peso muerto rumano ${op.implemento === 'barra' ? 'con barra' : 'con mancuernas'}`,
    pista:
      'Con las rodillas apenas flexionadas, lleva la cadera hacia atrás bajando el peso pegado a las piernas hasta media espinilla, y vuelve extendiendo la cadera.',
    movimiento: {
      pasos: [
        {
          pose: { ...comun, pelvis: [0, 90, 0], tronco: 0, manos: par([9, 81, 20]) },
          espera: 250,
          ida: 1400,
          via: { manos: [{ pasa: [18, 66, 20] }, { pasa: [18, 66, -20] }] },
        },
        {
          pose: {
            ...comun,
            pelvis: [-22, 84, 0],
            tronco: 72,
            cabeza: -15,
            manos: par([22, 40, 20]),
          },
          espera: 150,
          ida: 1100,
        },
      ],
      escena: [sombra(-4, 0, 80)],
      aparatos: (e) => {
        const [a, b] = manos(e);
        return op.implemento === 'barra'
          ? barra(a, b, { eje: [0, 0, 1] })
          : mancuernasEnLasManos(e);
      },
    },
  };
}

export function pesoMuertoAUnaPierna(): Demostracion {
  const comun = { codos: par([-1, -0.2, 0.2]) };
  return {
    titulo: 'peso muerto a una pierna con mancuerna',
    pista:
      'Sobre una pierna, inclina el tronco hacia delante mientras la otra sube estirada por detrás, hasta quedar casi en horizontal, y vuelve.',
    movimiento: {
      pasos: [
        {
          pose: {
            ...comun,
            pelvis: [0, 90, 0],
            tronco: 0,
            pies: [
              [-10, 14, 11],
              [2, 7, -11],
            ],
            manos: [
              [4, 80, 20],
              [2, 84, -20],
            ],
          },
          espera: 250,
          ida: 1500,
          via: { manos: [{ pasa: [29, 68, 20] }, { pasa: [28, 70, -20] }] },
        },
        {
          pose: {
            ...comun,
            pelvis: [-10, 88, 0],
            tronco: 85,
            cabeza: -10,
            pies: [
              [-89.7, 81, 11],
              [2, 7, -11],
            ],
            manos: [
              [40, 34, 20],
              [38, 36, -20],
            ],
          },
          espera: 200,
          ida: 1300,
        },
      ],
      escena: [sombra(-10, 0, 90)],
      aparatos: (e) => mancuerna(e.brazos[0].fin, EJE_NEUTRO),
    },
  };
}

export function buenosDias(): Demostracion {
  const comun = { pies: par([2, 7, 12]), manos: BARRA_EN_LA_ESPALDA, codos: par([-0.6, -1, 0.3]) };
  return {
    titulo: 'buenos días con barra',
    pista:
      'Con la barra sobre la espalda y las rodillas algo flexionadas, inclina el tronco hacia delante llevando la cadera atrás, con la espalda recta, y vuelve a subir.',
    movimiento: {
      pasos: [
        { pose: { ...comun, pelvis: [0, 90, 0], tronco: 0 }, espera: 250, ida: 1400 },
        {
          pose: { ...comun, pelvis: [-18, 86, 0], tronco: 75, cabeza: -15 },
          espera: 150,
          ida: 1200,
        },
      ],
      escena: [sombra(-4, 0, 80)],
      aparatos: (e) => {
        const [a, b] = manos(e);
        return barra(a, b, { eje: e.marco.derecha });
      },
    },
  };
}

/* ─── Hip thrust y puentes ────────────────────────────────────────────── */

export function hipThrust(op: {
  readonly implemento: 'barra' | 'mancuerna' | 'maquina';
}): Demostracion {
  const sobreLaCadera =
    op.implemento === 'mancuerna' ? rel('pelvis', [19, 0, 5]) : rel('pelvis', [16, 0, 26]);
  const comun = {
    pies: par([48, 7, 14]),
    manos: sobreLaCadera,
    codos: par([0, -1, 0.5]),
    rodillas: par([0.3, 1, 0.2]),
  };
  return {
    titulo: `hip thrust ${{ barra: 'con barra', mancuerna: 'con mancuerna', maquina: 'en máquina' }[op.implemento]}`,
    pista:
      'Con la parte alta de la espalda apoyada en el banco y los pies en el suelo, sube la cadera hasta alinearla con hombros y rodillas, y baja con control.',
    movimiento: {
      camara: { giro: -25, alzado: 4 },
      pasos: [
        { pose: { ...comun, pelvis: [0, 28, 0], tronco: -50 }, espera: 200, ida: 1000 },
        {
          pose: { ...comun, pelvis: [14, 58, 0], tronco: -90, cabeza: 25 },
          espera: 350,
          ida: 1200,
        },
      ],
      escena: [
        ...caja([-42, 40, 0], [13, 4, 46]),
        ...[-36, 36].map((z) => trazo([-42, 36, z], [-42, 0, z], 5, 'pata')),
        sombra(10, 0, 90),
      ],
      aparatos: (e) => {
        const [a, b] = manos(e);
        if (op.implemento === 'mancuerna') return mancuerna(mezcla(a, b, 0.5), EJE_LATERAL);
        if (op.implemento === 'barra') return barra(a, b, { eje: [0, 0, 1] });
        const apoyo = combina(e.pelvis, [e.marco.delante, 15]);
        return [
          rodillo([apoyo[0], apoyo[1], -22], [apoyo[0], apoyo[1], 22], 5.5),
          cilindro([apoyo[0], apoyo[1], 30], [60, 12, 30], 2.3, 'acero'),
          cilindro([apoyo[0], apoyo[1], -30], [60, 12, -30], 2.3, 'acero'),
        ];
      },
    },
  };
}

export function puente(op: {
  readonly variante: 'gluteo' | 'una-pierna' | 'isquios';
}): Demostracion {
  const isquios = op.variante === 'isquios';
  const unaPierna = op.variante === 'una-pierna';
  const pieDerecho: V3 = isquios ? [68, 7, 12] : [46, 7, 12];
  const comun = {
    manos: par([14, 4, 26]),
    codos: par([0, 0, 1]),
    rodillas: par([0.3, 1, 0.2]),
    ...(isquios ? { puntas: par([72, 20, 12]) } : {}),
  };
  const pies = (izquierda: V3): Par<V3> => [pieDerecho, izquierda];
  const izquierdaAbajo: V3 = unaPierna ? [84, 34, -12] : [pieDerecho[0], pieDerecho[1], -12];
  const izquierdaArriba: V3 = unaPierna ? [84, 62, -12] : [pieDerecho[0], pieDerecho[1], -12];
  const alto = isquios ? 36 : 40;
  const tronco = -((180 * Math.acos((12 - alto) / 50)) / Math.PI);
  return {
    titulo: {
      gluteo: 'puente de glúteo',
      'una-pierna': 'puente de glúteo a una pierna',
      isquios: 'puente de isquios',
    }[op.variante],
    pista: isquios
      ? 'Boca arriba con los talones lejos y las rodillas poco dobladas, sube la cadera apretando la parte de atrás de los muslos y baja despacio.'
      : `Tumbado boca arriba con ${unaPierna ? 'una pierna estirada en el aire y la otra doblada' : 'las rodillas dobladas'}, sube la cadera apretando los glúteos hasta alinearla con hombros y rodillas, y baja despacio.`,
    movimiento: {
      pasos: [
        {
          pose: { ...comun, pelvis: [10, 12, 0], tronco: -90, pies: pies(izquierdaAbajo) },
          espera: 200,
          ida: 900,
        },
        {
          pose: { ...comun, pelvis: [8, alto, 0], tronco, cabeza: 35, pies: pies(izquierdaArriba) },
          espera: 400,
          ida: 1100,
        },
      ],
      escena: [sombra(10, 0, 90)],
    },
  };
}

/* ─── Hiperextensiones, extensión lumbar, inversas, superman ──────────── */

const BRAZOS_CRUZADOS = rel('cuello', [22, -10, -10]);

export function hiperextension(): Demostracion {
  const comun = {
    pies: par([-40, 22, 10]),
    manos: BRAZOS_CRUZADOS,
    codos: par([1, -0.2, 0.3]),
    rodillas: par([0.7, -0.7, 0.1]),
    pelvis: [18, 80, 0] as V3,
  };
  return {
    titulo: 'hiperextensiones en banco',
    pista:
      'Con las caderas sobre el apoyo y los pies sujetos, baja el tronco doblando la cadera y sube hasta quedar en línea con las piernas, sin pasar de ahí.',
    movimiento: {
      pasos: [
        { pose: { ...comun, tronco: 45 }, espera: 300, ida: 1300 },
        { pose: { ...comun, tronco: 135, cabeza: 10 }, espera: 150, ida: 1100 },
      ],
      escena: [
        ...caja([12, 57.5, 0], [3, 13, 18], { giro: -45 }),
        rodillo([-44, 16, -18], [-44, 16, 18], 4.5),
        trazo([12, 58, 0], [8, 0, 0], 5, 'pata'),
        trazo([-44, 16, 0], [-50, 0, 0], 5, 'pata'),
        trazo([-50, 0, 0], [8, 0, 0], 5, 'pata'),
        sombra(0, 0, 80),
      ],
    },
  };
}

export function extensionLumbarEnMaquina(): Demostracion {
  const comun = {
    pelvis: [0, 56, 0] as V3,
    pies: par([42, 7, 15]),
    manos: BRAZOS_CRUZADOS,
    codos: par([1, -0.2, 0.3]),
  };
  return {
    titulo: 'extensión lumbar en máquina',
    pista:
      'Sentado con la parte alta de la espalda contra el respaldo móvil, empújalo hacia atrás extendiendo la espalda y vuelve despacio hacia delante.',
    movimiento: {
      camara: DESDE_ATRAS,
      pasos: [
        { pose: { ...comun, tronco: 40, cabeza: 10 }, espera: 200, ida: 1100 },
        { pose: { ...comun, tronco: -8 }, espera: 300, ida: 1300 },
      ],
      escena: [
        ...caja([0, 42, 0], [16, 4, 15]),
        trazo([0, 38, 0], [0, 0, 0], 5, 'pata'),
        sombra(10),
      ],
      aparatos: (e) => {
        const giro = (Math.atan2(e.marco.arriba[1], e.marco.arriba[0]) * 180) / Math.PI;
        const apoyo = combina(e.cuello, [e.marco.delante, -16], [e.marco.arriba, -12]);
        return [...caja(apoyo, [12, 3, 8], { giro }), trazo(apoyo, [-16, 50, 0], 4, 'pata')];
      },
    },
  };
}

export function hiperextensionInversa(): Demostracion {
  const comun = {
    pelvis: [-6, 100, 0] as V3,
    tronco: 90,
    manos: par([58, 84, 20]),
    codos: par([0, 1, 0.4]),
  };
  return {
    titulo: 'hiperextensiones inversas',
    pista:
      'Tumbado boca abajo con la cadera en el borde, sube las piernas estiradas por detrás hasta la horizontal y bájalas con control.',
    movimiento: {
      pasos: [
        {
          pose: { ...comun, pies: par([-14, 20, 10]) },
          espera: 200,
          ida: 1000,
          via: { pies: [{ centro: [-6, 100, 10] }, { centro: [-6, 100, -10] }] },
        },
        { pose: { ...comun, pies: par([-86, 104, 10]) }, espera: 300, ida: 1200 },
      ],
      escena: [
        ...caja([33, 84, 0], [30, 4, 15]),
        ...[10, 56].map((x) => trazo([x, 80, 0], [x, 0, 0], 5, 'pata')),
        sombra(0, 0, 90),
      ],
    },
  };
}

export function superman(): Demostracion {
  return {
    titulo: 'superman',
    pista:
      'Tumbado boca abajo con los brazos estirados, levanta a la vez brazos, pecho y piernas unos centímetros, aguanta un momento y baja.',
    movimiento: {
      camara: { giro: 30, alzado: 28 },
      pasos: [
        {
          pose: {
            pelvis: [0, 12, 0],
            tronco: 90,
            manos: par([112, 12, 18]),
            pies: par([-83.6, 10, 10]),
            puntas: par([-96, 6, 10]),
          },
          espera: 300,
          ida: 900,
        },
        {
          pose: {
            pelvis: [0, 12, 0],
            tronco: 84,
            cabeza: -10,
            manos: par([110, 34, 18]),
            pies: par([-81, 27, 10]),
            puntas: par([-93, 25, 10]),
          },
          espera: 600,
          ida: 900,
        },
      ],
      escena: [sombra(10, 0, 110)],
    },
  };
}

export function pullThrough(): Demostracion {
  const polea: V3 = [-80, 8, 0];
  const comun = { pies: par([2, 7, 16]), codos: par([0.2, -1, 0.2]) };
  return {
    titulo: 'pull-through en polea',
    pista:
      'De espaldas a la polea baja, con la cuerda entre las piernas, lleva la cadera atrás inclinando el tronco y vuelve a ponerte de pie empujando con la cadera.',
    movimiento: {
      camara: DESDE_ATRAS,
      pasos: [
        {
          pose: { ...comun, pelvis: [0, 90, 0], tronco: 0, manos: par([8, 80, 4]) },
          espera: 300,
          ida: 1300,
        },
        {
          pose: { ...comun, pelvis: [-20, 84, 0], tronco: 68, manos: par([-8, 56, 4]) },
          espera: 150,
          ida: 1000,
        },
      ],
      escena: [...torre(-88, 0, 180), sombra(-20, 0, 100)],
      aparatos: (e) => {
        const [a, b] = manos(e);
        return [...cable(polea, mezcla(a, b, 0.5))];
      },
    },
  };
}

export function swing(): Demostracion {
  const comun = { pies: par([2, 7, 17]), codos: par([-1, 0, 0.1]) };
  return {
    titulo: 'swing con kettlebell',
    pista:
      'Lleva la kettlebell entre las piernas inclinando la cadera y lánzala hasta la altura del pecho extendiendo la cadera de golpe; los brazos sólo acompañan.',
    movimiento: {
      camara: DESDE_ATRAS,
      pasos: [
        {
          pose: { ...comun, pelvis: [-20, 80, 0], tronco: 60, manos: par([-4, 52, 4]) },
          espera: 50,
          ida: 700,
          via: { manos: [{ pasa: [30, 80, 4] }, { pasa: [30, 80, -4] }] },
        },
        {
          pose: { ...comun, pelvis: [0, 90, 0], tronco: -4, manos: par([56, 132, 4]) },
          espera: 120,
          ida: 800,
        },
      ],
      escena: [sombra(0, 0, 80)],
      aparatos: (e) => {
        const [a, b] = manos(e);
        const agarre = mezcla(a, b, 0.5);
        const hombros = mezcla(e.hombros[0], e.hombros[1], 0.5);
        return kettlebell(agarre, resta(agarre, hombros), e.marco.derecha);
      },
    },
  };
}

/* ─── Zancadas, búlgara, cajón, lateral y paseo ───────────────────────── */

export function zancada(op: {
  readonly tipo: 'adelante' | 'atras' | 'caminando' | 'sin-peso';
}): Demostracion {
  const sinPeso = op.tipo === 'sin-peso';
  const brazos = sinPeso ? { manos: EN_LA_CADERA, codos: par([-0.5, 0, 1]) } : { manos: COLGANDO };
  const atras = op.tipo === 'atras';
  const dePie: Pose = {
    ...brazos,
    pelvis: [0, 90, 0],
    tronco: 0,
    pies: par([2, 7, 11]),
    // La punta del pie que no se mueve queda fija: al bajar sólo se levanta el talón.
    puntas: atras ? [null, null] : [null, [18, 3.5, -11]],
  };
  let paso: Pose;
  let abajo: Pose;
  let ida: Vias;
  if (atras) {
    paso = {
      ...brazos,
      pelvis: [-28, 80, 0],
      tronco: 4,
      pies: [
        [-60, 16.5, 11],
        [2, 7, -11],
      ],
      puntas: [[-50, 3.5, 11], null],
    };
    abajo = {
      ...paso,
      pelvis: [-30, 47, 0],
      rodillas: [
        [0.4, -1, 0],
        [1, 0, 0],
      ],
    };
    ida = { pies: [{ pasa: [-30, 22, 11] }, null] };
  } else {
    paso = {
      ...brazos,
      pelvis: [32, 80, 0],
      tronco: 4,
      pies: [
        [72, 7, 11],
        [4, 15, -11],
      ],
      puntas: [null, [18, 3.5, -11]],
    };
    abajo = {
      ...paso,
      pelvis: [38, 47, 0],
      pies: [
        [72, 7, 11],
        [8, 16.5, -11],
      ],
      rodillas: [
        [1, 0, 0],
        [0.4, -1, 0],
      ],
    };
    ida = { pies: [{ pasa: [38, 22, 11] }, null] };
  }
  const titulo = {
    adelante: 'zancadas hacia delante',
    atras: 'zancada inversa (hacia atrás)',
    caminando: 'zancadas caminando',
    'sin-peso': 'zancadas sin peso',
  }[op.tipo];
  return {
    titulo,
    pista: atras
      ? 'Da un paso largo hacia atrás y baja hasta que la rodilla de atrás casi toque el suelo; vuelve empujando con la pierna de delante.'
      : op.tipo === 'caminando'
        ? 'Da un paso largo, baja hasta que la rodilla de atrás casi toque el suelo y, en vez de volver, adelanta la otra pierna para la siguiente zancada.'
        : 'Da un paso largo hacia delante y baja hasta que la rodilla de atrás casi toque el suelo; vuelve empujando con la pierna de delante.',
    movimiento: {
      pasos: [
        { pose: dePie, espera: 250, ida: 700, via: ida },
        { pose: paso, espera: 0, ida: 800 },
        { pose: abajo, espera: 150, ida: 800 },
        { pose: paso, espera: 0, ida: 700, via: ida },
      ],
      clave: 2,
      escena: [sombra(atras ? -24 : 30, 0, 100)],
      ...(sinPeso ? {} : { aparatos: mancuernasEnLasManos }),
    },
  };
}

export function sentadillaBulgara(): Demostracion {
  const comun = {
    tronco: 8,
    pies: [
      [30, 7, 11],
      [-40, 54, -10],
    ] as Par<V3>,
    puntas: [null, [-54, 50, -10]] as Par<V3 | null>,
    rodillas: [
      [1, 0, 0.1],
      [0.3, -1, 0],
    ] as Par<V3>,
    manos: COLGANDO,
  };
  return {
    titulo: 'sentadilla búlgara con mancuernas',
    pista:
      'Con el empeine del pie de atrás sobre el banco, baja doblando la rodilla de delante hasta que el muslo quede casi paralelo al suelo, y sube.',
    movimiento: {
      pasos: [
        { pose: { ...comun, pelvis: [0, 84, 0] }, espera: 250, ida: 1300 },
        { pose: { ...comun, pelvis: [-4, 44, 0] }, espera: 150, ida: 1100 },
      ],
      escena: [...bancoPlano(-92, -45, { alto: 46 }), sombra(0, 0, 90)],
      aparatos: mancuernasEnLasManos,
    },
  };
}

export function subidaAlCajon(): Demostracion {
  const comun = { manos: COLGANDO };
  return {
    titulo: 'subida al cajón con mancuernas',
    pista:
      'Con un pie sobre el cajón, sube empujando con esa pierna hasta quedar de pie encima y baja con control.',
    movimiento: {
      pasos: [
        {
          pose: {
            ...comun,
            pelvis: [0, 90, 0],
            tronco: 8,
            pies: [
              [40, 52, 11],
              [2, 7, -11],
            ],
            puntas: [[56, 48.5, 11], null],
          },
          espera: 250,
          ida: 1200,
          // El pie de atrás sube antes de avanzar: la punta no roza el cajón.
          via: { pelvis: { pasa: [24, 120, 0] }, pies: [null, { pasa: [8, 70, -11] }] },
        },
        {
          pose: {
            ...comun,
            pelvis: [40, 134, 0],
            tronco: 0,
            pies: [
              [40, 52, 11],
              [40, 52, -11],
            ],
            puntas: [
              [56, 48.5, 11],
              [56, 48.5, -11],
            ],
          },
          espera: 250,
          ida: 1200,
        },
      ],
      escena: [...caja([45, 22.5, 0], [25, 22.5, 25]), sombra(20, 0, 90)],
      aparatos: mancuernasEnLasManos,
    },
  };
}

export function zancadaLateral(): Demostracion {
  const comun = {
    manos: rel('cuello', [21, -16, 5]),
    codos: par([0.3, -1, 0.3]),
    rodillas: par([1, 0, 0.2]),
  };
  const dePie: Pose = { ...comun, pelvis: [0, 90, 0], tronco: 0, pies: par([2, 7, 11]) };
  const paso: Pose = {
    ...comun,
    pelvis: [0, 84, 30],
    tronco: 4,
    pies: [
      [4, 7, 70],
      [2, 7, -11],
    ],
  };
  const abajo: Pose = { ...paso, pelvis: [-14, 58, 50], tronco: 30 };
  const ida: Vias = { pies: [{ pasa: [4, 22, 42] }, null] };
  return {
    titulo: 'zancada lateral con mancuerna al pecho',
    pista:
      'Da un paso largo hacia un lado y baja la cadera hacia atrás sobre esa pierna, con la otra estirada; vuelve empujando al centro.',
    movimiento: {
      camara: { giro: 72, alzado: 12 },
      pasos: [
        { pose: dePie, espera: 250, ida: 700, via: ida },
        { pose: paso, espera: 0, ida: 800 },
        { pose: abajo, espera: 150, ida: 800 },
        { pose: paso, espera: 0, ida: 700, via: ida },
      ],
      clave: 2,
      escena: [sombra(0, 30, 100)],
      aparatos: mancuernasEnLasManos,
    },
  };
}

export function paseoDelGranjero(): Demostracion {
  const comun = { manos: rel('cuello', [2, -58, 22]), tronco: 0 };
  const zancada = (derecha: V3, izquierda: V3, y: number): Pose => ({
    ...comun,
    pelvis: [0, y, 0],
    pies: [derecha, izquierda],
  });
  const p0 = zancada([22, 7, 11], [-22, 10, -11], 87);
  const p1 = zancada([0, 7, 11], [2, 18, -11], 90);
  const p2 = zancada([-22, 10, 11], [22, 7, -11], 87);
  const p3 = zancada([2, 18, 11], [0, 7, -11], 90);
  return {
    titulo: 'paseo del granjero',
    pista:
      'Con una mancuerna pesada en cada mano y el tronco erguido, camina con pasos cortos y firmes sin dejar que los hombros se caigan.',
    movimiento: {
      pasos: [
        { pose: p0, espera: 0, ida: 380, via: { pies: [null, { pasa: [-10, 24, -11] }] } },
        { pose: p1, espera: 0, ida: 380, via: { pies: [null, { pasa: [14, 19, -11] }] } },
        { pose: p2, espera: 0, ida: 380, via: { pies: [{ pasa: [-10, 24, 11] }, null] } },
        { pose: p3, espera: 0, ida: 380, via: { pies: [{ pasa: [14, 19, 11] }, null] } },
      ],
      escena: [sombra(0, 0, 80)],
      aparatos: (e) => manos(e).flatMap((m) => mancuerna(combina(m, [[0, -1, 0], 2]), EJE_NEUTRO)),
    },
  };
}

/* ─── Cuádriceps e isquios en máquina ─────────────────────────────────── */

export function extensionDeCuadriceps(): Demostracion {
  const comun = {
    pelvis: [-6, 56, 0] as V3,
    tronco: -8,
    manos: par([-6, 50, 24]),
    rodillas: par([0, 1, 0.1]),
  };
  return {
    titulo: 'extensión de cuádriceps en máquina',
    pista:
      'Sentado con el rodillo sobre los tobillos, estira las rodillas hasta tener las piernas rectas y baja despacio.',
    movimiento: {
      pasos: [
        {
          pose: { ...comun, pies: par([38, 12, 9]) },
          espera: 200,
          ida: 1000,
          via: { pies: [{ centro: [36, 54, 9] }, { centro: [36, 54, -9] }] },
        },
        { pose: { ...comun, pies: par([76, 50, 9]) }, espera: 300, ida: 1300 },
      ],
      escena: [
        ...caja([-2, 46, 0], [22, 4, 16]),
        ...caja([-30, 82, 0], [4, 32, 15], { giro: -8 }),
        trazo([-2, 42, 0], [-2, 0, 0], 5, 'pata'),
        sombra(10, 0, 90),
      ],
      aparatos: (e) => [
        ...rodilloEnElTobillo(e, 1),
        trazo(
          [36, 54, 24],
          combina(e.piernas[0].fin, [unitario(resta(e.piernas[0].fin, e.piernas[0].medio)), -4]),
          4,
          'pata',
        ),
      ],
    },
  };
}

export type CurlFemoral = 'tumbado' | 'sentado' | 'de-pie' | 'polea' | 'deslizante';

export function curlFemoral(op: { readonly tipo: CurlFemoral }): Demostracion {
  switch (op.tipo) {
    case 'tumbado':
      return curlFemoralTumbado();
    case 'sentado':
      return curlFemoralSentado();
    case 'deslizante':
      return curlFemoralDeslizante();
    default:
      return curlFemoralDePie(op.tipo === 'polea');
  }
}

function curlFemoralTumbado(): Demostracion {
  const comun = {
    pelvis: [0, 60, 0] as V3,
    tronco: 90,
    manos: par([62, 44, 20]),
    codos: par([0, 1, 0.4]),
  };
  return {
    titulo: 'curl femoral tumbado en máquina',
    pista:
      'Tumbado boca abajo con el rodillo detrás de los tobillos, dobla las rodillas llevando los talones hacia los glúteos y baja despacio.',
    movimiento: {
      pasos: [
        {
          pose: { ...comun, pies: par([-83.4, 58.5, 9]) },
          espera: 200,
          ida: 1000,
          via: { pies: [{ centro: [-42, 58, 9] }, { centro: [-42, 58, -9] }] },
        },
        { pose: { ...comun, pies: par([-40, 100, 9]) }, espera: 250, ida: 1300 },
      ],
      escena: [...bancoPlano(-40, 70, { alto: 48 }), sombra(0, 0, 100)],
      aparatos: (e) => rodilloEnElTobillo(e, -1),
    },
  };
}

function curlFemoralSentado(): Demostracion {
  const comun = {
    pelvis: [-6, 56, 0] as V3,
    tronco: -10,
    manos: par([-4, 50, 24]),
    rodillas: par([0, 1, 0.1]),
  };
  return {
    titulo: 'curl femoral sentado en máquina',
    pista:
      'Sentado con las piernas estiradas sobre el rodillo, dobla las rodillas llevándolo hacia abajo y atrás, y vuelve despacio.',
    movimiento: {
      pasos: [
        {
          pose: { ...comun, pies: par([76, 52, 9]) },
          espera: 200,
          ida: 1000,
          via: { pies: [{ centro: [36, 54, 9] }, { centro: [36, 54, -9] }] },
        },
        { pose: { ...comun, pies: par([30, 14, 9]) }, espera: 250, ida: 1300 },
      ],
      escena: [
        ...caja([-2, 46, 0], [22, 4, 16]),
        ...caja([-33, 82, 0], [4, 32, 15], { giro: -10 }),
        trazo([-2, 42, 0], [-2, 0, 0], 5, 'pata'),
        rodillo([26, 66, -22], [26, 66, 22], 5),
        sombra(10, 0, 90),
      ],
      aparatos: (e) => rodilloEnElTobillo(e, -1),
    },
  };
}

function curlFemoralDePie(conPolea: boolean): Demostracion {
  const polea: V3 = [62, 8, 11];
  const comun = {
    pelvis: [0, 90, 0] as V3,
    tronco: 10,
    manos: conPolea ? par([62, 118, 12]) : par([30, 120, 20]),
    rodillas: [
      [0.4, -1, 0.1],
      [1, 0, 0.1],
    ] as Par<V3>,
  };
  return {
    titulo: conPolea ? 'curl femoral de pie en polea' : 'curl femoral de pie en máquina',
    pista:
      'De pie, dobla la rodilla llevando el talón hacia el glúteo sin mover el muslo, y bájalo despacio.',
    movimiento: {
      pasos: [
        {
          pose: {
            ...comun,
            pies: [
              [-4, 12, 11],
              [2, 7, -11],
            ],
          },
          espera: 200,
          ida: 1000,
          via: { pies: [{ centro: [2, 48, 11] }, null] },
        },
        {
          pose: {
            ...comun,
            pies: [
              [-40, 52, 11],
              [2, 7, -11],
            ],
          },
          espera: 250,
          ida: 1200,
        },
      ],
      escena: conPolea
        ? [...torre(70, 11, 190), sombra(20, 0, 90)]
        : [
            ...caja([14, 86, 0], [4, 12, 14]),
            trazo([18, 80, 0], [34, 0, 0], 5, 'pata'),
            sombra(10, 0, 80),
          ],
      aparatos: (e) =>
        conPolea ? cable(polea, e.piernas[0].fin) : rodilloEnElTobillo(e, -1, 0, 20),
    },
  };
}

function curlFemoralDeslizante(): Demostracion {
  const comun = {
    manos: par([14, 4, 26]),
    codos: par([0, 0, 1]),
    rodillas: par([0.2, 1, 0.1]),
  };
  const tronco = (alto: number) => -((180 * Math.acos((12 - alto) / 50)) / Math.PI);
  return {
    titulo: 'curl femoral deslizante',
    pista:
      'Boca arriba con los talones sobre discos deslizantes y la cadera elevada, arrastra los talones hacia ti doblando las rodillas y vuelve a estirarlas.',
    movimiento: {
      pasos: [
        {
          pose: {
            ...comun,
            pelvis: [8, 30, 0],
            tronco: tronco(30),
            cabeza: 25,
            pies: par([86, 8, 10]),
            puntas: par([90, 22, 10]),
          },
          espera: 200,
          ida: 1100,
        },
        {
          pose: {
            ...comun,
            pelvis: [8, 40, 0],
            tronco: tronco(40),
            cabeza: 35,
            pies: par([44, 8, 10]),
            puntas: par([48, 22, 10]),
          },
          espera: 250,
          ida: 1200,
        },
      ],
      escena: [sombra(20, 0, 100)],
      aparatos: (e) =>
        e.piernas.map((p) =>
          cilindro([p.fin[0] - 3, 0, p.fin[2]], [p.fin[0] - 3, 1.2, p.fin[2]], 6, 'disco'),
        ),
    },
  };
}

export function curlNordico(op: { readonly maquina?: boolean } = {}): Demostracion {
  // En la máquina (GHD) todo va sobre el acolchado, más arriba, y el tronco baja
  // hasta casi la horizontal; en el suelo, sólo hasta donde se puede frenar.
  const enMaquina = op.maquina === true;
  const alto = enMaquina ? 70 : 0;
  const sube = (v: V3): V3 => [v[0], v[1] + alto, v[2]];
  const rodilla = sube([1.9, 9.5, 0]);
  const comun = {
    pies: par(sube([-40.1, 9, 9])),
    ...(enMaquina ? { puntas: par(sube([-44, -5, 9])) } : {}),
    manos: rel('cuello', [16, -18, 14]),
    rodillas: par([1, -1, 0]),
  };
  const abajo: Pick<Pose, 'pelvis' | 'tronco'> = enMaquina
    ? { pelvis: sube([43.3, 16.8, 0]), tronco: 80 }
    : { pelvis: [34.1, 36.5, 0], tronco: 50 };
  const escena: Pieza[] = enMaquina
    ? [
        rodillo(sube([4, -5, -17]), sube([4, -5, 17]), 9),
        rodillo(sube([-36, 17, -18]), sube([-36, 17, 18]), 4.5),
        ...caja(sube([-48, 2, 0]), [1.5, 12, 16]),
        trazo(sube([4, -14, 0]), [4, 1.5, 0], 5, 'pata'),
        trazo(sube([-48, -10, 0]), [-48, 1.5, 0], 5, 'pata'),
        trazo(sube([-36, 12, 0]), sube([-48, 12, 0]), 4, 'pata'),
        trazo([-60, 1.5, 0], [30, 1.5, 0], 5, 'pata'),
        sombra(-8, 0, 90),
      ]
    : [
        ...caja([0, 2, 0], [20, 2, 20]),
        rodillo([-46, 15, -18], [-46, 15, 18], 4.5),
        trazo([-46, 15, 0], [-52, 0, 0], 5, 'pata'),
        sombra(10, 0, 90),
      ];
  return {
    titulo: enMaquina ? 'glute ham raise' : 'curl nórdico',
    pista: enMaquina
      ? 'En la máquina, con los pies sujetos y las rodillas detrás del acolchado, baja el cuerpo recto hasta casi la horizontal y súbelo doblando las rodillas con la parte de atrás de los muslos.'
      : 'De rodillas con los tobillos sujetos, deja caer el cuerpo recto hacia delante lo más despacio que puedas y vuelve a subir tirando con la parte de atrás de los muslos.',
    movimiento: {
      pasos: [
        {
          pose: { ...comun, pelvis: sube([2, 51.5, 0]), tronco: 0 },
          espera: 250,
          ida: 1800,
          via: { pelvis: { centro: rodilla } },
        },
        { pose: { ...comun, ...abajo }, espera: 150, ida: 1200 },
      ],
      escena,
    },
  };
}

/* ─── Gemelos ─────────────────────────────────────────────────────────── */

export type Talones = 'de-pie' | 'maquina' | 'mancuerna' | 'prensa' | 'sentado';

export function talones(op: { readonly tipo: Talones }): Demostracion {
  if (op.tipo === 'prensa') return talonesEnPrensa();
  if (op.tipo === 'sentado') return talonesSentado();
  const unaPierna = op.tipo === 'mancuerna';
  const escalon = caja([25, 4, 0], [15, 4, 30]);
  const pies = (y: number): Pick<Pose, 'pies' | 'puntas'> =>
    unaPierna
      ? {
          pies: [
            [y === 13 ? 6 : 8, y, 11],
            [-14, y + 18, -4],
          ],
          puntas: [[20, 11.5, 11], null],
        }
      : { pies: par([y === 13 ? 6 : 8, y, 11]), puntas: par([20, 11.5, 11]) };
  const manosDe: Par<Objetivo> =
    op.tipo === 'maquina'
      ? rel('cuello', [8, 5, 21])
      : unaPierna
        ? [{ desde: 'cuello', v: [2, -58, 21] }, [44, 126, -20]]
        : COLGANDO;
  return {
    titulo: {
      'de-pie': 'elevación de talones de pie',
      maquina: 'elevación de talones de pie en máquina',
      mancuerna: 'elevación de talones a una pierna con mancuerna',
      prensa: '',
      sentado: '',
    }[op.tipo],
    pista:
      'De pie con la parte delantera de los pies sobre un escalón, baja los talones y sube hasta ponerte de puntillas, despacio y sin rebotar.',
    movimiento: {
      pasos: [
        {
          pose: { ...pies(13), pelvis: [2, 96, 0], tronco: 0, manos: manosDe },
          espera: 250,
          ida: 900,
        },
        {
          pose: { ...pies(27), pelvis: [4, 110, 0], tronco: 0, manos: manosDe },
          espera: 400,
          ida: 1100,
        },
      ],
      escena: [
        ...escalon,
        ...(unaPierna ? [trazo([48, 0, -24], [48, 150, -24], 5, 'pata')] : []),
        ...(op.tipo === 'maquina' ? caja([-31, 92, 0], [3, 92, 10]) : []),
        sombra(8, 0, 70),
      ],
      aparatos: (e) => {
        if (op.tipo === 'maquina') {
          // Máquina de guía vertical: las hombreras suben con los hombros por
          // el poste de detrás.
          const y = e.hombros[0][1] + 10;
          return [
            palanca([-28, y, 0], [-8, y, 0]),
            palanca([-8, y, -22], [-8, y, 22]),
            ...e.hombros.map((h) => rodillo([-8, y, h[2]], [8, y, h[2]], 5)),
          ];
        }
        return unaPierna ? mancuerna(e.brazos[0].fin, EJE_NEUTRO) : [];
      },
    },
  };
}

function talonesEnPrensa(): Demostracion {
  const rad = Math.PI / 180;
  const tronco = -53;
  const a = arribaDe(tronco);
  const delante: V3 = [Math.cos(tronco * rad), -Math.sin(tronco * rad), 0];
  const pelvis: V3 = [0, 40, 0];
  const base = {
    pelvis,
    tronco,
    manos: par([8, 40, 26]),
    pies: par([54, 94, 14]),
    rodillas: par([-0.6, 0.8, 0.25]),
  };
  return {
    titulo: 'elevación de talones en prensa',
    pista:
      'En la prensa con las piernas estiradas y sólo la parte delantera del pie en la plataforma, empújala estirando los tobillos y vuelve despacio.',
    movimiento: {
      pasos: [
        { pose: { ...base, puntas: par([43.4, 104.6, 14]) }, espera: 250, ida: 800 },
        { pose: { ...base, puntas: par([48.9, 108.1, 14]) }, espera: 350, ida: 1000 },
      ],
      escena: [
        ...caja(combina(pelvis, [a, 28], [delante, -13]), [32, 4, 15], {
          giro: (Math.atan2(a[1], a[0]) * 180) / Math.PI,
        }),
        ...caja(combina(pelvis, [delante, -13], [a, -9]), [10, 4, 15], {
          giro: (Math.atan2(a[1], a[0]) * 180) / Math.PI,
        }),
        trazo([-40, 0, 0], [-30, 40, 0], 5, 'pata'),
        trazo([10, 0, 0], [6, 24, 0], 5, 'pata'),
        trazo([22, 22, 32], [112, 112, 32], 4, 'pata'),
        trazo([22, 22, -32], [112, 112, -32], 4, 'pata'),
        trazo([112, 112, 0], [112, 0, 0], 5, 'pata'),
        sombra(20, 0, 100),
      ],
      aparatos: (e) => {
        const punta = mezcla(e.pies[0][1], e.pies[1][1], 0.5);
        return caja(
          combina(punta, [DIAGONAL, 4], [[-Math.SQRT1_2, Math.SQRT1_2, 0], 16]),
          [3, 22, 28],
          { giro: 45 },
        );
      },
    },
  };
}

function talonesSentado(): Demostracion {
  const comun = {
    pelvis: [-6, 56, 0] as V3,
    tronco: 0,
    rodillas: par([0, 1, 0.1]),
    puntas: par([52, 11.5, 11]),
  };
  return {
    titulo: 'elevación de talones sentado en máquina',
    pista:
      'Sentado con las rodillas bajo el apoyo y la parte delantera de los pies en el escalón, sube los talones todo lo que puedas y bájalos despacio.',
    movimiento: {
      pasos: [
        {
          pose: { ...comun, pies: par([38, 16, 11]), manos: par([30, 72, 16]) },
          espera: 250,
          ida: 900,
        },
        {
          pose: { ...comun, pies: par([40, 26, 11]), manos: par([30, 80, 16]) },
          espera: 400,
          ida: 1100,
        },
      ],
      escena: [
        ...caja([-6, 46, 0], [16, 4, 16]),
        trazo([-6, 42, 0], [-6, 0, 0], 5, 'pata'),
        ...caja([52, 4, 0], [9, 4, 24]),
        sombra(10, 0, 80),
      ],
      aparatos: (e) => {
        const rodillas = mezcla(e.piernas[0].medio, e.piernas[1].medio, 0.5);
        return [
          rodillo([rodillas[0], rodillas[1] + 11, -22], [rodillas[0], rodillas[1] + 11, 22], 5),
        ];
      },
    },
  };
}

/* ─── Abducción, aducción y glúteo aislado ────────────────────────────── */

export function aperturaDeRodillas(op: {
  readonly sentido: 'abduccion' | 'aduccion';
  readonly implemento: 'banda' | 'maquina';
}): Demostracion {
  const juntas = { pies: par([38, 12, 12]), rodillas: par([0.3, 1, 0.05]) };
  const abiertas = { pies: par([34, 12, 40]), rodillas: par([0.3, 1, 0.6]) };
  // Las manos agarran el asiento un poco por detrás: el costado de la cadera
  // (el glúteo medio, lo que trabaja al abrir) queda a la vista.
  const comun = { pelvis: [-4, 56, 0] as V3, tronco: -6, manos: par([-14, 52, 25]) };
  const [inicio, final] = op.sentido === 'abduccion' ? [juntas, abiertas] : [abiertas, juntas];
  return {
    titulo:
      op.sentido === 'abduccion'
        ? `abducción de cadera ${op.implemento === 'banda' ? 'con banda, sentado' : 'en máquina'}`
        : 'aducción de cadera en máquina',
    pista:
      op.sentido === 'abduccion'
        ? 'Sentado con la espalda apoyada, separa las rodillas contra la resistencia y vuelve a juntarlas despacio.'
        : 'Sentado con las almohadillas por dentro de las rodillas, júntalas apretando la cara interna de los muslos y ábrelas despacio.',
    movimiento: {
      camara: op.sentido === 'abduccion' ? { giro: 52, alzado: 26 } : { giro: 70, alzado: 16 },
      pasos: [
        { pose: { ...comun, ...inicio }, espera: 250, ida: 1000 },
        { pose: { ...comun, ...final }, espera: 300, ida: 1200 },
      ],
      escena: [
        ...caja([-4, 46, 0], [16, 4, 16]),
        ...caja([-24, 84, 0], [4, 34, 15], { giro: -6 }),
        trazo([-4, 42, 0], [-4, 0, 0], 5, 'pata'),
        sombra(10, 0, 80),
      ],
      aparatos: (e) => {
        const [d, i] = [e.piernas[0].medio, e.piernas[1].medio];
        if (op.implemento === 'banda')
          return [banda(combina(d, [[0, 0, 1], 7]), combina(i, [[0, 0, 1], -7]))];
        const fuera = op.sentido === 'abduccion' ? 9 : -9;
        return [
          ...caja(combina(d, [[0, 0, 1], fuera * 1.15]), [4, 6, 2]),
          ...caja(combina(i, [[0, 0, 1], -fuera * 1.15]), [4, 6, 2]),
        ];
      },
    },
  };
}

export function aduccionEnPolea(): Demostracion {
  const polea: V3 = [4, 8, 84];
  const comun = {
    pelvis: [0, 90, 0] as V3,
    tronco: 0,
    manos: [[6, 110, 60], { desde: 'pelvis', v: [0, 8, -16] }] as Par<Objetivo>,
    codos: [
      [0, -1, 0.4],
      [-0.5, 0, -1],
    ] as Par<V3>,
  };
  return {
    titulo: 'aducción de cadera en polea',
    pista:
      'De pie junto a la polea baja con la cinta en el tobillo, lleva la pierna hacia la otra cruzando por delante, y vuelve despacio.',
    movimiento: {
      camara: { giro: 72, alzado: 10 },
      pasos: [
        {
          pose: {
            ...comun,
            pies: [
              [4, 14, 40],
              [2, 7, -11],
            ],
          },
          espera: 200,
          ida: 1000,
          via: { pies: [{ centro: [0, 90, 9] }, null] },
        },
        {
          pose: {
            ...comun,
            pies: [
              [4, 10, -8],
              [2, 7, -11],
            ],
          },
          espera: 250,
          ida: 1200,
        },
      ],
      escena: [...torre(4, 92, 190), sombra(0, 20, 90)],
      aparatos: (e) => cable(polea, e.piernas[0].fin),
    },
  };
}

/** Tumbado de lado sobre el costado izquierdo, mirando a la cámara. */
const DE_LADO = {
  pelvis: [0, 14, 0] as V3,
  tronco: 0,
  lateral: -78,
  manos: [
    [22, 5, -30],
    [6, 8, -88],
  ] as Par<Objetivo>,
  codos: [
    [1, 0, 0],
    [0, 1, 0],
  ] as Par<V3>,
};

export function elevacionLateralDePierna(): Demostracion {
  const rodillas: Par<V3> = [
    [1, 0, 0],
    [1, 0, 0],
  ];
  return {
    titulo: 'elevación lateral de pierna, tumbado de lado',
    pista:
      'Tumbado de lado con las piernas estiradas, sube la pierna de arriba sin girar la cadera y bájala despacio.',
    movimiento: {
      camara: { giro: 80, alzado: 22 },
      pasos: [
        {
          pose: {
            ...DE_LADO,
            rodillas,
            pies: [
              [2, 18, 80],
              [2, 7, 80],
            ],
          },
          espera: 250,
          ida: 900,
          via: { pies: [{ centro: [0, 22.8, 1.9] }, null] },
        },
        {
          pose: {
            ...DE_LADO,
            rodillas,
            pies: [
              [2, 60, 72],
              [2, 7, 80],
            ],
          },
          espera: 300,
          ida: 1100,
        },
      ],
      escena: [sombra(0, 10, 110)],
    },
  };
}

export function aduccionTumbado(): Demostracion {
  const rodillas: Par<V3> = [
    [0.4, 1, 0.3],
    [1, 0, 0],
  ];
  return {
    titulo: 'aducción tumbado de lado',
    pista:
      'Tumbado de lado con la pierna de arriba doblada por delante, sube la pierna de abajo estirada unos centímetros y bájala despacio.',
    movimiento: {
      camara: { giro: 80, alzado: 22 },
      pasos: [
        {
          pose: {
            ...DE_LADO,
            rodillas,
            pies: [
              [30, 7, 40],
              [2, 7, 80],
            ],
          },
          espera: 250,
          ida: 900,
        },
        {
          pose: {
            ...DE_LADO,
            rodillas,
            pies: [
              [30, 7, 40],
              [2, 30, 76],
            ],
          },
          espera: 300,
          ida: 1100,
        },
      ],
      escena: [sombra(0, 10, 110)],
    },
  };
}

export function patadaDeBurro(): Demostracion {
  const comun = {
    pelvis: [0, 50, 0] as V3,
    tronco: 90,
    cabeza: -20,
    manos: par([50, 3, 17]),
    rodillas: par([0, -1, 0]),
  };
  return {
    titulo: 'patada de burro',
    pista:
      'A cuatro patas, sube una pierna con la rodilla doblada hasta que el muslo quede en línea con la espalda, y bájala sin apoyarla del todo.',
    movimiento: {
      pasos: [
        {
          pose: {
            ...comun,
            pies: [
              [-40, 8, 9],
              [-40, 8, -9],
            ],
          },
          espera: 200,
          ida: 900,
          via: { pies: [{ centro: [0, 50, 9] }, null] },
        },
        {
          pose: {
            ...comun,
            pies: [
              [-40, 92, 9],
              [-40, 8, -9],
            ],
          },
          espera: 300,
          ida: 1000,
        },
      ],
      escena: [sombra(10, 0, 90)],
    },
  };
}

export function patadaDeGluteo(op: { readonly implemento: 'maquina' | 'polea' }): Demostracion {
  const polea: V3 = [60, 8, 11];
  const comun = { pelvis: [0, 90, 0] as V3, tronco: 18, manos: par([54, 138, 12]) };
  return {
    titulo: `patada de glúteo ${op.implemento === 'polea' ? 'en polea' : 'en máquina'}`,
    pista:
      'De pie e inclinado hacia delante, lleva una pierna estirada hacia atrás apretando el glúteo y vuelve despacio sin balancearte.',
    movimiento: {
      camara: DESDE_ATRAS,
      pasos: [
        {
          pose: {
            ...comun,
            pies: [
              [4, 12, 11],
              [2, 7, -11],
            ],
          },
          espera: 200,
          ida: 900,
          via: { pies: [{ centro: [0, 90, 9] }, null] },
        },
        {
          pose: {
            ...comun,
            pies: [
              [-56, 34, 11],
              [2, 7, -11],
            ],
          },
          espera: 300,
          ida: 1100,
        },
      ],
      escena:
        op.implemento === 'polea'
          ? [...torre(68, 11, 190), sombra(20, 0, 90)]
          : [
              ...caja([56, 110, 0], [4, 24, 16]),
              trazo([56, 86, 0], [56, 0, 0], 5, 'pata'),
              sombra(20, 0, 90),
            ],
      aparatos: (e) => {
        const tobillo = e.piernas[0].fin;
        if (op.implemento === 'polea') return cable(polea, tobillo);
        const [apoyo] = rodilloEnElTobillo(e, -1, 0, 20);
        return [
          ...(apoyo === undefined ? [] : [apoyo]),
          cilindro([tobillo[0], tobillo[1], 21], [10, 46, 24], 2.3, 'acero'),
        ];
      },
    },
  };
}
