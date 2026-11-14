#!/usr/bin/env bash
# Graceful shutdown lab: send SIGTERM while a 6 s request is in flight.
# usage: bash shutdown-test.sh <image> [extra docker run args...]
set -u
export MSYS_NO_PATHCONV=1
IMG=$1; shift
N=bookcheck-deploygo-sd
NET=bookcheck-deploygo-net
docker network create $NET >/dev/null 2>&1
docker run -d --name $N --network $NET "$@" "$IMG" >/dev/null
sleep 3
# Client: reuse the node image as an HTTP client (no curl needed)
client() {
  docker run --rm --network $NET --entrypoint node bookcheck-deploygo-node:1.0 -e "
const t0=Date.now();
fetch('http://$N:8080/slow?ms=6000').then(async r=>console.log('client: status',r.status,'body',JSON.stringify(await r.text()),'after',Date.now()-t0,'ms')).catch(e=>console.log('client: FAILED',e.cause?.code??e.message,'after',Date.now()-t0,'ms'))"
}
client &
CP=$!
sleep 4   # client container needs ~2 s to start, request then runs 6 s
S=$(date +%s%3N)
docker stop -t 15 $N >/dev/null
echo "docker stop took $(( $(date +%s%3N) - S )) ms; exit code $(docker inspect -f '{{.State.ExitCode}}' $N)"
wait $CP
echo "--- container logs"
docker logs $N 2>&1 | tail -6
docker rm -f $N >/dev/null
