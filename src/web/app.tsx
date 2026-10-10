import { useEffect } from 'preact/hooks';
import { Cargando, Enlace, Vacio } from './componentes/basicos';
import { Marco, SECCIONES } from './componentes/marco';
import { useUbicacion } from './estado/ruta';
import { compruebaSesion, useSesion } from './estado/sesion';
import { Acceso } from './paginas/acceso';
import { Catalogo } from './paginas/catalogo';
import { Comparativa } from './paginas/comparativa';
import { Dispositivos } from './paginas/dispositivos';
import { Historial } from './paginas/historial';
import { Planes } from './paginas/planes';
import { Proyeccion } from './paginas/proyeccion';
import { Registrar } from './paginas/registrar';
import { Resumen } from './paginas/resumen';

function Pagina({ camino, zona }: { camino: string; zona: string }) {
  switch (camino) {
    case '/':
      return <Resumen zona={zona} />;
    case '/registrar':
      return <Registrar />;
    case '/historial':
      return <Historial zona={zona} />;
    case '/proyeccion':
      return <Proyeccion />;
    case '/comparativa':
      return <Comparativa />;
    case '/planes':
      return <Planes />;
    case '/catalogo':
      return <Catalogo />;
    case '/dispositivos':
      return <Dispositivos zona={zona} />;
    default:
      return (
        <Vacio icono="search" titulo="Esta página no existe">
          <p>
            <Enlace href="/">Vuelve al resumen</Enlace>.
          </p>
        </Vacio>
      );
  }
}

export function App() {
  const sesion = useSesion();
  const { camino } = useUbicacion();

  useEffect(() => {
    void compruebaSesion();
  }, []);

  useEffect(() => {
    const seccion = SECCIONES.find((s) => s.camino === camino);
    document.title =
      sesion.tipo === 'activa' && seccion !== undefined
        ? `${seccion.titulo} · GymTracker`
        : 'GymTracker';
  }, [camino, sesion.tipo]);

  if (sesion.tipo === 'comprobando') {
    return (
      <main class="acceso">
        <div class="contenedor">
          <Cargando texto="Comprobando la sesión…" />
        </div>
      </main>
    );
  }
  if (sesion.tipo === 'anonima') return <Acceso />;
  return (
    <Marco camino={camino} correo={sesion.correo}>
      <Pagina camino={camino} zona={sesion.zona} />
    </Marco>
  );
}
