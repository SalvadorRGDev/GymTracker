import { describe, expect, it } from 'vitest';
import { agrega, agregaPorSemana, ErrorDeMotor, volumenDe } from './agrega.js';
import {
  type Centesimas,
  centesimasDesdeDecimal,
  decimalDesdeCentesimas,
  UNA_SERIE,
} from './centesimas.js';
import { type FechaLogica, fechaLogica } from './fecha-logica.js';
import type { Contribucion, Serie } from './tipos.js';

const c = centesimasDesdeDecimal;
const V1 = 'v1';
const LUNES = fechaLogica('2026-09-21');

const PRESS_BANCA: Contribucion[] = [
  { grupoId: 'pectoral', coeficiente: c('1.00') },
  { grupoId: 'triceps', coeficiente: c('0.50') },
  { grupoId: 'deltoides-anterior', coeficiente: c('0.50') },
];

function trabajo(
  rir: number,
  opciones: {
    contribuciones?: readonly Contribucion[];
    fecha?: FechaLogica;
    version?: string;
    veces?: Centesimas;
  } = {},
): Serie {
  return {
    tipo: 'trabajo',
    rir,
    fechaLogica: opciones.fecha ?? LUNES,
    versionParametrosId: opciones.version ?? V1,
    contribuciones: opciones.contribuciones ?? PRESS_BANCA,
    veces: opciones.veces ?? UNA_SERIE,
  };
}

function calentamiento(fecha: FechaLogica = LUNES): Serie {
  return {
    tipo: 'calentamiento',
    fechaLogica: fecha,
    versionParametrosId: V1,
    contribuciones: PRESS_BANCA,
    veces: UNA_SERIE,
  };
}

const UMBRAL_4 = new Map([[V1, 4]]);

function texto(agregado: ReturnType<typeof agrega>, grupo: string): string {
  return decimalDesdeCentesimas(volumenDe(agregado, grupo));
}

describe('agrega', () => {
  it('reproduce el ejemplo numérico del plan (§8.2)', () => {
    const series = [
      calentamiento(),
      calentamiento(),
      trabajo(3),
      trabajo(2),
      trabajo(2),
      trabajo(1),
      trabajo(6),
    ];
    const resultado = agrega({ series, umbrales: UMBRAL_4 });
    expect(texto(resultado, 'pectoral')).toBe('4.00');
    expect(texto(resultado, 'triceps')).toBe('2.00');
    expect(texto(resultado, 'deltoides-anterior')).toBe('2.00');
    expect(resultado.seriesEfectivas).toBe(4);
    expect(resultado.seriesSinMapeo).toBe(0);
    expect(resultado.seriesSobreUmbral).toBe(1);
    expect(resultado.seriesDeCalentamiento).toBe(2);
    expect(resultado.versionesDeParametros).toEqual([V1]);
  });

  it('descarta el calentamiento él mismo, aunque el llamador no filtre', () => {
    const resultado = agrega({ series: [calentamiento(), calentamiento()], umbrales: UMBRAL_4 });
    expect(texto(resultado, 'pectoral')).toBe('0.00');
    expect(resultado.seriesDeCalentamiento).toBe(2);
  });

  it('en la frontera del umbral decide de forma determinista', () => {
    // RIR igual al umbral cuenta; uno más, no. Ahí la métrica es máximamente
    // sensible al error de medición del RIR (ADR-003), por eso el caso explícito.
    const enLaFrontera = agrega({ series: [trabajo(4)], umbrales: UMBRAL_4 });
    const unoPorEncima = agrega({ series: [trabajo(5)], umbrales: UMBRAL_4 });
    expect(texto(enLaFrontera, 'pectoral')).toBe('1.00');
    expect(texto(unoPorEncima, 'pectoral')).toBe('0.00');
    expect(unoPorEncima.seriesSobreUmbral).toBe(1);
    const umbralCero = agrega({ series: [trabajo(0), trabajo(1)], umbrales: new Map([[V1, 0]]) });
    expect(umbralCero.seriesEfectivas).toBe(1);
  });

  it('falla si falta el umbral de una versión citada en vez de suponer uno', () => {
    expect(() => agrega({ series: [trabajo(2, { version: 'v9' })], umbrales: UMBRAL_4 })).toThrow(
      ErrorDeMotor,
    );
  });

  it('reparte un ejercicio entre varios grupos con coeficientes distintos', () => {
    const remo: Contribucion[] = [
      { grupoId: 'dorsal', coeficiente: c('1.00') },
      { grupoId: 'trapecio', coeficiente: c('0.50') },
      { grupoId: 'biceps', coeficiente: c('0.50') },
      { grupoId: 'deltoides-posterior', coeficiente: c('0.25') },
    ];
    const resultado = agrega({
      series: [trabajo(2, { contribuciones: remo }), trabajo(1, { contribuciones: remo })],
      umbrales: UMBRAL_4,
    });
    expect(texto(resultado, 'dorsal')).toBe('2.00');
    expect(texto(resultado, 'trapecio')).toBe('1.00');
    expect(texto(resultado, 'biceps')).toBe('1.00');
    expect(texto(resultado, 'deltoides-posterior')).toBe('0.50');
  });

  it('suma fracciones exactas: 0.50 + 0.25 + 0.25 es 1.00, no 0.99…', () => {
    const series = [
      trabajo(2, { contribuciones: [{ grupoId: 'triceps', coeficiente: c('0.50') }] }),
      trabajo(2, { contribuciones: [{ grupoId: 'triceps', coeficiente: c('0.25') }] }),
      trabajo(2, { contribuciones: [{ grupoId: 'triceps', coeficiente: c('0.25') }] }),
    ];
    expect(texto(agrega({ series, umbrales: UMBRAL_4 }), 'triceps')).toBe('1.00');
  });

  it('una serie sin mapeo cuenta como efectiva y no aporta volumen', () => {
    const resultado = agrega({
      series: [trabajo(2, { contribuciones: [] }), trabajo(2)],
      umbrales: UMBRAL_4,
    });
    expect(resultado.seriesEfectivas).toBe(2);
    expect(resultado.seriesSinMapeo).toBe(1);
    expect(texto(resultado, 'pectoral')).toBe('1.00');
  });

  it('declara todas las versiones que intervinieron', () => {
    const resultado = agrega({
      series: [trabajo(2), trabajo(2, { version: 'v2' }), calentamiento()],
      umbrales: new Map([
        [V1, 4],
        ['v2', 3],
      ]),
    });
    expect(resultado.versionesDeParametros).toEqual(['v1', 'v2']);
  });

  it('cada serie se lee con el umbral de SU versión', () => {
    const resultado = agrega({
      series: [trabajo(4, { version: V1 }), trabajo(4, { version: 'v2' })],
      umbrales: new Map([
        [V1, 4],
        ['v2', 3],
      ]),
    });
    expect(texto(resultado, 'pectoral')).toBe('1.00');
    expect(resultado.seriesSobreUmbral).toBe(1);
  });

  it('multiplica por «veces» con aritmética exacta y redondea una sola vez al final', () => {
    // 4.50 × 0.25 = 1.125 → 1.12 (mitad al par); dos veces, 2.25 exacto.
    const unaVez = agrega({
      series: [
        trabajo(0, {
          veces: c('4.50'),
          contribuciones: [{ grupoId: 'triceps', coeficiente: c('0.25') }],
        }),
      ],
      umbrales: UMBRAL_4,
    });
    expect(texto(unaVez, 'triceps')).toBe('1.12');
    const dosVeces = agrega({
      series: [
        trabajo(0, {
          veces: c('4.50'),
          contribuciones: [{ grupoId: 'triceps', coeficiente: c('0.25') }],
        }),
        trabajo(0, {
          veces: c('4.50'),
          contribuciones: [{ grupoId: 'triceps', coeficiente: c('0.25') }],
        }),
      ],
      umbrales: UMBRAL_4,
    });
    expect(texto(dosVeces, 'triceps')).toBe('2.25');
  });

  it('rechaza RIR, veces o coeficientes imposibles en vez de interpretarlos', () => {
    expect(() => agrega({ series: [trabajo(11)], umbrales: UMBRAL_4 })).toThrow(ErrorDeMotor);
    expect(() => agrega({ series: [trabajo(-1)], umbrales: UMBRAL_4 })).toThrow(ErrorDeMotor);
    expect(() => agrega({ series: [trabajo(2.5)], umbrales: UMBRAL_4 })).toThrow(ErrorDeMotor);
    expect(() =>
      agrega({ series: [trabajo(2, { veces: 0 as Centesimas })], umbrales: UMBRAL_4 }),
    ).toThrow(ErrorDeMotor);
    expect(() =>
      agrega({
        series: [trabajo(2, { contribuciones: [{ grupoId: 'x', coeficiente: 0 as Centesimas }] })],
        umbrales: UMBRAL_4,
      }),
    ).toThrow(ErrorDeMotor);
  });

  it('una lista vacía da ceros, no error ni null', () => {
    const vacio = agrega({ series: [], umbrales: UMBRAL_4 });
    expect(texto(vacio, 'pectoral')).toBe('0.00');
    expect(vacio.seriesEfectivas).toBe(0);
    expect(vacio.versionesDeParametros).toEqual([]);
  });
});

describe('agregaPorSemana', () => {
  it('devuelve todas las semanas, las vacías a cero', () => {
    const series = [trabajo(2, { fecha: fechaLogica('2026-10-05') })];
    const semanas = agregaPorSemana({ series, umbrales: UMBRAL_4 }, { desde: LUNES, semanas: 3 });
    expect(semanas.map((s) => [s.desde, s.hasta])).toEqual([
      ['2026-09-21', '2026-09-28'],
      ['2026-09-28', '2026-10-05'],
      ['2026-10-05', '2026-10-12'],
    ]);
    expect(semanas.map((s) => decimalDesdeCentesimas(volumenDe(s, 'pectoral')))).toEqual([
      '0.00',
      '0.00',
      '1.00',
    ]);
  });

  it('una sesión que cruza la medianoche cuenta un solo día: el de la sesión', () => {
    // Series de las 23:50 y de las 00:15: las dos llevan la fecha lógica de la
    // sesión (domingo). Caen en la misma semana aunque el lunes ya empezó.
    const domingo = fechaLogica('2026-09-27');
    const series = [trabajo(2, { fecha: domingo }), trabajo(2, { fecha: domingo })];
    const semanas = agregaPorSemana({ series, umbrales: UMBRAL_4 }, { desde: LUNES, semanas: 2 });
    expect(decimalDesdeCentesimas(volumenDe(semanas[0] as never, 'pectoral'))).toBe('2.00');
    expect(decimalDesdeCentesimas(volumenDe(semanas[1] as never, 'pectoral'))).toBe('0.00');
  });

  it('lanza con una serie fuera de la ventana en vez de descartarla', () => {
    const antes = [trabajo(2, { fecha: fechaLogica('2026-09-20') })];
    const despues = [trabajo(2, { fecha: fechaLogica('2026-10-05') })];
    expect(() =>
      agregaPorSemana({ series: antes, umbrales: UMBRAL_4 }, { desde: LUNES, semanas: 2 }),
    ).toThrow(ErrorDeMotor);
    expect(() =>
      agregaPorSemana({ series: despues, umbrales: UMBRAL_4 }, { desde: LUNES, semanas: 2 }),
    ).toThrow(ErrorDeMotor);
  });
});
