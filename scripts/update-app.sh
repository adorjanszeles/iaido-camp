#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(pwd)"
BRANCH="main"
APP_NAME="ishido-camp"
SKIP_PULL="false"

usage() {
  cat <<'EOF'
Usage:
  ./scripts/update-app.sh [options]

Options:
  --app-dir <path>     Application directory (default: current directory)
  --branch <name>      Git branch to deploy (default: main)
  --app-name <name>    PM2 process name (default: ishido-camp)
  --skip-pull          Skip git fetch/pull, only reinstall deps + restart PM2
  -h, --help           Show this help
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-dir)
      APP_DIR="$2"
      shift 2
      ;;
    --branch)
      BRANCH="$2"
      shift 2
      ;;
    --app-name)
      APP_NAME="$2"
      shift 2
      ;;
    --skip-pull)
      SKIP_PULL="true"
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

APP_DIR="$(cd "${APP_DIR}" && pwd)"
cd "${APP_DIR}"

if [[ ! -f "package.json" || ! -f "server.js" || ! -d ".git" ]]; then
  echo "Error: ${APP_DIR} is not a valid app git repository." >&2
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "Error: npm is not installed." >&2
  exit 1
fi

if ! command -v pm2 >/dev/null 2>&1; then
  echo "Error: pm2 is not installed. Use ./scripts/setup-pm2.sh first." >&2
  exit 1
fi

if [[ "${SKIP_PULL}" != "true" ]]; then
  # Avoid overwriting local tracked changes during deployment.
  if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Error: tracked local changes detected. Commit/stash before running update." >&2
    exit 1
  fi

  echo "Fetching latest code from origin/${BRANCH}..."
  git fetch origin "${BRANCH}"
  git pull --ff-only origin "${BRANCH}"
fi

echo "Installing production dependencies..."
npm ci --omit=dev

if ! pm2 describe "${APP_NAME}" >/dev/null 2>&1; then
  echo "Error: PM2 app '${APP_NAME}' is not running. Use ./scripts/setup-pm2.sh first." >&2
  exit 1
fi

echo "Restarting PM2 app: ${APP_NAME}"
pm2 restart "${APP_NAME}"
pm2 save

echo
echo "Update done."
echo "DB files were not modified by this script."
echo "Check status: pm2 status"
echo "Check logs:   pm2 logs ${APP_NAME}"
