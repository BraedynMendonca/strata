#!/bin/zsh
cd "$(dirname "$0")" || exit 1
if [[ -x .venv311/bin/python ]]; then
  task_python=.venv311/bin/python
elif [[ -x .venv/bin/python ]]; then
  task_python=.venv/bin/python
else
  echo 'Run setup.command first to install the scientific packages.'
  read -r
  exit 1
fi
"$task_python" server.py --open
