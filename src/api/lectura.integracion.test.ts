import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { RespuestaDeCaptura } from './captura/contrato.js';
import type {
  Catalogo,
  Dashboard,
  DispositivoEmitido,
  Dispositivos,
  Exportacion,
  Historial,
  ResultadoDeImportacion,
  ResultadoDeParametros,
} from './lectura/contrato.js';
import { type Cuenta, type ServidorDePrueba, servidorDePrueba } from './prueba/servidor.js';

let s: ServidorDePrueba;
let ana: Cuenta;
let beto: Cuenta;

beforeEach(async () => {
  s = await servidorDePrueba();
  ana = await s.cuenta('ana@ejemplo.com');
  beto = await s.cuenta('beto@ejemplo.com');
});

afterEach(async () => {
  await s.limpia();
});

async function lee<T>(cuenta: Cuenta, url: string): Promise<T> {
  const r = await s.pide({ method: 'GET', url, headers: { cookie: cuenta.cookie } });
  expect(r.statusCode, r.body).toBe(200);
  return r.json() as T;
}

function escribe(cuenta: Cuenta, method: 'POST' | 'PUT', url: string, payload: unknown) {
  return s.pide({ method, url, headers: { cookie: cuenta.cookie }, payload: payload as object });
}

async function serie(
  cuenta: Cuenta,
  ejercicio: string,
  opciones: { rir?: number; sesion?: string } = {},
): Promise<RespuestaDeCaptura> {
  const r = await escribe(cuenta, 'POST', '/api/registro/v1/serie', {
    sesion: { clave: opciones.sesion ?? randomUUID() },
    serie: {
      clave: randomUUID(),
      ejercicio,
      repeticiones: 10,
      carga_lb: '50',
      rir: opciones.rir ?? 2,
      calentamiento: false,
    },
  });
  expect(r.statusCode, r.body).toBe(200);
  return r.json() as RespuestaDeCaptura;
}

const dashboard = (c: Cuenta) => lee<Dashboard>(c, '/api/lectura/v1/dashboard');
const catalogo = (c: Cuenta) => lee<Catalogo>(c, '/api/lectura/v1/catalogo');
const volumen = (d: Dashboard, nombre: string) => d.grupos.find((g) => g.nombre === nombre);

async function creaGrupo(c: Cuenta, nombre: string): Promise<string> {
  const r = await escribe(c, 'POST', '/api/lectura/v1/catalogo/grupos', { nombre });
  expect(r.statusCode, r.body).toBe(201);
  return (r.json() as { id: string }).id;
}

async function creaEjercicio(c: Cuenta, nombre: string): Promise<string> {
  const r = await escribe(c, 'POST', '/api/lectura/v1/catalogo/ejercicios', { nombre });
  expect(r.statusCode, r.body).toBe(201);
  return (r.json() as { id: string }).id;
}

async function guardaParametros(
  c: Cuenta,
  umbral: number,
  contribuciones: { ejercicio_id: string; grupo_id: string; coeficiente: string }[],
): Promise<ResultadoDeParametros> {
  const r = await escribe(c, 'PUT', '/api/lectura/v1/catalogo/parametros', {
    umbral_rir: umbral,
    contribuciones,
  });
  expect(r.statusCode, r.body).toBe(200);
  return r.json() as ResultadoDeParametros;
}

describe('GET /api/lectura/v1/dashboard', () => {
  it('decide el nivel en el servidor, con aritmética entera, justo en los cortes', async () => {
    const nombres = ['N0', 'N001', 'N399', 'N400', 'N1199', 'N1200', 'N1999', 'N2000'];
    const grupos = Object.fromEntries(
      await Promise.all(nombres.map(async (n) => [n, await creaGrupo(ana, n)] as const)),
    );
    const diez = await creaEjercicio(ana, 'Diez series');
    const una = await creaEjercicio(ana, 'Una serie');
    const g = (n: string) => grupos[n] ?? '';
    await guardaParametros(ana, 4, [
      { ejercicio_id: diez, grupo_id: g('N399'), coeficiente: '0.39' },
      { ejercicio_id: diez, grupo_id: g('N400'), coeficiente: '0.40' },
      { ejercicio_id: diez, grupo_id: g('N1199'), coeficiente: '1.19' },
      { ejercicio_id: diez, grupo_id: g('N1200'), coeficiente: '1.20' },
      { ejercicio_id: diez, grupo_id: g('N1999'), coeficiente: '1.99' },
      { ejercicio_id: diez, grupo_id: g('N2000'), coeficiente: '2.00' },
      { ejercicio_id: una, grupo_id: g('N001'), coeficiente: '0.01' },
      { ejercicio_id: una, grupo_id: g('N399'), coeficiente: '0.09' },
      { ejercicio_id: una, grupo_id: g('N1199'), coeficiente: '0.09' },
      { ejercicio_id: una, grupo_id: g('N1999'), coeficiente: '0.09' },
    ]);
    const sesion = randomUUID();
    for (let i = 0; i < 10; i += 1) await serie(ana, 'Diez series', { sesion });
    await serie(ana, 'Una serie', { sesion });

    const d = await dashboard(ana);
    const leido = Object.fromEntries(
      d.grupos.map((x) => [x.nombre, [x.series_efectivas, x.nivel]]),
    );
    expect(leido).toEqual({
      N0: ['0.00', 0],
      N001: ['0.01', 1],
      N399: ['3.99', 1],
      N400: ['4.00', 2],
      N1199: ['11.99', 3],
      N1200: ['12.00', 4],
      N1999: ['19.99', 5],
      N2000: ['20.00', 6],
    });
    // Grupos creados a mano: sin zona en el modelo y sin rango heredado.
    expect(d.grupos.every((x) => x.zona === null && x.referencia === null)).toBe(true);
    expect(d.estadisticas).toEqual({ series_efectivas: 11, sesiones: 1, grupos_sin_trabajo: 1 });
    // La otra persona, intacta.
    expect((await dashboard(beto)).grupos).toEqual([]);
  });

  it('trae la escala entera y ordenada: la leyenda sale de aquí, no del cliente', async () => {
    const d = await dashboard(ana);
    expect(d.escala.map((t) => [t.nivel, t.desde, t.hasta, t.rotulo])).toEqual([
      [0, '0.00', '0.00', 'Sin trabajo'],
      [1, '0.00', '4.00', 'Estímulo mínimo'],
      [2, '4.00', '8.00', 'Poco volumen'],
      [3, '8.00', '12.00', 'Volumen moderado'],
      [4, '12.00', '16.00', 'Volumen alto'],
      [5, '16.00', '20.00', 'Volumen muy alto'],
      [6, '20.00', null, 'Más de 20 series'],
    ]);
  });

  it('todos los grupos, los de cero incluidos, con zona y referencia; la semana es lunes a domingo', async () => {
    await s.importaBase(ana);
    await serie(ana, 'Dominadas');
    const d = await dashboard(ana);
    expect(d.semana).toEqual({ desde: '2026-09-21', hasta: '2026-09-27', hoy: '2026-09-26' });
    expect(d.grupos).toHaveLength(16);
    expect(d.grupos[0]?.nombre).toBe('Pectoral'); // orden de la taxonomía
    expect(volumen(d, 'Dorsal')).toMatchObject({
      series_efectivas: '1.00',
      nivel: 1,
      zona: 'dorsal',
      referencia: {
        banda: 'general',
        minimo: '10.00',
        maximo: '20.00',
        respaldo: 'publicado',
        estado: 'por-debajo',
      },
    });
    expect(volumen(d, 'Cuádriceps')).toMatchObject({
      series_efectivas: '0.00',
      nivel: 0,
      zona: 'cuadriceps',
    });
    expect(d.frescura.ultima_serie_recibida).toBe('2026-09-26T18:00:00.000Z');
    expect(d.catalogo).toEqual({ grupos: 16, ejercicios: 170 });
  });

  it('un grupo renombrado pierde su zona y su rango: no hereda nada', async () => {
    const id = await creaGrupo(ana, 'Espalda alta');
    const d = await dashboard(ana);
    expect(d.grupos.find((x) => x.id === id)).toMatchObject({ zona: null, referencia: null });
  });
});

describe('parámetros versionados desde la web', () => {
  it('sin sesiones que la fijen, guardar reescribe en sitio y lo de hoy ya cuenta (ADR-013)', async () => {
    const grupo = await creaGrupo(ana, 'Pectoral');
    const press = await creaEjercicio(ana, 'Press banca');
    const r = await guardaParametros(ana, 4, [
      { ejercicio_id: press, grupo_id: grupo, coeficiente: '1.00' },
    ]);
    expect(r).toMatchObject({ camino: 'en-sitio', vigente_desde: '2000-01-01' });
    await serie(ana, 'Press banca');
    expect(volumen(await dashboard(ana), 'Pectoral')?.series_efectivas).toBe('1.00');
  });

  it('con datos previos, editar un coeficiente no cambia el histórico: la sucesora rige desde mañana', async () => {
    const grupo = await creaGrupo(ana, 'Pectoral');
    const press = await creaEjercicio(ana, 'Press banca');
    await guardaParametros(ana, 4, [{ ejercicio_id: press, grupo_id: grupo, coeficiente: '1.00' }]);
    await serie(ana, 'Press banca');
    const cambio = await guardaParametros(ana, 4, [
      { ejercicio_id: press, grupo_id: grupo, coeficiente: '0.50' },
    ]);
    expect(cambio).toMatchObject({ camino: 'sucesora', vigente_desde: '2026-09-27' });
    expect(volumen(await dashboard(ana), 'Pectoral')?.series_efectivas).toBe('1.00');

    s.reloj.avanza(86_400_000); // domingo 27, misma semana
    await serie(ana, 'Press banca');
    const d = await dashboard(ana);
    expect(volumen(d, 'Pectoral')?.series_efectivas).toBe('1.50');
    expect(d.diagnostico.versiones_de_parametros).toHaveLength(2);
  });

  it('con datos previos, editar el umbral tampoco reescribe lo pasado', async () => {
    const grupo = await creaGrupo(ana, 'Pectoral');
    const press = await creaEjercicio(ana, 'Press banca');
    const par = [{ ejercicio_id: press, grupo_id: grupo, coeficiente: '1.00' }];
    await guardaParametros(ana, 4, par);
    await serie(ana, 'Press banca', { rir: 4 });
    await guardaParametros(ana, 3, par);
    s.reloj.avanza(86_400_000);
    await serie(ana, 'Press banca', { rir: 4 });
    const d = await dashboard(ana);
    expect(volumen(d, 'Pectoral')?.series_efectivas).toBe('1.00');
    expect(d.diagnostico.series_sobre_umbral).toBe(1);
  });

  it('una sesión futura (fecha por confirmar) que fija la versión bloquea el cambio con una explicación', async () => {
    await s.importaBase(ana);
    const portador = await s.portador(ana);
    await s.pide({
      method: 'POST',
      url: '/api/captura/v1/serie',
      headers: { authorization: `Bearer ${portador}` },
      payload: {
        sesion: { clave: randomUUID(), iniciada_en: '2030-01-01T17:00:00Z' },
        serie: {
          clave: randomUUID(),
          ejercicio: 'Press banca',
          repeticiones: 10,
          carga_lb: '60',
          rir: 2,
          calentamiento: false,
          realizada_en: '2030-01-01T17:00:00Z',
        },
      },
    });
    const r = await escribe(ana, 'PUT', '/api/lectura/v1/catalogo/parametros', {
      umbral_rir: 3,
      contribuciones: [],
    });
    expect(r.statusCode).toBe(409);
    expect(r.json()).toMatchObject({ codigo: 'fijada-por-futura' });
  });

  it('rechaza referencias ajenas, pares repetidos y coeficientes fuera de rango', async () => {
    const grupo = await creaGrupo(ana, 'Pectoral');
    const press = await creaEjercicio(ana, 'Press banca');
    const ajeno = await creaGrupo(beto, 'Pectoral');
    const envia = (contribuciones: unknown) =>
      escribe(ana, 'PUT', '/api/lectura/v1/catalogo/parametros', { umbral_rir: 4, contribuciones });
    expect(
      (await envia([{ ejercicio_id: press, grupo_id: ajeno, coeficiente: '1.00' }])).statusCode,
    ).toBe(422);
    const par = { ejercicio_id: press, grupo_id: grupo, coeficiente: '1.00' };
    expect((await envia([par, par])).statusCode).toBe(422);
    expect((await envia([{ ...par, coeficiente: '2.50' }])).statusCode).toBe(422);
    expect((await envia([{ ...par, coeficiente: '0' }])).statusCode).toBe(422);
  });
});

describe('catálogo: crear, archivar, importar', () => {
  it('nombres únicos sin distinguir mayúsculas; archivar esconde de la captura y conserva el histórico', async () => {
    await creaEjercicio(ana, 'Remo raro');
    const repetido = await escribe(ana, 'POST', '/api/lectura/v1/catalogo/ejercicios', {
      nombre: ' REMO RARO ',
    });
    expect(repetido.statusCode).toBe(409);
    await serie(ana, 'Remo raro');
    const id = (await catalogo(ana)).ejercicios[0]?.id;
    expect((await catalogo(ana)).ejercicios[0]).toMatchObject({
      archivado: false,
      sin_grupos: true,
    });
    const archiva = await escribe(ana, 'PUT', `/api/lectura/v1/catalogo/ejercicios/${id}/archivo`, {
      archivado: true,
    });
    expect(archiva.statusCode).toBe(204);
    const captura = await lee<{ ejercicios: unknown[] }>(ana, '/api/registro/v1/catalogo');
    expect(captura.ejercicios).toEqual([]);
    const h = await lee<Historial>(ana, '/api/lectura/v1/historial');
    expect(h.sesiones[0]?.series[0]?.ejercicio).toBe('Remo raro');
    expect((await serie(ana, 'Remo raro')).estado).toBe('rechazada');
  });

  it('importar es idempotente y no pisa un coeficiente ajustado a mano', async () => {
    await s.importaBase(ana);
    const antes = await catalogo(ana);
    const press = antes.ejercicios.find((e) => e.nombre === 'Press banca')?.id;
    const triceps = antes.grupos.find((g) => g.nombre === 'Tríceps')?.id;
    const ajustadas = antes.parametros.contribuciones.map((c) =>
      c.ejercicio_id === press && c.grupo_id === triceps ? { ...c, coeficiente: '0.75' } : c,
    );
    await guardaParametros(ana, 4, ajustadas);

    const base = await lee<{
      grupos: { id: string }[];
      ejercicios_por_perfil: Record<string, string[]>;
    }>(ana, '/api/lectura/v1/catalogo/base');
    const otraVez = await escribe(ana, 'POST', '/api/lectura/v1/catalogo/importa', {
      grupos: base.grupos.map((g) => g.id),
      ejercicios: base.ejercicios_por_perfil['gimnasio-completo'],
    });
    const resultado = otraVez.json() as ResultadoDeImportacion;
    expect(resultado).toMatchObject({
      grupos_creados: 0,
      grupos_reutilizados: 16,
      ejercicios_creados: 0,
      ejercicios_reutilizados: 170,
      contribuciones_creadas: 0,
      camino: 'sin-cambios',
    });
    const despues = await catalogo(ana);
    expect(despues.parametros.contribuciones).toHaveLength(antes.parametros.contribuciones.length);
    expect(
      despues.parametros.contribuciones.find(
        (c) => c.ejercicio_id === press && c.grupo_id === triceps,
      )?.coeficiente,
    ).toBe('0.75');
  });

  it('con la versión fijada, la sucesora copia todo lo anterior antes de añadir', async () => {
    const base = await lee<{ grupos: { id: string }[] }>(ana, '/api/lectura/v1/catalogo/base');
    await escribe(ana, 'POST', '/api/lectura/v1/catalogo/importa', {
      grupos: base.grupos.map((g) => g.id),
      ejercicios: ['press-banca'],
    });
    await serie(ana, 'Press banca');
    const r = await escribe(ana, 'POST', '/api/lectura/v1/catalogo/importa', {
      grupos: [],
      ejercicios: ['sentadilla'],
    });
    expect(r.json()).toMatchObject({
      camino: 'sucesora',
      vigente_desde: '2026-09-27',
      contribuciones_creadas: 4,
    });
    const c = await catalogo(ana);
    expect(c.parametros.vigente_desde).toBe('2026-09-27');
    expect(c.parametros.contribuciones).toHaveLength(3 + 4);
  });

  it('el cliente manda identificadores: uno desconocido es 422 y un coeficiente no se puede ni enviar', async () => {
    const r = await escribe(ana, 'POST', '/api/lectura/v1/catalogo/importa', {
      grupos: [],
      ejercicios: ['inventado'],
    });
    expect(r.statusCode).toBe(422);
    const conCoeficiente = await escribe(ana, 'POST', '/api/lectura/v1/catalogo/importa', {
      grupos: [],
      ejercicios: ['press-banca'],
      coeficientes: { 'press-banca': { pectoral: '2.00' } },
    });
    expect(conCoeficiente.statusCode).toBe(400);
  });
});

describe('dispositivos y exportación', () => {
  it('la credencial se ve una vez; la lista enseña el último uso y revocar es por dueño', async () => {
    const r = await escribe(ana, 'POST', '/api/lectura/v1/dispositivos', {
      nombre: 'iPhone de Ana',
    });
    const emitido = r.json() as DispositivoEmitido;
    expect(emitido.credencial).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(JSON.parse(emitido.archivo.contenido)).toEqual({
      servidor: 'http://localhost',
      portador: emitido.credencial,
    });
    expect(emitido.servidor.url).toBe('http://localhost');
    expect(emitido.servidor.aviso).toMatch(/sólo existe en este ordenador/);
    const lista = await lee<Dispositivos>(ana, '/api/lectura/v1/dispositivos');
    expect(JSON.stringify(lista)).not.toContain(emitido.credencial);
    expect(lista.dispositivos[0]).toMatchObject({ nombre: 'iPhone de Ana', ultimo_uso_en: null });

    await s.pide({
      method: 'GET',
      url: '/api/captura/v1/catalogo',
      headers: { authorization: `Bearer ${emitido.credencial}` },
    });
    expect(
      (await lee<Dispositivos>(ana, '/api/lectura/v1/dispositivos')).dispositivos[0]?.ultimo_uso_en,
    ).toBe('2026-09-26T18:00:00.000Z');
    const ajeno = await s.pide({
      method: 'DELETE',
      url: `/api/lectura/v1/dispositivos/${emitido.dispositivo.id}`,
      headers: { cookie: beto.cookie },
    });
    expect(ajeno.statusCode).toBe(404);
  });

  describe('a dónde apunta el archivo de credencial', () => {
    const emite = async (servidor: ServidorDePrueba, cuenta: Cuenta, cabeceras = {}) => {
      const r = await servidor.pide({
        method: 'POST',
        url: '/api/lectura/v1/dispositivos',
        headers: { cookie: cuenta.cookie, ...cabeceras },
        payload: { nombre: 'iPhone' },
      });
      expect(r.statusCode).toBe(201);
      const emitido = r.json() as DispositivoEmitido;
      const archivo = JSON.parse(emitido.archivo.contenido) as { servidor: string };
      expect(archivo.servidor).toBe(emitido.servidor.url);
      return emitido.servidor;
    };

    it('detrás de un túnel que reescribe Host, a donde está el navegador (Origin)', async () => {
      expect(
        await emite(s, ana, { host: '127.0.0.1:3000', origin: 'https://sigir.ejemplo.ts.net' }),
      ).toEqual({ url: 'https://sigir.ejemplo.ts.net', aviso: null });
    });

    it('sin Origin, esquema y Host; las X-Forwarded-* sólo del proxy de confianza', async () => {
      const cabeceras = {
        host: '127.0.0.1:3000',
        'x-forwarded-proto': 'https',
        'x-forwarded-host': 'sigir.ejemplo.ts.net',
      };
      expect(await emite(s, ana, cabeceras)).toEqual({
        url: 'https://sigir.ejemplo.ts.net',
        aviso: null,
      });
      const sinConfianza = await servidorDePrueba({ trustProxy: false });
      try {
        const cuenta = await sinConfianza.cuenta('carla@ejemplo.com');
        const r = await emite(sinConfianza, cuenta, cabeceras);
        expect(r.url).toBe('http://127.0.0.1:3000');
        expect(r.aviso).toMatch(/sólo existe en este ordenador/);
      } finally {
        await sinConfianza.limpia();
      }
    });

    it('un Origin que no es una dirección (null, ruta, otro esquema) no cuenta', async () => {
      for (const origin of ['null', 'https://sigir.ejemplo.ts.net/ruta', 'ftp://sigir.ejemplo']) {
        expect((await emite(s, ana, { host: 'sigir.lan:3000', origin })).url).toBe(
          'http://sigir.lan:3000',
        );
      }
    });

    it('una dirección sin https se avisa: el atajo mandaría la credencial en claro', async () => {
      const r = await emite(s, ana, { origin: 'http://192.168.1.20:3000' });
      expect(r.url).toBe('http://192.168.1.20:3000');
      expect(r.aviso).toMatch(/no es https/);
    });

    it('URL_PUBLICA manda sobre el navegador y sobre la petición', async () => {
      const fija = await servidorDePrueba({ urlPublica: 'https://fija.ejemplo.ts.net' });
      try {
        const cuenta = await fija.cuenta('dora@ejemplo.com');
        expect(await emite(fija, cuenta, { origin: 'http://127.0.0.1:3000' })).toEqual({
          url: 'https://fija.ejemplo.ts.net',
          aviso: null,
        });
      } finally {
        await fija.limpia();
      }
    });
  });

  it('la exportación es JSON abierto, sin hashes ni tokens, con límite propio', async () => {
    await s.importaBase(ana);
    await serie(ana, 'Press banca');
    await s.portador(ana);
    const r = await s.pide({
      method: 'GET',
      url: '/api/lectura/v1/exportacion',
      headers: { cookie: ana.cookie },
    });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-disposition']).toBe('attachment; filename="sigir-2026-09-26.json"');
    const datos = r.json() as Exportacion;
    expect(Object.keys(datos.datos)).toHaveLength(11);
    expect(datos.datos['serie']).toHaveLength(1);
    expect(datos.cuenta.correo).toBe('ana@ejemplo.com');
    expect(r.body).not.toMatch(/argon2|huella|portador|hash/);
    expect(
      (
        await s.pide({
          method: 'GET',
          url: '/api/lectura/v1/exportacion',
          headers: { cookie: ana.cookie },
        })
      ).statusCode,
    ).toBe(200);
    const tercera = await s.pide({
      method: 'GET',
      url: '/api/lectura/v1/exportacion',
      headers: { cookie: ana.cookie },
    });
    expect(tercera.statusCode).toBe(429);
  });
});
