import {
  combina,
  escala,
  esferica,
  largo,
  mezcla,
  mezclaNumero,
  punto,
  resta,
  rotaX,
  rotaY,
  rotaZ,
  suma,
  unitario,
  type V3,
} from './vector';

/**
 * El esqueleto de las demostraciones: una pose se describe por dónde está la
 * pelvis, cómo va el tronco y adónde tienen que llegar manos y tobillos. Codos
 * y rodillas los resuelve la cinemática inversa de dos segmentos, así que una
 * barra que sube en línea recta sube en línea recta y un pie apoyado no patina.
 */

/** Proporciones de una persona de unos 172 de alto, en las unidades del mundo. */
export const MEDIDAS = {
  caderaMedia: 9,
  /** De la pelvis a la base del cuello. */
  tronco: 54,
  hombroMedio: 17,
  /** Los hombros quedan un poco por debajo de la base del cuello. */
  hombroBajo: 4,
  cuello: 7,
  cabeza: 10,
  brazo: 31,
  /** Del codo al centro del puño. */
  antebrazo: 32,
  muslo: 42,
  pierna: 42,
  /** Altura del tobillo con el pie plano en el suelo. */
  tobillo: 7,
  pie: 16,
} as const;

/** Siempre [derecha, izquierda]. */
export type Par<T> = readonly [T, T];

/**
 * Un objetivo relativo al cuerpo: desde la base del cuello o desde la pelvis,
 * en el marco del tronco — [hacia delante, hacia arriba, hacia la derecha].
 */
export interface Relativo {
  readonly desde: 'cuello' | 'pelvis';
  readonly v: V3;
}

export type Objetivo = V3 | Relativo;

export interface Pose {
  readonly pelvis: V3;
  /** Grados que el tronco se inclina hacia delante desde la vertical. */
  readonly tronco: number;
  /** Grados que el tronco se ladea hacia su derecha. */
  readonly lateral?: number;
  /** Grados que gira todo el cuerpo hacia su derecha. */
  readonly giro?: number;
  /** Grados que la cabeza se inclina hacia delante sobre el tronco. */
  readonly cabeza?: number;
  /** Cuánto suben los hombros (encogimientos). */
  readonly hombros?: number;
  /** Cuánto se van los hombros hacia atrás (retracción escapular). */
  readonly hombrosAtras?: number;
  readonly manos: Par<Objetivo>;
  readonly pies: Par<V3>;
  /** Hacia dónde apunta cada codo, en el mundo. Si falta: atrás y un poco afuera. */
  readonly codos?: Par<V3>;
  /** Hacia dónde apunta cada rodilla, en el mundo. Si falta: delante y un poco afuera. */
  readonly rodillas?: Par<V3>;
  /** Punta del pie fija (de puntillas, en una plataforma…). Si falta, se deduce. */
  readonly puntas?: Par<V3 | null>;
  /** Un valor libre que el material lee para moverse con la pose (el giro de la muñeca). */
  readonly fase?: number;
}

export interface Marco {
  readonly delante: V3;
  readonly arriba: V3;
  readonly derecha: V3;
}

export interface Cadena {
  readonly raiz: V3;
  readonly medio: V3;
  readonly fin: V3;
  /** Adónde se le pidió llegar: si `fin` no coincide, el objetivo no se alcanza. */
  readonly objetivo: V3;
}

export interface Esqueleto {
  readonly marco: Marco;
  readonly pelvis: V3;
  readonly cuello: V3;
  readonly cabeza: V3;
  readonly caderas: Par<V3>;
  readonly hombros: Par<V3>;
  readonly brazos: Par<Cadena>;
  readonly piernas: Par<Cadena>;
  /** Talón y punta de cada pie. */
  readonly pies: Par<readonly [V3, V3]>;
  readonly fase: number;
}

export function marcoDe(pose: Pick<Pose, 'tronco' | 'lateral' | 'giro'>): Marco {
  const rota = (v: V3): V3 =>
    rotaY(rotaZ(rotaX(v, pose.lateral ?? 0), -pose.tronco), -(pose.giro ?? 0));
  return { delante: rota([1, 0, 0]), arriba: rota([0, 1, 0]), derecha: rota([0, 0, 1]) };
}

function perpendicular(v: V3): V3 {
  const base: V3 = Math.abs(v[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
  return unitario(resta(base, escala(v, punto(base, v))));
}

/**
 * Cinemática inversa de dos segmentos: el punto medio queda en el plano que
 * forman la raíz, el objetivo y el polo, del lado del polo.
 */
export function cadena(raiz: V3, objetivo: V3, a: number, b: number, polo: V3): Cadena {
  const hacia = resta(objetivo, raiz);
  const direccion = unitario(hacia, [0, -1, 0]);
  const d = Math.min(a + b - 1e-6, Math.max(Math.abs(a - b) + 1e-6, largo(hacia)));
  const coseno = (a * a + d * d - b * b) / (2 * a * d);
  const seno = Math.sqrt(Math.max(0, 1 - coseno * coseno));
  const lateral = resta(polo, escala(direccion, punto(polo, direccion)));
  const q = largo(lateral) < 1e-6 ? perpendicular(direccion) : unitario(lateral);
  return {
    raiz,
    medio: combina(raiz, [direccion, a * coseno], [q, a * seno]),
    fin: combina(raiz, [direccion, d]),
    objetivo,
  };
}

function enMarco(m: Marco, v: V3): V3 {
  return combina([0, 0, 0], [m.delante, v[0]], [m.arriba, v[1]], [m.derecha, v[2]]);
}

function resuelveObjetivo(o: Objetivo, m: Marco, pelvis: V3, cuello: V3): V3 {
  if (!('desde' in o)) return o;
  return suma(o.desde === 'cuello' ? cuello : pelvis, enMarco(m, o.v));
}

const RAD = Math.PI / 180;

export function resuelve(pose: Pose): Esqueleto {
  const m = marcoDe(pose);
  const M = MEDIDAS;
  const { pelvis } = pose;
  const cuello = combina(pelvis, [m.arriba, M.tronco]);
  const inclinacion = (pose.cabeza ?? 0) * RAD;
  const haciaLaCabeza = unitario(
    combina([0, 0, 0], [m.arriba, Math.cos(inclinacion)], [m.delante, Math.sin(inclinacion)]),
  );
  const cabeza = combina(cuello, [haciaLaCabeza, M.cuello + M.cabeza]);
  const lados = [1, -1] as const;
  const hombros = lados.map((lado) =>
    combina(
      cuello,
      [m.derecha, lado * M.hombroMedio],
      [m.arriba, (pose.hombros ?? 0) - M.hombroBajo],
      [m.delante, -(pose.hombrosAtras ?? 0)],
    ),
  ) as unknown as Par<V3>;
  const caderas = lados.map((lado) =>
    combina(pelvis, [m.derecha, lado * M.caderaMedia]),
  ) as unknown as Par<V3>;

  const polosDeCodo = polos(pose, 'codos');
  const brazos = lados.map((_, i) => {
    const objetivo = resuelveObjetivo(pose.manos[i] as Objetivo, m, pelvis, cuello);
    return cadena(hombros[i] as V3, objetivo, M.brazo, M.antebrazo, polosDeCodo[i] as V3);
  }) as unknown as Par<Cadena>;

  const polosDeRodilla = polos(pose, 'rodillas');
  const piernas = lados.map((_, i) =>
    cadena(caderas[i] as V3, pose.pies[i] as V3, M.muslo, M.pierna, polosDeRodilla[i] as V3),
  ) as unknown as Par<Cadena>;

  const pies = piernas.map((pierna, i) =>
    pie(pierna, pose.puntas?.[i] ?? null, polosDeRodilla[i] as V3),
  ) as unknown as Par<readonly [V3, V3]>;

  return {
    marco: m,
    pelvis,
    cuello,
    cabeza,
    caderas,
    hombros,
    brazos,
    piernas,
    pies,
    fase: pose.fase ?? 0,
  };
}

const suaviza = (desde: number, hasta: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - desde) / (hasta - desde)));
  return t * t * (3 - 2 * t);
};

/**
 * Hacia dónde apuntan codos y rodillas si la pose no lo dice: codos atrás y un
 * poco afuera; rodillas hacia delante, en horizontal mientras se puede (una
 * bisagra inclina el tronco, pero las rodillas siguen mirando al frente) y
 * hacia donde mira el pecho cuando el cuerpo está tumbado. De una cosa a la
 * otra se pasa poco a poco.
 */
function polos(pose: Pose, cuales: 'codos' | 'rodillas'): Par<V3> {
  const dados = pose[cuales];
  if (dados !== undefined) return dados;
  const m = marcoDe(pose);
  const horizontal: V3 = [m.delante[0], 0, m.delante[2]];
  // Sólo mientras el tronco apunta hacia arriba: boca abajo o cabeza abajo, manda el pecho.
  const peso = m.arriba[1] > 0 ? suaviza(0.1, 0.4, largo(horizontal)) : 0;
  const delanteDeLasRodillas = unitario(
    mezcla(m.delante, unitario(horizontal, m.delante), peso),
    m.delante,
  );
  return ([1, -1] as const).map((lado) =>
    cuales === 'codos'
      ? combina([0, 0, 0], [m.delante, -1], [m.arriba, -0.25], [m.derecha, lado * 0.45])
      : combina([0, 0, 0], [delanteDeLasRodillas, 1], [m.derecha, lado * 0.15]),
  ) as unknown as Par<V3>;
}

/**
 * El pie: la punta, fija si la pose la da; si no, deducida. Con el tobillo a ras
 * de suelo el pie va plano y apunta hacia donde apunta la rodilla (y si la
 * rodilla mira arriba, hacia donde va la pierna); en el aire forma ángulo con la
 * espinilla. Entre una altura y otra se pasa de una forma a otra poco a poco,
 * para que el pie no dé un salto al despegar. El talón sale siempre de la misma
 * cuenta, dada la punta: así una punta fija y una deducida enlazan sin salto.
 */
function pie(pierna: Cadena, punta: V3 | null, poloDeRodilla: V3): readonly [V3, V3] {
  const tobillo = pierna.fin;
  const final = punta ?? puntaPorOmision(pierna, poloDeRodilla);
  const hacia = resta(final, tobillo);
  const plano = Math.hypot(hacia[0], hacia[2]) / Math.max(1e-6, largo(hacia));
  return [combina(tobillo, [hacia, -0.25], [[0, 1, 0], -4.4 * plano]), final];
}

function puntaPorOmision(pierna: Cadena, poloDeRodilla: V3): V3 {
  const tobillo = pierna.fin;
  // Apoyado: hacia donde apunta la rodilla; si la rodilla mira arriba, hacia donde va la pierna.
  const haciaElTobillo = resta(tobillo, pierna.raiz);
  const segunLaPierna = unitario([haciaElTobillo[0], 0, haciaElTobillo[2]], [1, 0, 0]);
  const segunLaRodilla: V3 = [poloDeRodilla[0], 0, poloDeRodilla[2]];
  const h = unitario(
    mezcla(
      segunLaPierna,
      unitario(segunLaRodilla, segunLaPierna),
      suaviza(0.1, 0.35, largo(segunLaRodilla)),
    ),
    [1, 0, 0],
  );
  const apoyada: V3 = [
    tobillo[0] + h[0] * MEDIDAS.pie,
    tobillo[1] - MEDIDAS.tobillo + 3.5,
    tobillo[2] + h[2] * MEDIDAS.pie,
  ];
  // En el aire: el empeine mira hacia donde sale la rodilla al doblarse (o hacia el polo si está recta).
  const espinilla = unitario(resta(pierna.fin, pierna.medio));
  const eje = unitario(haciaElTobillo, espinilla);
  const salida = resta(
    pierna.medio,
    combina(pierna.raiz, [eje, punto(resta(pierna.medio, pierna.raiz), eje)]),
  );
  const segunElPolo = resta(poloDeRodilla, escala(espinilla, punto(poloDeRodilla, espinilla)));
  const hacia = mezcla(unitario(segunElPolo, h), unitario(salida, h), suaviza(1, 4, largo(salida)));
  const delante = unitario(resta(hacia, escala(espinilla, punto(hacia, espinilla))), h);
  const direccion = unitario(
    combina([0, 0, 0], [delante, Math.cos(0.35)], [espinilla, Math.sin(0.35)]),
  );
  const alAire = combina(tobillo, [direccion, MEDIDAS.pie - 2]);
  const t = Math.min(1, Math.max(0, (tobillo[1] - (MEDIDAS.tobillo + 2)) / 9));
  return mezcla(apoyada, alAire, t);
}

/** Cómo va un punto de una pose a la siguiente: recto, pasando por un punto o en arco. */
export type Via = { readonly pasa: V3 } | { readonly centro: V3 };

export interface Vias {
  readonly pelvis?: Via;
  readonly manos?: Par<Via | null>;
  readonly pies?: Par<Via | null>;
}

export function camino(a: V3, b: V3, t: number, via?: Via | null): V3 {
  if (via === undefined || via === null) return mezcla(a, b, t);
  if ('pasa' in via) {
    const control = resta(escala(via.pasa, 2), escala(suma(a, b), 0.5));
    const u = 1 - t;
    return combina([0, 0, 0], [a, u * u], [control, 2 * u * t], [b, t * t]);
  }
  const [da, db] = [resta(a, via.centro), resta(b, via.centro)];
  const direccion = esferica(unitario(da), unitario(db), t);
  return combina(via.centro, [direccion, mezclaNumero(largo(da), largo(db), t)]);
}

function mezclaObjetivo(
  a: Objetivo,
  b: Objetivo,
  t: number,
  via: Via | null | undefined,
  poses: readonly [Pose, Pose],
): Objetivo {
  const relA = 'desde' in a;
  const relB = 'desde' in b;
  if (relA && relB && a.desde === b.desde) return { desde: a.desde, v: mezcla(a.v, b.v, t) };
  const mundo = (o: Objetivo, p: Pose): V3 => {
    if (!('desde' in o)) return o;
    const m = marcoDe(p);
    return resuelveObjetivo(o, m, p.pelvis, combina(p.pelvis, [m.arriba, MEDIDAS.tronco]));
  };
  return camino(mundo(a, poses[0]), mundo(b, poses[1]), t, via);
}

const n = (v: number | undefined) => v ?? 0;

/**
 * La pose a una fracción `t` (0…1) del camino de `a` a `b`. Lo que una pose
 * deja por omisión (un polo, la punta de un pie) se interpola desde lo que esa
 * pose haría sola: nada cambia de golpe a mitad de camino.
 */
export function interpola(a: Pose, b: Pose, t: number, vias?: Vias): Pose {
  const polo = (cuales: 'codos' | 'rodillas'): Par<V3> | undefined => {
    if (a[cuales] === undefined && b[cuales] === undefined) return undefined;
    const [pa, pb] = [polos(a, cuales), polos(b, cuales)];
    return [mezcla(pa[0], pb[0], t), mezcla(pa[1], pb[1], t)];
  };
  const puntas = ((): Par<V3 | null> | undefined => {
    const [pa, pb] = [a.puntas, b.puntas];
    if (pa === undefined && pb === undefined) return undefined;
    let solas: readonly [Esqueleto | null, Esqueleto | null] = [null, null];
    const sola = (cual: 0 | 1): Esqueleto => {
      const hecha = solas[cual] ?? resuelve(cual === 0 ? a : b);
      solas = cual === 0 ? [hecha, solas[1]] : [solas[0], hecha];
      return hecha;
    };
    return [0, 1].map((i) => {
      const j = i as 0 | 1;
      const x = pa?.[j] ?? null;
      const y = pb?.[j] ?? null;
      if (x === null && y === null) return null;
      // Relativas al tobillo: si el pie va en arco, la punta lo sigue.
      const desde = resta(x ?? sola(0).pies[j][1], a.pies[j]);
      const hasta = resta(y ?? sola(1).pies[j][1], b.pies[j]);
      return suma(camino(a.pies[j], b.pies[j], t, vias?.pies?.[j]), mezcla(desde, hasta, t));
    }) as unknown as Par<V3 | null>;
  })();
  const codos = polo('codos');
  const rodillas = polo('rodillas');
  return {
    pelvis: camino(a.pelvis, b.pelvis, t, vias?.pelvis),
    tronco: mezclaNumero(a.tronco, b.tronco, t),
    lateral: mezclaNumero(n(a.lateral), n(b.lateral), t),
    giro: mezclaNumero(n(a.giro), n(b.giro), t),
    cabeza: mezclaNumero(n(a.cabeza), n(b.cabeza), t),
    hombros: mezclaNumero(n(a.hombros), n(b.hombros), t),
    hombrosAtras: mezclaNumero(n(a.hombrosAtras), n(b.hombrosAtras), t),
    fase: mezclaNumero(n(a.fase), n(b.fase), t),
    manos: [0, 1].map((i) =>
      mezclaObjetivo(a.manos[i] as Objetivo, b.manos[i] as Objetivo, t, vias?.manos?.[i], [a, b]),
    ) as unknown as Par<Objetivo>,
    pies: [0, 1].map((i) =>
      camino(a.pies[i] as V3, b.pies[i] as V3, t, vias?.pies?.[i]),
    ) as unknown as Par<V3>,
    ...(codos === undefined ? {} : { codos }),
    ...(rodillas === undefined ? {} : { rodillas }),
    ...(puntas === undefined ? {} : { puntas }),
  };
}

/** Un tramo del bucle: la pose, cuánto se queda quieta y cómo va a la siguiente. */
export interface Paso {
  readonly pose: Pose;
  /** Milisegundos quieta en esta pose. */
  readonly espera?: number;
  /** Milisegundos de esta pose a la siguiente. */
  readonly ida?: number;
  readonly via?: Vias;
}

const ESPERA = 250;
const IDA = 1100;

export function duracionDelBucle(pasos: readonly Paso[]): number {
  return pasos.reduce((total, p) => total + (p.espera ?? ESPERA) + (p.ida ?? IDA), 0);
}

/** Aceleración y frenado suaves, como un movimiento controlado. */
export const suave = (t: number): number => (1 - Math.cos(Math.PI * t)) / 2;

/**
 * La pose en el instante `ms` del bucle. Con dos pasos, la vuelta reutiliza el
 * camino de la ida: un arco que sube por un lado baja por el mismo.
 */
export function poseEn(pasos: readonly Paso[], ms: number): Pose {
  const primero = pasos[0];
  if (primero === undefined) throw new Error('un movimiento sin pasos');
  const total = duracionDelBucle(pasos);
  let resto = ((ms % total) + total) % total;
  for (const [i, paso] of pasos.entries()) {
    const espera = paso.espera ?? ESPERA;
    if (resto < espera) return paso.pose;
    resto -= espera;
    const ida = paso.ida ?? IDA;
    if (resto < ida) {
      const siguiente = pasos[(i + 1) % pasos.length] ?? primero;
      const via = paso.via ?? (pasos.length === 2 ? pasos[(i + 1) % 2]?.via : undefined);
      return interpola(paso.pose, siguiente.pose, suave(resto / ida), via);
    }
    resto -= ida;
  }
  return primero.pose;
}
