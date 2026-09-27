import { useState } from 'preact/hooks';
import type { Dashboard, GrupoDelDashboard } from '../../api/lectura/contrato';
import {
  Aviso,
  CabeceraDePagina,
  Cargando,
  Enlace,
  ErrorDeCarga,
  Vacio,
} from '../componentes/basicos';
import { Icono } from '../componentes/iconos';
import { leeVista, MapaMuscular } from '../componentes/mapa-muscular';
import { usePreferencia } from '../estado/preferencias';
import { useRecurso } from '../estado/recurso';
import { useUbicacion } from '../estado/ruta';
import { diasDesde, esHoy, instanteRelativo, rangoDeSemana } from '../formato/fechas';
import { anchoDeBarra, escalaDeBarras } from '../formato/numeros';

/**
 * PRINCIPAL: series efectivas por grupo esta semana. Todo número viene del
 * servidor; aquí no se suma ni se recalcula nada, tampoco el nivel de color.
 */

const ID_DE_TABLA = 'tabla-de-grupos';
/** Tantos días sin recibir nada, habiendo recibido antes, merecen un aviso en texto. */
const DIAS_DE_SILENCIO = 7;

function Frescura({ ultima, zona }: { ultima: string | null; zona: string }) {
  if (ultima === null) {
    return (
      <span class="insignia insignia-neutra">
        <span class="insignia-punto" aria-hidden="true" />
        Todavía no ha llegado ninguna serie
      </span>
    );
  }
  const hoy = esHoy(ultima, zona);
  return (
    <span class={`insignia${hoy ? '' : ' insignia-neutra'}`}>
      <span class={`insignia-punto${hoy ? ' late' : ''}`} aria-hidden="true" />
      Última serie recibida: {instanteRelativo(ultima, zona)}
    </span>
  );
}

function PrimerosPasos({ catalogoVacio }: { catalogoVacio: boolean }) {
  return (
    <section class="tarjeta primeros-pasos" aria-labelledby="titulo-primeros-pasos">
      <div class="tarjeta-titulo">
        <h3 id="titulo-primeros-pasos">Primeros pasos</h3>
      </div>
      <ol>
        <li>
          <div>
            <strong>Importa el catálogo base.</strong>{' '}
            {catalogoVacio ? (
              <>
                Elige tu equipamiento y trae los ejercicios con sus coeficientes ya puestos.{' '}
                <Enlace href="/catalogo">Ir al catálogo</Enlace>
              </>
            ) : (
              'Hecho.'
            )}
          </div>
        </li>
        <li>
          <div>
            <strong>Registra una serie</strong> desde el iPhone con los atajos o desde{' '}
            <Enlace href="/registrar">Registrar</Enlace>.
          </div>
        </li>
        <li>
          <div>
            <strong>Vuelve aquí.</strong> El número de cada grupo sale del motor en el servidor,
            igual para todas las pantallas.
          </div>
        </li>
      </ol>
    </section>
  );
}

function TextoDeReferencia({ grupo }: { grupo: GrupoDelDashboard }) {
  const r = grupo.referencia;
  if (r === null) return null;
  const estado =
    r.estado === 'dentro' ? 'Dentro' : r.estado === 'por-debajo' ? 'Por debajo' : 'Por encima';
  return (
    <span class="referencia">
      <strong>{estado}</strong> · rango {r.minimo.replace('.00', '')}–{r.maximo.replace('.00', '')},{' '}
      {r.respaldo === 'publicado' ? 'publicado' : 'criterio propio'}
    </span>
  );
}

function TablaDeGrupos({
  dashboard,
  activo,
  alActivar,
  conRangos,
}: {
  dashboard: Dashboard;
  activo: string | null;
  alActivar: (id: string | null) => void;
  conRangos: boolean;
}) {
  const escala = escalaDeBarras(dashboard.grupos.map((g) => g.series_efectivas));
  return (
    <table class="tabla tabla-grupos" id={ID_DE_TABLA}>
      <caption class="solo-lectores">Series efectivas por grupo muscular esta semana</caption>
      <thead>
        <tr>
          <th scope="col">Grupo</th>
          <th scope="col" class="celda-barra">
            <span class="solo-lectores">Barra</span>
          </th>
          <th scope="col" class="numero">
            Series
          </th>
        </tr>
      </thead>
      <tbody>
        {dashboard.grupos.map((g) => (
          <tr
            key={g.id}
            class={g.id === activo ? 'activa' : ''}
            onMouseEnter={() => alActivar(g.id)}
          >
            <td>
              <button
                type="button"
                class="nombre-de-grupo"
                onFocus={() => alActivar(g.id)}
                onClick={() => alActivar(g.id)}
                aria-describedby={`nivel-${g.id}`}
              >
                <span
                  class="leyenda-tramo muestra-de-nivel"
                  data-nivel={g.nivel}
                  aria-hidden="true"
                />
                {g.nombre}
              </button>
              <span id={`nivel-${g.id}`} class="solo-lectores">
                {dashboard.escala.find((t) => t.nivel === g.nivel)?.rotulo}
              </span>
              {conRangos && <TextoDeReferencia grupo={g} />}
            </td>
            <td class="celda-barra">
              <div class="barra" aria-hidden="true">
                <div
                  class="barra-relleno"
                  data-nivel={g.nivel}
                  style={{ width: `${anchoDeBarra(g.series_efectivas, escala)}%` }}
                />
              </div>
            </td>
            <td class="numero cifra">{g.series_efectivas}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function Resumen({ zona }: { zona: string }) {
  const recurso = useRecurso<Dashboard>('/api/lectura/v1/dashboard');
  const { consulta } = useUbicacion();
  const { vista, cara } = leeVista(consulta);
  const [activo, setActivo] = useState<string | null>(null);
  const [rangos, setRangos] = usePreferencia('rangos', 'si');

  const d = recurso.datos;
  const titulo =
    d === null ? 'Resumen de la semana' : rangoDeSemana(d.semana.desde, d.semana.hasta);

  return (
    <>
      <CabeceraDePagina
        antetitulo="Resumen · semana natural, lunes a domingo"
        titulo={titulo}
        acciones={
          <button type="button" class="boton-fantasma" onClick={recurso.recarga}>
            <Icono nombre="refresh-cw" tamano={16} />
            Actualizar
          </button>
        }
      >
        {d !== null && <Frescura ultima={d.frescura.ultima_serie_recibida} zona={zona} />}
      </CabeceraDePagina>

      {recurso.estado === 'error' && (
        <ErrorDeCarga mensaje={recurso.error} reintenta={recurso.recarga} />
      )}
      {d === null && recurso.estado === 'cargando' && <Cargando />}

      {d !== null && (
        <div class="formulario">
          {d.catalogo.ejercicios === 0 || d.frescura.ultima_serie_recibida === null ? (
            <PrimerosPasos catalogoVacio={d.catalogo.ejercicios === 0} />
          ) : null}

          {d.frescura.ultima_serie_recibida !== null &&
            diasDesde(d.frescura.ultima_serie_recibida, zona) >= DIAS_DE_SILENCIO && (
              <Aviso tipo="alerta">
                La última serie llegó {instanteRelativo(d.frescura.ultima_serie_recibida, zona)}. Si
                entrenaste desde entonces, abre el atajo «Sincronizar» en el teléfono: lo que esté
                en su cola todavía no ha llegado aquí.
              </Aviso>
            )}
          {d.diagnostico.series_sin_mapeo > 0 && (
            <Aviso tipo="alerta">
              {d.diagnostico.series_sin_mapeo === 1
                ? 'Una serie efectiva'
                : `${d.diagnostico.series_sin_mapeo} series efectivas`}{' '}
              de esta semana son de ejercicios sin grupos en tus parámetros: cuentan como efectivas
              pero no suman a ningún grupo. <Enlace href="/catalogo">Revisa el catálogo</Enlace>.
            </Aviso>
          )}
          {d.diagnostico.versiones_de_parametros.length > 1 && (
            <Aviso tipo="info">
              Esta semana mezcla {d.diagnostico.versiones_de_parametros.length} versiones de
              parámetros: cada sesión se leyó con los coeficientes y el umbral que regían su día.
            </Aviso>
          )}

          <ul class="estadisticas" aria-label="Esta semana">
            <li class="estadistica">
              <span class="estadistica-valor">{d.estadisticas.series_efectivas}</span>
              <span class="estadistica-rotulo">series efectivas</span>
            </li>
            <li class="estadistica">
              <span class="estadistica-valor">{d.estadisticas.sesiones}</span>
              <span class="estadistica-rotulo">
                {d.estadisticas.sesiones === 1 ? 'sesión' : 'sesiones'}
              </span>
            </li>
            <li class="estadistica">
              <span class="estadistica-valor">{d.estadisticas.grupos_sin_trabajo}</span>
              <span class="estadistica-rotulo">grupos sin trabajo</span>
            </li>
          </ul>

          {d.grupos.length === 0 ? (
            <Vacio icono="library" titulo="Todavía no tienes grupos musculares">
              <p>
                Importa el catálogo base para empezar con los dieciséis grupos y sus ejercicios.{' '}
                <Enlace href="/catalogo">Ir al catálogo</Enlace>
              </p>
            </Vacio>
          ) : (
            <div class="resumen-rejilla">
              <section class="tarjeta" aria-labelledby="titulo-tabla">
                <div class="tarjeta-titulo">
                  <div>
                    <h3 id="titulo-tabla">Series efectivas por grupo</h3>
                    <p>Calentamiento fuera; cada serie con el umbral de RIR de su día.</p>
                  </div>
                  <button
                    type="button"
                    class="boton-texto boton-pequeno"
                    aria-pressed={rangos === 'si'}
                    onClick={() => setRangos(rangos === 'si' ? 'no' : 'si')}
                  >
                    <Icono nombre={rangos === 'si' ? 'eye-off' : 'eye'} tamano={16} />
                    {rangos === 'si' ? 'Ocultar rangos' : 'Mostrar rangos'}
                  </button>
                </div>
                <div class="tabla-desplazable">
                  <TablaDeGrupos
                    dashboard={d}
                    activo={activo}
                    alActivar={setActivo}
                    conRangos={rangos === 'si'}
                  />
                </div>
              </section>
              <div class="resumen-mapa">
                <MapaMuscular
                  dashboard={d}
                  vista={vista}
                  cara={cara}
                  activo={activo}
                  alActivar={setActivo}
                  idDeTabla={ID_DE_TABLA}
                />
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
