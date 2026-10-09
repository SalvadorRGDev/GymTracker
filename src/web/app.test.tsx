import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from './app';
import { fijaSesionParaPruebas } from './estado/sesion';
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
} from './prueba/utiles';

let montado: Montado | undefined;

beforeEach(() => {
  window.history.replaceState(null, '', '/');
  fijaSesionParaPruebas({ tipo: 'comprobando' });
});

afterEach(() => {
  montado?.desmonta();
  montado = undefined;
  vi.unstubAllGlobals();
});

describe('la sesión', () => {
  it('sin sesión se ve el acceso, y el error es el texto del servidor', async () => {
    simulaFetch({
      'GET /api/sesion/v1/actual': {
        estado: 401,
        cuerpo: { codigo: 'sin-sesion', mensaje: 'Hace falta iniciar sesión' },
      },
      'POST /api/sesion/v1/entrar': {
        estado: 401,
        cuerpo: { codigo: 'acceso', mensaje: 'Correo o contraseña incorrectos' },
      },
    });
    montado = await monta(<App />);
    const raiz = montado.raiz;
    expect(textoDe(raiz)).toContain('Cuánto trabajó cada músculo esta semana');
    await escribe(campo(raiz, 'Correo') as HTMLInputElement, 'ana@ejemplo.com');
    await escribe(campo(raiz, 'Contraseña') as HTMLInputElement, 'mala');
    const form = raiz.querySelector('form');
    form?.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await asienta();
    expect(textoDe(raiz)).toContain('Correo o contraseña incorrectos');
  });

  it('cualquier 401 de un recurso devuelve la aplicación al acceso', async () => {
    simulaFetch({
      'GET /api/sesion/v1/actual': {
        cuerpo: { correo: 'ana@ejemplo.com', zona_horaria: 'America/Mexico_City' },
      },
      'GET /api/lectura/v1/dashboard': {
        estado: 401,
        cuerpo: { codigo: 'sin-sesion', mensaje: 'Hace falta iniciar sesión' },
      },
    });
    montado = await monta(<App />);
    expect(textoDe(montado.raiz)).toContain('Cuánto trabajó cada músculo esta semana');
    expect(montado.raiz.querySelector('#titulo-tabla')).toBeNull();
    expect(montado.raiz.querySelector('nav[aria-label="Secciones"]')).toBeNull();
  });

  it('lo primero que alcanza el teclado es «Saltar al contenido», y lleva el foco allí', async () => {
    simulaFetch({
      'GET /api/sesion/v1/actual': {
        cuerpo: { correo: 'ana@ejemplo.com', zona_horaria: 'America/Mexico_City' },
      },
      'GET /api/lectura/v1/historial': {
        cuerpo: { pagina: 1, paginas: 1, total: 0, por_pagina: 10, sesiones: [] },
      },
    });
    window.history.replaceState(null, '', '/historial');
    montado = await monta(<App />);
    const enfocables = montado.raiz.querySelectorAll<HTMLElement>(
      'a[href], button, input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const primero = enfocables[0];
    expect(primero?.textContent?.trim()).toBe('Saltar al contenido');
    await pulsa(primero as HTMLElement);
    expect(document.activeElement?.id).toBe('contenido');
    expect(window.location.pathname + window.location.hash).toBe('/historial');
  });

  it('con sesión, la navegación marca la sección con pastilla y aria-current', async () => {
    simulaFetch({
      'GET /api/sesion/v1/actual': {
        cuerpo: { correo: 'ana@ejemplo.com', zona_horaria: 'America/Mexico_City' },
      },
      'GET /api/lectura/v1/historial': {
        cuerpo: { pagina: 1, paginas: 1, total: 0, por_pagina: 10, sesiones: [] },
      },
      'POST /api/sesion/v1/salir': { estado: 204 },
    });
    window.history.replaceState(null, '', '/historial');
    montado = await monta(<App />);
    const activa = montado.raiz.querySelector('nav a[aria-current="page"]');
    expect(activa?.textContent).toContain('Historial');
    expect(document.title).toBe('Historial · SIGIR');
    expect(textoDe(montado.raiz)).toContain('Todavía no hay sesiones');
    await pulsa(boton(montado.raiz, 'Salir'));
    expect(textoDe(montado.raiz)).toContain('Cuánto trabajó cada músculo esta semana');
  });
});
