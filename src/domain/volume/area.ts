import type { Agregado } from './tipos.js';

/**
 * De qué fue una sesión (ADR-024): tren superior si se lleva al menos 2/3 de las
 * series efectivas que fueron a un tren o al otro; tren inferior, igual; si no,
 * cuerpo completo. Lo del centro —abdomen, lumbares— y lo que no tiene región no
 * inclinan la balanza. Sin nada en ninguno de los dos trenes no hay área.
 *
 * Suma volumen, así que vive aquí: con el volumen que dio `agrega` y aritmética
 * entera, sin redondear nada.
 */
export type Area = 'superior' | 'inferior' | 'completo';

export type RegionDeGrupo = (grupoId: string) => 'superior' | 'inferior' | null;

export function areaDe(agregado: Agregado, regionDe: RegionDeGrupo): Area | null {
  let superior = 0;
  let inferior = 0;
  for (const [grupoId, volumen] of agregado.porGrupo) {
    const region = regionDe(grupoId);
    if (region === 'superior') superior += volumen;
    else if (region === 'inferior') inferior += volumen;
  }
  const total = superior + inferior;
  if (total === 0) return null;
  if (3 * superior >= 2 * total) return 'superior';
  if (3 * inferior >= 2 * total) return 'inferior';
  return 'completo';
}
