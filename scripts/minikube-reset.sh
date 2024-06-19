#!/usr/bin/env bash
if [ "$(minikube status | grep -o Running | wc -l)" -lt 3 ]; then
    echo "Error: Less than 3 components are running in Minikube"
    exit 1
fi

if kubectl config get-contexts | grep -q minikube; then
    kubectl config set-context minikube
    # ~~~ DANGER ZONE ~~~
    echo "Uninstalling helm deployment and deleting pvcs"
    helm uninstall btrix
    minikube kubectl delete pvc minio-storage-pvc
    minikube kubectl delete pvc data-db-local-mongo-0
fi
