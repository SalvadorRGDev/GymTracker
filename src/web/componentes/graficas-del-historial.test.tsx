import { afterEach, describe, expect, it, vi } from 'vitest';
import type { GraficasDelHistorial as Datos } from '../../api/lectura/contrato';
import { type Montado, monta, simulaFetch, textoDe } from '../prueba/utiles';
import {
  GraficasDelHistorial,
  marcasDelEje,
  pasoRedondo,
  tramosDeLinea,
} from './graficas-del-historial';

const SEMANAS: Datos['semanas'] = [
  '2026-01-26',
  '2026-02-02',
  '2026-02-09',
  '2026-02-16',
  '2026-02-23',
  '2026-03-02',
  '2026-03-09',
  '2026-03-16',
].map((desde, i) => ({ desde, hasta: desde, en_curso: i === 7 }));

const ESCALA: Datos['escala'] = [0, 1, 2, 3, 4, 5, 6].map((nivel) => ({
  nivel: nivel as 0,
  desde: '0.00',
  hasta: null,
  rotulo: `Nivel ${nivel}`,
  descripcion: '',
}));

type Semana = Datos['fuerza'][number]['semanas'][number];
const sin: Semana = { lb: null, tramo: null, cambio: null, ejercicios: 0 };
const p = (lb: string, tramo: number, cambio: string | null = null): Semana => ({
  lb,
  tramo,
  cambio,
  ejercicios: 1,
});

const DATOS: Datos = {
  semanas: SEMANAS,
  escala: ESCALA,
  grupos: [
    {
      id: 'g1',
      nombre: 'Pectoral',
      semanas: SEMANAS.map((_, i) =>
        // El nivel lo manda el servidor: aquí un 5 con «0.00» prueba que no se deduce.
        i === 7
          ? { series_efectivas: '0.00', nivel: 5 }
          : { series_efectivas: `${i}.00`, nivel: 1 },
      ),
    },
    {
      id: 'g2',
      nombre: 'Gemelo y sóleo',
      semanas: SEMANAS.map(() => ({ series_efectivas: '0.00', nivel: 0 })),
    },
  ],
  fuerza: [
    {
      tren: 'superior',
      // tramo 1 en 0–1, hueco en 2, sigue el tramo 1 en 3, tramo nuevo en 4–5
      semanas: [
        p('180.00', 1),
        p('186.66', 1, '+3.70'),
        sin,
        p('190.00', 1, '+1.79'),
        p('70.00', 2),
        p('72.00', 2, '+2.86'),
        sin,
        sin,
      ],
    },
    {
      tren: 'inferior',
      semanas: [sin, sin, sin, sin, sin, p('277.50', 1), p('277.50', 1, '0.00'), sin],
    },
  ],
};

let montado: Montado | undefined;

afterEach(() => {
  montado?.desmonta();
  montado = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function pinta(datos: Datos = DATOS) {
  simulaFetch({ 'GET /api/lectura/v1/historial/graficas': { cuerpo: datos } });
  montado = await monta(<GraficasDelHistorial />);
  return montado.raiz;
}

const limpio = (el: Element | null | undefined) =>
  (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

describe('Músculos trabajados (ADR-025)', () => {
  it('una tabla: un grupo por fila y una semana por columna, la actual al final', async () => {
    const raiz = await pinta();
    const tabla = raiz.querySelector('table.mapa-semanal');
    const cabeceras = [...(tabla?.querySelectorAll('thead th') ?? [])].map(limpio);
    expect(cabeceras[0]).toBe('Grupo');
    expect(cabeceras[1]).toBe('Semana del 26 ene');
    expect(cabeceras.at(-1)).toBe('Semana del 16 maren curso');
    const pectoral = [...(tabla?.querySelectorAll('tbody tr') ?? [])].find(
      (tr) => limpio(tr.querySelector('th')) === 'Pectoral',
    );
    const celdas = [...(pectoral?.querySelectorAll('td') ?? [])];
    expect(celdas.map(limpio)).toEqual([
      '0.00',
      '1.00',
      '2.00',
      '3.00',
      '4.00',
      '5.00',
      '6.00',
      '0.00',
    ]);
  });

  it('el color es el nivel que manda el servidor, en una muestra aparte de la cifra', async () => {
    const raiz = await pinta();
    const ultima = raiz
      .querySelectorAll('table.mapa-semanal tbody tr')[0]
      ?.querySelectorAll('td')[7];
    const muestra = ultima?.querySelector('.leyenda-tramo');
    expect(muestra?.getAttribute('data-nivel')).toBe('5');
    expect(muestra?.getAttribute('aria-hidden')).toBe('true');
    expect(muestra?.textContent).toBe('');
  });

  it('en el teléfono, las cuatro más recientes: las otras se marcan para ocultarse', async () => {
    const raiz = await pinta();
    const fila = raiz.querySelectorAll('table.mapa-semanal tbody tr')[0];
    const antiguas = [...(fila?.querySelectorAll('td') ?? [])].map((td) =>
      td.classList.contains('semana-antigua'),
    );
    expect(antiguas).toEqual([true, true, true, true, false, false, false, false]);
  });

  it('ocho semanas sin series efectivas lo dicen, sin tabla de ceros', async () => {
    const raiz = await pinta({
      ...DATOS,
      grupos: DATOS.grupos.map((g) => ({
        ...g,
        semanas: g.semanas.map(() => ({ series_efectivas: '0.00', nivel: 0 as const })),
      })),
    });
    expect(textoDe(raiz)).toContain('Ninguna serie efectiva en estas 8 semanas');
    expect(raiz.querySelector('table.mapa-semanal')).toBeNull();
  });
});

describe('Fuerza estimada (ADR-025)', () => {
  it('una línea por tramo: el hueco y el tramo nuevo cortan; los puntos sueltos se ven', async () => {
    const raiz = await pinta();
    expect(raiz.querySelectorAll('polyline.linea-superior')).toHaveLength(2);
    expect(raiz.querySelectorAll('polyline.linea-inferior')).toHaveLength(1);
    // Cada semana con dato tiene su punto, círculo arriba y cuadrado abajo:
    // la forma separa las líneas aunque no se distinga el color.
    const svg = raiz.querySelector('.lienzo-de-fuerza svg');
    expect(svg?.querySelectorAll('circle.marca-superior')).toHaveLength(5);
    expect(svg?.querySelectorAll('rect.marca-inferior')).toHaveLength(2);
  });

  it('leyenda con las dos y rótulo directo con el último valor', async () => {
    const raiz = await pinta();
    expect([...raiz.querySelectorAll('.leyenda-de-series li')].map(limpio)).toEqual([
      'Tren superior',
      'Tren inferior',
    ]);
    const rotulos = [...raiz.querySelectorAll('.rotulo-de-serie')].map(limpio);
    expect(rotulos).toEqual(['Superior72.00 lb', 'Inferior277.50 lb']);
  });

  it('los números, para todos, en la tabla: «—» sin dato y el cambio con su signo', async () => {
    const raiz = await pinta();
    const tabla = raiz.querySelector('.datos-de-grafica table');
    const filas = [...(tabla?.querySelectorAll('tbody tr') ?? [])].map((tr) =>
      [...tr.children].map(limpio),
    );
    expect(filas[0]).toEqual(['Semana del 26 ene', '180.00', '—']);
    expect(filas[1]).toEqual(['Semana del 2 feb', '186.66 (+3.70 %)', '—']);
    expect(filas[6]).toEqual(['Semana del 9 mar', '—', '277.50 (0.00 %)']);
    expect(filas[7]?.[0]).toBe('Esta semana');
    // El dibujo es para el puntero; el lector de pantalla va a la tabla.
    expect(raiz.querySelector('.lienzo-de-fuerza')?.getAttribute('aria-hidden')).toBe('true');
  });

  it('al pasar por una semana, el globo dice sus dos valores', async () => {
    const raiz = await pinta();
    const zonas = raiz.querySelectorAll('.zona-de-semana');
    zonas[1]?.dispatchEvent(new Event('pointerenter'));
    await vi.waitFor(() => expect(raiz.querySelector('.globo-de-fuerza')).not.toBeNull());
    expect(limpio(raiz.querySelector('.globo-de-fuerza'))).toBe(
      'Semana del lunes 2 de febreroSuperior:186.66 lb+3.70 %Inferior:—',
    );
    expect(raiz.querySelector('.cruz')).not.toBeNull();
  });

  it('sin series con carga en las ocho semanas, lo dice y no dibuja nada', async () => {
    const raiz = await pinta({
      ...DATOS,
      fuerza: DATOS.fuerza.map((f) => ({ ...f, semanas: f.semanas.map(() => sin) })),
    });
    expect(textoDe(raiz)).toContain('Sin series con carga en estas 8 semanas');
    expect(raiz.querySelector('.lienzo-de-fuerza')).toBeNull();
  });
});

describe('geometría de la gráfica', () => {
  it('pasos redondos y marcas que abarcan los valores', () => {
    expect([0.3, 1, 1.7, 2.2, 3, 7, 12, 37].map(pasoRedondo)).toEqual([
      0.5, 1, 2, 2.5, 5, 10, 20, 50,
    ]);
    expect(marcasDelEje([180, 186.66])).toEqual([180, 185, 190]);
    const marcas = marcasDelEje([70, 277.5]);
    expect(marcas[0]).toBeLessThanOrEqual(70);
    expect(marcas.at(-1)).toBeGreaterThanOrEqual(277.5);
    // Un único valor no deja el eje sin altura.
    expect(marcasDelEje([180]).length).toBeGreaterThanOrEqual(2);
  });

  it('tramos: índices seguidos con dato y del mismo tramo', () => {
    expect(tramosDeLinea(DATOS.fuerza[0]?.semanas ?? [])).toEqual([[0, 1], [3], [4, 5]]);
    expect(tramosDeLinea([sin, sin])).toEqual([]);
  });
});
