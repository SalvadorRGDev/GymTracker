import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  CatalogoBaseConPerfiles,
  Catalogo as DatosDeCatalogo,
} from '../../api/lectura/contrato';
import {
  asienta,
  boton,
  escribe,
  type Montado,
  monta,
  pulsa,
  simulaFetch,
  textoDe,
} from '../prueba/utiles';
import { Catalogo } from './catalogo';

const CATALOGO: DatosDeCatalogo = {
  grupos: [
    { id: 'g-pec', nombre: 'Pectoral', zona: 'pectoral' },
    { id: 'g-tri', nombre: 'Tríceps', zona: 'triceps' },
  ],
  ejercicios: [
    { id: 'e-press', nombre: 'Press banca', archivado: false, sin_grupos: false },
    { id: 'e-viejo', nombre: 'Remo viejo', archivado: true, sin_grupos: false },
  ],
  parametros: {
    version_id: 'v1',
    umbral_rir: 4,
    vigente_desde: '2000-01-01',
    fijada: true,
    manana: '2026-09-28',
    contribuciones: [
      { ejercicio_id: 'e-press', grupo_id: 'g-pec', coeficiente: '1.00' },
      { ejercicio_id: 'e-press', grupo_id: 'g-tri', coeficiente: '0.50' },
      { ejercicio_id: 'e-viejo', grupo_id: 'g-pec', coeficiente: '0.25' },
    ],
  },
};

const BASE: CatalogoBaseConPerfiles = {
  grupos: [
    { id: 'pectoral', nombre: 'Pectoral', descripcion: '' },
    { id: 'triceps', nombre: 'Tríceps', descripcion: '' },
  ],
  perfiles: [],
  plantillas: [],
  rangos: { fuentes: [], bandas: [], grupos: {} },
  ejercicios: [
    {
      id: 'press-banca',
      nombre: 'Press banca',
      alias: [],
      equipamiento: [],
      patron: 'empuje-horizontal',
      unilateral: false,
      coeficientes: { pectoral: '1.00', triceps: '0.50' },
    },
  ],
  ejercicios_por_perfil: {},
};

let montado: Montado | undefined;

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  montado?.desmonta();
  montado = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function abre() {
  const red = simulaFetch({
    'GET /api/lectura/v1/catalogo': { cuerpo: CATALOGO },
    'GET /api/lectura/v1/catalogo/base': { cuerpo: BASE },
    'PUT /api/lectura/v1/catalogo/parametros': {
      cuerpo: { camino: 'sucesora', version_id: 'v2', vigente_desde: '2026-09-28' },
    },
  });
  montado = await monta(<Catalogo />);
  const raiz = montado.raiz;
  const ajustes = [...raiz.querySelectorAll('details')].find((d) =>
    d.querySelector('summary')?.textContent?.includes('Ajustes avanzados'),
  );
  if (ajustes === undefined) throw new Error('no están los ajustes avanzados');
  await act(async () => {
    ajustes.open = true;
    ajustes.dispatchEvent(new Event('toggle'));
  });
  await asienta();
  return { raiz, red, ajustes };
}

describe('Catálogo: ajustes avanzados de la métrica', () => {
  it('se declaran opcionales y explican qué es cada cosa antes que nada', async () => {
    const { ajustes } = await abre();
    expect(ajustes.querySelector('summary')?.textContent).toContain('Opcional');
    const texto = textoDe(ajustes);
    expect(texto).toContain('No hace falta tocar nada aquí');
    expect(texto).toContain(
      'lo que cambies se aplicará a partir del lunes 28 de septiembre de 2026',
    );
    expect(texto).toContain('repeticiones que te quedaban «en reserva»');
    expect(texto).toContain('0.50: cuenta como media serie');
  });

  it('los coeficientes se ven como reparto y no se pueden tocar sin pedirlo', async () => {
    const { raiz, ajustes } = await abre();
    expect(textoDe(ajustes)).toContain(
      'Cada serie de Press banca cuenta así: Pectoral 1.00 · Tríceps 0.50.',
    );
    expect(raiz.querySelector('#c-g-tri')).toBeNull();
    expect(boton(raiz, 'Guardar los ajustes').disabled).toBe(true);
    await pulsa(boton(raiz, 'Modificar los coeficientes'));
    expect(raiz.querySelector('#c-g-tri')).not.toBeNull();
  });

  it('lo que difiere del catálogo base se marca, se resume antes de guardar y se restaura', async () => {
    const { raiz, ajustes } = await abre();
    await pulsa(boton(raiz, 'Modificar los coeficientes'));
    await escribe(raiz.querySelector('#c-g-tri') as HTMLInputElement, '0,75');
    expect(textoDe(ajustes)).toContain('Catálogo base: 0.50');
    expect(
      [...ajustes.querySelectorAll('.resumen-de-cambios li')].map((l) => l.textContent),
    ).toEqual(['Press banca: Tríceps 0.50 → 0.75']);
    expect(boton(raiz, 'Guardar los ajustes').disabled).toBe(false);

    await pulsa(boton(raiz, 'Restaurar los del catálogo base'));
    expect((raiz.querySelector('#c-g-tri') as HTMLInputElement).value).toBe('0.50');
    expect(textoDe(ajustes)).not.toContain('Si guardas, cambia');
    expect(boton(raiz, 'Guardar los ajustes').disabled).toBe(true);
  });

  it('guardar envía la propuesta entera, archivados incluidos, y en blanco quita el par', async () => {
    const { raiz, red, ajustes } = await abre();
    await pulsa(boton(raiz, 'Modificar los coeficientes'));
    await escribe(raiz.querySelector('#c-g-tri') as HTMLInputElement, '');
    await pulsa(boton(raiz, 'Guardar los ajustes'));
    const envio = red.llamadas.find((l) => l.metodo === 'PUT');
    expect(envio?.cuerpo).toEqual({
      umbral_rir: 4,
      contribuciones: [
        { ejercicio_id: 'e-press', grupo_id: 'g-pec', coeficiente: '1.00' },
        { ejercicio_id: 'e-viejo', grupo_id: 'g-pec', coeficiente: '0.25' },
      ],
    });
    expect(textoDe(ajustes)).toContain('se aplica a partir del lunes 28 de septiembre de 2026');
  });
});
