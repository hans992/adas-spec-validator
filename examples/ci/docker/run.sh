#!/usr/bin/env sh
set -eu

docker build -f examples/ci/docker/Dockerfile -t aec-validator .
docker run --rm \
  -e AEC_API_URL \
  -e AEC_API_TOKEN \
  -e AEC_PROJECT_ID \
  -v "$PWD:/workspace" \
  aec-validator validate \
  --model /workspace/building.ifc \
  --spec /workspace/project-requirements.xlsx \
  --baseline main \
  --fail-on critical \
  --sarif /workspace/aec-report.sarif \
  --json /workspace/aec-report.json
