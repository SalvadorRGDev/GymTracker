import { describe, expect, it } from 'vitest';
import ejercicios from '../../../catalogo/datos/ejercicios.json';
import grupos from '../../../catalogo/datos/grupos.json';
import { EJEMPLOS, ejemploDe } from './ejemplos';
import { CAMARA_POR_OMISION, type Dibujo, proyecta, proyector } from './escena';
import { cadena, duracionDelBucle, MEDIDAS, poseEn, resuelve } from './esqueleto';
import { GRUPOS_EN_LA_FIGURA, piezasDelCuerpo } from './figura';
import { distancia, type V3 } from './vector';

/**
 * Las demostraciones son datos a mano: cien poses escritas con coordenadas.
 * Lo que aquí se comprueba es lo que un error de tecleo rompería sin que nadie
 * lo viera hasta abrir la ventana: que cada ejercicio tenga figura, que manos y
 * pies lleguen a donde la pose los pone, que nada atraviese el suelo y que el
 * bucle cierre sin saltos.
 */

const EJERCICIOS: readonly {
  readonly id: string;
  readonly coeficientes: Readonly<Record<string, string>>;
}[] = ejercicios;

const MUESTRAS = 60;

describe('demostraciones: cobertura del catálogo base', () => {
  it('cada ejercicio del catálogo base tiene su figura', () => {
    const sinFigura = EJERCICIOS.filter((e) => ejemploDe(e.id) === null).map((e) => e.id);
    expect(EJERCICIOS.length).toBeGreaterThan(150);
    expect(sinFigura).toEqual([]);
  });

  it('ninguna entrada apunta a un ejercicio que no existe', () => {
    const ids = new Set(EJERCICIOS.map((e) => e.id));
    expect(Object.keys(EJEMPLOS).filter((id) => !ids.has(id))).toEqual([]);
  });

  it('un identificador desconocido no tiene figura, tampoco los de Object.prototype', () => {
    expect(ejemploDe('no-existe')).toBeNull();
    expect(ejemploDe('constructor')).toBeNull();
    expect(ejemploDe('__proto__')).toBeNull();
  });

  it('cada figura dice qué hace y cómo se hace, en frases completas', () => {
    for (const id of Object.keys(EJEMPLOS)) {
      const d = ejemploDe(id);
      // En minúscula salvo siglas y nombres propios del ejercicio («L-sit», «Y-T-W»).
      expect(d?.titulo, id).toMatch(/^([a-záéíóúñ]|[A-Z]-)[^.]{4,}$/);
      expect(d?.pista, id).toMatch(/^[A-ZÁÉÍÓÚÑ¿].{30,}\.$/);
      expect(`${d?.titulo} ${d?.pista} ${d?.nota ?? ''}`, id).not.toMatch(/undefined|NaN/);
    }
  });
});

describe('demostraciones: geometría', () => {
  const figuras = Object.keys(EJEMPLOS).map((id) => [id, ejemploDe(id)] as const);

  it('manos y tobillos llegan a su objetivo en todo el recorrido', () => {
    const lejos: string[] = [];
    for (const [id, d] of figuras) {
      if (d === null) continue;
      const total = duracionDelBucle(d.movimiento.pasos);
      for (let i = 0; i < MUESTRAS; i += 1) {
        const e = resuelve(poseEn(d.movimiento.pasos, (total * i) / MUESTRAS));
        for (const c of [...e.brazos, ...e.piernas]) {
          const falta = distancia(c.fin, c.objetivo);
          if (falta > 1.5) lejos.push(`${id} @${i}: ${falta.toFixed(1)}`);
        }
      }
    }
    expect(lejos).toEqual([]);
  });

  it('los segmentos conservan su largo: el maniquí no se estira', () => {
    for (const [id, d] of figuras) {
      if (d === null) continue;
      const e = resuelve(poseEn(d.movimiento.pasos, 777));
      for (const b of e.brazos) {
        expect(distancia(b.raiz, b.medio), id).toBeCloseTo(MEDIDAS.brazo, 6);
        expect(distancia(b.medio, b.fin), id).toBeCloseTo(MEDIDAS.antebrazo, 6);
      }
      for (const p of e.piernas) {
        expect(distancia(p.raiz, p.medio), id).toBeCloseTo(MEDIDAS.muslo, 6);
        expect(distancia(p.medio, p.fin), id).toBeCloseTo(MEDIDAS.pierna, 6);
      }
    }
  });

  it('nada atraviesa el suelo: ni codos, ni rodillas, ni manos, ni pies, ni la cabeza', () => {
    const bajo: string[] = [];
    for (const [id, d] of figuras) {
      if (d === null) continue;
      const total = duracionDelBucle(d.movimiento.pasos);
      for (let i = 0; i < MUESTRAS; i += 1) {
        const e = resuelve(poseEn(d.movimiento.pasos, (total * i) / MUESTRAS));
        const puntos: V3[] = [
          ...[...e.brazos, ...e.piernas].flatMap((c) => [c.medio, c.fin]),
          [e.cabeza[0], e.cabeza[1] - MEDIDAS.cabeza, e.cabeza[2]],
        ];
        const minimo = Math.min(...puntos.map((p) => p[1]));
        if (minimo < -1) bajo.push(`${id} @${i}: ${minimo.toFixed(1)}`);
      }
    }
    expect(bajo).toEqual([]);
  });

  it('ninguna articulación salta de un fotograma al siguiente', () => {
    // Con 360 muestras por vuelta, lo más rápido que se mueve algo de verdad
    // no pasa de 5 por muestra: más que eso es un pie que se da la vuelta o
    // una rodilla que cambia de lado de golpe.
    const saltos: string[] = [];
    for (const [id, d] of figuras) {
      if (d === null) continue;
      const total = duracionDelBucle(d.movimiento.pasos);
      let previo: readonly V3[] | null = null;
      for (let i = 0; i <= 360; i += 1) {
        const e = resuelve(poseEn(d.movimiento.pasos, (total * i) / 360));
        const puntos: readonly V3[] = [
          e.pelvis,
          e.cabeza,
          ...[...e.brazos, ...e.piernas].flatMap((c) => [c.medio, c.fin]),
          ...e.pies.flat(),
        ];
        if (previo !== null) {
          const antes = previo;
          const peor = Math.max(...puntos.map((p, k) => distancia(p, antes[k] as V3)));
          if (peor > 5) saltos.push(`${id} @${i}: ${peor.toFixed(1)}`);
        }
        previo = puntos;
      }
    }
    expect(saltos).toEqual([]);
  });

  it('el bucle cierra: el final enlaza con el principio sin saltar', () => {
    for (const [id, d] of figuras) {
      if (d === null) continue;
      const total = duracionDelBucle(d.movimiento.pasos);
      const [a, b] = [
        resuelve(poseEn(d.movimiento.pasos, 0)),
        resuelve(poseEn(d.movimiento.pasos, total - 1)),
      ];
      const salto = Math.max(
        distancia(a.pelvis, b.pelvis),
        distancia(a.cabeza, b.cabeza),
        ...[0, 1].map((i) => distancia(a.brazos[i as 0 | 1].fin, b.brazos[i as 0 | 1].fin)),
        ...[0, 1].map((i) => distancia(a.piernas[i as 0 | 1].fin, b.piernas[i as 0 | 1].fin)),
      );
      expect(salto, id).toBeLessThan(1);
    }
  });

  it('la cinemática inversa respeta el polo y no se sale de su alcance', () => {
    const alcanzable = cadena([0, 0, 0], [30, 0, 0], 31, 32, [0, 1, 0]);
    expect(alcanzable.medio[1]).toBeGreaterThan(0);
    expect(distancia(alcanzable.fin, [30, 0, 0])).toBeLessThan(1e-9);
    const lejano = cadena([0, 0, 0], [100, 0, 0], 31, 32, [0, 1, 0]);
    expect(distancia(lejano.fin, [0, 0, 0])).toBeCloseTo(63, 5);
    expect(distancia(lejano.fin, lejano.objetivo)).toBeGreaterThan(30);
  });
});

const pintaPrincipal = (d: Dibujo): boolean =>
  d.tipo === 'grupo' ? d.hijos.some(pintaPrincipal) : d.clase.includes('principal');

describe('demostraciones: músculos', () => {
  it('la figura sabe dónde va cada grupo del catálogo base', () => {
    const pintables = new Set<string>(Object.values(GRUPOS_EN_LA_FIGURA).flat());
    expect(grupos.map((g) => g.id).filter((id) => !pintables.has(id))).toEqual([]);
  });

  it('lo que más trabaja se ve en algún momento del recorrido, desde su cámara', () => {
    const ocultos: string[] = [];
    for (const ej of EJERCICIOS) {
      const d = ejemploDe(ej.id);
      if (d === null) continue;
      const camara = proyector(d.movimiento.camara ?? CAMARA_POR_OMISION);
      const total = duracionDelBucle(d.movimiento.pasos);
      for (const [grupo, coeficiente] of Object.entries(ej.coeficientes)) {
        if (coeficiente !== '1.00') continue;
        const musculos = { principales: [grupo], ayudan: [] };
        const visto = Array.from({ length: 8 }, (_, i) =>
          proyecta(
            piezasDelCuerpo(
              resuelve(poseEn(d.movimiento.pasos, (total * i) / 8)),
              camara.mira,
              musculos,
            ),
            camara,
          ),
        ).some((dibujos) => dibujos.some(pintaPrincipal));
        if (!visto) ocultos.push(`${ej.id}: ${grupo}`);
      }
    }
    expect(ocultos).toEqual([]);
  });

  it('una región del tronco sólo pinta lo que mira a la cámara, nunca a través del cuerpo', () => {
    const d = ejemploDe('sentadilla');
    if (d === null) throw new Error('sentadilla sin figura');
    const e = resuelve(poseEn(d.movimiento.pasos, 0));
    const lumbares = { principales: ['lumbares'], ayudan: [] };
    const desde = (giro: number) => {
      const camara = proyector({ giro, alzado: 0 });
      return proyecta(piezasDelCuerpo(e, camara.mira, lumbares), camara).some(pintaPrincipal);
    };
    expect(desde(90)).toBe(false);
    expect(desde(-90)).toBe(true);
  });

  it('el trapecio asoma entre el cuello y el hombro: se ve también de frente', () => {
    const d = ejemploDe('encogimientos-barra');
    if (d === null) throw new Error('encogimientos sin figura');
    const e = resuelve(poseEn(d.movimiento.pasos, 0));
    const camara = proyector({ giro: 90, alzado: 0 });
    const dibujos = proyecta(
      piezasDelCuerpo(e, camara.mira, { principales: ['trapecio'], ayudan: [] }),
      camara,
    );
    expect(dibujos.some(pintaPrincipal)).toBe(true);
  });
});

describe('demostraciones: cámara', () => {
  it('de lado y sin alzado, x va a la derecha, y hacia arriba (y del SVG hacia abajo)', () => {
    const c = proyector({ giro: 0, alzado: 0 });
    expect(c.plano([10, 20, 5])).toEqual([10, -20]);
    expect(c.hondo([0, 0, 5])).toBeGreaterThan(c.hondo([0, 0, -5]));
  });

  it('se pinta de lejos a cerca, y la sombra siempre antes', () => {
    const dibujos = proyecta(
      [
        { tipo: 'masa', esferas: [[[0, 50, 20], 5]], clase: 'cuerpo' },
        { tipo: 'masa', esferas: [[[0, 50, -20], 5]], clase: 'lejos' },
        { tipo: 'disco', c: [0, 0, 0], normal: [0, 1, 0], r: 60, clase: 'sombra', capa: -10 },
      ],
      proyector(CAMARA_POR_OMISION),
    );
    expect(dibujos.map((d) => d.clase)).toEqual(['sombra', 'lejos', 'cuerpo']);
  });

  it('un grupo con profundidad propia se ordena por ella, no por su primera pieza', () => {
    const dibujos = proyecta(
      [
        {
          tipo: 'grupo',
          clase: 'cuerpo',
          profundidad: [0, 0, 10],
          piezas: [{ tipo: 'masa', esferas: [[[0, 0, -30], 2]], clase: 'cuerpo' }],
        },
        { tipo: 'masa', esferas: [[[0, 0, 0], 2]], clase: 'lejos' },
      ],
      proyector({ giro: 0, alzado: 0 }),
    );
    expect(dibujos.map((d) => d.clase)).toEqual(['lejos', 'cuerpo']);
  });
});
