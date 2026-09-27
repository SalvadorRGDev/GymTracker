import { type Centesimas, centesimasDesdeDecimal } from '../domain/volume/index.js';
import ejercicios from './datos/ejercicios.json' with { type: 'json' };
import grupos from './datos/grupos.json' with { type: 'json' };
import perfiles from './datos/perfiles.json' with { type: 'json' };
import plantillas from './datos/plantillas.json' with { type: 'json' };
import rangos from './datos/rangos.json' with { type: 'json' };
import type {
  CatalogoBase,
  EjercicioBase,
  EstadoDeReferencia,
  GrupoBase,
  PerfilBase,
  ReferenciaDeGrupo,
} from './tipos.js';
import { estaEnPerfil, normaliza, validaCatalogo } from './valida.js';

/**
 * La semilla del ADR-012. Se importa como módulo —nunca con `node:fs`: sólo
 * `src/almacen/` abre archivos— y se valida aquí, al cargar, es decir al
 * arrancar el servidor.
 *
 * Es semilla, no autoridad: se copia al libro de un propietario cuando él lo
 * pide y desde ese momento la copia es suya.
 */
export const CATALOGO_BASE: CatalogoBase = validaCatalogo({
  grupos,
  ejercicios,
  perfiles,
  plantillas,
  rangos,
});

export type * from './tipos.js';
export { ErrorDeCatalogo, estaEnPerfil, normaliza, validaCatalogo } from './valida.js';

const GRUPO_POR_NOMBRE = new Map<string, GrupoBase>(
  CATALOGO_BASE.grupos.map((g) => [normaliza(g.nombre), g]),
);

export function grupoBasePorNombre(nombre: string): GrupoBase | null {
  return GRUPO_POR_NOMBRE.get(normaliza(nombre)) ?? null;
}

/**
 * Identificador del catálogo base («dorsal») para un grupo del usuario, si su
 * nombre coincide con el de la semilla por `trim().toLowerCase()`. Un grupo
 * renombrado o creado a mano no tiene zona: no hereda nada de «pectoral».
 */
export function zonaPara(nombreDeGrupo: string): string | null {
  return grupoBasePorNombre(nombreDeGrupo)?.id ?? null;
}

export function ejerciciosDePerfil(perfil: PerfilBase): EjercicioBase[] {
  return CATALOGO_BASE.ejercicios.filter((e) => estaEnPerfil(perfil, e));
}

/**
 * El rango de referencia de un grupo y dónde cae su volumen (ADR-014).
 *
 * El veredicto se decide con aritmética ENTERA —la banda por las semanas contra
 * las centésimas del motor—, nunca sobre el decimal redondeado que se pinta.
 */
export function referenciaPara(
  nombreDeGrupo: string,
  volumen: Centesimas,
  semanas: number,
): ReferenciaDeGrupo | null {
  const grupo = grupoBasePorNombre(nombreDeGrupo);
  if (grupo === null) return null;
  const idBanda = CATALOGO_BASE.rangos.grupos[grupo.id];
  const banda = CATALOGO_BASE.rangos.bandas.find((b) => b.id === idBanda);
  if (banda === undefined) return null;
  const minimo = centesimasDesdeDecimal(banda.minimo) * semanas;
  const maximo = centesimasDesdeDecimal(banda.maximo) * semanas;
  const estado: EstadoDeReferencia =
    volumen < minimo ? 'por-debajo' : volumen > maximo ? 'por-encima' : 'dentro';
  return {
    banda: banda.id,
    nombre: banda.nombre,
    minimo: banda.minimo,
    maximo: banda.maximo,
    respaldo: banda.respaldo,
    estado,
  };
}
