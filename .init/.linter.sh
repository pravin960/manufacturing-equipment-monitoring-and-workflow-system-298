#!/bin/bash
cd /home/kavia/workspace/code-generation/manufacturing-equipment-monitoring-and-workflow-system-298/backend
npm run lint
LINT_EXIT_CODE=$?
if [ $LINT_EXIT_CODE -ne 0 ]; then
  exit 1
fi

