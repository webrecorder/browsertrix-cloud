#!/usr/bin/env bash
CURR=$(dirname "${BASH_SOURCE[0]}")

docker build -t ${REGISTRY}webrecorder/browsertrix-proxy:latest $CURR/../proxy/

if [ -n "$REGISTRY" ]; then
    docker push ${REGISTRY}webrecorder/browsertrix-proxy
fi
