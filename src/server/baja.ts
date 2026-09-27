import { resolve } from 'node:path';
import { createInterface } from 'node:readline/promises';
import { Deposito } from '../almacen/acceso.js';

/**
 * `npm run baja -- correo@ejemplo.com` (LFPDPPP, `docs/11-privacidad.md`).
 *
 * Borra la cuenta de verdad: su libro, sus filas de `cuentas.xlsx` y las copias
 * automáticas que llevan sus datos. No hay baja pública, como no hay alta
 * pública (ADR-007): se hace desde la máquina. Se confirma tecleando otra vez el
 * correo; sin terminal (el ensayo), se lee la primera línea de la entrada.
 *
 * Antes conviene que la persona descargue su exportación desde la web.
 */

const USO = 'Uso: npm run baja -- <correo>';

async function confirmacion(): Promise<string> {
  if (process.stdin.isTTY) {
    const lector = createInterface({ input: process.stdin, output: process.stdout });
    try {
      return await lector.question('Escribe otra vez el correo para confirmar la baja: ');
    } finally {
      lector.close();
    }
  }
  let todo = '';
  process.stdin.setEncoding('utf8');
  for await (const trozo of process.stdin) todo += trozo;
  return todo.split(/\r?\n/)[0] ?? '';
}

async function principal(): Promise<void> {
  const [crudo] = process.argv.slice(2);
  if (crudo === undefined || crudo.trim() === '') throw new Error(USO);
  const correo = crudo.trim().toLowerCase();
  const directorio = resolve(process.env['DATOS_DIR']?.trim() || 'datos');
  console.log(
    `Vas a borrar la cuenta ${correo} de ${directorio}: su libro, sus credenciales y las copias automáticas con sus datos. No se puede deshacer.`,
  );
  if ((await confirmacion()).trim().toLowerCase() !== correo) {
    throw new Error('El correo no coincide: no se borró nada.');
  }
  const deposito = await Deposito.abre({ directorio, crear: false });
  const baja = await deposito.eliminaCuenta(correo);
  if (baja === null) throw new Error(`No hay ninguna cuenta ${correo}: no se borró nada.`);
  const contado =
    baja.sesiones === null
      ? 'su libro no se pudo leer y se borró igual'
      : `${baja.sesiones} sesiones y ${baja.series} series`;
  console.log(
    `Cuenta borrada: ${correo} · ${contado} · ${baja.respaldosBorrados} copias automáticas.`,
  );
  console.log(
    'Fuera del servidor quedan los respaldos completos sacados con deploy/respaldo.sh: bórralos o deja que tu rotación los caduque (docs/11-privacidad.md).',
  );
}

principal().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Error desconocido');
  process.exit(1);
});
