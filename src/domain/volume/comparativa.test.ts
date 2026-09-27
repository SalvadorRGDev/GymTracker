import { describe, expect, it } from 'vitest';
import { agrega, ErrorDeMotor } from './agrega.js';
import { centesimasDesdeDecimal, decimalDesdeCentesimas, UNA_SERIE } from './centesimas.js';
import {
  DISPARADOR_DE_VIGILANCIA,
  MINIMO_DE_VIGILANCIA,
  resta,
  ventanasDeComparacion,
  vigilaUmbral,
} from './comparativa.js';
import { type FechaLogica, fechaLogica, sumaDias } from './fecha-logica.js';
import { type AsignacionDePlan, expandePlan, type VersionDePlan } from './plan.js';
import type { Contribucion, Serie } from './tipos.js';

const c = centesimasDesdeDecimal;
const f = fechaLogica;
const PARAMS = 'p1';
const UMBRALES = new Map([[PARAMS, 4]]);
const CONTRIBUCIONES = new Map<string, readonly Contribucion[]>([
  [
    'press-banca',
    [
      { grupoId: 'pectoral', coeficiente: c('1.00') },
      { grupoId: 'triceps', coeficiente: c('0.50') },
    ],
  ],
  ['face-pull', [{ grupoId: 'deltoide-posterior', coeficiente: c('0.25') }]],
]);

function asignacion(id: string, desde: string, hasta: string | null = null): AsignacionDePlan {
  return { id, versionPlanId: `v-${id}`, desde: f(desde), hasta: hasta === null ? null : f(hasta) };
}

function ejecutada(fecha: string, ejercicio: string, rir = 2, version = PARAMS): Serie {
  return {
    tipo: 'trabajo',
    rir,
    fechaLogica: f(fecha),
    versionParametrosId: version,
    contribuciones: CONTRIBUCIONES.get(ejercicio) ?? [],
    veces: UNA_SERIE,
  };
}

/** Lo planeado de una ventana, por el camino de verdad: `expandePlan` y después `agrega`. */
function planeado(version: VersionDePlan, ancla: string, desde: FechaLogica, hasta: FechaLogica) {
  const series = expandePlan({
    asignaciones: [{ id: 'a', versionPlanId: version.id, desde: f(ancla), hasta: null }],
    versiones: new Map([[version.id, version]]),
    desde,
    hasta,
    parametros: { versionParametrosId: PARAMS, contribuciones: CONTRIBUCIONES },
  });
  return agrega({ series, umbrales: UMBRALES });
}

function deltas(ejecutadas: Serie[], plan: ReturnType<typeof planeado>, grupos: string[]) {
  return Object.fromEntries(
    resta(agrega({ series: ejecutadas, umbrales: UMBRALES }), plan, grupos).map((d) => [
      d.grupoId,
      decimalDesdeCentesimas(d.delta),
    ]),
  );
}

describe('ventanasDeComparacion', () => {
  it('cuenta semanas desde el ancla, no desde el lunes: un plan del jueves compara de jueves a miércoles', () => {
    // 2026-03-05 es jueves.
    const v = ventanasDeComparacion([asignacion('a', '2026-03-05')], f('2026-03-20'), 10);
    expect(v.map((x) => [x.numero, x.desde, x.hasta])).toEqual([
      [1, '2026-03-05', '2026-03-12'],
      [2, '2026-03-12', '2026-03-19'],
      [3, '2026-03-19', '2026-03-26'],
    ]);
  });

  it('cada asignación cuenta desde su propio ancla; la que se cerró a mitad deja su última semana corta', () => {
    const v = ventanasDeComparacion(
      [asignacion('b', '2026-03-10'), asignacion('a', '2026-02-26', '2026-03-10')],
      f('2026-03-17'),
      10,
    );
    expect(v.map((x) => [x.asignacionId, x.numero, x.desde, x.hasta])).toEqual([
      ['a', 1, '2026-02-26', '2026-03-05'],
      ['a', 2, '2026-03-05', '2026-03-10'],
      ['b', 1, '2026-03-10', '2026-03-17'],
      ['b', 2, '2026-03-17', '2026-03-24'],
    ]);
  });

  it('sólo las que ya empezaron, y las más recientes primero en cortarse', () => {
    const asignaciones = [asignacion('a', '2026-01-01')];
    const v = ventanasDeComparacion(asignaciones, f('2026-03-01'), 2);
    expect(v.map((x) => x.desde)).toEqual(['2026-02-19', '2026-02-26']);
    expect(ventanasDeComparacion([asignacion('a', '2026-04-01')], f('2026-03-01'), 4)).toEqual([]);
    expect(ventanasDeComparacion([], f('2026-03-01'), 4)).toEqual([]);
  });

  it('se niega a una cantidad absurda o a una asignación que termina antes de empezar', () => {
    expect(() => ventanasDeComparacion([], f('2026-03-01'), 0)).toThrow(ErrorDeMotor);
    expect(() =>
      ventanasDeComparacion([asignacion('a', '2026-03-05', '2026-03-05')], f('2026-03-09'), 4),
    ).toThrow(ErrorDeMotor);
  });
});

describe('resta', () => {
  const EMPUJE: VersionDePlan = {
    id: 'empuje',
    cicloDias: 7,
    entradas: [
      { dia: 1, destino: { tipo: 'ejercicio', ejercicioId: 'press-banca' }, objetivo: c('3.00') },
      { dia: 3, destino: { tipo: 'ejercicio', ejercicioId: 'face-pull' }, objetivo: c('4.00') },
    ],
  };
  const LUNES = f('2026-03-02');
  const SIGUIENTE = sumaDias(LUNES, 7);

  it('los dos lados salen de la misma función: hacer justo lo planeado da cero en cada grupo', () => {
    const hecho = [
      ...Array.from({ length: 3 }, () => ejecutada('2026-03-02', 'press-banca')),
      ...Array.from({ length: 4 }, () => ejecutada('2026-03-04', 'face-pull')),
    ];
    expect(
      deltas(hecho, planeado(EMPUJE, '2026-03-02', LUNES, SIGUIENTE), [
        'pectoral',
        'triceps',
        'deltoide-posterior',
      ]),
    ).toEqual({ pectoral: '0.00', triceps: '0.00', 'deltoide-posterior': '0.00' });
  });

  it('una sesión hecha otro día dentro de la semana del ciclo no genera déficit ni superávit', () => {
    // El plan pide el press el día 1 (lunes); se hizo el miércoles.
    const hecho = [
      ...Array.from({ length: 3 }, () => ejecutada('2026-03-04', 'press-banca')),
      ...Array.from({ length: 4 }, () => ejecutada('2026-03-06', 'face-pull')),
    ];
    const d = deltas(hecho, planeado(EMPUJE, '2026-03-02', LUNES, SIGUIENTE), ['pectoral']);
    expect(d).toEqual({ pectoral: '0.00' });
  });

  it('déficit y superávit con signo, y el calentamiento y lo que no llega al umbral no cuentan', () => {
    const hecho = [
      ejecutada('2026-03-02', 'press-banca'),
      ejecutada('2026-03-02', 'press-banca', 6), // sobre el umbral: no cuenta
      { ...ejecutada('2026-03-02', 'press-banca'), tipo: 'calentamiento' } as Serie,
      ...Array.from({ length: 5 }, () => ejecutada('2026-03-04', 'face-pull')),
    ];
    const d = deltas(hecho, planeado(EMPUJE, '2026-03-02', LUNES, SIGUIENTE), [
      'pectoral',
      'triceps',
      'deltoide-posterior',
      'cuadriceps',
    ]);
    expect(d).toEqual({
      pectoral: '-2.00',
      triceps: '-1.00',
      'deltoide-posterior': '0.25',
      cuadriceps: '0.00',
    });
  });
});

describe('vigilaUmbral', () => {
  const serie = (rir: number, version = PARAMS): Serie =>
    ejecutada('2026-03-02', 'press-banca', rir, version);
  const lote = (enLaFranja: number, lejos: number): Serie[] => [
    ...Array.from({ length: enLaFranja }, (_, i) => serie(i % 2 === 0 ? 3 : 4)),
    ...Array.from({ length: lejos }, () => serie(1)),
  ];

  it('la franja es [umbral − 1, umbral] de las efectivas; lo de encima y el calentamiento no entran', () => {
    const v = vigilaUmbral({
      series: [
        serie(4),
        serie(3),
        serie(2),
        serie(5), // sobre el umbral: ni efectiva ni en la franja
        { ...serie(4), tipo: 'calentamiento' } as Serie,
      ],
      umbrales: UMBRALES,
    });
    expect(v).toMatchObject({ efectivas: 3, enLaFranja: 2 });
  });

  it('cada serie con el umbral de su versión', () => {
    const umbrales = new Map([
      [PARAMS, 4],
      ['p2', 2],
    ]);
    const v = vigilaUmbral({ series: [serie(3), serie(3, 'p2'), serie(1, 'p2')], umbrales });
    // p1: 3 en [3, 4]. p2: 3 no es efectiva; 1 está en [1, 2].
    expect(v).toMatchObject({ efectivas: 2, enLaFranja: 2 });
  });

  it(`dispara con más del ${DISPARADOR_DE_VIGILANCIA} %, en enteros, y sólo con ${MINIMO_DE_VIGILANCIA} efectivas o más`, () => {
    const pide = (enLaFranja: number, lejos: number) =>
      vigilaUmbral({ series: lote(enLaFranja, lejos), umbrales: UMBRALES }).pideSensibilidad;
    expect(pide(6, 34)).toBe(false); // 6 de 40: justo el 15 %, no más
    expect(pide(7, 33)).toBe(true); // 7 de 40
    expect(pide(4, 26)).toBe(false); // 4 de 30: 13.3 %
    expect(pide(5, 25)).toBe(true); // 5 de 30: 16.7 %
    expect(pide(29, 0)).toBe(false); // todo en la franja, pero 29 no llega al mínimo
  });

  it('sin el umbral de una versión, falla: no se supone', () => {
    expect(() => vigilaUmbral({ series: [serie(3, 'otra')], umbrales: UMBRALES })).toThrow(
      ErrorDeMotor,
    );
  });
});
