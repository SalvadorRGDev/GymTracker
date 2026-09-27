import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  Comparativa as DatosDeComparativa,
  VentanaComparada,
} from '../../api/planes/contrato';
import {
  asienta,
  boton,
  campo,
  type Montado,
  monta,
  pulsa,
  simulaFetch,
  textoDe,
} from '../prueba/utiles';
import { Comparativa } from './comparativa';

const VIGILANCIA: DatosDeComparativa['vigilancia'] = {
  desde: '2026-06-29',
  hasta: '2026-09-20',
  efectivas: 40,
  en_la_franja: 7,
  porcentaje: '17.5',
  disparador: 15,
  minimo: 30,
  pide_sensibilidad: true,
  umbrales: [4],
};

function ventana(extra: Partial<VentanaComparada>): VentanaComparada {
  return {
    desde: '2026-09-07',
    hasta: '2026-09-13',
    dias: 7,
    numero: 1,
    en_curso: false,
    plan: {
      asignacion_id: 'a1',
      version_id: 'v1',
      nombre: 'Torso',
      numero_de_version: 2,
      ciclo_dias: 7,
      ancla: '2026-09-07',
    },
    versiones_de_parametros: [{ id: 'p1', vigente_desde: '2000-01-01', umbral_rir: 4 }],
    entradas_sin_mapeo: 0,
    series_sin_mapeo: 0,
    grupos: [],
    detalle: [],
    ...extra,
  };
}

const DATOS: DatosDeComparativa = {
  hoy: '2026-09-20',
  simulacion: null,
  vigilancia: VIGILANCIA,
  ventanas: [
    ventana({
      grupos: [
        {
          id: 'g1',
          nombre: 'Pectoral',
          planeado: '12.00',
          ejecutado: '9.50',
          delta: '-2.50',
          estado: 'deficit',
        },
        {
          id: 'g2',
          nombre: 'Tríceps',
          planeado: '4.00',
          ejecutado: '6.00',
          delta: '+2.00',
          estado: 'superavit',
        },
      ],
      detalle: [
        {
          fecha: '2026-09-07',
          dia_del_ciclo: 1,
          futuro: false,
          planeado: [{ id: 'g1', nombre: 'Pectoral', series: '12.00' }],
          ejecutado: [],
        },
        {
          fecha: '2026-09-09',
          dia_del_ciclo: 3,
          futuro: false,
          planeado: [],
          ejecutado: [{ id: 'g1', nombre: 'Pectoral', series: '9.50' }],
        },
      ],
    }),
    ventana({
      desde: '2026-09-14',
      hasta: '2026-09-20',
      numero: 2,
      en_curso: true,
      versiones_de_parametros: [
        { id: 'p1', vigente_desde: '2000-01-01', umbral_rir: 4 },
        { id: 'p2', vigente_desde: '2026-09-16', umbral_rir: 3 },
      ],
      grupos: [
        {
          id: 'g1',
          nombre: 'Pectoral',
          planeado: '12.00',
          ejecutado: '4.00',
          delta: '-8.00',
          estado: 'pendiente',
        },
      ],
    }),
  ],
};

let montado: Montado | undefined;

beforeEach(() => {
  window.history.replaceState(null, '', '/comparativa');
});

afterEach(() => {
  montado?.desmonta();
  montado = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function pinta(datos: DatosDeComparativa = DATOS) {
  const red = simulaFetch({
    'GET /api/planes/v1/comparativa': (_cuerpo, url) =>
      new URL(url, 'http://x').searchParams.has('umbral')
        ? { cuerpo: { ...datos, simulacion: { umbral_rir: 3 } } }
        : { cuerpo: datos },
  });
  montado = await monta(<Comparativa />);
  return { raiz: montado.raiz, red };
}

describe('Comparativa', () => {
  it('enseña la diferencia del servidor con su signo y su rótulo, la semana más reciente primero', async () => {
    const { raiz } = await pinta();
    const titulos = [...raiz.querySelectorAll('h2')].map((h) => h.textContent?.trim());
    expect(titulos.filter((t) => t?.startsWith('Semana'))).toEqual([
      'Semana 2 de «Torso» v2',
      'Semana 1 de «Torso» v2',
    ]);
    const deltas = [...raiz.querySelectorAll('.delta')].map((d) =>
      (d.textContent ?? '').replace(/\s+/g, ' ').trim(),
    );
    expect(deltas).toEqual(['-8.00pendiente', '-2.50déficit', '+2.00superávit']);
    // La barra es decoración: el dato está en texto.
    for (const barra of raiz.querySelectorAll('.barra-comparada')) {
      expect(barra.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('declara la mezcla de versiones de parámetros y rotula el detalle como desplazamiento', async () => {
    const { raiz } = await pinta();
    const texto = textoDe(raiz);
    expect(texto).toContain('Esta semana mezcla 2 versiones de parámetros');
    expect(texto).toContain('RIR ≤ 3');
    expect(texto).toContain('Desplazamiento por día');
    expect(texto).toContain('entrenar otro día dentro de ella no es incumplir');
    expect(texto).toContain('día 3 del ciclo');
    expect(texto).not.toMatch(/incumpli(ó|ste|miento)/);
  });

  it('simular otro umbral lo pide al servidor, lo rotula y se deshace', async () => {
    const { raiz, red } = await pinta();
    const selector = campo(raiz, 'Umbral de RIR') as HTMLSelectElement;
    await act(async () => {
      selector.value = '3';
      selector.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await asienta();
    expect(window.location.search).toContain('umbral=3');
    expect(red.llamadas.at(-1)?.url).toContain('umbral=3');
    expect(textoDe(raiz)).toContain(
      'Simulación: aquí una serie cuenta con RIR ≤ 3. No se guarda nada.',
    );
    await pulsa(boton(raiz, 'Volver a tu umbral'));
    expect(window.location.search).not.toContain('umbral');
    expect(textoDe(raiz)).not.toContain('Simulación:');
  });

  it('la vigilancia pide mirar la sensibilidad con un punto menos y uno más', async () => {
    const { raiz } = await pinta();
    expect(textoDe(raiz)).toContain('7 de 40 series efectivas (17.5 %)');
    expect(textoDe(raiz)).toContain('el umbral está decidiendo el resultado');
    await pulsa(boton(raiz, 'Simular RIR ≤ 5'));
    expect(window.location.search).toContain('umbral=5');
  });

  it('sin plan asignado no enseña ceros: dice que no hay contra qué comparar', async () => {
    const { raiz } = await pinta({
      ...DATOS,
      ventanas: [],
      vigilancia: {
        ...VIGILANCIA,
        efectivas: 0,
        en_la_franja: 0,
        porcentaje: null,
        pide_sensibilidad: false,
      },
    });
    expect(textoDe(raiz)).toContain('Todavía no hay contra qué comparar');
    expect(raiz.querySelectorAll('.delta')).toHaveLength(0);
  });
});
