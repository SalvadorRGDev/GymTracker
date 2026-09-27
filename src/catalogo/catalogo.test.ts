import { describe, expect, it } from 'vitest';
import {
  agrega,
  type Centesimas,
  type Contribucion,
  centesimasDesdeDecimal,
  expandePlan,
  fechaLogica,
  sumaDias,
  type VersionDePlan,
  volumenDe,
} from '../domain/volume/index.js';
import ejerciciosJson from './datos/ejercicios.json' with { type: 'json' };
import gruposJson from './datos/grupos.json' with { type: 'json' };
import perfilesJson from './datos/perfiles.json' with { type: 'json' };
import plantillasJson from './datos/plantillas.json' with { type: 'json' };
import rangosJson from './datos/rangos.json' with { type: 'json' };
import {
  CATALOGO_BASE,
  ErrorDeCatalogo,
  ejerciciosDePerfil,
  referenciaPara,
  validaCatalogo,
  zonaPara,
} from './index.js';

const c = centesimasDesdeDecimal;

function copia<T>(valor: T): T {
  return structuredClone(valor);
}

function datosBuenos() {
  return {
    grupos: copia(gruposJson),
    ejercicios: copia(ejerciciosJson) as Record<string, unknown>[],
    perfiles: copia(perfilesJson) as Record<string, unknown>[],
    plantillas: copia(plantillasJson) as Record<string, unknown>[],
    rangos: copia(rangosJson) as Record<string, unknown> & { bandas: Record<string, unknown>[] },
  };
}

function problemasDe(datos: ReturnType<typeof datosBuenos>): string[] {
  try {
    validaCatalogo(datos);
  } catch (error) {
    if (error instanceof ErrorDeCatalogo) return [...error.problemas];
    throw error;
  }
  return [];
}

function ejercicio(datos: ReturnType<typeof datosBuenos>, id: string): Record<string, unknown> {
  const e = datos.ejercicios.find((x) => x['id'] === id);
  if (e === undefined) throw new Error(id);
  return e;
}

describe('catálogo base: el archivo del repositorio', () => {
  it('tiene lo que dice el plan', () => {
    expect(CATALOGO_BASE.grupos).toHaveLength(16);
    expect(CATALOGO_BASE.ejercicios).toHaveLength(182);
    expect(CATALOGO_BASE.plantillas).toHaveLength(5);
    expect(CATALOGO_BASE.rangos.bandas.map((b) => b.id)).toEqual([
      'general',
      'indirecto',
      'directo-barato',
    ]);
    const tamanos = Object.fromEntries(
      CATALOGO_BASE.perfiles.map((p) => [p.id, ejerciciosDePerfil(p).length]),
    );
    expect(tamanos).toEqual({
      esencial: 44,
      'gimnasio-completo': 170,
      'gimnasio-casa': 107,
      mancuernas: 74,
      calistenia: 42,
    });
    expect(CATALOGO_BASE.perfiles.filter((p) => p.por_omision).map((p) => p.id)).toEqual([
      'gimnasio-completo',
    ]);
  });

  it('aplica el criterio documentado: la sentadilla no aporta a isquiosurales y sí a aductores', () => {
    const sentadilla = CATALOGO_BASE.ejercicios.find((e) => e.id === 'sentadilla');
    expect(sentadilla?.coeficientes['isquiosurales']).toBeUndefined();
    expect(sentadilla?.coeficientes['aductores']).toBe('0.50');
  });

  it('cada banda distingue lo publicado de lo propio', () => {
    const respaldos = Object.fromEntries(
      CATALOGO_BASE.rangos.bandas.map((b) => [b.id, b.respaldo]),
    );
    expect(respaldos).toEqual({
      general: 'publicado',
      indirecto: 'propio',
      'directo-barato': 'propio',
    });
  });
});

describe('catálogo base: el validador con datos rotos a propósito', () => {
  it('acepta el bueno (y así sabemos que los rotos fallan por su rotura)', () => {
    expect(problemasDe(datosBuenos())).toEqual([]);
  });

  it('identificadores y nombres únicos, con la clave del almacén', () => {
    const d = datosBuenos();
    ejercicio(d, 'press-inclinado')['id'] = 'press-banca';
    expect(problemasDe(d).join('\n')).toMatch(/ejercicios\.id: «press-banca» repetido/);

    const d2 = datosBuenos();
    ejercicio(d2, 'press-inclinado')['nombre'] = 'PRESS BANCA';
    expect(problemasDe(d2).join('\n')).toMatch(/ejercicios\.nombre: «press banca» repetido/);
  });

  it('coeficientes sólo en los tres niveles, como cadena y con un único principal', () => {
    const d = datosBuenos();
    ejercicio(d, 'press-banca')['coeficientes'] = { pectoral: '1.00', triceps: '0.40' };
    expect(problemasDe(d).join('\n')).toMatch(/0\.40.*fuera de los niveles/);

    const d2 = datosBuenos();
    ejercicio(d2, 'press-banca')['coeficientes'] = { pectoral: 1, triceps: '0.50' };
    expect(problemasDe(d2).join('\n')).toMatch(/decimal con dos posiciones/);

    const d3 = datosBuenos();
    ejercicio(d3, 'press-banca')['coeficientes'] = { pectoral: '1.00', triceps: '1.00' };
    expect(problemasDe(d3).join('\n')).toMatch(/exactamente un grupo principal/);

    const d4 = datosBuenos();
    ejercicio(d4, 'press-banca')['coeficientes'] = { pectoral: '2.50' };
    expect(problemasDe(d4).join('\n')).toMatch(/fuera de \(0\.00, 2\.00\]/);
  });

  it('alias sin repetir y sin repetir un nombre', () => {
    const d = datosBuenos();
    ejercicio(d, 'press-inclinado')['alias'] = ['press plano'];
    expect(problemasDe(d).join('\n')).toMatch(/alias: «press plano» repetido/);

    const d2 = datosBuenos();
    ejercicio(d2, 'press-inclinado')['alias'] = ['Sentadilla'];
    expect(problemasDe(d2).join('\n')).toMatch(/repite el nombre de un ejercicio/);
  });

  it('un grupo necesita tres ejercicios principales', () => {
    const d = datosBuenos();
    for (const id of ['aduccion-maquina', 'aduccion-polea']) {
      ejercicio(d, id)['coeficientes'] = { gluteo: '1.00' };
    }
    expect(problemasDe(d).join('\n')).toMatch(/grupo «aductores».*al menos 3/);
  });

  it('un perfil cubre los dieciséis grupos o declara el hueco, y no declara huecos falsos', () => {
    const d = datosBuenos();
    const calistenia = d.perfiles.find((p) => p['id'] === 'calistenia');
    if (calistenia === undefined) throw new Error('calistenia');
    calistenia['sin_cobertura'] = [];
    expect(problemasDe(d).join('\n')).toMatch(/no cubre «deltoides-lateral» y no lo declara/);

    const d2 = datosBuenos();
    const mancuernas = d2.perfiles.find((p) => p['id'] === 'mancuernas');
    if (mancuernas === undefined) throw new Error('mancuernas');
    mancuernas['sin_cobertura'] = ['pectoral'];
    expect(problemasDe(d2).join('\n')).toMatch(/declara sin cubrir «pectoral», que sí cubre/);
  });

  it('exactamente un perfil por omisión', () => {
    const d = datosBuenos();
    for (const p of d.perfiles) p['por_omision'] = true;
    expect(problemasDe(d).join('\n')).toMatch(/exactamente un perfil por omisión; hay 5/);
  });

  it('una plantilla sólo pide ejercicios de su perfil y cabe en su ciclo', () => {
    const d = datosBuenos();
    const plantilla = d.plantillas.find((p) => p['id'] === 'cuerpo-completo-3d') as {
      dias: { dia: number; entradas: { ejercicio: string }[] }[];
    };
    const primera = plantilla.dias[0]?.entradas[0];
    if (primera === undefined) throw new Error('entrada');
    primera.ejercicio = 'prensa'; // máquina: no está en «gimnasio-casa»
    expect(problemasDe(d).join('\n')).toMatch(
      /pide «prensa», que no está en el perfil «gimnasio-casa»/,
    );

    const d2 = datosBuenos();
    const ciclo4 = d2.plantillas.find((p) => p['id'] === 'ppl-ciclo-4') as {
      dias: { dia: number }[];
    };
    const dia = ciclo4.dias[0];
    if (dia === undefined) throw new Error('día');
    dia.dia = 5;
    expect(problemasDe(d2).join('\n')).toMatch(/el día 5 no cabe en un ciclo de 4/);
  });

  it('cada banda cita fuentes existentes y cada grupo tiene banda', () => {
    const d = datosBuenos();
    const general = d.rangos.bandas[0];
    if (general === undefined) throw new Error('banda');
    general['fuentes'] = [];
    expect(problemasDe(d).join('\n')).toMatch(/debe citar al menos una fuente/);

    const d2 = datosBuenos();
    const indirecto = d2.rangos.bandas[1];
    if (indirecto === undefined) throw new Error('banda');
    indirecto['fuentes'] = ['inventada-2030'];
    expect(problemasDe(d2).join('\n')).toMatch(/cita una fuente que no existe: «inventada-2030»/);

    const d3 = datosBuenos();
    delete (d3.rangos['grupos'] as Record<string, string>)['gemelo'];
    expect(problemasDe(d3).join('\n')).toMatch(/«gemelo» no tiene banda de referencia/);
  });
});

describe('catálogo base: las plantillas, con el motor de verdad', () => {
  const contribuciones = new Map<string, readonly Contribucion[]>(
    CATALOGO_BASE.ejercicios.map((e) => [
      e.id,
      Object.entries(e.coeficientes).map(([grupoId, coeficiente]) => ({
        grupoId,
        coeficiente: c(coeficiente),
      })),
    ]),
  );
  const mcd = (a: number, b: number): number => (b === 0 ? a : mcd(b, a % b));

  for (const plantilla of CATALOGO_BASE.plantillas) {
    it(`«${plantilla.nombre}» deja los dieciséis grupos dentro de su banda`, () => {
      // Sobre el mínimo común múltiplo del ciclo y la semana: un ciclo de 4 días
      // no se alinea con el lunes, y cuatro semanas son siete ciclos exactos.
      const dias = (plantilla.ciclo_dias * 7) / mcd(plantilla.ciclo_dias, 7);
      const semanas = dias / 7;
      const ancla = fechaLogica('2026-09-21');
      const version: VersionDePlan = {
        id: plantilla.id,
        cicloDias: plantilla.ciclo_dias,
        entradas: plantilla.dias.flatMap((d) =>
          d.entradas.map((e) => ({
            dia: d.dia,
            destino: { tipo: 'ejercicio' as const, ejercicioId: e.ejercicio },
            objetivo: c(e.series),
          })),
        ),
      };
      const series = expandePlan({
        asignaciones: [{ id: 'a', versionPlanId: plantilla.id, desde: ancla, hasta: null }],
        versiones: new Map([[plantilla.id, version]]),
        desde: ancla,
        hasta: sumaDias(ancla, dias),
        parametros: { versionParametrosId: 'semilla', contribuciones },
      });
      const agregado = agrega({ series, umbrales: new Map([['semilla', 4]]) });
      const fuera: string[] = [];
      for (const grupo of CATALOGO_BASE.grupos) {
        const referencia = referenciaPara(grupo.nombre, volumenDe(agregado, grupo.id), semanas);
        if (referencia?.estado !== 'dentro') {
          fuera.push(`${grupo.id}: ${volumenDe(agregado, grupo.id) / 100 / semanas} por semana`);
        }
      }
      expect(fuera).toEqual([]);
    });
  }
});

describe('referencia y zona', () => {
  it('decide el veredicto con aritmética entera, justo en los bordes', () => {
    const estado = (vol: string, semanas = 1) =>
      referenciaPara('Pectoral', c(vol) as Centesimas, semanas)?.estado;
    expect(estado('9.99')).toBe('por-debajo');
    expect(estado('10.00')).toBe('dentro');
    expect(estado('20.00')).toBe('dentro');
    expect(estado('20.01')).toBe('por-encima');
    expect(estado('19.99', 2)).toBe('por-debajo');
    expect(estado('20.00', 2)).toBe('dentro');
  });

  it('empareja por nombre normalizado y no hereda nada si el grupo se renombró', () => {
    expect(zonaPara('Dorsal')).toBe('dorsal');
    expect(zonaPara('  gemelo y SÓLEO ')).toBe('gemelo');
    expect(zonaPara('Espalda alta')).toBeNull();
    expect(referenciaPara('Espalda alta', c('12.00'), 1)).toBeNull();
    expect(referenciaPara('Aductores', c('6.00'), 1)).toMatchObject({
      banda: 'indirecto',
      minimo: '6.00',
      maximo: '16.00',
      respaldo: 'propio',
      estado: 'dentro',
    });
  });
});
