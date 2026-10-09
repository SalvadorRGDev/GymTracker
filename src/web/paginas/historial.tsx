import type { Historial as DatosDeHistorial, SesionDelHistorial } from '../../api/lectura/contrato';
import {
  Aviso,
  BotonConConfirmacion,
  CabeceraDePagina,
  Cargando,
  Enlace,
  ErrorDeCarga,
  Vacio,
} from '../componentes/basicos';
import { Icono } from '../componentes/iconos';
import { pide } from '../estado/api';
import { usePreferencia } from '../estado/preferencias';
import { useRecurso } from '../estado/recurso';
import { fechaLarga, horaDe, partesDeFecha } from '../formato/fechas';

/**
 * El historial es el REGISTRO, no un resumen: el calentamiento se marca y se
 * conserva, un RIR ausente es «—» (nunca cero, que es el fallo), una sesión sin
 * cerrar se dice sin cerrar y la fecha por confirmar se enseña. No agrega, así
 * que tampoco declara frescura.
 */

function Sesion({
  sesion,
  zona,
  alCambiar,
}: {
  sesion: SesionDelHistorial;
  zona: string;
  alCambiar: () => void;
}) {
  const inicio = horaDe(sesion.iniciada_en, zona);
  const hoyAnio = partesDeFecha(new Date().toISOString().slice(0, 10)).anio;
  const anio = partesDeFecha(sesion.fecha_logica).anio;
  return (
    <article class="tarjeta" aria-labelledby={`sesion-${sesion.id}`}>
      <div class="sesion-cabecera">
        <h3 id={`sesion-${sesion.id}`}>{fechaLarga(sesion.fecha_logica, anio !== hoyAnio)}</h3>
        <div class="sesion-meta">
          <span>
            {sesion.finalizada_en === null
              ? `desde las ${inicio} · sin cerrar`
              : `${inicio}–${horaDe(sesion.finalizada_en, zona)}`}
          </span>
          <span class="etiqueta-pequena">{sesion.origen === 'captura' ? 'Atajo' : 'Web'}</span>
          {sesion.fecha_por_confirmar && (
            <span class="etiqueta-pequena aviso">Fecha por confirmar</span>
          )}
        </div>
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
            <caption class="solo-lectores">Series de la sesión</caption>
            <thead>
              <tr>
                <th scope="col" class="numero">
                  #
                </th>
                <th scope="col">Ejercicio</th>
                <th scope="col" class="numero">
                  Reps
                </th>
                <th scope="col" class="numero">
                  Carga
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
                  <td class="numero cifra">{s.orden}</td>
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
                  <td class="numero cifra">{s.carga_lb} lb</td>
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
    </article>
  );
}

export function Historial({ zona }: { zona: string }) {
  const [limite, setLimite] = usePreferencia('limite-historial', '30');
  const recurso = useRecurso<DatosDeHistorial>(`/api/lectura/v1/historial?limite=${limite}`);
  const datos = recurso.datos;

  return (
    <>
      <CabeceraDePagina
        antetitulo="Historial"
        titulo="Lo que se registró, tal cual"
        acciones={
          <div class="campo">
            <label for="limite">Mostrar</label>
            <select
              id="limite"
              class="selector"
              value={limite}
              onChange={(e) => setLimite((e.target as HTMLSelectElement).value)}
            >
              <option value="30">Últimas 30 sesiones</option>
              <option value="60">Últimas 60 sesiones</option>
              <option value="100">Últimas 100 sesiones</option>
            </select>
          </div>
        }
      >
        <p>
          Cada serie como llegó. El calentamiento se ve y no cuenta volumen; un RIR que no se dio es
          «—», nunca cero. Una serie mal capturada se borra entera, a la vista.
        </p>
      </CabeceraDePagina>
      {recurso.estado === 'error' && (
        <ErrorDeCarga mensaje={recurso.error} reintenta={recurso.recarga} />
      )}
      {datos === null && recurso.estado === 'cargando' && <Cargando />}
      {datos !== null && datos.sesiones.length === 0 && (
        <Vacio icono="history" titulo="Todavía no hay sesiones">
          <p>
            Registra una serie desde el iPhone o desde <Enlace href="/registrar">Registrar</Enlace>.
          </p>
        </Vacio>
      )}
      {datos !== null && datos.sesiones.length > 0 && (
        <div class="sesiones">
          {datos.sesiones.map((s) => (
            <Sesion key={s.id} sesion={s} zona={zona} alCambiar={recurso.recarga} />
          ))}
        </div>
      )}
    </>
  );
}
