import { randomUUID } from 'node:crypto';
import { mkdir, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  ALCANCE_DE_HOJA,
  type Alcance,
  COLUMNAS_AUTOMATICAS,
  CUENTAS,
  type Esquema,
  type Fila,
  type FilaDe,
  type FilaDeCuentas,
  type HojaDeCuentas,
  type HojaDeLibro,
  LIBRO,
  type Operacion,
  RENOMBRADAS_DEL_LIBRO,
  type Tablas,
  type TablasDeCuentas,
  type TablasDeLibro,
  tablasVacias,
} from './esquema.js';
import { compruebaCuentas, compruebaLibro } from './invariantes.js';
import { ColaPorArchivo, filaValidada, LibroEnDisco } from './libro.js';
import { Respaldos } from './respaldo.js';

/**
 * La capa de acceso: la ÚNICA vía entre un servicio y los archivos.
 *
 * Un servicio recibe un `AlmacenDeUsuario` —identidad y alcance fijados— y no
 * tiene forma de nombrar otro libro: no ve el depósito, ni rutas, ni nombres de
 * archivo. Cada llamada a `conAlmacenDeUsuario` es una transacción: lo que el
 * servicio lee y cambia dentro se comprueba entero contra los invariantes y se
 * escribe de una vez, o no se escribe.
 */

export class ErrorDeAlcance extends Error {
  override name = 'ErrorDeAlcance';
}

export class ErrorDeCuentaInexistente extends Error {
  override name = 'ErrorDeCuentaInexistente';
}

export class ErrorDeFilaInexistente extends Error {
  override name = 'ErrorDeFilaInexistente';
}

export interface Identidad {
  readonly usuarioId: string;
  /** Obligatorio y sin valor por omisión: un valor por omisión convierte el olvido en privilegio. */
  readonly alcance: Alcance;
}

type Automatica = (typeof COLUMNAS_AUTOMATICAS)[number];
export type NuevaFila<H extends HojaDeLibro> = Omit<Fila<H>, Automatica>;
export type Cambios<H extends HojaDeLibro> = Partial<Omit<Fila<H>, Automatica | 'id'>>;

export interface AlmacenDeUsuario {
  readonly propietarioId: string;
  readonly alcance: Alcance;
  /** Zona IANA de la cuenta, resuelta por esta capa: el alcance `captura` no lee `usuario`. */
  readonly zonaHoraria: string;
  /** El instante de esta transacción. Todas las filas que escribe llevan el mismo. */
  readonly ahora: Date;
  lee<H extends HojaDeLibro>(hoja: H): readonly Fila<H>[];
  inserta<H extends HojaDeLibro>(hoja: H, fila: NuevaFila<H>): Fila<H>;
  actualiza<H extends HojaDeLibro>(hoja: H, id: string, cambios: Cambios<H>): Fila<H>;
  borra(hoja: HojaDeLibro, id: string): void;
}

/** La forma en que el servidor entrega la capa de acceso a las rutas: ya enlazada, sin depósito. */
export type ConAlmacenDeUsuario = <T>(
  identidad: Identidad,
  trabajo: (almacen: AlmacenDeUsuario) => T | Promise<T>,
) => Promise<T>;

export interface AlmacenDeCuentas {
  readonly ahora: Date;
  lee<H extends HojaDeCuentas>(hoja: H): readonly FilaDeCuentas<H>[];
  inserta<H extends HojaDeCuentas>(hoja: H, fila: FilaDeCuentas<H>): FilaDeCuentas<H>;
  actualiza<H extends HojaDeCuentas>(
    hoja: H,
    id: string,
    cambios: Partial<Omit<FilaDeCuentas<H>, 'id'>>,
  ): FilaDeCuentas<H>;
  borra(hoja: HojaDeCuentas, id: string): void;
}

// ── Transacción genérica con copia al escribir ──────────────────────────────

type FilaCualquiera = Record<string, string | null> & { id: string };

class Transaccion<E extends Esquema> {
  private readonly cambiadas = new Map<keyof E, FilaCualquiera[]>();

  constructor(readonly antes: Tablas<E>) {}

  filas(hoja: keyof E): readonly FilaCualquiera[] {
    return this.cambiadas.get(hoja) ?? (this.antes[hoja] as unknown as readonly FilaCualquiera[]);
  }

  mutables(hoja: keyof E): FilaCualquiera[] {
    let filas = this.cambiadas.get(hoja);
    if (filas === undefined) {
      filas = [...(this.antes[hoja] as unknown as readonly FilaCualquiera[])];
      this.cambiadas.set(hoja, filas);
    }
    return filas;
  }

  get hayCambios(): boolean {
    return this.cambiadas.size > 0;
  }

  despues(): Tablas<E> {
    const salida: Record<string, unknown> = { ...this.antes };
    for (const [hoja, filas] of this.cambiadas) salida[hoja as string] = filas;
    return salida as Tablas<E>;
  }
}

// ── El depósito ─────────────────────────────────────────────────────────────

const NOMBRE_DE_CUENTAS = 'cuentas.xlsx';
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

export interface OpcionesDeDeposito {
  readonly directorio: string;
  readonly reloj?: () => Date;
  /** `false` para mirar sin tocar nada (`npm run verifica`): sin cuentas, falla. */
  readonly crear?: boolean;
}

/**
 * El directorio de datos. Se construye en `src/server/` y no se entrega a
 * ninguna ruta: las rutas reciben funciones ya enlazadas.
 */
export class Deposito {
  readonly directorio: string;
  readonly reloj: () => Date;
  private readonly cola = new ColaPorArchivo();
  private readonly respaldos: Respaldos;
  private readonly cuentas: LibroEnDisco<typeof CUENTAS>;
  private readonly libros = new Map<string, LibroEnDisco<typeof LIBRO>>();

  private constructor(opciones: OpcionesDeDeposito) {
    this.directorio = opciones.directorio;
    this.reloj = opciones.reloj ?? (() => new Date());
    this.respaldos = new Respaldos(join(this.directorio, 'respaldos'), this.reloj);
    this.cuentas = new LibroEnDisco(
      join(this.directorio, NOMBRE_DE_CUENTAS),
      CUENTAS,
      (t) => compruebaCuentas(t, t),
      this.respaldos,
    );
  }

  static async abre(opciones: OpcionesDeDeposito): Promise<Deposito> {
    const crear = opciones.crear ?? true;
    if (crear) await mkdir(opciones.directorio, { recursive: true, mode: 0o700 });
    const deposito = new Deposito(opciones);
    await deposito.cola.en(deposito.cuentas.ruta, async () => {
      try {
        await deposito.cuentas.carga();
      } catch (error) {
        if (!crear || (error as Error).name !== 'ErrorDeLibroInexistente') throw error;
        await deposito.cuentas.crea(tablasVacias(CUENTAS));
      }
    });
    return deposito;
  }

  private libro(usuarioId: string): LibroEnDisco<typeof LIBRO> {
    if (!UUID.test(usuarioId))
      throw new ErrorDeCuentaInexistente('Identificador de cuenta inválido');
    let libro = this.libros.get(usuarioId);
    if (libro === undefined) {
      libro = new LibroEnDisco(
        join(this.directorio, `${usuarioId}.xlsx`),
        LIBRO,
        (t) => compruebaLibro(t, t, usuarioId),
        this.respaldos,
        RENOMBRADAS_DEL_LIBRO,
      );
      this.libros.set(usuarioId, libro);
    }
    return libro;
  }

  /** Transacción sobre `cuentas.xlsx`. Siempre se toma ANTES que el libro de nadie. */
  conCuentas<T>(trabajo: (cuentas: AlmacenDeCuentas) => T | Promise<T>): Promise<T> {
    return this.cola.en(this.cuentas.ruta, async () => {
      const { tablas, firma } = await this.cuentas.carga();
      const tx = new Transaccion<typeof CUENTAS>(tablas);
      const resultado = await trabajo(almacenDeCuentas(tx, this.reloj()));
      if (tx.hayCambios) {
        const despues = tx.despues();
        compruebaCuentas(tablas, despues);
        await this.cuentas.guarda(despues, firma);
      }
      return resultado;
    });
  }

  /**
   * La única vía a un libro de propietario. Primero la cola de cuentas (para
   * resolver la zona), después la del libro: siempre en ese orden.
   */
  async conAlmacenDeUsuario<T>(
    identidad: Identidad,
    trabajo: (almacen: AlmacenDeUsuario) => T | Promise<T>,
  ): Promise<T> {
    if (identidad.alcance !== 'sesion' && identidad.alcance !== 'captura') {
      throw new ErrorDeAlcance('Alcance desconocido');
    }
    const zonaHoraria = await this.conCuentas((c) => {
      const usuario = c.lee('usuario').find((u) => u.id === identidad.usuarioId);
      if (usuario === undefined) throw new ErrorDeCuentaInexistente('La cuenta no existe');
      return usuario.zona_horaria;
    });
    const libro = this.libro(identidad.usuarioId);
    return this.cola.en(libro.ruta, async () => {
      const { tablas, firma } = await libro.carga();
      const tx = new Transaccion<typeof LIBRO>(tablas);
      const almacen = almacenDeUsuario(tx, identidad, zonaHoraria, this.reloj());
      const resultado = await trabajo(almacen);
      if (tx.hayCambios) {
        const despues = tx.despues();
        compruebaLibro(tablas, despues, identidad.usuarioId);
        await libro.guarda(despues, firma);
      }
      return resultado;
    });
  }

  /**
   * Alta: el libro primero y la fila de `usuario` después, las dos dentro de la
   * cola de cuentas. Si el proceso muere entre medias queda un libro huérfano,
   * inofensivo, y nunca una cuenta sin libro.
   */
  async creaCuenta(datos: {
    readonly correo: string;
    readonly hashContrasena: string;
    readonly zonaHoraria: string;
    readonly umbralRir: number;
    readonly vigenteDesde: string;
  }): Promise<string> {
    const id = randomUUID();
    await this.conCuentas(async (c) => {
      if (c.lee('usuario').some((u) => u.correo === datos.correo)) {
        throw new ErrorDeAlcance('Ya existe una cuenta con ese correo');
      }
      const ahora = c.ahora.toISOString();
      const libro: TablasDeLibro = {
        ...tablasVacias(LIBRO),
        version_parametros: [
          filaValidada('version_parametros', LIBRO.version_parametros, {
            id: randomUUID(),
            propietario_id: id,
            umbral_rir: String(datos.umbralRir),
            vigente_desde: datos.vigenteDesde,
            vigente_hasta: null,
            creado_en: ahora,
          }),
        ],
      };
      await this.libro(id).crea(libro);
      c.inserta('usuario', {
        id,
        correo: datos.correo,
        hash_contrasena: datos.hashContrasena,
        zona_horaria: datos.zonaHoraria,
        creado_en: ahora,
      });
    });
    return id;
  }

  /**
   * Baja de una cuenta (LFPDPPP): borra de verdad, no desactiva. En el orden de
   * siempre, primero la cola de cuentas y dentro la del libro:
   *
   * 1. sus filas de `cuentas.xlsx` —usuario y sus dos clases de credencial—:
   *    desde ese instante nada la autentica;
   * 2. su libro y todas las copias automáticas de su libro;
   * 3. las copias automáticas de `cuentas.xlsx`, que llevan su correo y la huella
   *    de su contraseña. Se rehacen desde el estado de después de la baja: la
   *    red de seguridad de las demás cuentas vuelve a empezar hoy.
   *
   * Es el orden inverso del alta: si el proceso muere entre medias queda un
   * libro huérfano, que `verifica` señala, y nunca una cuenta sin libro.
   *
   * Lo que se haya sacado fuera con `deploy/respaldo.sh` no lo ve el servidor; ese
   * plazo lo declara el aviso de privacidad. `null` si el correo no existe.
   */
  async eliminaCuenta(correo: string): Promise<ResumenDeBaja | null> {
    return this.cola.en(this.cuentas.ruta, async () => {
      const { tablas, firma } = await this.cuentas.carga();
      const usuario = tablas.usuario.find((u) => u.correo === correo);
      if (usuario === undefined) return null;
      const despues: TablasDeCuentas = {
        ...tablas,
        usuario: tablas.usuario.filter((u) => u.id !== usuario.id),
        token_sesion: tablas.token_sesion.filter((x) => x.usuario_id !== usuario.id),
        token_captura: tablas.token_captura.filter((x) => x.usuario_id !== usuario.id),
      };
      compruebaCuentas(tablas, despues);
      await this.cuentas.guarda(despues, firma);

      const libro = this.libro(usuario.id);
      const conteo = await this.cola.en(libro.ruta, async () => {
        // Un libro roto también se borra: quien pide la baja no tiene que
        // arreglar antes su Excel. Sin conteo, se dice que no se pudo contar.
        const contado = await libro
          .carga()
          .then(({ tablas: t }) => ({ sesiones: t.sesion.length, series: t.serie.length }))
          .catch(() => null);
        await rm(libro.ruta, { force: true });
        return contado;
      });
      this.libros.delete(usuario.id);
      const respaldosDelLibro = await this.respaldos.borra(usuario.id);
      const respaldosDeCuentas = await this.respaldos.borra(NOMBRE_DE_CUENTAS.slice(0, -5));
      await this.respaldos.copia(this.cuentas.ruta);
      return {
        usuarioId: usuario.id,
        sesiones: conteo?.sesiones ?? null,
        series: conteo?.series ?? null,
        respaldosBorrados: respaldosDelLibro + respaldosDeCuentas,
      };
    });
  }

  /** Carga y valida todo sin escribir nada. Es lo que hace `npm run verifica`. */
  async verifica(): Promise<ResumenDeVerificacion> {
    const usuarios = await this.conCuentas((c) => c.lee('usuario').map((u) => u.id));
    let sesiones = 0;
    let series = 0;
    for (const id of usuarios) {
      const libro = this.libro(id);
      const { tablas } = await this.cola.en(libro.ruta, () => libro.carga());
      sesiones += tablas.sesion.length;
      series += tablas.serie.length;
    }
    const archivos = await readdir(this.directorio);
    const huerfanos = archivos.filter(
      (n) => n.endsWith('.xlsx') && n !== NOMBRE_DE_CUENTAS && !usuarios.includes(n.slice(0, -5)),
    );
    return { propietarios: usuarios.length, sesiones, series, huerfanos };
  }
}

export interface ResumenDeBaja {
  readonly usuarioId: string;
  /** `null` si el libro no se pudo leer (se borró igual). */
  readonly sesiones: number | null;
  readonly series: number | null;
  /** Copias automáticas borradas: las de su libro y las de `cuentas.xlsx`. */
  readonly respaldosBorrados: number;
}

export interface ResumenDeVerificacion {
  readonly propietarios: number;
  readonly sesiones: number;
  readonly series: number;
  /** Libros sin cuenta: no se tocan, sólo se declaran. */
  readonly huerfanos: readonly string[];
}

// ── Vistas con alcance ──────────────────────────────────────────────────────

function permiso(hoja: HojaDeLibro, alcance: Alcance, operacion: Operacion) {
  const entrada = ALCANCE_DE_HOJA[hoja]?.[alcance];
  if (entrada === undefined || !entrada.operaciones.includes(operacion)) {
    throw new ErrorDeAlcance(`El alcance «${alcance}» no puede ${operacion} en «${hoja}»`);
  }
  return entrada;
}

function almacenDeUsuario(
  tx: Transaccion<typeof LIBRO>,
  identidad: Identidad,
  zonaHoraria: string,
  ahora: Date,
): AlmacenDeUsuario {
  const { usuarioId: propietarioId, alcance } = identidad;
  const sello = ahora.toISOString();

  const visibles = (hoja: HojaDeLibro): readonly FilaCualquiera[] => {
    const { ventanaDias } = permiso(hoja, alcance, 'leer');
    const desde =
      ventanaDias === undefined
        ? null
        : new Date(ahora.getTime() - ventanaDias * 86_400_000).toISOString();
    return tx.filas(hoja).filter((f) => {
      if (f['propietario_id'] !== propietarioId) return false;
      if (desde === null) return true;
      const registrado = f['registrado_en'];
      return typeof registrado === 'string' && registrado >= desde;
    });
  };

  const localiza = (hoja: HojaDeLibro, id: string): FilaCualquiera => {
    const fila = visibles(hoja).find((f) => f.id === id);
    if (fila === undefined) throw new ErrorDeFilaInexistente(`No existe ${hoja} ${id}`);
    return fila;
  };

  return {
    propietarioId,
    alcance,
    zonaHoraria,
    ahora,
    lee<H extends HojaDeLibro>(hoja: H) {
      return visibles(hoja) as unknown as readonly Fila<H>[];
    },
    inserta<H extends HojaDeLibro>(hoja: H, fila: NuevaFila<H>): Fila<H> {
      permiso(hoja, alcance, 'insertar');
      const columnas = LIBRO[hoja] as Esquema[string];
      const valores: Record<string, string | null> = { ...(fila as Record<string, string | null>) };
      for (const automatica of COLUMNAS_AUTOMATICAS) {
        if (!(automatica in columnas)) continue;
        // El instante de escritura lo pone el servidor, nunca el cliente: es la
        // columna sobre la que se apoya la ventana de lectura de `captura`.
        valores[automatica] = automatica === 'propietario_id' ? propietarioId : sello;
      }
      const nueva = filaValidada(hoja, columnas, valores) as FilaCualquiera;
      tx.mutables(hoja).push(nueva);
      return nueva as unknown as Fila<H>;
    },
    actualiza<H extends HojaDeLibro>(hoja: H, id: string, cambios: Cambios<H>): Fila<H> {
      permiso(hoja, alcance, 'actualizar');
      const actual = localiza(hoja, id);
      const columnas = LIBRO[hoja] as Esquema[string];
      const nueva = filaValidada(hoja, columnas, {
        ...actual,
        ...(cambios as Record<string, string | null>),
        id: actual.id,
        propietario_id: actual['propietario_id'] ?? null,
      }) as FilaCualquiera;
      for (const automatica of COLUMNAS_AUTOMATICAS) {
        if (automatica in columnas) nueva[automatica] = actual[automatica] ?? null;
      }
      const filas = tx.mutables(hoja);
      filas[filas.findIndex((f) => f.id === id)] = nueva;
      return nueva as unknown as Fila<H>;
    },
    borra(hoja: HojaDeLibro, id: string): void {
      permiso(hoja, alcance, 'borrar');
      localiza(hoja, id);
      const filas = tx.mutables(hoja);
      filas.splice(
        filas.findIndex((f) => f.id === id),
        1,
      );
    },
  };
}

function almacenDeCuentas(tx: Transaccion<typeof CUENTAS>, ahora: Date): AlmacenDeCuentas {
  const localiza = (hoja: HojaDeCuentas, id: string) => {
    const indice = tx.filas(hoja).findIndex((f) => f.id === id);
    if (indice === -1) throw new ErrorDeFilaInexistente(`No existe ${hoja} ${id}`);
    return indice;
  };
  return {
    ahora,
    lee<H extends HojaDeCuentas>(hoja: H) {
      return tx.filas(hoja) as unknown as readonly FilaDeCuentas<H>[];
    },
    inserta<H extends HojaDeCuentas>(hoja: H, fila: FilaDeCuentas<H>) {
      const nueva = filaValidada(hoja, CUENTAS[hoja] as Esquema[string], fila) as FilaCualquiera;
      tx.mutables(hoja).push(nueva);
      return nueva as unknown as FilaDeCuentas<H>;
    },
    actualiza<H extends HojaDeCuentas>(
      hoja: H,
      id: string,
      cambios: Partial<Omit<FilaDeCuentas<H>, 'id'>>,
    ) {
      const indice = localiza(hoja, id);
      const filas = tx.mutables(hoja);
      const nueva = filaValidada(hoja, CUENTAS[hoja] as Esquema[string], {
        ...filas[indice],
        ...(cambios as Record<string, string | null>),
        id,
      }) as FilaCualquiera;
      filas[indice] = nueva;
      return nueva as unknown as FilaDeCuentas<H>;
    },
    borra(hoja: HojaDeCuentas, id: string) {
      const indice = localiza(hoja, id);
      tx.mutables(hoja).splice(indice, 1);
    },
  };
}

// Tipos que otros módulos necesitan sin importar el esquema entero.
export type { Alcance, Fila, FilaDe, FilaDeCuentas, HojaDeCuentas, HojaDeLibro, TablasDeCuentas };
