# SIGIR Fitness

Cuenta cuántas **series efectivas** recibe cada **grupo muscular** por semana y
lo pone junto a lo que **planeaste**. Un press de banca entrena el pectoral, pero
también el tríceps y el deltoides anterior: el motor reparte cada serie por sus
coeficientes, descarta el calentamiento y aplica tu umbral de RIR.

- **Dos personas, coste cero**: un proceso de Node en tu máquina, publicado con un
  túnel gratuito (Cloudflare Tunnel o Tailscale).
- **Tus datos en Excel**: un libro `.xlsx` por persona, que se abre y se edita a
  mano; el servidor valida todo al cargar.
- **Captura** desde la pantalla bloqueada del iPhone con **Atajos**, o desde la
  pantalla «Registrar» de la web. Las dos llaman al mismo servicio.
- **Resumen** de la semana con un **mapa muscular**: una figura que se gira
  (frente/espalda, cuerpo completo o tren superior/inferior) y se colorea por el
  volumen de cada grupo, con su leyenda, o comparada con el plan.
- **Comparativa**: cada semana del plan contra lo hecho, con la diferencia y su
  signo, la simulación de otro umbral de RIR y la vigilancia de ese umbral.

## Arranque rápido

```bash
npm ci
npm test && npm run lint
cp .env.example .env            # SESSION_SECRET=$(openssl rand -hex 32)
npm run build:api && npm run build:web
npm run alta -- tucorreo@ejemplo.com America/Mexico_City 4
npm start                       # http://127.0.0.1:3000
```

Después: Catálogo → Importar catálogo base → Registrar una serie → Resumen.
Runbook completo en `deploy/README.md`; atajos en `atajos/README.md`.

## Vistas

Acceso · Resumen (con el mapa muscular) · Registrar · Historial · Proyección ·
Comparativa · Rutinas · Catálogo · Dispositivos: ocho vistas más el acceso.

## Documentación

| Documento | Contenido |
| --------- | --------- |
| `Plan.md` | Documento maestro: problema, método, arquitectura, estado, mejoras |
| `CLAUDE.md` | Reglas del proyecto: comandos, invariantes, qué no hacer |
| `docs/00-spec.md` | La especificación original y sus nueve preguntas |
| `docs/01-decisiones.md` | ADR-001 a ADR-018 |
| `docs/02-modelo-datos.md` | Hojas, columnas, invariantes y los diez defectos |
| `docs/03-fases.md` | Fases y su estado (la 3, la comparativa, en código) |
| `docs/04-aceptacion.md` | Criterios de aceptación por nivel |
| `docs/05-riesgos.md` | R1 a R12 con su señal de detección |
| `docs/06-contrato-captura.md` | `/api/captura/v1` y `/api/registro/v1` |
| `docs/07-contrato-lectura.md` | Sesión, resumen, historial, catálogo, dispositivos, exportación |
| `docs/08-contrato-planes.md` | Planes, proyección, comparativa, simulación y códigos de rechazo |
| `docs/09-catalogo-base.md` | Taxonomía, coeficientes, perfiles, plantillas, rangos y fuentes |
| `docs/10-lenguaje-visual.md` | Dirección moderna, vidrio, apagados, contraste, la escala del mapa y la divergente |
| `docs/11-privacidad.md` | Aviso de privacidad: qué se guarda y cómo se borra |
| `deploy/README.md` | Puesta en marcha, túneles, respaldo, restauración, ensayo |
| `atajos/README.md` | Los siete atajos, su estado en iCloud y la prueba manual |

## Licencia

`UNLICENSED`: todos los derechos reservados por omisión. Decidir una licencia es
una decisión pendiente del autor. Las fuentes (Playfair Display, Inter) van con su
licencia OFL en `src/web/fuentes/`, y los iconos de Lucide con la suya (ISC).
