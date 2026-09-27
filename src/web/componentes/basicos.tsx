import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { navega } from '../estado/ruta';
import { Icono, type NombreDeIcono } from './iconos';

/** Enlace del enrutador: navega sin recargar y deja que el navegador abra en otra pestaña. */
export function Enlace({
  href,
  children,
  ...resto
}: { href: string; children: ComponentChildren } & Omit<
  JSX.HTMLAttributes<HTMLAnchorElement>,
  'href'
>) {
  const alPulsar = (evento: MouseEvent) => {
    if (evento.defaultPrevented || evento.button !== 0) return;
    if (evento.metaKey || evento.ctrlKey || evento.shiftKey || evento.altKey) return;
    evento.preventDefault();
    navega(href);
    window.scrollTo({ top: 0 });
  };
  return (
    <a href={href} onClick={alPulsar} {...resto}>
      {children}
    </a>
  );
}

type TipoDeAviso = 'info' | 'exito' | 'alerta' | 'error' | 'neutro';

const ICONO_DE_AVISO: Record<TipoDeAviso, NombreDeIcono> = {
  info: 'info',
  exito: 'circle-check',
  alerta: 'triangle-alert',
  error: 'triangle-alert',
  neutro: 'info',
};

export function Aviso({
  tipo = 'neutro',
  children,
}: {
  tipo?: TipoDeAviso;
  children: ComponentChildren;
}) {
  return (
    <div class={`aviso aviso-${tipo}`}>
      <Icono nombre={ICONO_DE_AVISO[tipo]} tamano={18} />
      <div>{children}</div>
    </div>
  );
}

/** Mensaje que aparece después de una acción: región viva para el lector de pantalla. */
export function Respuesta({ children }: { children: ComponentChildren }) {
  return (
    <output class="respuesta-del-servidor" aria-live="polite">
      {children}
    </output>
  );
}

/** Estado vacío con trama: una métrica sin datos DICE que no tiene datos. */
export function Vacio({
  icono = 'info',
  titulo,
  children,
}: {
  icono?: NombreDeIcono;
  titulo: string;
  children?: ComponentChildren;
}) {
  return (
    <div class="vacio">
      <span class="icono-envoltura">
        <Icono nombre={icono} tamano={22} />
      </span>
      <h3>{titulo}</h3>
      {children}
    </div>
  );
}

export function Cargando({ texto = 'Cargando…' }: { texto?: string }) {
  return <output class="cargando">{texto}</output>;
}

export function ErrorDeCarga({ mensaje, reintenta }: { mensaje: string; reintenta: () => void }) {
  return (
    <Aviso tipo="error">
      <p>{mensaje}</p>
      <button type="button" class="boton-texto" onClick={reintenta}>
        <Icono nombre="refresh-cw" tamano={16} /> Reintentar
      </button>
    </Aviso>
  );
}

/**
 * Lo irreversible se confirma en dos pasos, en el propio sitio: el primer
 * clic sólo pregunta.
 */
export function BotonConConfirmacion({
  etiqueta,
  pregunta,
  confirmar,
  alConfirmar,
  peligroso = true,
  pequeno = false,
  icono,
  soloIcono = false,
}: {
  etiqueta: string;
  pregunta: string;
  confirmar: string;
  alConfirmar: () => void | Promise<void>;
  peligroso?: boolean;
  pequeno?: boolean;
  icono?: NombreDeIcono;
  /** En filas repetidas, sólo el icono: el nombre va a `aria-label`. */
  soloIcono?: boolean;
}) {
  const [preguntando, setPreguntando] = useState(false);
  const [ocupado, setOcupado] = useState(false);
  const primero = useRef<HTMLButtonElement>(null);
  const tamano = pequeno ? ' boton-pequeno' : '';
  useEffect(() => {
    if (preguntando) primero.current?.focus();
  }, [preguntando]);
  if (!preguntando && soloIcono) {
    return (
      <button
        type="button"
        class="boton-texto boton-pequeno"
        aria-label={etiqueta}
        title={etiqueta}
        onClick={() => setPreguntando(true)}
      >
        <Icono nombre={icono ?? 'trash-2'} tamano={16} />
      </button>
    );
  }
  if (!preguntando) {
    return (
      <button type="button" class={`boton-fantasma${tamano}`} onClick={() => setPreguntando(true)}>
        {icono !== undefined && <Icono nombre={icono} tamano={16} />}
        {etiqueta}
      </button>
    );
  }
  return (
    <fieldset class="acciones sin-marco confirmacion">
      <legend class="etiqueta-pequena aviso">{pregunta}</legend>
      <button
        ref={primero}
        type="button"
        class={`${peligroso ? 'boton-peligro' : 'boton'}${tamano}`}
        disabled={ocupado}
        onClick={async () => {
          setOcupado(true);
          try {
            await alConfirmar();
          } finally {
            setOcupado(false);
            setPreguntando(false);
          }
        }}
      >
        {confirmar}
      </button>
      <button type="button" class={`boton-texto${tamano}`} onClick={() => setPreguntando(false)}>
        Cancelar
      </button>
    </fieldset>
  );
}

/** Cabecera de página: antetítulo, título serif, entradilla y acciones. */
export function CabeceraDePagina({
  antetitulo,
  titulo,
  children,
  acciones,
}: {
  antetitulo?: string;
  titulo: string;
  children?: ComponentChildren;
  acciones?: ComponentChildren;
}) {
  return (
    <header class="pagina-cabecera">
      <div>
        {antetitulo !== undefined && <p class="antetitulo">{antetitulo}</p>}
        <h1>{titulo}</h1>
        {children !== undefined && <div class="entradilla">{children}</div>}
      </div>
      {acciones !== undefined && <div class="acciones">{acciones}</div>}
    </header>
  );
}
