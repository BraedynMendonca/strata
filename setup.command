#!/bin/zsh
set -e
cd "$(dirname "$0")"
if [[ -x /opt/homebrew/bin/python3.11 ]]; then
  /opt/homebrew/bin/python3.11 -m venv .venv311
  task_python=.venv311/bin/python
else
  python3 -m venv .venv
  task_python=.venv/bin/python
fi
"$task_python" -m pip install -r requirements.txt
"$task_python" research/satellite_heat.py
echo 'Strata study ready. Double-click start.command.'
