import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Deposito } from '../acceso.js';

/**
 * Utilidades de prueba: un depósito en un directorio temporal. Nunca el
 * almacén de verdad —un libro corrompido no tiene deshacer—.
 */

/** Un hash con la forma de Argon2id; las pruebas del almacén no verifican contraseñas. */
export const HASH_DE_PRUEBA = '$argon2id$v=19$m=19456,t=2,p=1$c2FsZGVwcnVlYmE$aGFzaGRlcHJ1ZWJh';

export class RelojDePrueba {
  private instante: number;

  constructor(inicial = '2026-09-26T18:00:00.000Z') {
    this.instante = Date.parse(inicial);
  }

  readonly lee = (): Date => new Date(this.instante);

  fija(iso: string): void {
    this.instante = Date.parse(iso);
  }

  avanza(milisegundos: number): void {
    this.instante += milisegundos;
  }
}

export interface DepositoDePrueba {
  readonly deposito: Deposito;
  readonly directorio: string;
  readonly reloj: RelojDePrueba;
  limpia(): Promise<void>;
}

export async function depositoDePrueba(reloj = new RelojDePrueba()): Promise<DepositoDePrueba> {
  const directorio = await mkdtemp(join(tmpdir(), 'gymtracker-prueba-'));
  const deposito = await Deposito.abre({ directorio, reloj: reloj.lee });
  return {
    deposito,
    directorio,
    reloj,
    limpia: () => rm(directorio, { recursive: true, force: true }),
  };
}

export function cuentaDePrueba(
  deposito: Deposito,
  correo = 'ana@ejemplo.com',
  opciones: { zonaHoraria?: string; umbralRir?: number; vigenteDesde?: string } = {},
): Promise<string> {
  return deposito.creaCuenta({
    correo,
    hashContrasena: HASH_DE_PRUEBA,
    zonaHoraria: opciones.zonaHoraria ?? 'America/Mexico_City',
    umbralRir: opciones.umbralRir ?? 4,
    vigenteDesde: opciones.vigenteDesde ?? '2000-01-01',
  });
}
