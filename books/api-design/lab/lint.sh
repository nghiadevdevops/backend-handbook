#!/usr/bin/env bash
# Lint spec OpenAPI bằng Redocly CLI (image chính thức) và Spectral, trong Docker.
# Dùng: bash lint.sh
set -u
cd "$(dirname "$0")/openapi"
D="$(pwd)"
case "$(uname -s)" in MINGW*|MSYS*) D="$(cygpath -m "$D")"; export MSYS_NO_PATHCONV=1;; esac

echo "### Redocly CLI"
timeout 300 docker run --rm --name bookcheck-apits-redocly --memory 512m -v "$D:/spec:ro" -w /spec \
  redocly/cli:latest lint orders.yaml --extends recommended --format stylish
echo "exit=$?"

echo "### Spectral"
timeout 300 docker run --rm --name bookcheck-apits-spectral --memory 512m -v "$D:/spec:ro" -w /spec \
  stoplight/spectral:latest lint orders.yaml --ruleset .spectral.yaml
echo "exit=$?"
