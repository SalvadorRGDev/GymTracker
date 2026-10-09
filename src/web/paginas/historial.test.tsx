import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Historial as DatosDeHistorial } from '../../api/lectura/contrato';
import { type Montado, monta, simulaFetch, textoDe } from '../prueba/utiles';
import { Historial } from './historial';

const DATOS: DatosDeHistorial = {
  sesiones: [
    {
      id: 's1',
      fecha_logica: '2026-09-07',
      iniciada_en: '2026-09-08T05:50:00.000Z',
      finalizada_en: null,
      fecha_por_confirmar: true,
      origen: 'captura',
      series: [
        {
          id: 'x1',
          orden: 1,
          ejercicio: 'Sentadilla',
          repeticiones: 8,
          carga_lb: '60.00',
          rir: null,
          es_calentamiento: true,
          realizada_en: '2026-09-08T05:52:00.000Z',
        },
        {
          id: 'x2',
          orden: 2,
          ejercicio: 'Sentadilla',
          repeticiones: 5,
          carga_lb: '100.5',
          rir: 0,
          es_calentamiento: false,
          realizada_en: '2026-09-08T06:15:00.000Z',
        },
      ],
    },
  ],
};

let montado: Montado | undefined;

afterEach(() => {
  montado?.desmonta();
  montado = undefined;
  vi.unstubAllGlobals();
});

async function pinta() {
  simulaFetch({ 'GET /api/lectura/v1/historial': { cuerpo: DATOS } });
  montado = await monta(<Historial zona="America/Mexico_City" />);
  return montado.raiz;
}

function celdas(raiz: HTMLElement, fila: number): string[] {
  const tr = raiz.querySelectorAll('tbody tr')[fila];
  return [...(tr?.querySelectorAll('td') ?? [])].map((td) => (td.textContent ?? '').trim());
}

describe('Historial: el registro, no un resumen', () => {
  it('la fecha lógica no pasa por Date: el 7 es el 7, aunque la sesión empezara el 8 en UTC', async () => {
    const raiz = await pinta();
    expect(raiz.querySelector('h3')?.textContent).toMatch(/^lunes 7 de septiembre/);
  });

  it('un RIR ausente es «—», nunca un cero; y el cero del fallo se enseña como cero', async () => {
    const raiz = await pinta();
    expect(celdas(raiz, 0)[4]).toBe('—');
    expect(celdas(raiz, 1)[4]).toBe('0');
  });

  it('el calentamiento se marca y se conserva; la carga se enseña como llegó', async () => {
    const raiz = await pinta();
    expect(celdas(raiz, 0)[1]).toContain('Calentamiento');
    expect(celdas(raiz, 1)[3]).toBe('100.5 lb');
  });

  it('una sesión sin cerrar se dice sin cerrar y la fecha por confirmar se ve', async () => {
    const raiz = await pinta();
    const texto = textoDe(raiz);
    expect(texto).toContain('desde las 23:50 · sin cerrar');
    expect(texto).toContain('Fecha por confirmar');
    expect(texto).toContain('Atajo');
  });

  it('no declara frescura: el historial no agrega', async () => {
    const raiz = await pinta();
    expect(textoDe(raiz)).not.toContain('Última serie recibida');
  });
});
