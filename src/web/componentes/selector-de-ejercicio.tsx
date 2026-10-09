import { useMemo, useState } from 'preact/hooks';
import type { CatalogoBase, EjercicioBase, Equipamiento } from '../../catalogo/tipos';
import { normalizaNombre, paraBuscar } from '../formato/numeros';
import { BotonVerEjemplo } from './boton-ver-ejemplo';
import { Icono } from './iconos';

/**
 * El desplegable de ejercicio: con 170 ejercicios un `select` plano dejó de
 * servir. Busca por nombre y por SINÓNIMO y filtra por equipamiento. Los
 * sinónimos salen del catálogo base y viven sólo aquí: en el almacén serían una
 * segunda clave por la que dos ejercicios podrían colisionar.
 *
 * No crea nada: un nombre que el catálogo no tiene no se puede ni escribir.
 */

export interface EjercicioElegible {
  readonly id: string;
  readonly nombre: string;
  /** De qué ejercicio base sale su figura de «Ver ejemplo»; sin él, no hay botón. */
  readonly base_id?: string | null;
}

export const NOMBRE_DE_EQUIPO: Record<Equipamiento | 'peso-corporal', string> = {
  'peso-corporal': 'Peso corporal',
  mancuernas: 'Mancuernas',
  barra: 'Barra',
  rack: 'Rack',
  banco: 'Banco',
  polea: 'Polea',
  maquina: 'Máquina',
  'barra-dominadas': 'Barra de dominadas',
  paralelas: 'Paralelas',
  kettlebell: 'Kettlebell',
  'barra-z': 'Barra Z',
  rueda: 'Rueda',
  banda: 'Banda',
  anillas: 'Anillas',
};

const FILTROS: readonly (Equipamiento | 'peso-corporal')[] = [
  'peso-corporal',
  'mancuernas',
  'barra',
  'polea',
  'maquina',
  'kettlebell',
  'barra-dominadas',
  'banda',
  'anillas',
];

const MAXIMO_VISIBLE = 60;

export function SelectorDeEjercicio({
  ejercicios,
  base,
  elegido,
  alElegir,
  nombreDelGrupo = 'ejercicio',
}: {
  ejercicios: readonly EjercicioElegible[];
  base: CatalogoBase | null;
  elegido: string | null;
  alElegir: (id: string) => void;
  nombreDelGrupo?: string;
}) {
  const [texto, setTexto] = useState('');
  const [filtros, setFiltros] = useState<ReadonlySet<string>>(new Set());

  const semilla = useMemo(() => {
    const porNombre = new Map<string, EjercicioBase>();
    for (const e of base?.ejercicios ?? []) porNombre.set(normalizaNombre(e.nombre), e);
    return porNombre;
  }, [base]);

  const conDatos = useMemo(
    () =>
      ejercicios.map((e) => {
        const b = semilla.get(normalizaNombre(e.nombre));
        const equipo: string[] =
          b === undefined
            ? []
            : b.equipamiento.length === 0
              ? ['peso-corporal']
              : [...b.equipamiento];
        return {
          ...e,
          equipo,
          buscable: [e.nombre, ...(b?.alias ?? [])].map(paraBuscar),
        };
      }),
    [ejercicios, semilla],
  );

  const consulta = paraBuscar(texto);
  const visibles = conDatos.filter(
    (e) =>
      (consulta === '' || e.buscable.some((t) => t.includes(consulta))) &&
      (filtros.size === 0 || e.equipo.some((q) => filtros.has(q))),
  );
  const elegidoVisible = conDatos.find((e) => e.id === elegido);

  const alternaFiltro = (q: string) => {
    const nuevos = new Set(filtros);
    if (nuevos.has(q)) nuevos.delete(q);
    else nuevos.add(q);
    setFiltros(nuevos);
  };

  return (
    <div class="formulario">
      <div class="campo">
        <label for={`buscar-${nombreDelGrupo}`}>Buscar ejercicio</label>
        <div class="buscador">
          <Icono nombre="search" tamano={18} />
          <input
            id={`buscar-${nombreDelGrupo}`}
            class="entrada"
            type="search"
            autocomplete="off"
            placeholder="Nombre o sinónimo: «lagartijas», «jalón»…"
            value={texto}
            onInput={(e) => setTexto((e.target as HTMLInputElement).value)}
          />
        </div>
      </div>
      {base !== null && (
        <fieldset class="chips sin-marco">
          <legend class="solo-lectores">Filtrar por equipamiento</legend>
          {FILTROS.map((q) => (
            <button
              key={q}
              type="button"
              class="chip"
              aria-pressed={filtros.has(q)}
              onClick={() => alternaFiltro(q)}
            >
              {NOMBRE_DE_EQUIPO[q]}
            </button>
          ))}
        </fieldset>
      )}
      <fieldset class="sin-marco">
        <legend class="solo-lectores">Ejercicio</legend>
        {visibles.length === 0 ? (
          <p class="cargando">Ningún ejercicio coincide. Prueba con otro nombre o quita filtros.</p>
        ) : (
          <ul class="lista-de-ejercicios">
            {visibles.slice(0, MAXIMO_VISIBLE).map((e) => (
              <li key={e.id}>
                <label>
                  <span>
                    <input
                      type="radio"
                      name={nombreDelGrupo}
                      value={e.id}
                      checked={e.id === elegido}
                      onChange={() => alElegir(e.id)}
                    />{' '}
                    {e.nombre}
                  </span>
                  <span class="equipo">
                    {e.equipo.map((q) => NOMBRE_DE_EQUIPO[q as Equipamiento] ?? q).join(' · ')}
                  </span>
                </label>
                {/* Fuera de la etiqueta: dentro, el clic elegiría el ejercicio. */}
                {e.base_id !== undefined && e.base_id !== null && (
                  <BotonVerEjemplo baseId={e.base_id} nombre={e.nombre} base={base} compacto />
                )}
              </li>
            ))}
          </ul>
        )}
        {visibles.length > MAXIMO_VISIBLE && (
          <p class="cargando">
            {visibles.length - MAXIMO_VISIBLE} más: afina la búsqueda para verlos.
          </p>
        )}
      </fieldset>
      {elegidoVisible !== undefined && (
        <p class="solo-lectores" aria-live="polite">
          Elegido: {elegidoVisible.nombre}
        </p>
      )}
    </div>
  );
}
