import type { FastifyInstance } from 'fastify';
import { Deposito } from '../almacen/acceso.js';
import { construyeApp } from '../api/app.js';
import { Autenticacion } from '../auth/sesiones.js';
import type { Configuracion } from './configuracion.js';

/**
 * El único sitio donde se construye el depósito. A la aplicación le llegan
 * funciones enlazadas, no el depósito: ninguna ruta puede nombrar un archivo.
 */
export async function componeServidor(
  configuracion: Configuracion,
  reloj: () => Date = () => new Date(),
): Promise<{ app: FastifyInstance; deposito: Deposito }> {
  const deposito = await Deposito.abre({ directorio: configuracion.datosDir, reloj });
  const autenticacion = new Autenticacion((trabajo) => deposito.conCuentas(trabajo), {
    secreto: configuracion.secretoDeSesion,
    horasDeSesion: configuracion.horasDeSesion,
    reloj,
  });
  const app = await construyeApp(
    {
      autenticacion,
      conAlmacenDeUsuario: (identidad, trabajo) => deposito.conAlmacenDeUsuario(identidad, trabajo),
      reloj,
      alta: configuracion.altaAbierta
        ? {
            maximo: configuracion.maximoDeCuentas,
            cuentas: () => deposito.conCuentas((c) => c.lee('usuario').length),
            crea: (datos) => deposito.creaCuenta(datos),
          }
        : null,
    },
    {
      trustProxy: configuracion.trustProxy,
      atajosUrl: configuracion.atajosUrl,
      urlPublica: configuracion.urlPublica,
      webDir: configuracion.webDir,
      registro: configuracion.registro,
    },
  );
  return { app, deposito };
}
