import { useState } from 'preact/hooks';
import { Aviso } from '../componentes/basicos';
import { Silueta } from '../componentes/figura-muscular';
import { Icono } from '../componentes/iconos';
import { mensajeDe } from '../estado/api';
import { entra } from '../estado/sesion';

/**
 * Formato de hero: título serif, una línea de texto y la tarjeta de acceso.
 * La ilustración es la silueta del modelo SIN colorear: nada de datos de
 * muestra que parezcan reales. No hay registro público (ADR-007).
 */
export function Acceso() {
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);

  const enviar = async (evento: Event) => {
    evento.preventDefault();
    setOcupado(true);
    setError(null);
    try {
      await entra(correo, contrasena);
    } catch (e) {
      // El mismo texto exista o no el correo: lo decide el servidor.
      setError(mensajeDe(e));
    } finally {
      setOcupado(false);
    }
  };

  return (
    <main class="acceso">
      <div class="acceso-brillo" aria-hidden="true" />
      <div class="lineas-discontinuas" aria-hidden="true">
        <span />
        <span />
      </div>
      <div class="contenedor acceso-rejilla">
        <div class="acceso-texto">
          <span class="insignia">
            <span class="insignia-punto" aria-hidden="true" />
            Series efectivas por grupo y semana
          </span>
          <h1>Cuánto trabajó cada músculo esta semana</h1>
          <p class="entradilla">
            SIGIR cuenta las series efectivas que recibe cada grupo muscular y las pone junto a lo
            que planeaste. Tus datos viven en tu máquina, en libros de Excel que puedes abrir cuando
            quieras.
          </p>
          <form
            class="tarjeta acceso-tarjeta formulario"
            onSubmit={enviar}
            aria-labelledby="titulo-acceso"
          >
            <h3 id="titulo-acceso">Entrar</h3>
            <div class="campo">
              <label for="correo">Correo</label>
              <input
                id="correo"
                class="entrada"
                type="email"
                autocomplete="username"
                required
                value={correo}
                onInput={(e) => setCorreo((e.target as HTMLInputElement).value)}
              />
            </div>
            <div class="campo">
              <label for="contrasena">Contraseña</label>
              <input
                id="contrasena"
                class="entrada"
                type="password"
                autocomplete="current-password"
                required
                value={contrasena}
                onInput={(e) => setContrasena((e.target as HTMLInputElement).value)}
              />
            </div>
            <output aria-live="polite">
              {error !== null && <Aviso tipo="error">{error}</Aviso>}
            </output>
            <button type="submit" class="boton boton-grande" disabled={ocupado}>
              {ocupado ? 'Entrando…' : 'Entrar'}
              <Icono nombre="arrow-right" tamano={18} />
            </button>
            <p class="ayuda">
              Las cuentas se crean en el servidor con <code>npm run alta</code>. No hay registro
              público.
            </p>
          </form>
        </div>
        <Silueta />
      </div>
    </main>
  );
}
