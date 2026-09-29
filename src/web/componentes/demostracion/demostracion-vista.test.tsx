import { afterEach, describe, expect, it, vi } from 'vitest';
import { type Montado, monta, simulaMovimiento } from '../../prueba/utiles';
import { Demostracion } from './demostracion';
import { ejemploDe } from './ejemplos';

/**
 * La animación es la tercera excepción de movimiento (docs/10): un bucle con
 * `requestAnimationFrame` que sólo corre con `prefers-reduced-motion:
 * no-preference`. Con movimiento reducido la figura se queda quieta y enseña a
 * la vez el principio (en tenue) y el final del recorrido.
 */

let montado: Montado | undefined;

afterEach(() => {
  montado?.desmonta();
  montado = undefined;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const PRESS = ejemploDe('press-banca');

describe('Demostración', () => {
  it('con movimiento reducido no anima: dibuja la partida en tenue y la llegada encima', async () => {
    simulaMovimiento(true);
    const pide = vi.fn(() => 1);
    vi.stubGlobal('requestAnimationFrame', pide);
    if (PRESS === null) throw new Error('press-banca sin figura');
    montado = await monta(<Demostracion movimiento={PRESS.movimiento} titulo={PRESS.titulo} />);
    const figura = montado.raiz.querySelector('svg[role="img"]');
    expect(figura?.getAttribute('aria-label')).toBe(
      'Figura de press en banco plano con barra: en tenue, la posición de partida; encima, la de llegada',
    );
    expect(montado.raiz.querySelector('[data-pose="partida"]')).not.toBeNull();
    expect(montado.raiz.querySelector('[data-pose="llegada"]')).not.toBeNull();
    expect(pide).not.toHaveBeenCalled();
  });

  it('una postura que se aguanta no tiene partida que enseñar', async () => {
    simulaMovimiento(true);
    const plancha = ejemploDe('plancha');
    if (plancha === null) throw new Error('plancha sin figura');
    montado = await monta(<Demostracion movimiento={plancha.movimiento} titulo={plancha.titulo} />);
    expect(montado.raiz.querySelector('svg')?.getAttribute('aria-label')).toBe(
      'Figura de plancha sobre antebrazos',
    );
    expect(montado.raiz.querySelector('[data-pose="partida"]')).toBeNull();
  });

  it('con movimiento permitido anima, y al desmontarse deja de pedir fotogramas', async () => {
    simulaMovimiento(false);
    const pide = vi.fn(() => 7);
    const cancela = vi.fn();
    vi.stubGlobal('requestAnimationFrame', pide);
    vi.stubGlobal('cancelAnimationFrame', cancela);
    if (PRESS === null) throw new Error('press-banca sin figura');
    montado = await monta(<Demostracion movimiento={PRESS.movimiento} titulo={PRESS.titulo} />);
    expect(montado.raiz.querySelector('svg')?.getAttribute('aria-label')).toBe(
      'Animación de press en banco plano con barra',
    );
    expect(pide).toHaveBeenCalled();
    montado.desmonta();
    montado = undefined;
    expect(cancela).toHaveBeenCalledWith(7);
  });
});
