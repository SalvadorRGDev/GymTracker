import { componeServidor } from './compone.js';
import { ErrorDeConfiguracion, leeConfiguracion } from './configuracion.js';

/**
 * `npm start`. Un solo proceso sirve la API y el cliente (ADR-011) y escucha
 * sólo en 127.0.0.1: quien lo publica es el túnel.
 *
 * Antes de escuchar carga y valida el almacén entero: un archivo inválido no
 * arranca, y el error dice hoja, fila y columna.
 */
async function principal(): Promise<void> {
  const configuracion = leeConfiguracion(process.env);
  const { app, deposito } = await componeServidor(configuracion);
  const resumen = await deposito.verifica();
  if (resumen.huerfanos.length > 0) {
    console.warn(
      `Aviso: libros sin cuenta en ${configuracion.datosDir}: ${resumen.huerfanos.join(', ')}`,
    );
  }

  const cierra = async (senal: string) => {
    app.log.info({ senal }, 'cerrando');
    await app.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void cierra('SIGINT'));
  process.once('SIGTERM', () => void cierra('SIGTERM'));

  await app.listen({ host: configuracion.host, port: configuracion.puerto });
  console.log(
    `SIGIR escuchando en http://${configuracion.host}:${configuracion.puerto} · propietarios=${resumen.propietarios} sesiones=${resumen.sesiones}${
      configuracion.webDir === null ? ' · sin cliente (WEB_DIR vacío)' : ''
    }`,
  );
}

principal().catch((error: unknown) => {
  if (error instanceof ErrorDeConfiguracion) console.error(error.message);
  else if (error instanceof Error) console.error(`No arranca: ${error.message}`);
  else console.error('No arranca');
  process.exit(1);
});
