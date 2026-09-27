import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Catalogo } from '../../api/lectura/contrato';
import {
  boton,
  campo,
  escribe,
  type Montado,
  monta,
  pulsa,
  simulaFetch,
  textoDe,
} from '../prueba/utiles';
import { entrenamientoVigente, Registrar } from './registrar';

const CATALOGO: Catalogo = {
  grupos: [{ id: 'g1', nombre: 'Pectoral', zona: 'pectoral' }],
  ejercicios: [
    { id: 'e1', nombre: 'Press banca', archivado: false, sin_grupos: false },
    { id: 'e2', nombre: 'Flexiones', archivado: false, sin_grupos: false },
    { id: 'e3', nombre: 'Remo viejo', archivado: true, sin_grupos: false },
  ],
  parametros: {
    version_id: 'v1',
    umbral_rir: 4,
    vigente_desde: '2000-01-01',
    fijada: false,
    manana: '2026-09-27',
    contribuciones: [],
  },
};

const BASE = {
  grupos: [],
  perfiles: [],
  plantillas: [],
  rangos: { fuentes: [], bandas: [], grupos: {} },
  ejercicios: [
    {
      id: 'flexiones',
      nombre: 'Flexiones',
      alias: ['lagartijas'],
      equipamiento: [],
      patron: 'empuje-horizontal',
      unilateral: false,
      coeficientes: { pectoral: '1.00' },
    },
  ],
  ejercicios_por_perfil: {},
};

const MENSAJE = 'Guardada. Esta semana: Pectoral 12.00 · Tríceps 6.00.';
let montado: Montado | undefined;

beforeEach(() => {
  window.sessionStorage.clear();
});

afterEach(() => {
  montado?.desmonta();
  montado = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function pinta() {
  const red = simulaFetch({
    'GET /api/lectura/v1/catalogo': { cuerpo: CATALOGO },
    'GET /api/lectura/v1/catalogo/base': { cuerpo: BASE },
    'POST /api/registro/v1/serie': { cuerpo: { estado: 'aceptada', mensaje: MENSAJE } },
    'POST /api/registro/v1/sesion/cerrar': {
      cuerpo: { estado: 'aceptada', mensaje: 'Entrenamiento cerrado. 2 series, 1 efectivas.' },
    },
  });
  montado = await monta(<Registrar />);
  return { raiz: montado.raiz, red };
}

async function eligeYRellena(raiz: HTMLElement, nombre: string) {
  const radio = [...raiz.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find((r) =>
    r.closest('label')?.textContent?.includes(nombre),
  );
  if (radio === undefined) throw new Error(`no aparece ${nombre}`);
  await pulsa(radio);
  await escribe(campo(raiz, 'Repeticiones') as HTMLInputElement, '10');
  await escribe(campo(raiz, 'Carga (kg)') as HTMLInputElement, '62,5');
}

describe('Registrar', () => {
  it('no ofrece ejercicios archivados: lo que no está en el catálogo no se puede ni escribir', async () => {
    const { raiz } = await pinta();
    const nombres = [...raiz.querySelectorAll('.lista-de-ejercicios label')].map(
      (l) => l.textContent,
    );
    expect(nombres.join(' ')).toContain('Press banca');
    expect(nombres.join(' ')).not.toContain('Remo viejo');
  });

  it('busca por sinónimo del catálogo base', async () => {
    const { raiz } = await pinta();
    await escribe(campo(raiz, 'Buscar ejercicio') as HTMLInputElement, 'lagart');
    const nombres = [...raiz.querySelectorAll('.lista-de-ejercicios label')].map((l) =>
      l.textContent?.trim(),
    );
    expect(nombres).toHaveLength(1);
    expect(nombres[0]).toContain('Flexiones');
  });

  it('enseña el mensaje del servidor palabra por palabra', async () => {
    const { raiz } = await pinta();
    await eligeYRellena(raiz, 'Press banca');
    await pulsa(boton(raiz, '3'));
    await pulsa(boton(raiz, 'Guardar serie'));
    // La región viva es un <output> (rol implícito «status»): ahí va el texto del servidor, entero.
    const vivas = [...raiz.querySelectorAll('output')].map((o) => o.textContent ?? '');
    expect(vivas.some((t) => t.includes(MENSAJE))).toBe(true);
  });

  it('el calentamiento es el botón que se pulsa y no lleva RIR', async () => {
    const { raiz, red } = await pinta();
    await eligeYRellena(raiz, 'Press banca');
    await pulsa(boton(raiz, 'Guardar calentamiento'));
    const envio = red.llamadas.find((l) => l.metodo === 'POST');
    expect(envio?.cuerpo).toMatchObject({
      serie: { calentamiento: true, ejercicio: 'Press banca', carga_kg: '62,5' },
    });
    expect((envio?.cuerpo as { serie: Record<string, unknown> }).serie).not.toHaveProperty('rir');
  });

  it('una serie de trabajo sin RIR no se envía', async () => {
    const { raiz, red } = await pinta();
    await eligeYRellena(raiz, 'Press banca');
    await pulsa(boton(raiz, 'Guardar serie'));
    expect(red.llamadas.some((l) => l.metodo === 'POST')).toBe(false);
    expect(textoDe(raiz)).toContain('Una serie de trabajo necesita su RIR');
  });

  it('dos series seguidas viajan con la misma clave de sesión; la fecha no la manda el navegador', async () => {
    const { raiz, red } = await pinta();
    await eligeYRellena(raiz, 'Press banca');
    await pulsa(boton(raiz, '2'));
    await pulsa(boton(raiz, 'Guardar serie'));
    await pulsa(boton(raiz, 'Guardar serie'));
    const envios = red.llamadas.filter((l) => l.url === '/api/registro/v1/serie');
    const claves = envios.map((l) => (l.cuerpo as { sesion: { clave: string } }).sesion.clave);
    expect(claves).toHaveLength(2);
    expect(claves[0]).toBe(claves[1]);
    const series = envios.map((l) => (l.cuerpo as { serie: { clave: string } }).serie.clave);
    expect(series[0]).not.toBe(series[1]);
    expect(JSON.stringify(envios)).not.toMatch(/iniciada_en|realizada_en|fecha/);
  });

  it('el entrenamiento abierto vale seis horas por antigüedad, y terminarlo lo olvida', async () => {
    const { raiz } = await pinta();
    await eligeYRellena(raiz, 'Press banca');
    await pulsa(boton(raiz, '1'));
    await pulsa(boton(raiz, 'Guardar serie'));
    const abierto = entrenamientoVigente();
    expect(abierto).not.toBeNull();
    expect(entrenamientoVigente((abierto?.iniciado ?? 0) + 6 * 3_600_000 - 1)?.clave).toBe(
      abierto?.clave,
    );
    expect(entrenamientoVigente((abierto?.iniciado ?? 0) + 6 * 3_600_000)).toBeNull();
    await pulsa(boton(raiz, 'Terminar entrenamiento'));
    expect(entrenamientoVigente()).toBeNull();
    expect(textoDe(raiz)).toContain('Entrenamiento cerrado. 2 series, 1 efectivas.');
  });
});
