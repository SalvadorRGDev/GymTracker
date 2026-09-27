import { resolve } from 'node:path';
import { Deposito } from '../almacen/acceso.js';
import { esZonaValida } from '../almacen/celdas.js';
import { hashDeContrasena, LONGITUD_MINIMA } from '../auth/contrasena.js';

/**
 * `npm run alta -- correo@ejemplo.com America/Mexico_City 4`
 *
 * No hay registro público (ADR-007): una cuenta por persona, desde la máquina.
 * La contraseña se TECLEA, nunca va por argumento: `ps` la enseñaría. Sin
 * terminal (el ensayo), se lee de la entrada estándar.
 *
 * La cuenta nace con un libro vacío y una versión de parámetros con el umbral
 * dado, vigente desde el 2000-01-01 para que un histórico traído de antes
 * también tenga con qué leerse. El catálogo NO se siembra aquí: se importa
 * cuando la persona lo pide.
 */

const USO = 'Uso: npm run alta -- <correo> <zona IANA> <umbral de RIR 0–10>';

function preguntaOculta(pregunta: string): Promise<string> {
  return new Promise((aceptar, rechazar) => {
    const entrada = process.stdin;
    process.stdout.write(pregunta);
    entrada.setRawMode(true);
    entrada.resume();
    entrada.setEncoding('utf8');
    let texto = '';
    const termina = () => {
      entrada.setRawMode(false);
      entrada.pause();
      entrada.off('data', alTeclear);
      process.stdout.write('\n');
    };
    function alTeclear(trozo: string) {
      for (const caracter of trozo) {
        if (caracter === '\r' || caracter === '\n') {
          termina();
          aceptar(texto);
          return;
        }
        if (caracter === '\u0003') {
          termina();
          rechazar(new Error('Cancelado'));
          return;
        }
        if (caracter === '\u007f' || caracter === '\b') texto = texto.slice(0, -1);
        else texto += caracter;
      }
    }
    entrada.on('data', alTeclear);
  });
}

async function leeEntradaEntera(): Promise<string[]> {
  let todo = '';
  process.stdin.setEncoding('utf8');
  for await (const trozo of process.stdin) todo += trozo;
  return todo.split(/\r?\n/);
}

async function pideContrasena(): Promise<string> {
  let primera: string;
  let segunda: string;
  if (process.stdin.isTTY) {
    primera = await preguntaOculta(`Contraseña (${LONGITUD_MINIMA} caracteres o más): `);
    segunda = await preguntaOculta('Repítela: ');
  } else {
    const lineas = await leeEntradaEntera();
    primera = lineas[0] ?? '';
    segunda = lineas[1] ?? '';
  }
  if (primera !== segunda) throw new Error('Las dos contraseñas no coinciden');
  if (primera.length < LONGITUD_MINIMA)
    throw new Error(`La contraseña necesita ${LONGITUD_MINIMA} caracteres o más`);
  return primera;
}

async function principal(): Promise<void> {
  const [correoCrudo, zona, umbralTexto] = process.argv.slice(2);
  if (correoCrudo === undefined || zona === undefined || umbralTexto === undefined)
    throw new Error(USO);
  const correo = correoCrudo.trim().toLowerCase();
  if (!/^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,63}$/.test(correo))
    throw new Error(`Correo no válido. ${USO}`);
  if (!esZonaValida(zona)) throw new Error(`Zona horaria IANA desconocida: ${zona}`);
  if (!/^(?:10|\d)$/.test(umbralTexto)) throw new Error('El umbral de RIR es un entero de 0 a 10');

  const contrasena = await pideContrasena();
  const hashContrasena = await hashDeContrasena(contrasena);
  const directorio = resolve(process.env['DATOS_DIR']?.trim() || 'datos');
  const deposito = await Deposito.abre({ directorio });
  const id = await deposito.creaCuenta({
    correo,
    hashContrasena,
    zonaHoraria: zona,
    umbralRir: Number(umbralTexto),
    vigenteDesde: '2000-01-01',
  });
  console.log(
    `Cuenta creada: ${correo} · ${zona} · RIR ≤ ${umbralTexto} · ${id}.xlsx en ${directorio}`,
  );
  console.log('Siguiente paso: entra en la web e importa el catálogo base (Catálogo → Importar).');
}

principal().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Error desconocido');
  process.exit(1);
});
