import { useEffect, useMemo, useState } from 'preact/hooks';
import type { Catalogo, CatalogoBaseConPerfiles } from '../../api/lectura/contrato';
import type {
  Planes as DatosDePlanes,
  VersionCompleta,
  VolumenDeVersion,
} from '../../api/planes/contrato';
import { type FechaLogica, sumaDias } from '../../domain/volume/fecha-logica';
import {
  Aviso,
  BotonConConfirmacion,
  CabeceraDePagina,
  Cargando,
  Enlace,
  ErrorDeCarga,
  Respuesta,
  Vacio,
} from '../componentes/basicos';
import { BotonVerEjemplo } from '../componentes/boton-ver-ejemplo';
import { Icono } from '../componentes/iconos';
import { mensajeDe, pide } from '../estado/api';
import { useRecurso } from '../estado/recurso';
import { actualizaConsulta, useUbicacion } from '../estado/ruta';
import { fechaLarga } from '../formato/fechas';
import { normalizaNombre } from '../formato/numeros';

/**
 * Rutinas: planes con versiones, un constructor por día del ciclo y
 * plantillas. El volumen de un borrador SE LEE (`GET /versiones/:id/volumen`):
 * sumarlo aquí sería el motor duplicado y su primer síntoma, un total del
 * editor que no cuadra con el de la proyección.
 */

interface Borrador {
  readonly clave: string;
  readonly dia: number;
  readonly tipo: 'ejercicio' | 'grupo';
  readonly destino: string;
  readonly objetivo: string;
}

let contadorLocal = 0;
const claveLocal = () => `e${++contadorLocal}`;

function Volumen({ id, version }: { id: string; version: number }) {
  const recurso = useRecurso<VolumenDeVersion>(
    `/api/planes/v1/versiones/${id}/volumen?v=${version}`,
  );
  const v = recurso.datos;
  if (recurso.estado === 'error')
    return <ErrorDeCarga mensaje={recurso.error} reintenta={recurso.recarga} />;
  if (v === null) return <Cargando texto="Calculando el volumen en el servidor…" />;
  return (
    <section class="tarjeta" aria-labelledby="titulo-volumen">
      <div class="tarjeta-titulo">
        <div>
          <h3 id="titulo-volumen">Volumen que pide esta versión</h3>
          <p>
            {v.semanas_de_la_ventana === 1
              ? 'Series efectivas por semana, calculadas por el motor.'
              : `Media semanal sobre ${v.semanas_de_la_ventana} semanas (un ciclo de ${v.ciclo_dias} días no cuadra con la semana).`}
          </p>
        </div>
      </div>
      <div class="tabla-desplazable">
        <table class="tabla">
          <thead>
            <tr>
              <th scope="col">Grupo</th>
              <th scope="col" class="numero">
                Por semana
              </th>
              <th scope="col">Rango de referencia</th>
            </tr>
          </thead>
          <tbody>
            {v.grupos.map((g) => (
              <tr key={g.id}>
                <td>{g.nombre}</td>
                <td class="numero cifra">{g.series_por_semana}</td>
                <td>
                  {g.referencia === null ? (
                    <span class="referencia">sin rango (grupo propio)</span>
                  ) : (
                    <span class="referencia">
                      {g.referencia.minimo.replace('.00', '')}–
                      {g.referencia.maximo.replace('.00', '')}:{' '}
                      <strong>
                        {g.referencia.estado === 'dentro'
                          ? 'dentro'
                          : g.referencia.estado === 'por-debajo'
                            ? 'por debajo'
                            : 'por encima'}
                      </strong>
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {v.entradas_sin_mapeo > 0 && (
        <Aviso tipo="alerta">
          Hay entradas de ejercicios sin grupos en tus parámetros: no suman a ningún grupo.
        </Aviso>
      )}
    </section>
  );
}

function Asignar({
  versionId,
  hoy,
  alAsignar,
}: {
  versionId: string;
  hoy: string;
  alAsignar: () => void;
}) {
  const [desde, setDesde] = useState(() => sumaDias(hoy as FechaLogica, 1));
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);
  return (
    <form
      class="tarjeta formulario"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          await pide('POST', '/api/planes/v1/asignaciones', { version_id: versionId, desde });
          setMensaje({ tipo: 'exito', texto: `Asignada desde el ${fechaLarga(desde, true)}.` });
          alAsignar();
        } catch (error) {
          setMensaje({ tipo: 'error', texto: mensajeDe(error) });
        }
      }}
    >
      <h3>Asignar esta versión</h3>
      <p class="ayuda">
        La fecha es el ANCLA: el día 1 del ciclo. Si ya hay un plan vigente, se cierra por arriba
        ese mismo día. Una asignación no se re-apunta ni se le mueve el inicio: renumeraría el
        histórico.
      </p>
      <div class="fila-de-campos">
        <div class="campo">
          <label for="asignar-desde">Desde</label>
          <input
            id="asignar-desde"
            class="entrada"
            type="date"
            value={desde}
            onInput={(e) => setDesde((e.target as HTMLInputElement).value as FechaLogica)}
          />
        </div>
      </div>
      <div class="acciones">
        <button type="submit" class="boton">
          <Icono nombre="calendar" tamano={16} />
          Asignar
        </button>
      </div>
      <Respuesta>
        {mensaje !== null && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}
      </Respuesta>
    </form>
  );
}

function EditorDeVersion({
  id,
  catalogo,
  hoy,
  alCambiar,
}: {
  id: string;
  catalogo: Catalogo;
  hoy: string;
  alCambiar: () => void;
}) {
  const recurso = useRecurso<VersionCompleta>(`/api/planes/v1/versiones/${id}`);
  const v = recurso.datos;
  const [ciclo, setCiclo] = useState(7);
  const [entradas, setEntradas] = useState<Borrador[]>([]);
  const [sucio, setSucio] = useState(false);
  const [guardadas, setGuardadas] = useState(0);
  const [mensaje, setMensaje] = useState<{ tipo: 'exito' | 'error'; texto: string } | null>(null);

  useEffect(() => {
    if (v === null || sucio) return;
    setCiclo(v.ciclo_dias);
    setEntradas(
      v.lista_de_entradas.map((e) => ({
        clave: claveLocal(),
        dia: e.dia,
        tipo: e.ejercicio_id !== null ? 'ejercicio' : 'grupo',
        destino: e.ejercicio_id ?? e.grupo_id ?? '',
        objetivo: e.objetivo,
      })),
    );
  }, [v]);

  const ejercicios = catalogo.ejercicios.filter((e) => !e.archivado);
  if (recurso.estado === 'error')
    return <ErrorDeCarga mensaje={recurso.error} reintenta={recurso.recarga} />;
  if (v === null) return <Cargando />;
  const publicada = v.publicada_en !== null;

  const cambia = (clave: string, cambios: Partial<Borrador>) => {
    setEntradas((lista) => lista.map((e) => (e.clave === clave ? { ...e, ...cambios } : e)));
    setSucio(true);
  };
  const anade = (dia: number, tipo: 'ejercicio' | 'grupo') => {
    const destino =
      tipo === 'ejercicio' ? (ejercicios[0]?.id ?? '') : (catalogo.grupos[0]?.id ?? '');
    setEntradas((lista) => [...lista, { clave: claveLocal(), dia, tipo, destino, objetivo: '3' }]);
    setSucio(true);
  };
  const quita = (clave: string) => {
    setEntradas((lista) => lista.filter((e) => e.clave !== clave));
    setSucio(true);
  };

  const guarda = async () => {
    setMensaje(null);
    try {
      await pide('PUT', `/api/planes/v1/versiones/${id}/entradas`, {
        ciclo_dias: ciclo,
        entradas: entradas.map((e) => ({
          dia: e.dia,
          ...(e.tipo === 'ejercicio' ? { ejercicio_id: e.destino } : { grupo_id: e.destino }),
          objetivo: e.objetivo.trim().replace(',', '.'),
        })),
      });
      setSucio(false);
      setGuardadas((n) => n + 1);
      setMensaje({ tipo: 'exito', texto: 'Guardada. El volumen de abajo es el de lo guardado.' });
      recurso.recarga();
      alCambiar();
    } catch (error) {
      setMensaje({ tipo: 'error', texto: mensajeDe(error) });
    }
  };

  const dias = Array.from({ length: ciclo }, (_, i) => i + 1);
  return (
    <>
      <CabeceraDePagina
        antetitulo={`Rutina · versión ${v.numero} · ${publicada ? 'publicada' : 'borrador'}`}
        titulo={v.plan_nombre}
        acciones={
          <button
            type="button"
            class="boton-texto"
            onClick={() => actualizaConsulta({ version: null })}
          >
            Volver a las rutinas
          </button>
        }
      >
        <p>
          {publicada
            ? 'Publicada: ya no cambia. Para retocarla, crea una versión nueva copiándola.'
            : 'Un objetivo por ejercicio (o grupo) y día del ciclo, en series efectivas. Guardar reemplaza la versión entera: lo que no esté aquí desaparece.'}
        </p>
      </CabeceraDePagina>

      <div class="formulario">
        {!publicada && (
          <div class="tarjeta formulario">
            <div class="fila-de-campos">
              <div class="campo">
                <label for="ciclo">Días del ciclo</label>
                <input
                  id="ciclo"
                  class="entrada"
                  type="number"
                  min={1}
                  max={28}
                  value={ciclo}
                  onInput={(e) => {
                    const n = Number((e.target as HTMLInputElement).value);
                    if (Number.isInteger(n) && n >= 1 && n <= 28) {
                      setCiclo(n);
                      setSucio(true);
                    }
                  }}
                />
                <span class="ayuda">
                  No tiene por qué ser una semana: un ciclo de 4 días rota sobre el calendario.
                </span>
              </div>
            </div>
          </div>
        )}

        <div class="dias-del-ciclo">
          {dias.map((dia) => {
            const delDia = entradas.filter((e) => e.dia === dia);
            return (
              <section key={dia} class="dia" aria-label={`Día ${dia}`}>
                <div class="dia-cabecera">
                  <span>Día {dia}</span>
                  <span class="etiqueta-pequena">
                    {delDia.length === 0 ? 'descanso' : `${delDia.length} objetivos`}
                  </span>
                </div>
                {delDia.map((e) => (
                  <div key={e.clave} class="entrada-de-plan">
                    <select
                      class="selector"
                      aria-label={`Destino del día ${dia}`}
                      disabled={publicada}
                      value={e.destino}
                      onChange={(ev) =>
                        cambia(e.clave, { destino: (ev.target as HTMLSelectElement).value })
                      }
                    >
                      {e.tipo === 'ejercicio'
                        ? ejercicios.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.nombre}
                            </option>
                          ))
                        : catalogo.grupos.map((g) => (
                            <option key={g.id} value={g.id}>
                              Grupo: {g.nombre}
                            </option>
                          ))}
                    </select>
                    {(() => {
                      const elegido =
                        e.tipo === 'ejercicio'
                          ? catalogo.ejercicios.find((x) => x.id === e.destino)
                          : undefined;
                      return elegido === undefined || elegido.base_id === null ? null : (
                        <BotonVerEjemplo
                          baseId={elegido.base_id}
                          nombre={elegido.nombre}
                          compacto
                        />
                      );
                    })()}
                    <input
                      class="entrada"
                      aria-label={`Series del día ${dia}`}
                      inputMode="decimal"
                      disabled={publicada}
                      value={e.objetivo}
                      onInput={(ev) =>
                        cambia(e.clave, { objetivo: (ev.target as HTMLInputElement).value })
                      }
                    />
                    {!publicada && (
                      <button
                        type="button"
                        class="boton-texto boton-pequeno"
                        aria-label="Quitar objetivo"
                        onClick={() => quita(e.clave)}
                      >
                        <Icono nombre="x" tamano={16} />
                      </button>
                    )}
                  </div>
                ))}
                {!publicada && (
                  <div class="acciones">
                    <button
                      type="button"
                      class="boton-texto boton-pequeno"
                      onClick={() => anade(dia, 'ejercicio')}
                    >
                      <Icono nombre="plus" tamano={14} /> Ejercicio
                    </button>
                    <button
                      type="button"
                      class="boton-texto boton-pequeno"
                      onClick={() => anade(dia, 'grupo')}
                    >
                      <Icono nombre="plus" tamano={14} /> Grupo
                    </button>
                  </div>
                )}
              </section>
            );
          })}
        </div>

        {!publicada && (
          <div class="tarjeta formulario">
            <p class="ayuda">
              Guardar reemplaza TODAS las entradas de este borrador. Después, el volumen se lee del
              servidor.
            </p>
            <div class="acciones">
              <button type="button" class="boton" onClick={() => void guarda()}>
                <Icono nombre="check" tamano={16} />
                Guardar borrador
              </button>
              {!sucio && v.entradas > 0 && (
                <BotonConConfirmacion
                  etiqueta="Publicar"
                  pregunta="Publicar es irreversible"
                  confirmar="Publicar"
                  peligroso={false}
                  icono="send"
                  alConfirmar={async () => {
                    try {
                      await pide('POST', `/api/planes/v1/versiones/${id}/publicacion`);
                      recurso.recarga();
                      alCambiar();
                    } catch (error) {
                      setMensaje({ tipo: 'error', texto: mensajeDe(error) });
                    }
                  }}
                />
              )}
              {sucio && <span class="etiqueta-pequena aviso">Cambios sin guardar</span>}
            </div>
            <Respuesta>
              {mensaje !== null && <Aviso tipo={mensaje.tipo}>{mensaje.texto}</Aviso>}
            </Respuesta>
          </div>
        )}

        {v.entradas > 0 && <Volumen id={id} version={guardadas} />}

        {publicada && (
          <div class="rejilla-2">
            <Asignar versionId={id} hoy={hoy} alAsignar={alCambiar} />
            <div class="tarjeta formulario">
              <h3>Retocarla</h3>
              <p class="ayuda">
                Se crea la versión {v.numero + 1} como borrador, con estas mismas entradas.
              </p>
              <div class="acciones">
                <button
                  type="button"
                  class="boton-fantasma"
                  onClick={async () => {
                    const nueva = await pide<VersionCompleta>(
                      'POST',
                      `/api/planes/v1/${v.plan_id}/versiones`,
                      {
                        copiar_de: id,
                      },
                    );
                    alCambiar();
                    actualizaConsulta({ version: nueva.id });
                  }}
                >
                  <Icono nombre="copy" tamano={16} />
                  Nueva versión copiándola
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function NuevaRutina({
  catalogo,
  base,
  alCrear,
  alImportar,
}: {
  catalogo: Catalogo;
  base: CatalogoBaseConPerfiles | null;
  alCrear: (versionId: string) => void;
  /** Vuelve a pedir el catálogo: la plantilla elegida y el nombre escrito se quedan. */
  alImportar: () => void;
}) {
  const [plantillaId, setPlantillaId] = useState('');
  const [nombre, setNombre] = useState('');
  const [ciclo, setCiclo] = useState('7');
  const [mensaje, setMensaje] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const plantilla = base?.plantillas.find((p) => p.id === plantillaId) ?? null;
  const delUsuario = useMemo(
    () =>
      new Map(
        catalogo.ejercicios
          .filter((e) => !e.archivado)
          .map((e) => [normalizaNombre(e.nombre), e.id]),
      ),
    [catalogo],
  );
  const nombreBase = useMemo(
    () => new Map((base?.ejercicios ?? []).map((e) => [e.id, e.nombre])),
    [base],
  );
  const faltan =
    plantilla === null
      ? []
      : [
          ...new Set(
            plantilla.dias.flatMap((d) =>
              d.entradas
                .map((e) => e.ejercicio)
                .filter((id) => !delUsuario.has(normalizaNombre(nombreBase.get(id) ?? id))),
            ),
          ),
        ];

  useEffect(() => {
    if (plantilla !== null) {
      setNombre(plantilla.nombre);
      setCiclo(String(plantilla.ciclo_dias));
    }
  }, [plantillaId]);

  const crea = async (evento: Event) => {
    evento.preventDefault();
    setOcupado(true);
    setMensaje(null);
    try {
      const creada = await pide<VersionCompleta>('POST', '/api/planes/v1', {
        nombre: nombre.trim(),
        ciclo_dias: Number(ciclo),
      });
      if (plantilla !== null) {
        const entradas = plantilla.dias.flatMap((d) =>
          d.entradas.flatMap((e) => {
            const id = delUsuario.get(normalizaNombre(nombreBase.get(e.ejercicio) ?? ''));
            return id === undefined ? [] : [{ dia: d.dia, ejercicio_id: id, objetivo: e.series }];
          }),
        );
        await pide('PUT', `/api/planes/v1/versiones/${creada.id}/entradas`, { entradas });
      }
      alCrear(creada.id);
    } catch (error) {
      setMensaje(mensajeDe(error));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <form class="tarjeta formulario" onSubmit={crea} aria-labelledby="titulo-nueva">
      <h3 id="titulo-nueva">Nueva rutina</h3>
      <div class="campo">
        <label for="plantilla">Empezar desde</label>
        <select
          id="plantilla"
          class="selector"
          value={plantillaId}
          onChange={(e) => setPlantillaId((e.target as HTMLSelectElement).value)}
        >
          <option value="">Una rutina vacía</option>
          {(base?.plantillas ?? []).map((p) => (
            <option key={p.id} value={p.id}>
              Plantilla: {p.nombre}
            </option>
          ))}
        </select>
        {plantilla !== null && <span class="ayuda">{plantilla.descripcion}</span>}
      </div>
      {faltan.length > 0 && (
        <Aviso tipo="alerta">
          <p>
            A tu catálogo le faltan {faltan.length} ejercicios de esta plantilla (
            {faltan.map((id) => nombreBase.get(id) ?? id).join(', ')}).
          </p>
          <button
            type="button"
            class="boton-fantasma boton-pequeno"
            onClick={async () => {
              try {
                await pide('POST', '/api/lectura/v1/catalogo/importa', {
                  grupos: [],
                  ejercicios: faltan,
                });
                alImportar();
              } catch (error) {
                setMensaje(mensajeDe(error));
              }
            }}
          >
            <Icono nombre="import" tamano={16} />
            Importarlos del catálogo base
          </button>
        </Aviso>
      )}
      <div class="fila-de-campos">
        <div class="campo">
          <label for="nombre-rutina">Nombre</label>
          <input
            id="nombre-rutina"
            class="entrada"
            required
            maxLength={80}
            value={nombre}
            onInput={(e) => setNombre((e.target as HTMLInputElement).value)}
          />
        </div>
        <div class="campo">
          <label for="ciclo-rutina">Días del ciclo</label>
          <input
            id="ciclo-rutina"
            class="entrada"
            type="number"
            min={1}
            max={28}
            value={ciclo}
            onInput={(e) => setCiclo((e.target as HTMLInputElement).value)}
          />
        </div>
      </div>
      <div class="acciones">
        <button
          type="submit"
          class="boton"
          disabled={ocupado || nombre.trim() === '' || faltan.length > 0}
        >
          <Icono nombre="plus" tamano={16} />
          Crear borrador
        </button>
      </div>
      <Respuesta>{mensaje !== null && <Aviso tipo="error">{mensaje}</Aviso>}</Respuesta>
    </form>
  );
}

export function Planes() {
  const planes = useRecurso<DatosDePlanes>('/api/planes/v1');
  const catalogo = useRecurso<Catalogo>('/api/lectura/v1/catalogo');
  const base = useRecurso<CatalogoBaseConPerfiles>('/api/lectura/v1/catalogo/base');
  const { consulta } = useUbicacion();
  const enEdicion = consulta.get('version');

  if (planes.estado === 'error')
    return <ErrorDeCarga mensaje={planes.error} reintenta={planes.recarga} />;
  if (catalogo.estado === 'error')
    return <ErrorDeCarga mensaje={catalogo.error} reintenta={catalogo.recarga} />;
  const p = planes.datos;
  const c = catalogo.datos;
  if (p === null || c === null) return <Cargando />;

  if (enEdicion !== null) {
    return <EditorDeVersion id={enEdicion} catalogo={c} hoy={p.hoy} alCambiar={planes.recarga} />;
  }

  const nombreDeVersion = (versionId: string) => {
    for (const plan of p.planes) {
      const v = plan.versiones.find((x) => x.id === versionId);
      if (v !== undefined) return `${plan.nombre} · v${v.numero}`;
    }
    return 'Versión desconocida';
  };

  return (
    <>
      <CabeceraDePagina antetitulo="Rutinas" titulo="Planes por día del ciclo">
        <p>
          Una rutina tiene versiones. Un borrador se edita; una versión publicada ya no cambia, y es
          la que se asigna desde una fecha. Cada semana se compara con el plan que regía entonces.
        </p>
      </CabeceraDePagina>

      {c.ejercicios.length === 0 && (
        <Aviso tipo="info">
          Tu catálogo está vacío: <Enlace href="/catalogo">importa el catálogo base</Enlace> antes
          de montar una rutina.
        </Aviso>
      )}

      <div class="rejilla-2">
        <section class="formulario" aria-labelledby="titulo-rutinas">
          <h2 id="titulo-rutinas">Tus rutinas</h2>
          {p.planes.length === 0 ? (
            <Vacio icono="calendar-range" titulo="Todavía no hay rutinas">
              <p>Crea una vacía o empieza desde una de las cinco plantillas.</p>
            </Vacio>
          ) : (
            p.planes.map((plan) => (
              <article key={plan.id} class="tarjeta tarjeta-compacta">
                <h3>{plan.nombre}</h3>
                <ul class="linea-de-tiempo">
                  {plan.versiones.map((v) => (
                    <li key={v.id}>
                      <span>
                        Versión {v.numero} · {v.ciclo_dias} días · {v.entradas} objetivos
                      </span>
                      <span class="acciones">
                        <span class={`etiqueta-pequena${v.publicada_en === null ? '' : ' exito'}`}>
                          {v.publicada_en === null ? 'Borrador' : 'Publicada'}
                        </span>
                        <button
                          type="button"
                          class="boton-texto boton-pequeno"
                          onClick={() => actualizaConsulta({ version: v.id })}
                        >
                          <Icono nombre={v.publicada_en === null ? 'pencil' : 'eye'} tamano={14} />
                          {v.publicada_en === null ? 'Editar' : 'Ver'}
                        </button>
                      </span>
                    </li>
                  ))}
                </ul>
              </article>
            ))
          )}
          <NuevaRutina
            catalogo={c}
            base={base.datos}
            alCrear={(id) => {
              planes.recarga();
              actualizaConsulta({ version: id });
            }}
            alImportar={catalogo.recarga}
          />
        </section>

        <section class="formulario" aria-labelledby="titulo-asignaciones">
          <h2 id="titulo-asignaciones">Asignaciones</h2>
          {p.asignaciones.length === 0 ? (
            <Vacio icono="calendar" titulo="Ningún plan asignado">
              <p>Publica una versión y asígnala desde una fecha para verla en la proyección.</p>
            </Vacio>
          ) : (
            <ul class="linea-de-tiempo">
              {[...p.asignaciones].reverse().map((a) => (
                <li key={a.id}>
                  <span>
                    <strong>{nombreDeVersion(a.plan_version_id)}</strong>
                    <br />
                    desde el {fechaLarga(a.vigente_desde, true)} (día 1 del ciclo)
                    {a.vigente_hasta === null
                      ? ' · vigente'
                      : ` · hasta el ${fechaLarga(a.vigente_hasta, true)}`}
                  </span>
                  {a.cubre_sesiones ? (
                    <span class="referencia">Ya cubre sesiones registradas: no se retira.</span>
                  ) : (
                    <BotonConConfirmacion
                      etiqueta="Retirar"
                      pregunta="¿Retirar esta asignación?"
                      confirmar="Retirar"
                      pequeno
                      alConfirmar={async () => {
                        await pide('DELETE', `/api/planes/v1/asignaciones/${a.id}`);
                        planes.recarga();
                      }}
                    />
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </>
  );
}
