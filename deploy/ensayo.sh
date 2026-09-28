#!/usr/bin/env bash
# Ensayo de punta a punta: veintidós afirmaciones que ninguna prueba de unidad ve.
#
# Monta un directorio temporal (NUNCA toca datos/), da de alta una cuenta,
# arranca el proceso COMPILADO, captura como el atajo y como la web, importa el
# catálogo base, respalda y restaura, y compara conteos. Si algo no cuadra,
# termina con error diciendo cuál.
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
cd "$RAIZ"
TEMPORAL="$(mktemp -d)"
PUERTO="${ENSAYO_PUERTO:-3197}"
BASE="http://127.0.0.1:${PUERTO}"
PID=""
N=0

limpia() {
  if [ -n "$PID" ]; then kill "$PID" 2>/dev/null || true; fi
  rm -rf "$TEMPORAL"
}
trap limpia EXIT

ok() {
  N=$((N + 1))
  printf '  [ok] %2d. %s\n' "$N" "$1"
}

falla() {
  printf '  [FALLO] %s\n' "$1" >&2
  if [ -f "$TEMPORAL/servidor.log" ]; then sed 's/^/        /' "$TEMPORAL/servidor.log" >&2; fi
  exit 1
}

# Lee un campo de un JSON con Node: json '<expresión sobre d>' <<< "$texto"
json() {
  node -e "let t='';process.stdin.on('data',c=>t+=c).on('end',()=>{const d=JSON.parse(t);const v=(${1});process.stdout.write(typeof v==='string'?v:JSON.stringify(v))})"
}

export DATOS_DIR="$TEMPORAL/datos"
export SESSION_SECRET
SESSION_SECRET="$(node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('hex'))")"
export PORT="$PUERTO"
export WEB_DIR="$RAIZ/dist/web"
export ATAJOS_URL="https://ejemplo.invalid/atajos"
export LOG="silencio"
CONTRASENA="contrasena-del-ensayo"

echo "Ensayo sobre $TEMPORAL (puerto $PUERTO)"
[ -f dist/server/arranque.js ] || npm run --silent build:api
[ -f dist/web/index.html ] || npm run --silent build:web

# 1 ── el alta crea el libro
printf '%s\n%s\n' "$CONTRASENA" "$CONTRASENA" | node dist/server/alta.js ensayo@ejemplo.com America/Mexico_City 4 >/dev/null
LIBROS=$(find "$DATOS_DIR" -maxdepth 1 -name '*.xlsx' | wc -l)
[ "$LIBROS" -eq 2 ] || falla "el alta debía dejar cuentas.xlsx y un libro; hay $LIBROS"
ok "el alta crea cuentas.xlsx y el libro de la persona"

node dist/server/arranque.js >"$TEMPORAL/servidor.log" 2>&1 &
PID=$!
curl -s --retry 40 --retry-delay 1 --retry-connrefused --retry-all-errors -o /dev/null "$BASE/api/salud" ||
  falla "el servidor no arrancó"

# 2 ── sin sesión, 401
[ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE/api/lectura/v1/dashboard")" = 401 ] || falla "el resumen sin sesión no es 401"
ok "sin sesión, la lectura contesta 401"

# 3 y 4 ── el cliente en la raíz y en cualquier ruta suya
curl -sf "$BASE/" | grep -q 'id="app"' || falla "la raíz no sirve index.html"
ok "la raíz sirve index.html"
curl -sf "$BASE/historial" | grep -q 'id="app"' || falla "una ruta del cliente no sirve index.html"
ok "una ruta del cliente también sirve index.html"

# 5 ── una ruta de API inexistente sigue siendo de API
RESP=$(curl -s -w '\n%{http_code}' "$BASE/api/nada")
[ "$(tail -n1 <<<"$RESP")" = 404 ] && grep -q '"no-encontrado"' <<<"$RESP" || falla "/api/nada no es un 404 de API"
ok "una ruta de API inexistente es un 404 de API, no una página"

# 6 ── se sirve el cliente compilado
RECURSO=$(curl -sf "$BASE/" | grep -oE '/assets/[^"]+\.js' | head -n1)
[ -n "$RECURSO" ] && [ "$(curl -s -o /dev/null -w '%{http_code}' "$BASE$RECURSO")" = 200 ] || falla "no se sirve $RECURSO"
ok "se sirve el JavaScript compilado ($RECURSO)"

# 7 ── entrar devuelve la cookie
CABECERAS=$(curl -s -D - -o /dev/null -H 'content-type: application/json' \
  -d "{\"correo\":\"ensayo@ejemplo.com\",\"contrasena\":\"$CONTRASENA\"}" "$BASE/api/sesion/v1/entrar")
COOKIE=$(grep -i '^set-cookie:' <<<"$CABECERAS" | sed -E 's/^[Ss]et-[Cc]ookie: ([^;]+);.*/\1/' | tr -d '\r')
grep -q '^sigir_sesion=' <<<"$COOKIE" && grep -qi 'HttpOnly; Secure; SameSite=Strict' <<<"$CABECERAS" || falla "entrar no dio la cookie esperada"
ok "entrar da una cookie HttpOnly, Secure y SameSite=Strict"
TOKEN_WEB="${COOKIE#sigir_sesion=}"

web() { curl -s -H "cookie: $COOKIE" -H 'content-type: application/json' "$@"; }

# 8 ── importar el catálogo base
BASE_JSON=$(web "$BASE/api/lectura/v1/catalogo/base")
CUERPO=$(json '({grupos: d.grupos.map(g => g.id), ejercicios: d.ejercicios_por_perfil["gimnasio-completo"]})' <<<"$BASE_JSON")
IMPORT=$(web -d "$CUERPO" "$BASE/api/lectura/v1/catalogo/importa")
[ "$(json 'd.ejercicios_creados' <<<"$IMPORT")" = 170 ] || falla "la importación no creó 170 ejercicios: $IMPORT"
ok "importa el catálogo base por identificadores (170 ejercicios, 16 grupos)"

# 9 ── emitir una credencial de captura; su archivo apunta a donde está el
#      navegador (Origin), no al Host local que el túnel puede haber reescrito
EMITIDO=$(web -H 'origin: https://ensayo.ejemplo.ts.net' -d '{"nombre":"iPhone del ensayo"}' "$BASE/api/lectura/v1/dispositivos")
PORTADOR=$(json 'd.credencial' <<<"$EMITIDO")
[ ${#PORTADOR} -eq 43 ] || falla "la credencial emitida no tiene la forma esperada"
[ "$(json 'JSON.parse(d.archivo.contenido).servidor' <<<"$EMITIDO")" = "https://ensayo.ejemplo.ts.net" ] ||
  falla "credencial.json no apunta a la URL del navegador: $(json 'd.servidor.url' <<<"$EMITIDO")"
ok "emite una credencial que se ve una vez, y su archivo apunta a la URL del navegador"

atajo() { curl -s -H "authorization: Bearer $1" -H 'content-type: application/json' "${@:2}"; }
SESION="ensayo-sesion-$(date +%s)"
SERIE_1="{\"sesion\":{\"clave\":\"$SESION\",\"iniciada_en\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"},\"serie\":{\"clave\":\"ensayo-serie-0001\",\"ejercicio\":\"Press banca\",\"repeticiones\":10,\"carga_kg\":\"60,5\",\"rir\":2,\"calentamiento\":false,\"realizada_en\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\"}}"

# 10 y 11 ── el atajo registra y el reenvío es idempotente
R1=$(atajo "$PORTADOR" -d "$SERIE_1" "$BASE/api/captura/v1/serie")
[ "$(json 'd.estado' <<<"$R1")" = aceptada ] || falla "el atajo no pudo registrar: $R1"
ok "el atajo registra una serie y recibe el total de la semana"
R2=$(atajo "$PORTADOR" -d "$SERIE_1" "$BASE/api/captura/v1/serie")
grep -q 'Ya estaba registrada' <<<"$(json 'd.mensaje' <<<"$R2")" || falla "el reenvío no fue idempotente: $R2"
ok "reenviar la misma serie no produce un segundo efecto"

# 12 ── el atajo no llega a las rutas de planes (su línea semanal, en el 20, sólo lee)
[ "$(atajo "$PORTADOR" -o /dev/null -w '%{http_code}' "$BASE/api/planes/v1")" = 401 ] || falla "el portador leyó planes"
ok "el portador del atajo no llega a las rutas de planes"

# 13 ── la web registra en la misma sesión
R3=$(web -d "{\"sesion\":{\"clave\":\"$SESION\"},\"serie\":{\"clave\":\"ensayo-serie-0002\",\"ejercicio\":\"Press banca\",\"repeticiones\":8,\"carga_kg\":\"62.5\",\"rir\":1,\"calentamiento\":false}}" "$BASE/api/registro/v1/serie")
[ "$(json 'd.serie.orden' <<<"$R3")" = 2 ] || falla "la web no registró en la misma sesión: $R3"
ok "la web registra en la misma sesión, con el mismo servicio"

# 14 ── la cookie no vale como credencial de captura
[ "$(atajo "$TOKEN_WEB" -o /dev/null -w '%{http_code}' -d "$SERIE_1" "$BASE/api/captura/v1/serie")" = 401 ] || falla "la cookie valió como portador"
ok "el token de la cookie no vale como credencial de captura"

# 15 ── un ejercicio inexistente se rechaza con 200
R4=$(atajo "$PORTADOR" -w '\n%{http_code}' -d "${SERIE_1/Press banca/Press vanca}" "$BASE/api/captura/v1/serie")
[ "$(tail -n1 <<<"$R4")" = 200 ] && grep -q '"rechazada"' <<<"$R4" || falla "un ejercicio inexistente no se rechazó con 200"
ok "un ejercicio que no está en el catálogo se rechaza en el cuerpo, con 200"

# 16 y 17 y 18 ── el resumen: hoy cuenta, un grupo sin mapeo sale a cero, y el mapa trae su contrato
web -d '{"nombre":"Grupo del ensayo"}' -o /dev/null "$BASE/api/lectura/v1/catalogo/grupos"
DASH=$(web "$BASE/api/lectura/v1/dashboard")
[ "$(json 'd.grupos.find(g => g.nombre === "Pectoral").series_efectivas' <<<"$DASH")" = 2.00 ] || falla "lo capturado hoy no cuenta con lo importado hoy"
ok "lo capturado hoy cuenta con lo importado hoy (ADR-013): Pectoral 2.00"
[ "$(json 'JSON.stringify(d.grupos.find(g => g.nombre === "Grupo del ensayo"))' <<<"$DASH")" = '{"id":'"$(json 'JSON.stringify(d.grupos.find(g => g.nombre === "Grupo del ensayo").id)' <<<"$DASH")"',"nombre":"Grupo del ensayo","series_efectivas":"0.00","nivel":0,"zona":null,"referencia":null}' ] ||
  falla "un grupo sin mapeo no sale con 0.00, nivel 0 y sin zona"
ok "un grupo sin ejercicios sale con 0.00, nivel 0 y sin lugar en el modelo"
[ "$(json 'd.grupos.find(g => g.nombre === "Pectoral").nivel + "|" + d.grupos.find(g => g.nombre === "Pectoral").zona + "|" + d.escala.length' <<<"$DASH")" = '1|pectoral|7' ] ||
  falla "el resumen no trae nivel, zona y escala"
ok "el resumen trae nivel, zona y la escala de siete tramos del mapa muscular"

# 19 ── la exportación no lleva huellas ni hashes
EXPORTACION=$(web "$BASE/api/lectura/v1/exportacion")
grep -qE 'argon2|huella|portador' <<<"$EXPORTACION" && falla "la exportación lleva secretos"
[ "$(json 'Object.keys(d.datos).length' <<<"$EXPORTACION")" = 11 ] || falla "la exportación no trae las once hojas"
ok "la exportación trae las once hojas y ninguna huella"

# 20 ── la comparativa: un plan asignado hoy pide 5 de pectoral; se hicieron 2
HOY=$(json 'd.hoy' <<<"$(web "$BASE/api/planes/v1")")
PECTORAL=$(json 'd.grupos.find(g => g.nombre === "Pectoral").id' <<<"$(web "$BASE/api/lectura/v1/catalogo")")
VERSION=$(json 'd.id' <<<"$(web -d '{"nombre":"Plan del ensayo","ciclo_dias":7}' "$BASE/api/planes/v1")")
web -X PUT -d "{\"entradas\":[{\"dia\":1,\"grupo_id\":\"$PECTORAL\",\"objetivo\":\"5\"}]}" -o /dev/null "$BASE/api/planes/v1/versiones/$VERSION/entradas"
web -d '{}' -o /dev/null "$BASE/api/planes/v1/versiones/$VERSION/publicacion"
web -d "{\"version_id\":\"$VERSION\",\"desde\":\"$HOY\"}" -o /dev/null "$BASE/api/planes/v1/asignaciones"
COMPARATIVA=$(web "$BASE/api/planes/v1/comparativa?ventanas=1")
[ "$(json '(g => [g.planeado, g.ejecutado, g.delta, g.estado].join("|"))(d.ventanas[0].grupos.find(g => g.nombre === "Pectoral"))' <<<"$COMPARATIVA")" = '5.00|2.00|-3.00|pendiente' ] ||
  falla "la comparativa no resta lo hecho de lo planeado: $COMPARATIVA"
LINEA=$(atajo "$PORTADOR" "$BASE/api/captura/v1/semana")
grep -q 'Pectoral 2.00 de 5.00' <<<"$(json 'd.mensaje' <<<"$LINEA")" || falla "la línea semanal del atajo no lo dice: $LINEA"
ok "la comparativa resta lo hecho de lo planeado, y el atajo recibe su línea semanal"

# 21 ── respaldar y restaurar reproduce el almacén
kill "$PID"
wait "$PID" 2>/dev/null || true
PID=""
ARCHIVO=$(bash deploy/respaldo.sh "$TEMPORAL/respaldo" | tail -n1)
ESPERADO_PROPIETARIOS=1 ESPERADO_SESIONES=1 bash deploy/restaura-verifica.sh "$ARCHIVO" >/dev/null ||
  falla "la restauración no reproduce el almacén"
ok "respaldar y restaurar reproduce el almacén (propietarios=1 sesiones=1)"

# 22 ── la baja borra de verdad: libro, credenciales y copias automáticas con sus datos
printf 'ensayo@ejemplo.com\n' | node dist/server/baja.js ensayo@ejemplo.com >/dev/null || falla "la baja no terminó"
[ "$(node dist/server/verifica.js "$DATOS_DIR")" = "propietarios=0 sesiones=0 series=0" ] || falla "tras la baja quedan datos"
[ "$(find "$DATOS_DIR" -maxdepth 1 -name '*.xlsx' | wc -l)" -eq 1 ] || falla "tras la baja queda un libro además de cuentas.xlsx"
[ "$(find "$DATOS_DIR/respaldos" -name '*.xlsx' ! -name 'cuentas--*' | wc -l)" -eq 0 ] || falla "quedan copias del libro borrado"
node --input-type=module -e "
import { readdirSync, readFileSync } from 'node:fs';
import { leeLibro } from '$RAIZ/dist/almacen/xlsx.js';
const d = process.env.DATOS_DIR + '/respaldos';
const conCorreo = readdirSync(d).filter((n) => JSON.stringify(leeLibro(readFileSync(d + '/' + n))).includes('ensayo@ejemplo.com'));
process.exit(conCorreo.length === 0 ? 0 : 1);
" || falla "una copia automática de cuentas.xlsx conserva el correo"
ok "la baja borra el libro, las credenciales y las copias automáticas con sus datos"

echo "Ensayo completo: $N de 22 afirmaciones."
[ "$N" -eq 22 ] || falla "se esperaban 22 afirmaciones"
