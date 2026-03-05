#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(pwd)"
SOURCE_DIR="data/backups"
TARGET=""
SSH_PORT=""
SSH_KEY=""
EXTRA_RSYNC_ARGS=""

usage() {
  cat <<'EOF'
Usage:
  ./scripts/sync-db-backups.sh --target <user@host:/remote/path> [options]

Options:
  --app-dir <path>       App root directory (default: current directory)
  --source-dir <path>    Local backup directory (default: data/backups under app-dir)
  --target <dest>        Destination for rsync (required), e.g. user@host:/srv/ishido/backups
  --ssh-port <port>      SSH port for rsync over SSH
  --ssh-key <path>       SSH private key path for rsync
  --extra-rsync-args <s> Extra raw rsync args (optional)
  -h, --help             Show help

Notes:
  - This script syncs only backup files matching: camp-backup-*.db
  - It does NOT touch data/camp.db, data/camp.db-wal, data/camp.db-shm
EOF
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-dir)
      APP_DIR="$2"
      shift 2
      ;;
    --source-dir)
      SOURCE_DIR="$2"
      shift 2
      ;;
    --target)
      TARGET="$2"
      shift 2
      ;;
    --ssh-port)
      SSH_PORT="$2"
      shift 2
      ;;
    --ssh-key)
      SSH_KEY="$2"
      shift 2
      ;;
    --extra-rsync-args)
      EXTRA_RSYNC_ARGS="$2"
      shift 2
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

if [[ -z "${TARGET}" ]]; then
  echo "Error: --target is required." >&2
  usage
  exit 1
fi

if ! command -v rsync >/dev/null 2>&1; then
  echo "Error: rsync is not installed." >&2
  exit 1
fi

APP_DIR="$(cd "${APP_DIR}" && pwd)"
if [[ "${SOURCE_DIR}" != /* ]]; then
  SOURCE_DIR="${APP_DIR}/${SOURCE_DIR}"
fi

if [[ ! -d "${SOURCE_DIR}" ]]; then
  echo "Error: source directory does not exist: ${SOURCE_DIR}" >&2
  exit 1
fi

SSH_CMD="ssh"
if [[ -n "${SSH_PORT}" ]]; then
  SSH_CMD="${SSH_CMD} -p ${SSH_PORT}"
fi
if [[ -n "${SSH_KEY}" ]]; then
  SSH_CMD="${SSH_CMD} -i ${SSH_KEY}"
fi

echo "Sync source: ${SOURCE_DIR}"
echo "Sync target: ${TARGET}"

set -x
rsync -avz \
  --prune-empty-dirs \
  --include='camp-backup-*.db' \
  --exclude='*' \
  -e "${SSH_CMD}" \
  ${EXTRA_RSYNC_ARGS} \
  "${SOURCE_DIR}/" \
  "${TARGET}"
set +x

echo "Backup sync completed."
