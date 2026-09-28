import { useEffect, useMemo, useRef } from 'preact/hooks';
import type { Dashboard, GrupoDelDashboard } from '../../api/lectura/contrato';
import type { Comparativa, GrupoComparado, VentanaComparada } from '../../api/planes/contrato';
import { useMovimientoReducido } from '../estado/preferencias';
import type { Recurso } from '../estado/recurso';
import { actualizaConsulta } from '../estado/ruta';
import { rangoDeDias } from '../formato/fechas';
import { Enlace, ErrorDeCarga } from './basicos';
import { Delta } from './delta';
import type { Cara, Vista } from './figura/rutas';
import { FiguraMuscular } from './figura-muscular';
import { Icono } from './iconos';
import { LeyendaDeComparacion } from './leyenda-de-comparacion';
import { LeyendaDeVolumen } from './leyenda-de-volumen';

/** Qué pinta la figura: el volumen de la semana o la comparativa con el plan (ADR-019). */
export type Color = 'volumen' | 'plan';

const ID_DE_TABLA_COMPARADA = 'tabla-comparada-del-mapa';

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

export function leeVista(consulta: URLSearchParams): { vista: Vista; cara: Cara; color: Color } {
  const vista = consulta.get('vista');
  const cara = consulta.get('cara');
  return {
    vista: vista === 'superior' || vista === 'inferior' ? vista : 'completo',
    cara: cara === 'espalda' ? 'espalda' : 'frente',
    color: consulta.get('color') === 'plan' ? 'plan' : 'volumen',
  };
}

/**
 * «¿Qué quieres ver?»: un `select` nativo con su etiqueta visible y un control
 * segmentado Frente/Espalda con `aria-pressed`. Nativo a propósito: funciona
 * con teclado, lector de pantalla y teléfono sin programar nada. La elección
 * va a la URL: el botón «atrás» funciona y la vista se puede mandar por mensaje.
 *
 * El color es un control aparte y no una opción más de «¿Qué quieres ver?»: si
 * lo fuera, comparar con el plan obligaría a ver el cuerpo completo.
 */
export function SelectorDeVista({
  vista,
  cara,
  color,
}: {
  vista: Vista;
  cara: Cara;
  color: Color;
}) {
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
      <div class="campo">
        <label for="color-del-mapa">Color</label>
        <select
          id="color-del-mapa"
          class="selector"
          value={color}
          onChange={(e) => {
            const valor = (e.target as HTMLSelectElement).value;
            actualizaConsulta({ color: valor === 'plan' ? 'plan' : null });
          }}
        >
          <option value="volumen">Volumen de la semana</option>
          <option value="plan">Comparado con el plan</option>
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

function DetalleComparado({
  grupo,
  comparado,
  alCerrar,
}: {
  grupo: GrupoDelDashboard;
  comparado: GrupoComparado | undefined;
  alCerrar: () => void;
}) {
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
      {comparado === undefined ? (
        <span class="detalle-nivel">Ni plan ni series esta semana del plan</span>
      ) : (
        <>
          <span>
            <span class="cifra">{comparado.ejecutado}</span> de {comparado.planeado} series
            efectivas planeadas
          </span>
          <span>
            <Delta delta={comparado.delta} estado={comparado.estado} />
          </span>
        </>
      )}
    </output>
  );
}

/** La alternativa textual de la figura comparada: lo mismo, en una tabla con teclado. */
function TablaComparada({
  ventana,
  activo,
  alActivar,
}: {
  ventana: VentanaComparada;
  activo: string | null;
  alActivar: (grupoId: string | null) => void;
}) {
  if (ventana.grupos.length === 0) {
    return <p class="ayuda">El plan no pide nada esta semana y no hay series.</p>;
  }
  return (
    <table class="tabla" id={ID_DE_TABLA_COMPARADA}>
      <caption class="solo-lectores">
        Lo hecho contra lo planeado en la semana {ventana.numero} del plan, por grupo
      </caption>
      <thead>
        <tr>
          <th scope="col">Grupo</th>
          <th scope="col" class="numero">
            Diferencia
          </th>
        </tr>
      </thead>
      <tbody>
        {ventana.grupos.map((g) => (
          <tr key={g.id} class={g.id === activo ? 'activa' : ''}>
            <td>
              <button
                type="button"
                class="nombre-de-grupo"
                onFocus={() => alActivar(g.id)}
                onClick={() => alActivar(g.id)}
              >
                {g.nombre}
              </button>
              <span class="hecho-de-plan cifra">
                {g.ejecutado} de {g.planeado}
              </span>
            </td>
            <td class="numero">
              <Delta delta={g.delta} estado={g.estado} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Qué semana se compara: la del plan, no la natural del resumen. */
function SemanaComparada({
  recurso,
  ventana,
}: {
  recurso: Recurso<Comparativa>;
  ventana: VentanaComparada | null;
}) {
  if (recurso.estado === 'error') {
    return <ErrorDeCarga mensaje={recurso.error} reintenta={recurso.recarga} />;
  }
  if (recurso.datos === null) return <p class="ayuda">Cargando la comparación…</p>;
  if (ventana === null) {
    return (
      <p class="ayuda">
        No hay plan asignado: nada que comparar. <Enlace href="/planes">Asigna una rutina</Enlace>.
      </p>
    );
  }
  return (
    <p class="ayuda">
      <strong>
        Semana {ventana.numero} de «{ventana.plan.nombre}»
      </strong>{' '}
      · {rangoDeDias(ventana.desde, ventana.hasta)}
      {ventana.en_curso ? ', en curso' : ''}. Cuenta desde el día en que asignaste el plan, no desde
      el lunes. <Enlace href="/comparativa">Ver la comparativa</Enlace>.
    </p>
  );
}

export function MapaMuscular({
  dashboard,
  vista,
  cara,
  color,
  comparativa,
  activo,
  alActivar,
  idDeTabla,
}: {
  dashboard: Dashboard;
  vista: Vista;
  cara: Cara;
  color: Color;
  /** La comparativa de la semana del plan; sólo se pide con el color «plan». */
  comparativa: Recurso<Comparativa> | null;
  activo: string | null;
  alActivar: (grupoId: string | null) => void;
  idDeTabla: string;
}) {
  const reducido = useMovimientoReducido();
  const grupoActivo = dashboard.grupos.find((g) => g.id === activo) ?? null;
  const sinLugar = dashboard.grupos.filter((g) => g.zona === null);
  const semanaVacia = dashboard.grupos.every((g) => g.nivel === 0);
  const lienzo = useRef<HTMLDivElement>(null);
  const conPlan = color === 'plan' && comparativa !== null;
  const ventana = conPlan ? (comparativa.datos?.ventanas.at(-1) ?? null) : null;
  const comparacion = useMemo(
    () => (conPlan ? new Map((ventana?.grupos ?? []).map((g) => [g.id, g])) : undefined),
    [conPlan, ventana],
  );

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
      <SelectorDeVista vista={vista} cara={cara} color={color} />
      {conPlan && <SemanaComparada recurso={comparativa} ventana={ventana} />}
      <div class="figura-lienzo" ref={lienzo}>
        <FiguraMuscular
          grupos={dashboard.grupos}
          vista={vista}
          cara={cara}
          activo={activo}
          alActivar={alActivar}
          movimiento={!reducido}
          etiqueta={`Mapa muscular, ${NOMBRE_DE_VISTA[vista]}, ${cara}${conPlan ? ', comparado con el plan' : ''}`}
          descritaPor={
            conPlan && ventana !== null && ventana.grupos.length > 0
              ? ID_DE_TABLA_COMPARADA
              : idDeTabla
          }
          comparacion={comparacion}
        />
        {!conPlan && semanaVacia && (
          <p class="figura-vacia">Todavía no hay series efectivas esta semana</p>
        )}
        {grupoActivo !== null &&
          (conPlan ? (
            <DetalleComparado
              grupo={grupoActivo}
              comparado={comparacion?.get(grupoActivo.id)}
              alCerrar={() => alActivar(null)}
            />
          ) : (
            <Detalle grupo={grupoActivo} dashboard={dashboard} alCerrar={() => alActivar(null)} />
          ))}
      </div>
      {conPlan ? (
        <>
          <LeyendaDeComparacion />
          {ventana !== null && (
            <TablaComparada ventana={ventana} activo={activo} alActivar={alActivar} />
          )}
        </>
      ) : (
        <LeyendaDeVolumen escala={dashboard.escala} nivelActivo={grupoActivo?.nivel ?? null} />
      )}
      {sinLugar.length > 0 && (
        <div class="sin-lugar">
          <strong>Sin lugar en el modelo</strong>
          <p>
            Grupos creados o renombrados a mano: no tienen región en la figura, pero sí su número.
          </p>
          <ul>
            {sinLugar.map((g) => (
              <li key={g.id} class="etiqueta-pequena">
                {g.nombre} ·{' '}
                {conPlan
                  ? (comparacion?.get(g.id)?.delta ?? 'ni plan ni series')
                  : g.series_efectivas}
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
