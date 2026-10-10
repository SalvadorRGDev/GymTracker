import { useState } from 'preact/hooks';
import type {
  Dispositivos as DatosDeDispositivos,
  DispositivoEmitido,
} from '../../api/lectura/contrato';
import {
  Aviso,
  BotonConConfirmacion,
  CabeceraDePagina,
  Cargando,
  ErrorDeCarga,
  Respuesta,
  Vacio,
} from '../componentes/basicos';
import { Icono } from '../componentes/iconos';
import { ErrorDeApi, mensajeDe, pide } from '../estado/api';
import { useRecurso } from '../estado/recurso';
import { instanteRelativo } from '../formato/fechas';

/**
 * Credenciales de captura para los atajos (ADR-009). La respuesta de emisión
 * es la ÚNICA vez que la credencial existe fuera del teléfono: el servidor
 * guarda su HMAC y no hay forma de volver a verla.
 */

function Emision({ zona, alEmitir }: { zona: string; alEmitir: () => void }) {
  const [nombre, setNombre] = useState('');
  const [emitido, setEmitido] = useState<DispositivoEmitido | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copiado, setCopiado] = useState(false);

  if (emitido !== null) {
    return (
      <section class="credencial" aria-labelledby="titulo-credencial">
        <h3 id="titulo-credencial">Credencial de «{emitido.dispositivo.nombre}»</h3>
        <Aviso tipo="alerta">
          Ésta es la única vez que la verás. El servidor sólo guarda su huella: si la pierdes, emite
          otra y revoca ésta.
        </Aviso>
        <code>{emitido.credencial}</code>
        <p>
          Guarda este contenido como <strong>{emitido.archivo.nombre}</strong> en{' '}
          <strong>iCloud Drive › Atajos › GymTracker</strong> y ejecuta el atajo «Configurar». Nunca
          la pegues dentro de un atajo: compartirlo exportaría sus acciones y con ellas la
          credencial.
        </p>
        <pre class="bloque-codigo">{emitido.archivo.contenido}</pre>
        {emitido.servidor.aviso !== null && <Aviso tipo="alerta">{emitido.servidor.aviso}</Aviso>}
        <div class="acciones">
          <button
            type="button"
            class="boton-fantasma"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(emitido.archivo.contenido);
                setCopiado(true);
              } catch {
                setCopiado(false);
              }
            }}
          >
            <Icono nombre="copy" tamano={16} />
            {copiado ? 'Copiado' : 'Copiar el archivo'}
          </button>
          <button type="button" class="boton" onClick={() => setEmitido(null)}>
            Ya la guardé
          </button>
        </div>
        <p class="ayuda">
          Emitida {instanteRelativo(emitido.dispositivo.emitido_en, zona)}; caduca en un año.
        </p>
      </section>
    );
  }

  return (
    <form
      class="tarjeta formulario"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        try {
          const r = await pide<DispositivoEmitido>('POST', '/api/lectura/v1/dispositivos', {
            nombre: nombre.trim(),
          });
          setEmitido(r);
          setNombre('');
          alEmitir();
        } catch (err) {
          setError(mensajeDe(err));
        }
      }}
    >
      <h3>Emitir una credencial</h3>
      <p class="ayuda">
        Una por teléfono, para saber cuál usa cada una y poder revocarlas por separado.
      </p>
      <div class="campo">
        <label for="nombre-dispositivo">Nombre del dispositivo</label>
        <input
          id="nombre-dispositivo"
          class="entrada"
          placeholder="iPhone de Ana"
          maxLength={60}
          required
          value={nombre}
          onInput={(e) => setNombre((e.target as HTMLInputElement).value)}
        />
      </div>
      <div class="acciones">
        <button type="submit" class="boton" disabled={nombre.trim() === ''}>
          <Icono nombre="shield-check" tamano={16} />
          Emitir
        </button>
      </div>
      <Respuesta>{error !== null && <Aviso tipo="error">{error}</Aviso>}</Respuesta>
    </form>
  );
}

function Exportacion() {
  const [estado, setEstado] = useState<{
    tipo: 'exito' | 'alerta' | 'error';
    texto: string;
  } | null>(null);
  const descarga = async () => {
    setEstado(null);
    try {
      const datos = await pide<{ exportado_en: string }>('GET', '/api/lectura/v1/exportacion');
      const blob = new Blob([JSON.stringify(datos, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const enlace = document.createElement('a');
      enlace.href = url;
      enlace.download = `gymtracker-${datos.exportado_en.slice(0, 10)}.json`;
      enlace.click();
      URL.revokeObjectURL(url);
      setEstado({ tipo: 'exito', texto: 'Descargada.' });
    } catch (e) {
      if (e instanceof ErrorDeApi && e.estado === 429) {
        const segundos = Number(
          (e.cuerpo as { reintentar_en?: number } | null)?.reintentar_en ?? 0,
        );
        // Un límite con hora de vuelta, no un error.
        setEstado({
          tipo: 'alerta',
          texto: `Ya exportaste hace poco. Podrás volver a hacerlo en unos ${Math.max(1, Math.ceil(segundos / 60))} minutos.`,
        });
      } else setEstado({ tipo: 'error', texto: mensajeDe(e) });
    }
  };
  return (
    <section class="tarjeta formulario" aria-labelledby="titulo-exportar">
      <h3 id="titulo-exportar">Exportar tus datos</h3>
      <p class="ayuda">
        Un JSON abierto con todo tu libro: grupos, ejercicios, parámetros y sus versiones, planes,
        sesiones, series y mediciones, más tu correo y tu zona horaria. No lleva contraseñas, ni
        huellas, ni credenciales. Dos exportaciones por hora.
      </p>
      <div class="acciones">
        <button type="button" class="boton-fantasma" onClick={() => void descarga()}>
          <Icono nombre="download" tamano={16} />
          Descargar exportación
        </button>
      </div>
      <Respuesta>{estado !== null && <Aviso tipo={estado.tipo}>{estado.texto}</Aviso>}</Respuesta>
    </section>
  );
}

export function Dispositivos({ zona }: { zona: string }) {
  const recurso = useRecurso<DatosDeDispositivos>('/api/lectura/v1/dispositivos');
  const lista = recurso.datos?.dispositivos ?? [];
  return (
    <>
      <CabeceraDePagina antetitulo="Dispositivos" titulo="Credenciales de los atajos">
        <p>
          Cada iPhone captura con su propia credencial, que sólo puede escribir series, sesiones y
          pesos: no lee planes, no exporta y no borra nada.
        </p>
      </CabeceraDePagina>
      <div class="rejilla-2">
        <div class="formulario">
          <Emision zona={zona} alEmitir={recurso.recarga} />
          <Exportacion />
        </div>
        <section class="formulario" aria-labelledby="titulo-lista">
          <h2 id="titulo-lista">Emitidas</h2>
          {recurso.estado === 'error' && (
            <ErrorDeCarga mensaje={recurso.error} reintenta={recurso.recarga} />
          )}
          {recurso.datos === null && recurso.estado === 'cargando' && <Cargando />}
          {recurso.datos !== null && lista.length === 0 && (
            <Vacio icono="smartphone" titulo="Ninguna credencial todavía">
              <p>Emite una para configurar los atajos del iPhone.</p>
            </Vacio>
          )}
          <div class="dispositivos">
            {lista.map((d) => (
              <article key={d.id} class="tarjeta tarjeta-compacta">
                <div class="sesion-cabecera">
                  <h3>{d.nombre}</h3>
                  <BotonConConfirmacion
                    etiqueta="Revocar"
                    pregunta="El teléfono dejará de poder escribir"
                    confirmar="Revocar"
                    pequeno
                    alConfirmar={async () => {
                      await pide('DELETE', `/api/lectura/v1/dispositivos/${d.id}`);
                      recurso.recarga();
                    }}
                  />
                </div>
                <p class="sesion-meta">
                  <span>Emitida {instanteRelativo(d.emitido_en, zona)}</span>·
                  <span>
                    {d.ultimo_uso_en === null
                      ? 'todavía no se ha usado'
                      : `último uso ${instanteRelativo(d.ultimo_uso_en, zona)}`}
                  </span>
                </p>
              </article>
            ))}
          </div>
        </section>
      </div>
    </>
  );
}
