import { useState } from 'preact/hooks';
import type {
  EntradaDelDia,
  RutinaDelDia,
  RutinaPublicada,
  VistaDeRutina,
} from '../../api/registro/contrato';
import type { Recurso } from '../estado/recurso';
import { actualizaConsulta } from '../estado/ruta';
import { fechaLarga } from '../formato/fechas';
import { Aviso, Enlace } from './basicos';
import { Icono } from './iconos';

/**
 * La rutina del día en «Registrar» (ADR-022): qué rutina y qué día se ven, por
 * qué, y la lista de lo que pide con lo que ya va hecho. Lo decide el servidor
 * —la fecha, el día del ciclo, qué cuenta como efectiva—; aquí sólo se pinta.
 * La rutina y el día elegidos a mano van en la consulta (`?rutina=…&dia=…`).
 */

const volverAHoy = () => actualizaConsulta({ rutina: null, dia: null }, { reemplaza: true });

/** El ejercicio elegido, dentro de la rutina que se ve: en su fila o como opción de un grupo. */
export function lugarEnLaRutina(
  vista: VistaDeRutina | null,
  ejercicioId: string | null,
): EntradaDelDia | null {
  if (vista === null || ejercicioId === null) return null;
  return (
    vista.entradas.find((e) =>
      e.tipo === 'ejercicio'
        ? e.ejercicio.id === ejercicioId
        : e.ejercicios.some((x) => x.id === ejercicioId),
    ) ?? null
  );
}

export function TarjetaDeRutina({
  recurso,
  elegido,
  alElegir,
  entrenamientoAbierto,
  eleccionAMano,
}: {
  recurso: Recurso<RutinaDelDia>;
  elegido: string | null;
  alElegir: (ejercicioId: string) => void;
  entrenamientoAbierto: boolean;
  /** La consulta fija rutina o día: puede ser ella la que el servidor rechaza. */
  eleccionAMano: boolean;
}) {
  const datos = recurso.datos;
  return (
    <section class="tarjeta tarjeta-de-rutina" aria-labelledby="titulo-rutina">
      <div class="tarjeta-titulo">
        <h3 id="titulo-rutina">Tu rutina</h3>
      </div>
      {recurso.estado === 'error' && (
        <Aviso tipo="error">
          <p>
            No se pudo leer tu rutina («{recurso.error}»). Mientras, busca el ejercicio abajo: se
            guarda igual.
          </p>
          <p class="acciones-de-aviso">
            <button type="button" class="boton-texto" onClick={recurso.recarga}>
              Reintentar
            </button>
            {eleccionAMano && (
              <button type="button" class="boton-texto" onClick={volverAHoy}>
                Volver a la de hoy
              </button>
            )}
          </p>
        </Aviso>
      )}
      {datos === null ? (
        recurso.estado !== 'error' && <p class="ayuda">Cargando la rutina…</p>
      ) : (
        <>
          {datos.rutinas.length > 0 && <Selectores datos={datos} />}
          <Explicacion datos={datos} entrenamientoAbierto={entrenamientoAbierto} />
          {datos.vista !== null && datos.vista.entradas.length > 0 && (
            <ListaDelDia vista={datos.vista} elegido={elegido} alElegir={alElegir} />
          )}
        </>
      )}
    </section>
  );
}

/** La versión sólo se nombra si hace falta para distinguir dos de la misma rutina. */
function nombreDeOpcion(r: RutinaPublicada, todas: readonly RutinaPublicada[]): string {
  const repetida = todas.filter((x) => x.plan_nombre === r.plan_nombre).length > 1;
  return `${r.plan_nombre}${repetida ? ` · versión ${r.numero}` : ''}${r.asignada ? ' · asignada' : ''}`;
}

function Selectores({ datos }: { datos: RutinaDelDia }) {
  const { vista, de_hoy: deHoy } = datos;
  const cambiaRutina = (id: string) => {
    if (id === '') return;
    // La asignada no se fija en la consulta: así sigue al día que toque.
    actualizaConsulta(
      { rutina: deHoy?.version_id === id ? null : id, dia: null },
      { reemplaza: true },
    );
  };
  const cambiaDia = (texto: string) => {
    if (vista === null) return;
    const asignada = deHoy?.version_id === vista.version_id;
    const dia = Number(texto);
    actualizaConsulta(
      {
        rutina: asignada ? null : vista.version_id,
        dia: asignada && deHoy?.dia === dia ? null : String(dia),
      },
      { reemplaza: true },
    );
  };
  return (
    <div class="fila-de-campos selectores-de-rutina">
      <div class="campo">
        <label for="rutina">Rutina</label>
        <select
          id="rutina"
          class="selector"
          value={vista?.version_id ?? ''}
          onChange={(e) => cambiaRutina((e.target as HTMLSelectElement).value)}
        >
          {vista === null && <option value="">Elige una rutina</option>}
          {datos.rutinas.map((r) => (
            <option key={r.version_id} value={r.version_id}>
              {nombreDeOpcion(r, datos.rutinas)}
            </option>
          ))}
        </select>
      </div>
      {vista !== null && (
        <div class="campo">
          <label for="dia-de-rutina">Día</label>
          <select
            id="dia-de-rutina"
            class="selector"
            value={String(vista.dia)}
            onChange={(e) => cambiaDia((e.target as HTMLSelectElement).value)}
          >
            {Array.from({ length: vista.ciclo_dias }, (_, i) => i + 1).map((n) => (
              <option key={n} value={String(n)}>
                {`Día ${n} de ${vista.ciclo_dias}${
                  deHoy?.version_id === vista.version_id && deHoy.dia === n ? ' · toca hoy' : ''
                }`}
              </option>
            ))}
          </select>
        </div>
      )}
    </div>
  );
}

function Explicacion({
  datos,
  entrenamientoAbierto,
}: {
  datos: RutinaDelDia;
  entrenamientoAbierto: boolean;
}) {
  const { vista, de_hoy: deHoy } = datos;
  const fecha = fechaLarga(datos.fecha);
  // Pasada la medianoche, el entrenamiento abierto sigue siendo del día en que empezó.
  const cuando = datos.de_entrenamiento_abierto
    ? `Tu entrenamiento es del ${fecha}`
    : `Hoy, ${fecha}`;

  if (datos.rutinas.length === 0) {
    return (
      <Aviso tipo="info">
        <p>
          No tienes rutinas publicadas. Crea una en <Enlace href="/planes">Rutinas</Enlace> y aquí
          aparecerán los ejercicios del día que toque. Mientras, busca el ejercicio abajo.
        </p>
      </Aviso>
    );
  }
  if (vista === null) {
    return (
      <Aviso tipo="info">
        <p>
          {cuando}, no tienes ninguna rutina asignada. Elige una arriba para ver sus ejercicios,
          asígnala en <Enlace href="/planes">Rutinas</Enlace> o busca el ejercicio abajo.
        </p>
      </Aviso>
    );
  }

  const nombre = `«${vista.plan_nombre}»`;
  const cuantas = vista.entradas.length;
  const lista = cuantas === 1 ? '1 ejercicio' : `${cuantas} ejercicios`;
  const terminado = vista.completa && (
    <Aviso tipo="exito">
      <p>
        Terminaste lo que pide el día {vista.dia}.
        {entrenamientoAbierto && ' Si has acabado, pulsa «Terminar entrenamiento».'}
      </p>
    </Aviso>
  );

  if (vista.es_la_de_hoy) {
    return (
      <>
        <Aviso tipo="info">
          <p>
            {cuantas === 0
              ? `${cuando}, toca el día ${vista.dia} de ${vista.ciclo_dias} de ${nombre}: es de descanso. Si entrenas igualmente, elige otro día arriba o busca el ejercicio abajo.`
              : `${cuando}, toca el día ${vista.dia} de ${vista.ciclo_dias} de ${nombre}: ${lista}. Elige uno para registrar sus series.`}
          </p>
        </Aviso>
        {terminado}
      </>
    );
  }

  const rutinaDeHoy =
    deHoy === null ? undefined : datos.rutinas.find((r) => r.version_id === deHoy.version_id);
  return (
    <>
      <Aviso tipo="alerta">
        <p>
          {deHoy === null
            ? `${nombre} no está asignada, así que el día lo eliges tú: estás viendo el día ${vista.dia}${cuantas === 0 ? ', que es de descanso' : ''}.`
            : `Estás viendo el día ${vista.dia} de ${nombre}${cuantas === 0 ? ', que es de descanso' : ''}, no el que toca: el día ${deHoy.dia}${rutinaDeHoy === undefined ? '' : ` de «${rutinaDeHoy.plan_nombre}»`}.`}{' '}
          Lo que registres cuenta para el {fecha}.
        </p>
        {deHoy !== null && (
          <button type="button" class="boton-texto" onClick={volverAHoy}>
            Volver a la de hoy
          </button>
        )}
      </Aviso>
      {terminado}
    </>
  );
}

function Progreso({ entrada }: { entrada: EntradaDelDia }) {
  return (
    <span class="progreso-de-rutina">
      {entrada.completa && (
        <span class="etiqueta-pequena exito">
          <Icono nombre="check" tamano={12} />
          Hecho
        </span>
      )}
      <span class="progreso-cifras">
        {entrada.hechas} de {entrada.objetivo}
      </span>
    </span>
  );
}

function ListaDelDia({
  vista,
  elegido,
  alElegir,
}: {
  vista: VistaDeRutina;
  elegido: string | null;
  alElegir: (ejercicioId: string) => void;
}) {
  // El grupo que contiene lo elegido empieza abierto: no se esconde la elección.
  const [abierto, setAbierto] = useState<string | null>(() => {
    const lugar = lugarEnLaRutina(vista, elegido);
    return lugar?.tipo === 'grupo' ? lugar.id : null;
  });
  return (
    <>
      <p class="ayuda">Cada fila dice cuántas series efectivas llevas de las que pide el día.</p>
      <ul class="lista-rutina" aria-label={`Ejercicios del día ${vista.dia}`}>
        {vista.entradas.map((e) =>
          e.tipo === 'ejercicio' ? (
            <li key={e.id}>
              <button
                type="button"
                class="fila-rutina"
                aria-pressed={elegido === e.ejercicio.id}
                disabled={e.ejercicio.archivado}
                onClick={() => alElegir(e.ejercicio.id)}
              >
                <span class="fila-rutina-nombre">{e.ejercicio.nombre}</span>
                <Progreso entrada={e} />
              </button>
              {e.ejercicio.archivado && (
                <p class="ayuda">
                  Archivado: recupéralo en el <Enlace href="/catalogo">catálogo</Enlace> para
                  registrarlo.
                </p>
              )}
            </li>
          ) : (
            <li key={e.id}>
              <button
                type="button"
                class="fila-rutina"
                aria-expanded={abierto === e.id}
                aria-controls={`grupo-${e.id}`}
                onClick={() => setAbierto(abierto === e.id ? null : e.id)}
              >
                <span class="fila-rutina-nombre">
                  {e.grupo.nombre}
                  <span class="fila-rutina-detalle">con el ejercicio que elijas</span>
                </span>
                <Progreso entrada={e} />
              </button>
              {abierto === e.id && (
                <div id={`grupo-${e.id}`} class="grupo-de-rutina">
                  <p class="ayuda">
                    Cuenta lo que hagas con ejercicios que no tienen fila propia hoy, cada serie
                    según cuánto trabaje {e.grupo.nombre}.
                  </p>
                  {e.ejercicios.length === 0 ? (
                    <p class="ayuda">
                      Tu catálogo no tiene otro ejercicio que lo trabaje: búscalo abajo.
                    </p>
                  ) : (
                    <ul class="opciones-de-grupo">
                      {e.ejercicios.map((x) => (
                        <li key={x.id}>
                          <button
                            type="button"
                            aria-pressed={elegido === x.id}
                            onClick={() => alElegir(x.id)}
                          >
                            <span>{x.nombre}</span>
                            <span class="fila-rutina-detalle">cuenta {x.coeficiente}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          ),
        )}
      </ul>
    </>
  );
}
