import { randomUUID } from 'node:crypto';
import type { AlmacenDeCuentas } from '../almacen/acceso.js';
import type { Dispositivo } from '../api/lectura/contrato.js';
import { verificaContrasena } from './contrasena.js';
import { huellaDeCaptura, huellaDeSesion, nuevoToken, pareceToken } from './tokens.js';

/**
 * Sesiones del cliente web y credenciales de captura de los atajos.
 *
 * Dos credenciales, dos hojas y dos funciones de búsqueda: una huella de
 * captura presentada como cookie no encuentra nada en `token_sesion`, y al
 * revés. Con una columna de alcance compartida, olvidar el filtro no fallaría:
 * autenticaría (ADR-009).
 */

export type ConCuentas = <T>(trabajo: (cuentas: AlmacenDeCuentas) => T | Promise<T>) => Promise<T>;

export interface OpcionesDeAutenticacion {
  readonly secreto: string;
  /** Duración deslizante de la sesión web. 720 h = 30 días. */
  readonly horasDeSesion: number;
  readonly reloj: () => Date;
}

export interface SesionResuelta {
  readonly usuarioId: string;
  /** Si se renovó, la cookie se vuelve a emitir con la nueva caducidad. */
  readonly renovada: boolean;
  readonly expiraEn: Date;
}

const HORA = 3_600_000;
const DIA = 24 * HORA;
/** Máximo absoluto desde la emisión, por mucho que se deslice. */
const MAXIMO_DE_SESION = 90 * DIA;
/** La credencial de captura caduca al año, sin deslizamiento. */
const VIDA_DE_CAPTURA = 365 * DIA;
/** Renovar la sesión reescribe `cuentas.xlsx`: como mucho una vez al día. */
const INTERVALO_DE_RENOVACION = DIA;
/** `ultimo_uso_en` con resolución de diez minutos: sirve igual y no escribe en cada serie. */
const INTERVALO_DE_ULTIMO_USO = 10 * 60_000;

export type { Dispositivo };

export class Autenticacion {
  constructor(
    private readonly conCuentas: ConCuentas,
    private readonly opciones: OpcionesDeAutenticacion,
  ) {}

  private get ahora(): Date {
    return this.opciones.reloj();
  }

  /**
   * Correo y contraseña → token. Un correo desconocido y una contraseña mala
   * dan el mismo `null` y tardan lo mismo: el 401 no dice cuál de los dos fue.
   */
  async entra(
    correo: string,
    contrasena: string,
  ): Promise<{ token: string; expiraEn: Date } | null> {
    const normalizado = correo.trim().toLowerCase();
    const usuario = await this.conCuentas((c) => {
      const u = c.lee('usuario').find((x) => x.correo === normalizado);
      return u === undefined ? null : { id: u.id, hash: u.hash_contrasena };
    });
    // Argon2 tarda decenas de milisegundos: fuera de la cola de cuentas.
    const valida = await verificaContrasena(usuario?.hash ?? null, contrasena);
    if (usuario === null || !valida) return null;

    const token = nuevoToken();
    const huella = huellaDeSesion(this.opciones.secreto, token);
    const expiraEn = await this.conCuentas((c) => {
      const ahora = c.ahora;
      // Una sesión caducada se borra al presentarla, pero la de un navegador que
      // no vuelve no se presenta nunca: se limpian aquí, en la misma escritura.
      const caducadas = c
        .lee('token_sesion')
        .filter((t) => Date.parse(t.expira_en) <= ahora.getTime())
        .map((t) => t.id);
      for (const id of caducadas) c.borra('token_sesion', id);
      const expira = new Date(ahora.getTime() + this.opciones.horasDeSesion * HORA);
      c.inserta('token_sesion', {
        id: randomUUID(),
        usuario_id: usuario.id,
        huella,
        emitido_en: ahora.toISOString(),
        expira_en: expira.toISOString(),
        renovado_en: ahora.toISOString(),
      });
      return expira;
    });
    return { token, expiraEn };
  }

  /** Cookie → usuario, deslizando la caducidad. Una sesión caducada se borra al verla. */
  async resuelveSesion(token: string): Promise<SesionResuelta | null> {
    if (!pareceToken(token)) return null;
    const huella = huellaDeSesion(this.opciones.secreto, token);
    return this.conCuentas((c) => {
      const fila = c.lee('token_sesion').find((t) => t.huella === huella);
      if (fila === undefined) return null;
      const ahora = c.ahora.getTime();
      if (Date.parse(fila.expira_en) <= ahora) {
        c.borra('token_sesion', fila.id);
        return null;
      }
      if (ahora - Date.parse(fila.renovado_en) < INTERVALO_DE_RENOVACION) {
        return { usuarioId: fila.usuario_id, renovada: false, expiraEn: new Date(fila.expira_en) };
      }
      const tope = Date.parse(fila.emitido_en) + MAXIMO_DE_SESION;
      const expira = new Date(Math.min(ahora + this.opciones.horasDeSesion * HORA, tope));
      c.actualiza('token_sesion', fila.id, {
        expira_en: expira.toISOString(),
        renovado_en: c.ahora.toISOString(),
      });
      return { usuarioId: fila.usuario_id, renovada: true, expiraEn: expira };
    });
  }

  /** Revocación inmediata: se borra la fila. Idempotente. */
  async sale(token: string): Promise<void> {
    if (!pareceToken(token)) return;
    const huella = huellaDeSesion(this.opciones.secreto, token);
    await this.conCuentas((c) => {
      const fila = c.lee('token_sesion').find((t) => t.huella === huella);
      if (fila !== undefined) c.borra('token_sesion', fila.id);
    });
  }

  /** Portador del atajo → usuario. Anota el último uso, que es lo que delata una credencial filtrada. */
  async resuelveCaptura(token: string): Promise<{ usuarioId: string; huella: string } | null> {
    if (!pareceToken(token)) return null;
    const huella = huellaDeCaptura(this.opciones.secreto, token);
    return this.conCuentas((c) => {
      const fila = c.lee('token_captura').find((t) => t.huella === huella);
      if (fila === undefined) return null;
      const ahora = c.ahora.getTime();
      if (Date.parse(fila.expira_en) <= ahora) return null;
      if (
        fila.ultimo_uso_en === null ||
        ahora - Date.parse(fila.ultimo_uso_en) >= INTERVALO_DE_ULTIMO_USO
      ) {
        c.actualiza('token_captura', fila.id, { ultimo_uso_en: c.ahora.toISOString() });
      }
      return { usuarioId: fila.usuario_id, huella };
    });
  }

  /** Se emite desde la web y se muestra UNA vez: sólo se guarda su huella. */
  async emiteCaptura(
    usuarioId: string,
    nombre: string,
  ): Promise<{ dispositivo: Dispositivo; token: string }> {
    const token = nuevoToken();
    const huella = huellaDeCaptura(this.opciones.secreto, token);
    const dispositivo = await this.conCuentas((c) => {
      const ahora = c.ahora;
      const fila = c.inserta('token_captura', {
        id: randomUUID(),
        usuario_id: usuarioId,
        huella,
        nombre,
        emitido_en: ahora.toISOString(),
        expira_en: new Date(ahora.getTime() + VIDA_DE_CAPTURA).toISOString(),
        ultimo_uso_en: null,
      });
      return comoDispositivo(fila);
    });
    return { dispositivo, token };
  }

  async listaCapturas(usuarioId: string): Promise<Dispositivo[]> {
    return this.conCuentas((c) =>
      c
        .lee('token_captura')
        .filter((t) => t.usuario_id === usuarioId)
        .map(comoDispositivo)
        .sort((a, b) => (a.emitido_en < b.emitido_en ? 1 : -1)),
    );
  }

  /** `false` si no existe o es de otra persona: la ruta contesta 404 en los dos casos. */
  async revocaCaptura(usuarioId: string, id: string): Promise<boolean> {
    return this.conCuentas((c) => {
      const fila = c.lee('token_captura').find((t) => t.id === id && t.usuario_id === usuarioId);
      if (fila === undefined) return false;
      c.borra('token_captura', fila.id);
      return true;
    });
  }

  /** Datos de la cuenta que la exportación puede llevar: nada de hashes ni huellas. */
  async cuenta(
    usuarioId: string,
  ): Promise<{ correo: string; zona_horaria: string; creado_en: string } | null> {
    return this.conCuentas((c) => {
      const u = c.lee('usuario').find((x) => x.id === usuarioId);
      return u === undefined
        ? null
        : { correo: u.correo, zona_horaria: u.zona_horaria, creado_en: u.creado_en };
    });
  }
}

function comoDispositivo(fila: {
  id: string;
  nombre: string;
  emitido_en: string;
  expira_en: string;
  ultimo_uso_en: string | null;
}): Dispositivo {
  return {
    id: fila.id,
    nombre: fila.nombre,
    emitido_en: fila.emitido_en,
    expira_en: fila.expira_en,
    ultimo_uso_en: fila.ultimo_uso_en,
  };
}
