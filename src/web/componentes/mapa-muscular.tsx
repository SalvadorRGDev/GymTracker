import { useEffect, useRef } from 'preact/hooks';
import type { Dashboard, GrupoDelDashboard } from '../../api/lectura/contrato';
import { useMovimientoReducido } from '../estado/preferencias';
import { actualizaConsulta } from '../estado/ruta';
import type { Cara, Vista } from './figura/rutas';
import { FiguraMuscular } from './figura-muscular';
import { Icono } from './iconos';
import { LeyendaDeVolumen } from './leyenda-de-volumen';

const VISTAS: readonly { valor: Vista; nombre: string }[] = [
  { valor: 'completo', nombre: 'Cuerpo completo' },
  { valor: 'superior', nombre: 'Tren superior' },
  { valor: 'inferior', nombre: 'Tren inferior' },
];

const NOMBRE_DE_VISTA: Record<Vista, string> = {
  completo: 'cuerpo completo',
  superior: 'tren superior',
  inferior: 'tren inferior',
};

export function leeVista(consulta: URLSearchParams): { vista: Vista; cara: Cara } {
  const vista = consulta.get('vista');
  const cara = consulta.get('cara');
  return {
    vista: vista === 'superior' || vista === 'inferior' ? vista : 'completo',
    cara: cara === 'espalda' ? 'espalda' : 'frente',
  };
}

/**
 * «¿Qué quieres ver?»: un `select` nativo con su etiqueta visible y un control
 * segmentado Frente/Espalda con `aria-pressed`. Nativo a propósito: funciona
 * con teclado, lector de pantalla y teléfono sin programar nada. La elección
 * va a la URL: el botón «atrás» funciona y la vista se puede mandar por mensaje.
 */
export function SelectorDeVista({ vista, cara }: { vista: Vista; cara: Cara }) {
  return (
    <div class="mapa-controles">
      <div class="campo">
        <label for="vista-del-mapa">¿Qué quieres ver?</label>
        <select
          id="vista-del-mapa"
          class="selector"
          value={vista}
          onChange={(e) => actualizaConsulta({ vista: (e.target as HTMLSelectElement).value })}
        >
          {VISTAS.map((v) => (
            <option key={v.valor} value={v.valor}>
              {v.nombre}
            </option>
          ))}
        </select>
      </div>
      <fieldset class="segmentado">
        <legend class="solo-lectores">Cara de la figura</legend>
        {(['frente', 'espalda'] as const).map((c) => (
          <button
            key={c}
            type="button"
            aria-pressed={cara === c}
            onClick={() => actualizaConsulta({ cara: c })}
          >
            <Icono nombre="rotate-3d" tamano={15} />
            {c === 'frente' ? 'Frente' : 'Espalda'}
          </button>
        ))}
      </fieldset>
    </div>
  );
}

function Detalle({
  grupo,
  dashboard,
  alCerrar,
}: {
  grupo: GrupoDelDashboard;
  dashboard: Dashboard;
  alCerrar: () => void;
}) {
  const tramo = dashboard.escala.find((t) => t.nivel === grupo.nivel);
  const r = grupo.referencia;
  return (
    <output class="detalle-flotante" aria-live="polite">
      <span class="detalle-cabecera">
        <strong>{grupo.nombre}</strong>
        <button
          type="button"
          class="boton-texto boton-pequeno"
          aria-label="Cerrar el detalle"
          onClick={alCerrar}
        >
          <Icono nombre="x" tamano={16} />
        </button>
      </span>
      <span>
        <span class="cifra">{grupo.series_efectivas}</span> series efectivas esta semana
      </span>
      <span class="detalle-nivel">{tramo?.rotulo ?? ''}</span>
      {r !== null && (
        <span class="detalle-nivel">
          {r.estado === 'dentro'
            ? 'Dentro'
            : r.estado === 'por-debajo'
              ? 'Por debajo'
              : 'Por encima'}{' '}
          del rango de referencia ({r.minimo.replace('.00', '')}–{r.maximo.replace('.00', '')},{' '}
          {r.respaldo === 'publicado' ? 'publicado' : 'criterio propio'})
        </span>
      )}
    </output>
  );
}

export function MapaMuscular({
  dashboard,
  vista,
  cara,
  activo,
  alActivar,
  idDeTabla,
}: {
  dashboard: Dashboard;
  vista: Vista;
  cara: Cara;
  activo: string | null;
  alActivar: (grupoId: string | null) => void;
  idDeTabla: string;
}) {
  const reducido = useMovimientoReducido();
  const grupoActivo = dashboard.grupos.find((g) => g.id === activo) ?? null;
  const sinLugar = dashboard.grupos.filter((g) => g.zona === null);
  const semanaVacia = dashboard.grupos.every((g) => g.nivel === 0);
  const lienzo = useRef<HTMLDivElement>(null);

  // Tocar fuera de una región cierra el detalle; Escape también, para el teclado.
  useEffect(() => {
    const elemento = lienzo.current;
    if (elemento === null) return;
    const alPulsar = (evento: PointerEvent) => {
      const objetivo = evento.target as Element | null;
      if (objetivo === null || !objetivo.classList.contains('region')) alActivar(null);
    };
    const alTeclear = (evento: KeyboardEvent) => {
      if (evento.key === 'Escape') alActivar(null);
    };
    elemento.addEventListener('pointerdown', alPulsar);
    document.addEventListener('keydown', alTeclear);
    return () => {
      elemento.removeEventListener('pointerdown', alPulsar);
      document.removeEventListener('keydown', alTeclear);
    };
  }, [alActivar]);

  return (
    <section class="tarjeta mapa-panel" aria-labelledby="titulo-mapa">
      <div class="tarjeta-titulo">
        <h3 id="titulo-mapa">Mapa muscular</h3>
      </div>
      <SelectorDeVista vista={vista} cara={cara} />
      <div class="figura-lienzo" ref={lienzo}>
        <FiguraMuscular
          grupos={dashboard.grupos}
          vista={vista}
          cara={cara}
          activo={activo}
          alActivar={alActivar}
          movimiento={!reducido}
          etiqueta={`Mapa muscular, ${NOMBRE_DE_VISTA[vista]}, ${cara}`}
          descritaPor={idDeTabla}
        />
        {semanaVacia && <p class="figura-vacia">Todavía no hay series efectivas esta semana</p>}
        {grupoActivo !== null && (
          <Detalle grupo={grupoActivo} dashboard={dashboard} alCerrar={() => alActivar(null)} />
        )}
      </div>
      <LeyendaDeVolumen escala={dashboard.escala} nivelActivo={grupoActivo?.nivel ?? null} />
      {sinLugar.length > 0 && (
        <div class="sin-lugar">
          <strong>Sin lugar en el modelo</strong>
          <p>
            Grupos creados o renombrados a mano: no tienen región en la figura, pero sí su número.
          </p>
          <ul>
            {sinLugar.map((g) => (
              <li key={g.id} class="etiqueta-pequena">
                {g.nombre} · {g.series_efectivas}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
