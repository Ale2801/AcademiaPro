#!/usr/bin/env bash
set -euo pipefail

# Resolve repository root (directory of this script -> parent)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
BACKEND_DIR="${REPO_ROOT}/backend"
VENV_DIR="${BACKEND_DIR}/.venv"

cd "${BACKEND_DIR}"

if [ ! -d "${VENV_DIR}" ]; then
  echo "[run-backend-dev] Creating virtual environment..."
  python3 -m venv "${VENV_DIR}"
fi

# shellcheck disable=SC1090
source "${VENV_DIR}/bin/activate"

pip install --upgrade pip >/dev/null
pip install -r requirements.txt >/dev/null

export UVICORN_RELOAD_DIRS="${BACKEND_DIR}/src"

exec uvicorn src.main:app --reload --host 0.0.0.0 --port 8000
