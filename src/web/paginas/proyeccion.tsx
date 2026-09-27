import type { Proyeccion as DatosDeProyeccion } from '../../api/planes/contrato';
import {
  Aviso,
  CabeceraDePagina,
  Cargando,
  Enlace,
  ErrorDeCarga,
  Vacio,
} from '../componentes/basicos';
import { usePreferencia } from '../estado/preferencias';
import { useRecurso } from '../estado/recurso';
import { fechaCorta, fechaLarga } from '../formato/fechas';

/**
 * PROYECCIÓN: lo que el plan PIDE, con esas palabras. No es lo entrenado ni la
 * diferencia entre los dos (eso es la comparativa). La ventana se pide en semanas
 * relativas a hoy: «hoy» lo sabe el servidor, desde la zona de la cuenta.
 */

const DESDE = [
  { valor: '-4', nombre: 'Hace cuatro semanas' },
  { valor: '-1', nombre: 'La semana pasada' },
  { valor: '0', nombre: 'Esta semana' },
  { valor: '1', nombre: 'La próxima semana' },
];

export function Proyeccion() {
  const [desde, setDesde] = usePreferencia('proyeccion-desde', '0');
  const [semanas, setSemanas] = usePreferencia('proyeccion-semanas', '4');
  const recurso = useRecurso<DatosDeProyeccion>(
    `/api/planes/v1/proyeccion?desde_semana=${desde}&semanas=${semanas}`,
  );
  const p = recurso.datos;
  const conPlan = p?.semanas.filter((s) => !s.sin_plan) ?? [];
  const grupos = p?.semanas[0]?.grupos ?? [];

  return (
    <>
      <CabeceraDePagina
        antetitulo="Proyección"
        titulo="Lo que tu plan pide"
        acciones={
          <div class="acciones">
            <div class="campo">
              <label for="desde">Desde</label>
              <select
                id="desde"
                class="selector"
                value={desde}
                onChange={(e) => setDesde((e.target as HTMLSelectElement).value)}
              >
                {DESDE.map((d) => (
                  <option key={d.valor} value={d.valor}>
                    {d.nombre}
                  </option>
                ))}
              </select>
            </div>
            <div class="campo">
              <label for="semanas">Semanas</label>
              <select
                id="semanas"
                class="selector"
                value={semanas}
                onChange={(e) => setSemanas((e.target as HTMLSelectElement).value)}
              >
                {['4', '8', '12'].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
        }
      >
        <p>
          Series efectivas por grupo y semana que pide el plan asignado, calculadas por el mismo
          motor que lo registrado. No es lo que entrenaste: lo hecho contra lo planeado está en la{' '}
          <Enlace href="/comparativa">comparativa</Enlace>.
        </p>
      </CabeceraDePagina>

      {recurso.estado === 'error' && (
        <ErrorDeCarga mensaje={recurso.error} reintenta={recurso.recarga} />
      )}
      {p === null && recurso.estado === 'cargando' && <Cargando />}
      {p !== null && (
        <div class="formulario">
          <Aviso tipo="info">
            Leída con{' '}
            {p.parametros.vigente_desde <= '2000-01-01'
              ? 'los parámetros que tienes desde el alta'
              : `los parámetros vigentes desde el ${fechaLarga(p.parametros.vigente_desde, true)}`}{' '}
            (una serie cuenta con RIR ≤ {p.parametros.umbral_rir}).
          </Aviso>
          {conPlan.length === 0 ? (
            <Vacio icono="calendar-range" titulo="No hay plan asignado en esta ventana">
              <p>
                Sin plan no hay nada que proyectar, y un cero sin explicación se confundiría con un
                plan que no entrena nada. <Enlace href="/planes">Asigna una rutina</Enlace>.
              </p>
            </Vacio>
          ) : (
            <section class="tarjeta">
              <div class="tabla-desplazable">
                <table class="tabla">
                  <caption class="solo-lectores">
                    Series efectivas pedidas por grupo y semana
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Grupo</th>
                      {p.semanas.map((s) => (
                        <th key={s.desde} scope="col" class="numero">
                          {fechaCorta(s.desde)}
                          {s.sin_plan && <span class="referencia">sin plan</span>}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {grupos.map((g) => (
                      <tr key={g.id}>
                        <th scope="row" class="fila-titulo">
                          {g.nombre}
                        </th>
                        {p.semanas.map((s) => (
                          <td key={s.desde} class="numero cifra">
                            {s.sin_plan
                              ? '—'
                              : (s.grupos.find((x) => x.id === g.id)?.series ?? '—')}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {p.semanas.some((s) => s.entradas_sin_mapeo > 0) && (
                <Aviso tipo="alerta">
                  Alguna entrada del plan pide un ejercicio sin grupos en tus parámetros: no suma a
                  ningún grupo.
                </Aviso>
              )}
            </section>
          )}
        </div>
      )}
    </>
  );
}
