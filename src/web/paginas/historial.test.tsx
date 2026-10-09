import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Historial as DatosDeHistorial, SesionDelHistorial } from '../../api/lectura/contrato';
import { boton, type Montado, monta, pulsa, simulaFetch, textoDe } from '../prueba/utiles';
import { Historial, paginasVisibles } from './historial';

/** Una sesión del historial con lo mínimo; lo demás, a mano en cada prueba. */
function sesion(fecha: string, extra: Partial<SesionDelHistorial> = {}): SesionDelHistorial {
  return {
    id: `s-${fecha}`,
    fecha_logica: fecha,
    iniciada_en: `${fecha}T17:00:00.000Z`,
    finalizada_en: `${fecha}T18:10:00.000Z`,
    fecha_por_confirmar: false,
    origen: 'registro',
    area: 'superior',
    series_efectivas: 3,
    carga_media_lb: '178.3',
    progreso: { estado: 'primera' },
    series: [],
    ...extra,
  };
}

const PAGINA_1: DatosDeHistorial = {
  pagina: 1,
  paginas: 3,
  total: 23,
  por_pagina: 10,
  sesiones: [
    sesion('2026-03-04', {
      progreso: {
        estado: 'comparada',
        puntos: 6,
        cambio: '+5.71',
        ejercicios: 1,
        frente_a: '2026-03-02',
      },
    }),
    sesion('2026-03-03', {
      area: 'inferior',
      carga_media_lb: '225.0',
      progreso: {
        estado: 'comparada',
        puntos: -4,
        cambio: '-4.44',
        ejercicios: 2,
        frente_a: '2026-02-27',
      },
    }),
    sesion('2026-03-02', { progreso: { estado: 'sin-comunes', frente_a: '2026-02-26' } }),
    sesion('2026-03-01', {
      area: null,
      series_efectivas: 1,
      carga_media_lb: null,
      progreso: { estado: 'sin-area' },
      fecha_por_confirmar: true,
      finalizada_en: null,
      origen: 'captura',
      series: [
        {
          id: 'x1',
          orden: 1,
          ejercicio: 'Press banca',
          repeticiones: 10,
          carga_lb: '95',
          rir: null,
          es_calentamiento: true,
          realizada_en: '2026-03-01T17:05:00.000Z',
        },
        {
          id: 'x2',
          orden: 2,
          ejercicio: 'Press banca',
          repeticiones: 8,
          carga_lb: '175.5',
          rir: 2,
          es_calentamiento: false,
          realizada_en: '2026-03-01T17:09:00.000Z',
        },
      ],
    }),
  ],
};

let montado: Montado | undefined;

beforeEach(() => {
  window.history.replaceState(null, '', '/historial');
});

afterEach(() => {
  montado?.desmonta();
  montado = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function pinta(datos: (url: string) => DatosDeHistorial = () => PAGINA_1) {
  const red = simulaFetch({
    'GET /api/lectura/v1/historial': (_c, url) => ({ cuerpo: datos(url) }),
  });
  montado = await monta(<Historial zona="America/Mexico_City" />);
  return { raiz: montado.raiz, red };
}

const limpio = (el: Element | null | undefined) =>
  (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
/** La fila cuya fecha (el botón que la despliega) coincide: no la que la cita al comparar. */
const fila = (raiz: HTMLElement, fecha: RegExp) =>
  [...raiz.querySelectorAll<HTMLTableRowElement>('tr.fila-sesion')].find((tr) =>
    fecha.test(limpio(tr.querySelector('button.desplegar'))),
  );
/** Las columnas del escritorio; en el teléfono se ocultan y su contenido va bajo la fecha. */
const columnas = (tr: HTMLTableRowElement | undefined) =>
  [...(tr?.querySelectorAll('td.col-amplia') ?? [])].map(limpio);
const bajoLaFecha = (tr: HTMLTableRowElement | undefined) =>
  limpio(tr?.querySelector('th .resumen-en-movil .cifra'));

describe('Historial (ADR-024)', () => {
  it('una fila por sesión: fecha, área, series efectivas, carga media y progreso', async () => {
    const { raiz } = await pinta();
    expect(textoDe(raiz)).toContain('Sesiones 1–4 de 23');
    const encabezados = [...raiz.querySelectorAll('.historial-tabla thead th')].map(limpio);
    expect(encabezados).toEqual([
      'Sesión',
      'Área',
      'Series efectivas',
      'Carga media (lb)',
      'Progreso',
    ]);
    const cuatro = fila(raiz, /4 de marzo/);
    expect(limpio(cuatro?.querySelector('th button.desplegar'))).toBe('miércoles 4 de marzo');
    expect(columnas(cuatro)).toEqual([
      'Tren superior',
      '3',
      '178.3',
      '+6+5.71 % · vs 2 mar, frente a la sesión del lunes 2 de marzo en 1 ejercicio',
    ]);
    expect(columnas(fila(raiz, /3 de marzo/))?.slice(0, 3)).toEqual([
      'Tren inferior',
      '3',
      '225.0',
    ]);
    expect(fila(raiz, /3 de marzo/)?.textContent).toContain('-4');
  });

  it('en el teléfono lo mismo va bajo la fecha: sólo lo que hay y con su unidad', async () => {
    const { raiz } = await pinta();
    expect(bajoLaFecha(fila(raiz, /4 de marzo/))).toBe(
      'Tren superior · 3 series efectivas · media 178.3 lb',
    );
    // Sin área ni carga no se rellena nada: ni «—» ni un cero.
    expect(bajoLaFecha(fila(raiz, /1 de marzo/))).toBe('1 serie efectiva');
    // El progreso también, con su signo, y fuera del botón: el nombre del botón es la fecha.
    const cuatro = fila(raiz, /4 de marzo/);
    expect(limpio(cuatro?.querySelector('th .resumen-en-movil .progreso-sesion'))).toBe('+6');
    expect(cuatro?.querySelector('button.desplegar .resumen-en-movil')).toBeNull();
  });

  it('sin comparación dice por qué, con «—» y nunca con un cero', async () => {
    const { raiz } = await pinta();
    expect(fila(raiz, /2 de marzo/)?.textContent).toContain(
      'sin ejercicios en común con la del 26 feb',
    );
    const sinArea = columnas(fila(raiz, /1 de marzo/));
    expect(sinArea[0]).toBe('—');
    expect(sinArea[2]).toBe('—');
    expect(sinArea[3]).toBe('—sin tren superior ni inferior');
    expect(sinArea.join(' ')).not.toMatch(/\b0\b/);
  });

  it('el progreso no va sólo en color: signo, flecha y número', async () => {
    const { raiz } = await pinta();
    const sube = fila(raiz, /4 de marzo/)?.querySelector('.progreso-sesion');
    const baja = fila(raiz, /3 de marzo/)?.querySelector('.progreso-sesion');
    expect(sube?.className).toContain('progreso-sube');
    expect(sube?.textContent).toBe('+6');
    expect(sube?.querySelector('svg')).not.toBeNull();
    expect(baja?.className).toContain('progreso-baja');
    expect(baja?.textContent).toBe('-4');
  });

  it('cada fila se despliega con sus series; ahí siguen borrar y confirmar la fecha', async () => {
    const { raiz } = await pinta();
    const tr = fila(raiz, /1 de marzo/);
    expect(tr?.textContent).toContain('Fecha por confirmar');
    const desplegar = tr?.querySelector('button.desplegar') as HTMLButtonElement;
    expect(desplegar.getAttribute('aria-expanded')).toBe('false');
    const detalle = raiz.querySelector(`#${desplegar.getAttribute('aria-controls')}`);
    expect(detalle?.hasAttribute('hidden')).toBe(true);
    await pulsa(desplegar);
    expect(desplegar.getAttribute('aria-expanded')).toBe('true');
    expect(detalle?.hasAttribute('hidden')).toBe(false);
    const texto = textoDe(detalle as HTMLElement);
    expect(texto).toContain('Calentamiento');
    // La unidad, en la cabecera; la carga, como llegó.
    const tabla = detalle?.querySelector('table');
    expect(
      [...(tabla?.querySelectorAll('thead th') ?? [])].map((th) => th.textContent?.trim()),
    ).toContain('Carga (lb)');
    expect(tabla?.tBodies[0]?.rows[1]?.textContent).toContain('175.5');
    expect(texto).toContain('sin cerrar');
    expect(boton(detalle as HTMLElement, 'Confirmar fecha')).toBeDefined();
    expect(boton(detalle as HTMLElement, 'Borrar sesión')).toBeDefined();
    expect(boton(detalle as HTMLElement, 'Borrar la serie 2')).toBeDefined();
    // El RIR del calentamiento no se dio: «—», nunca cero.
    const filas = [...(detalle?.querySelector('table')?.tBodies[0]?.rows ?? [])];
    expect(filas[0]?.querySelectorAll('td')[4]?.textContent).toBe('—');
  });

  it('de diez en diez: la página va en la consulta, se marca la actual y el foco sube al resumen', async () => {
    const { raiz, red } = await pinta((url) =>
      url.includes('pagina=2')
        ? { ...PAGINA_1, pagina: 2, sesiones: [sesion('2026-02-20')] }
        : PAGINA_1,
    );
    const actual = boton(raiz, 'Página 1');
    expect(actual.getAttribute('aria-current')).toBe('page');
    expect(boton(raiz, 'Primera página').disabled).toBe(true);
    expect(boton(raiz, 'Página anterior').disabled).toBe(true);
    await pulsa(boton(raiz, 'Página 2'));
    expect(window.location.search).toBe('?pagina=2');
    expect(red.llamadas.at(-1)?.url).toBe('/api/lectura/v1/historial?pagina=2');
    expect(textoDe(raiz)).toContain('Sesiones 11–11 de 23');
    expect(boton(raiz, 'Página 2').getAttribute('aria-current')).toBe('page');
    expect(document.activeElement?.id).toBe('historial-resumen');
    await pulsa(boton(raiz, 'Primera página'));
    expect(window.location.search).toBe('');
  });

  it('sin sesiones lo dice, sin tabla ni páginas', async () => {
    const { raiz } = await pinta(() => ({
      pagina: 1,
      paginas: 1,
      total: 0,
      por_pagina: 10,
      sesiones: [],
    }));
    expect(textoDe(raiz)).toContain('Todavía no hay sesiones');
    expect(raiz.querySelector('table')).toBeNull();
    expect(raiz.querySelector('.paginacion')).toBeNull();
  });
});

describe('qué páginas se enseñan', () => {
  it('todas si caben; si no, la primera, la última y las vecinas de la actual', () => {
    expect(paginasVisibles(1, 3)).toEqual([1, 2, 3]);
    expect(paginasVisibles(1, 12)).toEqual([1, 2, 3, 4, 5, 'despues', 12]);
    expect(paginasVisibles(5, 12)).toEqual([1, 'antes', 4, 5, 6, 'despues', 12]);
    expect(paginasVisibles(12, 12)).toEqual([1, 'antes', 8, 9, 10, 11, 12]);
  });
});
