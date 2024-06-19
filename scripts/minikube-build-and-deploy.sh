#!/usr/bin/env bash
CURR=$(dirname "${BASH_SOURCE[0]}")

eval $(minikube docker-env)
for img in proxy backend frontend;
do
    sh "${CURR}/build-${img}.sh"
done

echo "Deploying helm chart..."
helm upgrade --wait --install -f ./chart/values.yaml -f ./chart/test/test.yaml btrix ./chart/

until kubectl port-forward service/browsertrix-cloud-frontend 8000:80; do
    echo "Unable to forward service/browsertrix-cloud-frontend.  Retrying.." >&2
    sleep 1
done
