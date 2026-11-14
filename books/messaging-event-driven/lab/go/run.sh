#!/bin/sh
# Chạy trong container golang (network bookcheck-msg-net): sh /app/run.sh
set -e
cd /app
export GOFLAGS=-buildvcs=false GOCACHE=/tmp/gocache GOPATH=/tmp/gopath
[ -f go.mod ] || go mod init lab/inbox
go mod tidy
go vet ./...
go run .
