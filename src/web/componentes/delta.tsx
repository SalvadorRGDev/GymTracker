import type { EstadoDeComparacion } from '../../api/planes/contrato';
import { Icono, type NombreDeIcono } from './iconos';

/**
 * La diferencia que resta el servidor (ADR-019), como la manda: la cifra con su
 * signo, un icono y la palabra. El color nunca va solo, y aquí no se decide
 * nada: ni el signo ni el estado.
 */

export const ROTULO_DE_ESTADO: Record<EstadoDeComparacion, string> = {
  deficit: 'déficit',
  pendiente: 'pendiente',
  'en-plan': 'en plan',
  superavit: 'superávit',
};

const ICONO_DE_ESTADO: Record<EstadoDeComparacion, NombreDeIcono> = {
  deficit: 'minus',
  pendiente: 'clock',
  'en-plan': 'check',
  superavit: 'plus',
};

export function Delta({ delta, estado }: { delta: string; estado: EstadoDeComparacion }) {
  return (
    <span class={`delta delta-${estado}`}>
      <Icono nombre={ICONO_DE_ESTADO[estado]} tamano={14} />
      <span class="cifra">{delta}</span>
      <span class="delta-rotulo">{ROTULO_DE_ESTADO[estado]}</span>
    </span>
  );
}
