import { useEffect, useRef, useState } from 'preact/hooks';
import type { GraficasDelHistorial as Datos } from '../../api/lectura/contrato';
import { useRecurso } from '../estado/recurso';
import { fechaCorta, fechaLarga } from '../formato/fechas';
import { Cargando, ErrorDeCarga } from './basicos';
import { LeyendaDeVolumen } from './leyenda-de-volumen';

/**
 * Las gráficas del historial (ADR-025), debajo de la tabla de sesiones y aparte
 * de sus páginas: siempre las últimas semanas. Todo lo que se ve lo decidió el
 * servidor —series, nivel, fuerza, tramos—; aquí sólo se pinta y se coloca.
 *
 * - «Músculos trabajados» es una TABLA de verdad: cada celda lleva la muestra
 *   del color del mapa y su cifra, así que la tabla es su propia alternativa.
 * - «Fuerza estimada» es SVG propio, con su tabla de datos al lado. Las líneas
 *   llevan además forma distinta en los puntos: el color no va solo.
 */

type Tren = Datos['fuerza'][number]['tren'];

const TREN: Record<Tren, { nombre: string; corto: string }> = {
  superior: { nombre: 'Tren superior', corto: 'Superior' },
  inferior: { nombre: 'Tren inferior', corto: 'Inferior' },
};

/** Semanas que caben en un teléfono: las más recientes. */
const SEMANAS_EN_MOVIL = 4;

// ── Músculos trabajados ─────────────────────────────────────────────────────

function MapaSemanal({ datos }: { datos: Datos }) {
  const { semanas, grupos } = datos;
  const vacio = grupos.every((g) => g.semanas.every((w) => w.nivel === 0));
  const antigua = (i: number) => i < semanas.length - SEMANAS_EN_MOVIL;
  return (
    <section class="tarjeta grafica" aria-labelledby="titulo-musculos">
      <div class="tarjeta-titulo">
        <h3 id="titulo-musculos">Músculos trabajados</h3>
        <span class="etiqueta-pequena">{semanas.length} semanas</span>
      </div>
      <p class="ayuda">
        Las series efectivas de cada grupo, semana a semana, con los colores del mapa del resumen.
        Una fila clara es un músculo que se está quedando atrás.
      </p>
      {vacio ? (
        <p class="cargando">Ninguna serie efectiva en estas {semanas.length} semanas.</p>
      ) : (
        <div class="tabla-desplazable">
          <table class="tabla mapa-semanal">
            <caption class="solo-lectores">
              Series efectivas por grupo muscular y semana, de la más antigua a la actual
            </caption>
            <thead>
              <tr>
                <th scope="col">Grupo</th>
                {semanas.map((s, i) => (
                  <th
                    key={s.desde}
                    scope="col"
                    class={antigua(i) ? 'numero semana-antigua' : 'numero'}
                  >
                    <span class="solo-lectores">Semana del </span>
                    {fechaCorta(s.desde)}
                    {s.en_curso && <span class="semana-en-curso">en curso</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {grupos.map((g) => (
                <tr key={g.id}>
                  <th scope="row" class="fila-titulo">
                    {g.nombre}
                  </th>
                  {g.semanas.map((w, i) => {
                    const semana = semanas[i];
                    return (
                      <td
                        key={semana?.desde ?? i}
                        class={antigua(i) ? 'celda-de-semana semana-antigua' : 'celda-de-semana'}
                        title={`${g.nombre}, semana del ${fechaLarga(semana?.desde ?? '')}: ${w.series_efectivas} series efectivas`}
                      >
                        <span class="leyenda-tramo" data-nivel={w.nivel} aria-hidden="true" />
                        <span class={w.nivel === 0 ? 'cifra sin-series' : 'cifra'}>
                          {w.series_efectivas}
                        </span>
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <LeyendaDeVolumen
        escala={datos.escala}
        nivelActivo={null}
        explicacion="El color indica cuántas series efectivas recibió cada grupo en cada semana: una cantidad, no una nota. La semana en curso todavía no ha terminado."
      />
    </section>
  );
}

// ── Fuerza estimada ─────────────────────────────────────────────────────────

/** El ancho real del contenedor, para dibujar a tamaño de pantalla y no escalar el texto. */
function useAncho(ref: { current: HTMLElement | null }, inicial: number): number {
  const [ancho, setAncho] = useState(inicial);
  useEffect(() => {
    const el = ref.current;
    if (el === null || typeof ResizeObserver === 'undefined') return;
    const observador = new ResizeObserver(([entrada]) => {
      const medido = Math.round(entrada?.contentRect.width ?? 0);
      if (medido > 0) setAncho(medido);
    });
    observador.observe(el);
    return () => observador.disconnect();
  }, []);
  return ancho;
}

/** 1, 2, 2.5 o 5 por una potencia de diez: las marcas del eje se leen de un vistazo. */
export function pasoRedondo(bruto: number): number {
  const potencia = 10 ** Math.floor(Math.log10(bruto));
  const f = bruto / potencia;
  const redondo = f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10;
  return redondo * potencia;
}

/** Las marcas del eje vertical alrededor de los valores, cuatro o cinco. */
export function marcasDelEje(valores: readonly number[]): number[] {
  const min = Math.min(...valores);
  const max = Math.max(...valores);
  const paso = pasoRedondo(Math.max((max - min) / 4, max * 0.02, 1));
  const desde = Math.floor(min / paso) * paso;
  let hasta = Math.ceil(max / paso) * paso;
  if (hasta === desde) hasta = desde + paso;
  const marcas: number[] = [];
  for (let v = desde; v <= hasta + paso / 2; v += paso) marcas.push(Number(v.toFixed(2)));
  return marcas;
}

/**
 * Los tramos que se dibujan unidos: índices seguidos, con dato y del mismo
 * tramo. Una semana sin dato deja hueco; un tramo nuevo, un corte.
 */
export function tramosDeLinea(
  semanas: readonly { readonly lb: string | null; readonly tramo: number | null }[],
): number[][] {
  const salida: number[][] = [];
  let actual: number[] = [];
  let tramo: number | null = null;
  semanas.forEach((w, i) => {
    if (w.lb === null || w.tramo !== tramo) {
      if (actual.length > 0) salida.push(actual);
      actual = [];
    }
    if (w.lb !== null) {
      actual.push(i);
      tramo = w.tramo;
    } else {
      tramo = null;
    }
  });
  if (actual.length > 0) salida.push(actual);
  return salida;
}

function Marcador({
  tren,
  x,
  y,
  grande = false,
}: {
  tren: Tren;
  x: number;
  y: number;
  grande?: boolean;
}) {
  const r = grande ? 6 : 4.5;
  return tren === 'superior' ? (
    <circle class={`marca-${tren}`} cx={x} cy={y} r={r} />
  ) : (
    <rect class={`marca-${tren}`} x={x - r} y={y - r} width={2 * r} height={2 * r} rx={1.5} />
  );
}

function MuestraDeSerie({ tren }: { tren: Tren }) {
  return (
    <svg class="muestra-de-serie" width="28" height="12" viewBox="0 0 28 12" aria-hidden="true">
      <line class={`linea-${tren}`} x1="1" y1="6" x2="27" y2="6" />
      <Marcador tren={tren} x={14} y={6} />
    </svg>
  );
}

const valorDe = (lb: string | null) => (lb === null ? null : Number(lb));

function GraficaDeFuerza({ datos }: { datos: Datos }) {
  const { semanas, fuerza } = datos;
  const contenedor = useRef<HTMLDivElement>(null);
  const ancho = useAncho(contenedor, 640);
  const [activa, setActiva] = useState<number | null>(null);

  const valores = fuerza.flatMap((f) =>
    f.semanas.map((w) => valorDe(w.lb)).filter((v): v is number => v !== null),
  );
  const estrecha = ancho < 480;
  const margen = { izquierda: 48, derecha: estrecha ? 12 : 118, arriba: 14, abajo: 30 };
  const alto = estrecha ? 220 : 260;
  const util = Math.max(ancho - margen.izquierda - margen.derecha, 40);
  const paso = semanas.length > 1 ? util / (semanas.length - 1) : 0;
  const x = (i: number) => margen.izquierda + i * paso;
  const marcas = valores.length === 0 ? [] : marcasDelEje(valores);
  const minimo = marcas[0] ?? 0;
  const maximo = marcas.at(-1) ?? 1;
  const y = (v: number) =>
    margen.arriba + (1 - (v - minimo) / (maximo - minimo)) * (alto - margen.arriba - margen.abajo);
  // Con poco sitio, una etiqueta de semana sí y otra no, contando desde la actual.
  const cadaCuantas = paso < 46 ? 2 : 1;

  // Rótulos directos al final de cada línea, separados si chocan.
  const rotulos = fuerza
    .map((f) => {
      const ultima = f.semanas.map((w) => w.lb).findLastIndex((lb) => lb !== null);
      const lb = ultima === -1 ? null : (f.semanas[ultima]?.lb ?? null);
      return lb === null ? null : { tren: f.tren, lb, y: y(Number(lb)) };
    })
    .filter((r) => r !== null);
  if (rotulos.length === 2) {
    const [a, b] = rotulos as [(typeof rotulos)[number], (typeof rotulos)[number]];
    const hueco = 30 - Math.abs(a.y - b.y);
    if (hueco > 0) {
      const arriba = a.y <= b.y ? a : b;
      const abajo = arriba === a ? b : a;
      arriba.y -= hueco / 2;
      abajo.y += hueco / 2;
    }
  }

  const semanaActiva = activa === null ? undefined : semanas[activa];

  return (
    <section class="tarjeta grafica" aria-labelledby="titulo-fuerza">
      <div class="tarjeta-titulo">
        <h3 id="titulo-fuerza">Fuerza estimada</h3>
        <span class="etiqueta-pequena">lb · {semanas.length} semanas</span>
      </div>
      <p class="ayuda">
        Cuánto podrías levantar en una repetición, estimado con tu mejor serie de cada ejercicio
        (carga, repeticiones y RIR). Sólo la mueven los ejercicios que repites de una semana a otra:
        cambiar de ejercicio no la sube ni la baja. Un hueco es una semana sin series con carga; un
        corte, que no repetiste ningún ejercicio.
      </p>
      {valores.length === 0 ? (
        <p class="cargando">Sin series con carga en estas {semanas.length} semanas.</p>
      ) : (
        <>
          <ul class="leyenda-de-series">
            {fuerza.map((f) => (
              <li key={f.tren}>
                <MuestraDeSerie tren={f.tren} />
                {TREN[f.tren].nombre}
              </li>
            ))}
          </ul>
          {/* El dibujo y su globo son para el puntero; los números, para todos, en la tabla de debajo. */}
          <div ref={contenedor} class="lienzo-de-fuerza" aria-hidden="true">
            <svg
              width={ancho}
              height={alto}
              viewBox={`0 0 ${ancho} ${alto}`}
              aria-hidden="true"
              onPointerLeave={() => setActiva(null)}
            >
              {marcas.map((m) => (
                <g key={m} class="eje">
                  <line x1={margen.izquierda} x2={margen.izquierda + util} y1={y(m)} y2={y(m)} />
                  <text x={margen.izquierda - 8} y={y(m)} dy="0.32em" text-anchor="end">
                    {m}
                  </text>
                </g>
              ))}
              {semanas.map((s, i) =>
                (semanas.length - 1 - i) % cadaCuantas === 0 ? (
                  <text
                    key={s.desde}
                    class="eje-semana"
                    x={x(i)}
                    y={alto - 8}
                    text-anchor={i === 0 ? 'start' : i === semanas.length - 1 ? 'end' : 'middle'}
                  >
                    {fechaCorta(s.desde)}
                  </text>
                ) : null,
              )}
              {activa !== null && (
                <line
                  class="cruz"
                  x1={x(activa)}
                  x2={x(activa)}
                  y1={margen.arriba}
                  y2={alto - margen.abajo}
                />
              )}
              {fuerza.map((f) =>
                tramosDeLinea(f.semanas).map((tramo) => (
                  <g key={`${f.tren}-${tramo[0]}`}>
                    {tramo.length > 1 && (
                      <polyline
                        class={`linea-${f.tren}`}
                        points={tramo
                          .map((i) => `${x(i)},${y(Number(f.semanas[i]?.lb))}`)
                          .join(' ')}
                      />
                    )}
                    {tramo.map((i) => (
                      <Marcador
                        key={i}
                        tren={f.tren}
                        x={x(i)}
                        y={y(Number(f.semanas[i]?.lb))}
                        grande={i === activa}
                      />
                    ))}
                  </g>
                )),
              )}
              {!estrecha &&
                rotulos.map((r) => (
                  <text
                    key={r.tren}
                    class="rotulo-de-serie"
                    x={margen.izquierda + util + 12}
                    y={r.y}
                    dy="0.32em"
                  >
                    <tspan class="rotulo-nombre">{TREN[r.tren].corto}</tspan>
                    <tspan x={margen.izquierda + util + 12} dy="1.15em">
                      {r.lb} lb
                    </tspan>
                  </text>
                ))}
              {semanas.map((s, i) => (
                <rect
                  key={s.desde}
                  class="zona-de-semana"
                  x={x(i) - Math.max(paso, 24) / 2}
                  y={margen.arriba}
                  width={Math.max(paso, 24)}
                  height={alto - margen.arriba - margen.abajo}
                  onPointerEnter={() => setActiva(i)}
                  onPointerDown={() => setActiva(i)}
                />
              ))}
            </svg>
            <div class="detalle-de-fuerza">
              {semanaActiva !== undefined && activa !== null && (
                // A un lado de la línea de la semana, nunca encima de sus puntos.
                <div
                  class={
                    x(activa) > ancho / 2
                      ? 'globo-de-fuerza globo-a-la-izquierda'
                      : 'globo-de-fuerza'
                  }
                  style={{
                    left: `${x(activa) > ancho / 2 ? x(activa) - 14 : x(activa) + 14}px`,
                  }}
                >
                  <p class="globo-titulo">
                    {semanaActiva.en_curso
                      ? 'Esta semana'
                      : `Semana del ${fechaLarga(semanaActiva.desde)}`}
                  </p>
                  {fuerza.map((f) => {
                    const w = f.semanas[activa];
                    return (
                      <p key={f.tren} class="globo-fila">
                        <MuestraDeSerie tren={f.tren} />
                        <span>{TREN[f.tren].corto}:</span>
                        <strong class="cifra">
                          {w?.lb === null || w === undefined ? '—' : `${w.lb} lb`}
                        </strong>
                        {w?.cambio !== null && w?.cambio !== undefined && (
                          <span class="cifra globo-cambio">{w.cambio} %</span>
                        )}
                      </p>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
          <details class="datos-de-grafica">
            <summary>Ver los datos</summary>
            <div class="tabla-desplazable">
              <table class="tabla">
                <caption class="solo-lectores">
                  Fuerza estimada por tren y semana, en libras
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Semana</th>
                    {fuerza.map((f) => (
                      <th key={f.tren} scope="col" class="numero">
                        {TREN[f.tren].corto} (lb)
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {semanas.map((s, i) => (
                    <tr key={s.desde}>
                      <th scope="row" class="fila-titulo">
                        {s.en_curso ? 'Esta semana' : `Semana del ${fechaCorta(s.desde)}`}
                      </th>
                      {fuerza.map((f) => {
                        const w = f.semanas[i];
                        return (
                          <td key={f.tren} class="numero cifra">
                            {w?.lb ?? '—'}
                            {w?.cambio !== null && w?.cambio !== undefined && (
                              <span class="cambio-en-tabla"> ({w.cambio} %)</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        </>
      )}
    </section>
  );
}

export function GraficasDelHistorial() {
  const recurso = useRecurso<Datos>('/api/lectura/v1/historial/graficas');
  const datos = recurso.datos;
  return (
    <div class="graficas-del-historial">
      {recurso.estado === 'error' && (
        <ErrorDeCarga mensaje={recurso.error} reintenta={recurso.recarga} />
      )}
      {datos === null && recurso.estado === 'cargando' && (
        <Cargando texto="Cargando las gráficas…" />
      )}
      {datos !== null && (
        <>
          <MapaSemanal datos={datos} />
          <GraficaDeFuerza datos={datos} />
        </>
      )}
    </div>
  );
}
