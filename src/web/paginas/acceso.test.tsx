import { afterEach, describe, expect, it, vi } from 'vitest';
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
import { Acceso } from './acceso';

let montado: Montado | undefined;

afterEach(() => {
  montado?.desmonta();
  montado = undefined;
  vi.unstubAllGlobals();
});

async function pinta(abierta: boolean) {
  const red = simulaFetch({
    'GET /api/sesion/v1/alta': { cuerpo: { abierta } },
    'POST /api/sesion/v1/alta': { estado: 201, cuerpo: { correo: 'nuevo@ejemplo.com' } },
    'GET /api/sesion/v1/actual': { estado: 401, cuerpo: {} },
  });
  montado = await monta(<Acceso />);
  return { raiz: montado.raiz, red };
}

describe('Acceso: crear cuenta (ADR-020)', () => {
  it('con el alta cerrada no se ofrece, y dice a quién pedirla', async () => {
    const { raiz } = await pinta(false);
    expect(() => boton(raiz, 'Crear una')).toThrow();
    expect(textoDe(raiz)).toContain('pídesela a quien administra este servidor');
  });

  it('con el alta abierta pide repetir la contraseña y manda la zona del navegador', async () => {
    const { raiz, red } = await pinta(true);
    await pulsa(boton(raiz, 'Crear una'));
    await escribe(campo(raiz, 'Correo') as HTMLInputElement, 'nuevo@ejemplo.com');
    await escribe(campo(raiz, 'Contraseña') as HTMLInputElement, 'una-contraseña-larga');
    await escribe(campo(raiz, 'Repite la contraseña') as HTMLInputElement, 'otra-distinta-larga');
    raiz.querySelector('form')?.requestSubmit();
    await pulsa(raiz);
    expect(textoDe(raiz)).toContain('Las dos contraseñas no coinciden');
    expect(red.llamadas.some((l) => l.metodo === 'POST')).toBe(false);

    await escribe(campo(raiz, 'Repite la contraseña') as HTMLInputElement, 'una-contraseña-larga');
    raiz.querySelector('form')?.requestSubmit();
    await pulsa(raiz);
    const envio = red.llamadas.find((l) => l.metodo === 'POST');
    expect(envio?.cuerpo).toMatchObject({
      correo: 'nuevo@ejemplo.com',
      contrasena: 'una-contraseña-larga',
      zona_horaria: expect.any(String),
    });
  });
});
