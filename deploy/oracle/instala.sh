#!/usr/bin/env bash
# Instala o actualiza GymTracker en una máquina Ubuntu (Oracle Cloud u otra).
# Se ejecuta en la máquina, como usuario normal (no root):
#
#   curl -fsSL https://raw.githubusercontent.com/SalvadorRGDev/GymTracker/main/deploy/oracle/instala.sh | bash
#
# Se puede repetir: la segunda vez actualiza el código, recompila y reinicia.
# Nunca toca ~/gymtracker/datos ni un .env que ya exista.
set -euo pipefail

REPO="${REPO:-https://github.com/SalvadorRGDev/GymTracker.git}"
DIR="$HOME/gymtracker"

[ "$(id -u)" -ne 0 ] || { echo "Ejecútalo como tu usuario, no como root." >&2; exit 1; }

echo "== Paquetes del sistema"
sudo apt-get update -qq
sudo apt-get install -y -qq git curl ca-certificates gnupg
if ! command -v node >/dev/null || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 22 ]; then
  echo "== Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
  sudo apt-get install -y -qq nodejs
fi
node --version

echo "== Código"
if [ -d "$DIR/.git" ]; then
  git -C "$DIR" pull --ff-only
else
  git clone "$REPO" "$DIR"
fi
cd "$DIR"
npm ci --no-audit --no-fund
npm run build:api
npm run build:web

echo "== Configuración"
if [ ! -f .env ]; then
  cp .env.example .env
  secreto="$(openssl rand -hex 32)"
  sed -i "s/^SESSION_SECRET=.*/SESSION_SECRET=$secreto/" .env
  echo "Creado .env con un SESSION_SECRET nuevo. Si traes datos de tu PC, pon el MISMO"
  echo "secreto que allí (lo explica deploy/oracle/README.md, paso 5)."
fi
chmod 600 .env
mkdir -p datos "$HOME/respaldos-completos"
chmod 700 datos "$HOME/respaldos-completos"

echo "== Servicios"
mkdir -p "$HOME/.config/systemd/user"
cp deploy/oracle/gymtracker.service deploy/oracle/gymtracker-respaldo.service \
   deploy/oracle/gymtracker-respaldo.timer "$HOME/.config/systemd/user/"
# Sin «linger», los servicios de usuario se paran al cerrar la sesión SSH.
sudo loginctl enable-linger "$USER"
systemctl --user daemon-reload
systemctl --user enable gymtracker.service gymtracker-respaldo.timer
systemctl --user enable --now gymtracker-respaldo.timer
if [ -f datos/cuentas.xlsx ]; then
  systemctl --user restart gymtracker.service
  sleep 2
  systemctl --user --no-pager status gymtracker.service | head -5
  curl -fsS -o /dev/null -w "Salud: %{http_code}\n" http://127.0.0.1:3000/api/salud || true
else
  echo "Aún no hay datos (falta datos/cuentas.xlsx): trae los de tu PC (paso 5)"
  echo "o crea una cuenta con «npm run alta», y luego: systemctl --user start gymtracker"
fi
echo "Listo."
