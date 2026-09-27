import type { FastifyRequest } from 'fastify';

/**
 * A dónde apuntará el atajo: la dirección que va en `credencial.json`.
 *
 * El esquema y el `Host` de la petición no bastan. Detrás de un túnel que
 * reescribe `Host` al del origen sin mandar `X-Forwarded-Host`, son
 * `http://127.0.0.1:3000`, que el teléfono no alcanza, y el fallo no se ve
 * hasta que el atajo «Configurar» no conecta. De ahí el orden:
 *
 * 1. `URL_PUBLICA`, si el servidor la declara;
 * 2. el `Origin` del navegador que emite: la dirección que el usuario tiene
 *    delante, que pone el navegador y ningún script puede cambiar;
 * 3. esquema y `Host` de la petición, con `X-Forwarded-*` sólo si el proxy es
 *    de confianza, como todo lo demás.
 *
 * Una dirección que el teléfono no va a poder usar se dice al emitir.
 */

export interface ServidorPublico {
  readonly url: string;
  readonly aviso: string | null;
}

/** Un origen —esquema, anfitrión y puerto, nada más— o `null`. */
export function leeOrigen(texto: string, esquemas: readonly ('http:' | 'https:')[]): URL | null {
  let url: URL;
  try {
    url = new URL(texto);
  } catch {
    return null;
  }
  const esquemaAdmitido = (esquemas as readonly string[]).includes(url.protocol);
  const soloOrigen =
    url.username === '' &&
    url.password === '' &&
    url.pathname === '/' &&
    url.search === '' &&
    url.hash === '';
  return esquemaAdmitido && soloOrigen ? url : null;
}

function esLocal(anfitrion: string): boolean {
  return (
    anfitrion === 'localhost' ||
    anfitrion.endsWith('.localhost') ||
    anfitrion === '[::1]' ||
    /^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(anfitrion)
  );
}

const REMEDIO =
  'Abre esta página desde la dirección https del túnel y emite otra (y revoca ésta), ' +
  'o declara URL_PUBLICA en el servidor.';

function aviso(url: URL): string | null {
  if (esLocal(url.hostname)) {
    return `«${url.origin}» sólo existe en este ordenador: el teléfono no la alcanzará. ${REMEDIO}`;
  }
  if (url.protocol !== 'https:') {
    return `«${url.origin}» no es https: el atajo mandaría la credencial sin cifrar. ${REMEDIO}`;
  }
  return null;
}

export function servidorPublico(
  request: FastifyRequest,
  urlPublica: string | null,
): ServidorPublico {
  const cabecera = request.headers.origin;
  const elegido =
    (urlPublica === null ? null : leeOrigen(urlPublica, ['https:'])) ??
    (typeof cabecera === 'string' ? leeOrigen(cabecera, ['http:', 'https:']) : null) ??
    leeOrigen(`${request.protocol}://${request.host}`, ['http:', 'https:']);
  if (elegido === null) {
    // Un `Host` que ni siquiera forma una dirección: no hay nada que ofrecer.
    return {
      url: '',
      aviso: 'El servidor no sabe su propia dirección: declara URL_PUBLICA y emite otra.',
    };
  }
  return { url: elegido.origin, aviso: aviso(elegido) };
}
