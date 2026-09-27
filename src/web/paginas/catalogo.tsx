import { useMemo, useState } from 'preact/hooks';
import type {
  CatalogoBaseConPerfiles,
  Catalogo as DatosDeCatalogo,
  ResultadoDeImportacion,
  ResultadoDeParametros,
} from '../../api/lectura/contrato';
import { Aviso, CabeceraDePagina, Cargando, ErrorDeCarga, Respuesta } from '../componentes/basicos';
import { Icono } from '../componentes/iconos';
import { mensajeDe, pide } from '../estado/api';
import { usePreferencia } from '../estado/preferencias';
import { useRecurso } from '../estado/recurso';
import { fechaLarga } from '../formato/fechas';
import { normalizaNombre, paraBuscar } from '../formato/numeros';

/**
 * El catálogo se IMPORTA antes que teclearse (ADR-012): elegir un perfil,
 * afinar la lista e importar. El cliente manda identificadores, nunca
 * coeficientes. Los parámetros se versionan, no se editan: la pantalla dice
 * antes de guardar qué va a pasar y después qué pasó.
 */

function explicaCamino(camino: string, vigenteDesde: string): string {
  if (camino === 'sin-cambios')
    return 'No había nada nuevo que añadir: tus parámetros siguen igual.';
  if (camino === 'en-sitio') {
    return 'Ninguna sesión fijaba tus parámetros, así que se actualizaron en sitio y rigen ya, hoy incluido.';
  }
  return `Había sesiones que fijaban la versión anterior: se creó una nueva que rige desde el ${fechaLarga(vigenteDesde, true)}. Lo ya registrado no cambia.`;
}

function Importacion({
  base,
  alImportar,
}: {
  base: CatalogoBaseConPerfiles;
  alImportar: () => void;
}) {
  const porOmision = base.perfiles.find((p) => p.por_omision)?.id ?? base.perfiles[0]?.id ?? '';
  const [perfil, setPerfil] = usePreferencia('perfil', porOmision);
  const idsDelPerfil = base.ejercicios_por_perfil[perfil] ?? [];
  const [quitados, setQuitados] = useState<ReadonlySet<string>>(new Set());
  const [filtro, setFiltro] = useState('');
  const [resultado, setResultado] = useState<ResultadoDeImportacion | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const ejercicios = base.ejercicios.filter((e) => idsDelPerfil.includes(e.id));
  const visibles = ejercicios.filter(
    (e) =>
      filtro === '' ||
      [e.nombre, ...e.alias].some((t) => paraBuscar(t).includes(paraBuscar(filtro))),
  );
  const elegidos = ejercicios.filter((e) => !quitados.has(e.id));
  const perfilActual = base.perfiles.find((p) => p.id === perfil);

  const importa = async () => {
    setOcupado(true);
    setError(null);
    try {
      const r = await pide<ResultadoDeImportacion>('POST', '/api/lectura/v1/catalogo/importa', {
        grupos: base.grupos.map((g) => g.id),
        ejercicios: elegidos.map((e) => e.id),
      });
      setResultado(r);
      alImportar();
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <section class="tarjeta formulario" aria-labelledby="titulo-importar">
      <div class="tarjeta-titulo">
        <div>
          <h3 id="titulo-importar">Importar el catálogo base</h3>
          <p>
            {base.grupos.length} grupos y {base.ejercicios.length} ejercicios con coeficientes
            justificados. Se copian a tu libro y desde ahí son tuyos; importar dos veces no duplica
            ni pisa tus ajustes.
          </p>
        </div>
      </div>
      <fieldset class="perfiles sin-marco">
        <legend class="solo-lectores">Equipamiento</legend>
        {base.perfiles.map((p) => (
          <button
            key={p.id}
            type="button"
            class="perfil"
            aria-pressed={p.id === perfil}
            onClick={() => {
              setPerfil(p.id);
              setQuitados(new Set());
            }}
          >
            <strong>{p.nombre}</strong>
            <span>{p.descripcion}</span>
            <span>{(base.ejercicios_por_perfil[p.id] ?? []).length} ejercicios</span>
          </button>
        ))}
      </fieldset>
      {perfilActual !== undefined && perfilActual.sin_cobertura.length > 0 && (
        <Aviso tipo="info">
          Con este equipamiento no hay ejercicio principal para:{' '}
          {perfilActual.sin_cobertura
            .map((g) => base.grupos.find((x) => x.id === g)?.nombre ?? g)
            .join(', ')}
          . Esos grupos se importan igual y saldrán con su número.
        </Aviso>
      )}
      <details class="plegable">
        <summary>
          <Icono nombre="chevron-down" tamano={16} />
          Afinar la lista ({elegidos.length} de {ejercicios.length})
        </summary>
        <div class="formulario plegable-contenido">
          <div class="campo">
            <label for="filtro-base">Filtrar</label>
            <input
              id="filtro-base"
              class="entrada"
              type="search"
              value={filtro}
              onInput={(e) => setFiltro((e.target as HTMLInputElement).value)}
            />
          </div>
          <ul class="lista-de-ejercicios">
            {visibles.map((e) => (
              <li key={e.id}>
                <label>
                  <span>
                    <input
                      type="checkbox"
                      checked={!quitados.has(e.id)}
                      onChange={() => {
                        const nuevos = new Set(quitados);
                        if (nuevos.has(e.id)) nuevos.delete(e.id);
                        else nuevos.add(e.id);
                        setQuitados(nuevos);
                      }}
                    />{' '}
                    {e.nombre}
                  </span>
                  <span class="equipo">
                    {Object.entries(e.coeficientes)
                      .filter(([, c]) => c === '1.00')
                      .map(([g]) => base.grupos.find((x) => x.id === g)?.nombre ?? g)
                      .join('')}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      </details>
      <div class="acciones">
        <button
          type="button"
          class="boton"
          disabled={ocupado || elegidos.length === 0}
          onClick={() => void importa()}
        >
          <Icono nombre="import" tamano={16} />
          Importar {elegidos.length} ejercicios
        </button>
      </div>
      <Respuesta>
        {error !== null && <Aviso tipo="error">{error}</Aviso>}
        {resultado !== null && (
          <Aviso tipo="exito">
            <p>
              {resultado.ejercicios_creados} ejercicios y {resultado.grupos_creados} grupos nuevos;{' '}
              {resultado.ejercicios_reutilizados} ejercicios ya estaban.{' '}
              {resultado.contribuciones_creadas} coeficientes añadidos y{' '}
              {resultado.contribuciones_conservadas} tuyos conservados sin tocar.
            </p>
            <p>{explicaCamino(resultado.camino, resultado.vigente_desde)}</p>
          </Aviso>
        )}
      </Respuesta>
    </section>
  );
}

function NuevoNombre({
  que,
  url,
  alCrear,
}: {
  que: 'grupo' | 'ejercicio';
  url: string;
  alCrear: () => void;
}) {
  const [nombre, setNombre] = useState('');
  const [mensaje, setMensaje] = useState<string | null>(null);
  return (
    <form
      class="acciones"
      onSubmit={async (e) => {
        e.preventDefault();
        setMensaje(null);
        try {
          await pide('POST', url, { nombre: nombre.trim() });
          setNombre('');
          alCrear();
        } catch (error) {
          setMensaje(mensajeDe(error));
        }
      }}
    >
      <label for={`nuevo-${que}`} class="solo-lectores">
        Nombre del {que} nuevo
      </label>
      <input
        id={`nuevo-${que}`}
        class="entrada entrada-corta"
        placeholder={que === 'grupo' ? 'Nuevo grupo' : 'Nuevo ejercicio'}
        maxLength={60}
        value={nombre}
        onInput={(e) => setNombre((e.target as HTMLInputElement).value)}
      />
      <button type="submit" class="boton-fantasma" disabled={nombre.trim() === ''}>
        <Icono nombre="plus" tamano={16} />
        Crear
      </button>
      <Respuesta>{mensaje !== null && <span class="error-de-campo">{mensaje}</span>}</Respuesta>
    </form>
  );
}

/**
 * El editor de coeficientes está PLEGADO, y plegado significa que sus campos
 * ni se pintan. Envía la propuesta ENTERA —archivados incluidos—: un par que no
 * se envía desaparece de la versión nueva.
 */
function EditorDeParametros({
  catalogo,
  alGuardar,
}: {
  catalogo: DatosDeCatalogo;
  alGuardar: () => void;
}) {
  const [abierto, setAbierto] = useState(false);
  const [umbral, setUmbral] = useState(String(catalogo.parametros.umbral_rir));
  const [borrador, setBorrador] = useState<Map<string, string>>(
    () =>
      new Map(
        catalogo.parametros.contribuciones.map((c) => [
          `${c.ejercicio_id}|${c.grupo_id}`,
          c.coeficiente,
        ]),
      ),
  );
  const [ejercicio, setEjercicio] = useState(catalogo.ejercicios[0]?.id ?? '');
  const [resultado, setResultado] = useState<ResultadoDeParametros | null>(null);
  const [error, setError] = useState<string | null>(null);

  const invalidos = [...borrador.entries()].filter(
    ([, v]) => v !== '' && !/^(?:[01](?:\.\d{1,2})?|2(?:\.0{1,2})?)$/.test(v),
  );

  const guarda = async () => {
    setError(null);
    try {
      const contribuciones = [...borrador.entries()]
        .filter(([, v]) => v.trim() !== '' && Number(v) > 0)
        .map(([clave, coeficiente]) => {
          const [ejercicio_id = '', grupo_id = ''] = clave.split('|');
          return { ejercicio_id, grupo_id, coeficiente: coeficiente.trim() };
        });
      setResultado(
        await pide<ResultadoDeParametros>('PUT', '/api/lectura/v1/catalogo/parametros', {
          umbral_rir: Number(umbral),
          contribuciones,
        }),
      );
      alGuardar();
    } catch (e) {
      setError(mensajeDe(e));
    }
  };

  return (
    <details
      class="plegable tarjeta"
      onToggle={(e) => setAbierto((e.target as HTMLDetailsElement).open)}
    >
      <summary>
        <Icono nombre="chevron-down" tamano={16} />
        Parámetros de la métrica: umbral de RIR y coeficientes
      </summary>
      {abierto && (
        <div class="formulario plegable-contenido">
          <Aviso tipo="info">
            {catalogo.parametros.fijada
              ? `Hay sesiones que fijan estos parámetros. Guardar NO los reescribe: crea una versión nueva que rige desde el ${fechaLarga(catalogo.parametros.manana, true)}. Lo ya registrado se sigue leyendo con los de su día.`
              : 'Ninguna sesión fija todavía estos parámetros: guardar los reescribe en sitio y rigen ya, hoy incluido.'}
          </Aviso>
          <div class="fila-de-campos">
            <div class="campo">
              <label for="umbral">Una serie cuenta si su RIR es como mucho</label>
              <select
                id="umbral"
                class="selector"
                value={umbral}
                onChange={(e) => setUmbral((e.target as HTMLSelectElement).value)}
              >
                {Array.from({ length: 11 }, (_, i) => (
                  <option key={i} value={String(i)}>
                    {i}
                  </option>
                ))}
              </select>
            </div>
            <div class="campo">
              <label for="ejercicio-coeficientes">Coeficientes de</label>
              <select
                id="ejercicio-coeficientes"
                class="selector"
                value={ejercicio}
                onChange={(e) => setEjercicio((e.target as HTMLSelectElement).value)}
              >
                {catalogo.ejercicios.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.nombre}
                    {e.archivado ? ' (archivado)' : ''}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div class="coeficientes">
            {catalogo.grupos.map((g) => {
              const clave = `${ejercicio}|${g.id}`;
              const valor = borrador.get(clave) ?? '';
              const malo = valor !== '' && !/^(?:[01](?:\.\d{1,2})?|2(?:\.0{1,2})?)$/.test(valor);
              return (
                <div key={g.id} class="campo">
                  <label for={`c-${g.id}`}>{g.nombre}</label>
                  <input
                    id={`c-${g.id}`}
                    class="entrada"
                    inputMode="decimal"
                    placeholder="—"
                    aria-invalid={malo}
                    value={valor}
                    onInput={(e) => {
                      const nuevo = new Map(borrador);
                      const texto = (e.target as HTMLInputElement).value.replace(',', '.');
                      if (texto === '') nuevo.delete(clave);
                      else nuevo.set(clave, texto);
                      setBorrador(nuevo);
                    }}
                  />
                  {malo && <span class="error-de-campo">Entre 0.01 y 2.00, dos decimales</span>}
                </div>
              );
            })}
          </div>
          <p class="ayuda">
            En blanco = no contribuye. La métrica usa 1.00 para el músculo principal, 0.50 para el
            sinergista y 0.25 para el menor; cualquier valor hasta 2.00 es tuyo.
          </p>
          <div class="acciones">
            <button
              type="button"
              class="boton"
              disabled={invalidos.length > 0}
              onClick={() => void guarda()}
            >
              <Icono nombre="check" tamano={16} />
              Guardar parámetros
            </button>
          </div>
          <Respuesta>
            {error !== null && <Aviso tipo="error">{error}</Aviso>}
            {resultado !== null && error === null && (
              <Aviso tipo="exito">{explicaCamino(resultado.camino, resultado.vigente_desde)}</Aviso>
            )}
          </Respuesta>
        </div>
      )}
    </details>
  );
}

export function Catalogo() {
  const catalogo = useRecurso<DatosDeCatalogo>('/api/lectura/v1/catalogo');
  const base = useRecurso<CatalogoBaseConPerfiles>('/api/lectura/v1/catalogo/base');
  const [buscar, setBuscar] = useState('');
  const [verArchivados, setVerArchivados] = useState(false);
  const c = catalogo.datos;

  const ejercicios = useMemo(
    () =>
      (c?.ejercicios ?? []).filter(
        (e) =>
          (verArchivados || !e.archivado) &&
          (buscar === '' || paraBuscar(e.nombre).includes(paraBuscar(buscar))),
      ),
    [c, buscar, verArchivados],
  );
  const sinGrupos = (c?.ejercicios ?? []).filter((e) => e.sin_grupos && !e.archivado).length;
  const deLaSemilla = new Set((base.datos?.ejercicios ?? []).map((e) => normalizaNombre(e.nombre)));

  return (
    <>
      <CabeceraDePagina antetitulo="Catálogo" titulo="Grupos, ejercicios y coeficientes">
        <p>
          Lo que decide cuánto vale cada serie. Empieza importando el catálogo base; crear a mano
          sigue estando, pero no es lo primero.
        </p>
      </CabeceraDePagina>
      {catalogo.estado === 'error' && (
        <ErrorDeCarga mensaje={catalogo.error} reintenta={catalogo.recarga} />
      )}
      {c === null ? (
        <Cargando />
      ) : (
        <div class="formulario">
          {base.datos !== null ? (
            <Importacion base={base.datos} alImportar={catalogo.recarga} />
          ) : base.estado === 'error' ? (
            <ErrorDeCarga mensaje={base.error} reintenta={base.recarga} />
          ) : (
            <Cargando />
          )}

          <div class="rejilla-2">
            <section class="tarjeta formulario" aria-labelledby="titulo-grupos">
              <div class="tarjeta-titulo">
                <h3 id="titulo-grupos">Grupos ({c.grupos.length})</h3>
              </div>
              <ul class="chips" aria-label="Grupos musculares">
                {c.grupos.map((g) => (
                  <li key={g.id} class="etiqueta-pequena lista-plana">
                    {g.nombre}
                    {g.zona === null && ' · sin lugar en el modelo'}
                  </li>
                ))}
              </ul>
              <NuevoNombre
                que="grupo"
                url="/api/lectura/v1/catalogo/grupos"
                alCrear={catalogo.recarga}
              />
            </section>

            <section class="tarjeta formulario" aria-labelledby="titulo-ejercicios">
              <div class="tarjeta-titulo">
                <h3 id="titulo-ejercicios">
                  Ejercicios ({c.ejercicios.filter((e) => !e.archivado).length})
                </h3>
                <button
                  type="button"
                  class="boton-texto boton-pequeno"
                  aria-pressed={verArchivados}
                  onClick={() => setVerArchivados(!verArchivados)}
                >
                  {verArchivados ? 'Ocultar archivados' : 'Ver archivados'}
                </button>
              </div>
              {sinGrupos > 0 && (
                <Aviso tipo="alerta">
                  {sinGrupos === 1
                    ? 'Un ejercicio no aporta'
                    : `${sinGrupos} ejercicios no aportan`}{' '}
                  a ningún grupo: sus series salen como «sin mapeo» en el resumen.
                </Aviso>
              )}
              <div class="buscador">
                <Icono nombre="search" tamano={18} />
                <input
                  class="entrada"
                  type="search"
                  aria-label="Buscar en tus ejercicios"
                  value={buscar}
                  onInput={(e) => setBuscar((e.target as HTMLInputElement).value)}
                />
              </div>
              <ul class="lista-de-ejercicios">
                {ejercicios.slice(0, 80).map((e) => (
                  <li key={e.id}>
                    <div class="fila-de-lista">
                      <span>
                        {e.nombre}{' '}
                        {e.sin_grupos && <span class="etiqueta-pequena aviso">sin grupos</span>}
                        {e.archivado && <span class="etiqueta-pequena">archivado</span>}
                        {!deLaSemilla.has(normalizaNombre(e.nombre)) && (
                          <span class="etiqueta-pequena">propio</span>
                        )}
                      </span>
                      <button
                        type="button"
                        class="boton-texto boton-pequeno"
                        onClick={async () => {
                          await pide('PUT', `/api/lectura/v1/catalogo/ejercicios/${e.id}/archivo`, {
                            archivado: !e.archivado,
                          });
                          catalogo.recarga();
                        }}
                      >
                        <Icono nombre={e.archivado ? 'archive-restore' : 'archive'} tamano={14} />
                        {e.archivado ? 'Recuperar' : 'Archivar'}
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
              {ejercicios.length > 80 && (
                <p class="ayuda">{ejercicios.length - 80} más: busca para verlos.</p>
              )}
              <NuevoNombre
                que="ejercicio"
                url="/api/lectura/v1/catalogo/ejercicios"
                alCrear={catalogo.recarga}
              />
            </section>
          </div>

          <EditorDeParametros
            key={c.parametros.version_id + c.parametros.contribuciones.length}
            catalogo={c}
            alGuardar={catalogo.recarga}
          />
        </div>
      )}
    </>
  );
}
