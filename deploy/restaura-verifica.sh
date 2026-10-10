#!/usr/bin/env bash
# Prueba de restauración: restaura un respaldo completo en un temporal, carga
# cada libro (lo que valida todas las celdas y todos los invariantes) y compara
# conteos con lo que se DECLARA esperar.
#
#   ESPERADO_PROPIETARIOS=2 ESPERADO_SESIONES=87 bash deploy/restaura-verifica.sh gymtracker-….tar.gz[.gpg]
#
# Sin conteos declarados, FALLA: una prueba de restauración que no compara nada
# aprueba un respaldo vacío.
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd)"
ARCHIVO="${1:?Uso: restaura-verifica.sh <respaldo.tar.gz[.gpg]>}"
: "${ESPERADO_PROPIETARIOS:?Declara ESPERADO_PROPIETARIOS: sin conteos esperados no se verifica nada}"
: "${ESPERADO_SESIONES:?Declara ESPERADO_SESIONES: sin conteos esperados no se verifica nada}"

TEMPORAL="$(mktemp -d)"
trap 'rm -rf "$TEMPORAL"' EXIT

if [[ "$ARCHIVO" == *.gpg ]]; then
  gpg --batch --yes --decrypt --output "$TEMPORAL/respaldo.tar.gz" "$ARCHIVO"
  ARCHIVO="$TEMPORAL/respaldo.tar.gz"
fi
mkdir -p "$TEMPORAL/datos"
tar -xzf "$ARCHIVO" -C "$TEMPORAL/datos"

[ -f "$RAIZ/dist/server/verifica.js" ] || (cd "$RAIZ" && npm run --silent build:api)
SALIDA="$(node "$RAIZ/dist/server/verifica.js" "$TEMPORAL/datos")"
echo "$SALIDA"

PROPIETARIOS="$(sed -nE 's/.*propietarios=([0-9]+).*/\1/p' <<<"$SALIDA")"
SESIONES="$(sed -nE 's/.*sesiones=([0-9]+).*/\1/p' <<<"$SALIDA")"
if [ "$PROPIETARIOS" != "$ESPERADO_PROPIETARIOS" ] || [ "$SESIONES" != "$ESPERADO_SESIONES" ]; then
  echo "No cuadra: propietarios=$PROPIETARIOS (esperado $ESPERADO_PROPIETARIOS), sesiones=$SESIONES (esperado $ESPERADO_SESIONES)" >&2
  exit 1
fi
echo "Restauración verificada: propietarios=$PROPIETARIOS sesiones=$SESIONES"
