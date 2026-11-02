#!/bin/bash
POD=$(kubectl get pod -n kubehost-system -l app=kubehost-backend -o jsonpath='{.items[0].metadata.name}')
echo "Pod: $POD"
kubectl cp /tmp/migrate.py $POD:/tmp/migrate.py -n kubehost-system
kubectl exec -n kubehost-system $POD -- python3 /tmp/migrate.py
