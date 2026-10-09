import { act } from 'preact/test-utils';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Catalogo } from '../../api/lectura/contrato';
import type { RutinaDelDia, VistaDeRutina } from '../../api/registro/contrato';
import {
  asienta,
  boton,
  campo,
  escribe,
  type Montado,
  monta,
  pulsa,
  simulaFetch,
  simulaMovimiento,
  textoDe,
} from '../prueba/utiles';
import { entrenamientoVigente, Registrar } from './registrar';

const CATALOGO: Catalogo = {
  grupos: [{ id: 'g1', nombre: 'Pectoral', zona: 'pectoral' }],
  ejercicios: [
    {
      id: 'e1',
      nombre: 'Press banca',
      archivado: false,
      sin_grupos: false,
      base_id: 'press-banca',
    },
    { id: 'e2', nombre: 'Flexiones', archivado: false, sin_grupos: false, base_id: 'flexiones' },
    { id: 'e3', nombre: 'Remo viejo', archivado: true, sin_grupos: false, base_id: null },
    { id: 'e4', nombre: 'Sentadilla', archivado: false, sin_grupos: false, base_id: null },
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

/** Martes 3 de marzo, día 2 de 4 de «Torso-Pierna»: press banca y pectoral a elegir. */
const HOY: VistaDeRutina = {
  version_id: 'v-torso',
  plan_nombre: 'Torso-Pierna',
  numero: 1,
  ciclo_dias: 4,
  dia: 2,
  es_la_de_hoy: true,
  completa: false,
  entradas: [
    {
      tipo: 'ejercicio',
      id: 'en1',
      ejercicio: { id: 'e1', nombre: 'Press banca', archivado: false },
      objetivo: '3.00',
      hechas: '1.00',
      completa: false,
    },
    {
      tipo: 'grupo',
      id: 'en2',
      grupo: { id: 'g1', nombre: 'Pectoral' },
      objetivo: '2.00',
      hechas: '0.50',
      completa: false,
      ejercicios: [{ id: 'e2', nombre: 'Flexiones', coeficiente: '1.00' }],
    },
  ],
};

function rutina(vista: VistaDeRutina | null, extra: Partial<RutinaDelDia> = {}): RutinaDelDia {
  return {
    fecha: '2026-03-03',
    de_entrenamiento_abierto: false,
    rutinas: [
      {
        version_id: 'v-torso',
        plan_nombre: 'Torso-Pierna',
        numero: 1,
        ciclo_dias: 4,
        asignada: true,
      },
      {
        version_id: 'v-entero',
        plan_nombre: 'Cuerpo entero',
        numero: 2,
        ciclo_dias: 7,
        asignada: false,
      },
    ],
    de_hoy: { version_id: 'v-torso', dia: 2 },
    vista,
    ...extra,
  };
}

beforeEach(() => {
  window.sessionStorage.clear();
  window.history.replaceState(null, '', '/registrar');
});

afterEach(() => {
  montado?.desmonta();
  montado = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function pinta(
  deRutina: (url: string) => RutinaDelDia = () => rutina(null, { rutinas: [], de_hoy: null }),
) {
  const red = simulaFetch({
    'GET /api/lectura/v1/catalogo': { cuerpo: CATALOGO },
    'GET /api/lectura/v1/catalogo/base': { cuerpo: BASE },
    'GET /api/registro/v1/rutina': (_cuerpo, url) => ({ cuerpo: deRutina(url) }),
    'POST /api/registro/v1/serie': { cuerpo: { estado: 'aceptada', mensaje: MENSAJE } },
    'POST /api/registro/v1/sesion/cerrar': {
      cuerpo: { estado: 'aceptada', mensaje: 'Entrenamiento cerrado. 2 series, 1 efectivas.' },
    },
  });
  montado = await monta(<Registrar />);
  return { raiz: montado.raiz, red };
}

async function eligeEn(select: HTMLSelectElement, valor: string) {
  await act(async () => {
    select.value = valor;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await asienta();
}

const filaDe = (raiz: HTMLElement, nombre: string) =>
  [...raiz.querySelectorAll<HTMLButtonElement>('.lista-rutina button')].find((b) =>
    b.textContent?.includes(nombre),
  );

async function eligeYRellena(raiz: HTMLElement, nombre: string) {
  const radio = [...raiz.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find((r) =>
    r.closest('label')?.textContent?.includes(nombre),
  );
  if (radio === undefined) throw new Error(`no aparece ${nombre}`);
  await pulsa(radio);
  await escribe(campo(raiz, 'Repeticiones') as HTMLInputElement, '10');
  await escribe(campo(raiz, 'Carga (lb)') as HTMLInputElement, '62,5');
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
      serie: { calentamiento: true, ejercicio: 'Press banca', carga_lb: '62,5' },
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

describe('Registrar desde la rutina del día (ADR-022)', () => {
  it('empieza por lo que toca hoy: dice qué rutina y qué día, y lista lo que pide con lo que llevas', async () => {
    const { raiz } = await pinta(() => rutina(HOY));
    const texto = textoDe(raiz);
    expect(texto).toContain(
      'Hoy, martes 3 de marzo, toca el día 2 de 4 de «Torso-Pierna»: 2 ejercicios.',
    );
    expect(filaDe(raiz, 'Press banca')?.textContent).toContain('1.00 de 3.00');
    expect(filaDe(raiz, 'Pectoral')?.textContent).toContain('con el ejercicio que elijas');
    const rutinas = campo(raiz, 'Rutina') as HTMLSelectElement;
    expect(rutinas.value).toBe('v-torso');
    expect([...rutinas.options].map((o) => o.textContent)).toEqual([
      'Torso-Pierna · asignada',
      'Cuerpo entero',
    ]);
    expect((campo(raiz, 'Día') as HTMLSelectElement).selectedOptions[0]?.textContent).toBe(
      'Día 2 de 4 · toca hoy',
    );
    // La búsqueda libre sigue, abajo y con su rótulo.
    expect(texto).toContain('¿Vas a hacer algo que no está en la rutina?');
  });

  it('elegir de la rutina lleva a la serie con lo que llevas; tras guardar sigue elegido y el progreso se vuelve a pedir', async () => {
    const { raiz, red } = await pinta(() => rutina(HOY));
    await pulsa(filaDe(raiz, 'Press banca') as HTMLButtonElement);
    expect(filaDe(raiz, 'Press banca')?.getAttribute('aria-pressed')).toBe('true');
    expect(textoDe(raiz)).toContain('Llevas 1.00 de 3.00 series efectivas de las que pide el día.');
    await escribe(campo(raiz, 'Repeticiones') as HTMLInputElement, '8');
    await escribe(campo(raiz, 'Carga (lb)') as HTMLInputElement, '135');
    await pulsa(boton(raiz, '2'));
    const antes = red.llamadas.filter((l) => l.url.startsWith('/api/registro/v1/rutina')).length;
    await pulsa(boton(raiz, 'Guardar serie'));
    const lecturas = red.llamadas.filter((l) => l.url.startsWith('/api/registro/v1/rutina'));
    expect(lecturas.length).toBeGreaterThan(antes);
    // Ya hay entrenamiento abierto: la fecha la manda él.
    expect(lecturas.at(-1)?.url).toMatch(/[?&]sesion=/);
    expect(filaDe(raiz, 'Press banca')?.getAttribute('aria-pressed')).toBe('true');
    // La segunda serie ya no cambia la dirección (misma clave): el progreso se pide igual.
    const tras = red.llamadas.filter((l) => l.url.startsWith('/api/registro/v1/rutina')).length;
    await pulsa(boton(raiz, 'Guardar serie'));
    expect(
      red.llamadas.filter((l) => l.url.startsWith('/api/registro/v1/rutina')).length,
    ).toBeGreaterThan(tras);
    const envio = red.llamadas.find((l) => l.url === '/api/registro/v1/serie');
    expect(envio?.cuerpo).toMatchObject({ serie: { ejercicio: 'Press banca', rir: 2 } });
  });

  it('un objetivo de grupo se despliega con sus ejercicios, y elegir uno dice a qué suma', async () => {
    const { raiz } = await pinta(() => rutina(HOY));
    const grupo = filaDe(raiz, 'Pectoral') as HTMLButtonElement;
    expect(grupo.getAttribute('aria-expanded')).toBe('false');
    await pulsa(grupo);
    expect(grupo.getAttribute('aria-expanded')).toBe('true');
    const opcion = [...raiz.querySelectorAll<HTMLButtonElement>('.opciones-de-grupo button')].find(
      (b) => b.textContent?.includes('Flexiones'),
    );
    expect(opcion?.textContent).toContain('cuenta 1.00');
    await pulsa(opcion as HTMLButtonElement);
    expect(textoDe(raiz)).toContain('Suma a Pectoral: llevas 0.50 de 2.00.');
  });

  it('lo que se elige en la búsqueda y no está en la lista del día se avisa, y se guarda igual', async () => {
    const { raiz } = await pinta(() => rutina(HOY));
    const radio = [...raiz.querySelectorAll<HTMLInputElement>('input[type="radio"]')].find((r) =>
      r.closest('label')?.textContent?.includes('Sentadilla'),
    );
    await pulsa(radio as HTMLInputElement);
    const texto = textoDe(raiz);
    expect(texto).toContain(
      'No está en la lista del día: se guarda igual y cuenta para tu semana.',
    );
    expect(texto).toContain('Elegido: Sentadilla.');
    expect(boton(raiz, 'Rellenar la serie')).toBeDefined();
  });

  it('otra rutina u otro día van a la consulta, avisan de que no es lo de hoy y se vuelve con un botón', async () => {
    const { raiz, red } = await pinta((url) =>
      url.includes('dia=3')
        ? rutina({ ...HOY, dia: 3, es_la_de_hoy: false, entradas: [] })
        : rutina(HOY),
    );
    await eligeEn(campo(raiz, 'Día') as HTMLSelectElement, '3');
    expect(window.location.search).toBe('?dia=3');
    expect(red.llamadas.at(-1)?.url).toContain('dia=3');
    expect(textoDe(raiz)).toContain(
      'Estás viendo el día 3 de «Torso-Pierna», que es de descanso, no el que toca: el día 2 de «Torso-Pierna». Lo que registres cuenta para el martes 3 de marzo.',
    );
    await pulsa(boton(raiz, 'Volver a la de hoy'));
    expect(window.location.search).toBe('');
    expect(textoDe(raiz)).toContain('toca el día 2 de 4');
    // Otra rutina: se fija en la consulta, y el día empieza de nuevo.
    await eligeEn(campo(raiz, 'Rutina') as HTMLSelectElement, 'v-entero');
    expect(window.location.search).toBe('?rutina=v-entero');
    expect(red.llamadas.at(-1)?.url).toContain('version=v-entero');
    // Volver a elegir la asignada no la fija: así sigue al día que toque mañana.
    await eligeEn(campo(raiz, 'Rutina') as HTMLSelectElement, 'v-torso');
    expect(window.location.search).toBe('');
  });

  it('dos versiones de la misma rutina se distinguen por su número', async () => {
    const { raiz } = await pinta(() =>
      rutina(HOY, {
        rutinas: [
          {
            version_id: 'v-torso',
            plan_nombre: 'Torso-Pierna',
            numero: 1,
            ciclo_dias: 4,
            asignada: true,
          },
          {
            version_id: 'v-torso-2',
            plan_nombre: 'Torso-Pierna',
            numero: 2,
            ciclo_dias: 4,
            asignada: false,
          },
        ],
      }),
    );
    expect(
      [...(campo(raiz, 'Rutina') as HTMLSelectElement).options].map((o) => o.textContent),
    ).toEqual(['Torso-Pierna · versión 1 · asignada', 'Torso-Pierna · versión 2']);
  });

  it('sin rutinas publicadas, la búsqueda pasa a ser lo principal y lo dice', async () => {
    const { raiz } = await pinta();
    const texto = textoDe(raiz);
    expect(texto).toContain('No tienes rutinas publicadas.');
    expect(texto).toContain('Busca el ejercicio');
    expect(raiz.querySelector('#rutina')).toBeNull();
  });

  it('con rutinas pero ninguna asignada, invita a elegir una sin inventarla', async () => {
    const { raiz } = await pinta(() => rutina(null, { de_hoy: null }));
    expect(textoDe(raiz)).toContain('no tienes ninguna rutina asignada');
    expect((campo(raiz, 'Rutina') as HTMLSelectElement).value).toBe('');
  });

  it('el día de descanso lo dice, y el día completo invita a terminar el entrenamiento abierto', async () => {
    const descanso = await pinta(() => rutina({ ...HOY, entradas: [] }));
    expect(textoDe(descanso.raiz)).toContain(
      'toca el día 2 de 4 de «Torso-Pierna»: es de descanso.',
    );
    montado?.desmonta();

    window.sessionStorage.setItem(
      'sigir:entrenamiento-abierto',
      JSON.stringify({ clave: 'clave-abierta-1', iniciado: Date.now() }),
    );
    const lleno = await pinta(() =>
      rutina({
        ...HOY,
        completa: true,
        entradas: HOY.entradas.map((e) => ({ ...e, completa: true })),
      }),
    );
    expect(
      lleno.red.llamadas.find((l) => l.url.startsWith('/api/registro/v1/rutina'))?.url,
    ).toContain('sesion=clave-abierta-1');
    expect(textoDe(lleno.raiz)).toContain(
      'Terminaste lo que pide el día 2. Si has acabado, pulsa «Terminar entrenamiento».',
    );
    expect(filaDe(lleno.raiz, 'Press banca')?.textContent).toContain('Hecho');
  });

  it('si la rutina no se puede leer, lo dice, deja reintentar y la búsqueda sigue', async () => {
    let intentos = 0;
    const red = simulaFetch({
      'GET /api/lectura/v1/catalogo': { cuerpo: CATALOGO },
      'GET /api/lectura/v1/catalogo/base': { cuerpo: BASE },
      'GET /api/registro/v1/rutina': () => {
        intentos += 1;
        return intentos === 1
          ? { estado: 404, cuerpo: { codigo: 'no-encontrado', mensaje: 'Ruta desconocida' } }
          : { cuerpo: rutina(HOY) };
      },
    });
    montado = await monta(<Registrar />);
    const raiz = montado.raiz;
    expect(textoDe(raiz)).toContain(
      'No se pudo leer tu rutina («Ruta desconocida»). Mientras, busca el ejercicio abajo: se guarda igual.',
    );
    // Sin rutina ni día en la consulta, «Volver a la de hoy» no arreglaría nada.
    expect(() => boton(raiz, 'Volver a la de hoy')).toThrow();
    expect(raiz.querySelectorAll('.lista-de-ejercicios label').length).toBeGreaterThan(0);
    await pulsa(boton(raiz, 'Reintentar'));
    expect(red.llamadas.filter((l) => l.url.startsWith('/api/registro/v1/rutina'))).toHaveLength(2);
    expect(textoDe(raiz)).toContain('toca el día 2 de 4');
  });

  it('si lo que se rechaza es la rutina o el día elegidos, ofrece volver a los de hoy', async () => {
    window.history.replaceState(null, '', '/registrar?dia=9');
    simulaFetch({
      'GET /api/lectura/v1/catalogo': { cuerpo: CATALOGO },
      'GET /api/lectura/v1/catalogo/base': { cuerpo: BASE },
      'GET /api/registro/v1/rutina': (_cuerpo, url) =>
        url.includes('dia=9')
          ? {
              estado: 422,
              cuerpo: { codigo: 'dia', mensaje: 'El día 9 no cabe en un ciclo de 4 días' },
            }
          : { cuerpo: rutina(HOY) },
    });
    montado = await monta(<Registrar />);
    expect(textoDe(montado.raiz)).toContain('El día 9 no cabe en un ciclo de 4 días');
    await pulsa(boton(montado.raiz, 'Volver a la de hoy'));
    expect(window.location.search).toBe('');
    expect(textoDe(montado.raiz)).toContain('toca el día 2 de 4');
  });

  it('cada ejercicio de la rutina y de la búsqueda lleva «Ver ejemplo» al lado, no dentro', async () => {
    simulaMovimiento(true);
    const { raiz } = await pinta(() => rutina(HOY));
    const fila = filaDe(raiz, 'Press banca') as HTMLButtonElement;
    const ejemplo = fila.parentElement?.querySelector('button.ver-ejemplo');
    expect(ejemplo?.textContent).toBe('Ver ejemplo de Press banca');
    expect(fila.contains(ejemplo ?? null)).toBe(false);
    // Pulsarlo enseña, no elige.
    await pulsa(ejemplo as HTMLButtonElement);
    expect(fila.getAttribute('aria-pressed')).toBe('false');
    expect(raiz.querySelector('dialog')?.open).toBe(true);
    await pulsa(boton(raiz.querySelector('dialog') as HTMLElement, 'Cerrar'));
    // En la búsqueda libre, igual; uno sin figura (propio o renombrado) no lo lleva.
    const enLaBusqueda = (nombre: string) =>
      [...raiz.querySelectorAll('.busqueda-libre li')].find((li) =>
        li.textContent?.includes(nombre),
      );
    expect(enLaBusqueda('Flexiones')?.querySelector('label button')).toBeNull();
    expect(enLaBusqueda('Flexiones')?.textContent).toContain('Ver ejemplo de Flexiones');
    expect(enLaBusqueda('Sentadilla')?.textContent).not.toContain('Ver ejemplo');
  });

  it('un ejercicio archivado de la rutina no se puede elegir y dice cómo recuperarlo', async () => {
    const { raiz } = await pinta(() =>
      rutina({
        ...HOY,
        entradas: [
          {
            tipo: 'ejercicio',
            id: 'en9',
            ejercicio: { id: 'e3', nombre: 'Remo viejo', archivado: true },
            objetivo: '2.00',
            hechas: '0.00',
            completa: false,
          },
        ],
      }),
    );
    expect(filaDe(raiz, 'Remo viejo')?.disabled).toBe(true);
    expect(textoDe(raiz)).toContain('Archivado: recupéralo en el catálogo para registrarlo.');
  });
});
