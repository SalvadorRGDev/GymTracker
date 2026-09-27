import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ESCALA } from '../../api/escala';
import type { Dashboard, GrupoDelDashboard } from '../../api/lectura/contrato';
import {
  asienta,
  boton,
  campo,
  type Montado,
  monta,
  pulsa,
  simulaFetch,
  simulaMovimiento,
  textoDe,
} from '../prueba/utiles';
import { Resumen } from './resumen';

function grupo(
  parcial: Partial<GrupoDelDashboard> & { id: string; nombre: string },
): GrupoDelDashboard {
  return { series_efectivas: '0.00', nivel: 0, zona: null, referencia: null, ...parcial };
}

function dashboard(grupos: GrupoDelDashboard[], extra: Partial<Dashboard> = {}): Dashboard {
  return {
    semana: { desde: '2026-09-21', hasta: '2026-09-27', hoy: '2026-09-26' },
    grupos,
    estadisticas: { series_efectivas: 14, sesiones: 3, grupos_sin_trabajo: 2 },
    escala: ESCALA,
    diagnostico: {
      series_sin_mapeo: 0,
      series_sobre_umbral: 0,
      series_de_calentamiento: 0,
      versiones_de_parametros: ['v1'],
    },
    frescura: { ultima_serie_recibida: '2026-09-27T01:42:00.000Z' },
    catalogo: { grupos: grupos.length, ejercicios: 170 },
    ...extra,
  };
}

const DORSAL = grupo({
  id: 'g-dorsal',
  nombre: 'Dorsal',
  series_efectivas: '12.00',
  nivel: 4,
  zona: 'dorsal',
});
const PECTORAL = grupo({
  id: 'g-pec',
  nombre: 'Pectoral',
  series_efectivas: '8.00',
  nivel: 3,
  zona: 'pectoral',
});

let montado: Montado | undefined;

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-09-27T02:00:00.000Z'));
});

afterEach(() => {
  montado?.desmonta();
  montado = undefined;
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

async function pinta(datos: Dashboard, reducido = true): Promise<HTMLElement> {
  simulaMovimiento(reducido);
  simulaFetch({ 'GET /api/lectura/v1/dashboard': { cuerpo: datos } });
  montado = await monta(<Resumen zona="America/Mexico_City" />);
  return montado.raiz;
}

function regiones(raiz: HTMLElement, cara: string, grupoBase: string): Element[] {
  return [...raiz.querySelectorAll(`svg[data-cara="${cara}"] [data-grupo="${grupoBase}"]`)];
}

describe('Resumen: la figura no calcula', () => {
  it('pinta cada región con el nivel del contrato aunque la cifra diga otra cosa', async () => {
    // 0.00 series pero nivel 5: si el cliente recalculara, pintaría 0.
    const raiz = await pinta(dashboard([grupo({ ...DORSAL, series_efectivas: '0.00', nivel: 5 })]));
    const dorsal = regiones(raiz, 'espalda', 'dorsal');
    expect(dorsal).toHaveLength(2);
    for (const r of dorsal) expect(r.getAttribute('data-nivel')).toBe('5');
  });

  it('la tabla está entera y la figura la cita como su descripción', async () => {
    const raiz = await pinta(dashboard([PECTORAL, DORSAL]));
    const tabla = raiz.querySelector('table#tabla-de-grupos');
    expect(tabla).not.toBeNull();
    const celdas = [...(tabla?.querySelectorAll('td.numero') ?? [])].map((c) => c.textContent);
    expect(celdas).toEqual(['8.00', '12.00']);
    const figura = raiz.querySelector('[role="img"]');
    expect(figura?.getAttribute('aria-describedby')).toBe('tabla-de-grupos');
    expect(figura?.getAttribute('aria-label')).toBe('Mapa muscular, cuerpo completo, frente');
  });

  it('las cifras de la fila de estadísticas son las del contrato, sin sumar nada', async () => {
    const raiz = await pinta(dashboard([PECTORAL, DORSAL]));
    const valores = [...raiz.querySelectorAll('.estadistica-valor')].map((e) => e.textContent);
    expect(valores).toEqual(['14', '3', '2']);
  });

  it('el control de cara cambia aria-pressed, la URL y la clase de giro', async () => {
    const raiz = await pinta(dashboard([DORSAL]), false);
    const espalda = boton(raiz, 'Espalda');
    expect(espalda.getAttribute('aria-pressed')).toBe('false');
    await pulsa(espalda);
    expect(boton(raiz, 'Espalda').getAttribute('aria-pressed')).toBe('true');
    expect(boton(raiz, 'Frente').getAttribute('aria-pressed')).toBe('false');
    expect(window.location.search).toBe('?cara=espalda');
    const interior = raiz.querySelector('[data-testid="figura-interior"]');
    expect(interior?.classList.contains('girada')).toBe(true);
    expect(interior?.classList.contains('animada')).toBe(true);
    expect(raiz.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(
      'Mapa muscular, cuerpo completo, espalda',
    );
  });

  it('«¿Qué quieres ver?» lleva la vista a la URL', async () => {
    const raiz = await pinta(dashboard([DORSAL]));
    const selector = campo(raiz, '¿Qué quieres ver?') as HTMLSelectElement;
    selector.value = 'superior';
    selector.dispatchEvent(new Event('change', { bubbles: true }));
    await asienta();
    expect(window.location.search).toBe('?vista=superior');
    expect(raiz.querySelector('[role="img"]')?.getAttribute('aria-label')).toBe(
      'Mapa muscular, tren superior, frente',
    );
  });

  it('con movimiento reducido no hay clase de animación: la cara cambia sin girar', async () => {
    const raiz = await pinta(dashboard([DORSAL]), true);
    await pulsa(boton(raiz, 'Espalda'));
    const interior = raiz.querySelector('[data-testid="figura-interior"]');
    expect(interior?.classList.contains('animada')).toBe(false);
    expect(interior?.classList.contains('girada')).toBe(true);
    expect(interior?.classList.contains('coloreada')).toBe(true);
  });

  it('los grupos sin zona salen en «Sin lugar en el modelo», con su número', async () => {
    const propio = grupo({ id: 'g-x', nombre: 'Espalda alta', series_efectivas: '3.00', nivel: 1 });
    const raiz = await pinta(dashboard([DORSAL, propio]));
    const texto = textoDe(raiz);
    expect(texto).toContain('Sin lugar en el modelo');
    expect(texto).toContain('Espalda alta · 3.00');
  });

  it('la semana vacía queda en neutro y lo dice; nunca una figura de muestra', async () => {
    const raiz = await pinta(
      dashboard(
        [
          grupo({ ...DORSAL, series_efectivas: '0.00', nivel: 0 }),
          grupo({ ...PECTORAL, series_efectivas: '0.00', nivel: 0 }),
        ],
        {
          estadisticas: { series_efectivas: 0, sesiones: 0, grupos_sin_trabajo: 2 },
        },
      ),
    );
    expect(textoDe(raiz)).toContain('Todavía no hay series efectivas esta semana');
    const pintadas = [...raiz.querySelectorAll('.region')].filter((r) => {
      const n = r.getAttribute('data-nivel');
      return n !== '0' && n !== 'ninguno';
    });
    expect(pintadas).toEqual([]);
  });

  it('declara la frescura, no pendientes: la web no ve la cola del teléfono', async () => {
    const raiz = await pinta(dashboard([DORSAL]));
    expect(textoDe(raiz)).toContain('Última serie recibida: hoy 19:42');
    expect(textoDe(raiz)).not.toMatch(/pendiente/i);
  });

  it('pasar por una fila resalta la región y abre el detalle con la cifra exacta del servidor', async () => {
    const raiz = await pinta(dashboard([DORSAL]));
    await pulsa(boton(raiz, /^Dorsal/));
    const detalle = raiz.querySelector('.detalle-flotante');
    expect(detalle?.textContent).toContain('12.00');
    expect(detalle?.textContent).toContain('Volumen alto');
    for (const r of regiones(raiz, 'espalda', 'dorsal'))
      expect(r.classList.contains('activa')).toBe(true);
  });
});
