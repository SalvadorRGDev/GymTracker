import type {
  CantidadDeGrupo,
  Comparativa as DatosDeComparativa,
  VentanaComparada,
  VigilanciaDelUmbral,
} from '../../api/planes/contrato';
import {
  Aviso,
  CabeceraDePagina,
  Cargando,
  Enlace,
  ErrorDeCarga,
  Vacio,
} from '../componentes/basicos';
import { Delta } from '../componentes/delta';
import { useRecurso } from '../estado/recurso';
import { actualizaConsulta, useUbicacion } from '../estado/ruta';
import { fechaCorta, fechaLarga, rangoDeDias } from '../formato/fechas';
import { anchoDeBarra, escalaDeBarras } from '../formato/numeros';

/**
 * COMPARATIVA (fase 3, ADR-019): lo hecho menos lo planeado, cada semana del
 * plan contra la versión que regía entonces. El servidor resta, pone el signo y
 * decide el estado; aquí se enseña. La escala es divergente y propia: el rojo
 * del mapa dice «mucho volumen» y aquí no significa nada.
 */

const VENTANAS = ['4', '8', '12'];

function lista(cantidades: readonly CantidadDeGrupo[]): string {
  return cantidades.length === 0
    ? '—'
    : cantidades.map((c) => `${c.nombre} ${c.series}`).join(' · ');
}

function Vigilancia({ v, simulando }: { v: VigilanciaDelUmbral; simulando: boolean }) {
  const umbral = v.umbrales.at(-1);
  const simula = (u: number) => actualizaConsulta({ umbral: String(u) });
  return (
    <section class="tarjeta formulario" aria-labelledby="titulo-vigilancia">
      <h2 id="titulo-vigilancia">Vigilancia del umbral</h2>
      {v.efectivas === 0 ? (
        <p>Ninguna serie efectiva entre el {fechaLarga(v.desde)} y hoy: no hay nada que vigilar.</p>
      ) : (
        <p>
          Entre el {fechaLarga(v.desde)} y hoy, <strong class="cifra">{v.en_la_franja}</strong> de{' '}
          <strong class="cifra">{v.efectivas}</strong> series efectivas ({v.porcentaje} %) tuvieron
          el RIR a un punto o menos del umbral
          {simulando ? ' (con tus umbrales, no el simulado)' : ''}.
        </p>
      )}
      {v.efectivas > 0 && v.efectivas < v.minimo && (
        <p class="ayuda">
          Con menos de {v.minimo} efectivas el porcentaje es ruido: todavía no se vigila.
        </p>
      )}
      {v.pide_sensibilidad && (
        <Aviso tipo="alerta">
          <p>
            Más del {v.disparador} %: el umbral está decidiendo el resultado. Mira qué cambia con un
            punto menos y uno más.
          </p>
          {umbral !== undefined && (
            <div class="acciones">
              {umbral > 0 && (
                <button
                  type="button"
                  class="boton-fantasma boton-pequeno"
                  onClick={() => simula(umbral - 1)}
                >
                  Simular RIR ≤ {umbral - 1}
                </button>
              )}
              {umbral < 10 && (
                <button
                  type="button"
                  class="boton-fantasma boton-pequeno"
                  onClick={() => simula(umbral + 1)}
                >
                  Simular RIR ≤ {umbral + 1}
                </button>
              )}
            </div>
          )}
        </Aviso>
      )}
      {v.efectivas >= v.minimo && !v.pide_sensibilidad && (
        <p class="ayuda">
          Por debajo del {v.disparador} %: el umbral no está decidiendo el resultado.
        </p>
      )}
      <p class="ayuda">
        El {v.disparador} % y el mínimo de {v.minimo} efectivas son convenciones declaradas, no
        medidas.
      </p>
    </section>
  );
}

function Ventana({ v }: { v: VentanaComparada }) {
  const titulo = `titulo-ventana-${v.desde}`;
  const escala = escalaDeBarras(v.grupos.flatMap((g) => [g.planeado, g.ejecutado]));
  const mezcla = v.versiones_de_parametros.length > 1;
  return (
    <section class="tarjeta ventana-comparada" aria-labelledby={titulo}>
      <header class="ventana-cabecera">
        <div>
          <h2 id={titulo}>
            Semana {v.numero} de «{v.plan.nombre}»{' '}
            <span class="etiqueta-pequena">v{v.plan.numero_de_version}</span>
          </h2>
          <p class="ayuda">
            {rangoDeDias(v.desde, v.hasta)}
            {v.dias < 7 &&
              ` · ${v.dias} ${v.dias === 1 ? 'día' : 'días'}: otro plan empezó a mitad de semana`}
          </p>
        </div>
        {v.en_curso && <span class="etiqueta-pequena">En curso</span>}
      </header>

      {mezcla && (
        <Aviso tipo="info">
          Esta semana mezcla {v.versiones_de_parametros.length} versiones de parámetros:{' '}
          {v.versiones_de_parametros
            .map((p) =>
              p.vigente_desde <= '2000-01-01'
                ? `la del alta (RIR ≤ ${p.umbral_rir})`
                : `desde el ${fechaLarga(p.vigente_desde)} (RIR ≤ ${p.umbral_rir})`,
            )
            .join('; ')}
          . Cada día se lee con la suya, en los dos lados de la resta.
        </Aviso>
      )}

      {v.grupos.length === 0 ? (
        <p class="ayuda">El plan no pedía nada esta semana y no registraste series.</p>
      ) : (
        <div class="tabla-desplazable">
          <table class="tabla tabla-comparativa">
            <caption class="solo-lectores">
              Series efectivas planeadas, hechas y su diferencia, por grupo
            </caption>
            <thead>
              <tr>
                <th scope="col">Grupo</th>
                <th scope="col" class="numero col-cifra">
                  Planeado
                </th>
                <th scope="col" class="numero col-cifra">
                  Hecho
                </th>
                <th scope="col" class="numero">
                  Diferencia
                </th>
              </tr>
            </thead>
            <tbody>
              {v.grupos.map((g) => (
                <tr key={g.id}>
                  <th scope="row" class="fila-titulo">
                    {g.nombre}
                    {/* En el teléfono las dos columnas se van y las cifras vienen aquí. */}
                    <span class="cifras-en-movil cifra">
                      {g.ejecutado} de {g.planeado}
                    </span>
                    <span class="barra-comparada" aria-hidden="true">
                      <span
                        class={`barra-hecho barra-${g.estado}`}
                        style={{ width: `${anchoDeBarra(g.ejecutado, escala)}%` }}
                      />
                      <span
                        class="marca-plan"
                        style={{ left: `${anchoDeBarra(g.planeado, escala)}%` }}
                      />
                    </span>
                  </th>
                  <td class="numero cifra col-cifra">{g.planeado}</td>
                  <td class="numero cifra col-cifra">{g.ejecutado}</td>
                  <td class="numero">
                    <Delta delta={g.delta} estado={g.estado} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {v.entradas_sin_mapeo > 0 && (
        <Aviso tipo="alerta">
          {v.entradas_sin_mapeo === 1
            ? 'Una entrada del plan pide'
            : `${v.entradas_sin_mapeo} entradas del plan piden`}{' '}
          un ejercicio sin grupos en tus parámetros: no suman a ningún grupo.
        </Aviso>
      )}
      {v.series_sin_mapeo > 0 && (
        <Aviso tipo="alerta">
          {v.series_sin_mapeo === 1 ? 'Una serie hecha' : `${v.series_sin_mapeo} series hechas`} no{' '}
          {v.series_sin_mapeo === 1 ? 'aporta' : 'aportan'} a ningún grupo:{' '}
          <Enlace href="/catalogo">revisa el catálogo</Enlace>.
        </Aviso>
      )}

      <details class="desplazamiento">
        <summary>Desplazamiento por día</summary>
        <p class="ayuda">
          Lo que cuenta es la semana: entrenar otro día dentro de ella no es incumplir.
        </p>
        <ol class="dias-comparados">
          {v.detalle.map((d) => (
            <li key={d.fecha} class="dia-comparado">
              <p class="dia-comparado-fecha">
                <strong>{fechaCorta(d.fecha)}</strong>{' '}
                <span class="referencia-en-linea">día {d.dia_del_ciclo} del ciclo</span>
              </p>
              <dl>
                <div>
                  <dt>Planeado</dt>
                  <dd>{lista(d.planeado)}</dd>
                </div>
                <div>
                  <dt>Hecho</dt>
                  <dd>{d.futuro ? 'todavía no' : lista(d.ejecutado)}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ol>
      </details>
    </section>
  );
}

export function Comparativa() {
  const { consulta } = useUbicacion();
  const ventanas = VENTANAS.includes(consulta.get('ventanas') ?? '')
    ? (consulta.get('ventanas') ?? '8')
    : '8';
  const umbral = /^(?:10|\d)$/.test(consulta.get('umbral') ?? '') ? consulta.get('umbral') : null;
  const recurso = useRecurso<DatosDeComparativa>(
    `/api/planes/v1/comparativa?ventanas=${ventanas}${umbral === null ? '' : `&umbral=${umbral}`}`,
  );
  const c = recurso.datos;

  return (
    <>
      <CabeceraDePagina
        antetitulo="Comparativa"
        titulo="Lo hecho contra lo planeado"
        acciones={
          <div class="acciones">
            <div class="campo">
              <label for="ventanas">Semanas</label>
              <select
                id="ventanas"
                class="selector"
                value={ventanas}
                onChange={(e) =>
                  actualizaConsulta({ ventanas: (e.target as HTMLSelectElement).value })
                }
              >
                {VENTANAS.map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </div>
            <div class="campo">
              <label for="umbral">Umbral de RIR</label>
              <select
                id="umbral"
                class="selector"
                value={umbral ?? ''}
                onChange={(e) => {
                  const valor = (e.target as HTMLSelectElement).value;
                  actualizaConsulta({ umbral: valor === '' ? null : valor });
                }}
              >
                <option value="">El tuyo</option>
                {Array.from({ length: 11 }, (_, n) => (
                  <option key={n} value={String(n)}>
                    Simular RIR ≤ {n}
                  </option>
                ))}
              </select>
            </div>
          </div>
        }
      >
        <p>
          Cada semana del plan, contada desde el día en que lo asignaste, contra la versión que
          regía entonces. La diferencia es lo hecho menos lo planeado, con su signo; el color nunca
          va solo.
        </p>
      </CabeceraDePagina>

      {recurso.estado === 'error' && (
        <ErrorDeCarga mensaje={recurso.error} reintenta={recurso.recarga} />
      )}
      {c === null && recurso.estado === 'cargando' && <Cargando />}
      {c !== null && (
        <div class="formulario">
          {c.simulacion !== null && (
            <Aviso tipo="alerta">
              <p>
                <strong>Simulación:</strong> aquí una serie cuenta con RIR ≤{' '}
                {c.simulacion.umbral_rir}. No se guarda nada. Para adoptarlo, cambia el umbral en{' '}
                <Enlace href="/catalogo">Catálogo</Enlace>: regirá desde mañana y no reescribe lo
                pasado.
              </p>
              <div class="acciones">
                <button
                  type="button"
                  class="boton-fantasma boton-pequeno"
                  onClick={() => actualizaConsulta({ umbral: null })}
                >
                  Volver a tu umbral
                </button>
              </div>
            </Aviso>
          )}
          <Vigilancia v={c.vigilancia} simulando={c.simulacion !== null} />
          {c.ventanas.length === 0 ? (
            <Vacio icono="scale" titulo="Todavía no hay contra qué comparar">
              <p>
                La comparativa resta lo hecho de lo que pedía un plan asignado, y hasta hoy no rige
                ninguno. <Enlace href="/planes">Asigna una rutina</Enlace>.
              </p>
            </Vacio>
          ) : (
            [...c.ventanas].reverse().map((v) => <Ventana key={v.desde} v={v} />)
          )}
        </div>
      )}
    </>
  );
}
