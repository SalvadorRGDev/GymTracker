import { useEffect, useRef, useState } from 'preact/hooks';
import type {
  Historial as DatosDeHistorial,
  ProgresoDeSesion,
  SesionDelHistorial,
} from '../../api/lectura/contrato';
import {
  Aviso,
  BotonConConfirmacion,
  CabeceraDePagina,
  Cargando,
  Enlace,
  ErrorDeCarga,
  Vacio,
} from '../componentes/basicos';
import { GraficasDelHistorial } from '../componentes/graficas-del-historial';
import { Icono } from '../componentes/iconos';
import { pide } from '../estado/api';
import { useRecurso } from '../estado/recurso';
import { actualizaConsulta, useUbicacion } from '../estado/ruta';
import { fechaCorta, fechaLarga, horaDe, partesDeFecha } from '../formato/fechas';

/**
 * El historial (ADR-024): una fila por sesión con su área, sus series efectivas,
 * la carga media y el progreso frente a la anterior de su misma área, de diez en
 * diez. Todo lo decide el servidor; aquí sólo se pinta. Cada fila se despliega
 * con sus series tal como llegaron —el calentamiento marcado, un RIR ausente es
 * «—»—, y ahí siguen borrar una serie o la sesión y confirmar una fecha.
 */

const AREA: Record<NonNullable<SesionDelHistorial['area']>, string> = {
  superior: 'Tren superior',
  inferior: 'Tren inferior',
  completo: 'Cuerpo completo',
};

function Progreso({ progreso, area }: { progreso: ProgresoDeSesion; area: string }) {
  if (progreso.estado === 'comparada') {
    const { puntos } = progreso;
    const tono = puntos > 0 ? 'sube' : puntos < 0 ? 'baja' : 'igual';
    const ejercicios =
      progreso.ejercicios === 1 ? '1 ejercicio' : `${progreso.ejercicios} ejercicios`;
    return (
      <span class="progreso-celda">
        <span class={`progreso-sesion progreso-${tono}`}>
          <Icono
            nombre={puntos > 0 ? 'trending-up' : puntos < 0 ? 'trending-down' : 'equal'}
            tamano={14}
          />
          <span class="cifra">{puntos > 0 ? `+${puntos}` : String(puntos)}</span>
        </span>
        <span class="progreso-detalle">
          {progreso.cambio} % · vs {fechaCorta(progreso.frente_a)}
          <span class="solo-lectores">
            , frente a la sesión del {fechaLarga(progreso.frente_a)} en {ejercicios}
          </span>
        </span>
      </span>
    );
  }
  const motivo =
    progreso.estado === 'primera'
      ? `primera de ${area.toLowerCase()}`
      : progreso.estado === 'sin-comunes'
        ? `sin ejercicios en común con la del ${fechaCorta(progreso.frente_a)}`
        : 'sin tren superior ni inferior';
  return (
    <span class="progreso-celda">
      <span class="progreso-sin" aria-hidden="true">
        —
      </span>
      <span class="progreso-detalle">{motivo}</span>
    </span>
  );
}

/** «Tren superior · 3 series efectivas · media 178.3 lb»: lo que en el teléfono va bajo la fecha. */
function partesDelResumen(sesion: SesionDelHistorial, area: string | null): string[] {
  const series =
    sesion.series_efectivas === 1
      ? '1 serie efectiva'
      : `${sesion.series_efectivas} series efectivas`;
  const media = sesion.carga_media_lb === null ? null : `media ${sesion.carga_media_lb} lb`;
  return [area, series, media].filter((parte) => parte !== null);
}

function DetalleDeSesion({
  sesion,
  zona,
  alCambiar,
}: {
  sesion: SesionDelHistorial;
  zona: string;
  alCambiar: () => void;
}) {
  const inicio = horaDe(sesion.iniciada_en, zona);
  return (
    <div class="detalle-de-sesion">
      <div class="sesion-meta">
        <span>
          {sesion.finalizada_en === null
            ? `desde las ${inicio} · sin cerrar`
            : `${inicio}–${horaDe(sesion.finalizada_en, zona)}`}
        </span>
        <span class="etiqueta-pequena">{sesion.origen === 'captura' ? 'Atajo' : 'Web'}</span>
      </div>
      {sesion.fecha_por_confirmar && (
        <Aviso tipo="alerta">
          <p>
            La fecha llegó del reloj de un teléfono y no parece plausible. Si es correcta,
            confírmala; si no, borra la sesión y vuelve a capturarla.
          </p>
          <div class="acciones">
            <button
              type="button"
              class="boton-fantasma boton-pequeno"
              onClick={async () => {
                await pide('POST', `/api/registro/v1/sesion/${sesion.id}/confirmacion`);
                alCambiar();
              }}
            >
              <Icono nombre="check" tamano={16} />
              Confirmar fecha
            </button>
            <BotonConConfirmacion
              etiqueta="Borrar sesión"
              pregunta="¿Borrar la sesión y sus series?"
              confirmar="Borrar"
              pequeno
              icono="trash-2"
              alConfirmar={async () => {
                await pide('DELETE', `/api/registro/v1/sesion/${sesion.id}`);
                alCambiar();
              }}
            />
          </div>
        </Aviso>
      )}
      {sesion.series.length === 0 ? (
        <p class="cargando">Sesión sin series (se borraron).</p>
      ) : (
        <div class="tabla-desplazable">
          <table class="tabla">
            <caption class="solo-lectores">Series de la sesión del {sesion.fecha_logica}</caption>
            <thead>
              <tr>
                <th scope="col" class="numero col-amplia">
                  #
                </th>
                <th scope="col">Ejercicio</th>
                <th scope="col" class="numero">
                  Reps
                </th>
                <th scope="col" class="numero">
                  Carga (lb)
                </th>
                <th scope="col" class="numero">
                  RIR
                </th>
                <th scope="col">
                  <span class="solo-lectores">Acciones</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {sesion.series.map((s) => (
                <tr key={s.id} class={s.es_calentamiento ? 'fila-calentamiento' : ''}>
                  <td class="numero cifra col-amplia">{s.orden}</td>
                  <td>
                    {s.ejercicio}{' '}
                    {s.es_calentamiento && (
                      <span class="etiqueta-pequena">
                        <Icono nombre="flame" tamano={12} />
                        Calentamiento
                      </span>
                    )}
                  </td>
                  <td class="numero cifra">{s.repeticiones}</td>
                  <td class="numero cifra">{s.carga_lb}</td>
                  <td class="numero cifra">{s.rir === null ? '—' : s.rir}</td>
                  <td class="numero">
                    <BotonConConfirmacion
                      etiqueta={`Borrar la serie ${s.orden}`}
                      pregunta="¿Borrar esta serie?"
                      confirmar="Borrar"
                      pequeno
                      soloIcono
                      icono="trash-2"
                      alConfirmar={async () => {
                        await pide('DELETE', `/api/registro/v1/serie/${s.id}`);
                        alCambiar();
                      }}
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function FilaDeSesion({
  sesion,
  abierta,
  alAlternar,
  zona,
  alCambiar,
}: {
  sesion: SesionDelHistorial;
  abierta: boolean;
  alAlternar: () => void;
  zona: string;
  alCambiar: () => void;
}) {
  const detalle = `detalle-${sesion.id}`;
  const esteAnio = partesDeFecha(new Date().toISOString().slice(0, 10)).anio;
  const area = sesion.area === null ? null : AREA[sesion.area];
  return (
    <>
      <tr class="fila-sesion">
        <th scope="row">
          <button
            type="button"
            class="desplegar"
            aria-expanded={abierta}
            aria-controls={detalle}
            onClick={alAlternar}
          >
            <Icono nombre="chevron-right" tamano={16} clase="desplegar-icono" />
            <span>
              {fechaLarga(
                sesion.fecha_logica,
                partesDeFecha(sesion.fecha_logica).anio !== esteAnio,
              )}
            </span>
          </button>
          {sesion.fecha_por_confirmar && (
            <span class="etiqueta-pequena aviso">Fecha por confirmar</span>
          )}
          {/* En el teléfono las otras columnas se van y lo suyo viene aquí, como en la comparativa. */}
          <div class="resumen-en-movil">
            {/* Cada parte entera: la línea se parte entre ellas, no entre «media» y su cifra. */}
            <span class="cifra">
              {partesDelResumen(sesion, area).flatMap((parte, i) => [
                i === 0 ? '' : ' · ',
                <span key={parte} class="sin-partir">
                  {parte}
                </span>,
              ])}
            </span>
            <Progreso progreso={sesion.progreso} area={area ?? ''} />
          </div>
        </th>
        <td class="col-amplia">{area ?? '—'}</td>
        <td class="numero cifra col-amplia">{sesion.series_efectivas}</td>
        <td class="numero cifra col-amplia">{sesion.carga_media_lb ?? '—'}</td>
        <td class="numero col-amplia">
          <Progreso progreso={sesion.progreso} area={area ?? ''} />
        </td>
      </tr>
      <tr class="fila-detalle" id={detalle} hidden={!abierta}>
        <td colSpan={5}>
          {abierta && <DetalleDeSesion sesion={sesion} zona={zona} alCambiar={alCambiar} />}
        </td>
      </tr>
    </>
  );
}

type Hueco = number | 'antes' | 'despues';

/** Primera, última, la actual y sus vecinas; lo demás, puntos suspensivos. */
export function paginasVisibles(pagina: number, paginas: number): Hueco[] {
  if (paginas <= 7) return Array.from({ length: paginas }, (_, i) => i + 1);
  const desde = Math.max(2, Math.min(pagina - 1, paginas - 4));
  const hasta = Math.min(paginas - 1, Math.max(pagina + 1, 5));
  const medio = Array.from({ length: hasta - desde + 1 }, (_, i) => desde + i);
  return [
    1,
    ...(desde > 2 ? (['antes'] as const) : []),
    ...medio,
    ...(hasta < paginas - 1 ? (['despues'] as const) : []),
    paginas,
  ];
}

function Paginacion({
  pagina,
  paginas,
  alIr,
}: {
  pagina: number;
  paginas: number;
  alIr: (n: number) => void;
}) {
  if (paginas <= 1) return null;
  const salto = (
    n: number,
    etiqueta: string,
    icono: 'chevrons-left' | 'chevron-left' | 'chevron-right' | 'chevrons-right',
    desactivado: boolean,
  ) => (
    <button type="button" aria-label={etiqueta} disabled={desactivado} onClick={() => alIr(n)}>
      <Icono nombre={icono} tamano={16} />
    </button>
  );
  return (
    <nav class="paginacion" aria-label="Páginas del historial">
      {salto(1, 'Primera página', 'chevrons-left', pagina === 1)}
      {salto(pagina - 1, 'Página anterior', 'chevron-left', pagina === 1)}
      <ul>
        {paginasVisibles(pagina, paginas).map((n) =>
          typeof n === 'number' ? (
            <li key={n}>
              <button
                type="button"
                aria-label={`Página ${n}`}
                {...(n === pagina ? { 'aria-current': 'page' as const } : {})}
                onClick={() => alIr(n)}
              >
                {n}
              </button>
            </li>
          ) : (
            <li key={n} class="paginacion-hueco" aria-hidden="true">
              …
            </li>
          ),
        )}
      </ul>
      {salto(pagina + 1, 'Página siguiente', 'chevron-right', pagina === paginas)}
      {salto(paginas, 'Última página', 'chevrons-right', pagina === paginas)}
    </nav>
  );
}

export function Historial({ zona }: { zona: string }) {
  const { consulta } = useUbicacion();
  const texto = consulta.get('pagina') ?? '';
  const pedida = /^[1-9]\d{0,3}$/.test(texto) ? texto : '1';
  const recurso = useRecurso<DatosDeHistorial>(`/api/lectura/v1/historial?pagina=${pedida}`);
  const datos = recurso.datos;
  const [abiertas, setAbiertas] = useState<ReadonlySet<string>>(new Set());
  const resumen = useRef<HTMLHeadingElement>(null);
  const saltando = useRef(false);

  // Al cambiar de página, el foco va al resumen: el teclado no se queda abajo,
  // en la paginación, mientras arriba cambia todo.
  useEffect(() => {
    if (!saltando.current || datos === null) return;
    saltando.current = false;
    resumen.current?.focus();
  }, [datos?.pagina]);

  const irA = (n: number) => {
    saltando.current = true;
    setAbiertas(new Set());
    actualizaConsulta({ pagina: n === 1 ? null : String(n) });
  };
  const alterna = (id: string) => {
    const nuevas = new Set(abiertas);
    if (nuevas.has(id)) nuevas.delete(id);
    else nuevas.add(id);
    setAbiertas(nuevas);
  };

  const primera = datos === null ? 0 : (datos.pagina - 1) * datos.por_pagina + 1;
  const ultima = datos === null ? 0 : primera + datos.sesiones.length - 1;

  return (
    <>
      <CabeceraDePagina antetitulo="Historial" titulo="Tus sesiones">
        <p>
          Cada sesión con su área, sus series efectivas, la carga media y su progreso. Despliega una
          para ver sus series tal como llegaron, borrar una mal capturada o confirmar su fecha.
        </p>
      </CabeceraDePagina>
      {recurso.estado === 'error' && (
        <ErrorDeCarga mensaje={recurso.error} reintenta={recurso.recarga} />
      )}
      {datos === null && recurso.estado === 'cargando' && <Cargando />}
      {datos !== null && datos.total === 0 && (
        <Vacio icono="history" titulo="Todavía no hay sesiones">
          <p>
            Registra una serie desde el iPhone o desde <Enlace href="/registrar">Registrar</Enlace>.
          </p>
        </Vacio>
      )}
      {datos !== null && datos.total > 0 && (
        <section class="tarjeta historial" aria-labelledby="historial-resumen">
          <div class="tarjeta-titulo">
            <h3 id="historial-resumen" ref={resumen} tabIndex={-1}>
              Sesiones {primera}–{ultima} de {datos.total}
            </h3>
          </div>
          <p class="ayuda">
            <strong>Progreso</strong>: frente a la sesión anterior de la misma área, de −10 a +10.
            Un punto por cada 1 % que mejoró tu mejor serie de cada ejercicio que repetiste (carga,
            repeticiones y RIR). «—» es que no hay con qué comparar.
          </p>
          <div class="tabla-desplazable">
            <table class="tabla historial-tabla">
              <caption class="solo-lectores">
                Sesiones de la página {datos.pagina} de {datos.paginas}
              </caption>
              <thead>
                <tr>
                  <th scope="col">Sesión</th>
                  <th scope="col" class="col-amplia">
                    Área
                  </th>
                  <th scope="col" class="numero col-amplia">
                    Series efectivas
                  </th>
                  <th scope="col" class="numero col-amplia">
                    Carga media (lb)
                  </th>
                  <th scope="col" class="numero col-amplia">
                    Progreso
                  </th>
                </tr>
              </thead>
              <tbody>
                {datos.sesiones.map((s) => (
                  <FilaDeSesion
                    key={s.id}
                    sesion={s}
                    abierta={abiertas.has(s.id)}
                    alAlternar={() => alterna(s.id)}
                    zona={zona}
                    alCambiar={recurso.recarga}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <Paginacion pagina={datos.pagina} paginas={datos.paginas} alIr={irA} />
        </section>
      )}
      {/* Aparte de las páginas: siempre las últimas semanas (ADR-025). */}
      {datos !== null && datos.total > 0 && <GraficasDelHistorial />}
    </>
  );
}
