import { randomUUID } from 'node:crypto';
import type { FastifyInstance, InjectOptions, LightMyRequestResponse } from 'fastify';
import type { Deposito } from '../../almacen/acceso.js';
import { depositoDePrueba, RelojDePrueba } from '../../almacen/prueba/temporal.js';
import { hashDeContrasena } from '../../auth/contrasena.js';
import { Autenticacion } from '../../auth/sesiones.js';
import { construyeApp } from '../app.js';

/**
 * Un servidor entero sobre un directorio temporal, sin red: `app.inject`.
 * Nada externo: ni base, ni servicios, ni variables.
 */

export const CONTRASENA = 'contraseña-de-prueba-larga';
const SECRETO = 'secreto-de-prueba-con-mas-de-treinta-y-dos-caracteres';

export interface Cuenta {
  readonly id: string;
  readonly correo: string;
  readonly cookie: string;
}

export interface ServidorDePrueba {
  readonly app: FastifyInstance;
  readonly deposito: Deposito;
  readonly reloj: RelojDePrueba;
  pide(opciones: InjectOptions): Promise<LightMyRequestResponse>;
  cuenta(correo: string, opciones?: { zonaHoraria?: string; umbralRir?: number }): Promise<Cuenta>;
  entra(correo: string, contrasena?: string): Promise<LightMyRequestResponse>;
  portador(cuenta: Cuenta, nombre?: string): Promise<string>;
  /** Importa el catálogo base entero (perfil por omisión) para una cuenta. */
  importaBase(cuenta: Cuenta): Promise<void>;
  limpia(): Promise<void>;
}

let hashCompartido: Promise<string> | null = null;

export async function servidorDePrueba(
  opciones: {
    inicio?: string;
    trustProxy?: false | string;
    webDir?: string | null;
    urlPublica?: string | null;
    /** Tope de cuentas del alta pública; sin él, el alta está cerrada. */
    maximoDeCuentas?: number;
  } = {},
): Promise<ServidorDePrueba> {
  const reloj = new RelojDePrueba(opciones.inicio);
  const { deposito, limpia } = await depositoDePrueba(reloj);
  const autenticacion = new Autenticacion((t) => deposito.conCuentas(t), {
    secreto: SECRETO,
    horasDeSesion: 720,
    reloj: reloj.lee,
  });
  const app = await construyeApp(
    {
      autenticacion,
      conAlmacenDeUsuario: (identidad, trabajo) => deposito.conAlmacenDeUsuario(identidad, trabajo),
      reloj: reloj.lee,
      alta:
        opciones.maximoDeCuentas === undefined
          ? null
          : {
              maximo: opciones.maximoDeCuentas,
              cuentas: () => deposito.conCuentas((c) => c.lee('usuario').length),
              crea: (datos) => deposito.creaCuenta(datos),
            },
    },
    {
      trustProxy: opciones.trustProxy ?? 'loopback',
      atajosUrl: 'https://ejemplo.invalid/atajos',
      urlPublica: opciones.urlPublica ?? null,
      webDir: opciones.webDir ?? null,
      registro: false,
    },
  );

  const pide = (o: InjectOptions) => app.inject(o);

  const entra = (correo: string, contrasena = CONTRASENA) =>
    pide({ method: 'POST', url: '/api/sesion/v1/entrar', payload: { correo, contrasena } });

  return {
    app,
    deposito,
    reloj,
    pide,
    entra,
    async cuenta(correo, extra = {}) {
      hashCompartido ??= hashDeContrasena(CONTRASENA);
      const id = await deposito.creaCuenta({
        correo,
        hashContrasena: await hashCompartido,
        zonaHoraria: extra.zonaHoraria ?? 'America/Mexico_City',
        umbralRir: extra.umbralRir ?? 4,
        vigenteDesde: '2000-01-01',
      });
      const respuesta = await entra(correo);
      const cookie = String(respuesta.headers['set-cookie'] ?? '').split(';')[0] ?? '';
      if (respuesta.statusCode !== 204 || cookie === '')
        throw new Error(`No entra ${correo}: ${respuesta.body}`);
      return { id, correo, cookie };
    },
    async portador(cuenta, nombre = 'iPhone de prueba') {
      const respuesta = await pide({
        method: 'POST',
        url: '/api/lectura/v1/dispositivos',
        headers: { cookie: cuenta.cookie },
        payload: { nombre },
      });
      if (respuesta.statusCode !== 201) throw new Error(respuesta.body);
      return (respuesta.json() as { credencial: string }).credencial;
    },
    async importaBase(cuenta) {
      const base = await pide({
        method: 'GET',
        url: '/api/lectura/v1/catalogo/base',
        headers: { cookie: cuenta.cookie },
      });
      const datos = base.json() as {
        grupos: { id: string }[];
        ejercicios_por_perfil: Record<string, string[]>;
      };
      const respuesta = await pide({
        method: 'POST',
        url: '/api/lectura/v1/catalogo/importa',
        headers: { cookie: cuenta.cookie },
        payload: {
          grupos: datos.grupos.map((g) => g.id),
          ejercicios: datos.ejercicios_por_perfil['gimnasio-completo'] ?? [],
        },
      });
      if (respuesta.statusCode !== 200) throw new Error(respuesta.body);
    },
    async limpia() {
      await app.close();
      await limpia();
    },
  };
}

/** Un cuerpo de serie para el atajo, con claves nuevas salvo que se pasen. */
export function serieDeAtajo(opciones: {
  ejercicio?: string;
  sesion?: string;
  clave?: string;
  rir?: number | null;
  calentamiento?: boolean;
  /** En libras (ADR-023). */
  carga?: string | number;
  /** Como un atajo anterior a las libras: la carga en `carga_kg`. */
  kilos?: string | number;
  repeticiones?: number;
  iniciada?: string;
  realizada?: string;
}) {
  const calentamiento = opciones.calentamiento ?? false;
  return {
    sesion: {
      clave: opciones.sesion ?? randomUUID(),
      iniciada_en: opciones.iniciada ?? '2026-09-26T17:00:00Z',
    },
    serie: {
      clave: opciones.clave ?? randomUUID(),
      ejercicio: opciones.ejercicio ?? 'Press banca',
      repeticiones: opciones.repeticiones ?? 10,
      ...(opciones.kilos === undefined
        ? { carga_lb: opciones.carga ?? '135.00' }
        : { carga_kg: opciones.kilos }),
      ...(calentamiento ? {} : { rir: opciones.rir === undefined ? 2 : opciones.rir }),
      calentamiento,
      realizada_en: opciones.realizada ?? opciones.iniciada ?? '2026-09-26T17:05:00Z',
    },
  };
}
