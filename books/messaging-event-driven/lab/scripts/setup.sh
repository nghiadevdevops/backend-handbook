#!/bin/sh
. "$(dirname "$0")/common.sh"
for t in orders orders.dlq; do
  timeout 60 docker exec $KAFKA $K/kafka-topics.sh --bootstrap-server $BS --create --if-not-exists --topic $t --partitions 3
done
