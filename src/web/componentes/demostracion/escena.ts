import type { Esqueleto, Paso } from './esqueleto';
import { combina, punto, rotaZ, suma, unitario, type V3 } from './vector';

/**
 * Lo que se dibuja: piezas en tres dimensiones (trazos, discos, caras,
 * siluetas, masas redondeadas y cilindros) que una cámara ortográfica proyecta
 * al plano del SVG y ordena de lejos a cerca.
 */

/** Los materiales que se dibujan como cilindros: la tapa y el costado van en dos tonos. */
export type Material = 'disco' | 'acero' | 'agarre' | 'almohadilla';

export type Clase =
  | 'cuerpo'
  | 'lejos'
  | 'principal'
  | 'principal-lejos'
  | 'ayuda'
  | 'ayuda-lejos'
  | 'parche-principal'
  | 'parche-ayuda'
  | Material
  | `${Material}-lado`
  | 'anilla'
  | 'cable'
  | 'banda'
  | 'mueble'
  | 'mueble-arriba'
  | 'pata'
  | 'sombra'
  | 'sombra-cuerpo';

interface Comun {
  readonly clase: Clase;
  /** Se pinta antes lo de capa menor, sea cual sea su profundidad. */
  readonly capa?: number;
}

/** El volumen de una caja, para comprobar que nada la atraviesa. */
export interface Solido {
  readonly centro: V3;
  /** Medias medidas como vectores: el centro más o menos cada uno da una cara. */
  readonly ejes: readonly [V3, V3, V3];
}

export type Pieza =
  | (Comun & { readonly tipo: 'trazo'; readonly a: V3; readonly b: V3; readonly grosor: number })
  | (Comun & { readonly tipo: 'disco'; readonly c: V3; readonly normal: V3; readonly r: number })
  | (Comun & {
      readonly tipo: 'cara';
      readonly puntos: readonly V3[];
      readonly normal: V3 | null;
      readonly solido?: Solido;
    })
  /** La envolvente de unos puntos: el tronco y sus regiones. */
  | (Comun & { readonly tipo: 'silueta'; readonly puntos: readonly V3[] })
  /** La envolvente de unas esferas: un miembro que se estrecha, la cabeza, el pie. */
  | (Comun & { readonly tipo: 'masa'; readonly esferas: readonly (readonly [V3, number])[] })
  | {
      readonly tipo: 'cilindro';
      readonly c: V3;
      readonly eje: V3;
      readonly largo: number;
      readonly r: number;
      readonly clase: Material;
      readonly capa?: number;
    }
  /**
   * Piezas que se pintan juntas y en orden, con la profundidad de la primera o,
   * si se da, la de `profundidad`.
   */
  | (Comun & {
      readonly tipo: 'grupo';
      readonly piezas: readonly Pieza[];
      readonly profundidad?: V3;
    });

export interface Camara {
  /** Grados que la cámara rodea a la figura desde su costado derecho hacia su frente. */
  readonly giro: number;
  /** Grados que la cámara mira desde arriba. */
  readonly alzado: number;
}

export interface Movimiento {
  readonly pasos: readonly Paso[];
  readonly camara?: Camara;
  /** Lo que no se mueve: bancos, poleas, barras fijas. */
  readonly escena?: readonly Pieza[];
  /** Lo que acompaña al cuerpo: la barra en las manos, el cable hasta el agarre. */
  readonly aparatos?: (e: Esqueleto) => readonly Pieza[];
  /** El paso que se enseña como «final» cuando no hay animación. */
  readonly clave?: number;
  /** Se aguanta la postura: no hay recorrido que enseñar. */
  readonly sostenido?: boolean;
}

export const CAMARA_POR_OMISION: Camara = { giro: 28, alzado: 10 };

export interface Proyector {
  readonly mira: V3;
  plano(p: V3): readonly [number, number];
  hondo(p: V3): number;
}

export function proyector(c: Camara): Proyector {
  const g = (c.giro * Math.PI) / 180;
  const e = (c.alzado * Math.PI) / 180;
  const mira: V3 = [Math.sin(g) * Math.cos(e), Math.sin(e), Math.cos(g) * Math.cos(e)];
  const derecha: V3 = [Math.cos(g), 0, -Math.sin(g)];
  const arriba: V3 = [-Math.sin(g) * Math.sin(e), Math.cos(e), -Math.cos(g) * Math.sin(e)];
  return {
    mira,
    plano: (p) => [punto(p, derecha), -punto(p, arriba)],
    hondo: (p) => punto(p, mira),
  };
}

type Punto2 = readonly [number, number];

export type Dibujo = { readonly clase: Clase; readonly hondo: number; readonly capa: number } & (
  | {
      readonly tipo: 'linea';
      readonly x1: number;
      readonly y1: number;
      readonly x2: number;
      readonly y2: number;
      readonly grosor: number;
    }
  | {
      readonly tipo: 'elipse';
      /** matrix(a b c d e f) que lleva el círculo unidad al disco proyectado. */
      readonly matriz: readonly [number, number, number, number, number, number];
    }
  | { readonly tipo: 'poligono'; readonly puntos: readonly Punto2[] }
  | { readonly tipo: 'grupo'; readonly hijos: readonly Dibujo[] }
);

/** Envolvente convexa (cadena monótona). */
export function envolvente(puntos: readonly Punto2[]): Punto2[] {
  const p = [...puntos].sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  if (p.length < 3) return p;
  const giro = (o: Punto2, a: Punto2, b: Punto2) =>
    (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const media = (orden: readonly Punto2[]): Punto2[] => {
    const cadena: Punto2[] = [];
    for (const q of orden) {
      while (
        cadena.length >= 2 &&
        giro(cadena[cadena.length - 2] as Punto2, cadena[cadena.length - 1] as Punto2, q) <= 0
      )
        cadena.pop();
      cadena.push(q);
    }
    return cadena.slice(0, -1);
  };
  return media(p).concat(media([...p].reverse()));
}

export function perpendiculares(n: V3): readonly [V3, V3] {
  const u = unitario(Math.abs(n[1]) < 0.9 ? [n[2], 0, -n[0]] : [0, -n[2], n[1]]);
  const v = unitario([
    n[1] * u[2] - n[2] * u[1],
    n[2] * u[0] - n[0] * u[2],
    n[0] * u[1] - n[1] * u[0],
  ]);
  return [u, v];
}

const circulo = (pasos: number) =>
  Array.from({ length: pasos }, (_, k) => {
    const a = (2 * Math.PI * k) / pasos;
    return [Math.cos(a), Math.sin(a)] as const;
  });
const CIRCULO = circulo(16);
/** Los discos grandes necesitan más lados para no verse poligonales. */
const CIRCULO_FINO = circulo(40);

/** Proyecta y ordena: primero la capa, dentro de la capa de lejos a cerca. */
export function proyecta(piezas: readonly Pieza[], cam: Proyector): Dibujo[] {
  return proyectaSinOrden(piezas, cam).sort((a, b) => a.capa - b.capa || a.hondo - b.hondo);
}

function elipse(
  c: V3,
  u: V3,
  v: V3,
  cam: Proyector,
): readonly [number, number, number, number, number, number] {
  const [o, pu, pv] = [cam.plano(c), cam.plano(suma(c, u)), cam.plano(suma(c, v))];
  return [pu[0] - o[0], pu[1] - o[1], pv[0] - o[0], pv[1] - o[1], o[0], o[1]];
}

function proyectaSinOrden(piezas: readonly Pieza[], cam: Proyector): Dibujo[] {
  const salida: Dibujo[] = [];
  const media = (puntos: readonly V3[]) =>
    puntos.reduce((s, q) => s + cam.hondo(q), 0) / Math.max(1, puntos.length);
  for (const p of piezas) {
    const capa = p.capa ?? 0;
    switch (p.tipo) {
      case 'trazo': {
        const [a, b] = [cam.plano(p.a), cam.plano(p.b)];
        salida.push({
          tipo: 'linea',
          x1: a[0],
          y1: a[1],
          x2: b[0],
          y2: b[1],
          grosor: p.grosor,
          clase: p.clase,
          capa,
          hondo: media([p.a, p.b]),
        });
        break;
      }
      case 'disco': {
        const [u, v] = perpendiculares(unitario(p.normal));
        salida.push({
          tipo: 'elipse',
          matriz: elipse(p.c, combina([0, 0, 0], [u, p.r]), combina([0, 0, 0], [v, p.r]), cam),
          clase: p.clase,
          capa,
          hondo: cam.hondo(p.c),
        });
        break;
      }
      case 'cara': {
        if (p.normal !== null && punto(p.normal, cam.mira) <= 0.02) break;
        salida.push({
          tipo: 'poligono',
          puntos: p.puntos.map((q) => cam.plano(q)),
          clase: p.clase,
          capa,
          hondo: media(p.puntos),
        });
        break;
      }
      case 'silueta':
        salida.push({
          tipo: 'poligono',
          puntos: envolvente(p.puntos.map((q) => cam.plano(q))),
          clase: p.clase,
          capa,
          hondo: media(p.puntos),
        });
        break;
      case 'masa': {
        const puntos: Punto2[] = [];
        for (const [c, r] of p.esferas) {
          const [x, y] = cam.plano(c);
          for (const [co, se] of CIRCULO) puntos.push([x + r * co, y + r * se]);
        }
        salida.push({
          tipo: 'poligono',
          puntos: envolvente(puntos),
          clase: p.clase,
          capa,
          hondo: media(p.esferas.map(([c]) => c)),
        });
        break;
      }
      case 'cilindro': {
        const e = unitario(p.eje);
        const [u, v] = perpendiculares(e);
        const extremos = [combina(p.c, [e, -p.largo / 2]), combina(p.c, [e, p.largo / 2])] as const;
        const puntos: Punto2[] = [];
        for (const base of extremos) {
          for (const [co, se] of p.r > 6 ? CIRCULO_FINO : CIRCULO)
            puntos.push(cam.plano(combina(base, [u, p.r * co], [v, p.r * se])));
        }
        const hijos: Dibujo[] = [
          {
            tipo: 'poligono',
            puntos: envolvente(puntos),
            clase: `${p.clase}-lado`,
            capa,
            hondo: cam.hondo(p.c),
          },
        ];
        // La tapa que mira a la cámara, si no se ve de canto.
        const cara = punto(e, cam.mira);
        if (Math.abs(cara) > 0.06) {
          const tapa = extremos[cara > 0 ? 1 : 0];
          hijos.push({
            tipo: 'elipse',
            matriz: elipse(tapa, combina([0, 0, 0], [u, p.r]), combina([0, 0, 0], [v, p.r]), cam),
            clase: p.clase,
            capa,
            hondo: cam.hondo(tapa),
          });
        }
        salida.push({ tipo: 'grupo', hijos, clase: p.clase, capa, hondo: cam.hondo(p.c) });
        break;
      }
      case 'grupo': {
        const hijos = proyectaSinOrden(p.piezas, cam);
        salida.push({
          tipo: 'grupo',
          hijos,
          clase: p.clase,
          capa,
          hondo: p.profundidad === undefined ? (hijos[0]?.hondo ?? 0) : cam.hondo(p.profundidad),
        });
        break;
      }
    }
  }
  return salida;
}

export interface Caja {
  readonly minX: number;
  readonly minY: number;
  readonly maxX: number;
  readonly maxY: number;
}

export function limites(dibujos: readonly Dibujo[], caja?: Caja): Caja {
  let { minX, minY, maxX, maxY } = caja ?? {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  };
  const incluye = (x: number, y: number, margen: number) => {
    minX = Math.min(minX, x - margen);
    maxX = Math.max(maxX, x + margen);
    minY = Math.min(minY, y - margen);
    maxY = Math.max(maxY, y + margen);
  };
  for (const d of dibujos) {
    if (d.clase === 'sombra' || d.clase === 'sombra-cuerpo') continue;
    switch (d.tipo) {
      case 'grupo':
        ({ minX, minY, maxX, maxY } = limites(d.hijos, { minX, minY, maxX, maxY }));
        break;
      case 'linea':
        incluye(d.x1, d.y1, d.grosor / 2);
        incluye(d.x2, d.y2, d.grosor / 2);
        break;
      case 'elipse': {
        const [a, b, c, e, x, y] = d.matriz;
        incluye(x, y, Math.max(Math.hypot(a, c), Math.hypot(b, e)));
        break;
      }
      case 'poligono':
        for (const [x, y] of d.puntos) incluye(x, y, 1.5);
        break;
    }
  }
  return { minX, minY, maxX, maxY };
}

/* ─── Constructores de piezas ─────────────────────────────────────────── */

/**
 * Un prisma con centro, medias medidas y un giro sobre el eje lateral (para
 * respaldos inclinados). La cara de arriba va más clara.
 */
export function caja(
  centro: V3,
  mitades: V3,
  opciones: { readonly giro?: number; readonly clase?: Clase; readonly capa?: number } = {},
): Pieza[] {
  const g = opciones.giro ?? 0;
  const u = rotaZ([mitades[0], 0, 0], g);
  const v = rotaZ([0, mitades[1], 0], g);
  const w: V3 = [0, 0, mitades[2]];
  const ejes = [u, v, w] as const;
  const solido: Solido = { centro, ejes };
  const caras: Pieza[] = [];
  for (let k = 0; k < 3; k += 1) {
    const e = ejes[k] as V3;
    const [i, j] = [ejes[(k + 1) % 3] as V3, ejes[(k + 2) % 3] as V3];
    for (const signo of [1, -1]) {
      const c = combina(centro, [e, signo]);
      const normal = unitario(combina([0, 0, 0], [e, signo]));
      caras.push({
        tipo: 'cara',
        puntos: [
          combina(c, [i, 1], [j, 1]),
          combina(c, [i, 1], [j, -1]),
          combina(c, [i, -1], [j, -1]),
          combina(c, [i, -1], [j, 1]),
        ],
        normal,
        solido,
        clase: opciones.clase ?? (normal[1] > 0.5 ? 'mueble-arriba' : 'mueble'),
        ...(opciones.capa === undefined ? {} : { capa: opciones.capa }),
      });
    }
  }
  return caras;
}

export const trazo = (a: V3, b: V3, grosor: number, clase: Clase, capa?: number): Pieza => ({
  tipo: 'trazo',
  a,
  b,
  grosor,
  clase,
  ...(capa === undefined ? {} : { capa }),
});

/** Un cilindro de un material, de `a` a `b`. */
export function cilindro(a: V3, b: V3, r: number, clase: Material, capa?: number): Pieza {
  const eje: V3 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  return {
    tipo: 'cilindro',
    c: combina(a, [eje, 0.5]),
    eje,
    largo: Math.hypot(eje[0], eje[1], eje[2]),
    r,
    clase,
    ...(capa === undefined ? {} : { capa }),
  };
}

/** La mancha del suelo bajo la escena: siempre lo primero que se pinta. */
export const sombra = (x: number, z = 0, r = 72): Pieza => ({
  tipo: 'disco',
  c: [x, 0, z],
  normal: [0, 1, 0],
  r,
  clase: 'sombra',
  capa: -10,
});
