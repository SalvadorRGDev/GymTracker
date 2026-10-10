import type { ComponentChildren } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import { sal } from '../estado/sesion';
import { Enlace } from './basicos';
import { Icono, type NombreDeIcono } from './iconos';

export interface Seccion {
  readonly camino: string;
  readonly titulo: string;
  readonly icono: NombreDeIcono;
}

export const SECCIONES: readonly Seccion[] = [
  { camino: '/', titulo: 'Resumen', icono: 'layout-dashboard' },
  { camino: '/registrar', titulo: 'Registrar', icono: 'circle-plus' },
  { camino: '/historial', titulo: 'Historial', icono: 'history' },
  { camino: '/proyeccion', titulo: 'Proyección', icono: 'trending-up' },
  { camino: '/comparativa', titulo: 'Comparativa', icono: 'scale' },
  { camino: '/planes', titulo: 'Rutinas', icono: 'calendar-range' },
  { camino: '/catalogo', titulo: 'Catálogo', icono: 'library' },
  { camino: '/dispositivos', titulo: 'Dispositivos', icono: 'smartphone' },
];

/**
 * La cabecera es el único sitio de la página con vidrio: el contenido pasa por
 * debajo al desplazar, que es cuando el desenfoque aporta algo.
 */
export function Marco({
  camino,
  correo,
  children,
}: {
  camino: string;
  correo: string;
  children: ComponentChildren;
}) {
  const [conSombra, setConSombra] = useState(false);
  useEffect(() => {
    const mira = () => setConSombra(window.scrollY > 8);
    mira();
    window.addEventListener('scroll', mira, { passive: true });
    return () => window.removeEventListener('scroll', mira);
  }, []);

  return (
    <>
      {/* El primer tabulador de cada página: salta la cabecera y sus ocho enlaces.
          Un botón que mueve el foco, no un «#contenido»: el salto por fragmento
          dejaría el principio del contenido debajo de la cabecera fija. */}
      <button
        type="button"
        class="salto-al-contenido"
        onClick={() => document.getElementById('contenido')?.focus({ preventScroll: true })}
      >
        Saltar al contenido
      </button>
      <header class={`marco-cabecera${conSombra ? ' con-sombra' : ''}`}>
        <div class="contenedor">
          <div class="cabecera-fila">
            <Enlace href="/" class="marca" aria-label="GymTracker, ir al resumen">
              <span class="marca-simbolo" aria-hidden="true">
                <Icono nombre="dumbbell" tamano={17} />
              </span>
              GymTracker
            </Enlace>
            <nav class="navegacion navegacion-escritorio" aria-label="Secciones">
              <ListaDeSecciones camino={camino} />
            </nav>
            <div class="cabecera-usuario">
              {/* El correo no va en la barra: con las ocho secciones no cabe en ningún
                  ancho (el contenido mide 1200 px como mucho) y acababa tapándolas. */}
              <button
                type="button"
                class="boton-texto"
                title={`Sesión de ${correo}`}
                onClick={() => void sal()}
              >
                <Icono nombre="log-out" tamano={16} />
                Salir
              </button>
            </div>
          </div>
        </div>
      </header>
      <main id="contenido" class="principal" tabIndex={-1}>
        <div class="contenedor">{children}</div>
      </main>
      <footer class="pie">
        <div class="contenedor">
          <span>GymTracker · series efectivas por grupo y semana</span>
          <span>Tus datos viven en tu máquina, en libros de Excel.</span>
        </div>
      </footer>
    </>
  );
}

function ListaDeSecciones({ camino }: { camino: string }) {
  return (
    <>
      {SECCIONES.map((s) => (
        <Enlace
          key={s.camino}
          href={s.camino}
          {...(s.camino === camino ? { 'aria-current': 'page' as const } : {})}
        >
          <Icono nombre={s.icono} tamano={16} />
          {s.titulo}
        </Enlace>
      ))}
    </>
  );
}
