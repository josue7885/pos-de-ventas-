#!/usr/bin/env bash
set -euo pipefail
# Run with bash scripts/phone-server.sh inside Termux. Data is outside the checkout.
POS_PROJECT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$POS_PROJECT_ROOT"
command -v node >/dev/null || { echo 'Falta Node.js. En Termux ejecuta: pkg install nodejs-lts npm git'; exit 1; }
node -e 'if(Number(process.versions.node.split(".")[0])<22){console.error("Se necesita Node.js 22 o posterior.");process.exit(1)}'
if [[ ! -d server/node_modules ]]; then
  echo 'Instala las dependencias primero: npm ci --prefix server --omit=dev'
  exit 1
fi
export POS_DATA_DIR="${POS_DATA_DIR:-$HOME/.local/share/pos-control}"
export POS_ALLOWED_ORIGINS='https://localhost,capacitor://localhost'
export POS_HOST='127.0.0.1'
export PORT="${PORT:-3000}"
case "${1:-}" in
  '') ;;
  --compartir) export POS_HOST='0.0.0.0' ;;
  *) echo 'Uso: bash scripts/phone-server.sh [--compartir]'; exit 1 ;;
esac
umask 077
mkdir -p -- "$POS_DATA_DIR"
if [[ ! -f "$POS_DATA_DIR/pos.db" ]]; then
  while true; do
    read -r -s -p 'PIN inicial de administrador (6 a 12 números): ' POS_PIN_FIRST
    echo
    [[ "$POS_PIN_FIRST" =~ ^[0-9]{6,12}$ ]] || { echo 'El PIN debe tener de 6 a 12 números.'; continue; }
    read -r -s -p 'Repite el PIN: ' POS_PIN_SECOND
    echo
    [[ "$POS_PIN_FIRST" == "$POS_PIN_SECOND" ]] && break
    echo 'Los PIN no coinciden.'
  done
  export POS_ADMIN_PIN="$POS_PIN_FIRST"
  unset POS_PIN_FIRST POS_PIN_SECOND
fi
POS_PHONE_CHILD=''
cleanup() {
  if [[ -n "$POS_PHONE_CHILD" ]] && kill -0 "$POS_PHONE_CHILD" 2>/dev/null; then
    kill -TERM "$POS_PHONE_CHILD" 2>/dev/null || true
    wait "$POS_PHONE_CHILD" 2>/dev/null || true
  fi
  if command -v termux-wake-unlock >/dev/null; then termux-wake-unlock || true; fi
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
if command -v termux-wake-lock >/dev/null; then termux-wake-lock || true; fi
echo "Datos del teléfono: $POS_DATA_DIR"
echo "En POS Control configura: http://127.0.0.1:$PORT"
if [[ "$POS_HOST" == '0.0.0.0' ]]; then echo 'Red local habilitada: otros equipos deben usar la IP Wi-Fi del teléfono y este puerto.'; fi
echo 'Mantén Termux activo. Para detener el servidor usa Ctrl+C. No borres los datos de Termux.'
node server/server.js &
POS_PHONE_CHILD=$!
unset POS_ADMIN_PIN
wait "$POS_PHONE_CHILD"
