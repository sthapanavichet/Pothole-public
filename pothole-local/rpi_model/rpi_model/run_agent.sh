#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [[ -z "${POTHOLE_API_WRITE_KEY:-}" || "${POTHOLE_API_WRITE_KEY}" == "replace-with-your-api-write-key" ]]; then
  echo "Set POTHOLE_API_WRITE_KEY in $SCRIPT_DIR/.env before running the agent." >&2
  exit 1
fi

model_args=(--candidate-model "$SCRIPT_DIR/models/YOLOv8_Small_2nd_Model.pt")
for argument in "$@"; do
  if [[ "$argument" == "--demo-capture-interval" || "$argument" == --demo-capture-interval=* ]]; then
    model_args=()
    break
  fi
done

exec "$SCRIPT_DIR/.venv/bin/python" "$SCRIPT_DIR/dock_agent.py" \
  "${model_args[@]}" \
  "$@"