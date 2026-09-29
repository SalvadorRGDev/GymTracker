import {
  anilla,
  asa,
  bancoPlano,
  barra,
  mancuerna,
  palanca,
  placa,
  respaldo,
  rodillo,
} from '../aparatos';
import { caja, cilindro, type Pieza, sombra, trazo } from '../escena';
import type { Esqueleto, Par, Pose } from '../esqueleto';
import { combina, resta, unitario, type V3 } from '../vector';
import { type Demostracion, hombrosDe, manos, par } from './comun';

/* ─── Press tumbado: banca, inclinado, declinado, suelo, Smith ─────────── */

export interface OpcionesDePressTumbado {
  readonly implemento: 'barra' | 'mancuernas' | 'smith';
  readonly banco: 'plano' | 'inclinado' | 'declinado' | 'suelo';
  readonly cerrado?: boolean;
}

export function pressTumbado(op: OpcionesDePressTumbado): Demostracion {
  const anchoDeAgarre = op.cerrado === true ? 13 : op.implemento === 'mancuernas' ? 22 : 25;
  const escena: Pieza[] = [];
  let pelvis: V3;
  let tronco: number;
  let arriba: V3;
  let abajo: V3;
  let pies: V3;
  let rodillas: V3 = [0.3, 1, 0.2];

  if (op.banco === 'inclinado') {
    const r = respaldo([10, 44, 0], 32, 92);
    escena.push(...r.piezas, ...bancoPlano(4, 44, { alto: 44 }));
    tronco = -58;
    pelvis = [16, 55, 0];
    const hombros = combina(pelvis, [[-0.848, 0.53, 0], 50]);
    arriba = [hombros[0] + 2, hombros[1] + 59, 0];
    abajo = [hombros[0] + 14, hombros[1] + 16, 0];
    pies = [64, 7, 20];
  } else if (op.banco === 'declinado') {
    escena.push(
      ...caja([-14, 38, 0], [58, 4, 13], { giro: 15 }),
      trazo([-40, 20, 0], [-40, 0, 0], 5, 'pata'),
      trazo([22, 45, 0], [22, 0, 0], 5, 'pata'),
      rodillo([54, 52, -18], [54, 52, 18], 4.5),
      trazo([54, 52, 0], [48, 0, 0], 5, 'pata'),
    );
    tronco = -105;
    pelvis = [16, 60, 0];
    const hombros = combina(pelvis, [[-0.966, -0.259, 0], 50]);
    arriba = [hombros[0] + 2, hombros[1] + 60, 0];
    abajo = [hombros[0] + 13, hombros[1] + 18, 0];
    pies = [62, 34, 11];
    rodillas = [0.6, 1, 0.1];
  } else if (op.banco === 'suelo') {
    tronco = -90;
    pelvis = [18, 12, 0];
    arriba = [-30, 72, 0];
    abajo = [-24, 34, 0];
    pies = [56, 7, 14];
  } else {
    escena.push(...bancoPlano(-72, 42));
    tronco = -90;
    pelvis = [18, 56, 0];
    arriba = [-30, 117, 0];
    abajo = [-18, 71, 0];
    pies = [70, 7, 22];
  }
  if (op.implemento === 'smith') {
    for (const z of [-62, 62]) {
      escena.push(trazo([arriba[0] + 2, 0, z], [arriba[0] + 2, 150, z], 4, 'pata'));
    }
  }
  if (op.implemento === 'smith' || op.banco === 'suelo') abajo = [arriba[0], abajo[1], 0];

  const conAncho = (p: V3, extra = 0) => par([p[0], p[1], anchoDeAgarre + extra]);
  const base = {
    pelvis,
    tronco,
    pies: par(pies),
    codos: par([0.15, -1, 0.9]),
    rodillas: par(rodillas),
  };
  const estirado: Pose = { ...base, manos: conAncho(arriba) };
  const flexionado: Pose = {
    ...base,
    manos: conAncho(abajo, op.implemento === 'mancuernas' ? 8 : 0),
  };
  const aparatos =
    op.implemento === 'mancuernas'
      ? (e: Esqueleto) => manos(e).flatMap((m) => mancuerna(m, e.marco.derecha))
      : (e: Esqueleto) => {
          const [a, b] = manos(e);
          return barra(a, b, { eje: [0, 0, 1] });
        };

  const banco = {
    plano: 'en banco plano',
    inclinado: 'en banco inclinado',
    declinado: 'en banco declinado',
    suelo: 'tumbado en el suelo',
  }[op.banco];
  const con = { barra: 'con barra', mancuernas: 'con mancuernas', smith: 'en máquina Smith' }[
    op.implemento
  ];
  return {
    titulo: `press ${banco} ${con}${op.cerrado === true ? ' y agarre cerrado' : ''}`,
    pista:
      op.banco === 'suelo'
        ? 'Tumbado boca arriba con las rodillas dobladas, baja el peso hasta que los codos toquen el suelo y empuja hasta estirar los brazos.'
        : `Tumbado en el banco con los pies en el suelo, baja ${op.implemento === 'mancuernas' ? 'las mancuernas' : 'la barra'} con control hasta el pecho y empuja hasta estirar los brazos.`,
    movimiento: {
      pasos: [
        { pose: estirado, espera: 300, ida: 1300 },
        { pose: flexionado, espera: 150, ida: 1000 },
      ],
      // Un poco más alta: tumbado, el pecho mira arriba y de lado apenas se ve.
      camara: { giro: 30, alzado: op.banco === 'plano' || op.banco === 'suelo' ? 22 : 16 },
      escena: [...escena, sombra(pelvis[0] - 20)],
      aparatos,
    },
  };
}

/* ─── Flexiones ────────────────────────────────────────────────────────── */

export interface OpcionesDeFlexion {
  readonly apoyo: 'suelo' | 'manos-en-banco' | 'pies-en-banco' | 'anillas';
  readonly diamante?: boolean;
}

/**
 * El cuerpo es una tabla que gira sobre las puntas de los pies: con el tobillo
 * y el ángulo se sabe dónde queda todo lo demás.
 */
function tabla(tobillo: V3, grados: number): { pelvis: V3; tronco: number; hombros: V3 } {
  const a = (grados * Math.PI) / 180;
  const dir: V3 = [Math.cos(a), Math.sin(a), 0];
  const pelvis = combina(tobillo, [dir, 83]);
  return { pelvis, tronco: 90 - grados, hombros: combina(pelvis, [dir, 50]) };
}

export function flexion(op: OpcionesDeFlexion): Demostracion {
  const escena: Pieza[] = [];
  const alturaDeManos = { suelo: 3, 'manos-en-banco': 47, 'pies-en-banco': 3, anillas: 24 }[
    op.apoyo
  ];
  const alturaDeTobillo = op.apoyo === 'pies-en-banco' ? 52 : 11;
  const manoX = 0;
  const arribaGrados = (Math.asin((alturaDeManos + 58 - alturaDeTobillo) / 133) * 180) / Math.PI;
  const abajoGrados = (Math.asin((alturaDeManos + 22 - alturaDeTobillo) / 133) * 180) / Math.PI;
  const tobillo: V3 = [manoX - 133 * Math.cos((arribaGrados * Math.PI) / 180), alturaDeTobillo, 0];
  const arriba = tabla(tobillo, arribaGrados);
  const abajo = tabla(tobillo, abajoGrados);
  const anchoDeManos = op.diamante === true ? 5 : 24;
  // Las puntas de los pies, en el suelo o sobre el banco.
  const punta: V3 = [tobillo[0] + 5, op.apoyo === 'pies-en-banco' ? 45.5 : 1, 0];

  if (op.apoyo === 'manos-en-banco') escena.push(...bancoPlano(-14, 40, { ancho: 16 }));
  if (op.apoyo === 'pies-en-banco') escena.push(...bancoPlano(tobillo[0] - 44, tobillo[0] + 6));
  if (op.apoyo === 'anillas') {
    for (const z of [anchoDeManos, -anchoDeManos]) {
      escena.push(
        trazo([manoX, alturaDeManos + 6, z], [manoX, alturaDeManos + 100, z], 1.6, 'cable'),
      );
      escena.push(anilla([manoX, alturaDeManos, z]));
    }
  }
  const base = {
    pies: par([tobillo[0], tobillo[1], 9]),
    puntas: par([punta[0], punta[1], 9]),
    manos: par([manoX, alturaDeManos, anchoDeManos]),
    codos: op.diamante === true ? par([-0.9, 0.4, 0.3]) : par([-0.9, 0.5, 0.8]),
  };
  const pose = (t: ReturnType<typeof tabla>): Pose => ({
    ...base,
    pelvis: t.pelvis,
    tronco: t.tronco,
  });
  const donde = {
    suelo: 'con las manos en el suelo',
    'manos-en-banco': 'con las manos en un banco',
    'pies-en-banco': 'con los pies en un banco',
    anillas: 'en anillas',
  }[op.apoyo];
  return {
    titulo: `flexiones ${donde}${op.diamante === true ? ', manos juntas' : ''}`,
    pista:
      'Con el cuerpo recto de los talones a la cabeza, baja el pecho doblando los codos y vuelve a subir empujando.',
    movimiento: {
      // Con los pies en alto el pecho mira más al suelo: la cámara baja a verlo.
      ...(op.apoyo === 'pies-en-banco' ? { camara: { giro: 40, alzado: 2 } } : {}),
      pasos: [
        { pose: pose(arriba), espera: 250, ida: 1100 },
        { pose: pose(abajo), espera: 150, ida: 900 },
      ],
      escena: [...escena, sombra(tobillo[0] + 70, 0, 90)],
    },
  };
}

/* ─── Press de pecho en máquina ───────────────────────────────────────── */

export function pressDePechoEnMaquina(): Demostracion {
  const pelvis: V3 = [0, 56, 0];
  const base = {
    pelvis,
    tronco: -4,
    pies: par([44, 7, 15]),
    codos: par([-1, -0.2, 0.9]),
  };
  return {
    titulo: 'press de pecho en máquina',
    pista:
      'Sentado con la espalda apoyada, empuja las asas hacia delante hasta estirar los brazos y vuelve despacio.',
    movimiento: {
      pasos: [
        {
          pose: { ...base, manos: par([8, 102, 27]) },
          espera: 250,
          ida: 1000,
          via: { manos: [{ centro: [35, 173, 27] }, { centro: [35, 173, -27] }] },
        },
        { pose: { ...base, manos: par([56, 100, 20]) }, espera: 200, ida: 1300 },
      ],
      escena: [
        ...caja([0, 42, 0], [16, 4, 16]),
        trazo([0, 38, 0], [0, 0, 0], 5, 'pata'),
        ...caja([-17, 96, 0], [4, 40, 15]),
        trazo([-17, 56, 0], [-17, 180, 0], 5, 'pata'),
        trazo([-17, 180, 0], [35, 180, 0], 5, 'pata'),
        trazo([35, 180, -34], [35, 180, 34], 5, 'pata'),
        sombra(10),
      ],
      aparatos: (e) =>
        manos(e).flatMap((m, i) => [palanca([35, 178, i === 0 ? 34 : -34], m), asa(m)]),
    },
  };
}

/* ─── Press vertical: militar, con mancuernas, en máquina, Smith, Arnold ─ */

export interface OpcionesDePressVertical {
  readonly implemento: 'barra' | 'mancuernas' | 'maquina' | 'smith';
  readonly sentado: boolean;
  readonly arnold?: boolean;
}

export function pressVertical(op: OpcionesDePressVertical): Demostracion {
  const escena: Pieza[] = [];
  let pelvis: V3 = [0, 90, 0];
  let tronco = 0;
  let pies = par([2, 7, 11]);
  if (op.sentado) {
    pelvis = [0, 56, 0];
    tronco = -3;
    pies = par([42, 7, 16]);
    escena.push(
      ...caja([0, 42, 0], [16, 4, 15]),
      trazo([0, 38, 0], [0, 0, 0], 5, 'pata'),
      ...caja([-16, 100, 0], [4, 44, 13]),
      trazo([-16, 56, 0], [-16, 0, 0], 5, 'pata'),
    );
  }
  const h = hombrosDe(pelvis, tronco);
  const enHombros = (dx: number, dy: number, z: number) => par([h[0] + dx, h[1] + dy, z]);
  let abajo: Par<V3>;
  let arriba: Par<V3>;
  let codosAbajo = par([0.1, -1, 1.3]);
  let via: Par<{ pasa: V3 } | null> | null = null;
  if (op.implemento === 'barra') {
    abajo = enHombros(10, 2, 25);
    arriba = enHombros(2, 59, 25);
    codosAbajo = par([0.5, -1, 0.6]);
    via = [{ pasa: [h[0] + 15, h[1] + 30, 25] }, { pasa: [h[0] + 15, h[1] + 30, -25] }];
  } else if (op.implemento === 'smith') {
    abajo = enHombros(15, 0, 25);
    arriba = enHombros(15, 54, 25);
    codosAbajo = par([0.5, -1, 0.6]);
    for (const z of [-62, 62])
      escena.push(trazo([h[0] + 15, 0, z], [h[0] + 15, 190, z], 4, 'pata'));
  } else if (op.implemento === 'maquina') {
    abajo = enHombros(5, 2, 33);
    arriba = enHombros(2, 58, 24);
  } else if (op.arnold === true) {
    abajo = enHombros(14, 4, 13);
    arriba = enHombros(2, 58, 21);
    codosAbajo = par([1, -1, 0.2]);
  } else {
    abajo = enHombros(5, 2, 33);
    arriba = enHombros(2, 58, 21);
  }
  const base = { pelvis, tronco, pies };
  const aparatos = (e: Esqueleto): Pieza[] => {
    const [a, b] = manos(e);
    if (op.implemento === 'barra' || op.implemento === 'smith')
      return barra(a, b, { eje: [0, 0, 1] });
    if (op.implemento === 'mancuernas')
      return [...mancuerna(a, e.marco.derecha), ...mancuerna(b, e.marco.derecha)];
    // Asas que suben por dos guías verticales a los lados del asiento.
    return manos(e).flatMap((m, i) => {
      const z = i === 0 ? 42 : -42;
      return [
        trazo([h[0] + 2, 88, z], [h[0] + 2, 180, z], 4, 'pata'),
        palanca([m[0], m[1], z], m),
        asa(m, [1, 0, 0], 10),
      ];
    });
  };
  const titulo =
    op.arnold === true
      ? 'press Arnold'
      : {
          barra: 'press militar con barra, de pie',
          mancuernas: `press de hombro con mancuernas${op.sentado ? ', sentado' : ''}`,
          maquina: 'press de hombro en máquina',
          smith: 'press de hombro en máquina Smith',
        }[op.implemento];
  const pista =
    op.arnold === true
      ? 'Empieza con las mancuernas delante de la cara y las palmas hacia ti; al subir, abre los codos y gira las muñecas hasta que miren al frente.'
      : 'Empuja el peso desde la altura de los hombros hasta estirar los brazos por encima de la cabeza, con el tronco firme, y bájalo con control.';
  return {
    titulo,
    pista,
    movimiento: {
      pasos: [
        {
          pose: { ...base, manos: abajo, codos: codosAbajo },
          espera: 200,
          ida: 1000,
          ...(via === null ? {} : { via: { manos: via } }),
        },
        { pose: { ...base, manos: arriba, codos: par([0.1, -1, 1]) }, espera: 250, ida: 1300 },
      ],
      escena: [...escena, sombra(op.sentado ? 14 : 0)],
      aparatos,
    },
  };
}

/* ─── Press landmine ──────────────────────────────────────────────────── */

export function pressLandmine(): Demostracion {
  const ancla: V3 = [130, 3, 4];
  const base = {
    pelvis: [0, 90, 0] as V3,
    tronco: 4,
    pies: [
      [8, 7, 12],
      [-14, 7, -11],
    ] as Par<V3>,
    codos: [
      [0.3, -1, 0.4],
      [-1, -0.2, 0.4],
    ] as Par<V3>,
  };
  return {
    titulo: 'press landmine a una mano',
    pista:
      'Con el extremo de la barra a la altura del hombro, empújalo hacia arriba y hacia delante; la otra punta queda apoyada en el suelo.',
    movimiento: {
      pasos: [
        {
          pose: {
            ...base,
            manos: [
              [10, 140, 12],
              [2, 84, -20],
            ],
          },
          espera: 200,
          ida: 1000,
          via: { manos: [{ centro: ancla }, null] },
        },
        {
          pose: {
            ...base,
            manos: [
              [46.7, 165.1, 8],
              [2, 84, -20],
            ],
          },
          espera: 250,
          ida: 1200,
        },
      ],
      camara: { giro: 50, alzado: 10 },
      escena: [...caja(ancla, [6, 3, 6]), sombra(30, 0, 100)],
      aparatos: (e) => {
        const mano = e.brazos[0].fin;
        const hacia = unitario(resta(ancla, mano));
        return [
          cilindro(ancla, combina(mano, [hacia, -6]), 1.8, 'acero'),
          placa(combina(mano, [hacia, 16]), hacia),
          placa(combina(mano, [hacia, 22]), hacia, 13, 4),
        ];
      },
    },
  };
}

/* ─── Flexiones pica y en pino ────────────────────────────────────────── */

export function flexionPica(): Demostracion {
  const base = {
    pies: par([-84, 16, 10]),
    puntas: par([-76, 1.5, 10]),
    manos: par([8, 3, 22]),
    codos: par([-1, 0.3, 0.6]),
    rodillas: par([1, -0.3, 0]),
  };
  return {
    titulo: 'flexiones pica',
    pista:
      'Con la cadera alta, en forma de V invertida, baja la cabeza hacia el suelo entre las manos doblando los codos y vuelve a subir.',
    movimiento: {
      // Por detrás y bajo: con los brazos por encima de la cabeza, la parte de
      // delante del hombro mira hacia los pies.
      camara: { giro: -35, alzado: 6 },
      pasos: [
        { pose: { ...base, pelvis: [-40, 84, 0], tronco: 128 }, espera: 250, ida: 1100 },
        { pose: { ...base, pelvis: [-36, 74, 0], tronco: 142 }, espera: 150, ida: 1000 },
      ],
      escena: [sombra(-30, 0, 80)],
    },
  };
}

export function flexionEnPino(): Demostracion {
  const base = {
    tronco: 180,
    manos: par([-2, 3, 22]),
    codos: par([-0.8, 0.2, 0.8]),
  };
  return {
    titulo: 'flexiones en pino contra la pared',
    pista:
      'Boca abajo con los talones apoyados en la pared, baja la cabeza hacia el suelo doblando los codos y vuelve a estirarlos.',
    movimiento: {
      pasos: [
        { pose: { ...base, pelvis: [0, 112, 0], pies: par([6, 194, 9]) }, espera: 250, ida: 1300 },
        { pose: { ...base, pelvis: [0, 82, 0], pies: par([6, 164, 9]) }, espera: 150, ida: 1100 },
      ],
      // Desde el otro lado: la pared queda detrás de la figura y no la tapa.
      camara: { giro: -30, alzado: 8 },
      escena: [...caja([19, 100, 0], [3, 100, 36]), sombra(0, 0, 60)],
    },
  };
}

/* ─── Fondos ──────────────────────────────────────────────────────────── */

export function fondosEnParalelas(): Demostracion {
  const escena: Pieza[] = [];
  for (const z of [-26, 26]) {
    escena.push(cilindro([-38, 105, z], [38, 105, z], 2.6, 'acero'));
    for (const x of [-32, 32]) escena.push(trazo([x, 0, z], [x, 103, z], 5, 'pata'));
  }
  const base = {
    manos: par([0, 105, 26]),
    codos: par([-1, 0.2, 0.25]),
    rodillas: par([1, 0, 0.1]),
  };
  return {
    titulo: 'fondos en paralelas',
    pista:
      'Sujeto en las paralelas con los brazos estirados, baja doblando los codos hasta que los brazos queden paralelos al suelo y vuelve a subir.',
    movimiento: {
      pasos: [
        {
          pose: { ...base, pelvis: [-9, 115.5, 0], tronco: 8, pies: par([-34, 58, 6]) },
          espera: 250,
          ida: 1200,
        },
        {
          pose: { ...base, pelvis: [-26.3, 78.3, 0], tronco: 24, pies: par([-52, 22, 6]) },
          espera: 150,
          ida: 1000,
        },
      ],
      escena: [...escena, sombra(0, 0, 70)],
    },
  };
}

export function fondosEnBanco(): Demostracion {
  const base = {
    tronco: -6,
    manos: par([-20, 50, 18]),
    pies: par([60, 7, 11]),
    puntas: par([68, 20, 11]),
    codos: par([-1, 0.15, 0.2]),
  };
  return {
    titulo: 'fondos en banco',
    pista:
      'Con las manos en el borde del banco detrás de ti y las piernas estiradas, baja la cadera doblando los codos y sube estirándolos.',
    movimiento: {
      pasos: [
        { pose: { ...base, pelvis: [-2, 60, 0] }, espera: 250, ida: 1100 },
        { pose: { ...base, pelvis: [-2, 26, 0] }, espera: 150, ida: 1000 },
      ],
      escena: [...bancoPlano(-78, -16, { alto: 47 }), sombra(10, 0, 80)],
    },
  };
}
