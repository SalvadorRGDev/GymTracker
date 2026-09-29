import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * El lenguaje visual con reglas MEDIBLES (ADR-016, ADR-017, ADR-018), leídas
 * de la hoja de estilos real. Un color de fondo que se toque obliga a rehacer
 * el contraste: aquí se rehace solo.
 */

const CSS = readFileSync(join(import.meta.dirname, '..', 'web', 'estilos.css'), 'utf8').replace(
  /\/\*[\s\S]*?\*\//g,
  '',
);

interface Regla {
  readonly contexto: readonly string[];
  readonly selector: string;
  readonly cuerpo: string;
  readonly posicion: number;
}

/** Recorre llaves y devuelve cada bloque de declaraciones con sus @-reglas de alrededor. */
function reglas(texto: string): Regla[] {
  const salida: Regla[] = [];
  const pila: string[] = [];
  let inicio = 0;
  for (let i = 0; i < texto.length; i += 1) {
    const c = texto[i];
    if (c === '{') {
      const cabecera = texto.slice(inicio, i).trim();
      const cierre = buscaCierre(texto, i);
      const interior = texto.slice(i + 1, cierre);
      if (cabecera.startsWith('@') && interior.includes('{')) {
        pila.push(cabecera);
        salida.push(
          ...reglas(interior).map((r) => ({
            ...r,
            contexto: [...pila, ...r.contexto],
            posicion: r.posicion + i,
          })),
        );
        pila.pop();
      } else {
        salida.push({ contexto: [...pila], selector: cabecera, cuerpo: interior, posicion: i });
      }
      i = cierre;
      inicio = cierre + 1;
    } else if (c === ';' && pila.length === 0 && texto.slice(inicio, i).trim().startsWith('@')) {
      inicio = i + 1;
    }
  }
  return salida;
}

function buscaCierre(texto: string, abre: number): number {
  let nivel = 0;
  for (let i = abre; i < texto.length; i += 1) {
    if (texto[i] === '{') nivel += 1;
    else if (texto[i] === '}') {
      nivel -= 1;
      if (nivel === 0) return i;
    }
  }
  throw new Error('llave sin cerrar');
}

function tokens(cuerpo: string): Map<string, string> {
  return new Map(
    [...cuerpo.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)].map((m) => [
      m[1] ?? '',
      (m[2] ?? '').trim(),
    ]),
  );
}

const REGLAS = reglas(CSS);
const CLARO = tokens(
  REGLAS.find((r) => r.contexto.length === 0 && r.selector === ':root')?.cuerpo ?? '',
);

type Rgba = [number, number, number, number];

function color(valor: string, t: ReadonlyMap<string, string>): Rgba {
  const v = valor.trim();
  const referencia = /^var\((--[\w-]+)\)$/.exec(v);
  if (referencia !== null) return color(t.get(referencia[1] ?? '') ?? '', t);
  const hex = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(v);
  if (hex !== null) {
    const h =
      (hex[1] ?? '').length === 3 ? [...(hex[1] ?? '')].map((c) => c + c).join('') : (hex[1] ?? '');
    return [
      Number.parseInt(h.slice(0, 2), 16),
      Number.parseInt(h.slice(2, 4), 16),
      Number.parseInt(h.slice(4, 6), 16),
      1,
    ];
  }
  const rgb = /^rgb\(\s*(\d+)\s+(\d+)\s+(\d+)\s*(?:\/\s*([\d.]+)%)?\s*\)$/.exec(v);
  if (rgb !== null) {
    return [
      Number(rgb[1]),
      Number(rgb[2]),
      Number(rgb[3]),
      rgb[4] === undefined ? 1 : Number(rgb[4]) / 100,
    ];
  }
  throw new Error(`color que la prueba no sabe leer: «${v}»`);
}

/** El color que se VE: el translúcido compuesto sobre su fondo. */
function compuesto(arriba: Rgba, abajo: Rgba): Rgba {
  const a = arriba[3];
  return [0, 1, 2].map((i) => (arriba[i] ?? 0) * a + (abajo[i] ?? 0) * (1 - a)).concat(1) as Rgba;
}

function luminancia([r, g, b]: Rgba): number {
  const lineal = (c: number) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lineal(r) + 0.7152 * lineal(g) + 0.0722 * lineal(b);
}

function contraste(a: Rgba, b: Rgba): number {
  const [x, y] = [luminancia(a), luminancia(b)].sort((p, q) => q - p) as [number, number];
  return (x + 0.05) / (y + 0.05);
}

const PARES: readonly [string, string][] = [
  ['--texto', '--fondo'],
  ['--texto', '--fondo-sutil'],
  ['--texto', '--fondo-apagado'],
  ['--texto-2', '--fondo'],
  ['--texto-2', '--fondo-sutil'],
  ['--texto-2', '--fondo-apagado'],
  ['--texto-3', '--fondo'],
  ['--texto-3', '--fondo-sutil'],
  ['--texto-3', '--fondo-apagado'],
  ['--acento-texto', '--fondo'],
  ['--acento-texto', '--acento-suave'],
  ['--sobre-acento', '--acento'],
  ['--peligro-texto', '--fondo'],
  ['--peligro-texto', '--peligro-suave'],
  ['--aviso-texto', '--aviso-fondo'],
  ['--info-texto', '--info-fondo'],
  ['--texto', '--lienzo'],
  ['--texto-2', '--lienzo'],
  ['--texto-3', '--lienzo'],
  ['--acento-texto', '--lienzo'],
  ['--texto', '--azul-cielo'],
  ['--texto-2', '--azul-cielo'],
  ['--texto-3', '--azul-cielo'],
  ['--texto-3', '--azul-pervinca'],
  ['--texto-3', '--azul-hielo'],
  ['--texto', '--veladura-lavanda'],
  ['--texto-2', '--veladura-lavanda'],
  ['--texto-2', '--veladura-rosa'],
  ['--texto-2', '--veladura-menta'],
  ['--texto-3', '--veladura-lavanda'],
  ['--texto-3', '--veladura-rosa'],
  ['--texto-3', '--veladura-menta'],
  ['--deficit-texto', '--fondo'],
  ['--deficit-texto', '--deficit-fondo'],
  ['--superavit-texto', '--fondo'],
  ['--superavit-texto', '--superavit-fondo'],
];

/**
 * Deuteranopía simulada (Machado, Oliveira y Fernandes, 2009, severidad 1) en
 * RGB lineal, y CIELAB para medir la distancia que queda. Sustituye a mirar la
 * escala con un simulador a mano.
 */
const MACHADO_DEUTERANOPIA = [
  [0.367322, 0.860646, -0.227968],
  [0.280085, 0.672501, 0.047413],
  [-0.01182, 0.04294, 0.968881],
] as const;

function lineal(c: number): number {
  const s = c / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

function deuteranopia([r, g, b]: Rgba): Rgba {
  const l = [lineal(r), lineal(g), lineal(b)];
  const gamma = (v: number) => {
    const c = Math.min(1, Math.max(0, v));
    return 255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
  };
  const [f0, f1, f2] = MACHADO_DEUTERANOPIA.map((f) =>
    gamma(f[0] * (l[0] ?? 0) + f[1] * (l[1] ?? 0) + f[2] * (l[2] ?? 0)),
  );
  return [f0 ?? 0, f1 ?? 0, f2 ?? 0, 1];
}

function lab([r, g, b]: Rgba): [number, number, number] {
  const [R, G, B] = [lineal(r), lineal(g), lineal(b)];
  const x = (0.4124 * R + 0.3576 * G + 0.1805 * B) / 0.95047;
  const y = 0.2126 * R + 0.7152 * G + 0.0722 * B;
  const z = (0.0193 * R + 0.1192 * G + 0.9505 * B) / 1.08883;
  const f = (v: number) => (v > 216 / 24389 ? Math.cbrt(v) : ((24389 / 27) * v + 16) / 116);
  return [116 * f(y) - 16, 500 * (f(x) - f(y)), 200 * (f(y) - f(z))];
}

function distancia(a: Rgba, b: Rgba): number {
  const [p, q] = [lab(a), lab(b)];
  return Math.hypot(p[0] - q[0], p[1] - q[1], p[2] - q[2]);
}

describe('lenguaje visual: contraste ≥ 5:1 sobre el color compuesto', () => {
  for (const [nombre, t] of [['claro', CLARO]] as const) {
    it(`modo ${nombre}: todos los pares de texto`, () => {
      const malos = PARES.map(([texto, fondo]) => {
        const f = color(t.get(fondo) ?? '', t);
        const c = compuesto(color(t.get(texto) ?? '', t), f);
        return [`${texto} sobre ${fondo}`, contraste(c, f)] as const;
      }).filter(([, r]) => r < 5);
      expect(malos).toEqual([]);
    });

    it(`modo ${nombre}: el texto sobre el vidrio de la cabecera, compuesto sobre el lienzo`, () => {
      for (const lienzo of ['--fondo', '--fondo-sutil']) {
        const vidrio = compuesto(
          color(t.get('--vidrio-fondo') ?? '', t),
          color(t.get(lienzo) ?? '', t),
        );
        for (const texto of ['--texto', '--texto-2', '--texto-3']) {
          expect(
            contraste(color(t.get(texto) ?? '', t), vidrio),
            `${texto} sobre vidrio/${lienzo}`,
          ).toBeGreaterThanOrEqual(5);
        }
      }
    });

    it(`modo ${nombre}: los rótulos de la leyenda se leen sobre el fondo`, () => {
      expect(
        contraste(color(t.get('--texto-2') ?? '', t), color(t.get('--fondo') ?? '', t)),
      ).toBeGreaterThanOrEqual(5);
    });
  }
});

describe('lenguaje visual: la escala del mapa muscular', () => {
  const niveles = (t: ReadonlyMap<string, string>) =>
    [1, 2, 3, 4, 5, 6].map((n) => luminancia(color(t.get(`--nivel-${n}`) ?? '', t)));

  it('en claro, la luminancia baja siempre de un nivel al siguiente (en gris se lee igual)', () => {
    const l = niveles(CLARO);
    for (let i = 1; i < l.length; i += 1)
      expect(l[i] ?? 0, `nivel ${i + 1}`).toBeLessThan(l[i - 1] ?? 0);
  });

  it('no hay modo oscuro: la página es siempre clara', () => {
    expect(CSS).not.toMatch(/prefers-color-scheme:\s*dark/);
    expect(CLARO.get('color-scheme') ?? CSS.match(/color-scheme:\s*([^;]+);/)?.[1]).toBe('light');
  });

  it('con deuteranopía la claridad sigue siendo monótona y cada nivel se separa del siguiente', () => {
    for (const [nombre, t, sube] of [['claro', CLARO, false]] as const) {
      const simulados = [1, 2, 3, 4, 5, 6].map((n) =>
        deuteranopia(color(t.get(`--nivel-${n}`) ?? '', t)),
      );
      for (let i = 1; i < simulados.length; i += 1) {
        const [antes, ahora] = [simulados[i - 1], simulados[i]] as [Rgba, Rgba];
        const [la, lb] = [lab(antes)[0], lab(ahora)[0]];
        expect(sube ? lb > la : lb < la, `${nombre}: claridad del nivel ${i + 1}`).toBe(true);
        // ΔE 8: bien por encima de la diferencia apenas perceptible (≈ 2.3).
        expect(distancia(antes, ahora), `${nombre}: nivel ${i} → ${i + 1}`).toBeGreaterThanOrEqual(
          8,
        );
      }
    }
  });

  it('la escala no reutiliza el acento de la marca: los datos tienen su propio color', () => {
    for (const t of [CLARO]) {
      const acento = t.get('--acento');
      for (let n = 1; n <= 6; n += 1) expect(t.get(`--nivel-${n}`)).not.toBe(acento);
    }
  });
});

describe('lenguaje visual: la escala divergente de la comparativa (ADR-019)', () => {
  const PROPIOS = [
    '--deficit-texto',
    '--deficit-fondo',
    '--deficit-barra',
    '--superavit-texto',
    '--superavit-fondo',
    '--superavit-barra',
    '--pendiente-relleno',
    '--en-plan-relleno',
  ];

  it('no reutiliza el rojo del mapa ni el de peligro ni el acento: «déficit» no es «mucho»', () => {
    for (const t of [CLARO]) {
      const ajenos = new Set(
        ['--peligro', '--peligro-texto', '--acento', '--acento-vivo']
          .concat([0, 1, 2, 3, 4, 5, 6].map((n) => `--nivel-${n}`))
          .map((k) => t.get(k)),
      );
      for (const k of PROPIOS) {
        expect(t.get(k), k).toBeDefined();
        expect(ajenos.has(t.get(k)), k).toBe(false);
      }
    }
  });

  it('las barras se ven sobre la tarjeta y el lienzo (≥ 3:1, contraste de lo que no es texto)', () => {
    for (const t of [CLARO]) {
      for (const barra of ['--deficit-barra', '--superavit-barra']) {
        for (const fondo of ['--fondo', '--fondo-sutil']) {
          expect(
            contraste(color(t.get(barra) ?? '', t), color(t.get(fondo) ?? '', t)),
            `${barra} sobre ${fondo}`,
          ).toBeGreaterThanOrEqual(3);
        }
      }
    }
  });

  it('en la figura, los cuatro estados y la trama se separan entre sí con deuteranopía', () => {
    for (const [nombre, t] of [['claro', CLARO]] as const) {
      const rellenos = [
        '--deficit-barra',
        '--pendiente-relleno',
        '--en-plan-relleno',
        '--superavit-barra',
        '--trama-fondo',
      ].map((k) => [k, deuteranopia(color(t.get(k) ?? '', t))] as const);
      for (let i = 0; i < rellenos.length; i += 1) {
        for (let j = i + 1; j < rellenos.length; j += 1) {
          const [a, ca] = rellenos[i] as (typeof rellenos)[number];
          const [b, cb] = rellenos[j] as (typeof rellenos)[number];
          expect(distancia(ca, cb), `${nombre}: ${a} ↔ ${b}`).toBeGreaterThanOrEqual(25);
        }
      }
    }
  });

  it('déficit y superávit se distinguen también con deuteranopía', () => {
    for (const [nombre, t] of [['claro', CLARO]] as const) {
      for (const [a, b] of [
        ['--deficit-barra', '--superavit-barra'],
        ['--deficit-texto', '--superavit-texto'],
      ] as const) {
        const d = distancia(
          deuteranopia(color(t.get(a) ?? '', t)),
          deuteranopia(color(t.get(b) ?? '', t)),
        );
        expect(d, `${nombre}: ${a} ↔ ${b}`).toBeGreaterThanOrEqual(40);
      }
    }
  });
});

describe('lenguaje visual: apagados, vidrio y movimiento', () => {
  it('los tres apagados existen, juntos y al principio, y reescriben tokens', () => {
    const apagados = [
      '@media (prefers-reduced-transparency: reduce)',
      '@media (prefers-contrast: more)',
      '@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px)))',
    ];
    const posiciones = apagados.map((a) => CSS.indexOf(a));
    for (const [i, p] of posiciones.entries()) expect(p, apagados[i]).toBeGreaterThan(-1);
    expect(Math.max(...posiciones)).toBeLessThan(CSS.indexOf('body {'));
    for (const a of apagados) {
      const regla = REGLAS.find((r) => r.contexto[0] === a);
      expect(regla?.selector, a).toBe(':root');
      expect(regla?.cuerpo).toMatch(/--vidrio-fondo/);
    }
  });

  it('el vidrio se aplica desde UN selector compartido, sólo en cabecera y detalle, nunca en filas', () => {
    const conVidrio = REGLAS.filter((r) => /(^|[\s;])backdrop-filter\s*:/.test(r.cuerpo));
    expect(conVidrio.map((r) => r.selector)).toEqual(['.marco-cabecera,\n.detalle-flotante']);
    expect(conVidrio[0]?.selector).not.toMatch(/\b(tr|td|th|fila)\b/);
  });

  it('todo el movimiento vive bajo prefers-reduced-motion: no-preference', () => {
    const fuera = REGLAS.filter(
      (r) =>
        /(^|[\s;])(transition|animation)\s*:/.test(r.cuerpo) &&
        !r.contexto.includes('@media (prefers-reduced-motion: no-preference)'),
    ).map((r) => r.selector);
    expect(fuera).toEqual([]);
  });

  it('nada dura más de 260 ms salvo las dos excepciones declaradas del mapa', () => {
    const ms = (v: string) =>
      v.endsWith('ms') ? Number.parseFloat(v) : Number.parseFloat(v) * 1000;
    expect(ms(CLARO.get('--duracion') ?? '')).toBeLessThanOrEqual(260);
    expect(CLARO.get('--duracion-giro')).toBe('480ms');
    expect(CLARO.get('--duracion-relleno')).toBe('320ms');
    for (const r of REGLAS.filter((x) =>
      x.contexto.includes('@media (prefers-reduced-motion: no-preference)'),
    )) {
      for (const d of r.cuerpo.matchAll(/(\d+(?:\.\d+)?m?s)\b/g)) {
        const valor = d[1] ?? '';
        if (
          /^\d+(?:\.\d+)?s$/.test(valor) &&
          Number.parseFloat(valor) >= 1 &&
          r.cuerpo.includes('infinite')
        )
          continue;
        expect(ms(valor), `${r.selector}: ${valor}`).toBeLessThanOrEqual(260);
      }
    }
  });
});
