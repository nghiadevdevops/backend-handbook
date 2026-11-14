#!/bin/sh
# Runs inside the golang container: resolves modules and runs the demo.
set -e
cd /app
cp -r /app /tmp/build
cd /tmp/build
go mod tidy
go vet ./...
go run .
