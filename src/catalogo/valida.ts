import { centesimasDesdeDecimal, esDecimalExacto } from '../domain/volume/index.js';
import {
  type BandaBase,
  type CatalogoBase,
  COEFICIENTES_DE_SEMILLA,
  type DiaDePlantilla,
  type EjercicioBase,
  type EntradaDePlantilla,
  EQUIPAMIENTOS,
  type Equipamiento,
  type FuenteBase,
  type GrupoBase,
  PATRONES,
  type Patron,
  type PerfilBase,
  type PlantillaBase,
  type RangosBase,
  type Region,
} from './tipos.js';

/**
 * Valida el catálogo base al importar el módulo, es decir, al arrancar: un
 * `.json` editado a mano que rompa algo no deja levantar el servidor en vez de
 * fallar en la primera petición que lo toque. Junta TODOS los problemas.
 */

export class ErrorDeCatalogo extends Error {
  override name = 'ErrorDeCatalogo';
  constructor(readonly problemas: readonly string[]) {
    super(`Catálogo base inválido:\n- ${problemas.join('\n- ')}`);
  }
}

/** La misma clave del índice único del almacén. */
export function normaliza(nombre: string): string {
  return nombre.trim().toLowerCase();
}

const IDENTIFICADOR = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

type Registro = Record<string, unknown>;

class Validador {
  readonly problemas: string[] = [];

  falla(donde: string, que: string): void {
    this.problemas.push(`${donde}: ${que}`);
  }

  objeto(valor: unknown, donde: string): Registro | null {
    if (typeof valor !== 'object' || valor === null || Array.isArray(valor)) {
      this.falla(donde, 'debe ser un objeto');
      return null;
    }
    return valor as Registro;
  }

  lista(valor: unknown, donde: string): readonly unknown[] {
    if (!Array.isArray(valor)) {
      this.falla(donde, 'debe ser una lista');
      return [];
    }
    return valor;
  }

  texto(r: Registro, campo: string, donde: string): string {
    const valor = r[campo];
    if (typeof valor !== 'string' || valor.trim() === '' || valor !== valor.trim()) {
      this.falla(donde, `«${campo}» debe ser texto no vacío y sin espacios en los bordes`);
      return '';
    }
    return valor;
  }

  identificador(r: Registro, donde: string): string {
    const id = this.texto(r, 'id', donde);
    if (id !== '' && !IDENTIFICADOR.test(id))
      this.falla(donde, `identificador «${id}» mal formado`);
    return id;
  }

  textos(r: Registro, campo: string, donde: string): string[] {
    return this.lista(r[campo], `${donde}.${campo}`).flatMap((v, i) => {
      if (typeof v !== 'string' || v.trim() === '' || v !== v.trim()) {
        this.falla(`${donde}.${campo}[${i}]`, 'debe ser texto no vacío');
        return [];
      }
      return [v];
    });
  }

  booleano(r: Registro, campo: string, donde: string): boolean {
    const valor = r[campo];
    if (typeof valor !== 'boolean') {
      this.falla(donde, `«${campo}» debe ser verdadero o falso`);
      return false;
    }
    return valor;
  }

  entero(r: Registro, campo: string, donde: string, minimo: number, maximo: number): number {
    const valor = r[campo];
    if (typeof valor !== 'number' || !Number.isInteger(valor) || valor < minimo || valor > maximo) {
      this.falla(donde, `«${campo}» debe ser un entero entre ${minimo} y ${maximo}`);
      return minimo;
    }
    return valor;
  }

  decimal(valor: unknown, donde: string, minimoExclusivo: string, maximo: string): string {
    if (typeof valor !== 'string' || !esDecimalExacto(valor) || !/\.\d{2}$/.test(valor)) {
      this.falla(donde, 'debe ser un decimal con dos posiciones, como cadena');
      return '0.00';
    }
    const c = centesimasDesdeDecimal(valor);
    if (c <= centesimasDesdeDecimal(minimoExclusivo) || c > centesimasDesdeDecimal(maximo)) {
      this.falla(donde, `«${valor}» fuera de (${minimoExclusivo}, ${maximo}]`);
    }
    return valor;
  }

  unicos(valores: readonly string[], que: string): void {
    const vistos = new Set<string>();
    for (const v of valores) {
      if (vistos.has(v)) this.falla(que, `«${v}» repetido`);
      vistos.add(v);
    }
  }
}

const REGIONES: readonly Region[] = ['superior', 'inferior', 'centro'];

function grupos(v: Validador, datos: unknown): GrupoBase[] {
  const salida = v.lista(datos, 'grupos').flatMap((g, i) => {
    const r = v.objeto(g, `grupos[${i}]`);
    if (r === null) return [];
    const donde = `grupos[${i}]`;
    const region = v.texto(r, 'region', donde);
    if (!REGIONES.includes(region as Region)) {
      v.falla(donde, `región «${region}» desconocida: superior, inferior o centro`);
    }
    return [
      {
        id: v.identificador(r, donde),
        nombre: v.texto(r, 'nombre', donde),
        descripcion: v.texto(r, 'descripcion', donde),
        region: region as Region,
      },
    ];
  });
  if (salida.length !== 16)
    v.falla('grupos', `la taxonomía tiene 16 grupos y llegaron ${salida.length}`);
  v.unicos(
    salida.map((g) => g.id),
    'grupos.id',
  );
  v.unicos(
    salida.map((g) => normaliza(g.nombre)),
    'grupos.nombre',
  );
  return salida;
}

function ejercicios(
  v: Validador,
  datos: unknown,
  idsDeGrupo: ReadonlySet<string>,
): EjercicioBase[] {
  const salida = v.lista(datos, 'ejercicios').flatMap((e, i) => {
    const r = v.objeto(e, `ejercicios[${i}]`);
    if (r === null) return [];
    const id = v.identificador(r, `ejercicios[${i}]`);
    const donde = `ejercicio «${id || i}»`;
    const nombre = v.texto(r, 'nombre', donde);
    if (nombre.length > 40) v.falla(donde, 'el nombre debe ser corto y dictable (≤ 40)');
    const equipamiento = v.textos(r, 'equipamiento', donde).filter((x): x is Equipamiento => {
      const valido = (EQUIPAMIENTOS as readonly string[]).includes(x);
      if (!valido) v.falla(donde, `equipamiento desconocido «${x}»`);
      return valido;
    });
    const patron = v.texto(r, 'patron', donde);
    if (!(PATRONES as readonly string[]).includes(patron))
      v.falla(donde, `patrón desconocido «${patron}»`);
    const coeficientesCrudos = v.objeto(r['coeficientes'], `${donde}.coeficientes`) ?? {};
    const coeficientes: Record<string, string> = {};
    for (const [grupo, valor] of Object.entries(coeficientesCrudos)) {
      if (!idsDeGrupo.has(grupo)) v.falla(donde, `aporta a un grupo que no existe: «${grupo}»`);
      const texto = v.decimal(valor, `${donde}.coeficientes.${grupo}`, '0.00', '2.00');
      if (!(COEFICIENTES_DE_SEMILLA as readonly string[]).includes(texto)) {
        v.falla(donde, `coeficiente «${texto}» fuera de los niveles 1.00, 0.50 y 0.25`);
      }
      coeficientes[grupo] = texto;
    }
    const principales = Object.values(coeficientes).filter((c) => c === '1.00').length;
    if (principales !== 1)
      v.falla(donde, `debe tener exactamente un grupo principal (1.00); tiene ${principales}`);
    return [
      {
        id,
        nombre,
        alias: v.textos(r, 'alias', donde),
        equipamiento,
        patron: patron as Patron,
        unilateral: v.booleano(r, 'unilateral', donde),
        coeficientes,
      },
    ];
  });

  v.unicos(
    salida.map((e) => e.id),
    'ejercicios.id',
  );
  const nombres = salida.map((e) => normaliza(e.nombre));
  v.unicos(nombres, 'ejercicios.nombre');
  const conjuntoDeNombres = new Set(nombres);
  const alias = salida.flatMap((e) => e.alias.map((a) => normaliza(a)));
  v.unicos(alias, 'ejercicios.alias');
  for (const a of alias) {
    if (conjuntoDeNombres.has(a))
      v.falla('ejercicios.alias', `«${a}» repite el nombre de un ejercicio`);
  }
  for (const grupo of idsDeGrupo) {
    const n = salida.filter((e) => e.coeficientes[grupo] === '1.00').length;
    if (n < 3)
      v.falla(`grupo «${grupo}»`, `necesita al menos 3 ejercicios principales y tiene ${n}`);
  }
  return salida;
}

/** El ejercicio está en el perfil: todo su equipamiento está disponible (y en la selección, si la hay). */
export function estaEnPerfil(perfil: PerfilBase, ejercicio: EjercicioBase): boolean {
  if (perfil.seleccion !== undefined && !perfil.seleccion.includes(ejercicio.id)) return false;
  return ejercicio.equipamiento.every((e) => perfil.equipamiento.includes(e));
}

function perfiles(
  v: Validador,
  datos: unknown,
  listaDeEjercicios: readonly EjercicioBase[],
  idsDeGrupo: ReadonlySet<string>,
): PerfilBase[] {
  const idsDeEjercicio = new Set(listaDeEjercicios.map((e) => e.id));
  const salida = v.lista(datos, 'perfiles').flatMap((p, i) => {
    const r = v.objeto(p, `perfiles[${i}]`);
    if (r === null) return [];
    const id = v.identificador(r, `perfiles[${i}]`);
    const donde = `perfil «${id || i}»`;
    const equipamiento = v.textos(r, 'equipamiento', donde).filter((x): x is Equipamiento => {
      const valido = (EQUIPAMIENTOS as readonly string[]).includes(x);
      if (!valido) v.falla(donde, `equipamiento desconocido «${x}»`);
      return valido;
    });
    const perfil: PerfilBase = {
      id,
      nombre: v.texto(r, 'nombre', donde),
      descripcion: v.texto(r, 'descripcion', donde),
      por_omision: v.booleano(r, 'por_omision', donde),
      equipamiento,
      sin_cobertura: v.textos(r, 'sin_cobertura', donde),
      ...(r['seleccion'] === undefined ? {} : { seleccion: v.textos(r, 'seleccion', donde) }),
    };
    for (const e of perfil.seleccion ?? []) {
      const ejercicio = listaDeEjercicios.find((x) => x.id === e);
      if (!idsDeEjercicio.has(e) || ejercicio === undefined) {
        v.falla(donde, `selecciona un ejercicio que no existe: «${e}»`);
      } else if (!ejercicio.equipamiento.every((x) => equipamiento.includes(x))) {
        v.falla(donde, `selecciona «${e}», que pide equipamiento que el perfil no tiene`);
      }
    }
    const dentro = listaDeEjercicios.filter((e) => estaEnPerfil(perfil, e));
    if (dentro.length === 0) v.falla(donde, 'no contiene ningún ejercicio');
    for (const grupo of idsDeGrupo) {
      const cubierto = dentro.some((e) => e.coeficientes[grupo] === '1.00');
      const declarado = perfil.sin_cobertura.includes(grupo);
      // Un hueco silencioso es el usuario descubriéndolo en la proyección; un
      // hueco declarado que no existe es una advertencia falsa.
      if (!cubierto && !declarado)
        v.falla(donde, `no cubre «${grupo}» y no lo declara en sin_cobertura`);
      if (cubierto && declarado) v.falla(donde, `declara sin cubrir «${grupo}», que sí cubre`);
    }
    for (const g of perfil.sin_cobertura) {
      if (!idsDeGrupo.has(g)) v.falla(donde, `sin_cobertura cita un grupo que no existe: «${g}»`);
    }
    return [perfil];
  });
  v.unicos(
    salida.map((p) => p.id),
    'perfiles.id',
  );
  const porOmision = salida.filter((p) => p.por_omision).length;
  if (porOmision !== 1)
    v.falla('perfiles', `debe haber exactamente un perfil por omisión; hay ${porOmision}`);
  return salida;
}

function plantillas(
  v: Validador,
  datos: unknown,
  listaDePerfiles: readonly PerfilBase[],
  listaDeEjercicios: readonly EjercicioBase[],
): PlantillaBase[] {
  const salida = v.lista(datos, 'plantillas').flatMap((p, i) => {
    const r = v.objeto(p, `plantillas[${i}]`);
    if (r === null) return [];
    const id = v.identificador(r, `plantillas[${i}]`);
    const donde = `plantilla «${id || i}»`;
    const idPerfil = v.texto(r, 'perfil', donde);
    const perfil = listaDePerfiles.find((x) => x.id === idPerfil);
    if (perfil === undefined) v.falla(donde, `cita un perfil que no existe: «${idPerfil}»`);
    const cicloDias = v.entero(r, 'ciclo_dias', donde, 1, 28);
    const dias = v.lista(r['dias'], `${donde}.dias`).flatMap((d, j): DiaDePlantilla[] => {
      const rd = v.objeto(d, `${donde}.dias[${j}]`);
      if (rd === null) return [];
      const dondeDia = `${donde}, día ${j + 1}`;
      const dia = v.entero(rd, 'dia', dondeDia, 1, 28);
      if (dia > cicloDias) v.falla(dondeDia, `el día ${dia} no cabe en un ciclo de ${cicloDias}`);
      const entradas = v
        .lista(rd['entradas'], `${dondeDia}.entradas`)
        .flatMap((x, k): EntradaDePlantilla[] => {
          const re = v.objeto(x, `${dondeDia}.entradas[${k}]`);
          if (re === null) return [];
          const ejercicio = v.texto(re, 'ejercicio', `${dondeDia}.entradas[${k}]`);
          const base = listaDeEjercicios.find((e) => e.id === ejercicio);
          if (base === undefined)
            v.falla(dondeDia, `pide un ejercicio que no existe: «${ejercicio}»`);
          else if (perfil !== undefined && !estaEnPerfil(perfil, base)) {
            v.falla(dondeDia, `pide «${ejercicio}», que no está en el perfil «${perfil.id}»`);
          }
          return [
            {
              ejercicio,
              series: v.decimal(re['series'], `${dondeDia}.${ejercicio}`, '0.00', '100.00'),
            },
          ];
        });
      v.unicos(
        entradas.map((e) => e.ejercicio),
        `${dondeDia}: ejercicio`,
      );
      return [{ dia, nombre: v.texto(rd, 'nombre', dondeDia), entradas }];
    });
    if (dias.length === 0) v.falla(donde, 'no tiene días');
    v.unicos(
      dias.map((d) => String(d.dia)),
      `${donde}: día`,
    );
    return [
      {
        id,
        nombre: v.texto(r, 'nombre', donde),
        descripcion: v.texto(r, 'descripcion', donde),
        perfil: idPerfil,
        ciclo_dias: cicloDias,
        dias,
      },
    ];
  });
  v.unicos(
    salida.map((p) => p.id),
    'plantillas.id',
  );
  return salida;
}

function rangos(v: Validador, datos: unknown, idsDeGrupo: ReadonlySet<string>): RangosBase {
  const r = v.objeto(datos, 'rangos') ?? {};
  const fuentes = v.lista(r['fuentes'], 'rangos.fuentes').flatMap((f, i): FuenteBase[] => {
    const rf = v.objeto(f, `rangos.fuentes[${i}]`);
    if (rf === null) return [];
    const donde = `fuente ${i}`;
    return [
      {
        id: v.identificador(rf, donde),
        cita: v.texto(rf, 'cita', donde),
        aporta: v.texto(rf, 'aporta', donde),
      },
    ];
  });
  v.unicos(
    fuentes.map((f) => f.id),
    'rangos.fuentes.id',
  );
  const idsDeFuente = new Set(fuentes.map((f) => f.id));

  const bandas = v.lista(r['bandas'], 'rangos.bandas').flatMap((b, i): BandaBase[] => {
    const rb = v.objeto(b, `rangos.bandas[${i}]`);
    if (rb === null) return [];
    const id = v.identificador(rb, `rangos.bandas[${i}]`);
    const donde = `banda «${id || i}»`;
    const minimo = v.decimal(rb['minimo'], `${donde}.minimo`, '0.00', '100.00');
    const maximo = v.decimal(rb['maximo'], `${donde}.maximo`, '0.00', '100.00');
    if (centesimasDesdeDecimal(minimo) >= centesimasDesdeDecimal(maximo)) {
      v.falla(donde, 'el mínimo debe ser menor que el máximo');
    }
    const respaldo = v.texto(rb, 'respaldo', donde);
    if (respaldo !== 'publicado' && respaldo !== 'propio') {
      v.falla(donde, '«respaldo» debe ser «publicado» o «propio»');
    }
    const citadas = v.textos(rb, 'fuentes', donde);
    // Un rango sin fuente es una opinión con aspecto de hecho.
    if (citadas.length === 0) v.falla(donde, 'debe citar al menos una fuente');
    for (const f of citadas)
      if (!idsDeFuente.has(f)) v.falla(donde, `cita una fuente que no existe: «${f}»`);
    return [
      {
        id,
        nombre: v.texto(rb, 'nombre', donde),
        minimo,
        maximo,
        respaldo: respaldo === 'propio' ? 'propio' : 'publicado',
        fuentes: citadas,
        margen: v.texto(rb, 'margen', donde),
      },
    ];
  });
  v.unicos(
    bandas.map((b) => b.id),
    'rangos.bandas.id',
  );
  const idsDeBanda = new Set(bandas.map((b) => b.id));

  const asignacion = v.objeto(r['grupos'], 'rangos.grupos') ?? {};
  const grupos: Record<string, string> = {};
  for (const [grupo, banda] of Object.entries(asignacion)) {
    if (!idsDeGrupo.has(grupo)) v.falla('rangos.grupos', `grupo desconocido «${grupo}»`);
    if (typeof banda !== 'string' || !idsDeBanda.has(banda)) {
      v.falla('rangos.grupos', `«${grupo}» apunta a una banda que no existe`);
      continue;
    }
    grupos[grupo] = banda;
  }
  for (const grupo of idsDeGrupo) {
    if (grupos[grupo] === undefined)
      v.falla('rangos.grupos', `«${grupo}» no tiene banda de referencia`);
  }
  return { fuentes, bandas, grupos };
}

export function validaCatalogo(datos: {
  grupos: unknown;
  ejercicios: unknown;
  perfiles: unknown;
  plantillas: unknown;
  rangos: unknown;
}): CatalogoBase {
  const v = new Validador();
  const listaDeGrupos = grupos(v, datos.grupos);
  const idsDeGrupo = new Set(listaDeGrupos.map((g) => g.id));
  const listaDeEjercicios = ejercicios(v, datos.ejercicios, idsDeGrupo);
  const listaDePerfiles = perfiles(v, datos.perfiles, listaDeEjercicios, idsDeGrupo);
  const listaDePlantillas = plantillas(v, datos.plantillas, listaDePerfiles, listaDeEjercicios);
  const listaDeRangos = rangos(v, datos.rangos, idsDeGrupo);
  if (v.problemas.length > 0) throw new ErrorDeCatalogo(v.problemas);
  return {
    grupos: listaDeGrupos,
    ejercicios: listaDeEjercicios,
    perfiles: listaDePerfiles,
    plantillas: listaDePlantillas,
    rangos: listaDeRangos,
  };
}
