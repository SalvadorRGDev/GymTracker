import { type ComponentChild, render } from 'preact';
import { act } from 'preact/test-utils';
import { vi } from 'vitest';

/**
 * Arnés de las pruebas del cliente: jsdom, `fetch` simulado por ruta y
 * búsquedas por lo que ve o alcanza un lector de pantalla. Sin instantáneas.
 */

export interface Montado {
  readonly raiz: HTMLElement;
  desmonta(): void;
}

export async function asienta(veces = 6): Promise<void> {
  for (let i = 0; i < veces; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
}

export async function monta(vnodo: ComponentChild): Promise<Montado> {
  const raiz = document.createElement('div');
  document.body.appendChild(raiz);
  await act(async () => {
    render(vnodo, raiz);
  });
  await asienta();
  return {
    raiz,
    desmonta: () => {
      render(null, raiz);
      raiz.remove();
    },
  };
}

type Respuesta = { estado?: number; cuerpo?: unknown };
type Manejador = (cuerpo: unknown, url: string) => Respuesta;

/** `fetch` falso: la clave es «MÉTODO /ruta» sin consulta. Registra lo que se pidió. */
export function simulaFetch(rutas: Record<string, Manejador | Respuesta>) {
  const llamadas: { metodo: string; url: string; cuerpo: unknown }[] = [];
  const falso = vi.fn(async (entrada: string | URL, init?: RequestInit) => {
    const url = String(entrada);
    const metodo = init?.method ?? 'GET';
    const cuerpo = typeof init?.body === 'string' ? JSON.parse(init.body) : undefined;
    llamadas.push({ metodo, url, cuerpo });
    const clave = `${metodo} ${url.split('?')[0]}`;
    const manejo = rutas[clave];
    if (manejo === undefined)
      return new Response(JSON.stringify({ mensaje: `sin simular: ${clave}` }), { status: 404 });
    const r = typeof manejo === 'function' ? manejo(cuerpo, url) : manejo;
    const estado = r.estado ?? 200;
    return new Response(estado === 204 ? null : JSON.stringify(r.cuerpo ?? {}), {
      status: estado,
      headers: { 'content-type': 'application/json' },
    });
  });
  vi.stubGlobal('fetch', falso);
  return { llamadas, falso };
}

export function textoDe(raiz: HTMLElement): string {
  return (raiz.textContent ?? '').replace(/\s+/g, ' ');
}

export function boton(raiz: HTMLElement, nombre: string | RegExp): HTMLButtonElement {
  const todos = [...raiz.querySelectorAll('button')];
  const encontrado = todos.find((b) => {
    const accesible = (b.getAttribute('aria-label') ?? b.textContent ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    return typeof nombre === 'string' ? accesible === nombre : nombre.test(accesible);
  });
  if (encontrado === undefined) {
    throw new Error(
      `No hay botón «${String(nombre)}». Hay: ${todos.map((b) => b.textContent?.trim()).join(' | ')}`,
    );
  }
  return encontrado;
}

export function campo(raiz: HTMLElement, etiqueta: string): HTMLInputElement | HTMLSelectElement {
  const label = [...raiz.querySelectorAll('label')].find((l) => l.textContent?.trim() === etiqueta);
  const id = label?.getAttribute('for');
  const elemento =
    id === null || id === undefined ? null : raiz.querySelector(`#${CSS.escape(id)}`);
  if (elemento === null) throw new Error(`No hay campo con etiqueta «${etiqueta}»`);
  return elemento as HTMLInputElement | HTMLSelectElement;
}

export async function pulsa(elemento: HTMLElement): Promise<void> {
  await act(async () => {
    elemento.click();
  });
  await asienta();
}

export async function escribe(elemento: HTMLInputElement, valor: string): Promise<void> {
  await act(async () => {
    elemento.value = valor;
    elemento.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await asienta(2);
}

/** `matchMedia` que contesta a `prefers-reduced-motion`. jsdom no lo trae. */
export function simulaMovimiento(reducido: boolean): void {
  vi.stubGlobal(
    'matchMedia',
    (consulta: string) =>
      ({
        matches: consulta.includes('reduce') ? reducido : false,
        media: consulta,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
      }) as unknown as MediaQueryList,
  );
}
