import { copyFile, mkdir, readdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';

/**
 * Copia previa a cada escritura, en `respaldos/`. Protege del error de esta
 * tarde —una edición a mano que salió mal, una importación que no se quería—,
 * no del disco muerto: para eso está `deploy/respaldo.sh`.
 *
 * La poda conserva las últimas N copias de cada archivo Y la primera de cada
 * día. Conservar «las últimas N» a secas se come el historial en una tarde de
 * ochenta series.
 */
export class Respaldos {
  private ultimoSello = '';
  private repeticion = 0;

  constructor(
    readonly directorio: string,
    private readonly reloj: () => Date,
    private readonly conservar = 20,
  ) {}

  private sello(): string {
    const base = this.reloj().toISOString().replace(/[:.]/g, '-');
    // Dos escrituras en el mismo milisegundo no se pisan la copia.
    this.repeticion = base === this.ultimoSello ? this.repeticion + 1 : 0;
    this.ultimoSello = base;
    return `${base}${this.repeticion === 0 ? '' : `-${String(this.repeticion).padStart(3, '0')}`}`;
  }

  async copia(ruta: string): Promise<string> {
    await mkdir(this.directorio, { recursive: true, mode: 0o700 });
    const base = basename(ruta, '.xlsx');
    const destino = join(this.directorio, `${base}--${this.sello()}.xlsx`);
    await copyFile(ruta, destino);
    await this.poda(base);
    return destino;
  }

  /** Borra TODAS las copias de un archivo. Sólo la baja de una cuenta lo pide. */
  async borra(base: string): Promise<number> {
    const copias = await this.lista(base);
    for (const copia of copias) await rm(join(this.directorio, copia), { force: true });
    return copias.length;
  }

  async lista(base: string): Promise<string[]> {
    const nombres = await readdir(this.directorio).catch(() => [] as string[]);
    return nombres.filter((n) => n.startsWith(`${base}--`) && n.endsWith('.xlsx')).sort();
  }

  private async poda(base: string): Promise<void> {
    const copias = await this.lista(base);
    const conservadas = new Set(copias.slice(-this.conservar));
    const vistosPorDia = new Set<string>();
    for (const copia of copias) {
      const dia = copia.slice(base.length + 2, base.length + 12);
      if (!vistosPorDia.has(dia)) {
        vistosPorDia.add(dia);
        conservadas.add(copia);
      }
    }
    for (const copia of copias) {
      if (!conservadas.has(copia)) await rm(join(this.directorio, copia), { force: true });
    }
  }
}
