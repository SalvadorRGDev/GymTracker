import { isAbsolute, relative, resolve } from 'node:path';
import { leeOrigen } from '../api/servidor-publico.js';

/**
 * Configuración validada al arrancar. Umbral y coeficientes NO son
 * configuración: son dato versionado del usuario (ADR-003).
 */

export interface Configuracion {
  readonly secretoDeSesion: string;
  readonly datosDir: string;
  readonly host: string;
  readonly puerto: number;
  /** `false` = no se confía en ningún proxy. */
  readonly trustProxy: false | string | readonly string[];
  readonly horasDeSesion: number;
  readonly webDir: string | null;
  readonly atajosUrl: string;
  /** Origen https con el que el teléfono alcanza el servidor; `null` = deducirlo al emitir. */
  readonly urlPublica: string | null;
  readonly registro: boolean;
  /** Alta pública desde la web (ADR-020). `false` = sólo `npm run alta`. */
  readonly altaAbierta: boolean;
  /** Tope de cuentas: con el alta abierta, lo que impide llenar el disco. */
  readonly maximoDeCuentas: number;
}

export class ErrorDeConfiguracion extends Error {
  override name = 'ErrorDeConfiguracion';
  constructor(readonly problemas: readonly string[]) {
    super(`Configuración inválida:\n- ${problemas.join('\n- ')}`);
  }
}

type Entorno = Readonly<Record<string, string | undefined>>;

const LOCALES = new Set(['127.0.0.1', '::1', 'localhost']);

function ruta(valor: string, base: string): string {
  return isAbsolute(valor) ? valor : resolve(base, valor);
}

/** ¿`hijo` es `padre` o cuelga de él? Por ruta: no sigue enlaces. */
function contiene(padre: string, hijo: string): boolean {
  const camino = relative(resolve(padre), resolve(hijo));
  return camino === '' || (!camino.startsWith('..') && !isAbsolute(camino));
}

export function leeConfiguracion(entorno: Entorno, base = process.cwd()): Configuracion {
  const problemas: string[] = [];

  const secreto = entorno['SESSION_SECRET'] ?? '';
  if (secreto.length < 32) {
    problemas.push('SESSION_SECRET necesita 32 caracteres o más (openssl rand -hex 32)');
  }

  const host = entorno['HOST']?.trim() || '127.0.0.1';
  const puertoTexto = entorno['PORT']?.trim() || '3000';
  const puerto = Number(puertoTexto);
  if (!/^\d{1,5}$/.test(puertoTexto) || puerto < 1 || puerto > 65535)
    problemas.push('PORT debe ser 1–65535');

  // Detrás del túnel, `request.ip` es la dirección del cliente del túnel: sin
  // confiar en ese proxy, todo internet comparte el cubo del límite de tasa.
  // Suponer `loopback` sólo vale mientras HOST sea local; si se abre, hay que
  // declararlo. Degradar el límite en silencio no es una opción.
  const proxyTexto = entorno['TRUSTED_PROXY']?.trim() ?? '';
  let trustProxy: Configuracion['trustProxy'] = 'loopback';
  if (proxyTexto === '') {
    if (!LOCALES.has(host)) {
      problemas.push(
        `HOST=${host} no es local: declara TRUSTED_PROXY (direcciones del proxy, «loopback» o «none»)`,
      );
    }
  } else if (proxyTexto === 'none') {
    trustProxy = false;
  } else if (proxyTexto === 'true' || proxyTexto === '*') {
    problemas.push('TRUSTED_PROXY no puede confiar en todos: nombra el proxy');
  } else {
    const lista = proxyTexto
      .split(',')
      .map((p) => p.trim())
      .filter((p) => p !== '');
    trustProxy = lista.length === 1 ? (lista[0] ?? 'loopback') : lista;
  }

  const horasTexto = entorno['SESSION_TTL_HOURS']?.trim() || '720';
  const horasDeSesion = Number(horasTexto);
  if (!/^\d{1,4}$/.test(horasTexto) || horasDeSesion < 1 || horasDeSesion > 2160) {
    problemas.push('SESSION_TTL_HOURS debe ser 1–2160 (el máximo absoluto es de 90 días)');
  }

  const webTexto = entorno['WEB_DIR'];
  const webDir = webTexto === '' ? null : ruta(webTexto ?? 'dist/web', base);
  const datosDir = ruta(entorno['DATOS_DIR']?.trim() || 'datos', base);
  // Todo lo que cuelga de WEB_DIR se sirve a quien llegue al túnel: con los
  // datos debajo, eso son los libros y las huellas de cuentas.xlsx.
  if (webDir !== null && contiene(webDir, datosDir)) {
    problemas.push(
      `WEB_DIR (${webDir}) contiene DATOS_DIR: serviría los libros a internet. Apúntalo a dist/web`,
    );
  }

  const atajosUrl = entorno['ATAJOS_URL']?.trim() ?? '';
  if (atajosUrl !== '' && !/^https:\/\/\S+$/.test(atajosUrl)) {
    problemas.push('ATAJOS_URL debe ser una dirección https');
  }

  // La dirección que va en el archivo de credencial de los atajos. Sin ella se
  // toma del navegador que emite, que acierta mientras se emita desde la URL
  // del túnel; declararla quita esa condición.
  const publicaTexto = entorno['URL_PUBLICA']?.trim() ?? '';
  const publica = publicaTexto === '' ? null : leeOrigen(publicaTexto, ['https:']);
  if (publicaTexto !== '' && publica === null) {
    problemas.push('URL_PUBLICA debe ser un origen https sin ruta (https://sigir.ejemplo.ts.net)');
  }

  const altaTexto = entorno['ALTA_ABIERTA']?.trim() || 'no';
  if (altaTexto !== 'si' && altaTexto !== 'no') problemas.push('ALTA_ABIERTA debe ser «si» o «no»');
  const maximoTexto = entorno['MAXIMO_DE_CUENTAS']?.trim() || '20';
  const maximoDeCuentas = Number(maximoTexto);
  if (!/^\d{1,4}$/.test(maximoTexto) || maximoDeCuentas < 1 || maximoDeCuentas > 1000) {
    problemas.push('MAXIMO_DE_CUENTAS debe ser 1–1000');
  }

  if (problemas.length > 0) throw new ErrorDeConfiguracion(problemas);
  return {
    secretoDeSesion: secreto,
    datosDir,
    host,
    puerto,
    trustProxy,
    horasDeSesion,
    webDir,
    atajosUrl,
    urlPublica: publica?.origin ?? null,
    registro: entorno['LOG'] !== 'silencio',
    altaAbierta: altaTexto === 'si',
    maximoDeCuentas,
  };
}
