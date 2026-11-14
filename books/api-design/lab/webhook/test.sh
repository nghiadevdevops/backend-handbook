#!/bin/sh
# Run inside node:26-alpine with this folder mounted read-only at /src. No dependencies needed.
cd /src && node --test
