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
  simulaMovimiento,
  textoDe,
} from '../prueba/utiles';
import { Catalogo } from './catalogo';

const CATALOGO: DatosDeCatalogo = {
  grupos: [
    { id: 'g-pec', nombre: 'Pectoral', zona: 'pectoral' },
    { id: 'g-tri', nombre: 'Tríceps', zona: 'triceps' },
  ],
  ejercicios: [
    {
      id: 'e-press',
      nombre: 'Press banca',
      archivado: false,
      sin_grupos: false,
      base_id: 'press-banca',
    },
    { id: 'e-viejo', nombre: 'Remo viejo', archivado: true, sin_grupos: false, base_id: null },
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
    { id: 'pectoral', nombre: 'Pectoral', descripcion: '', region: 'superior' },
    { id: 'triceps', nombre: 'Tríceps', descripcion: '', region: 'superior' },
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

describe('Catálogo: ver ejemplo', () => {
  const CON_PERFIL: CatalogoBaseConPerfiles = {
    ...BASE,
    perfiles: [
      {
        id: 'esencial',
        nombre: 'Esencial',
        descripcion: 'Lo básico.',
        por_omision: true,
        equipamiento: [],
        sin_cobertura: [],
      },
    ],
    ejercicios_por_perfil: { esencial: ['press-banca'] },
  };

  async function abreLaLista() {
    simulaFetch({
      'GET /api/lectura/v1/catalogo': { cuerpo: CATALOGO },
      'GET /api/lectura/v1/catalogo/base': { cuerpo: CON_PERFIL },
    });
    montado = await monta(<Catalogo />);
    return montado.raiz;
  }

  it('cada ejercicio de la lista lleva «Ver ejemplo» fuera de su etiqueta: pulsarlo no toca la casilla', async () => {
    simulaMovimiento(true);
    const raiz = await abreLaLista();
    const verEjemplo = boton(raiz, 'Ver ejemplo de Press banca');
    expect(verEjemplo.closest('label')).toBeNull();
    const casilla = verEjemplo.closest('li')?.querySelector('input[type="checkbox"]');
    if (!(casilla instanceof HTMLInputElement)) throw new Error('sin casilla');
    expect(casilla.checked).toBe(true);
    await pulsa(verEjemplo);
    expect(casilla.checked).toBe(true);
    expect(boton(raiz, /^Importar 1 ejercicios/).disabled).toBe(false);
  });

  it('abre una ventana modal con la figura, cómo se hace y qué trabaja; «Cerrar» la quita', async () => {
    simulaMovimiento(true);
    const raiz = await abreLaLista();
    const verEjemplo = boton(raiz, 'Ver ejemplo de Press banca');
    verEjemplo.focus();
    await pulsa(verEjemplo);

    const ventana = raiz.querySelector('dialog');
    if (ventana === null) throw new Error('no se abrió la ventana');
    expect(ventana.open).toBe(true);
    expect(document.activeElement).toBe(boton(ventana, 'Cerrar'));
    const titulo = ventana.querySelector(`#${ventana.getAttribute('aria-labelledby')}`);
    expect(titulo?.textContent).toBe('Press banca');

    await vi.waitFor(() => expect(ventana.querySelector('svg[role="img"]')).not.toBeNull());
    expect(textoDe(ventana)).toContain('Tumbado en el banco con los pies en el suelo');
    expect(textoDe(ventana)).toContain('En la figura: press en banco plano con barra.');
    expect(
      [...ventana.querySelectorAll('.ventana-datos div')].map((d) => [
        d.querySelector('dt')?.textContent,
        d.querySelector('dd')?.textContent,
      ]),
    ).toEqual([
      ['Principal', 'Pectoral'],
      ['Ayudan', 'Tríceps'],
      ['Material', 'Ninguno: el propio peso del cuerpo'],
    ]);

    await pulsa(boton(ventana, 'Cerrar'));
    expect(raiz.querySelector('dialog')).toBeNull();
    expect(document.activeElement).toBe(verEjemplo);
  });

  it('en tu lista, donde se archiva, también: los que tienen figura y ninguno propio', async () => {
    simulaMovimiento(true);
    simulaFetch({
      'GET /api/lectura/v1/catalogo': {
        cuerpo: {
          ...CATALOGO,
          ejercicios: [
            ...CATALOGO.ejercicios,
            {
              id: 'e-mio',
              nombre: 'Mi invento',
              archivado: false,
              sin_grupos: true,
              base_id: null,
            },
          ],
        },
      },
      'GET /api/lectura/v1/catalogo/base': { cuerpo: CON_PERFIL },
    });
    montado = await monta(<Catalogo />);
    const lista = montado.raiz.querySelector('section[aria-labelledby="titulo-ejercicios"]');
    if (!(lista instanceof HTMLElement)) throw new Error('sin la lista de ejercicios');
    const fila = (nombre: string) =>
      [...lista.querySelectorAll('li')].find((li) => li.textContent?.includes(nombre));
    expect(fila('Press banca')?.textContent).toContain('Ver ejemplo de Press banca');
    expect(fila('Mi invento')?.textContent).not.toContain('Ver ejemplo');
    await pulsa(boton(lista, 'Ver ejemplo de Press banca'));
    expect(montado.raiz.querySelector('dialog')?.open).toBe(true);
  });
});
