import { useState } from 'preact/hooks';
import type { RespuestaDeCaptura } from '../../api/captura/contrato';
import type { Catalogo } from '../../api/lectura/contrato';
import type { CatalogoBase } from '../../catalogo/tipos';
import {
  Aviso,
  CabeceraDePagina,
  Cargando,
  Enlace,
  ErrorDeCarga,
  Respuesta,
  Vacio,
} from '../componentes/basicos';
import { Icono } from '../componentes/iconos';
import { SelectorDeEjercicio } from '../componentes/selector-de-ejercicio';
import { mensajeDe, pide } from '../estado/api';
import { useRecurso } from '../estado/recurso';

/**
 * Captura web (ADR-011): la misma operación que los atajos, contra el mismo
 * servicio. No calcula, no crea catálogo, la fecha lógica la pone el servidor
 * y el mensaje que se enseña es el suyo, palabra por palabra.
 */

const CLAVE_DE_SESION = 'sigir:entrenamiento-abierto';
/** Vigente por ANTIGÜEDAD, como el archivo del atajo: la sesión de 23:50 a 00:15 no se parte. */
const VIGENCIA_MS = 6 * 3_600_000;

interface EntrenamientoAbierto {
  readonly clave: string;
  readonly iniciado: number;
}

function nuevaClave(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Del entrenamiento abierto se guarda la identidad y nada más: una clave y un
 * instante. No es una cola: ninguna serie vive aquí y nada se reintenta.
 */
export function entrenamientoVigente(ahora: number = Date.now()): EntrenamientoAbierto | null {
  try {
    const texto = window.sessionStorage.getItem(CLAVE_DE_SESION);
    if (texto === null) return null;
    const valor = JSON.parse(texto) as Partial<EntrenamientoAbierto>;
    if (typeof valor.clave !== 'string' || typeof valor.iniciado !== 'number') return null;
    return ahora - valor.iniciado < VIGENCIA_MS
      ? { clave: valor.clave, iniciado: valor.iniciado }
      : null;
  } catch {
    return null;
  }
}

function abreEntrenamiento(ahora: number = Date.now()): EntrenamientoAbierto {
  const vigente = entrenamientoVigente(ahora);
  if (vigente !== null) return vigente;
  const nuevo = { clave: nuevaClave(), iniciado: ahora };
  try {
    window.sessionStorage.setItem(CLAVE_DE_SESION, JSON.stringify(nuevo));
  } catch {
    // Sin almacenamiento de sesión, recargar abriría otra sesión; lo demás funciona.
  }
  return nuevo;
}

function cierraEntrenamientoLocal(): void {
  try {
    window.sessionStorage.removeItem(CLAVE_DE_SESION);
  } catch {
    // nada que borrar
  }
}

const RIRS = Array.from({ length: 11 }, (_, i) => i);

export function Registrar() {
  const completo = useRecurso<Catalogo>('/api/lectura/v1/catalogo');
  const base = useRecurso<CatalogoBase>('/api/lectura/v1/catalogo/base');

  const [elegido, setElegido] = useState<string | null>(null);
  const [repeticiones, setRepeticiones] = useState('');
  const [carga, setCarga] = useState('');
  const [rir, setRir] = useState<number | null>(null);
  const [respuesta, setRespuesta] = useState<RespuestaDeCaptura | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const [abierto, setAbierto] = useState(() => entrenamientoVigente());
  const [peso, setPeso] = useState('');
  const [respuestaPeso, setRespuestaPeso] = useState<RespuestaDeCaptura | null>(null);

  const ejercicios = (completo.datos?.ejercicios ?? []).filter((e) => !e.archivado);
  const nombreElegido = ejercicios.find((e) => e.id === elegido)?.nombre ?? null;

  const faltas: string[] = [];
  if (nombreElegido === null) faltas.push('elige un ejercicio');
  if (!/^\d{1,3}$/.test(repeticiones) || Number(repeticiones) < 1 || Number(repeticiones) > 200) {
    faltas.push('repeticiones de 1 a 200');
  }
  if (!/^\d{1,4}(?:[.,]\d{1,2})?$/.test(carga.trim())) faltas.push('carga en kg, como 62.5');

  const guarda = async (calentamiento: boolean) => {
    if (nombreElegido === null) return;
    if (!calentamiento && rir === null) {
      setError(
        'Una serie de trabajo necesita su RIR. Si fue calentamiento, usa «Guardar calentamiento».',
      );
      return;
    }
    setOcupado(true);
    setError(null);
    const entrenamiento = abreEntrenamiento();
    setAbierto(entrenamiento);
    try {
      const r = await pide<RespuestaDeCaptura>('POST', '/api/registro/v1/serie', {
        sesion: { clave: entrenamiento.clave },
        serie: {
          clave: nuevaClave(),
          ejercicio: nombreElegido,
          repeticiones: Number(repeticiones),
          carga_kg: carga.trim(),
          ...(calentamiento ? {} : { rir }),
          calentamiento,
        },
      });
      setRespuesta(r);
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setOcupado(false);
    }
  };

  const termina = async () => {
    const vigente = entrenamientoVigente();
    if (vigente === null) return;
    setOcupado(true);
    try {
      const r = await pide<RespuestaDeCaptura>('POST', '/api/registro/v1/sesion/cerrar', {
        sesion: { clave: vigente.clave },
      });
      setRespuesta(r);
      cierraEntrenamientoLocal();
      setAbierto(null);
    } catch (e) {
      setError(mensajeDe(e));
    } finally {
      setOcupado(false);
    }
  };

  const guardaPeso = async (evento: Event) => {
    evento.preventDefault();
    try {
      setRespuestaPeso(
        await pide<RespuestaDeCaptura>('POST', '/api/registro/v1/peso', { peso_kg: peso.trim() }),
      );
    } catch (e) {
      setRespuestaPeso({ estado: 'rechazada', mensaje: mensajeDe(e) });
    }
  };

  if (completo.estado === 'error')
    return <ErrorDeCarga mensaje={completo.error} reintenta={completo.recarga} />;
  if (completo.datos === null) return <Cargando />;

  if (ejercicios.length === 0) {
    return (
      <>
        <CabeceraDePagina antetitulo="Captura web" titulo="Registrar una serie" />
        <Vacio icono="library" titulo="Tu catálogo no tiene ejercicios">
          <p>
            La captura sólo acepta ejercicios de tu catálogo: un nombre que no existe no se puede ni
            escribir. <Enlace href="/catalogo">Importa el catálogo base</Enlace>.
          </p>
        </Vacio>
      </>
    );
  }

  return (
    <>
      <CabeceraDePagina
        antetitulo="Captura web"
        titulo="Registrar una serie"
        acciones={
          abierto !== null ? (
            <button
              type="button"
              class="boton-fantasma"
              disabled={ocupado}
              onClick={() => void termina()}
            >
              <Icono nombre="flag" tamano={16} />
              Terminar entrenamiento
            </button>
          ) : undefined
        }
      >
        <p>
          Lo mismo que hacen los atajos del iPhone, por si no tienes uno a mano. La fecha la pone el
          servidor; el total de la semana lo calcula el motor y llega en la respuesta.
        </p>
      </CabeceraDePagina>

      <div class="registrar-rejilla">
        <section class="tarjeta" aria-labelledby="titulo-ejercicio">
          <div class="tarjeta-titulo">
            <h3 id="titulo-ejercicio">Ejercicio</h3>
          </div>
          {base.estado === 'error' && (
            <Aviso tipo="info">Sin el catálogo base, la búsqueda por sinónimo no está.</Aviso>
          )}
          <SelectorDeEjercicio
            ejercicios={ejercicios}
            base={base.datos}
            elegido={elegido}
            alElegir={setElegido}
          />
        </section>

        <section class="tarjeta formulario" aria-labelledby="titulo-serie">
          <div class="tarjeta-titulo">
            <h3 id="titulo-serie">La serie</h3>
            {abierto !== null && <span class="etiqueta-pequena exito">Entrenamiento abierto</span>}
          </div>
          {nombreElegido !== null ? (
            <div class="ejercicio-elegido">
              <span>{nombreElegido}</span>
              <Icono nombre="dumbbell" tamano={18} />
            </div>
          ) : (
            <p class="ayuda">Elige un ejercicio de la lista.</p>
          )}
          <div class="fila-de-campos">
            <div class="campo">
              <label for="repeticiones">Repeticiones</label>
              <input
                id="repeticiones"
                class="entrada"
                inputMode="numeric"
                autocomplete="off"
                value={repeticiones}
                onInput={(e) => setRepeticiones((e.target as HTMLInputElement).value)}
              />
            </div>
            <div class="campo">
              <label for="carga">Carga (kg)</label>
              <input
                id="carga"
                class="entrada"
                inputMode="decimal"
                autocomplete="off"
                placeholder="62.5"
                value={carga}
                onInput={(e) => setCarga((e.target as HTMLInputElement).value)}
              />
            </div>
          </div>
          <fieldset class="campo sin-marco">
            <legend class="etiqueta">RIR: repeticiones que te quedaban</legend>
            <div class="selector-rir">
              {RIRS.map((n) => (
                <button key={n} type="button" aria-pressed={rir === n} onClick={() => setRir(n)}>
                  {n}
                </button>
              ))}
            </div>
            <span class="ayuda">0 es llegar al fallo. El calentamiento no lleva RIR.</span>
          </fieldset>
          {faltas.length > 0 && <p class="ayuda">Falta: {faltas.join(', ')}.</p>}
          <div class="acciones">
            <button
              type="button"
              class="boton boton-grande"
              disabled={ocupado || faltas.length > 0}
              onClick={() => void guarda(false)}
            >
              <Icono nombre="check" tamano={18} />
              Guardar serie
            </button>
            <button
              type="button"
              class="boton-fantasma boton-grande"
              disabled={ocupado || faltas.length > 0}
              onClick={() => void guarda(true)}
            >
              <Icono nombre="flame" tamano={18} />
              Guardar calentamiento
            </button>
          </div>
          <Respuesta>
            {error !== null && <Aviso tipo="error">{error}</Aviso>}
            {respuesta !== null && error === null && (
              <Aviso tipo={respuesta.estado === 'aceptada' ? 'exito' : 'alerta'}>
                <p>{respuesta.mensaje}</p>
                {respuesta.serie?.fecha_por_confirmar === true && (
                  <p>Fecha por confirmar: revísala en el historial.</p>
                )}
              </Aviso>
            )}
          </Respuesta>
        </section>
      </div>

      <section class="seccion" aria-labelledby="titulo-peso">
        <form class="tarjeta formulario" onSubmit={guardaPeso}>
          <div class="tarjeta-titulo">
            <h3 id="titulo-peso">Peso corporal</h3>
          </div>
          <div class="fila-de-campos">
            <div class="campo">
              <label for="peso">Peso de hoy (kg)</label>
              <input
                id="peso"
                class="entrada entrada-corta"
                inputMode="decimal"
                value={peso}
                onInput={(e) => setPeso((e.target as HTMLInputElement).value)}
              />
            </div>
          </div>
          <div class="acciones">
            <button
              type="submit"
              class="boton-fantasma"
              disabled={!/^\d{2,3}(?:[.,]\d{1,2})?$/.test(peso.trim())}
            >
              <Icono nombre="scale" tamano={16} />
              Guardar peso
            </button>
          </div>
          <Respuesta>
            {respuestaPeso !== null && (
              <Aviso tipo={respuestaPeso.estado === 'aceptada' ? 'exito' : 'alerta'}>
                {respuestaPeso.mensaje}
              </Aviso>
            )}
          </Respuesta>
        </form>
      </section>
    </>
  );
}
