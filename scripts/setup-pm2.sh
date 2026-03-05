#!/usr/bin/env bash
set -euo pipefail
umask 077

APP_DIR="$(pwd)"
ENV_FILE=".env.production"
APP_NAME="ishido-camp"
INSTALL_PM2="false"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/setup-pm2.sh [options]

Options:
  --app-dir <path>       Application directory (default: current directory)
  --env-file <path>      Env file path (default: .env.production inside app-dir)
  --app-name <name>      PM2 process name (default: ishido-camp)
  --install-pm2          Install PM2 globally if not present
  -h, --help             Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-dir)
      APP_DIR="$2"
      shift 2
      ;;
    --env-file)
      ENV_FILE="$2"
      shift 2
      ;;
    --app-name)
      APP_NAME="$2"
      shift 2
      ;;
    --install-pm2)
      INSTALL_PM2="true"
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage
      exit 1
      ;;
  esac
done

APP_DIR="$(cd "$APP_DIR" && pwd)"
if [[ "$ENV_FILE" != /* ]]; then
  ENV_FILE="${APP_DIR}/${ENV_FILE}"
fi

if [[ ! -f "${APP_DIR}/package.json" || ! -f "${APP_DIR}/server.js" ]]; then
  echo "Error: ${APP_DIR} does not look like the app root (missing package.json/server.js)." >&2
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "Error: node is not installed." >&2
  exit 1
fi

NODE_MAJOR="$(node -p 'Number(process.versions.node.split(".")[0])')"
if [[ "${NODE_MAJOR}" -lt 22 ]]; then
  echo "Error: Node 22+ is required. Current: $(node -v)" >&2
  exit 1
fi

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "Error: env file not found: ${ENV_FILE}" >&2
  echo "Tip: run ./scripts/create-production-env.sh first." >&2
  exit 1
fi

if grep -q 'CHANGE_ME' "${ENV_FILE}"; then
  echo "Error: ${ENV_FILE} still contains CHANGE_ME placeholders. Fill them first." >&2
  exit 1
fi

if ! command -v pm2 >/dev/null 2>&1; then
  if [[ "${INSTALL_PM2}" == "true" ]]; then
    echo "PM2 not found. Installing globally..."
    npm i -g pm2
  else
    echo "Error: pm2 is not installed. Install it or rerun with --install-pm2." >&2
    exit 1
  fi
fi

mkdir -p "${APP_DIR}/logs"
chmod 750 "${APP_DIR}/logs" || true

START_CMD="set -a; source \"${ENV_FILE}\"; set +a; exec npm run start"

if pm2 describe "${APP_NAME}" >/dev/null 2>&1; then
  echo "Replacing existing PM2 process: ${APP_NAME}"
  pm2 delete "${APP_NAME}" >/dev/null 2>&1 || true
fi

echo "Starting app with PM2..."
pm2 start bash \
  --name "${APP_NAME}" \
  --cwd "${APP_DIR}" \
  --time \
  --merge-logs \
  --output "${APP_DIR}/logs/${APP_NAME}.out.log" \
  --error "${APP_DIR}/logs/${APP_NAME}.err.log" \
  --max-memory-restart "500M" \
  --restart-delay 5000 \
  --exp-backoff-restart-delay 200 \
  --kill-timeout 10000 \
  --interpreter bash \
  -- -lc "${START_CMD}"

echo "Configuring PM2 log rotation..."
if ! pm2 module:list | grep -q 'pm2-logrotate'; then
  pm2 install pm2-logrotate || true
fi
pm2 set pm2-logrotate:max_size 10M || true
pm2 set pm2-logrotate:retain 30 || true
pm2 set pm2-logrotate:compress true || true
pm2 set pm2-logrotate:dateFormat YYYY-MM-DD_HH-mm-ss || true
pm2 set pm2-logrotate:workerInterval 30 || true
pm2 set pm2-logrotate:rotateInterval '0 0 * * *' || true

echo "Saving PM2 process list..."
pm2 save

if command -v systemctl >/dev/null 2>&1; then
  echo "Configuring PM2 startup (systemd)..."
  if ! pm2 startup systemd -u "${USER}" --hp "${HOME}"; then
    cat <<'EOF'
PM2 startup could not be fully configured automatically.
Run the command PM2 printed above (usually with sudo), then run:
  pm2 save
EOF
  fi
else
  echo "systemd not detected. Skipping 'pm2 startup'."
fi

echo
echo "Done. Useful commands:"
echo "  pm2 status"
echo "  pm2 logs ${APP_NAME}"
echo "  pm2 restart ${APP_NAME}"
echo "  pm2 save"
