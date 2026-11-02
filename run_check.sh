#!/bin/bash
POD=$(kubectl get pod -n kubehost-system -l app=kubehost-backend -o jsonpath='{.items[0].metadata.name}')
kubectl cp /tmp/check_db.py $POD:/tmp/check_db.py -n kubehost-system
kubectl exec -n kubehost-system $POD -- python3 /tmp/check_db.py
