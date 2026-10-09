import {
  centesimasDesdeDecimal,
  esDecimalExacto,
  librasDesdeKilosEnTexto,
} from '../../domain/volume/index.js';
import { ErrorDeDominio } from '../errores.js';
import { instanteDelCliente } from '../zona.js';
import type {
  CuerpoCierreDeCaptura,
  CuerpoPesoDeCaptura,
  CuerpoSerieDeCaptura,
  CuerpoSerieDeRegistro,
} from './contrato.js';
import type { Origen, SerieNormalizada } from './servicio.js';

/**
 * Del cuerpo ya validado por el esquema a la entrada del servicio. Lo que el
 * esquema no puede expresar —coherencia entre campos, formato del instante,
 * rango del decimal— se comprueba aquí y es un 400: no es un rechazo de
 * dominio que el atajo deba enseñar, es un cliente que no cumple el contrato.
 */

function malFormada(mensaje: string): ErrorDeDominio {
  return new ErrorDeDominio(400, 'esquema', `Petición mal formada: ${mensaje}`);
}

/** `"60,5"`, `"60.50"` o `60.5` → `"60.5"`. Nunca más de dos decimales. */
export function decimalNormalizado(
  valor: string | number,
  campo: string,
  minimo: string,
  maximo: string,
): string {
  const texto = typeof valor === 'number' ? String(valor) : valor.replace(',', '.');
  if (!esDecimalExacto(texto) || texto.startsWith('-')) {
    throw malFormada(`«${campo}» debe ser un decimal con a lo sumo dos posiciones`);
  }
  const c = centesimasDesdeDecimal(texto);
  if (c < centesimasDesdeDecimal(minimo) || c > centesimasDesdeDecimal(maximo)) {
    throw malFormada(`«${campo}» fuera de rango [${minimo}, ${maximo}]`);
  }
  // Sin ceros a la izquierda que el almacén no admitiría: "007.5" → "7.5".
  return texto.replace(/^0+(?=\d)/, '');
}

function instante(texto: string, campo: string): Date {
  const valor = instanteDelCliente(texto);
  if (valor === null) throw malFormada(`«${campo}» debe ser un instante ISO 8601 con zona`);
  return valor;
}

function serieComun(
  serie: CuerpoSerieDeRegistro['serie'],
): Omit<SerieNormalizada['serie'], 'realizadaEn'> {
  const rir = serie.rir ?? null;
  if (serie.calentamiento && rir !== null) throw malFormada('un calentamiento no lleva RIR');
  if (!serie.calentamiento && rir === null) throw malFormada('una serie de trabajo necesita RIR');
  // ADR-023: en libras; un atajo anterior manda kilos y se convierte aquí.
  if ((serie.carga_lb === undefined) === (serie.carga_kg === undefined)) {
    throw malFormada(
      'la carga va en «carga_lb» (o en «carga_kg» desde un atajo anterior), una sola',
    );
  }
  const kilos =
    serie.carga_kg === undefined
      ? null
      : decimalNormalizado(serie.carga_kg, 'carga_kg', '0', '1000');
  return {
    clave: serie.clave,
    ejercicio: serie.ejercicio,
    repeticiones: serie.repeticiones,
    cargaLb:
      kilos === null
        ? decimalNormalizado(serie.carga_lb ?? '', 'carga_lb', '0', '2500')
        : librasDesdeKilosEnTexto(kilos),
    kilosDelAtajo: kilos,
    rir,
    calentamiento: serie.calentamiento,
  };
}

export function serieDesdeCaptura(cuerpo: CuerpoSerieDeCaptura): SerieNormalizada {
  return {
    origen: 'captura',
    sesion: {
      clave: cuerpo.sesion.clave,
      iniciadaEn: instante(cuerpo.sesion.iniciada_en, 'sesion.iniciada_en'),
    },
    serie: {
      ...serieComun(cuerpo.serie),
      realizadaEn: instante(cuerpo.serie.realizada_en, 'serie.realizada_en'),
    },
  };
}

/**
 * En la web la fecha lógica la pone el servidor con SU reloj: tomarla del
 * navegador rompería la sesión que cruza la medianoche y mentiría de viaje.
 */
export function serieDesdeRegistro(cuerpo: CuerpoSerieDeRegistro, ahora: Date): SerieNormalizada {
  return {
    origen: 'registro',
    sesion: { clave: cuerpo.sesion.clave, iniciadaEn: ahora },
    serie: { ...serieComun(cuerpo.serie), realizadaEn: ahora },
  };
}

export function cierreDesdeCaptura(cuerpo: CuerpoCierreDeCaptura): {
  clave: string;
  finalizadaEn: Date;
} {
  return {
    clave: cuerpo.sesion.clave,
    finalizadaEn: instante(cuerpo.finalizada_en, 'finalizada_en'),
  };
}

export function pesoDesde(
  cuerpo: CuerpoPesoDeCaptura | { peso_kg: string | number },
  origen: Origen,
  ahora: Date,
): { pesoKg: string; medidoEn: Date; origen: Origen } {
  return {
    pesoKg: decimalNormalizado(cuerpo.peso_kg, 'peso_kg', '20', '400'),
    medidoEn: 'medido_en' in cuerpo ? instante(cuerpo.medido_en, 'medido_en') : ahora,
    origen,
  };
}
