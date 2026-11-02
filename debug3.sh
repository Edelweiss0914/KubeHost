#!/bin/bash
POD=$(kubectl get pod -n kubehost-system -l app=kubehost-backend -o jsonpath='{.items[0].metadata.name}')
kubectl exec -n kubehost-system $POD -- cat /app/app/services/auth.py
