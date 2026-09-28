/**
 * La leyenda de la figura comparada con el plan (ADR-019): cuatro estados que
 * decide el servidor más «ni plan ni series». No es una escala de cantidad:
 * dice el signo de lo hecho menos lo planeado, y la cifra está en la tabla.
 */

const ESTADOS = [
  { estado: 'deficit', rotulo: 'Déficit: menos de lo planeado' },
  { estado: 'pendiente', rotulo: 'Pendiente: la semana no ha terminado' },
  { estado: 'en-plan', rotulo: 'En plan' },
  { estado: 'superavit', rotulo: 'Superávit: más de lo planeado' },
  { estado: 'sin-plan', rotulo: 'Ni plan ni series' },
] as const;

export function LeyendaDeComparacion() {
  return (
    <div class="leyenda">
      <ul class="leyenda-rotulos">
        {ESTADOS.map((e) => (
          <li key={e.estado}>
            <span class="muestra-de-estado" data-estado={e.estado} aria-hidden="true" />
            <span>{e.rotulo}</span>
          </li>
        ))}
      </ul>
      <p class="leyenda-explicacion">
        El color dice el signo de lo hecho menos lo planeado en la semana del plan; la cifra, con su
        signo, está en la tabla. No es la escala del volumen: aquí nada significa «mucho».
      </p>
    </div>
  );
}
