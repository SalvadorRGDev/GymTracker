import { describe, expect, it } from 'vitest';
import { agrega, agregaPorSemana, ErrorDeMotor, volumenDe } from './agrega.js';
import {
  centesimasDesdeDecimal,
  decimalDesdeCentesimas,
  restaCentesimas,
  UNA_SERIE,
} from './centesimas.js';
import { fechaLogica, sumaDias } from './fecha-logica.js';
import {
  type AsignacionDePlan,
  diaDelCiclo,
  expandePlan,
  fechaDelDiaDelCiclo,
  type VersionDePlan,
} from './plan.js';
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
  ['sentadilla', [{ grupoId: 'cuadriceps', coeficiente: c('1.00') }]],
]);

const parametros = { versionParametrosId: PARAMS, contribuciones: CONTRIBUCIONES };

function version(
  id: string,
  cicloDias: number,
  entradas: VersionDePlan['entradas'],
): VersionDePlan {
  return { id, cicloDias, entradas };
}

const TORSO_PIERNA = version('tp', 4, [
  { dia: 1, destino: { tipo: 'ejercicio', ejercicioId: 'press-banca' }, objetivo: c('4.00') },
  { dia: 2, destino: { tipo: 'ejercicio', ejercicioId: 'sentadilla' }, objetivo: c('4.00') },
  { dia: 3, destino: { tipo: 'grupo', grupoId: 'pectoral' }, objetivo: c('2.50') },
]);

function asignacion(
  id: string,
  versionPlanId: string,
  desde: string,
  hasta: string | null = null,
): AsignacionDePlan {
  return { id, versionPlanId, desde: f(desde), hasta: hasta === null ? null : f(hasta) };
}

function volumen(series: Serie[], grupo: string): string {
  return decimalDesdeCentesimas(volumenDe(agrega({ series, umbrales: UMBRALES }), grupo));
}

describe('expandePlan', () => {
  it('cuenta el día de ciclo desde el ancla, no desde el lunes ni desde la ventana', () => {
    // Ancla un miércoles; la ventana empieza el lunes siguiente.
    const series = expandePlan({
      asignaciones: [asignacion('a', 'tp', '2026-09-23')],
      versiones: new Map([['tp', TORSO_PIERNA]]),
      desde: f('2026-09-28'),
      hasta: f('2026-10-05'),
      parametros,
    });
    // 23 día 1, 24 día 2, 25 día 3, 26 día 4, 27 día 1, 28 día 2, 29 día 3, 30 día 4,
    // 1 día 1, 2 día 2, 3 día 3, 4 día 4.
    const dias = series.map((s) => s.fechaLogica);
    expect(dias).toEqual(['2026-09-28', '2026-09-29', '2026-10-01', '2026-10-02', '2026-10-03']);
    expect(volumen(series, 'cuadriceps')).toBe('8.00');
    expect(volumen(series, 'pectoral')).toBe('9.00'); // 4 del press + 2.50 + 2.50
    expect(volumen(series, 'triceps')).toBe('2.00');
  });

  it('un objetivo por grupo entra con coeficiente 1.00 y rir 0, por el mismo camino', () => {
    const series = expandePlan({
      asignaciones: [asignacion('a', 'tp', '2026-09-21')],
      versiones: new Map([['tp', TORSO_PIERNA]]),
      desde: f('2026-09-23'),
      hasta: f('2026-09-24'),
      parametros,
    });
    expect(series).toEqual([
      {
        tipo: 'trabajo',
        rir: 0,
        fechaLogica: '2026-09-23',
        versionParametrosId: PARAMS,
        contribuciones: [{ grupoId: 'pectoral', coeficiente: 100 }],
        veces: 250,
      },
    ]);
    // Rir 0 cuenta hasta con el umbral más exigente.
    const conUmbralCero = agrega({ series, umbrales: new Map([[PARAMS, 0]]) });
    expect(decimalDesdeCentesimas(volumenDe(conUmbralCero, 'pectoral'))).toBe('2.50');
  });

  it('cambio de plan a mitad del histórico: cada semana con el plan vigente entonces', () => {
    const soloPecho = version('pecho', 7, [
      { dia: 1, destino: { tipo: 'grupo', grupoId: 'pectoral' }, objetivo: c('10.00') },
    ]);
    const soloPierna = version('pierna', 7, [
      { dia: 1, destino: { tipo: 'grupo', grupoId: 'cuadriceps' }, objetivo: c('12.00') },
    ]);
    const series = expandePlan({
      asignaciones: [
        asignacion('viejo', 'pecho', '2026-09-07', '2026-09-21'),
        asignacion('nuevo', 'pierna', '2026-09-21'),
      ],
      versiones: new Map([
        ['pecho', soloPecho],
        ['pierna', soloPierna],
      ]),
      desde: f('2026-09-07'),
      hasta: f('2026-10-05'),
      parametros,
    });
    const semanas = agregaPorSemana(
      { series, umbrales: UMBRALES },
      { desde: f('2026-09-07'), semanas: 4 },
    );
    expect(semanas.map((s) => decimalDesdeCentesimas(volumenDe(s, 'pectoral')))).toEqual([
      '10.00',
      '10.00',
      '0.00',
      '0.00',
    ]);
    expect(semanas.map((s) => decimalDesdeCentesimas(volumenDe(s, 'cuadriceps')))).toEqual([
      '0.00',
      '0.00',
      '12.00',
      '12.00',
    ]);
  });

  it('los dos lados de la resta salen de la misma función: hacer lo planeado da cero', () => {
    const plan = expandePlan({
      asignaciones: [asignacion('a', 'tp', '2026-09-21')],
      versiones: new Map([['tp', TORSO_PIERNA]]),
      desde: f('2026-09-21'),
      hasta: f('2026-09-22'),
      parametros,
    });
    const ejecutado: Serie[] = Array.from({ length: 4 }, () => ({
      tipo: 'trabajo' as const,
      rir: 2,
      fechaLogica: f('2026-09-21'),
      versionParametrosId: PARAMS,
      contribuciones: CONTRIBUCIONES.get('press-banca') ?? [],
      veces: UNA_SERIE,
    }));
    const planeado = agrega({ series: plan, umbrales: UMBRALES });
    const real = agrega({ series: ejecutado, umbrales: UMBRALES });
    for (const grupo of ['pectoral', 'triceps']) {
      expect(
        decimalDesdeCentesimas(restaCentesimas(volumenDe(real, grupo), volumenDe(planeado, grupo))),
      ).toBe('0.00');
    }
  });

  it('un ejercicio sin contribuciones en la versión sale como sin mapeo, no desaparece', () => {
    const conDesconocido = version('x', 1, [
      { dia: 1, destino: { tipo: 'ejercicio', ejercicioId: 'no-mapeado' }, objetivo: c('3.00') },
    ]);
    const series = expandePlan({
      asignaciones: [asignacion('a', 'x', '2026-09-21')],
      versiones: new Map([['x', conDesconocido]]),
      desde: f('2026-09-21'),
      hasta: f('2026-09-22'),
      parametros,
    });
    const resultado = agrega({ series, umbrales: UMBRALES });
    expect(resultado.seriesSinMapeo).toBe(1);
  });

  it('sin asignación no hay series: una ventana sin plan no inventa ceros ni planes', () => {
    const series = expandePlan({
      asignaciones: [asignacion('a', 'tp', '2026-10-01')],
      versiones: new Map([['tp', TORSO_PIERNA]]),
      desde: f('2026-09-21'),
      hasta: f('2026-09-28'),
      parametros,
    });
    expect(series).toEqual([]);
  });

  it('se niega a suponer: solapes, días fuera del ciclo y objetivos duplicados', () => {
    const base = {
      versiones: new Map([['tp', TORSO_PIERNA]]),
      desde: f('2026-09-21'),
      hasta: f('2026-09-28'),
      parametros,
    };
    expect(() =>
      expandePlan({
        ...base,
        asignaciones: [asignacion('a', 'tp', '2026-09-01'), asignacion('b', 'tp', '2026-09-20')],
      }),
    ).toThrow(ErrorDeMotor);

    const fueraDeCiclo = version('mala', 3, [
      { dia: 4, destino: { tipo: 'grupo', grupoId: 'pectoral' }, objetivo: c('1.00') },
    ]);
    expect(() =>
      expandePlan({
        ...base,
        versiones: new Map([['mala', fueraDeCiclo]]),
        asignaciones: [asignacion('a', 'mala', '2026-09-21')],
      }),
    ).toThrow(ErrorDeMotor);

    const duplicada = version('dup', 7, [
      { dia: 1, destino: { tipo: 'grupo', grupoId: 'pectoral' }, objetivo: c('4.00') },
      { dia: 1, destino: { tipo: 'grupo', grupoId: 'pectoral' }, objetivo: c('4.00') },
    ]);
    expect(() =>
      expandePlan({
        ...base,
        versiones: new Map([['dup', duplicada]]),
        asignaciones: [asignacion('a', 'dup', '2026-09-21')],
      }),
    ).toThrow(ErrorDeMotor);

    expect(() =>
      expandePlan({ ...base, asignaciones: [asignacion('a', 'falta', '2026-09-21')] }),
    ).toThrow(ErrorDeMotor);
  });

  it('asignaciones contiguas no se solapan: la vigencia es [desde, hasta)', () => {
    const series = expandePlan({
      asignaciones: [
        asignacion('a', 'tp', '2026-09-14', '2026-09-21'),
        asignacion('b', 'tp', '2026-09-21'),
      ],
      versiones: new Map([['tp', TORSO_PIERNA]]),
      desde: f('2026-09-14'),
      hasta: sumaDias(f('2026-09-21'), 1),
      parametros,
    });
    // El 21 es día 1 de la asignación nueva (ancla), no día 4 de la vieja.
    expect(series.filter((s) => s.fechaLogica === '2026-09-21')).toHaveLength(1);
    expect(
      volumen(
        series.filter((s) => s.fechaLogica === '2026-09-21'),
        'pectoral',
      ),
    ).toBe('4.00');
  });
});

describe('el día del ciclo y su fecha (ADR-026)', () => {
  const ancla = fechaLogica('2026-09-28'); // un lunes: día 1 de un ciclo de 7

  it('el día del ciclo se cuenta desde el ancla y da la vuelta', () => {
    expect(diaDelCiclo(ancla, 7, fechaLogica('2026-09-28'))).toBe(1);
    expect(diaDelCiclo(ancla, 7, fechaLogica('2026-09-29'))).toBe(2);
    expect(diaDelCiclo(ancla, 7, fechaLogica('2026-10-05'))).toBe(1);
    expect(diaDelCiclo(ancla, 4, fechaLogica('2026-10-05'))).toBe(4);
  });

  it('elegir un día lleva a la última vez que tocaba, sin pasar de la fecha de hoy', () => {
    const martes = fechaLogica('2026-10-06'); // día 2
    expect(fechaDelDiaDelCiclo(ancla, 7, 2, martes)).toBe('2026-10-06'); // el de hoy, hoy
    expect(fechaDelDiaDelCiclo(ancla, 7, 1, martes)).toBe('2026-10-05'); // ayer, lunes
    // El viernes de esta semana todavía no ha llegado: el de la anterior.
    expect(fechaDelDiaDelCiclo(ancla, 7, 5, martes)).toBe('2026-10-02');
    // Un ciclo de 4 días no es la semana: hoy toca el día 1 y el 4 fue ayer.
    expect(fechaDelDiaDelCiclo(ancla, 4, 1, martes)).toBe('2026-10-06');
    expect(fechaDelDiaDelCiclo(ancla, 4, 4, martes)).toBe('2026-10-05');
  });

  it('un día que caería antes del ancla no tiene fecha: no se inventa una', () => {
    const miercoles = fechaLogica('2026-09-30'); // día 3 de la primera vuelta
    expect(fechaDelDiaDelCiclo(ancla, 7, 1, miercoles)).toBe('2026-09-28'); // el ancla misma
    expect(fechaDelDiaDelCiclo(ancla, 7, 6, miercoles)).toBeNull(); // sería el sábado 26
  });
});
