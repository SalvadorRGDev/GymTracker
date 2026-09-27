#!/usr/bin/env bash
# Preflight de los atajos: descarta, antes de tocar el iPhone, todo lo que no es
# del dispositivo. NO escribe nada en el almacén.
#
#   ./atajos/comprueba-servidor.sh https://tu-servidor.ts.net "<portador>"
set -uo pipefail

SERVIDOR="${1:?Uso: comprueba-servidor.sh <https://servidor> <portador>}"
PORTADOR="${2:?Falta el portador (Dispositivos → Emitir)}"
SERVIDOR="${SERVIDOR%/}"
FALLOS=0

bien() { printf '  [ok] %s\n' "$1"; }
mal() {
  printf '  [FALLO] %s\n' "$1"
  FALLOS=$((FALLOS + 1))
}
codigo() { curl -s -o /dev/null -w '%{http_code}' --max-time 15 "$@"; }

case "$SERVIDOR" in
  https://*) bien "la URL es https (la cookie Secure y el atajo lo necesitan)" ;;
  http://127.0.0.1* | http://localhost*) bien "URL local: sirve para probar aquí, no desde el teléfono" ;;
  *) mal "la URL no es https: $SERVIDOR" ;;
esac

[ "$(codigo "$SERVIDOR/api/salud")" = 200 ] && bien "el servidor contesta" || mal "el servidor no contesta en $SERVIDOR/api/salud"

CATALOGO=$(curl -s --max-time 15 -H "authorization: Bearer $PORTADOR" "$SERVIDOR/api/captura/v1/catalogo")
EJERCICIOS=$(grep -o '"nombre"' <<<"$CATALOGO" | wc -l)
if grep -q '"ejercicios"' <<<"$CATALOGO"; then
  bien "la credencial vale y el catálogo baja ($EJERCICIOS nombres entre ejercicios y grupos)"
  [ "$EJERCICIOS" -gt 16 ] || mal "el catálogo parece vacío: importa el catálogo base en la web"
else
  mal "la credencial no vale o el catálogo no baja: $CATALOGO"
fi

[ "$(codigo -H 'authorization: Bearer AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' "$SERVIDOR/api/captura/v1/catalogo")" = 401 ] &&
  bien "una credencial inventada da 401 (el atajo aborta y conserva la cola)" || mal "una credencial inventada no da 401"

[ "$(codigo -X POST -H 'content-type: application/json' -d '{}' "$SERVIDOR/api/captura/v1/serie")" = 401 ] &&
  bien "sin credencial, un cuerpo mal formado sigue siendo 401 (no se explica el contrato)" || mal "sin credencial no contesta 401"

[ "$(codigo -X POST -H "authorization: Bearer $PORTADOR" -H 'content-type: application/json' -d '{}' "$SERVIDOR/api/captura/v1/serie")" = 400 ] &&
  bien "con credencial, un cuerpo mal formado es 400 y no escribe nada" || mal "un cuerpo mal formado no da 400"

SEMANA=$(curl -s --max-time 15 -H "authorization: Bearer $PORTADOR" "$SERVIDOR/api/captura/v1/semana")
if grep -q '"mensaje"' <<<"$SEMANA"; then
  bien "la línea semanal del atajo «Semana» llega hecha del servidor"
else
  mal "la línea semanal no llega: $SEMANA"
fi

RESPUESTA=$(curl -s --max-time 15 -w '\n%{http_code}' -X POST -H "authorization: Bearer $PORTADOR" -H 'content-type: application/json' -d '{}' "$SERVIDOR/api/captura/v0/serie")
if [ "$(tail -n1 <<<"$RESPUESTA")" = 426 ] && grep -q '"reinstalar"' <<<"$RESPUESTA"; then
  bien "un contrato desconocido da 426 con la dirección de reinstalación en el cuerpo"
else
  mal "un contrato desconocido no da 426 con «reinstalar»"
fi

if [ "$FALLOS" -eq 0 ]; then
  echo "Todo lo que no depende del iPhone está en orden. Sigue con atajos/PRUEBA-MANUAL.md."
else
  echo "$FALLOS comprobaciones fallaron."
  exit 1
fi
