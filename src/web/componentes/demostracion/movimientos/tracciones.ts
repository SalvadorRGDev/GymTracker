import {
  agarreRecto,
  anilla,
  apoyoDePecho,
  asa,
  bancoPlano,
  banda,
  barra,
  barraFija,
  cable,
  cuerda,
  mancuerna,
  palanca,
  placa,
  rodillo,
  torre,
} from '../aparatos';
import { caja, cilindro, type Pieza, sombra, trazo } from '../escena';
import type { Esqueleto, Par, Pose } from '../esqueleto';
import { combina, mezcla, resta, unitario, type V3 } from '../vector';
import { DESDE_ATRAS, type Demostracion, hombrosDe, manos, par } from './comun';

const EJE_NEUTRO: V3 = [1, 0, 0];

/* ─── Remo inclinado: barra, mancuernas, barra T ──────────────────────── */

export function remoInclinado(op: {
  readonly implemento: 'barra' | 'mancuernas' | 'barra-t';
}): Demostracion {
  const pelvis: V3 = [-24, 80, 0];
  const tronco = 52;
  const h = hombrosDe(pelvis, tronco);
  const junto = op.implemento === 'barra-t' ? 6 : 22;
  const base = {
    pelvis,
    tronco,
    cabeza: -20,
    pies: par([2, 7, 12]),
    codos: par([-1, 0.9, 0.25]),
  };
  const ancla: V3 = [-130, 3, 0];
  const aparatos = (e: Esqueleto): Pieza[] => {
    const [a, b] = manos(e);
    if (op.implemento === 'mancuernas')
      return [...mancuerna(a, EJE_NEUTRO), ...mancuerna(b, EJE_NEUTRO)];
    if (op.implemento === 'barra') return barra(a, b, { eje: [0, 0, 1] });
    const medio = mezcla(a, b, 0.5);
    const dir = unitario(resta(medio, ancla));
    return [
      cilindro(ancla, combina(medio, [dir, 20]), 1.8, 'acero'),
      cilindro(combina(a, [[0, 0, 1], 5]), combina(b, [[0, 0, 1], -5]), 2, 'agarre'),
      placa(combina(medio, [dir, 11]), dir),
      placa(combina(medio, [dir, 17]), dir, 13, 4),
    ];
  };
  const que = { barra: 'con barra', mancuernas: 'con mancuernas', 'barra-t': 'en T' }[
    op.implemento
  ];
  return {
    titulo: `remo inclinado ${que}`,
    pista:
      'Inclinado hacia delante con la espalda recta y las rodillas algo flexionadas, lleva el peso hacia el abdomen y bájalo estirando los brazos.',
    movimiento: {
      pasos: [
        { pose: { ...base, manos: par([h[0] + 1, h[1] - 58, junto]) }, espera: 250, ida: 1000 },
        { pose: { ...base, manos: par([2, 80, junto]) }, espera: 250, ida: 1300 },
      ],
      escena: [...(op.implemento === 'barra-t' ? caja(ancla, [6, 3, 6]) : []), sombra(-6, 0, 80)],
      aparatos,
    },
  };
}

export function remoConMancuernaAUnaMano(): Demostracion {
  const base = {
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
      [-0.8, 1, 0.1],
      [0, -1, -0.2],
    ] as Par<V3>,
  };
  const izquierda: V3 = [32, 45, -16];
  return {
    titulo: 'remo con mancuerna a una mano',
    pista:
      'Con una rodilla y una mano en el banco y la espalda plana, sube la mancuerna hacia la cadera y bájala estirando el brazo.',
    movimiento: {
      pasos: [
        { pose: { ...base, manos: [[29, 36, 20], izquierda] }, espera: 250, ida: 1000 },
        { pose: { ...base, manos: [[4, 78, 22], izquierda] }, espera: 250, ida: 1300 },
      ],
      escena: [...bancoPlano(-82, 42, { alto: 40 }), sombra(-10, 0, 90)],
      aparatos: (e) => mancuerna(e.brazos[0].fin, EJE_NEUTRO),
    },
  };
}

export function remoConPechoApoyado(): Demostracion {
  const pelvis: V3 = [0, 86, 0];
  const h = hombrosDe(pelvis, 45);
  const base = {
    pelvis,
    tronco: 45,
    cabeza: -15,
    pies: par([-10, 7, 14]),
    codos: par([-0.7, 1, 0.3]),
  };
  return {
    titulo: 'remo con el pecho apoyado en banco inclinado',
    pista:
      'Con el pecho apoyado en el banco inclinado, sube las mancuernas hacia las costillas y bájalas estirando los brazos.',
    movimiento: {
      camara: DESDE_ATRAS,
      pasos: [
        { pose: { ...base, manos: par([h[0] + 2, h[1] - 57, 22]) }, espera: 250, ida: 1000 },
        { pose: { ...base, manos: par([20, 98, 22]) }, espera: 250, ida: 1300 },
      ],
      escena: [...apoyoDePecho(pelvis, 45), sombra(10, 0, 80)],
      aparatos: (e) => manos(e).flatMap((m) => mancuerna(m, EJE_NEUTRO)),
    },
  };
}

/* ─── Remo sentado: polea, a una mano, máquina, banda, escapular ──────── */

export function remoSentado(op: {
  readonly agarre: 'polea' | 'una-mano' | 'maquina' | 'banda' | 'escapular';
}): Demostracion {
  if (op.agarre === 'maquina') return remoEnMaquina();
  if (op.agarre === 'banda') return remoConBanda();
  const polea: V3 = [96, 38, 0];
  const escena: Pieza[] = [
    ...bancoPlano(-50, 30, { alto: 40 }),
    ...caja([80, 40, 0], [3, 16, 20], { giro: -15 }),
    ...torre(106, 0, 120),
    sombra(30, 0, 100),
  ];
  const pies = {
    pies: par([72, 36, 12]),
    puntas: par([75, 51, 12]),
    rodillas: par([0.2, 1, 0.1]),
    codos: par([-1, -0.2, 0.3]),
  };
  if (op.agarre === 'escapular') {
    const base = { ...pies, pelvis: [0, 50, 0] as V3, tronco: 0 };
    return {
      titulo: 'retracciones escapulares en polea',
      pista:
        'Con los brazos estirados, junta los omóplatos llevando los hombros hacia atrás y vuelve a soltarlos hacia delante, sin doblar los codos.',
      movimiento: {
        camara: DESDE_ATRAS,
        pasos: [
          { pose: { ...base, hombrosAtras: -5, manos: par([63, 94, 9]) }, espera: 250, ida: 900 },
          { pose: { ...base, hombrosAtras: 6, manos: par([52, 94, 9]) }, espera: 300, ida: 900 },
        ],
        escena,
        aparatos: (e) => {
          const [a, b] = manos(e);
          return [...cable(polea, mezcla(a, b, 0.5)), agarreRecto(a, b)];
        },
      },
    };
  }
  const unaMano = op.agarre === 'una-mano';
  const izquierdaEnElMuslo: V3 = [20, 70, -12];
  const inicio: Pose = {
    ...pies,
    pelvis: [0, 50, 0],
    tronco: 14,
    manos: unaMano ? [[68.1, 90.5, 9], izquierdaEnElMuslo] : par([68.1, 90.5, 7]),
  };
  const final: Pose = {
    ...pies,
    pelvis: [0, 50, 0],
    tronco: -4,
    manos: unaMano ? [[20, 80, 18], izquierdaEnElMuslo] : par([20, 80, 7]),
  };
  return {
    titulo: unaMano ? 'remo a una mano en polea, sentado' : 'remo en polea, sentado',
    pista:
      'Sentado con los pies apoyados y la espalda recta, tira del agarre hacia el abdomen llevando los codos atrás y vuelve estirando los brazos.',
    movimiento: {
      camara: DESDE_ATRAS,
      pasos: [
        { pose: inicio, espera: 250, ida: 1000 },
        { pose: final, espera: 250, ida: 1300 },
      ],
      escena,
      aparatos: (e) => {
        const [a, b] = manos(e);
        if (unaMano) return [...cable(polea, a), asa(a)];
        return [...cable(polea, mezcla(a, b, 0.5)), agarreRecto(a, b, 4)];
      },
    },
  };
}

function remoEnMaquina(): Demostracion {
  const base = {
    pelvis: [0, 56, 0] as V3,
    tronco: 0,
    pies: par([44, 7, 15]),
    codos: par([-1, -0.1, 0.4]),
  };
  return {
    titulo: 'remo en máquina',
    pista:
      'Sentado con el pecho contra el apoyo, tira de las asas hacia ti llevando los codos atrás y vuelve estirando los brazos.',
    movimiento: {
      camara: DESDE_ATRAS,
      pasos: [
        {
          pose: { ...base, manos: par([56, 102, 18]) },
          espera: 250,
          ida: 1000,
          via: { manos: [{ centro: [44, 31.6, 18] }, { centro: [44, 31.6, -18] }] },
        },
        { pose: { ...base, manos: par([18, 98, 20]) }, espera: 250, ida: 1300 },
      ],
      escena: [
        ...caja([0, 42, 0], [16, 4, 15]),
        trazo([0, 38, 0], [0, 0, 0], 5, 'pata'),
        ...caja([19, 104, 0], [3, 16, 13]),
        trazo([22, 96, 0], [44, 31.6, 0], 5, 'pata'),
        trazo([44, 31.6, -26], [44, 31.6, 26], 5, 'pata'),
        trazo([44, 31.6, 0], [44, 0, 0], 5, 'pata'),
        sombra(20),
      ],
      aparatos: (e) =>
        manos(e).flatMap((m, i) => [palanca([44, 31.6, i === 0 ? 24 : -24], m), asa(m)]),
    },
  };
}

function remoConBanda(): Demostracion {
  const base = {
    pelvis: [0, 12, 0] as V3,
    pies: par([82, 7, 10]),
    puntas: par([85, 22, 10]),
    codos: par([-1, -0.1, 0.3]),
    rodillas: par([0.1, 1, 0.1]),
  };
  return {
    titulo: 'remo con banda, sentado en el suelo',
    pista:
      'Sentado con las piernas estiradas y la banda en los pies, tira hacia el abdomen llevando los codos atrás y vuelve despacio.',
    movimiento: {
      camara: DESDE_ATRAS,
      pasos: [
        { pose: { ...base, tronco: 16, manos: par([62, 44, 8]) }, espera: 250, ida: 1000 },
        { pose: { ...base, tronco: -2, manos: par([18, 40, 8]) }, espera: 250, ida: 1300 },
      ],
      escena: [sombra(30, 0, 90)],
      aparatos: (e) => manos(e).map((m, i) => banda([87, 14, i === 0 ? 8 : -8], m)),
    },
  };
}

/* ─── Remo invertido: barra, anillas, mesa ────────────────────────────── */

/** Cuerpo recto boca arriba, apoyado en los talones: se sabe todo con el tobillo y el ángulo. */
function tablaBocaArriba(tobillo: V3, grados: number): { pelvis: V3; tronco: number; hombros: V3 } {
  const a = (grados * Math.PI) / 180;
  const dir: V3 = [-Math.cos(a), Math.sin(a), 0];
  const pelvis = combina(tobillo, [dir, 83]);
  return { pelvis, tronco: -(90 - grados), hombros: combina(pelvis, [dir, 50]) };
}

export function remoInvertido(op: { readonly apoyo: 'barra' | 'anillas' | 'mesa' }): Demostracion {
  const mesa = op.apoyo === 'mesa';
  const alto = mesa ? 76 : 95;
  const tobilloY = 10;
  // Bajo la mesa, el pecho se queda un poco más lejos: la cabeza va debajo del tablero.
  const arribaGrados = (Math.asin((alto - (mesa ? 24 : 17) - tobilloY) / 133) * 180) / Math.PI;
  const tobillo: V3 = [-2 + 133 * Math.cos((arribaGrados * Math.PI) / 180), tobilloY, 0];
  let abajoGrados = arribaGrados;
  for (; abajoGrados > 0; abajoGrados -= 0.5) {
    const t = tablaBocaArriba(tobillo, abajoGrados);
    if (Math.hypot(t.hombros[0], t.hombros[1] - alto) >= 58) break;
  }
  const arriba = tablaBocaArriba(tobillo, arribaGrados);
  const abajo = tablaBocaArriba(tobillo, abajoGrados);
  const base = {
    pies: par([tobillo[0], tobillo[1], 10]),
    puntas: par([tobillo[0] + 6, tobillo[1] + 14, 10]),
    manos: par([mesa ? 4 : 0, alto, 26]),
    codos: par([0.3, -1, 0.6]),
  };
  const escena: Pieza[] = [];
  if (op.apoyo === 'barra') {
    escena.push(...barraFija(0, alto, 70, false));
    // Sólo el poste del fondo: el de delante taparía la figura.
    escena.push(trazo([0, 0, -70], [0, 140, -70], 5, 'pata'));
  } else if (op.apoyo === 'anillas') {
    for (const z of [-26, 26]) {
      escena.push(trazo([0, alto + 6, z], [0, alto + 90, z], 1.6, 'cable'));
      escena.push(anilla([0, alto, z]));
    }
  } else {
    escena.push(...caja([-32, alto - 3, 0], [34, 2.5, 45]));
    for (const x of [-60, -6])
      for (const z of [-40, 40]) escena.push(trazo([x, 0, z], [x, alto - 5, z], 4, 'pata'));
  }
  const donde = { barra: 'en barra', anillas: 'en anillas', mesa: 'bajo una mesa' }[op.apoyo];
  return {
    titulo: `remo invertido ${donde}`,
    pista:
      'Colgado por debajo con el cuerpo recto y los talones en el suelo, lleva el pecho hacia el agarre y baja estirando los brazos.',
    movimiento: {
      pasos: [
        { pose: { ...base, pelvis: abajo.pelvis, tronco: abajo.tronco }, espera: 250, ida: 1000 },
        {
          pose: { ...base, pelvis: arriba.pelvis, tronco: arriba.tronco, cabeza: mesa ? -15 : 0 },
          espera: 250,
          ida: 1200,
        },
      ],
      escena: [...escena, sombra(40, 0, 100)],
    },
  };
}

/* ─── Face pull y remo alto ───────────────────────────────────────────── */

export function facePull(op: {
  readonly implemento: 'polea' | 'banda';
  readonly alto?: boolean;
}): Demostracion {
  const pelvis: V3 = [-4, 90, 0];
  const h = hombrosDe(pelvis, -6);
  const polea: V3 = [110, op.alto === true ? 140 : 150, 0];
  const base = { pelvis, tronco: -6, pies: par([2, 7, 12]), codos: par([-0.5, 0.6, 1]) };
  const final = op.alto === true ? par([h[0] + 14, h[1] + 2, 28]) : par([h[0] + 12, h[1] + 20, 24]);
  return {
    titulo:
      op.alto === true
        ? 'remo alto en polea'
        : `face pull ${op.implemento === 'banda' ? 'con banda' : 'en polea'}`,
    pista:
      op.alto === true
        ? 'De pie frente a la polea, tira hacia el pecho con los codos altos y abiertos, y vuelve estirando los brazos.'
        : 'Tira de la cuerda hacia la cara separando las manos, con los codos altos, y vuelve estirando los brazos.',
    movimiento: {
      camara: DESDE_ATRAS,
      pasos: [
        { pose: { ...base, manos: par([h[0] + 56, h[1] + 8, 8]) }, espera: 250, ida: 1000 },
        { pose: { ...base, manos: final }, espera: 300, ida: 1200 },
      ],
      escena: [...torre(polea[0] + 8, 0, 210), sombra(30, 0, 100)],
      aparatos: (e) => {
        const [a, b] = manos(e);
        if (op.implemento === 'banda') return [banda(polea, a), banda(polea, b)];
        const nudo = combina(mezcla(a, b, 0.5), [unitario(resta(polea, mezcla(a, b, 0.5))), 10]);
        return [...cable(polea, nudo), ...cuerda(nudo, a, b)];
      },
    },
  };
}

/* ─── Dominadas, colgarse y jalones ───────────────────────────────────── */

const BARRA_FIJA: V3 = [6, 218, 0];
const barraDeDominadas = () => barraFija(BARRA_FIJA[0], BARRA_FIJA[1]);

export function dominada(op: {
  readonly variante: 'prona' | 'supina' | 'asistida' | 'escapular';
}): Demostracion {
  const colgado: Pose = {
    pelvis: [13, 109.5, 0],
    tronco: -8,
    manos: par([BARRA_FIJA[0], BARRA_FIJA[1], 28]),
    pies: par([-2, 30, 5]),
    codos: par([0.3, -1, 0.9]),
    rodillas: par([1, 0, 0.1]),
  };
  if (op.variante === 'escapular') {
    return {
      titulo: 'dominadas escapulares',
      pista:
        'Colgado con los brazos estirados, baja los hombros alejándolos de las orejas para subir un poco el cuerpo, y vuelve a soltarlos.',
      movimiento: {
        camara: DESDE_ATRAS,
        pasos: [
          { pose: { ...colgado, pelvis: [13, 104.5, 0], hombros: 5 }, espera: 300, ida: 800 },
          {
            pose: { ...colgado, pelvis: [11.7, 114.4, 0], hombros: -5, pies: par([-2, 40, 5]) },
            espera: 400,
            ida: 800,
          },
        ],
        escena: [...barraDeDominadas(), sombra(6, 0, 70)],
      },
    };
  }
  const asistida = op.variante === 'asistida';
  const arriba: Pose = {
    ...colgado,
    pelvis: [12.1, 154.5, 0],
    tronco: -14,
    pies: asistida ? par([-29, 117, 9]) : par([-4, 76, 5]),
  };
  const abajo: Pose = asistida
    ? { ...colgado, pies: par([-28, 72, 9]), rodillas: par([0.8, -1, 0.1]) }
    : colgado;
  const arribaFinal: Pose = asistida ? { ...arriba, rodillas: par([0.8, -1, 0.1]) } : arriba;
  return {
    titulo: {
      prona: 'dominadas',
      supina: 'dominadas con las palmas hacia ti',
      asistida: 'dominadas asistidas en máquina',
      escapular: '',
    }[op.variante],
    pista:
      'Colgado de la barra con los brazos estirados, sube hasta pasar la barbilla por encima de la barra y baja con control.',
    movimiento: {
      camara: DESDE_ATRAS,
      pasos: [
        { pose: abajo, espera: 300, ida: 1100 },
        { pose: arribaFinal, espera: 250, ida: 1300 },
      ],
      escena: [...barraDeDominadas(), sombra(6, 0, 70)],
      ...(asistida
        ? {
            aparatos: (e: Esqueleto) => {
              const rodillas = mezcla(e.piernas[0].medio, e.piernas[1].medio, 0.5);
              const apoyo: V3 = [rodillas[0], rodillas[1] - 9, 0];
              return [...caja(apoyo, [14, 3, 20]), trazo(apoyo, [apoyo[0] - 50, 0, 0], 5, 'pata')];
            },
          }
        : {}),
    },
  };
}

export function colgarse(): Demostracion {
  const colgado: Pose = {
    pelvis: [13, 109.5, 0],
    tronco: -6,
    manos: par([BARRA_FIJA[0], BARRA_FIJA[1], 28]),
    pies: par([8, 28, 7]),
    codos: par([0.3, -1, 0.9]),
    hombros: 3,
  };
  return {
    titulo: 'colgarse de la barra',
    pista:
      'Cuélgate de la barra con los brazos estirados y aguanta el tiempo que te marques, respirando con calma.',
    movimiento: {
      pasos: [
        { pose: colgado, espera: 600, ida: 1400 },
        { pose: { ...colgado, pelvis: [13, 108.5, 0], hombros: 4 }, espera: 600, ida: 1400 },
      ],
      escena: [...barraDeDominadas(), sombra(6, 0, 70)],
      sostenido: true,
    },
  };
}

export function jalon(op: { readonly unaMano?: boolean } = {}): Demostracion {
  const pelvis: V3 = [0, 60, 0];
  const h = hombrosDe(pelvis, -10);
  const polea: V3 = [0, 232, 0];
  const unaMano = op.unaMano === true;
  const izquierdaEnElMuslo: V3 = [26, 66, -12];
  const arriba: Par<V3> = unaMano
    ? [[h[0] + 8, h[1] + 58, 22], izquierdaEnElMuslo]
    : par([h[0] + 8, h[1] + 58, 34]);
  const abajo: Par<V3> = unaMano
    ? [[h[0] + 15, h[1] + 7, 24], izquierdaEnElMuslo]
    : par([h[0] + 20, h[1] + 10, 34]);
  const base = { pelvis, tronco: -10, pies: par([42, 7, 12]), codos: par([-0.3, -1, 1]) };
  return {
    titulo: unaMano ? 'jalón a una mano' : 'jalón al pecho',
    pista:
      'Sentado con las rodillas sujetas, baja el agarre hasta la parte alta del pecho llevando los codos hacia abajo, y deja que suba con control.',
    movimiento: {
      camara: DESDE_ATRAS,
      pasos: [
        { pose: { ...base, manos: arriba }, espera: 250, ida: 1000 },
        { pose: { ...base, manos: abajo }, espera: 250, ida: 1300 },
      ],
      escena: [
        ...caja([0, 46, 0], [16, 4, 15]),
        trazo([0, 42, 0], [0, 0, 0], 5, 'pata'),
        rodillo([30, 80, -20], [30, 80, 20], 5),
        trazo([30, 80, 0], [30, 0, 0], 4, 'pata'),
        trazo([-44, 0, 0], [-44, 238, 0], 6, 'pata'),
        trazo([-44, 238, 0], [0, 238, 0], 6, 'pata'),
        sombra(0, 0, 80),
      ],
      aparatos: (e) => {
        const [a, b] = manos(e);
        if (unaMano) return [...cable([0, 232, 8], a), asa(a)];
        return [...cable(polea, mezcla(a, b, 0.5)), agarreRecto(a, b, 12)];
      },
    },
  };
}

/* ─── Remo al mentón y jalón con brazos rectos ────────────────────────── */

export function remoAlMenton(op: {
  readonly implemento: 'barra' | 'mancuernas' | 'polea';
}): Demostracion {
  const base = {
    pelvis: [0, 90, 0] as V3,
    tronco: 0,
    pies: par([2, 7, 11]),
    codos: par([-0.1, 1, 1.1]),
  };
  const polea: V3 = [62, 8, 0];
  return {
    titulo: `remo al mentón ${{ barra: 'con barra', mancuernas: 'con mancuernas', polea: 'en polea' }[op.implemento]}`,
    pista:
      'De pie, sube el peso pegado al cuerpo hasta la altura del pecho con los codos por encima de las manos, y bájalo con control.',
    movimiento: {
      // Casi de frente: se ven los codos subir por encima de las manos.
      camara: { giro: 56, alzado: 8 },
      pasos: [
        {
          pose: {
            ...base,
            manos: par([
              op.implemento === 'mancuernas' ? 14 : 11,
              84,
              op.implemento === 'mancuernas' ? 16 : 12,
            ]),
          },
          espera: 250,
          ida: 1000,
        },
        {
          pose: { ...base, manos: par([14, 136, op.implemento === 'mancuernas' ? 16 : 12]) },
          espera: 250,
          ida: 1200,
        },
      ],
      escena: [...(op.implemento === 'polea' ? torre(70, 0, 190) : []), sombra(10, 0, 80)],
      aparatos: (e) => {
        const [a, b] = manos(e);
        if (op.implemento === 'mancuernas')
          return [...mancuerna(a, [0, 0, 1]), ...mancuerna(b, [0, 0, 1])];
        if (op.implemento === 'barra') return barra(a, b, { eje: [0, 0, 1], radio: 16 });
        return [...cable(polea, mezcla(a, b, 0.5)), agarreRecto(a, b, 8)];
      },
    },
  };
}

export function jalonConBrazosRectos(): Demostracion {
  const pelvis: V3 = [-8, 88, 0];
  const h = hombrosDe(pelvis, 22);
  const rad = Math.PI / 180;
  const enArco = (grados: number) =>
    par([h[0] + 58 * Math.cos(grados * rad), h[1] + 58 * Math.sin(grados * rad), 14]);
  const polea: V3 = [98, 205, 0];
  const base = { pelvis, tronco: 22, pies: par([4, 7, 12]), codos: par([-1, 0, 0.3]) };
  return {
    titulo: 'jalón con brazos rectos',
    pista:
      'Con los brazos casi rectos, baja la barra desde delante de la cabeza hasta los muslos trazando un arco, y vuelve despacio.',
    movimiento: {
      camara: DESDE_ATRAS,
      pasos: [
        {
          pose: { ...base, manos: enArco(38) },
          espera: 250,
          ida: 1000,
          via: { manos: [{ centro: [h[0], h[1], 14] }, { centro: [h[0], h[1], -14] }] },
        },
        { pose: { ...base, manos: enArco(-70) }, espera: 250, ida: 1300 },
      ],
      escena: [...torre(106, 0, 212), sombra(30, 0, 100)],
      aparatos: (e) => {
        const [a, b] = manos(e);
        return [...cable(polea, mezcla(a, b, 0.5)), agarreRecto(a, b, 10)];
      },
    },
  };
}
