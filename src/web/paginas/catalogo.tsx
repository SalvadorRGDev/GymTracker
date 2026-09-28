import { useMemo, useState } from 'preact/hooks';
import type {
  CatalogoBaseConPerfiles,
  Catalogo as DatosDeCatalogo,
  ResultadoDeImportacion,
  ResultadoDeParametros,
} from '../../api/lectura/contrato';
import { centesimasDesdeDecimal, esDecimalExacto } from '../../domain/volume/centesimas';
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
  if (camino === 'sin-cambios') return 'No había nada nuevo: tus ajustes siguen como estaban.';
  if (camino === 'en-sitio') {
    return 'Guardado. Todavía no habías registrado entrenamientos con estos ajustes, así que se aplican ya, también a lo de hoy.';
  }
  return `Guardado. Como ya habías registrado entrenamientos, se aplica a partir del ${fechaLarga(vigenteDesde, true)}: lo ya registrado se sigue contando como estaba.`;
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

const COEFICIENTE = /^(?:[01](?:\.\d{1,2})?|2(?:\.0{1,2})?)$/;

/** «1» y «1.00» son el mismo valor. Comparar no es calcular volumen: no se suma nada. */
function mismoValor(a: string, b: string): boolean {
  if (a === '' || b === '') return a === b;
  return (
    esDecimalExacto(a) &&
    esDecimalExacto(b) &&
    centesimasDesdeDecimal(a) === centesimasDesdeDecimal(b)
  );
}

/**
 * Lo que dice el catálogo base para cada par ejercicio–grupo del usuario,
 * emparejados por nombre (así se importaron). Sirve para marcar lo cambiado y
 * para restaurarlo; un ejercicio o grupo propio no tiene valor de referencia.
 */
function valoresDelCatalogoBase(
  catalogo: DatosDeCatalogo,
  base: CatalogoBaseConPerfiles | null,
): { valores: Map<string, string>; conReferencia: Set<string> } {
  const valores = new Map<string, string>();
  const conReferencia = new Set<string>();
  if (base === null) return { valores, conReferencia };
  const grupoBase = new Map(base.grupos.map((g) => [normalizaNombre(g.nombre), g.id]));
  const ejercicioBase = new Map(base.ejercicios.map((e) => [normalizaNombre(e.nombre), e]));
  for (const e of catalogo.ejercicios) {
    const referencia = ejercicioBase.get(normalizaNombre(e.nombre));
    if (referencia === undefined) continue;
    conReferencia.add(e.id);
    for (const g of catalogo.grupos) {
      const id = grupoBase.get(normalizaNombre(g.nombre));
      const valor = id === undefined ? undefined : referencia.coeficientes[id];
      if (valor !== undefined) valores.set(`${e.id}|${g.id}`, valor);
    }
  }
  return { valores, conReferencia };
}

/**
 * Ajustes avanzados de la métrica: el umbral de RIR y los coeficientes. Son
 * OPCIONALES —vienen puestos con el catálogo base— y la pantalla lo dice antes
 * que nada. Los coeficientes se ven como reparto y sólo se vuelven campos al
 * pedir «Modificar»; lo que difiere del catálogo base se marca y se puede
 * restaurar, y guardar enumera antes lo que cambia.
 *
 * Plegado significa que sus campos ni se pintan. Envía la propuesta ENTERA
 * —archivados incluidos—: un par que no se envía desaparece de la versión nueva.
 */
function EditorDeParametros({
  catalogo,
  base,
  alGuardar,
}: {
  catalogo: DatosDeCatalogo;
  base: CatalogoBaseConPerfiles | null;
  alGuardar: () => void;
}) {
  const original = useMemo(
    () =>
      new Map(
        catalogo.parametros.contribuciones.map((c) => [
          `${c.ejercicio_id}|${c.grupo_id}`,
          c.coeficiente,
        ]),
      ),
    [catalogo],
  );
  const referencia = useMemo(() => valoresDelCatalogoBase(catalogo, base), [catalogo, base]);
  const [abierto, setAbierto] = useState(false);
  const [editando, setEditando] = useState(false);
  const [umbral, setUmbral] = useState(String(catalogo.parametros.umbral_rir));
  const [borrador, setBorrador] = useState<Map<string, string>>(() => new Map(original));
  const [ejercicio, setEjercicio] = useState(catalogo.ejercicios[0]?.id ?? '');
  const [resultado, setResultado] = useState<ResultadoDeParametros | null>(null);
  const [error, setError] = useState<string | null>(null);

  const nombreDeEjercicio = new Map(catalogo.ejercicios.map((e) => [e.id, e.nombre]));
  const nombreDeGrupo = new Map(catalogo.grupos.map((g) => [g.id, g.nombre]));
  const invalidos = [...borrador.values()].filter((v) => v !== '' && !COEFICIENTE.test(v));
  const claves = [...new Set([...original.keys(), ...borrador.keys()])];
  const cambios = claves
    .filter((k) => !mismoValor(original.get(k) ?? '', borrador.get(k) ?? ''))
    .map((k) => {
      const [e = '', g = ''] = k.split('|');
      return {
        clave: k,
        texto: `${nombreDeEjercicio.get(e) ?? '?'}: ${nombreDeGrupo.get(g) ?? '?'} ${original.get(k) ?? 'en blanco'} → ${borrador.get(k) || 'en blanco'}`,
      };
    });
  const cambiaUmbral = umbral !== String(catalogo.parametros.umbral_rir);
  const hayCambios = cambiaUmbral || cambios.length > 0;

  const reparto = catalogo.grupos
    .map((g) => ({ grupo: g.nombre, valor: borrador.get(`${ejercicio}|${g.id}`) ?? '' }))
    .filter((x) => x.valor !== '');
  const modificadosDelEjercicio = catalogo.grupos.filter(
    (g) =>
      referencia.conReferencia.has(ejercicio) &&
      !mismoValor(
        borrador.get(`${ejercicio}|${g.id}`) ?? '',
        referencia.valores.get(`${ejercicio}|${g.id}`) ?? '',
      ),
  );

  const restaura = () => {
    const nuevo = new Map(borrador);
    for (const g of catalogo.grupos) {
      const clave = `${ejercicio}|${g.id}`;
      const valor = referencia.valores.get(clave);
      if (valor === undefined) nuevo.delete(clave);
      else nuevo.set(clave, valor);
    }
    setBorrador(nuevo);
  };

  const descarta = () => {
    setUmbral(String(catalogo.parametros.umbral_rir));
    setBorrador(new Map(original));
    setEditando(false);
  };

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
      setEditando(false);
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
        Ajustes avanzados de la métrica: qué series cuentan y para qué músculo
        <span class="etiqueta-pequena">Opcional</span>
      </summary>
      {abierto && (
        <div class="formulario plegable-contenido">
          <Aviso tipo="info">
            <p>
              <strong>No hace falta tocar nada aquí.</strong> Estos ajustes ya vienen puestos con el
              catálogo base y la aplicación funciona con ellos. Cámbialos sólo si sabes por qué:
              deciden cómo se cuentan tus series.
            </p>
            <p>
              {catalogo.parametros.fijada
                ? `Como ya registraste entrenamientos con estos ajustes, lo que cambies se aplicará a partir del ${fechaLarga(catalogo.parametros.manana, true)}. Lo ya registrado se sigue contando como estaba.`
                : 'Todavía no has registrado entrenamientos con estos ajustes: lo que cambies se aplicará también a lo de hoy.'}
            </p>
          </Aviso>

          <section class="ajuste" aria-labelledby="titulo-umbral">
            <h3 id="titulo-umbral">1. Qué series cuentan: el umbral de RIR</h3>
            <p class="ayuda">
              El RIR son las repeticiones que te quedaban «en reserva» al terminar la serie: 0 es
              que no podías hacer ni una más; 3, que te sobraban unas tres. Sólo cuenta como
              efectiva una serie terminada cerca del límite. Con el umbral en 4, que es lo habitual,
              cuentan las series con RIR de 0 a 4; con 5 o más de reserva la serie fue demasiado
              fácil y no suma.
            </p>
            <div class="campo campo-estrecho">
              <label for="umbral">Una serie cuenta si su RIR es como mucho</label>
              <select
                id="umbral"
                class="selector"
                value={umbral}
                onChange={(e) => setUmbral((e.target as HTMLSelectElement).value)}
              >
                {Array.from({ length: 11 }, (_, i) => (
                  <option key={i} value={String(i)}>
                    {i === 4 ? '4 (lo habitual)' : String(i)}
                  </option>
                ))}
              </select>
            </div>
          </section>

          <section class="ajuste" aria-labelledby="titulo-coeficientes">
            <h3 id="titulo-coeficientes">
              2. Para qué músculo cuenta cada serie: los coeficientes
            </h3>
            <div class="ayuda">
              <p>
                Un ejercicio no trabaja un solo músculo. En el press de banca empuja sobre todo el
                pectoral, pero también trabajan el tríceps y la parte delantera del hombro. El
                coeficiente dice qué parte de cada serie se le apunta a cada músculo:
              </p>
              <ul>
                <li>
                  <strong>1.00</strong>: la serie cuenta entera (el músculo principal).
                </li>
                <li>
                  <strong>0.50</strong>: cuenta como media serie (un músculo que ayuda).
                </li>
                <li>
                  <strong>0.25</strong>: un cuarto (un músculo que participa poco).
                </li>
                <li>
                  <strong>En blanco</strong>: ese músculo no recibe nada de este ejercicio.
                </li>
              </ul>
              <p>
                Los valores del catálogo base son una aproximación razonable, no una medida exacta
                de cada persona.
              </p>
            </div>
            <div class="campo campo-estrecho">
              <label for="ejercicio-coeficientes">Ver el reparto de</label>
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
            <p class="reparto">
              {reparto.length === 0 ? (
                <>
                  <strong>{nombreDeEjercicio.get(ejercicio)}</strong> no se apunta a ningún músculo:
                  sus series no suman a ninguno.
                </>
              ) : (
                <>
                  Cada serie de <strong>{nombreDeEjercicio.get(ejercicio)}</strong> cuenta así:{' '}
                  {reparto.map((x) => `${x.grupo} ${x.valor}`).join(' · ')}.
                </>
              )}
            </p>
            {!editando ? (
              <div class="acciones">
                <button
                  type="button"
                  class="boton-fantasma boton-pequeno"
                  onClick={() => setEditando(true)}
                >
                  <Icono nombre="pencil" tamano={14} />
                  Modificar los coeficientes
                </button>
              </div>
            ) : (
              <>
                <Aviso tipo="alerta">
                  Estás cambiando cómo se reparte cada serie de este ejercicio. Si te equivocas,
                  «Restaurar los del catálogo base» lo deja como venía, y nada se guarda hasta que
                  pulses «Guardar los ajustes».
                </Aviso>
                <div class="coeficientes">
                  {catalogo.grupos.map((g) => {
                    const clave = `${ejercicio}|${g.id}`;
                    const valor = borrador.get(clave) ?? '';
                    const malo = valor !== '' && !COEFICIENTE.test(valor);
                    const deReferencia = referencia.valores.get(clave) ?? '';
                    const distinto =
                      referencia.conReferencia.has(ejercicio) && !mismoValor(valor, deReferencia);
                    return (
                      <div key={g.id} class="campo">
                        <label for={`c-${g.id}`}>{g.nombre}</label>
                        <input
                          id={`c-${g.id}`}
                          class="entrada"
                          inputMode="decimal"
                          placeholder="en blanco"
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
                        {malo && (
                          <span class="error-de-campo">Entre 0.01 y 2.00, dos decimales</span>
                        )}
                        {!malo && distinto && (
                          <span class="ayuda-campo">
                            Catálogo base: {deReferencia === '' ? 'en blanco' : deReferencia}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
                {modificadosDelEjercicio.length > 0 && (
                  <div class="acciones">
                    <button type="button" class="boton-texto boton-pequeno" onClick={restaura}>
                      <Icono nombre="refresh-cw" tamano={14} />
                      Restaurar los del catálogo base
                    </button>
                  </div>
                )}
              </>
            )}
          </section>

          {hayCambios && (
            <div class="resumen-de-cambios">
              <strong>Si guardas, cambia:</strong>
              <ul>
                {cambiaUmbral && (
                  <li>
                    Umbral de RIR: {catalogo.parametros.umbral_rir} → {umbral}
                  </li>
                )}
                {cambios.map((c) => (
                  <li key={c.clave}>{c.texto}</li>
                ))}
              </ul>
            </div>
          )}
          <div class="acciones">
            <button
              type="button"
              class="boton"
              disabled={!hayCambios || invalidos.length > 0}
              onClick={() => void guarda()}
            >
              <Icono nombre="check" tamano={16} />
              Guardar los ajustes
            </button>
            {hayCambios && (
              <button type="button" class="boton-texto" onClick={descarta}>
                Descartar los cambios
              </button>
            )}
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
            base={base.datos}
            alGuardar={catalogo.recarga}
          />
        </div>
      )}
    </>
  );
}
