#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

sudo apt update
sudo apt install -y python3-picamera2 python3-opencv python3-numpy python3-venv

cd "$SCRIPT_DIR"
python3 -m venv --system-site-packages .venv
.venv/bin/python -m pip install --upgrade pip
.venv/bin/python -m pip install -r requirements.txt

if [[ ! -f .env ]]; then
  cp .env.example .env
  echo "Created .env. Edit it and set POTHOLE_API_WRITE_KEY before running the agent."
else
  echo "Existing .env kept unchanged."
fi

echo "Pi setup is complete. Run: ./run_agent.sh"