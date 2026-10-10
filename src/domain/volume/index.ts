export { agrega, agregaPorSemana, ErrorDeMotor, volumenDe } from './agrega.js';
export { type Area, areaDe, type RegionDeGrupo, trenDeEjercicio } from './area.js';
export {
  CERO,
  type Centesimas,
  centesimasDesdeDecimal,
  centesimasDesdeEntero,
  comparaCentesimas,
  type Diezmilesimas,
  decimalDesdeCentesimas,
  ErrorDeCentesimas,
  esDecimalExacto,
  multiplica,
  restaCentesimas,
  sumaCentesimas,
  UNA_SERIE,
} from './centesimas.js';
export {
  DISPARADOR_DE_VIGILANCIA,
  type Diferencia,
  MINIMO_DE_VIGILANCIA,
  resta,
  type VentanaDeComparacion,
  type Vigilancia,
  ventanasDeComparacion,
  vigilaUmbral,
} from './comparativa.js';
export {
  comparaFechas,
  dentroDe,
  diaDeLaSemana,
  diasEntre,
  ErrorDeFecha,
  esFechaLogica,
  type FechaLogica,
  fechaLogica,
  lunesDe,
  sumaDias,
} from './fecha-logica.js';
export {
  type AsignacionDePlan,
  type DestinoDeEntrada,
  diaDelCiclo,
  type EntradaDePlan,
  expandePlan,
  fechaDelDiaDelCiclo,
  type ParametrosDeExpansion,
  type PeticionDeExpansion,
  type VersionDePlan,
} from './plan.js';
export {
  cargaMedia,
  fuerzaPorSemana,
  type Progreso,
  type PuntoDeFuerza,
  progreso,
  type SerieConCarga,
  TOPE_DE_PROGRESO,
} from './rendimiento.js';
export type {
  Agregado,
  AgregadoDeSemana,
  Contribucion,
  EntradaDeAgregado,
  Serie,
  SerieDeCalentamiento,
  SerieDeTrabajo,
  Ventana,
} from './tipos.js';
export { librasDesdeKilos, librasDesdeKilosEnTexto } from './unidades.js';
