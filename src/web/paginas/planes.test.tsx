import { act } from 'preact/test-utils';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Catalogo, CatalogoBaseConPerfiles } from '../../api/lectura/contrato';
import type { Planes as DatosDePlanes } from '../../api/planes/contrato';
import {
  asienta,
  boton,
  campo,
  escribe,
  type Montado,
  monta,
  pulsa,
  simulaFetch,
  textoDe,
} from '../prueba/utiles';
import { Planes } from './planes';

const PARAMETROS: Catalogo['parametros'] = {
  version_id: 'v1',
  umbral_rir: 4,
  vigente_desde: '2000-01-01',
  fijada: false,
  manana: '2026-09-27',
  contribuciones: [],
};

const PLANES: DatosDePlanes = { hoy: '2026-09-26', planes: [], asignaciones: [] };

const BASE: CatalogoBaseConPerfiles = {
  grupos: [],
  perfiles: [],
  rangos: { fuentes: [], bandas: [], grupos: {} },
  ejercicios: [
    {
      id: 'press-banca',
      nombre: 'Press banca',
      alias: [],
      equipamiento: [],
      patron: 'empuje-horizontal',
      unilateral: false,
      coeficientes: { pectoral: '1.00' },
    },
  ],
  plantillas: [
    {
      id: 'torso',
      nombre: 'Torso',
      descripcion: 'Un día de torso.',
      perfil: 'gimnasio-completo',
      ciclo_dias: 7,
      dias: [{ dia: 1, nombre: 'Torso', entradas: [{ ejercicio: 'press-banca', series: '3' }] }],
    },
  ],
  ejercicios_por_perfil: {},
};

let montado: Montado | undefined;

afterEach(() => {
  montado?.desmonta();
  montado = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('Nueva rutina', () => {
  it('importar lo que falta vuelve a pedir el catálogo sin recargar: la plantilla y el nombre se quedan', async () => {
    let importado = false;
    const recarga = vi.fn();
    vi.stubGlobal('location', { ...window.location, reload: recarga });
    const red = simulaFetch({
      'GET /api/planes/v1': { cuerpo: PLANES },
      'GET /api/lectura/v1/catalogo/base': { cuerpo: BASE },
      'GET /api/lectura/v1/catalogo': () => ({
        cuerpo: {
          grupos: [],
          parametros: PARAMETROS,
          ejercicios: importado
            ? [{ id: 'e1', nombre: 'Press banca', archivado: false, sin_grupos: false }]
            : [],
        } satisfies Catalogo,
      }),
      'POST /api/lectura/v1/catalogo/importa': () => {
        importado = true;
        return { cuerpo: { ejercicios_creados: 1 } };
      },
    });
    montado = await monta(<Planes />);
    const raiz = montado.raiz;
    const plantilla = campo(raiz, 'Empezar desde') as HTMLSelectElement;
    await act(async () => {
      plantilla.value = 'torso';
      plantilla.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await asienta();
    await escribe(campo(raiz, 'Nombre') as HTMLInputElement, 'Mi torso');
    expect((campo(raiz, 'Nombre') as HTMLInputElement).value).toBe('Mi torso');
    expect(textoDe(raiz)).toContain('le faltan 1 ejercicios');
    expect(boton(raiz, 'Crear borrador').disabled).toBe(true);

    await pulsa(boton(raiz, 'Importarlos del catálogo base'));

    expect(recarga).not.toHaveBeenCalled();
    const pedidas = red.llamadas.filter((l) => l.url === '/api/lectura/v1/catalogo');
    expect(pedidas).toHaveLength(2);
    expect(textoDe(raiz)).not.toContain('le faltan');
    expect((campo(raiz, 'Empezar desde') as HTMLSelectElement).value).toBe('torso');
    expect((campo(raiz, 'Nombre') as HTMLInputElement).value).toBe('Mi torso');
    expect(boton(raiz, 'Crear borrador').disabled).toBe(false);
  });
});
