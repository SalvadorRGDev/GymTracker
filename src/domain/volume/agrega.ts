import { CERO, type Centesimas, multiplica } from './centesimas.js';
import { diasEntre, sumaDias } from './fecha-logica.js';
import type { Agregado, AgregadoDeSemana, EntradaDeAgregado, Serie, Ventana } from './tipos.js';

/**
 * El cálculo. Es el ÚNICO sitio del sistema donde se calcula volumen: la
 * proyección de un plan y lo registrado pasan por aquí con la misma forma de
 * entrada (ADR-006), para que la resta de la fase 3 no pueda dar distinto de
 * cero por una diferencia de código.
 */

export class ErrorDeMotor extends Error {
  override name = 'ErrorDeMotor';
}

const RIR_MAXIMO = 10;

function compruebaEntero(valor: number, minimo: number, maximo: number, que: string): void {
  if (!Number.isInteger(valor) || valor < minimo || valor > maximo) {
    throw new ErrorDeMotor(`${que} fuera de rango: ${valor}`);
  }
}

/**
 * Diezmilésimas → centésimas, redondeando la mitad al par.
 *
 * Es el único redondeo del motor y sólo puede ocurrir en el lado del plan: una
 * serie registrada vale `UNA_SERIE` y su producto con un coeficiente es siempre
 * un múltiplo exacto de cien. Un objetivo fraccionario por un coeficiente
 * fraccionario (4.50 × 0.25 = 1.125) no cabe en dos decimales; se acumula exacto
 * y se redondea una sola vez, al final, por grupo.
 */
function aCentesimas(diezmilesimas: number): Centesimas {
  const cociente = Math.trunc(diezmilesimas / 100);
  const resto = diezmilesimas - cociente * 100;
  if (resto > 50 || (resto === 50 && cociente % 2 !== 0)) return (cociente + 1) as Centesimas;
  return cociente as Centesimas;
}

export type ClaseDeSerie = 'calentamiento' | 'sobre-umbral' | 'efectiva';

/**
 * Qué cuenta. Es la regla del umbral y vive sólo aquí: `agrega` y la vigilancia
 * del umbral la llaman, en vez de repetir la comparación cada uno a su manera.
 */
export function clasifica(serie: Serie, umbrales: ReadonlyMap<string, number>): ClaseDeSerie {
  const umbral = umbrales.get(serie.versionParametrosId);
  if (umbral === undefined) {
    // Suponer un umbral sería inventar el parámetro que decide qué cuenta.
    throw new ErrorDeMotor(`Falta el umbral de la versión ${serie.versionParametrosId}`);
  }
  compruebaEntero(umbral, 0, RIR_MAXIMO, 'Umbral de RIR');
  // El filtro de calentamiento vive DENTRO del motor: si lo tuviera que hacer
  // el llamador, bastaría uno distraído para inflar el volumen en silencio.
  if (serie.tipo === 'calentamiento') return 'calentamiento';
  compruebaEntero(serie.rir, 0, RIR_MAXIMO, 'RIR');
  return serie.rir > umbral ? 'sobre-umbral' : 'efectiva';
}

export function agrega(entrada: EntradaDeAgregado): Agregado {
  const acumulado = new Map<string, number>();
  const versiones = new Set<string>();
  let seriesEfectivas = 0;
  let seriesSinMapeo = 0;
  let seriesSobreUmbral = 0;
  let seriesDeCalentamiento = 0;

  for (const serie of entrada.series) {
    const clase = clasifica(serie, entrada.umbrales);
    if (!Number.isSafeInteger(serie.veces) || serie.veces <= 0) {
      throw new ErrorDeMotor(`«veces» debe ser positivo: ${serie.veces}`);
    }
    if (clase === 'calentamiento') {
      seriesDeCalentamiento += 1;
      continue;
    }
    versiones.add(serie.versionParametrosId);
    if (clase === 'sobre-umbral') {
      seriesSobreUmbral += 1;
      continue;
    }

    seriesEfectivas += 1;
    if (serie.contribuciones.length === 0) {
      seriesSinMapeo += 1;
      continue;
    }
    for (const { grupoId, coeficiente } of serie.contribuciones) {
      if (!Number.isSafeInteger(coeficiente) || coeficiente <= 0) {
        throw new ErrorDeMotor(`Coeficiente no positivo para ${grupoId}: ${coeficiente}`);
      }
      const producto = multiplica(coeficiente, serie.veces);
      const suma = (acumulado.get(grupoId) ?? 0) + producto;
      if (!Number.isSafeInteger(suma)) throw new ErrorDeMotor('Volumen fuera de rango');
      acumulado.set(grupoId, suma);
    }
  }

  const porGrupo = new Map<string, Centesimas>();
  for (const [grupoId, diezmilesimas] of acumulado) {
    porGrupo.set(grupoId, aCentesimas(diezmilesimas));
  }

  return {
    porGrupo,
    seriesEfectivas,
    seriesSinMapeo,
    seriesSobreUmbral,
    seriesDeCalentamiento,
    versionesDeParametros: [...versiones].sort(),
  };
}

/** El volumen de un grupo; cero si no recibió nada. Nunca `undefined` ni `null`. */
export function volumenDe(agregado: Agregado, grupoId: string): Centesimas {
  return agregado.porGrupo.get(grupoId) ?? CERO;
}

/**
 * Todas las semanas de la ventana, las vacías incluidas y a cero.
 *
 * Una serie fuera de la ventana LANZA: descartarla en silencio deflactaría el
 * volumen, y es el llamador quien eligió mal qué series pasar.
 */
export function agregaPorSemana(entrada: EntradaDeAgregado, ventana: Ventana): AgregadoDeSemana[] {
  compruebaEntero(ventana.semanas, 1, 520, 'Número de semanas');
  const cubos: Serie[][] = Array.from({ length: ventana.semanas }, () => []);
  for (const serie of entrada.series) {
    const dias = diasEntre(ventana.desde, serie.fechaLogica);
    const indice = Math.floor(dias / 7);
    const cubo = dias < 0 ? undefined : cubos[indice];
    if (cubo === undefined) {
      throw new ErrorDeMotor(`Serie del ${serie.fechaLogica} fuera de la ventana`);
    }
    cubo.push(serie);
  }
  return cubos.map((series, i) => ({
    ...agrega({ series, umbrales: entrada.umbrales }),
    desde: sumaDias(ventana.desde, 7 * i),
    hasta: sumaDias(ventana.desde, 7 * (i + 1)),
  }));
}
