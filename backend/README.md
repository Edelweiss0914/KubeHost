# Backend development

Requires Python 3.10+. From this directory:

```sh
python -m venv .venv
# Activate .venv using your platform's shell.
python -m pip install -e ".[dev]"
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
python -m pytest
python -m ruff check app tests
python -m mypy app
```

OpenAPI: `/openapi.json`; interactive API: `/docs`.
`KUBEHOST_MODE` accepts only `mock`. `KUBEHOST_CORS_ORIGINS` is a comma-separated
browser origin allowlist, defaulting to localhost and 127.0.0.1 on port 5173.
Environment variables must be supplied by the shell; this application does not automatically load .env.

`models` contains validated values; `services/plans.py` is a deterministic pure
resource builder. `services/servers.py` owns authorization, quotas and state
transitions. `ports.py` owns repository and Kubernetes interfaces; `adapters/mock.py` supplies
process-local implementations. `api/routes.py` translates HTTP; `main.py` wires
these parts together. No Kubernetes client, kubeconfig, credentials or shell
execution is used. Tests replace the identity dependency to exercise ownership;
HTTP clients cannot pick another owner via a header or request body.

Every request uses the fixed demo identity `demo-user`. This is not authentication
or production tenant isolation. Ownership checks return 404 for absent and foreign
servers. Creating a server records a stopped mock instance with a proposed
replicas=1 deployment plan; starting and stopping change demo metadata only, so
the resource plan remains the original proposal.

In-memory storage keeps the first iteration deterministic and requires no database
or migration setup. A process restart clears all records. Run one process only;
multi-process state sharing, durable storage and recovery are follow-up work.
There are no seeded game servers. Nodes and logs are explicitly mock data and
connection addresses remain unassigned.

Deletion retains mock data records by default. `DELETE /api/v1/servers/{id}` with
`delete_data=true&confirmation=<exact server name>` records permanent deletion.
Retained data continues to count against storage/claim quotas, but this MVP has no
restore or retained-data purge endpoint. No real files or volumes are touched.
StatefulSet `Retain` covers StatefulSet deletion/scaling only; explicitly deleting
a PVC or its namespace can still destroy local-path data. A future adapter must
never delete a tenant namespace or shared quota when removing one server.

Namespace, ResourceQuota and LimitRange have stable tenant-level identities. A
future adapter must upsert those shared resources idempotently, with independent
server Service/StatefulSet identities. Plans are previews, not deployment-ready
manifests: image digest and Paper build validation, RBAC, NetworkPolicy, secure
identity, admission policy, real status/logs, access service allocation and audit
logging remain future work. Local volumes cannot move automatically after Worker
failure, and requested local-path capacity is not a hard disk quota.


