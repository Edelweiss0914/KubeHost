#!/bin/bash
POD=$(kubectl get pod -n kubehost-system -l app=kubehost-backend -o jsonpath='{.items[0].metadata.name}')
kubectl cp /tmp/debug_auth.py $POD:/tmp/debug_auth.py -n kubehost-system
kubectl exec -n kubehost-system $POD -- python3 /tmp/debug_auth.py
