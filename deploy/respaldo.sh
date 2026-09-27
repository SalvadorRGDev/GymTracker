#!/usr/bin/env bash
# Respaldo COMPLETO del directorio de datos, en un tar.gz con fecha.
#
#   bash deploy/respaldo.sh [destino]
#   BACKUP_RECIPIENT=<huella-gpg> bash deploy/respaldo.sh /media/disco/sigir
#
# Si BACKUP_RECIPIENT está puesto, el archivo sale cifrado con GPG y el tar.gz en
# claro se borra: un .xlsx en claro en una nube es el historial de entrenamiento
# en claro. Se niega a escribir dentro del directorio de datos (cada copia
# incluiría a la anterior). Imprime la ruta del archivo en la última línea.
set -euo pipefail

DATOS="${DATOS_DIR:-datos}"
DESTINO="${1:-${BACKUP_DIR:-respaldos-completos}}"

[ -f "$DATOS/cuentas.xlsx" ] || { echo "No hay almacén en $DATOS (falta cuentas.xlsx)" >&2; exit 1; }
mkdir -p "$DESTINO"
DATOS_REAL="$(cd "$DATOS" && pwd -P)"
DESTINO_REAL="$(cd "$DESTINO" && pwd -P)"
case "$DESTINO_REAL/" in
  "$DATOS_REAL"/*) echo "El destino $DESTINO_REAL está dentro de $DATOS_REAL: cada copia incluiría a la anterior." >&2; exit 1 ;;
esac

SELLO="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
ARCHIVO="$DESTINO_REAL/sigir-$SELLO.tar.gz"
# Las escrituras son renombrados atómicos: tar lee la versión de antes o la de después.
tar --exclude='*.tmp' -czf "$ARCHIVO" -C "$DATOS_REAL" .
chmod 600 "$ARCHIVO"

if [ -n "${BACKUP_RECIPIENT:-}" ]; then
  gpg --batch --yes --trust-model always --encrypt --recipient "$BACKUP_RECIPIENT" --output "$ARCHIVO.gpg" "$ARCHIVO"
  rm -f "$ARCHIVO"
  ARCHIVO="$ARCHIVO.gpg"
fi

echo "$ARCHIVO"
