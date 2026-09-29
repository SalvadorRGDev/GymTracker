import { useEffect, useState } from 'preact/hooks';
import type { EstadoDelAlta } from '../../api/sesion/contrato';
import { Aviso } from '../componentes/basicos';
import { Silueta } from '../componentes/figura-muscular';
import { Icono } from '../componentes/iconos';
import { mensajeDe, pide } from '../estado/api';
import { entra, registra } from '../estado/sesion';

/**
 * Formato de hero: título serif, una línea de texto y la tarjeta de acceso.
 * La ilustración es la silueta del modelo SIN colorear: nada de datos de
 * muestra que parezcan reales. «Crear cuenta» sólo aparece si el servidor dice
 * que el alta está abierta (ADR-020); los límites los pone él.
 */

function zonaDelNavegador(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Mexico_City';
  } catch {
    return 'America/Mexico_City';
  }
}

export function Acceso() {
  const [modo, setModo] = useState<'entrar' | 'alta'>('entrar');
  const [altaAbierta, setAltaAbierta] = useState(false);
  const [correo, setCorreo] = useState('');
  const [contrasena, setContrasena] = useState('');
  const [repetida, setRepetida] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [ocupado, setOcupado] = useState(false);
  const zona = zonaDelNavegador();

  useEffect(() => {
    pide<EstadoDelAlta>('GET', '/api/sesion/v1/alta', undefined, { sinRedirigir: true })
      .then((r) => setAltaAbierta(r.abierta))
      .catch(() => setAltaAbierta(false));
  }, []);

  const cambia = (nuevo: 'entrar' | 'alta') => {
    setModo(nuevo);
    setError(null);
    setContrasena('');
    setRepetida('');
  };

  const enviar = async (evento: Event) => {
    evento.preventDefault();
    setError(null);
    if (modo === 'alta' && contrasena !== repetida) {
      setError('Las dos contraseñas no coinciden.');
      return;
    }
    setOcupado(true);
    try {
      if (modo === 'alta') await registra(correo, contrasena, zona);
      else await entra(correo, contrasena);
    } catch (e) {
      // Los textos los decide el servidor: el mismo fallo de acceso exista o no el correo.
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
            <h3 id="titulo-acceso">{modo === 'alta' ? 'Crear cuenta' : 'Entrar'}</h3>
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
                autocomplete={modo === 'alta' ? 'new-password' : 'current-password'}
                required
                {...(modo === 'alta' ? { minLength: 12, maxLength: 128 } : {})}
                value={contrasena}
                onInput={(e) => setContrasena((e.target as HTMLInputElement).value)}
              />
              {modo === 'alta' && (
                <span class="ayuda">
                  12 caracteres o más, que no uses en otro sitio. Todavía no se puede cambiar
                  después, así que guárdala en tu gestor de contraseñas.
                </span>
              )}
            </div>
            {modo === 'alta' && (
              <div class="campo">
                <label for="repetida">Repite la contraseña</label>
                <input
                  id="repetida"
                  class="entrada"
                  type="password"
                  autocomplete="new-password"
                  required
                  value={repetida}
                  onInput={(e) => setRepetida((e.target as HTMLInputElement).value)}
                />
                <span class="ayuda">Tu zona horaria: {zona}.</span>
              </div>
            )}
            <output aria-live="polite">
              {error !== null && <Aviso tipo="error">{error}</Aviso>}
            </output>
            <button type="submit" class="boton boton-grande" disabled={ocupado}>
              {modo === 'alta'
                ? ocupado
                  ? 'Creando la cuenta…'
                  : 'Crear cuenta'
                : ocupado
                  ? 'Entrando…'
                  : 'Entrar'}
              <Icono nombre="arrow-right" tamano={18} />
            </button>
            {altaAbierta && modo === 'entrar' && (
              <p class="ayuda">
                ¿No tienes cuenta?{' '}
                <button
                  type="button"
                  class="boton-texto boton-pequeno"
                  onClick={() => cambia('alta')}
                >
                  Crear una
                </button>
              </p>
            )}
            {modo === 'alta' && (
              <p class="ayuda">
                ¿Ya tienes cuenta?{' '}
                <button
                  type="button"
                  class="boton-texto boton-pequeno"
                  onClick={() => cambia('entrar')}
                >
                  Entrar
                </button>
              </p>
            )}
            {!altaAbierta && modo === 'entrar' && (
              <p class="ayuda">Para tener una cuenta, pídesela a quien administra este servidor.</p>
            )}
          </form>
        </div>
        <Silueta />
      </div>
    </main>
  );
}
