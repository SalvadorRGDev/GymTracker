#!/usr/bin/env bash
# Arranque automático (§19.3 del plan): instala GymTracker como servicio de usuario
# de systemd, que arranca solo y se reinicia si cae. Se puede repetir: recompila,
# reescribe el servicio y lo reinicia.
#
#   bash deploy/instala-servicio.sh
#
# El túnel no necesita servicio: «tailscale funnel --bg» lo recuerda tailscaled.
set -euo pipefail

RAIZ="$(cd "$(dirname "$0")/.." && pwd -P)"
NODE="$(command -v node)"
DESTINO="$HOME/.config/systemd/user/gymtracker.service"
cd "$RAIZ"

[ -f .env ] || { echo "Falta .env en $RAIZ (cópialo de .env.example)." >&2; exit 1; }
valor() { grep -E "^$1=" .env | tail -n1 | cut -d= -f2- | tr -d '"'"'"; }
PUERTO="$(valor PORT)"; PUERTO="${PUERTO:-3000}"
DATOS="$(valor DATOS_DIR)"; DATOS="${DATOS:-datos}"
[ -f "$DATOS/cuentas.xlsx" ] ||
  echo "Aviso: no hay cuentas.xlsx en $DATOS; el servidor no arrancará hasta que exista." >&2

# Un «npm start» abierto escucha en el puerto sin ser el servicio.
if ss -ltn 2>/dev/null | grep -qE "[:.]$PUERTO\s" && ! systemctl --user -q is-active gymtracker 2>/dev/null; then
  echo "Ya hay un servidor escuchando fuera del servicio (¿un «npm start» abierto?)." >&2
  echo "Ciérralo primero: dos procesos escribiendo los mismos libros es lo que no puede pasar." >&2
  exit 1
fi

npm run --silent build:api
npm run --silent build:web

mkdir -p "$(dirname "$DESTINO")"
sed -e "s#@PROYECTO@#$RAIZ#" -e "s#@NODE@#$NODE#" deploy/gymtracker.service > "$DESTINO"
systemctl --user daemon-reload
systemctl --user enable gymtracker.service
systemctl --user restart gymtracker.service
sleep 2
systemctl --user --no-pager --lines=0 status gymtracker.service | head -3
curl -fsS -o /dev/null -w "Salud: %{http_code}\n" "http://127.0.0.1:$PUERTO/api/salud"

if [ "$(loginctl show-user "$USER" -p Linger --value 2>/dev/null)" != "yes" ]; then
  echo
  echo "Arrancará al iniciar tu sesión. Para que arranque al encender el equipo, sin"
  echo "iniciar sesión:  sudo loginctl enable-linger $USER"
fi
