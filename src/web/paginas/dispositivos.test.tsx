import { afterEach, describe, expect, it, vi } from 'vitest';
import type { DispositivoEmitido } from '../../api/lectura/contrato';
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
import { Dispositivos } from './dispositivos';

const CREDENCIAL = 'k'.repeat(43);

function emitido(servidor: DispositivoEmitido['servidor']): DispositivoEmitido {
  return {
    dispositivo: {
      id: 'd1',
      nombre: 'iPhone de Ana',
      emitido_en: '2026-09-26T18:00:00.000Z',
      expira_en: '2027-09-26T18:00:00.000Z',
      ultimo_uso_en: null,
    },
    credencial: CREDENCIAL,
    archivo: {
      nombre: 'credencial.json',
      contenido: `${JSON.stringify({ servidor: servidor.url, portador: CREDENCIAL }, null, 2)}\n`,
    },
    servidor,
  };
}

let montado: Montado | undefined;

afterEach(() => {
  montado?.desmonta();
  montado = undefined;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function emite(servidor: DispositivoEmitido['servidor']) {
  simulaFetch({
    'GET /api/lectura/v1/dispositivos': { cuerpo: { dispositivos: [] } },
    'POST /api/lectura/v1/dispositivos': { estado: 201, cuerpo: emitido(servidor) },
  });
  montado = await monta(<Dispositivos zona="America/Mexico_City" />);
  await escribe(campo(montado.raiz, 'Nombre del dispositivo') as HTMLInputElement, 'iPhone de Ana');
  await pulsa(boton(montado.raiz, 'Emitir'));
  return montado.raiz;
}

describe('Dispositivos', () => {
  it('la credencial se ve una vez, con el archivo que apunta a la dirección del servidor', async () => {
    const raiz = await emite({ url: 'https://gymtracker.ejemplo.ts.net', aviso: null });
    expect(textoDe(raiz)).toContain('Ésta es la única vez que la verás');
    expect(raiz.querySelector('pre')?.textContent).toContain(
      '"servidor": "https://gymtracker.ejemplo.ts.net"',
    );
    expect(textoDe(raiz)).not.toContain('URL_PUBLICA');
    await pulsa(boton(raiz, 'Ya la guardé'));
    expect(textoDe(raiz)).not.toContain(CREDENCIAL);
  });

  it('si el teléfono no va a alcanzar la dirección, lo dice con el texto del servidor', async () => {
    const aviso =
      '«http://127.0.0.1:3000» sólo existe en este ordenador: el teléfono no la alcanzará.';
    const raiz = await emite({ url: 'http://127.0.0.1:3000', aviso });
    expect(textoDe(raiz)).toContain(aviso);
  });
});
