import * as B from './movimientos/brazos';
import type { Demostracion } from './movimientos/comun';
import * as C from './movimientos/core';
import * as E from './movimientos/empujes';
import * as P from './movimientos/piernas';
import * as T from './movimientos/tracciones';

export type { Demostracion } from './movimientos/comun';

/**
 * Qué figura enseña cada ejercicio del catálogo base, por identificador. Es
 * una tabla y no una deducción por nombre o por patrón: así una prueba puede
 * exigir que cada ejercicio tenga la suya y que ninguna entrada apunte a un
 * ejercicio que ya no existe. Se construyen al pedirlas: son funciones.
 *
 * Una `nota` dice lo que la figura no puede enseñar (el agarre, por ejemplo).
 */

interface Entrada {
  readonly crea: () => Demostracion;
  readonly nota?: string;
}

const e = (crea: () => Demostracion, nota?: string): Entrada =>
  nota === undefined ? { crea } : { crea, nota };

export const EJEMPLOS: Readonly<Record<string, Entrada>> = {
  // Empuje horizontal
  'press-banca': e(() => E.pressTumbado({ implemento: 'barra', banco: 'plano' })),
  'press-inclinado': e(() => E.pressTumbado({ implemento: 'barra', banco: 'inclinado' })),
  'press-declinado': e(() => E.pressTumbado({ implemento: 'barra', banco: 'declinado' })),
  'press-mancuernas': e(() => E.pressTumbado({ implemento: 'mancuernas', banco: 'plano' })),
  'press-inclinado-mancuernas': e(() =>
    E.pressTumbado({ implemento: 'mancuernas', banco: 'inclinado' }),
  ),
  'press-suelo': e(() => E.pressTumbado({ implemento: 'mancuernas', banco: 'suelo' })),
  'press-cerrado': e(() => E.pressTumbado({ implemento: 'barra', banco: 'plano', cerrado: true })),
  'press-smith': e(() => E.pressTumbado({ implemento: 'smith', banco: 'plano' })),
  'press-inclinado-smith': e(() => E.pressTumbado({ implemento: 'smith', banco: 'inclinado' })),
  'press-maquina': e(() => E.pressDePechoEnMaquina()),
  flexiones: e(() => E.flexion({ apoyo: 'suelo' })),
  'flexiones-inclinadas': e(() => E.flexion({ apoyo: 'manos-en-banco' })),
  'flexiones-declinadas': e(() => E.flexion({ apoyo: 'pies-en-banco' })),
  'flexiones-diamante': e(() => E.flexion({ apoyo: 'suelo', diamante: true })),
  'flexiones-anillas': e(() => E.flexion({ apoyo: 'anillas' })),
  // Empuje vertical
  'press-militar': e(() => E.pressVertical({ implemento: 'barra', sentado: false })),
  'press-hombro-mancuernas': e(() => E.pressVertical({ implemento: 'mancuernas', sentado: true })),
  'press-hombro-maquina': e(() => E.pressVertical({ implemento: 'maquina', sentado: true })),
  'press-hombro-smith': e(() => E.pressVertical({ implemento: 'smith', sentado: true })),
  'press-arnold': e(() =>
    E.pressVertical({ implemento: 'mancuernas', sentado: true, arnold: true }),
  ),
  'press-landmine': e(() => E.pressLandmine()),
  'flexiones-pica': e(() => E.flexionPica()),
  'flexiones-pino': e(() => E.flexionEnPino()),
  'fondos-paralelas': e(() => E.fondosEnParalelas()),
  // Tracción horizontal
  'remo-barra': e(() => T.remoInclinado({ implemento: 'barra' })),
  'remo-t': e(() => T.remoInclinado({ implemento: 'barra-t' })),
  'remo-mancuerna': e(() => T.remoConMancuernaAUnaMano()),
  'remo-pecho-apoyado': e(() => T.remoConPechoApoyado()),
  'remo-polea': e(() => T.remoSentado({ agarre: 'polea' })),
  'remo-polea-una-mano': e(() => T.remoSentado({ agarre: 'una-mano' })),
  'remo-maquina': e(() => T.remoSentado({ agarre: 'maquina' })),
  'remo-banda': e(() => T.remoSentado({ agarre: 'banda' })),
  'remo-invertido': e(() => T.remoInvertido({ apoyo: 'barra' })),
  'remo-anillas': e(() => T.remoInvertido({ apoyo: 'anillas' })),
  'remo-mesa': e(() => T.remoInvertido({ apoyo: 'mesa' })),
  'face-pull': e(() => T.facePull({ implemento: 'polea' })),
  'face-pull-banda': e(() => T.facePull({ implemento: 'banda' })),
  'remo-alto-polea': e(() => T.facePull({ implemento: 'polea', alto: true })),
  // Tracción vertical
  dominadas: e(() => T.dominada({ variante: 'prona' })),
  'dominadas-supinas': e(() => T.dominada({ variante: 'supina' })),
  'dominadas-asistidas': e(() => T.dominada({ variante: 'asistida' })),
  'jalon-pecho': e(() => T.jalon()),
  'jalon-neutro': e(() => T.jalon(), 'Con agarre neutro: las palmas se miran entre sí.'),
  'jalon-supino': e(
    () => T.jalon(),
    'Con agarre supino: las palmas hacia ti y las manos a la anchura de los hombros.',
  ),
  'jalon-una-mano': e(() => T.jalon({ unaMano: true })),
  'remo-al-menton': e(() => T.remoAlMenton({ implemento: 'barra' })),
  'remo-al-menton-mancuernas': e(() => T.remoAlMenton({ implemento: 'mancuernas' })),
  'remo-al-menton-polea': e(() => T.remoAlMenton({ implemento: 'polea' })),
  // Sentadilla
  sentadilla: e(() => P.sentadilla({ carga: 'barra' })),
  'sentadilla-frontal': e(() => P.sentadilla({ carga: 'frontal' })),
  'sentadilla-goblet': e(() => P.sentadilla({ carga: 'goblet' })),
  'sentadilla-sin-peso': e(() => P.sentadilla({ carga: 'sin-peso' })),
  'sentadilla-smith': e(() => P.sentadilla({ carga: 'smith' })),
  'sentadilla-sumo': e(() => P.sentadilla({ carga: 'sumo' })),
  'sentadilla-hack': e(() => P.sentadillaEnMaquina({ tipo: 'hack' })),
  'sentadilla-pendulo': e(() => P.sentadillaEnMaquina({ tipo: 'pendulo' })),
  'sentadilla-pistol': e(() => P.sentadillaPistol()),
  'sentadilla-sissy': e(() => P.sentadillaSissy()),
  prensa: e(() => P.prensa()),
  // Bisagra
  'peso-muerto': e(() => P.pesoMuerto({ implemento: 'barra' })),
  'peso-muerto-mancuernas': e(() => P.pesoMuerto({ implemento: 'mancuernas' })),
  'peso-muerto-sumo': e(() => P.pesoMuerto({ implemento: 'barra', sumo: true })),
  'peso-muerto-rumano': e(() => P.pesoMuertoRumano({ implemento: 'barra' })),
  'peso-muerto-rumano-mancuernas': e(() => P.pesoMuertoRumano({ implemento: 'mancuernas' })),
  'peso-muerto-una-pierna': e(() => P.pesoMuertoAUnaPierna()),
  'buenos-dias': e(() => P.buenosDias()),
  'hip-thrust': e(() => P.hipThrust({ implemento: 'barra' })),
  'hip-thrust-mancuerna': e(() => P.hipThrust({ implemento: 'mancuerna' })),
  'hip-thrust-maquina': e(() => P.hipThrust({ implemento: 'maquina' })),
  'puente-gluteo': e(() => P.puente({ variante: 'gluteo' })),
  'puente-una-pierna': e(() => P.puente({ variante: 'una-pierna' })),
  'puente-isquios': e(() => P.puente({ variante: 'isquios' })),
  hiperextensiones: e(() => P.hiperextension()),
  'extension-lumbar-maquina': e(() => P.extensionLumbarEnMaquina()),
  'hiperextensiones-inversas': e(() => P.hiperextensionInversa()),
  superman: e(() => P.superman()),
  'pull-through': e(() => P.pullThrough()),
  'swing-kettlebell': e(() => P.swing()),
  // Zancada
  zancadas: e(() => P.zancada({ tipo: 'adelante' })),
  'zancada-inversa': e(() => P.zancada({ tipo: 'atras' })),
  'zancadas-caminando': e(() => P.zancada({ tipo: 'caminando' })),
  'zancadas-sin-peso': e(() => P.zancada({ tipo: 'sin-peso' })),
  'sentadilla-bulgara': e(() => P.sentadillaBulgara()),
  'subida-cajon': e(() => P.subidaAlCajon()),
  'zancada-lateral': e(() => P.zancadaLateral()),
  // Acarreo
  'paseo-granjero': e(() => P.paseoDelGranjero()),
  // Núcleo
  crunch: e(() => C.crunch()),
  'crunch-declinado': e(() => C.crunch({ banco: 'declinado' })),
  'crunch-maquina': e(() => C.crunchEnMaquina()),
  'crunch-polea': e(() => C.crunchEnPolea()),
  'crunch-inverso': e(() => C.crunchInverso()),
  'elevaciones-piernas': e(() => C.elevacionDePiernas({ apoyo: 'suelo' })),
  'elevaciones-piernas-colgado': e(() => C.elevacionDePiernas({ apoyo: 'colgado' })),
  'elevaciones-rodillas': e(() => C.elevacionDePiernas({ apoyo: 'paralelas' })),
  'l-sit': e(() => C.lSit()),
  hollow: e(() => C.posicionHueca()),
  'dragon-flag': e(() => C.dragonFlag()),
  plancha: e(() => C.plancha()),
  'plancha-lateral': e(() => C.planchaLateral()),
  'plancha-copenhague': e(() => C.planchaLateral({ copenhague: true })),
  'rueda-abdominal': e(() => C.ruedaAbdominal()),
  pallof: e(() => C.pressPallof({ implemento: 'polea' })),
  'pallof-banda': e(() => C.pressPallof({ implemento: 'banda' })),
  lenador: e(() => C.lenador()),
  'bird-dog': e(() => C.birdDog()),
  // Bíceps y antebrazo
  'curl-barra': e(() => B.curl({ implemento: 'barra' })),
  'curl-barra-z': e(() => B.curl({ implemento: 'barra-z' })),
  'curl-mancuernas': e(() => B.curl({ implemento: 'mancuernas' })),
  'curl-martillo': e(() => B.curl({ implemento: 'martillo' })),
  'curl-polea': e(() => B.curl({ implemento: 'polea' })),
  'curl-banda': e(() => B.curl({ implemento: 'banda' })),
  'curl-martillo-polea': e(() => B.curl({ implemento: 'martillo-polea' })),
  'curl-invertido': e(() => B.curl({ implemento: 'barra-z', invertido: true })),
  'curl-predicador': e(() => B.predicador({ sentido: 'curl', implemento: 'barra-z' })),
  'curl-maquina': e(() => B.predicador({ sentido: 'curl', implemento: 'maquina' })),
  'curl-concentrado': e(() => B.curlConcentrado()),
  'curl-inclinado': e(() => B.curlInclinado()),
  'curl-bayesian': e(() => B.curlBayesian()),
  'curl-anillas': e(() => B.curlEnAnillas()),
  'curl-muneca': e(() => B.curlDeMuneca()),
  'curl-muneca-invertido': e(() => B.curlDeMuneca({ invertido: true })),
  colgarse: e(() => T.colgarse()),
  // Tríceps
  'extension-polea': e(() => B.extensionEnPolea({ agarre: 'barra' })),
  'extension-cuerda': e(() => B.extensionEnPolea({ agarre: 'cuerda' })),
  'extension-banda': e(() => B.extensionEnPolea({ agarre: 'banda' })),
  'extension-maquina': e(() => B.predicador({ sentido: 'extension', implemento: 'maquina' })),
  'extension-trasnuca': e(() => B.extensionTrasNuca({ implemento: 'mancuerna' })),
  'extension-trasnuca-polea': e(() => B.extensionTrasNuca({ implemento: 'polea' })),
  'press-frances': e(() => B.pressFrances({ implemento: 'barra-z' })),
  'press-frances-mancuernas': e(() => B.pressFrances({ implemento: 'mancuernas' })),
  'patada-triceps': e(() => B.patadaDeTriceps({ implemento: 'mancuerna' })),
  'patada-polea': e(() => B.patadaDeTriceps({ implemento: 'polea' })),
  'fondos-banco': e(() => E.fondosEnBanco()),
  // Hombros
  'elevaciones-laterales': e(() => B.elevacionLateral({ implemento: 'mancuernas' })),
  'elevaciones-laterales-sentado': e(() =>
    B.elevacionLateral({ implemento: 'mancuernas', sentado: true }),
  ),
  'elevaciones-laterales-banda': e(() => B.elevacionLateral({ implemento: 'banda' })),
  'elevaciones-laterales-maquina': e(() => B.elevacionLateral({ implemento: 'maquina' })),
  'elevaciones-laterales-polea': e(() => B.elevacionLateral({ implemento: 'polea' })),
  'elevaciones-frontales': e(() => B.elevacionFrontal({ implemento: 'mancuernas' })),
  'elevaciones-frontales-polea': e(() => B.elevacionFrontal({ implemento: 'polea' })),
  pajaros: e(() => B.pajaros({ soporte: 'de-pie' })),
  'pajaros-banco': e(() => B.pajaros({ soporte: 'banco' })),
  'pajaros-polea': e(() => B.aperturaInversa({ implemento: 'polea' })),
  'pajaros-anillas': e(() => B.aperturaInversa({ implemento: 'anillas' })),
  'pec-deck-invertido': e(() => B.aperturaInversa({ implemento: 'maquina' })),
  'separaciones-banda': e(() => B.aperturaInversa({ implemento: 'banda' })),
  'ytw-suelo': e(
    () => B.elevacionesYTW(),
    'La figura enseña la Y; la T y la W son el mismo gesto con los brazos en cruz y con los codos doblados.',
  ),
  'elevaciones-y': e(() => B.elevacionesY()),
  // Pecho aislado
  aperturas: e(() => B.aperturas({ banco: 'plano' })),
  'aperturas-inclinadas': e(() => B.aperturas({ banco: 'inclinado' })),
  'cruce-poleas': e(() => B.cruceDePoleas({ altura: 'alta' })),
  'cruce-poleas-bajo': e(() => B.cruceDePoleas({ altura: 'baja' })),
  'pec-deck': e(() => B.pecDeck()),
  pullover: e(() => B.pullover()),
  // Trapecio
  'encogimientos-barra': e(() => B.encogimientos({ implemento: 'barra' })),
  'encogimientos-mancuernas': e(() => B.encogimientos({ implemento: 'mancuernas' })),
  'encogimientos-maquina': e(() => B.encogimientos({ implemento: 'maquina' })),
  'dominadas-escapulares': e(() => T.dominada({ variante: 'escapular' })),
  'remo-escapular-polea': e(() => T.remoSentado({ agarre: 'escapular' })),
  'jalon-brazos-rectos': e(() => T.jalonConBrazosRectos()),
  // Piernas aisladas
  'extension-cuadriceps': e(() => P.extensionDeCuadriceps()),
  'curl-femoral-tumbado': e(() => P.curlFemoral({ tipo: 'tumbado' })),
  'curl-femoral-sentado': e(() => P.curlFemoral({ tipo: 'sentado' })),
  'curl-femoral-de-pie': e(() => P.curlFemoral({ tipo: 'de-pie' })),
  'curl-femoral-polea': e(() => P.curlFemoral({ tipo: 'polea' })),
  'curl-femoral-deslizante': e(() => P.curlFemoral({ tipo: 'deslizante' })),
  'curl-nordico': e(() => P.curlNordico()),
  'glute-ham-raise': e(() => P.curlNordico({ maquina: true })),
  talones: e(() => P.talones({ tipo: 'de-pie' })),
  'talones-de-pie': e(() => P.talones({ tipo: 'maquina' })),
  'talones-mancuerna': e(() => P.talones({ tipo: 'mancuerna' })),
  'talones-prensa': e(() => P.talones({ tipo: 'prensa' })),
  'talones-sentado': e(() => P.talones({ tipo: 'sentado' })),
  'abduccion-banda': e(() => P.aperturaDeRodillas({ sentido: 'abduccion', implemento: 'banda' })),
  'abduccion-maquina': e(() =>
    P.aperturaDeRodillas({ sentido: 'abduccion', implemento: 'maquina' }),
  ),
  'aduccion-maquina': e(() => P.aperturaDeRodillas({ sentido: 'aduccion', implemento: 'maquina' })),
  'aduccion-polea': e(() => P.aduccionEnPolea()),
  'aduccion-tumbado': e(() => P.aduccionTumbado()),
  'elevacion-lateral-pierna': e(() => P.elevacionLateralDePierna()),
  'patada-burro': e(() => P.patadaDeBurro()),
  'patada-gluteo-maquina': e(() => P.patadaDeGluteo({ implemento: 'maquina' })),
  'patada-gluteo-polea': e(() => P.patadaDeGluteo({ implemento: 'polea' })),
};

export interface Ejemplo extends Demostracion {
  readonly nota?: string;
}

/** La demostración de un ejercicio del catálogo base, o `null` si no tiene. */
export function ejemploDe(id: string): Ejemplo | null {
  const entrada = Object.hasOwn(EJEMPLOS, id) ? EJEMPLOS[id] : undefined;
  if (entrada === undefined) return null;
  const demostracion = entrada.crea();
  return entrada.nota === undefined ? demostracion : { ...demostracion, nota: entrada.nota };
}
