#!/bin/sh
# Chạy trong container golang: sh /app/run-place.sh <customer_id> <total_cents>
set -e
cd /app
export GOFLAGS=-buildvcs=false GOCACHE=/tmp/gocache GOPATH=/tmp/gopath
go mod tidy
go vet ./...
go run . place "$1" "$2"
