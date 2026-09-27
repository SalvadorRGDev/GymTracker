import { resolve } from 'node:path';
import { Deposito } from '../almacen/acceso.js';

/**
 * `npm run verifica -- datos`: carga cuentas y cada libro, valida celdas e
 * invariantes, y no escribe NADA. Es lo que hay que correr después de editar
 * un Excel a mano, y lo que usa la prueba de restauración.
 */
async function principal(): Promise<void> {
  const directorio = resolve(process.argv[2] ?? process.env['DATOS_DIR'] ?? 'datos');
  const deposito = await Deposito.abre({ directorio, crear: false });
  const resumen = await deposito.verifica();
  console.log(
    `propietarios=${resumen.propietarios} sesiones=${resumen.sesiones} series=${resumen.series}`,
  );
  if (resumen.huerfanos.length > 0) console.log(`huerfanos=${resumen.huerfanos.join(',')}`);
}

principal().catch((error: unknown) => {
  const mensaje = error instanceof Error ? error.message : 'Error desconocido';
  console.error(`Almacén inválido: ${mensaje}`);
  process.exit(1);
});
